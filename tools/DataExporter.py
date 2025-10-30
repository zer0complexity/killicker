import json
import os
import datetime


class DataExporter:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.update_file = os.path.join(self.data_dir, "update.json")
        self.tracks_file = os.path.join(self.data_dir, "tracks.json")


    def extend_track(self, track_id, points_data, update_tracks_index=True):
        file_path = os.path.join(self.data_dir, f"{track_id}.json")
        existing_data = {}
        try:
            # Load existing data
            existing_data = self._open_json_file(file_path, mode='r')
            existing_points = existing_data.get("points", [])

            # Extend with new points and save combined data
            existing_data["points"] = existing_points + points_data
            point_count = len(existing_data["points"])
            self._write_json_file(file_path, existing_data)
            print(f"Data successfully extended and saved to {file_path}.")

            # Update index after successful write
            if update_tracks_index:
                self.update_tracks_index(track_id, point_count)
            else:
                # This is a live track. Update update.json live entry pointCount
                update_data = self._open_json_file(self.update_file, mode='r')
                if "live" in update_data and update_data["live"]["id"] == track_id:
                    update_data["live"]["pointCount"] = point_count
                    self._write_json_file(self.update_file, update_data)
                else:
                    print(f"Warning: Live track ID mismatch when updating point count for {track_id}.")
        except Exception as e:
            print(f"Error extending data to {file_path}: {e}")


    def update_tracks_index(self, track_id, point_count):
        try:
            index_data = self._open_json_file(self.tracks_file, mode='r')
            tracks = index_data["tracks"] if "tracks" in index_data else []
            track = self._get_track(track_id, tracks)
            if track:
                track["pointCount"] = point_count
            else:
                tracks.append({"id": track_id, "pointCount": point_count})
            index_data["tracks"] = tracks
            self._write_json_file(self.tracks_file, index_data)
            # Update tracks entry in update.json to reflect last edit time of tracks.json
            update_data = self._open_json_file(self.update_file, mode='r')
            update_data["tracks"]["edited"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self._write_json_file(self.update_file, update_data)
            print(f"Tracks index updated in {self.tracks_file}.")
        except Exception as e:
            print(f"Error updating tracks index in {self.tracks_file}: {e}")


    def start_live_track(self, track_id):
        # Add or update track entry in tracks.json. The track should show 0 points, and the real number of points will
        # be written to update.json
        index_data = self._open_json_file(self.tracks_file, mode='r')
        tracks = index_data["tracks"] if "tracks" in index_data else []

        previous_point_count = 0
        track = self._get_track(track_id, tracks)
        if track:
            previous_point_count = track["pointCount"]

        self.update_tracks_index(track_id, 0)

        update_data = {
            "live": {
                "id": track_id,
                "pointCount": previous_point_count
            }
        }
        # Read existing update.json data to preserve other entries if any
        existing_update_data = self._open_json_file(self.update_file, mode='r')
        existing_update_data.update(update_data)
        self._write_json_file(self.update_file, existing_update_data)
        print(f"Live track started for {track_id}.")


    def end_live_track(self):
        """
        End the live tracking session by removing the live track entry from update.json
        and updating the corresponding track entry in tracks.json.
        """
        # Remove live track entry from update.json
        update_data = self._open_json_file(self.update_file, mode='r')
        if "live" in update_data:
            live_track_id = update_data["live"]["id"]
            live_track_point_count = update_data["live"]["pointCount"]
            print(f"Ending live track for {live_track_id} with {live_track_point_count} points.")
            # Remove live entry
            del update_data["live"]
            self._write_json_file(self.update_file, update_data)
            # Update entry in tracks.json
            index_data = self._open_json_file(self.tracks_file, mode='r')
            tracks = index_data["tracks"] if "tracks" in index_data else []
            track = self._get_track(live_track_id, tracks)
            if track:
                track["pointCount"] = live_track_point_count
                self._write_json_file(self.tracks_file, index_data)
            print("Live track ended.")
        else:
            print("No live track to end.")


    def remove_track(self, track_id):
        """
        Remove a track completely from the JSON files.

        Args:
            track_id: The ID of the track to remove
        """
        # Remove track file
        track_file = os.path.join(self.data_dir, f"{track_id}.json")
        try:
            os.remove(track_file)
            print(f"Removed track file: {track_file}")
        except FileNotFoundError:
            print(f"Track file not found, nothing to remove: {track_file}")
        except Exception as e:
            print(f"Error removing track file {track_file}: {e}")

        # Remove from tracks.json
        index_data = self._open_json_file(self.tracks_file, mode='r')
        tracks = index_data["tracks"] if "tracks" in index_data else []
        tracks = [track for track in tracks if track["id"] != track_id]
        index_data["tracks"] = tracks
        self._write_json_file(self.tracks_file, index_data)
        print(f"Removed track {track_id} from tracks index.")


    def _get_track(self, track_id, tracks):
        """
        Private method to retrieve track data for a given track ID.

        Args:
            track_id: The ID of the track to retrieve
            tracks: List of track dictionaries
        """
        for track in tracks:
            if track["id"] == track_id:
                return track
        return None


    def _write_json_file(self, file_path, data):
        """
        Private method to write data to a JSON file with trailing newline.

        Args:
            file_path: Path to the JSON file
            data: Dictionary or list to write to the file
        """
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)
            f.write('\n')

    def _open_json_file(self, file_path, mode='r', default_value={}):
        """
        Private method to handle all JSON file operations.

        Args:
            file_path: Path to the JSON file
            mode: File opening mode ('r' for read, 'w' for write)
            default_value: Default value to return if file doesn't exist (for read mode)

        Returns:
            For read mode: parsed JSON data or default_value
            For write mode: file handle (to be used in context manager)
        """
        if mode == 'r':
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except FileNotFoundError:
                print(f"Warning: JSON file not found: {file_path}. Using default value.")
                return default_value
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON file {file_path}: {e}")
                return default_value
        elif mode == 'w':
            return open(file_path, 'w', encoding='utf-8')
