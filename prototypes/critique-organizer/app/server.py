"""Local-only HTTP adapter and dependency composition. Team apps mount the domain service separately."""
import base64
import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse
from . import store, ingest, review, critique, knowledge, openai_adapter, model_proofread
from .contracts import API_VERSION
from .retrieval import LocalKeywordRetriever

WEB=Path(__file__).resolve().parents[1]/'web'
MAX_BODY=15*1024*1024


class Handler(BaseHTTPRequestHandler):
    def send_bytes(self,data,mime='application/json; charset=utf-8',status=200,attachment=None):
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        if attachment:
            self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+quote(attachment))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError):
            pass

    def send_json(self,obj,status=200):
        self.send_bytes(json.dumps(obj,ensure_ascii=False).encode(),status=status)

    def allowed_request(self):
        port=self.server.server_address[1]
        allowed={f'127.0.0.1:{port}',f'localhost:{port}'}
        if self.headers.get('Host') not in allowed:
            self.send_json({'error':'Invalid local Host'},403)
            return False
        origin=self.headers.get('Origin')
        if origin and origin not in {'http://'+host for host in allowed}:
            self.send_json({'error':'Cross-origin requests are disabled'},403)
            return False
        return True

    def request_json(self):
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':
            raise ValueError('Content-Type: application/json이 필요합니다.')
        length=int(self.headers.get('Content-Length','0'))
        if not 0<length<=MAX_BODY:
            raise ValueError('요청 크기는 1바이트~15MB여야 합니다.')
        payload=json.loads(self.rfile.read(length))
        if not isinstance(payload,dict):
            raise ValueError('JSON 객체가 필요합니다.')
        return payload

    def do_GET(self):
        if not self.allowed_request(): return
        try:
            self.get_route()
        except (ValueError,KeyError,TypeError) as exc:
            self.send_json({'error':str(exc)},400)
        except Exception:
            self.send_json({'error':'조회 처리에 실패했습니다.'},500)

    def get_route(self):
        parsed=urlparse(self.path)
        filters={key:values[0] for key,values in parse_qs(parsed.query).items()}
        if parsed.path=='/api/catalog': return self.send_json(knowledge.catalog(filters))
        if parsed.path=='/api/explore': return self.send_json(knowledge.graph(filters))
        if parsed.path=='/api/projects': return self.send_json({'projects':knowledge.projects()})
        if parsed.path.startswith('/api/organized/'):
            return self.send_json({'document':knowledge.detail(parsed.path.split('/')[-1])})
        if parsed.path.startswith('/api/failed-original/'):
            item=knowledge.failure_original(unquote(parsed.path.split('/')[-1]))
            return self.send_bytes(item['raw'],'application/octet-stream',attachment=item['title'])
        if parsed.path=='/api/health':
            return self.send_json({'ok':True,'api_version':API_VERSION,'corpus_revision':store.corpus_revision(),
                'openai_configured':bool(os.environ.get('OPENAI_API_KEY')),
                'openai_connection':openai_adapter.connection_state()['status'],
                'openai_reason':openai_adapter.connection_state()['reason']})
        if parsed.path=='/api/documents':
            return self.send_json({'documents':store.list_documents(),'corpus_revision':store.corpus_revision()})
        if parsed.path=='/api/graph': return self.send_json(store.graph())
        if parsed.path=='/api/search':
            query=parse_qs(parsed.query).get('q',[''])[0]
            if len(query)>1000: raise ValueError('검색어는 최대 1,000자입니다.')
            candidates=LocalKeywordRetriever(store.source_blocks()).retrieve(query,8)
            return self.send_json({'results':[c.to_dict() for c in candidates],'strategy':'local_keyword_candidates','corpus_revision':store.corpus_revision()})
        parts=parsed.path.strip('/').split('/')
        if len(parts) in (3,4) and parts[:2]==['api','documents']:
            if len(parts)==4 and parts[3]=='original':
                original=store.get_original(parts[2])
                if not original: return self.send_json({'error':'삭제됐거나 없는 원본입니다.'},404)
                return self.send_bytes(original['raw'],'application/octet-stream',attachment=original['title'])
            if len(parts)==3:
                doc=store.get_document(parts[2])
                return self.send_json({'document':doc},200 if doc else 404)
        if len(parts)==3 and parts[:2]==['api','reviews']:
            result=store.get_review(parts[2])
            return self.send_json({'review':result},200 if result else 404)
        path=(WEB/parsed.path.lstrip('/')).resolve() if parsed.path!='/' else WEB/'index.html'
        if not path.is_relative_to(WEB) or not path.is_file():
            return self.send_json({'error':'Not found'},404)
        return self.send_bytes(path.read_bytes(),mimetypes.guess_type(path)[0] or 'application/octet-stream')

    def do_POST(self):
        if not self.allowed_request(): return
        try:
            payload=self.request_json()
            if self.path=='/api/openai/check': return self.send_json(openai_adapter.probe())
            if self.path=='/api/projects': return self.send_json(knowledge.create_project(payload['title']),201)
            if self.path=='/api/organization':
                return self.send_json(knowledge.edit(payload['document_id'],payload['revision'],payload.get('changes',{})))
            if self.path=='/api/organization/undo':
                return self.send_json(knowledge.edit(payload['document_id'],payload['revision'],{},undo=True))
            if self.path=='/api/organization/suggest':
                return self.send_json(knowledge.suggest(payload['document_id']))
            if self.path=='/api/intake':
                if not isinstance(payload.get('data'),str): raise ValueError('base64 data 문자열이 필요합니다.')
                return self.send_json(knowledge.intake(payload['name'],payload.get('path',payload['name']),base64.b64decode(payload['data'],validate=True),payload.get('project_id')))
            if self.path=='/api/intake/retry': return self.send_json(knowledge.retry(payload['failure_id']))
            if self.path=='/api/intake/remove': return self.send_json(knowledge.remove_failure(payload['failure_id']))
            if self.path=='/api/transcripts': return self.send_json(knowledge.import_transcript(payload),201)
            if self.path=='/api/documents':
                if not isinstance(payload.get('data'),str): raise ValueError('base64 data 문자열이 필요합니다.')
                data=base64.b64decode(payload['data'],validate=True)
                result=ingest.ingest(payload['name'],payload.get('path',payload['name']),data)
                return self.send_json(result,201)
            if self.path=='/api/proofread':
                article=payload.get('article','')
                title=payload.get('title','')
                glossary=payload.get('glossary',[])
                if not isinstance(article,str) or len(article)>30000:
                    raise ValueError('원고는 최대 30,000자입니다.')
                critique.validate_options(title,glossary)
                return self.send_json({'findings':critique.proofreading(article,'body',glossary)+critique.proofreading(title,'title',glossary),'scope':'eight_rules_only'})
            if self.path=='/api/finding-status':
                return self.send_json(store.set_finding_status(payload['review_id'],payload['finding_id'],payload['status'],payload['input_hash']))
            if self.path=='/api/reviews':
                critique.validate_options(payload.get('title',''),payload.get('glossary',[]))
                enabled=payload.get('use_openai',False)
                if type(enabled) is not bool: raise ValueError('use_openai는 boolean이어야 합니다.')
                if enabled and not os.environ.get('OPENAI_API_KEY'):
                    raise ValueError('OpenAI API 키가 설정되지 않았습니다. OpenAI 사용을 해제하면 로컬 검토할 수 있습니다.')
                revision=store.corpus_revision()
                selected=payload.get('source_document_ids',[])
                if not isinstance(selected,list) or len(selected)>200 or any(not isinstance(x,str) for x in selected):
                    raise ValueError('source_document_ids는 문서 ID 배열(최대 200개)이어야 합니다.')
                selected=list(dict.fromkeys(selected))
                known={d['id'] for d in store.list_documents()}
                if set(selected)-known:
                    raise ValueError('선택한 자료가 삭제됐거나 존재하지 않습니다.')
                blocks=[b for b in store.source_blocks() if b['document_id'] in selected]
                result=review.analyze(payload['article'],article_id=payload['article_id'],
                    article_version=payload['article_version'],corpus_revision=revision,
                    retriever=LocalKeywordRetriever(blocks),judge=openai_adapter.configured_judge(enabled),repository=store,
                    title=payload.get('title',''),glossary=payload.get('glossary',[]),source_document_ids=selected,
                    proofreader=model_proofread.OpenAIProofreader(os.environ['OPENAI_API_KEY'],
                        os.environ.get('OPENAI_MODEL',openai_adapter.DEFAULT_MODEL)) if enabled else None)
                return self.send_json(result)
            return self.send_json({'error':'Not found'},404)
        except (ValueError,KeyError,TypeError) as exc:
            self.send_json({'error':str(exc)},400)
        except Exception:
            # Do not log document text or provider secrets.
            self.send_json({'error':'파일 형식 또는 처리 상태를 확인하세요. 작업에 실패했습니다.'},500)

    def do_DELETE(self):
        if not self.allowed_request(): return
        parts=urlparse(self.path).path.strip('/').split('/')
        if len(parts)==3 and parts[:2]==['api','documents']:
            try:
                result=store.delete_document(parts[2])
                return self.send_json(result,200 if result['deleted'] else 404)
            except Exception:
                return self.send_json({'error':'자료 삭제에 실패했습니다.'},500)
        return self.send_json({'error':'Not found'},404)

    def log_message(self, format, *args):
        # Query strings may contain source material. Keep only method and status.
        pass


def build_server(port=8765):
    store.init()
    knowledge.init()
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)


def main():
    server=build_server(int(os.environ.get('PORT','8765')))
    print(f'Newsroom local preview: http://127.0.0.1:{server.server_address[1]}',flush=True)
    server.serve_forever()


if __name__=='__main__': main()
