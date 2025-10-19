#!/usr/bin/env /usr/local/bin/python3

import json
import os
from datetime import datetime
from influxdb_client import InfluxDBClient
from git import Repo


def read_file_as_string(path: str) -> str:
    """Return the contents of a file as a string.

    Args:
        path: Path to the file to read.

    Returns:
        The entire file contents as a str.

    Raises:
        FileNotFoundError: If the file does not exist.
        OSError: For other I/O related errors.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"File not found: {path}")

    # Read the file using UTF-8 encoding by default
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


class DataProcessor:
    def __init__(self, influx_url, influx_token, influx_org, json_file_path, repo_path):
        """
        Initialize the DataProcessor with InfluxDB and repository settings.

        Args:
            influx_url (str): URL of the InfluxDB server
            influx_token (str): Authentication token for InfluxDB
            influx_org (str): InfluxDB organization name
            json_file_path (str): Path to the JSON file where data will be stored
            repo_path (str): Path to the Git repository
        """
        self.influx_url = influx_url
        self.influx_token = influx_token
        self.influx_org = influx_org
        self.json_file_path = json_file_path
        self.repo_path = repo_path

    def read_influx_data(self, bucket, measurements, time_range="-1h", time_range_stop=None):
        """
        Read data from InfluxDB.

        Args:
            bucket (str): InfluxDB bucket name
            measurements (list[str]): Measurement names to query
            time_range (str): Time range for the query (default: last hour)

        Returns:
            list: List of data points from InfluxDB, with one table per measurement
        """
        client = InfluxDBClient(
            url=self.influx_url,
            token=self.influx_token,
            org=self.influx_org
        )

        query = f'''
            from(bucket: "{bucket}")
                |> range(start: {time_range}{", stop: " + time_range_stop if time_range_stop else ""})
                |> filter(fn: (r) =>
        '''
        for measurement in measurements[:-1]:
            query += f'r["_measurement"] == "{measurement}" or '
        query += f'r["_measurement"] == "{measurements[-1]}")\n'

        result = []
        query_api = client.query_api()
        tables = query_api.query(query)

        for table in tables:
            result.append({
                "measurement": table.records[0].get_measurement(),
                "records": []
            })
            values = result[-1]["records"]
            for record in table.records:
                values.append({
                    "time": record.get_time().isoformat(),
                    "field": record.get_field(),
                    "value": record.get_value(),
                    "tags": record.values.get("tags", {})
                })

        client.close()
        return result

    def read_influx_data_pivot(self, bucket, measurements, time_range="-1h", time_range_stop=None):
        """
        Read data from InfluxDB.

        Args:
            bucket (str): InfluxDB bucket name
            measurements (list[str]): Measurement names to query
            time_range (str): Time range for the query (default: last hour)

        Returns:
            list: List of data points from InfluxDB, with a single table indexed by time
        """
        client = InfluxDBClient(
            url=self.influx_url,
            token=self.influx_token,
            org=self.influx_org
        )

        table_queries = []
        for measurement in measurements:
            table_queries.append(f'''
                {measurement.replace('.', '')} = from(bucket: "{bucket}")
                    |> range(start: {time_range}{", stop: " + time_range_stop if time_range_stop else ""})
                    |> filter(fn: (r) => r["_measurement"] == "{measurement}")
            ''')

        query = f'''
            {"".join(table_queries)}
            union(tables: [{", ".join(m.replace('.', '') for m in measurements)}])
                |> pivot(rowKey:["_time"], columnKey: ["_measurement"], valueColumn: "_value")
        '''

        print(query)

        result = []
        query_api = client.query_api()
        tables = query_api.query(query)

        for table in tables:
            for record in table.records:
                result.append({
                    "time": record.get_time().isoformat(),
                })
                for m in measurements:
                    measurement_value = record.values.get(m)
                    if measurement_value is not None:
                        result[-1][m] = record.values.get(m)

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
                existing_data = []

            existing_data.extend(new_data)

            with open(self.json_file_path, 'w') as f:
                json.dump(existing_data, f, indent=4)

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

    def process_data(self, bucket, measurements, time_range="-1h", time_range_stop=None):
        """
        Complete workflow: read data, update JSON, and push to GitHub.

        Args:
            bucket (str): InfluxDB bucket name
            measurement (str): Measurement name to query
            time_range (str): Time range for the query
        """
        try:
            # Read data from InfluxDB
            data = self.read_influx_data_pivot(bucket, measurements, time_range, time_range_stop)

            # Show JSON data
            import sys
            json.dump(data, sys.stdout, indent=4)
            print(f"\nRetrieved {len(data)} records from InfluxDB.")

            # Update JSON file
            # self.update_json_file(data)

            # Commit and push changes
            # self.commit_and_push()

            return True
        except Exception as e:
            print(f"Error processing data: {str(e)}")
            return False


# Example usage:
if __name__ == "__main__":

    token_path = os.path.join(os.path.dirname(__file__), ".influx-token")
    with open(token_path, "r", encoding="utf-8") as f:
        token = f.read()

    processor = DataProcessor(
        influx_url="http://localhost:8086",
        influx_token=token,
        influx_org="navi",
        json_file_path="/path/to/your/data.json",
        repo_path="/path/to/your/repo"
    )

    success = processor.process_data(
        bucket="killick",
        measurements=[
            # "navigation.position",
            "environment.wind.angleApparent",
            "environment.wind.speedApparent",
        ],
        time_range="2025-08-21T09:25:00.000Z",
        # time_range_stop="2025-08-21T22:40:00.000Z"
        time_range_stop="2025-08-21T09:25:10.000Z"
    )
