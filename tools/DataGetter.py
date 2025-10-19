#!/usr/bin/env /usr/local/bin/python3

from influxdb_client import InfluxDBClient


class DataGetter:
    def __init__(self, influx_url, influx_token, influx_org, influx_bucket):
        self.influx_url = influx_url
        self.influx_token = influx_token
        self.influx_org = influx_org
        self.bucket = influx_bucket

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
            "environment.depth.belowTransducer_value",
            "environment.wind.angleApparent_value",
            "environment.wind.speedApparent_value",
            "navigation.position_lat",
            # "navigation.position_lon", # Handled together with lat
            "navigation.speedOverGround_value",
            "navigation.courseOverGroundTrue_value"
        ]
        measurement_names = {
            "environment.depth.belowTransducer_value": "Depth",
            "environment.wind.angleApparent_value": "AWA",
            "environment.wind.speedApparent_value": "AWS",
            "navigation.speedOverGround_value": "SOG",
            "navigation.courseOverGroundTrue_value": "COG T"
        }
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
            result = [{"timestamp": ts, **data} for ts, data in sorted(result.items())]

        except Exception as e:
            print(f"Error querying InfluxDB: {e}")
        finally:
            client.close()
            return result


if __name__ == "__main__":
    import json
    import os
    import time

    token_path = os.path.join(os.path.dirname(__file__), ".influx-token")
    with open(token_path, "r", encoding="utf-8") as f:
        token = f.read()

    getter = DataGetter(
        influx_url="http://localhost:8086",
        influx_token=token,
        influx_org="navi",
        influx_bucket = "killick"
    )

    points = getter.get_data(
        start_time = "2025-08-21T09:00:00.000Z",
        stop_time = "2025-08-21T10:00:00.000Z"
        # stop_time = "2025-08-21T22:40:00.000Z"
    )
    for point in points:
        print(json.dumps(point, indent=4))
        time.sleep(1)
