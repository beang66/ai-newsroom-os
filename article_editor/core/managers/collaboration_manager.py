"""Collaboration Manager — realtime collaboration (doc §4, §9).

Manages presence, cursors, selection, node state over Supabase Realtime.
NOT IMPLEMENTED YET — interface only.
"""


class CollaborationManager:
    def connect(self, project_id):
        raise NotImplementedError("collaboration is not implemented yet")

    def disconnect(self):
        raise NotImplementedError("collaboration is not implemented yet")

    def participants(self):
        raise NotImplementedError("collaboration is not implemented yet")
