from git import Repo



class Gitter:
    def __init__(self, repo_path):
        self.repo = Repo(repo_path)


    def add_files(self, files):
        """
        Stage the specified files for commit.

        Args:
            files (list): List of file paths to stage.
        """
        try:
            repo = Repo(self.repo_path)
            abs_paths = [os.path.abspath(file) for file in files]
            repo.index.add(abs_paths)

        except Exception as e:
            raise Exception(f"Error adding files to Git index: {str(e)}")


    def commit_and_push(self, commit_message=None):
        """
        Commit changes to the specified files and push to GitHub.

        Args:
            commit_message (str): Optional commit message. If None, a default message is used.
        """
        try:
            repo = Repo(self.repo_path)

            if not commit_message:
                current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                commit_message = f"Update data - {current_time}"

            # Commit changes
            repo.index.commit(commit_message)

            # Push to origin
            origin = repo.remote('origin')
            origin.push()

        except Exception as e:
            raise Exception(f"Error in Git operations: {str(e)}")
