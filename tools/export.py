#!/usr/bin/env /usr/local/bin/python3

from DataGetter import DataGetter
from DataExporter import DataExporter

import datetime


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
        influx_bucket="killick"
    )
    start_date = datetime.datetime.strptime(args.start_date, '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc)
    if start_date is None:
        print(f"Error: Invalid date format: {args.start_date}. Expected format is 'YYYY-MM-DD-HHMM' or 'YYYY-MM-DD'.")
        exit(1)

    end_date = start_date + datetime.timedelta(hours=24)
    print(f"Fetching data from {start_date.isoformat()} to {end_date.isoformat()}...")
    data = data_getter.get_data(start_date.isoformat(), end_date.isoformat(), interval=args.retrieval_interval)
    print(f"Fetched {len(data)} data points from InfluxDB.")
    if len(data) == 0:
        print("No data points retrieved; skipping export.")
        return

    # Export data
    exporter = DataExporter(data_dir=args.output_path)
    exporter.write_track(f"{start_date.strftime('%Y%m%d-%H%M')}", data, update_tracks_index=True, extend=False)
    print(f"Exported track for date {start_date.isoformat()}.")


def batch_export(args):
    start_date = datetime.datetime.strptime(args.start_date, '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc)
    end_date = datetime.datetime.strptime(args.end_date, '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc)

    ignore_days = [
        datetime.date(2025, 6, 24), # Delete file
        # datetime.date(2025, 6, 26), # Removed last point (at 7:50 GMT)
        datetime.date(2025, 6, 27), # Delete file
        datetime.date(2025, 6, 28), # Delete file
        # datetime.date(2025, 7,  3),  # Removed last 2 points (post 20:00 GMT)
        # datetime.date(2025, 7, 10),  # Removed first 2 points (before 17:00 GMT)
        datetime.date(2025, 7, 12),  # Delete file; at anchor in Methodist Bay all day
    ]

    current_date = start_date
    while current_date < end_date:
        if current_date not in ignore_days:
            args.start_date = current_date.strftime('%Y-%m-%d')
            export_day_track(args)
        current_date += datetime.timedelta(days=1)


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


if __name__ == "__main__":
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
        '--end-date',
        type=str,
        default='2025-07-12',
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
        '--output-path',
        type=str,
        default='killicker-data',
        help='Directory to store output files (default: killicker-data)'
    )
    parser.add_argument(
        '--retrieval-interval',
        type=str,
        metavar='InfluxDB DURATION',
        default='10s',
        help='Retrieve records from InfluxDB at this interval (default: "10s")'
    )

    args = parser.parse_args()
    batch_export(args)
