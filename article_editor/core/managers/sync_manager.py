"""Sync Manager — local ↔ shared cloud state (doc §4, §10).

Only data for projects the user has shared is synced (encrypted).
NOT IMPLEMENTED YET — interface only.
"""


class SyncManager:
    def push(self, project_id):
        raise NotImplementedError("sync is not implemented yet")

    def pull(self, project_id):
        raise NotImplementedError("sync is not implemented yet")
