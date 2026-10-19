"""Share Manager — 보관함 기사를 링크로 공유한다(받는 사람은 보기, 또는 보기 + 내 보관함으로 가져오기).

서버(Supabase)에는 article_shares(공유 설정 + 공유본 암호문)와 article_share_members(이메일 초대)만 있다
(integration/supabase_article_shares.sql). 공유본의 키는 우리 백엔드가 공유마다 파생한다(/ai/share-key):
백엔드는 Supabase 함수 article_share_role 로 권한을 확인한 뒤에만 키를 준다 — 기사 서버 백업과 같은 원칙
(Supabase 만 침해되면 암호문뿐, 2026-10-13 결정).

공유본 = 공유를 만들거나 '최신본으로 업데이트'한 때의 마지막 수동 저장본(사진 포함). 기사만 공유하고 취재자료·녹취는 넣지 않는다.
공동 편집은 없다 — 가져오기는 받는 사람의 보관함에 새 기사로 복사한다.
"""
import base64
import json
import re
from datetime import datetime, timedelta, timezone

from .. import auth, backend_proxy, cloud_backup, config
from ..errors import RequestError
from ..integrations import supabase

TABLE = 'article_shares'
MEMBERS = 'article_share_members'
ROLES = ('viewer', 'importer')
ACCESS = ('restricted', 'link')
EXPIRES_DAYS = (None, 1, 7, 30)
MAX_PAYLOAD = 10_000_000  # 공유본(사진 포함) 한도 — 암호화·base64 뒤에도 서버 한도(14MB) 안에 들어간다
MAX_MEMBERS = 50
EMAIL = re.compile(r'[^@\s]+@[^@\s]+\.[^@\s]+')
LINK_TOKEN = re.compile(r'(?<![0-9a-f])([0-9a-f]{64})(?![0-9a-f])')
SHARE_ID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
ARTICLE_ID = re.compile(r'[a-f0-9]{32}')
# 공유본에 넣는 기사 필드(허용 목록). 취재자료(sources·linkedSources)·녹취(linkedInterviews)·CMS 송고 기록·플랫폼 변환본은 넣지 않는다
ARTICLE_FIELDS = ('title', 'subtitle', 'url', 'bodyHtml', 'content', 'photos', 'category', 'subcategory')
SHARE_COLUMNS = 'id,article_id,title,link_token,general_access,link_role,expires_at,updated_at'


class ShareManager:
    def __init__(self, session, storage):
        self._session = session
        self._storage = storage

    # ---- 공통 ----
    def _token(self):
        token = self._session.token()
        if not token or not auth.status().get('userId'):
            raise RequestError('로그인이 필요합니다.', 401, code='AUTH_REQUIRED')
        return token

    @staticmethod
    def _key(share_id, link_token=None):
        reply = backend_proxy.post('/ai/share-key', {'shareId': share_id, **({'token': link_token} if link_token else {})})
        key = reply.get('key') if isinstance(reply, dict) else None
        if not isinstance(key, str) or len(key) < 20:
            raise RequestError('공유 키를 받지 못했어요. 백엔드 설정을 확인해 주세요.', 502)
        return key

    @staticmethod
    def link(link_token):
        base = (config.AI_BACKEND_URL or '').rstrip('/')
        return f'{base}/s/{link_token}' if base else f'ainewsroom://share/{link_token}'

    @staticmethod
    def _article_id(article_id):
        if not isinstance(article_id, str) or not ARTICLE_ID.fullmatch(article_id):
            raise RequestError('잘못된 기사 ID입니다.')
        return article_id

    def _row(self, article_id, token):
        rows = supabase.select(TABLE, {'select': SHARE_COLUMNS, 'article_id': 'eq.' + article_id}, token)
        return rows[0] if rows else None

    def _view(self, row, members):
        return {'shared': True, 'shareId': row['id'], 'link': self.link(row['link_token']),
                'generalAccess': row['general_access'], 'linkRole': row['link_role'],
                'expiresAt': row.get('expires_at'), 'updatedAt': row.get('updated_at'),
                'members': [{'email': m['email'], 'role': m['role']} for m in members]}

    def _members(self, share_id, token):
        return supabase.select(MEMBERS, {'select': 'email,role', 'share_id': 'eq.' + share_id, 'order': 'created_at.asc'}, token)

    def _sealed_snapshot(self, article_id, share_id):
        """마지막 수동 저장본(사진 포함)을 공유 키로 봉인 → (base64 암호문, 제목)."""
        draft = self._storage.get_article(article_id, 'saved')['draft']
        draft = {k: draft[k] for k in ARTICLE_FIELDS if k in draft}
        raw = json.dumps({'v': 1, 'draft': draft}, ensure_ascii=False).encode('utf-8')
        if len(raw) > MAX_PAYLOAD:
            raise RequestError('사진이 많아 공유본이 너무 커요(최대 10MB). 사진을 줄이고 다시 시도해 주세요.', 413)
        sealed = cloud_backup.seal(self._key(share_id), raw)
        return base64.b64encode(sealed).decode('ascii'), (draft.get('title') or '')[:500]

    @staticmethod
    def _settings(payload):
        access = payload.get('generalAccess', 'restricted')
        link_role = payload.get('linkRole', 'viewer')
        days = payload.get('expiresInDays')
        if access not in ACCESS or link_role not in ROLES:
            raise RequestError('공유 설정을 확인해 주세요.')
        if days not in EXPIRES_DAYS:
            raise RequestError('만료 기간은 없음·1일·7일·30일 중에서 골라 주세요.')
        expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat() if days else None
        return {'general_access': access, 'link_role': link_role, 'expires_at': expires}

    @staticmethod
    def _member_rows(payload, owner_email):
        members = payload.get('members', [])
        if not isinstance(members, list) or len(members) > MAX_MEMBERS:
            raise RequestError(f'초대는 {MAX_MEMBERS}명까지 할 수 있어요.')
        rows = {}
        for member in members:
            email = str((member or {}).get('email') or '').strip().lower()
            role = (member or {}).get('role', 'viewer')
            if not EMAIL.fullmatch(email) or role not in ROLES:
                raise RequestError(f'초대할 이메일과 권한을 확인해 주세요: {email or "(빈 칸)"}')
            if email != (owner_email or '').lower():
                rows[email] = role
        return [{'email': email, 'role': role} for email, role in rows.items()]

    # ---- 보내는 사람 ----
    def get(self, article_id):
        """이 기사의 공유 설정(내가 만든 것) → {shared: False} 또는 {shared, shareId, link, generalAccess, linkRole, expiresAt, members}"""
        token = self._token()
        row = self._row(self._article_id(article_id), token)
        return self._view(row, self._members(row['id'], token)) if row else {'shared': False}

    def save(self, article_id, payload):
        """공유를 만들거나 설정을 바꾼다. 처음 만들 때와 refresh=True 일 때 공유본을 지금의 마지막 수동 저장본으로 다시 올린다.
        payload: {generalAccess, linkRole, expiresInDays?, members: [{email, role}], refresh?}
        expiresInDays 를 빼면 만료를 바꾸지 않는다."""
        article_id = self._article_id(article_id)
        token = self._token()
        settings = self._settings(payload)
        if 'expiresInDays' not in payload:
            settings.pop('expires_at')
        members = self._member_rows(payload, auth.status().get('email'))
        row = self._row(article_id, token)
        created = row is None
        if created:  # 키가 공유 id 에서 나오므로 행을 먼저 만들고 공유본을 채운다
            row = supabase.insert(TABLE, {'article_id': article_id, **settings}, token)[0]
        else:
            row = supabase.update(TABLE, {'id': 'eq.' + row['id']}, settings, token)[0]
        if created or payload.get('refresh'):
            try:
                sealed, title = self._sealed_snapshot(article_id, row['id'])
            except RequestError:
                if created:
                    supabase.delete(TABLE, {'id': 'eq.' + row['id']}, token)  # 공유본 없이 남은 빈 공유는 지운다
                raise
            supabase.update(TABLE, {'id': 'eq.' + row['id']}, {'sealed': sealed, 'title': title}, token)
        supabase.delete(MEMBERS, {'share_id': 'eq.' + row['id']}, token)
        if members:
            supabase.insert(MEMBERS, [{'share_id': row['id'], **m} for m in members], token)
        return self.get(article_id)

    def stop(self, article_id):
        """공유 중지 — 공유와 초대를 지운다. 이미 가져간 복사본은 받는 사람의 보관함에 남는다."""
        token = self._token()
        supabase.delete(TABLE, {'article_id': 'eq.' + self._article_id(article_id)}, token)
        return {'shared': False}

    # ---- 받는 사람 ----
    def received(self):
        """내 이메일로 초대된 공유 목록."""
        rows = supabase.rpc('article_shares_received', {}, self._token()) or []
        return {'shares': [{'shareId': r['id'], 'title': r['title'] or '제목 없는 기사', 'ownerEmail': r['owner_email'],
                            'role': r['role'], 'updatedAt': r['updated_at'], 'expiresAt': r.get('expires_at')} for r in rows]}

    @staticmethod
    def _target(payload):
        """{shareId} 또는 {link}(링크·토큰을 붙여 넣은 글) → (share_id, link_token)"""
        share_id = payload.get('shareId')
        if share_id is not None:
            if not isinstance(share_id, str) or not SHARE_ID.fullmatch(share_id):
                raise RequestError('잘못된 공유 ID입니다.')
            return share_id, None
        found = LINK_TOKEN.search(str(payload.get('link') or '').strip().lower())
        if not found:
            raise RequestError('공유 링크를 확인해 주세요.')
        return None, found[1]

    def _open(self, payload):
        share_id, link_token = self._target(payload)
        token = self._token()
        rows = supabase.rpc('article_share_open', {'p_share': share_id, 'p_token': link_token}, token) or []
        if not rows:
            raise RequestError('공유를 찾지 못했어요. 공유가 중지됐거나 만료됐거나, 이 계정에 권한이 없어요.', 404, code='SHARE_NOT_FOUND')
        row = rows[0]
        if not row.get('sealed'):
            raise RequestError('공유본이 아직 올라가지 않았어요. 잠시 뒤 다시 시도해 주세요.', 409)
        raw = cloud_backup.open_sealed(self._key(row['id'], link_token), base64.b64decode(row['sealed']))
        draft = json.loads(raw.decode('utf-8')).get('draft')
        if not isinstance(draft, dict) or not isinstance(draft.get('bodyHtml'), str):
            raise RequestError('공유본을 읽지 못했어요.')
        share = {'shareId': row['id'], 'title': row['title'] or draft.get('title') or '제목 없는 기사', 'ownerEmail': row['owner_email'],
                 'role': row['role'], 'updatedAt': row['updated_at'], 'expiresAt': row.get('expires_at')}
        return share, draft

    def open(self, payload):
        """공유 하나를 읽기 전용으로 연다 → {share, article: {title, subtitle, bodyHtml}}"""
        share, draft = self._open(payload)
        return {'share': share, 'article': {'title': draft.get('title') or '', 'subtitle': draft.get('subtitle') or '',
                                            'bodyHtml': draft['bodyHtml']}}

    def import_article(self, payload):
        """가져오기 권한이 있으면 내 보관함에 새 기사로 복사한다 → {articleId}"""
        share, draft = self._open(payload)
        if share['role'] not in ('importer', 'owner'):
            raise RequestError('이 공유는 보기만 허용돼요. 공유한 사람에게 가져오기 권한을 요청해 주세요.', 403)
        result = self._storage.save_article({'draft': draft, 'kind': 'manual'})  # articleId 를 빼서 새 기사가 된다
        return {'articleId': result['articleId'], 'title': draft.get('title') or ''}
