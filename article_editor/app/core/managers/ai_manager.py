"""AI Module Manager — single interface over AI features (doc §4, §7, §8).

Dispatches an AI task by ``kind``. Local AI is preferred; external models are
reached only through the backend proxy (see ARCHITECTURE.md — backend-managed keys).
"""
from ..ai.router import assist as _assist


class AIManager:
    def assist(self, payload):
        """Run an AI task. ``payload['kind']`` selects the task
        (metadata / flow / photo_keywords / image / captions)."""
        return _assist(payload)
