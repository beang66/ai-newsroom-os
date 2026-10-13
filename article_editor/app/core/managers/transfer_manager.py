"""Transfer Manager — 다른 PC로 이전(서버 경유).

옛 PC 에서 현재 계정의 자료를 **일회용 코드로 암호화한 백업**으로 만들어 Supabase Storage 의 내 폴더(<user id>/transfer.db)에 올리고,
새 PC 에서 같은 계정으로 로그인해 같은 코드로 내려받아 이 PC 의 현재 계정 자료로 바꾼다. 서버에는 암호문만 있고 코드는 가지 않는다.
계정마다 한 칸만 두고(덮어쓰기), 가져오기에 성공하면 서버 파일을 지운다. 사용자 JWT + RLS 로만 접근한다(supabase_transfer_bucket.sql).
"""
import os

from .. import auth, vault
from ..errors import RequestError
from ..integrations import supabase

BUCKET = 'transfers'
NAME = 'transfer.db'
MAX_BYTES = int(float(os.environ.get('TRANSFER_MAX_MB') or 50) * 1024 * 1024)  # Supabase 무료 플랜의 파일당 한도


def _code(payload):
    code = (payload or {}).get('code')
    if not isinstance(code, str) or not 12 <= len(code) <= 200:
        raise RequestError('이전 코드를 확인해 주세요.')
    return code


class TransferManager:
    def __init__(self, session):
        self._session = session

    def _target(self):
        token, user = self._session.token(), auth.status().get('userId')
        if not token or not user:
            raise RequestError('로그인이 필요합니다.', 401, code='AUTH_REQUIRED')
        return token, f'{user}/{NAME}'

    def status(self):
        """서버에 이전 파일이 있는가 → {exists, bytes, updatedAt, maxBytes}"""
        token, path = self._target()
        info = supabase.storage_info(BUCKET, path, token)
        return {'exists': info is not None, **(info or {'bytes': 0, 'updatedAt': ''}), 'maxBytes': MAX_BYTES}

    def upload(self, payload):
        """payload: {code} — 현재 계정 자료를 code 로 암호화해 서버에 올린다. 한도를 넘으면 올리지 않고 413(TRANSFER_TOO_LARGE)."""
        code = _code(payload)
        token, path = self._target()
        raw = vault.export_backup(code)
        if len(raw) > MAX_BYTES:
            raise RequestError(f'자료가 너무 커서 서버로 보낼 수 없어요(최대 {MAX_BYTES // (1024 * 1024)}MB). 파일로 옮겨 주세요.', 413,
                               code='TRANSFER_TOO_LARGE', details={'bytes': len(raw), 'maxBytes': MAX_BYTES})
        supabase.storage_upload(BUCKET, path, raw, token)
        return {'uploaded': True, 'bytes': len(raw)}

    def download(self, payload):
        """payload: {code} — 서버의 이전 파일을 code 로 풀어 이 PC 의 현재 계정 자료로 바꾼다(교체 전 DB 는 안전 복사본).
        코드가 틀리면 아무것도 바꾸지 않고 서버 파일도 남긴다. 성공하면 서버 파일을 지운다."""
        code = _code(payload)
        token, path = self._target()
        raw = supabase.storage_download(BUCKET, path, token)
        if raw is None:
            raise RequestError('서버에 이전 파일이 없어요. 옛 PC 에서 먼저 서버로 보내 주세요.', 404, code='TRANSFER_MISSING')
        result = vault.restore_backup(raw, code)
        try:
            supabase.storage_delete(BUCKET, path, token)
            deleted = True
        except RequestError:
            deleted = False  # 지우지 못해도 가져오기는 끝났다(다음에 올릴 때 덮어쓴다)
        return {**result, 'serverCopyDeleted': deleted}

    def delete(self):
        """서버의 이전 파일 지우기(보낸 것을 취소할 때)"""
        token, path = self._target()
        supabase.storage_delete(BUCKET, path, token)
        return {'deleted': True}
