"""Shared request error type."""
class RequestError(Exception):
    # code: 기계가 읽는 오류 코드(예: 'REVISION_CONFLICT'). 선택 — 없으면 응답에 싣지 않는다(기존 호출과 호환).
    def __init__(self, message, status=400, code=None): self.message, self.status, self.code = message, status, code
