import os, re, sys, json, mimetypes, time, urllib.request, urllib.parse, urllib.error
from http.server import BaseHTTPRequestHandler

from .config import PIPELINE_VERSION, HEADLINE_MODEL, SUBTITLE_MODEL, LIMIT, FRONTEND
from .errors import RequestError
from .ai.local_models import headline_dependencies_ready
from .integrations.unsplash import unsplash_get, selected_unsplash
from .integrations import donga_archive
from .create_core import create_core
from .documents import extract_text
from . import exports, support_report, vault

# App Core (managers). The handler routes through it instead of calling
# implementations directly (see APP_CORE_ARCHITECTURE.md §4).
CORE = create_core()
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
ARTICLE, SOURCE = r'([a-f0-9]{32})', r'([a-f0-9]{32}|[a-f0-9]{16})'
def error_body(e):
    """오류 응답 본문. 화면은 "error" 문자열을 읽는다 — 기계용 code 가 있으면 함께 싣는다."""
    return {'error':e.message,**({'code':e.code} if getattr(e,'code',None) else {}),**({'details':e.details} if getattr(e,'details',None) else {})}

def _page(q):
    try: return int(q.get('page',['1'])[0])
    except ValueError: raise RequestError('올바른 사진 페이지를 선택해 주세요.')

def _unsplash_search(q):
    text=q.get('q',[''])[0].strip()
    if not text or len(text)>150:raise RequestError('검색어를 150자 이하로 입력해 주세요.')
    page=_page(q)
    if not 1<=page<=10000:raise RequestError('올바른 사진 페이지를 선택해 주세요.')
    result=unsplash_get('/search/photos?'+urllib.parse.urlencode({'query':text,'per_page':3,'page':page}))
    return {'photos':result.get('results',[])[:3],'page':page,'totalPages':min(10000,result.get('total_pages',0)),'total':result.get('total',0)}

def _donga_search(q):  # 동아일보 DB(포토파노라마) 사진 검색 — 검색어로 거르고 전체/최신순/오래된순, 3장씩
    text=q.get('q',[''])[0].strip()
    if len(text)>100:raise RequestError('검색어를 100자 이하로 입력해 주세요.')
    return donga_archive.search(text,q.get('sort',['all'])[0],_page(q))

def _unsplash_photo(photo_id, track):
    try:
        photo=selected_unsplash(photo_id)
        if track:return {'tracked':True}
        url=photo['urls']['full']
        if urllib.parse.urlsplit(url).hostname!='images.unsplash.com':raise RequestError('사진 주소를 확인할 수 없어요.',502)
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ArticleWorkspace/3.0'}),timeout=30) as r:
            if urllib.parse.urlsplit(r.url).hostname!='images.unsplash.com':raise RequestError('잘못된 사진 주소입니다.',502)
            raw=r.read(15*1024*1024+1);mime=r.headers.get_content_type()
            if len(raw)>15*1024*1024 or mime not in ('image/jpeg','image/png','image/webp'):raise RequestError('지원하지 않는 사진입니다.',413)
            return raw,mime
    except RequestError:raise
    except Exception:raise RequestError('사진을 가져오지 못했어요. 다시 시도해 주세요.',502)

def _article(m, q):  # ?version=saved|published → 보관함 '수정'(그 판을 편집기로), 없으면 최신 작업본
    version=q.get('version',[''])[0]
    if version in ('saved','published'):return CORE.storage.get_article(m[1],version,photo_refs=q.get('photos')==['ref'])
    return CORE.storage.get_article(m[1],photo_refs=True,record=q.get('purpose')!=['preview'])  # 보관함 미리보기는 '다시 열기'가 아니다

def _export(data):
    started=time.monotonic();result=exports.save(data)
    CORE.events.record('output_export_completed',export_kind=(data or {}).get('kind'),file_count=len(result['files']),duration_ms=int((time.monotonic()-started)*1000))
    return result

# (경로 정규식, 처리 함수(match, query)). 함수가 (bytes, mime) 튜플을 돌려주면 그대로, 아니면 JSON 으로 보낸다.
GET_ROUTES = [(re.compile(p),f) for p,f in (
    ('/api/status', lambda m,q: {'ready':bool(os.environ.get('OPENAI_API_KEY')),'headline_ready':headline_dependencies_ready(),'headline_model':HEADLINE_MODEL,'subtitle_model':SUBTITLE_MODEL,'pipeline_version':PIPELINE_VERSION,'unsplash_ready':bool(os.environ.get('UNSPLASH_ACCESS_KEY')),'workspace_version':'3.0.0','dev':not getattr(sys,'frozen',False)}),
    ('/api/settings', lambda m,q: CORE.settings.get()),
    ('/api/backup', lambda m,q: CORE.backup.status()),
    ('/api/backup/list', lambda m,q: CORE.backup.list()),
    ('/api/transfer/file', lambda m,q: CORE.transfer.file_status()),
    ('/api/transfer', lambda m,q: CORE.transfer.status()),
    ('/api/backup-key', lambda m,q: {'key':vault.backup_key()}),
    ('/api/diagnostics', lambda m,q: support_report.report(CORE.models.status(),'local' if CORE.settings.get()['localAi'] else 'external',CORE.settings.get())),
    ('/api/ut-events', lambda m,q: CORE.events.preview()),
    ('/api/session', lambda m,q: CORE.session.status()),
    ('/api/shares/received', lambda m,q: CORE.shares.received()),
    ('/api/shares/articles/'+ARTICLE, lambda m,q: CORE.shares.get(m[1])),
    ('/api/factcheck/status', lambda m,q: CORE.ai.factcheck_status()),
    ('/api/models', lambda m,q: CORE.models.status()),
    ('/api/transcripts', lambda m,q: CORE.storage.list_transcripts()),
    ('/api/articles', lambda m,q: CORE.storage.list_articles()),
    ('/api/trash', lambda m,q: CORE.storage.list_trash()),
    ('/api/knowledge-map', lambda m,q: CORE.storage.knowledge_map()),
    ('/api/library', lambda m,q: CORE.storage.library_state()),
    ('/api/knowledge-files', lambda m,q: CORE.storage.list_knowledge_files()),
    ('/api/sources', lambda m,q: CORE.storage.list_sources()),
    ('/api/articles/latest', lambda m,q: CORE.storage.latest_article(photo_refs=q.get('photos')==['ref'])),
    ('/api/articles/'+ARTICLE, _article),
    ('/api/media/([a-f0-9]{32})', lambda m,q: CORE.storage.media_file(m[1])),
    ('/api/articles/'+ARTICLE+'/revisions', lambda m,q: CORE.storage.list_revisions(m[1])),
    ('/api/articles/'+ARTICLE+r'/revisions/(\d{1,6})', lambda m,q: CORE.storage.get_revision(m[1],int(m[2]))),
    ('/api/articles/'+ARTICLE+'/snapshots', lambda m,q: CORE.storage.list_snapshots(m[1])),
    ('/api/snapshots/('+UUID+')', lambda m,q: CORE.storage.get_snapshot(m[1])),
    ('/api/media-assets/('+UUID+')', lambda m,q: CORE.storage.get_media_asset(m[1])),
    ('/api/media-assets/('+UUID+')/file', lambda m,q: CORE.storage.media_asset_file(m[1])),
    ('/api/jobs/('+UUID+')', lambda m,q: CORE.jobs.get(m[1])),
    ('/api/platform/runs', lambda m,q: CORE.platform.list_runs(q.get('articleId',[''])[0])),
    ('/api/platform/runs/('+UUID+')', lambda m,q: CORE.platform.get_run(m[1])),
    ('/api/knowledge-files/('+UUID+')', lambda m,q: CORE.storage.get_knowledge_file(m[1])),
    ('/api/transcripts/([a-f0-9]{32})', lambda m,q: CORE.storage.get_transcript(m[1])),
    ('/api/transcripts/([a-f0-9]{32})/audio', lambda m,q: CORE.storage.transcript_audio(m[1])),
    ('/api/sources/'+SOURCE, lambda m,q: CORE.storage.get_source(m[1])),
    ('/api/sources/'+SOURCE+'/file', lambda m,q: CORE.storage.source_file(m[1])),
    ('/api/unsplash/search', lambda m,q: _unsplash_search(q)),
    ('/api/unsplash/photo/([A-Za-z0-9_-]{1,80})(/track)?', lambda m,q: _unsplash_photo(m[1],bool(m[2]))),
    ('/api/donga/photos', lambda m,q: _donga_search(q)),
    (r'/api/donga/photo/(\d{1,12})', lambda m,q: donga_archive.photo_bytes(m[1])),
)]

POST_ROUTES = [(re.compile(p),f) for p,f in (
    ('/api/session', lambda m,d: CORE.session.sign_in(d)),
    ('/api/session/signup', lambda m,d: CORE.session.sign_up(d)),
    ('/api/session/keep', lambda m,d: CORE.session.set_keep_login(d)),
    ('/api/session/signout', lambda m,d: CORE.session.sign_out()),
    ('/api/session/auto', lambda m,d: CORE.session.set_auto_login(d)),
    ('/api/backup/restore', lambda m,d: CORE.backup.restore(d)),
    ('/api/backup/disable', lambda m,d: CORE.backup.disable(d)),
    ('/api/transfer/upload', lambda m,d: CORE.transfer.upload(d)),
    ('/api/transfer/download', lambda m,d: CORE.transfer.download(d)),
    ('/api/transfer/delete', lambda m,d: CORE.transfer.delete()),
    ('/api/transfer/file', lambda m,d: CORE.transfer.make_file(d)),
    ('/api/transfer/file/delete', lambda m,d: CORE.transfer.delete_file()),
    ('/api/settings', lambda m,d: CORE.settings.update(d)),
    ('/api/shares/articles/'+ARTICLE, lambda m,d: CORE.shares.save(m[1],d)),
    ('/api/shares/articles/'+ARTICLE+'/stop', lambda m,d: CORE.shares.stop(m[1])),
    ('/api/shares/open', lambda m,d: CORE.shares.open(d)),
    ('/api/shares/import', lambda m,d: CORE.shares.import_article(d)),
    ('/api/ut-events/export', lambda m,d: CORE.events.export()),
    ('/api/ut-events/delete', lambda m,d: CORE.events.delete()),
    ('/api/models/install', lambda m,d: CORE.models.start_install(d)),
    ('/api/models/cancel', lambda m,d: CORE.models.cancel()),
    ('/api/articles/save', lambda m,d: CORE.storage.save_article(d)),
    ('/api/articles/publish', lambda m,d: CORE.storage.publish_article(d)),
    ('/api/vault/export', lambda m,d: CORE.storage.export_backup(d)),
    ('/api/vault/restore', lambda m,d: CORE.storage.restore_backup(d)),
    ('/api/platform/sns', lambda m,d: CORE.platform.sns(d)),
    ('/api/platform/runs', lambda m,d: CORE.platform.start_run(d)),
    ('/api/cms/publish', lambda m,d: CORE.platform.publish(d)),
    ('/api/jobs/('+UUID+')/cancel', lambda m,d: CORE.jobs.cancel(m[1])),
    ('/api/media-assets', lambda m,d: CORE.storage.register_media_asset(d)),
    ('/api/knowledge-files/import', lambda m,d: CORE.storage.import_knowledge_files(d)),
    ('/api/library', lambda m,d: CORE.storage.save_library_state(d)),
    ('/api/knowledge-files/('+UUID+')/delete', lambda m,d: CORE.storage.delete_knowledge_file(m[1])),
    ('/api/sources/'+SOURCE+'/delete', lambda m,d: CORE.storage.delete_source(m[1],d)),
    ('/api/articles/'+ARTICLE+r'/revisions/(\d{1,6})/restore', lambda m,d: CORE.storage.restore_revision(m[1],int(m[2]))),
    ('/api/articles/'+ARTICLE+'/revisions/prune-legacy', lambda m,d: CORE.storage.prune_legacy_revisions(m[1])),
    ('/api/articles/'+ARTICLE+'/delete', lambda m,d: CORE.storage.delete_article(m[1])),
    ('/api/articles/'+ARTICLE+'/undelete', lambda m,d: CORE.storage.restore_deleted(m[1])),
    ('/api/articles/'+ARTICLE+'/snapshots', lambda m,d: CORE.storage.create_snapshot(m[1],d)),
    ('/api/transcripts/([a-f0-9]{32})/speakers', lambda m,d: CORE.storage.save_speaker_edits(m[1],d.get('speakerEdits'))),
    ('/api/materials/extract', lambda m,d: extract_text(d)),
    ('/api/sources/open', lambda m,d: CORE.storage.open_source(d)),
    ('/api/exports', lambda m,d: _export(d)),
    ('/api/exports/open', lambda m,d: exports.open_folder(d)),
)]
# AI 작업은 한 번에 하나만(LIMIT) — 외부 호출·로컬 모델이 겹치면 느려지고 비용이 샌다
AI_ROUTES = {
    '/api/factcheck/run': lambda d: CORE.ai.factcheck_run(d),
    '/api/factcheck/external': lambda d: CORE.ai.factcheck_external(d),
    '/api/semantic/parse': lambda d: CORE.ai.semantic_parse(d),
    '/api/interview/transcribe': lambda d: CORE.ai.transcribe(d),
    '/api/stt': lambda d: CORE.ai.transcribe(d),
    '/api/platform/keywords': lambda d: CORE.platform.keywords(d),
    '/api/platform/generate': lambda d: CORE.platform.generate(d),
    '/api/platform/render': lambda d: CORE.platform.render(d),
    '/api/platform/validate': lambda d: CORE.platform.validate(d),
    '/api/assist': lambda d: CORE.ai.assist(d),
}
# shortcut: 백업을 JSON/base64로 받으므로 220MB로 제한, 저장소가 150MB에 가까워지면 스트리밍 업로드로 교체
POST_LIMITS = {'/api/vault/restore':220_000_000,'/api/exports':220_000_000,'/api/articles/save':80_000_000,'/api/articles/publish':80_000_000,
               '/api/interview/transcribe':56_000_000,'/api/stt':56_000_000,'/api/materials/extract':40_000_000}
STATIC_TYPES = ('.css','.js','.mjs','.map','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.ttf','.otf','.json','.txt')

def _match(routes, path):
    for pattern,handler in routes:
        m=pattern.fullmatch(path)
        if m:return handler,m
    return None,None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass  # Do not log manuscript content or API credentials.
    def send(self, status, payload, mime='application/json; charset=utf-8'):
        raw=json.dumps(payload,ensure_ascii=False).encode() if mime.startswith('application/json') else payload
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass
    def reply(self, result):
        return self.send(200,*result) if isinstance(result,tuple) else self.send(200,result)
    def port(self):
        # 설정값(PORT)이 아니라 실제로 바인딩된 포트를 쓴다.
        # 런처/배포본은 빈 포트(8877~8899)를 골라 서빙하므로 검사가 어긋나면 안 된다.
        return self.server.server_address[1]
    def allowed(self):
        return self.headers.get('Host') in (f'localhost:{self.port()}',f'127.0.0.1:{self.port()}')
    def do_GET(self):
        if not self.allowed():return self.send(403,{'error':'로컬 주소로 접속해 주세요.'})
        path=urllib.parse.urlsplit(self.path)
        handler,m=_match(GET_ROUTES,path.path)
        if handler:
            try:return self.reply(handler(m,urllib.parse.parse_qs(path.query)))
            except RequestError as e:return self.send(e.status,error_body(e))
            except Exception:return self.send(500,{'error':'처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'})
        if path.path in ('/','/index.html'):return self.send(200,(FRONTEND/'index.html').read_bytes(),'text/html; charset=utf-8')
        # 빌드된 React 앱(Vite)도 여기서 서빙한다 — 정적 파일은 frontend/ 안으로 제한한다.
        if path.path.startswith(('/assets/','/favicon','/icons')):
            file=(FRONTEND/path.path.lstrip('/')).resolve()
            if file.is_relative_to(FRONTEND) and file.is_file() and file.suffix in STATIC_TYPES:
                return self.send(200,file.read_bytes(),mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send(404,{'error':'찾을 수 없는 경로입니다.'})
    def do_POST(self):
        if not self.allowed() or self.headers.get('Origin') not in (f'http://localhost:{self.port()}',f'http://127.0.0.1:{self.port()}'):return self.send(403,{'error':'워크스페이스에서 요청해 주세요.'})
        handler,m=_match(POST_ROUTES,self.path)
        ai=AI_ROUTES.get(self.path)
        if not handler and not ai:return self.send(404,{'error':'지원하지 않는 경로입니다.'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send(415,{'error':'JSON 요청이 필요합니다.'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=POST_LIMITS.get(self.path,30_000_000):raise RequestError('요청 크기가 너무 큽니다.',413)
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise RequestError('잘못된 요청입니다.')
            if handler:return self.reply(handler(m,data))
            if not LIMIT.acquire(blocking=False):raise RequestError('다른 AI 작업이 진행 중이에요. 잠시 후 다시 시도하세요.',429)
            try:result=ai(data)
            finally:LIMIT.release()
            self.send(200,result)
        except RequestError as e:self.send(e.status,error_body(e))
        except (ValueError,TypeError):self.send(400,{'error':'요청 형식을 확인해 주세요.'})
        except Exception:self.send(500,{'error':'처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'})
