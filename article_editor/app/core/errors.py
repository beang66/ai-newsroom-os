"""Shared request error type."""
class RequestError(Exception):
    # code: 기계가 읽는 오류 코드(예: 'REVISION_CONFLICT'). 선택 — 없으면 응답에 싣지 않는다(기존 호출과 호환).
    # details: 오류와 함께 돌려줄 추가 정보(예: 지우려는 자료를 쓰는 기사 목록). 선택.
    def __init__(self, message, status=400, code=None, details=None):
        self.message, self.status, self.code, self.details = message, status, code, details
