#!/usr/bin/env /usr/local/bin/python3

import datetime
import json
import os
from influxdb_client import InfluxDBClient
from git import Repo


class DataGetter:
    def __init__(self, influx_url, influx_token, influx_org, influx_bucket, json_file_path, repo_path):
        self.influx_url = influx_url
        self.influx_token = influx_token
        self.influx_org = influx_org
        self.bucket = influx_bucket
        self.json_file_path = json_file_path
        self.repo_path = repo_path

    def get_data(self, start_time, stop_time):
        client = InfluxDBClient(url=self.influx_url, token=self.influx_token, org=self.influx_org)
        query = f'''
            winddepth = from(bucket: "{self.bucket}")
                |> range(start: {start_time}, stop: {stop_time})
                |> filter(fn: (r) => r["_measurement"] == "environment.depth.belowTransducer" or r["_measurement"] == "environment.wind.angleApparent" or r["_measurement"] == "environment.wind.speedApparent")
                |> filter(fn: (r) => r["source"] == "PICAN-M.105")
                |> drop(columns:["source", "context", "self"])
                |> aggregateWindow(every: 10m, fn: last, createEmpty: false)

            sogcogpos = from(bucket: "{self.bucket}")
                |> range(start: {start_time}, stop: {stop_time})
                |> filter(fn: (r) => r["_measurement"] == "navigation.speedOverGround" or r["_measurement"] == "navigation.courseOverGroundTrue" or r["_measurement"] == "navigation.position")
                |> filter(fn: (r) => r["source"] == "USB_GPS_Puck.GN")
                |> drop(columns:["source", "context", "self", "s2_cell_id"])
                |> aggregateWindow(every: 10m, fn: last, createEmpty: false)

            union(tables: [winddepth, sogcogpos])
                |> pivot(rowKey:["_time", "_start", "_stop"], columnKey: ["_measurement", "_field"], valueColumn: "_value")
        '''
        query_api = client.query_api()
        measurements = [
            "navigation.speedOverGround_value",
            "navigation.courseOverGroundTrue_value",
            "environment.wind.angleApparent_value",
            "environment.wind.speedApparent_value",
            "environment.depth.belowTransducer_value",
            "navigation.position_lat",
            # "navigation.position_lon", # Handled together with lat
        ]
        measurement_names = {
            "navigation.speedOverGround_value": "SOG",
            "navigation.courseOverGroundTrue_value": "COG",
            "environment.wind.angleApparent_value": "AWA",
            "environment.wind.speedApparent_value": "AWS",
            "environment.depth.belowTransducer_value": "Depth",
        }
        sorted_names = ["SOG", "COG", "AWA", "AWS", "Depth", "position"]
        try:
            result = {}
            tables = query_api.query(query)

            for table in tables:
                for record in table.records:
                    try:
                        values = result[record.get_time().isoformat()]
                    except KeyError:
                        values = {}
                        result[record.get_time().isoformat()] = values

                    for m in measurements:
                        # This is inefficient because we loop over all measurements for each record,
                        # but it's simpler than other approaches and performance is not critical here.
                        measurement_value = record.values.get(m)
                        if measurement_value is not None:
                            if m == "navigation.position_lat" or m == "navigation.position_lon":
                                values["position"] = {
                                    "lat": record.values.get("navigation.position_lat"),
                                    "lng": record.values.get("navigation.position_lon")
                                }
                            else:
                                values[measurement_names[m]] = record.values.get(m)

            # Convert result to a list of dicts sorted by timestamp
            flattened_result = {}
            for ts, data in result.items():
                flattened_result[ts] = {key: data[key] for key in sorted_names if key in data}
            result = [{"timestamp": ts, **data} for ts, data in flattened_result.items()]

        except Exception as e:
            print(f"Error querying InfluxDB: {e}")
        finally:
            client.close()
            return result

    def update_json_file(self, new_data):
        """
        Update the JSON file with new data.

        Args:
            new_data (list): New data to be added to the JSON file
        """
        try:
            if os.path.exists(self.json_file_path):
                with open(self.json_file_path, 'r') as f:
                    existing_data = json.load(f)
            else:
                existing_data = { "points": [] }

            existing_data["points"].extend(new_data)

            with open(self.json_file_path, 'w') as f:
                json.dump(existing_data, f, indent=4)
                f.write('\n')  # Ensure file ends with a newline

            # After updating the file, update tracks.json index
            track_id = os.path.splitext(os.path.basename(self.json_file_path))[0]
            point_count = len(existing_data.get("points", []))
            self.update_tracks_index(track_id, point_count)

        except Exception as e:
            raise Exception(f"Error updating JSON file: {str(e)}")

    def commit_and_push(self, commit_message=None):
        """
        Commit changes to the JSON file and push to GitHub.

        Args:
            commit_message (str): Optional commit message. If None, a default message is used.
        """
        try:
            repo = Repo(self.repo_path)

            if not commit_message:
                current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                commit_message = f"Update data - {current_time}"

            # Stage the data JSON file and tracks.json (absolute paths for robustness)
            json_abs = os.path.abspath(self.json_file_path)
            tracks_index_path = os.path.join(os.path.dirname(self.json_file_path), 'tracks.json')
            tracks_abs = os.path.abspath(tracks_index_path)
            repo.index.add([json_abs, tracks_abs])

            # Commit changes
            repo.index.commit(commit_message)

            # Push to origin
            origin = repo.remote('origin')
            origin.push()

        except Exception as e:
            raise Exception(f"Error in Git operations: {str(e)}")

    def update_tracks_index(self, track_id, point_count):
        """
        Update (or create) tracks.json to include the given track id with the provided pointCount.

        - Adds a new entry if not present
        - Updates pointCount if entry exists
        - Keeps tracks sorted by id for stability
        """
        try:
            # Load existing tracks.json or initialize a new structure
            tracks_index_path = os.path.join(os.path.dirname(self.json_file_path), 'tracks.json')
            tracks_payload = { 'tracks': [] }
            if os.path.exists(tracks_index_path):
                try:
                    with open(tracks_index_path, 'r') as f:
                        tracks_payload = json.load(f) or { 'tracks': [] }
                except Exception:
                    # If file is corrupt, reinitialize to safe default
                    tracks_payload = { 'tracks': [] }

            tracks = tracks_payload.get('tracks', [])
            found = False
            for t in tracks:
                if t.get('id') == track_id:
                    t['pointCount'] = point_count
                    found = True
                    break

            if not found:
                tracks.append({ 'id': track_id, 'pointCount': point_count })

            # Keep a stable ordering by id (lexicographic works for YYYYMMDD-xxxx)
            try:
                tracks.sort(key=lambda x: x.get('id', ''))
            except Exception:
                pass

            tracks_payload['tracks'] = tracks

            with open(tracks_index_path, 'w') as f:
                json.dump(tracks_payload, f, indent=4)
                f.write('\n')

        except Exception as e:
            raise Exception(f"Error updating tracks.json: {str(e)}")



if __name__ == "__main__":
    import os
    import time
    import argparse

    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Fetch data from InfluxDB and update JSON files.')
    parser.add_argument(
        '--start-date',
        type=str,
        required=True,
        help='Start date in YYYY-MM-DD format'
    )
    parser.add_argument(
        '--end-date',
        type=str,
        required=True,
        help='End date in YYYY-MM-DD format'
    )
    parser.add_argument(
        '--influx-url',
        type=str,
        default='http://navi.local:8086',
        help='InfluxDB server URL (default: http://navi.local:8086)'
    )
    parser.add_argument(
        '--token-file',
        type=str,
        default='tools/.navi-influx-token',
        help='Path to file containing the InfluxDB token (default: tools/.navi-influx-token)'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default='killicker-data',
        help='Directory to store output files (default: killicker-data)'
    )
    parser.add_argument(
        '--single-point-interval',
        type=int,
        metavar='SECONDS',
        help='If set, update one point at a time, waiting SECONDS between updates (default: batch updates)'
    )
    parser.add_argument(
        '--commit-push',
        action='store_true',
        help='Commit and push changes to GitHub (default: do not commit/push)'
    )

    args = parser.parse_args()

    # Validate single-point interval if provided
    if args.single_point_interval is not None and args.single_point_interval < 0:
        print("Error: --single-point-interval must be a non-negative integer")
        exit(1)

    # Read token from file
    try:
        with open(args.token_file, 'r', encoding='utf-8') as f:
            token = f.read().strip()
    except FileNotFoundError:
        print(f"Error: Token file not found: {args.token_file}")
        exit(1)
    except Exception as e:
        print(f"Error reading token file: {e}")
        exit(1)

    # Parse dates
    try:
        start_date = datetime.datetime.strptime(args.start_date, '%Y-%m-%d').date()
        end_date = datetime.datetime.strptime(args.end_date, '%Y-%m-%d').date()
    except ValueError as e:
        print(f"Error parsing dates: {e}")
        print("Please use YYYY-MM-DD format")
        exit(1)

    if start_date > end_date:
        print("Error: start-date must be before or equal to end-date")
        exit(1)

    days = (end_date - start_date).days + 1

    for day in [start_date + datetime.timedelta(days=i) for i in range(days)]:
        fname = day.strftime("%Y%m%d") + "-0500.json"

        getter = DataGetter(
            influx_url=args.influx_url,
            influx_token=token,
            influx_org="navi",
            influx_bucket="killick",
            json_file_path=os.path.join(args.output_dir, fname),
            repo_path="."
        )

        points = getter.get_data(
            start_time=day.strftime("%Y-%m-%dT00:00:00.000Z"),
            stop_time=day.strftime("%Y-%m-%dT23:59:59.000Z")
        )

        pointCount = len(points)
        if pointCount > 0:
            print(f"Retrieved {pointCount} data points for {day}")

            if args.single_point_interval is not None:
                # Update one point at a time
                count = 0
                for point in points:
                    getter.update_json_file([point])
                    count += 1
                    if args.commit_push:
                        getter.commit_and_push(commit_message=f"Added data point at {point['timestamp']}")
                        print(f"{count}/{len(points)}: Pushed data point at {point['timestamp']}", end='')
                    if args.single_point_interval:
                        time.sleep(args.single_point_interval)
                print(f"\nFinished processing {pointCount} points for {day}")
            else:
                # Batch update all points
                getter.update_json_file(points)
                if args.commit_push:
                    getter.commit_and_push(commit_message=f"Updated {fname} with {pointCount} points")
                    print(f"Pushed {pointCount} points for {day}")
        else:
            print(f"No data points found for {day}")
