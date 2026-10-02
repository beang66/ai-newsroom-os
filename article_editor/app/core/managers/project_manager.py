"""Project Manager — project lifecycle (doc §4).

Planned: create/open/close, metadata, document & source links, sharing flag,
project key binding. Current: a single local project (the article workspace).
"""


class ProjectManager:
    LOCAL_PROJECT_ID = "local"

    def __init__(self, storage=None):
        self.storage = storage

    def current(self):
        return {"id": self.LOCAL_PROJECT_ID, "name": "Local Project", "shared": False}
