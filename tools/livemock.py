#!/usr/bin/env /usr/local/bin/python3

from DataGetter import DataGetter
from DataExporter import DataExporter

import datetime
import json
import time


def main(args):
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

    # Get data from InfluxDB
    data_getter = DataGetter(
        influx_url=args.influx_url,
        influx_token=token,
        influx_org="navi",
        influx_bucket="killick",
        json_file_path="0xDEADBEEF",  # Not used in this script
    )
    update_interval = args.update_interval
    start_date = datetime.datetime.strptime(args.start_date, '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc)
    end_date = start_date + datetime.timedelta(days=args.day_count)
    data = data_getter.get_data(start_date.isoformat(), end_date.isoformat())
    print(f"Fetched {len(data)} data points from InfluxDB.")

    # Update JSON files one point at a time every update_interval seconds, if specified
    if update_interval > 0:
        exporter = DataExporter(data_dir=args.output_path)
        exporter.start_live_track(args.track_id)
        for i, point in enumerate(data):
            exporter.extend_track(args.track_id, [point], update_tracks_index=False)
            print(f"Exported point {i + 1}/{len(data)} for track {args.track_id}.")
            if i < len(data) - 1:
                time.sleep(update_interval)
        exporter.end_live_track()
    else:
        # Just print the data
        print(json.dumps(data, indent=4))


if __name__ == "__main__":
    import os
    import argparse

    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Fetch data from InfluxDB and update JSON files.')
    parser.add_argument(
        '--start-date',
        type=str,
        default='2025-07-11',
        help='Start date in YYYY-MM-DD format'
    )
    parser.add_argument(
        '--day-count',
        type=int,
        default=1,
        help='Number of days to fetch data for'
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
        '--output-path',
        type=str,
        default='killicker-data',
        help='Directory to store output files (default: killicker-data)'
    )
    parser.add_argument(
        '--track-id',
        type=str,
        default='20250921-0600',
        help='ID to use for live tracking (default: live-track)'
    )
    parser.add_argument(
        '--update-interval',
        type=int,
        metavar='SECONDS',
        default=10,
        help='If set, update one point at a time, waiting SECONDS between updates'
    )
    parser.add_argument(
        '--remove-track',
        type=str,
        help='If set, remove the specified track ID from the JSON files and exit. Ignores other options.'
    )

    args = parser.parse_args()
    if args.remove_track:
        exporter = DataExporter(data_dir=args.output_path)
        exporter.remove_track(args.remove_track)
    else:
        main(args)
