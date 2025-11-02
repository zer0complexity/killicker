from math import radians, sin, cos, sqrt, atan2
from influxdb_client import InfluxDBClient



class DataGetter:
    def __init__(self, influx_url, influx_token, influx_org, influx_bucket):
        self.influx_url = influx_url
        self.influx_token = influx_token
        self.influx_org = influx_org
        self.bucket = influx_bucket


    def get_data(self, start_time, stop_time, interval='10m'):
        client = InfluxDBClient(url=self.influx_url, token=self.influx_token, org=self.influx_org, timeout=60000)
        query = f'''
            from(bucket: "killick")
                |> range(start: {start_time}, stop: {stop_time})
                |> filter(fn: (r) =>
                    (r["source"] == "PICAN-M.105" or r["source"] == "USB_GPS_Puck.GN") and
                    r["_measurement"] == "environment.depth.belowTransducer" or
                    r["_measurement"] == "environment.wind.angleApparent" or
                    r["_measurement"] == "environment.wind.speedApparent" or
                    r["_measurement"] == "navigation.speedOverGround" or
                    r["_measurement"] == "navigation.courseOverGroundTrue" or
                    r["_measurement"] == "navigation.position"
                )
                |> drop(columns: ["source", "context", "self", "s2_cell_id"])
                |> aggregateWindow(every: {interval}, fn: last, createEmpty: false)
                |> pivot(rowKey:["_time", "_start", "_stop"], columnKey: ["_measurement", "_field"], valueColumn: "_value")
        '''
        query_api = client.query_api()
        measurements = [
            "navigation.speedOverGround_value",
            "navigation.courseOverGroundTrue_value",
            "environment.wind.angleApparent_value",
            "environment.wind.speedApparent_value",
            "environment.depth.belowTransducer_value",
        ]
        measurement_names = {
            "navigation.speedOverGround_value": "SOG",
            "navigation.courseOverGroundTrue_value": "COG",
            "environment.wind.angleApparent_value": "AWA",
            "environment.wind.speedApparent_value": "AWS",
            "environment.depth.belowTransducer_value": "Depth",
        }
        sorted_names = ["SOG", "COG", "AWA", "AWS", "Depth", "position", "Distance"]
        try:
            result = {}
            tables = query_api.query(query)

            if len(tables) > 1:
                raise Exception(f"Unexpected multiple tables in InfluxDB query result (query returned {len(tables)} tables)")

            for table in tables:
                prev_values = None
                for record in table.records:
                    if record.values["navigation.position_lat"] is None or record.values["navigation.position_lon"] is None:
                        continue  # Skip this record if no position

                    rts = record.get_time()
                    record_ts = record.get_time().isoformat()
                    values = {}

                    values["position"] = {
                        "lat": record.values["navigation.position_lat"],
                        "lng": record.values["navigation.position_lon"]
                    }

                    for m in measurements:
                        measurement_value = record.values.get(m)
                        if measurement_value is not None:
                            values[measurement_names[m]] = measurement_value

                    # If record_ts is multiple of 10 minutes, store it in full. Otherwise, only store if it has COG
                    # and it is within 15 degrees of previous COG
                    add_values = rts.minute % 10 == 0 and rts.second == 0
                    if not add_values and prev_values is not None and "COG" in values and "COG" in prev_values:
                        cog_diff = abs(values["COG"] - prev_values["COG"])
                        if cog_diff > 0.2618:  # 15 degrees in radians
                            add_values = True
                            values = {
                                "position": values["position"],
                                "COG": values["COG"]
                            }
                    if add_values:
                        values["Distance"] = (
                            self._compute_distance(prev_values["position"], values["position"]) + prev_values["Distance"]
                        ) if prev_values is not None else 0.0
                        result[record_ts] = values
                        prev_values = result[record_ts]

            # Convert result to a list of dicts sorted by timestamp
            flattened_result = {}
            for ts, data in result.items():
                flattened_result[ts] = {key: data[key] for key in sorted_names if key in data}
            result = [{"timestamp": ts, **data} for ts, data in flattened_result.items()]

        except KeyError as e:
            print(f"Error processing InfluxDB data: missing key {e}")
        except Exception as e:
            print(f"Error querying InfluxDB: {e} {type(e).__name__}")
        finally:
            client.close()
            return result


    def _compute_distance(self, pos1, pos2):
        EARTH_RADIUS_M = 6371000.0  # Earth radius in meters

        lat1 = radians(pos1["lat"])
        lon1 = radians(pos1["lng"])
        lat2 = radians(pos2["lat"])
        lon2 = radians(pos2["lng"])

        dlon = lon2 - lon1
        dlat = lat2 - lat1

        a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))

        distance = EARTH_RADIUS_M * c  # in meters
        return distance
