"""Shared request error type."""
class RequestError(Exception):
    def __init__(self, message, status=400): self.message, self.status = message, status
