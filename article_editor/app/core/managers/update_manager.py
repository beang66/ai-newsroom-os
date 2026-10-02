"""Update Manager — app & model updates (doc §4).

Planned: app/model version check, model download, swap, rollback.
NOT IMPLEMENTED YET — interface only.
"""


class UpdateManager:
    def status(self):
        return {"app": None, "models": {}}

    def update(self, target):
        raise NotImplementedError("update is not implemented yet")
