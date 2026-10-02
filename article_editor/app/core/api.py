import os, re, json, mimetypes, urllib.request, urllib.parse, urllib.error
from http.server import BaseHTTPRequestHandler

from . import config
from .config import PIPELINE_VERSION, HEADLINE_MODEL, SUBTITLE_MODEL, LIMIT, ROOT, FRONTEND
from .errors import RequestError
from .ai.local_models import headline_dependencies_ready
from .integrations.unsplash import unsplash_get, selected_unsplash
from .create_core import create_core

# App Core (managers). The handler routes through it instead of calling
# implementations directly (see APP_CORE_ARCHITECTURE.md §4).
CORE = create_core()
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
        if self.path=='/api/status':return self.send(200,{'ready':bool(os.environ.get('OPENAI_API_KEY')),'headline_ready':headline_dependencies_ready(),'headline_model':HEADLINE_MODEL,'subtitle_model':SUBTITLE_MODEL,'pipeline_version':PIPELINE_VERSION,'unsplash_ready':bool(os.environ.get('UNSPLASH_ACCESS_KEY')),'workspace_version':'3.0.0'})
        if self.path=='/api/session':
            try:return self.send(200,CORE.session.status())
            except RequestError as e:return self.send(e.status,{'error':e.message})
        if self.path=='/api/factcheck/status':
            try:return self.send(200,CORE.ai.factcheck_status())
            except RequestError as e:return self.send(e.status,{'error':e.message})
        if self.path=='/api/models':
            try:return self.send(200,CORE.models.status())
            except RequestError as e:return self.send(e.status,{'error':e.message})
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
            except RequestError as e:return self.send(e.status,{'error':e.message})
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
            except RequestError as e:return self.send(e.status,{'error':e.message})
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
        if self.path not in ('/api/assist','/api/articles/save','/api/session','/api/session/signout','/api/models/install','/api/models/cancel','/api/factcheck/run','/api/semantic/parse'):return self.send(404,{'error':'지원하지 않는 경로입니다.'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send(415,{'error':'JSON 요청이 필요합니다.'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=(80_000_000 if self.path=='/api/articles/save' else 30_000_000):raise RequestError('요청 크기가 너무 큽니다.',413)
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise RequestError('잘못된 요청입니다.')
            if self.path=='/api/session':return self.send(200,CORE.session.sign_in(data))
            if self.path=='/api/session/signout':return self.send(200,CORE.session.sign_out())
            if self.path=='/api/models/install':return self.send(200,CORE.models.start_install(data))
            if self.path=='/api/models/cancel':return self.send(200,CORE.models.cancel())
            if self.path=='/api/articles/save':return self.send(200,CORE.storage.save_article(data))
            if not LIMIT.acquire(blocking=False):raise RequestError('다른 AI 작업이 진행 중이에요. 잠시 후 다시 시도하세요.',429)
            try:
                if self.path=='/api/factcheck/run':result=CORE.ai.factcheck_run(data)
                elif self.path=='/api/semantic/parse':result=CORE.ai.semantic_parse(data)
                else:result=CORE.ai.assist(data)
            finally:LIMIT.release()
            self.send(200,result)
        except RequestError as e:self.send(e.status,{'error':e.message})
        except (ValueError,TypeError):self.send(400,{'error':'요청 형식을 확인해 주세요.'})
        except Exception:self.send(500,{'error':'처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'})
