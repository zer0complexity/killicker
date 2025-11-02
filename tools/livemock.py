#!/usr/bin/env /usr/local/bin/python3

from DataGetter import DataGetter
from DataExporter import DataExporter

import datetime
import json
import time


def mock_live(args):
    # Read token from file
    token = get_influx_token(args.token_file)
    if token is None:
        print(f"Error: Could not read token from file: {args.token_file}")
        exit(1)

    # Get data from InfluxDB
    data_getter = DataGetter(
        influx_url=args.influx_url,
        influx_token=token,
        influx_org="navi",
        influx_bucket="killick"
    )
    update_interval = args.update_interval
    start_date = get_datetime(args.start_date)
    if start_date is None:
        print(f"Error: Invalid start date format: {args.start_date}. Expected format is 'YYYY-MM-DD-HHMM' or 'YYYY-MM-DD'.")
        exit(1)

    end_date = start_date + datetime.timedelta(hours=args.hour_count)
    data = data_getter.get_data(start_date.isoformat(), end_date.isoformat(), interval=args.retrieval_interval)
    print(f"Fetched {len(data)} data points from InfluxDB.")

    # Update JSON files one point at a time every update_interval seconds, if specified
    if update_interval > 0:
        exporter = DataExporter(data_dir=args.output_path)
        exporter.start_live_track(args.track_id)
        for i, point in enumerate(data):
            exporter.write_track(args.track_id, [point], update_tracks_index=False, extend=True)
            print(f"Exported point {i + 1}/{len(data)} for track {args.track_id}.")
            if i < len(data) - 1:
                time.sleep(update_interval)
        exporter.end_live_track()
    else:
        # Just print the data
        print(json.dumps({"points": data}, indent=4))


def export_day_track(args):
    # Read token from file
    token = get_influx_token(args.token_file)
    if token is None:
        print(f"Error: Could not read token from file: {args.token_file}")
        exit(1)

    # Get data from InfluxDB
    data_getter = DataGetter(
        influx_url=args.influx_url,
        influx_token=token,
        influx_org="navi",
        influx_bucket="killick",
        json_file_path="0xDEADBEEF",
    )
    start_date = get_datetime(args.start_date)
    if start_date is None:
        print(f"Error: Invalid date format: {args.start_date}. Expected format is 'YYYY-MM-DD-HHMM' or 'YYYY-MM-DD'.")
        exit(1)

    end_date = start_date + datetime.timedelta(hours=args.hour_count)
    print(f"Fetching data from {start_date.isoformat()} to {end_date.isoformat()}...")
    data = data_getter.get_data(start_date.isoformat(), end_date.isoformat(), interval=args.retrieval_interval)
    print(f"Fetched {len(data)} data points from InfluxDB.")

    # Export data
    exporter = DataExporter(data_dir=args.output_path)
    exporter.write_track(f"{start_date.strftime('%Y%m%d-%H%M')}", data, update_tracks_index=True, extend=False)
    print(f"Exported track for date {start_date.isoformat()}.")


def get_influx_token(token_file):
    """
    Read the InfluxDB token from the specified file.

    Args:
        token_file (str): Path to the file containing the InfluxDB token.
    """
    try:
        with open(token_file, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except FileNotFoundError:
        print(f"Error: Token file not found: {token_file}")
        return None
    except Exception as e:
        print(f"Error reading token file: {e}")
        return None


def get_datetime(date_str):
    """
    Convert a date string in 'YYYY-MM-DD' format to a datetime object.

    Args:
        date_str (str): Date string in 'YYYY-MM-DD-HHMM' or 'YYYY-MM-DD' format.

    Returns:
        datetime.datetime: Corresponding datetime object, or None if parsing fails.
    """
    try:
        return datetime.datetime.strptime(date_str, '%Y-%m-%d-%H%M').replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        return datetime.datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc)


if __name__ == "__main__":
    import os
    import argparse

    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Fetch data from InfluxDB and update JSON files.')
    parser.add_argument(
        '--start-date',
        type=str,
        default='2025-07-13',
        help='Start date in YYYY-MM-DD format (default: 2025-07-13)'
    )
    parser.add_argument(
        '--hour-count',
        type=int,
        default=24,
        help='Number of hours to fetch data for (default: 24)'
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
        '--retrieval-interval',
        type=str,
        metavar='InfluxDB DURATION',
        default='10s',
        help='Retrieve records from InfluxDB at this interval (default: "10s")'
    )
    parser.add_argument(
        '--remove-track',
        type=str,
        help='If set, remove the specified track ID from the JSON files and exit. Ignores other options.'
    )
    parser.add_argument(
        '--export', '-e',
        action='store_true',
        help='If set, export a single track to JSON files instead of mocking live tracking.'
    )

    args = parser.parse_args()
    if args.remove_track:
        exporter = DataExporter(data_dir=args.output_path)
        exporter.remove_track(args.remove_track)
    elif args.export:
        export_day_track(args)
    else:
        mock_live(args)
