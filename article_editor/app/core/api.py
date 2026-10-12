import os, re, sys, json, mimetypes, urllib.request, urllib.parse, urllib.error
from http.server import BaseHTTPRequestHandler

from .config import PIPELINE_VERSION, HEADLINE_MODEL, SUBTITLE_MODEL, LIMIT, FRONTEND
from .errors import RequestError
from .ai.local_models import headline_dependencies_ready
from .integrations.unsplash import unsplash_get, selected_unsplash
from .create_core import create_core
from .documents import extract_text

# App Core (managers). The handler routes through it instead of calling
# implementations directly (see APP_CORE_ARCHITECTURE.md §4).
CORE = create_core()
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
def error_body(e):
    """오류 응답 본문. 화면은 "error" 문자열을 읽는다 — 기계용 code 가 있으면 함께 싣는다."""
    return {'error':e.message,**({'code':e.code} if getattr(e,'code',None) else {}),**({'details':e.details} if getattr(e,'details',None) else {})}
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass  # Do not log manuscript content or API credentials.
    def send(self, status, payload, mime='application/json; charset=utf-8'):
        raw=json.dumps(payload,ensure_ascii=False).encode() if mime.startswith('application/json') else payload
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass
    def port(self):
        # 설정값(PORT)이 아니라 실제로 바인딩된 포트를 쓴다.
        # 런처/배포본은 빈 포트(8877~8899)를 골라 서빙하므로 검사가 어긋나면 안 된다.
        return self.server.server_address[1]
    def allowed(self):
        return self.headers.get('Host') in (f'localhost:{self.port()}',f'127.0.0.1:{self.port()}')
    def do_GET(self):
        if not self.allowed():return self.send(403,{'error':'로컬 주소로 접속해 주세요.'})
        if self.path=='/api/status':return self.send(200,{'ready':bool(os.environ.get('OPENAI_API_KEY')),'headline_ready':headline_dependencies_ready(),'headline_model':HEADLINE_MODEL,'subtitle_model':SUBTITLE_MODEL,'pipeline_version':PIPELINE_VERSION,'unsplash_ready':bool(os.environ.get('UNSPLASH_ACCESS_KEY')),'workspace_version':'3.0.0','dev':not getattr(sys,'frozen',False)})
        if self.path=='/api/settings':return self.send(200,CORE.settings.get())
        if self.path=='/api/session':
            try:return self.send(200,CORE.session.status())
            except RequestError as e:return self.send(e.status,error_body(e))
        if self.path=='/api/factcheck/status':
            try:return self.send(200,CORE.ai.factcheck_status())
            except RequestError as e:return self.send(e.status,error_body(e))
        if self.path in ('/api/articles/latest','/api/articles/latest?photos=ref'):
            try:return self.send(200,CORE.storage.latest_article(photo_refs=self.path.endswith('?photos=ref')))
            except RequestError as e:return self.send(e.status,error_body(e))
        found=re.fullmatch(r'/api/media/([a-f0-9]{32})',self.path)
        if found:
            try:return self.send(200,*CORE.storage.media_file(found.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        found=re.fullmatch(r'/api/articles/([a-f0-9]{32})/revisions(?:/(\d{1,6}))?',self.path)
        if found:
            try:return self.send(200,CORE.storage.get_revision(found.group(1),int(found.group(2))) if found.group(2) else CORE.storage.list_revisions(found.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        found=re.fullmatch(r'/api/articles/([a-f0-9]{32})/snapshots',self.path) or re.fullmatch(r'/api/snapshots/('+UUID+')',self.path)
        if found:
            try:return self.send(200,CORE.storage.list_snapshots(found.group(1)) if self.path.startswith('/api/articles/') else CORE.storage.get_snapshot(found.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        found=re.fullmatch(r'/api/media-assets/('+UUID+')(/file)?',self.path)
        if found:
            try:return self.send(200,*CORE.storage.media_asset_file(found.group(1))) if found.group(2) else self.send(200,CORE.storage.get_media_asset(found.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        found=re.fullmatch(r'/api/jobs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',self.path)
        if found:
            try:return self.send(200,CORE.jobs.get(found.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        if self.path=='/api/models':
            try:return self.send(200,CORE.models.status())
            except RequestError as e:return self.send(e.status,error_body(e))
        if self.path=='/api/transcripts':
            try:return self.send(200,CORE.storage.list_transcripts())
            except RequestError as e:return self.send(e.status,error_body(e))
        path=urllib.parse.urlsplit(self.path)
        if path.path=='/api/unsplash/search':
            try:
                params=urllib.parse.parse_qs(path.query)
                q=params.get('q',[''])[0].strip()
                if not q or len(q)>150:raise RequestError('검색어를 150자 이하로 입력해 주세요.')
                try: page=int(params.get('page',['1'])[0])
                except ValueError: raise RequestError('올바른 사진 페이지를 선택해 주세요.')
                if not 1<=page<=10000:raise RequestError('올바른 사진 페이지를 선택해 주세요.')
                result=unsplash_get('/search/photos?'+urllib.parse.urlencode({'query':q,'per_page':3,'page':page}))
                return self.send(200,{'photos':result.get('results',[])[:3],'page':page,'totalPages':min(10000,result.get('total_pages',0)),'total':result.get('total',0)})
            except RequestError as e:return self.send(e.status,error_body(e))
        if path.path in ('/api/articles','/api/knowledge-map'):
            try:return self.send(200,CORE.storage.list_articles() if path.path=='/api/articles' else CORE.storage.knowledge_map())
            except RequestError as e:return self.send(e.status,error_body(e))
        match=re.fullmatch(r'/api/articles/([a-f0-9]{32})',path.path)
        if match:
            try:return self.send(200,CORE.storage.get_article(match.group(1),photo_refs=True))
            except RequestError as e:return self.send(e.status,error_body(e))
        if path.path=='/api/sources':
            try:return self.send(200,CORE.storage.list_sources())
            except RequestError as e:return self.send(e.status,error_body(e))
        match=re.fullmatch(r'/api/knowledge-files/('+UUID+')',path.path)
        if match:
            try:return self.send(200,CORE.storage.get_knowledge_file(match.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        match=re.fullmatch(r'/api/transcripts/([a-f0-9]{32})(/audio)?',path.path)
        if match:
            try:return self.send(200,*CORE.storage.transcript_audio(match.group(1))) if match.group(2) else self.send(200,CORE.storage.get_transcript(match.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        match=re.fullmatch(r'/api/sources/([a-f0-9]{32}|[a-f0-9]{16})',path.path)
        if match:
            try:return self.send(200,CORE.storage.get_source(match.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        match=re.fullmatch(r'/api/sources/([a-f0-9]{32}|[a-f0-9]{16})/file',path.path)
        if match:
            try:return self.send(200,*CORE.storage.source_file(match.group(1)))
            except RequestError as e:return self.send(e.status,error_body(e))
        match=re.fullmatch(r'/api/unsplash/photo/([A-Za-z0-9_-]{1,80})(/track)?',path.path)
        if match:
            try:
                photo=selected_unsplash(match.group(1))
                if match.group(2):return self.send(200,{'tracked':True})
                url=photo['urls']['full']
                if urllib.parse.urlsplit(url).hostname!='images.unsplash.com':raise RequestError('사진 주소를 확인할 수 없어요.',502)
                with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ArticleWorkspace/3.0'}),timeout=30) as r:
                    if urllib.parse.urlsplit(r.url).hostname!='images.unsplash.com':raise RequestError('잘못된 사진 주소입니다.',502)
                    raw=r.read(15*1024*1024+1);mime=r.headers.get_content_type()
                    if len(raw)>15*1024*1024 or mime not in ('image/jpeg','image/png','image/webp'):raise RequestError('지원하지 않는 사진입니다.',413)
                    return self.send(200,raw,mime)
            except RequestError as e:return self.send(e.status,error_body(e))
            except Exception:return self.send(502,{'error':'사진을 가져오지 못했어요. 다시 시도해 주세요.'})
        if path.path.startswith('/assets/') or path.path.startswith('/src/') or path.path.startswith('/public/'):
            # 빌드된 React 앱(Vite)도 여기서 서빙한다 — 정적 파일은 frontend/ 안으로 제한한다.
            file=(FRONTEND/path.path.lstrip('/')).resolve()
            if file.is_relative_to(FRONTEND) and file.is_file() and file.suffix in (
                '.css','.js','.mjs','.map','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico',
                '.woff','.woff2','.ttf','.otf','.json','.txt',
            ):
                return self.send(200,file.read_bytes(),mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        if self.path in ('/','/index.html'):return self.send(200,(FRONTEND/'index.html').read_bytes(),'text/html; charset=utf-8')
        if self.path.startswith('/favicon') or self.path.startswith('/icons'):
            file=(FRONTEND/self.path.lstrip('/')).resolve()
            if file.is_relative_to(FRONTEND) and file.is_file():
                return self.send(200,file.read_bytes(),mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send(404,{'error':'찾을 수 없는 경로입니다.'})
    def do_POST(self):
        if not self.allowed() or self.headers.get('Origin') not in (f'http://localhost:{self.port()}',f'http://127.0.0.1:{self.port()}'):return self.send(403,{'error':'워크스페이스에서 요청해 주세요.'})
        restore=re.fullmatch(r'/api/articles/([a-f0-9]{32})/revisions/(\d{1,6})/restore',self.path)
        snapshot=re.fullmatch(r'/api/articles/([a-f0-9]{32})/snapshots',self.path)
        job_cancel=re.fullmatch(r'/api/jobs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/cancel',self.path)
        source_delete=re.fullmatch(r'/api/sources/([a-f0-9]{32}|[a-f0-9]{16})/delete',self.path)
        knowledge_file_delete=re.fullmatch(r'/api/knowledge-files/('+UUID+')/delete',self.path)
        if not restore and not snapshot and not job_cancel and not source_delete and not knowledge_file_delete and self.path not in ('/api/media-assets','/api/knowledge-files/import','/api/assist','/api/articles/save','/api/session','/api/session/signout','/api/session/auto','/api/settings','/api/models/install','/api/models/cancel','/api/factcheck/run','/api/semantic/parse','/api/interview/transcribe','/api/materials/extract','/api/sources/open','/api/factcheck/external','/api/platform/keywords','/api/platform/generate','/api/platform/render','/api/cms/publish','/api/vault/export','/api/vault/restore'):return self.send(404,{'error':'지원하지 않는 경로입니다.'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send(415,{'error':'JSON 요청이 필요합니다.'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            # shortcut: 백업을 JSON/base64로 받으므로 220MB로 제한, 저장소가 150MB에 가까워지면 스트리밍 업로드로 교체
            if not 0<size<=(220_000_000 if self.path=='/api/vault/restore' else 80_000_000 if self.path=='/api/articles/save' else 40_000_000 if self.path in ('/api/interview/transcribe','/api/materials/extract') else 30_000_000):raise RequestError('요청 크기가 너무 큽니다.',413)
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise RequestError('잘못된 요청입니다.')
            if self.path=='/api/session':return self.send(200,CORE.session.sign_in(data))
            if self.path=='/api/session/signout':return self.send(200,CORE.session.sign_out())
            if self.path=='/api/session/auto':return self.send(200,CORE.session.set_auto_login(data))
            if self.path=='/api/settings':return self.send(200,CORE.settings.update(data))
            if self.path=='/api/models/install':return self.send(200,CORE.models.start_install(data))
            if self.path=='/api/models/cancel':return self.send(200,CORE.models.cancel())
            if self.path=='/api/articles/save':return self.send(200,CORE.storage.save_article(data))
            if self.path=='/api/vault/export':return self.send(200,CORE.storage.export_backup(data))
            if self.path=='/api/vault/restore':return self.send(200,CORE.storage.restore_backup(data))
            if self.path=='/api/cms/publish':return self.send(200,CORE.platform.publish(data))
            if job_cancel:return self.send(200,CORE.jobs.cancel(job_cancel.group(1)))
            if self.path=='/api/media-assets':return self.send(200,CORE.storage.register_media_asset(data))
            if self.path=='/api/knowledge-files/import':return self.send(200,CORE.storage.import_knowledge_files(data))
            if knowledge_file_delete:return self.send(200,CORE.storage.delete_knowledge_file(knowledge_file_delete.group(1)))
            if source_delete:return self.send(200,CORE.storage.delete_source(source_delete.group(1),data))
            if restore:return self.send(200,CORE.storage.restore_revision(restore.group(1),int(restore.group(2))))
            if snapshot:return self.send(200,CORE.storage.create_snapshot(snapshot.group(1),data))
            if self.path=='/api/materials/extract':return self.send(200,extract_text(data))
            if self.path=='/api/sources/open':return self.send(200,CORE.storage.open_source(data))
            if not LIMIT.acquire(blocking=False):raise RequestError('다른 AI 작업이 진행 중이에요. 잠시 후 다시 시도하세요.',429)
            try:
                if self.path=='/api/factcheck/run':result=CORE.ai.factcheck_run(data)
                elif self.path=='/api/factcheck/external':result=CORE.ai.factcheck_external(data)
                elif self.path=='/api/semantic/parse':result=CORE.ai.semantic_parse(data)
                elif self.path=='/api/interview/transcribe':result=CORE.ai.transcribe(data)
                elif self.path=='/api/platform/keywords':result=CORE.platform.keywords(data)
                elif self.path=='/api/platform/generate':result=CORE.platform.generate(data)
                elif self.path=='/api/platform/render':result=CORE.platform.render(data)
                else:result=CORE.ai.assist(data)
            finally:LIMIT.release()
            self.send(200,result)
        except RequestError as e:self.send(e.status,error_body(e))
        except (ValueError,TypeError):self.send(400,{'error':'요청 형식을 확인해 주세요.'})
        except Exception:self.send(500,{'error':'처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'})
