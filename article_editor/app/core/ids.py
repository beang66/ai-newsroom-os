"""팀 계약(v0.8) id 규칙 — 레거시 hex id 를 UUID v5 로 옮기는 순수 함수(표준 라이브러리만, DB·네트워크 없음).

su4228 브랜치 integration/core_contract.py 의 uuid_text·legacy_uuid 를 옮겨 왔다.
차이: 네임스페이스는 인자로 받지 않고 아래 TEAM_NAMESPACE 상수로 고정한다. 설명은 docs/IDS.md.
"""
import hashlib
import re
import uuid

# 팀 UUID v5 네임스페이스. 절대 바꾸지 말 것 — 바꾸면 이미 발급된 모든 계약 id 가 달라진다.
TEAM_NAMESPACE = uuid.UUID('fb7978fb-ae58-41b1-a9e5-37c17f46d423')

_UUID_SHAPE = re.compile(r'[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')


class IdError(ValueError):
    pass


def uuid_text(value):
    """하이픈 UUID 또는 32자리 hex 를 소문자 하이픈 표준형으로. 그 밖의 모양({...}, urn:uuid: 등)은 거부."""
    if not isinstance(value, str) or not _UUID_SHAPE.fullmatch(value):
        raise IdError('Invalid UUID: hyphenated UUID or 32-hex string required')
    return str(uuid.UUID(value))


def legacy_uuid(entity, legacy_id, system='app-core'):
    """'<system>:<entity>:<legacy_id>' 를 TEAM_NAMESPACE 로 UUID v5 변환. 같은 입력이면 언제나 같은 id."""
    if not isinstance(legacy_id, str) or not legacy_id:
        raise IdError('Legacy ID required (non-empty string)')
    return str(uuid.uuid5(TEAM_NAMESPACE, f'{system}:{entity}:{legacy_id}'))



def revision_uuid(article_id, revision_no):
    """article_revisions 한 줄의 id. 줄의 옛 식별자 (article_id, revision_no)를 이름으로 UUID v5 를 만든다.
    기사 id 가 나중에 UUID 로 바뀌어도 이름에는 옛 32자리 hex 를 계속 쓴다(그래야 id 가 안 바뀐다)."""
    if not isinstance(revision_no, int) or isinstance(revision_no, bool) or revision_no < 1:
        raise IdError('revision_no must be a positive integer')
    return legacy_uuid('revision', f'{article_id}:{revision_no}')


# ── 새로 만드는 id 는 처음부터 UUID 로 만든다(별칭 없음). 저장 형태는 하이픈 없는 32자리 hex, 계약으로 나갈 때만 uuid_text() 로 하이픈을 붙인다.
# 자료·사진은 내용에서 계산한다(같은 파일 = 같은 id → 중복 저장 방지가 그대로). 기사는 uuid4().hex, 개정본은 revision_uuid().

def source_id(raw):
    """취재자료 id: 원본 바이트의 SHA-256 으로 만든 UUID v5 (32자리 hex)."""
    return uuid.uuid5(TEAM_NAMESPACE, 'app-core:source:' + hashlib.sha256(raw).hexdigest()).hex


def media_id(head, raw):
    """사진 id: 'data:image/png;base64' 같은 머리글과 바이트의 SHA-256 으로 만든 UUID v5 (32자리 hex)."""
    return uuid.uuid5(TEAM_NAMESPACE, 'app-core:media:' + hashlib.sha256(head.encode() + b'\0' + raw).hexdigest()).hex
