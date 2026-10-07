"""MediaAsset(계약 v0.8): 사진 한 장의 공유 가능한 정체성(UUID)과 설명. 바이트는 기존 암호화 `media` 표에 한 번만 둔다.

- registerMediaAsset: 이미지(data URL) 또는 이미 저장된 `media:<hex>` 를 받아 자산으로 등록한다. 자산 id = 사진의 UUID 이므로 같은 바이트면
  같은 id 이고, 여러 번 등록해도 하나다. 다시 등록할 때:
    · caption·filename 은 사진의 **기본 설명** — 처음 준 값을 유지하고, 비어 있을 때만 채운다(덮어쓰지 않는다).
    · generated(AI 생성 여부)는 한번 켜지면 꺼지지 않는다(실수로 다시 등록해도 AI 생성 표시가 사라지지 않게).
- 기사마다 다른 설명은 원고 안(photos[].caption)에 있다. 자산 응답의 usages 가 "이 사진을 쓰는 기사와 그 기사에서의 설명"을
  각 기사의 최신 저장본에서 읽어 준다(자료 사용처 usedBy 와 같은 방식 — 별도 표가 없어 원고와 어긋날 일이 없다).
  ponytail: 기사 밖(카드뉴스 결과·외부 시스템)에서도 사진별 설명이 생기면 그때 (자산, 쓰는 곳, 설명) 표를 둔다.
- getMediaAsset / media_asset_file: 자산 정보와 바이트(앱 안에서 보여 줄 때).
지금은 이미지만 받는다(영상·오디오는 큰 파일을 DB 안에 두는 문제가 있어 따로 정한다).
"""
import base64
import json

from . import ids, storage, vault
from .errors import RequestError

KINDS = ('image',)
IMAGE_MIME = ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
MAX_BYTES = 25 * 1024 * 1024

_COLUMNS = 'a.id, a.media_id, a.kind, a.mime_type, a.filename, a.caption, a.generated, a.created_at, length(m.data)'


def _usages(db, media_id):
    """이 사진을 쓰는 기사(각 기사의 최신 저장본 기준)와 그 기사에서의 설명 [{articleId, title, photoId, caption}]."""
    ref, out = 'media:' + media_id, []
    for article_id, _created, _updated, _revision, body in storage.latest_revisions(db):
        draft = json.loads(body)
        for photo in draft.get('photos') or []:
            if isinstance(photo, dict) and ref in (photo.get(key) for key in storage.PHOTO_FIELDS):
                out.append({'articleId': article_id, 'title': draft.get('title') or '', 'photoId': photo.get('id'),
                            'caption': photo.get('caption') if isinstance(photo.get('caption'), str) else ''})
    return out


def _asset(row, usages):
    return {'id': row[0], 'workspace_id': vault.WORKSPACE_ID, 'kind': row[2], 'object_ref': 'media:' + row[1],
            'mime_type': row[3], 'filename': row[4], 'caption': row[5], 'generated': bool(row[6]), 'created_at': row[7],
            'byte_size': row[8], 'local_uri': '/api/media-assets/' + row[0] + '/file', 'usages': usages}


def _text(data, key, limit):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value) > limit:
        raise RequestError('%s 값을 확인해 주세요.' % key)
    return value.strip()


def register_media_asset(data):
    if not isinstance(data, dict):
        raise RequestError('잘못된 요청입니다.')
    if data.get('kind') not in KINDS:
        raise RequestError('지금은 이미지(kind=image)만 등록할 수 있어요.')
    mime = data.get('mime_type')
    if mime not in IMAGE_MIME:
        raise RequestError('지원하지 않는 이미지 형식입니다(JPEG·PNG·WebP·GIF).')
    filename, caption = _text(data, 'filename', 255), _text(data, 'caption', 2000)
    generated = data.get('generated', False)
    if not isinstance(generated, bool):
        raise RequestError('generated 값을 확인해 주세요.')
    payload, ref = data.get('data'), data.get('object_ref')
    with storage.SAVE_LOCK, vault.connect() as db:
        if isinstance(payload, str):  # 바이트를 함께 보낸 경우: 한 번만 저장
            head, _, b64 = payload.partition(',')
            if head != 'data:%s;base64' % mime:
                raise RequestError('이미지 데이터와 mime_type 이 맞지 않습니다.')
            try:
                raw = base64.b64decode(b64, validate=True)
            except ValueError:
                raise RequestError('이미지 데이터를 읽지 못했습니다.') from None
            if not raw or len(raw) > MAX_BYTES:
                raise RequestError('이미지는 25MB 이하로 올려 주세요.', 413)
            media_id = storage._store_media(db, head, raw)
        else:  # 이미 암호화 저장소에 있는 사진을 가리키는 경우
            found = storage.MEDIA_REF.fullmatch(ref) if isinstance(ref, str) else None
            row = db.execute('SELECT header FROM media WHERE id = ?', (found.group(1),)).fetchone() if found else None
            if not row:
                raise RequestError('이미지 데이터(data) 또는 저장된 사진(object_ref=media:<id>)이 필요합니다.')
            if row[0] != 'data:%s;base64' % mime:
                raise RequestError('저장된 사진의 형식과 mime_type 이 맞지 않습니다.')
            media_id = found.group(1)
        asset_id = ids.uuid_text(media_id)  # 사진 자체가 UUID 이므로 자산 id 도 같은 값(별칭 없음)
        db.execute('INSERT INTO media_assets (id, media_id, workspace_id, kind, mime_type, filename, caption, generated, created_at) '
                   "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET "
                   "filename = CASE WHEN filename = '' THEN excluded.filename ELSE filename END, "
                   "caption = CASE WHEN caption = '' THEN excluded.caption ELSE caption END, "
                   'generated = max(generated, excluded.generated)',
                   (asset_id, media_id, vault.WORKSPACE_ID, 'image', mime, filename, caption, int(generated), storage._now()))
        row = db.execute('SELECT ' + _COLUMNS + ' FROM media_assets a JOIN media m ON m.id = a.media_id WHERE a.id = ?', (asset_id,)).fetchone()
        return _asset(row, _usages(db, media_id))


def _row(db, asset_id):
    try:
        asset_id = ids.uuid_text(asset_id)
    except ids.IdError:
        raise RequestError('잘못된 미디어 자산 ID입니다.') from None
    row = db.execute('SELECT ' + _COLUMNS + ' FROM media_assets a JOIN media m ON m.id = a.media_id WHERE a.id = ?', (asset_id,)).fetchone()
    if not row:
        raise RequestError('미디어 자산을 찾지 못했습니다.', 404, code='NOT_FOUND')
    return row


def get_media_asset(asset_id):
    with vault.connect() as db:
        row = _row(db, asset_id)
        return _asset(row, _usages(db, row[1]))


def media_asset_file(asset_id):
    """앱 안에서 보여 줄 이미지 바이트 → (bytes, mime)."""
    with vault.connect() as db:
        row = _row(db, asset_id)
        data = db.execute('SELECT data FROM media WHERE id = ?', (row[1],)).fetchone()[0]
    return bytes(data), row[3]
