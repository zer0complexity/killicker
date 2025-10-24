#!/usr/bin/env /usr/local/bin/python3

import json
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
                current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                commit_message = f"Update data - {current_time}"

            # Stage the JSON file
            repo.index.add([self.json_file_path])

            # Commit changes
            repo.index.commit(commit_message)

            # Push to origin
            origin = repo.remote('origin')
            origin.push()

        except Exception as e:
            raise Exception(f"Error in Git operations: {str(e)}")


if __name__ == "__main__":
    import os
    import time

    token_path = os.path.join(os.path.dirname(__file__), ".influx-token")
    with open(token_path, "r", encoding="utf-8") as f:
        token = f.read()

    os.chdir(os.path.join("..", "killicker-data"))

    getter = DataGetter(
        influx_url="http://localhost:8086",
        influx_token=token,
        influx_org="navi",
        influx_bucket = "killick",
        json_file_path="20250824-0500.json",
        repo_path = "."
    )

    points = getter.get_data(
        start_time = "2025-08-24T05:00:00.000Z",
        # stop_time = "2025-08-21T10:00:00.000Z"
        stop_time = "2025-08-24T23:00:00.000Z"
    )

    pointCount = len(points)
    print(f"Retrieved {pointCount} data points")
    for point in points:
        getter.update_json_file([point])
        # getter.commit_and_push(commit_message="Added data point")
        # print(f"Pushed data point at {point['timestamp']}")
        # time.sleep(120)
