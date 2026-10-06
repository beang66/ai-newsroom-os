"""Version storage adapter. Replace this class with SQLite while keeping methods/HTTP contract."""
import datetime
import hashlib
import json
import re
import threading
import uuid
from pathlib import Path

class VersionStoreError(Exception):
    def __init__(self,message,status=400):
        self.message,self.status=message,status

def content_hash(draft):
    content={k:v for k,v in draft.items() if k not in ('savedAt','updatedAt','articleId','__versionReturn')}
    return hashlib.sha256(json.dumps(content,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

class JsonVersionStore:
    def __init__(self,root,lock=None):
        self.root=Path(root)
        self.lock=lock or threading.RLock()
    def validate(self,value):
        if not isinstance(value,str) or not re.fullmatch(r'[a-f0-9]{32}',value):
            raise VersionStoreError('잘못된 원고 또는 버전 ID입니다.')
        return value
    def folder(self,article_id):
        return self.root/'versions'/self.validate(article_id)
    def atomic(self,path,data):
        path.parent.mkdir(parents=True,exist_ok=True)
        temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
        try:
            temp.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
            temp.replace(path)
        finally:
            temp.unlink(missing_ok=True)
    def list(self,article_id,include_internal=False):
        with self.lock:
            items=[]
            for path in self.folder(article_id).glob('*.json'):
                try:
                    record=json.loads(path.read_text(encoding='utf-8'))
                    items.append({**{k:record[k] for k in ('versionId','articleId','createdAt','kind','contentHash','title')}, 'versionNumber':record.get('versionNumber'),'internal':record.get('internal',record['kind'] in ('before_restore','restored'))})
                except (ValueError,KeyError):
                    raise VersionStoreError('버전 기록을 읽지 못했어요. 파일 상태를 확인해 주세요.',500)
            ordered=sorted(items,key=lambda v:(v['createdAt'],v['versionId']))
            visible_number=0
            for item in ordered:
                if item['internal']:item['versionNumber']=None
                else:
                    visible_number+=1
                    if item['versionNumber'] is None:item['versionNumber']=visible_number
            return [item for item in ordered[::-1] if include_internal or not item['internal']]
    def get(self,article_id,version_id):
        with self.lock:
            path=self.folder(article_id)/(self.validate(version_id)+'.json')
            if not path.exists():raise VersionStoreError('저장된 버전을 찾지 못했어요.',404)
            record=json.loads(path.read_text(encoding='utf-8'))
            if record.get('internal',record['kind'] in ('before_restore','restored')):record['versionNumber']=None
            elif 'versionNumber' not in record:
                record['versionNumber']=next(v['versionNumber'] for v in self.list(article_id) if v['versionId']==version_id)
            return record
    def create(self,article_id,draft,kind='automatic',force=False):
        if not isinstance(draft,dict) or not isinstance(draft.get('bodyHtml'),str):
            raise VersionStoreError('저장할 원고를 확인해 주세요.')
        if kind not in ('automatic','manual','before_restore','restored'):
            raise VersionStoreError('잘못된 저장 유형입니다.')
        with self.lock:
            versions=self.list(article_id)
            all_versions=self.list(article_id,include_internal=True)
            internal=kind in ('before_restore','restored')
            digest=content_hash(draft)
            comparison=all_versions if kind=='automatic' else versions
            if comparison and comparison[0]['contentHash']==digest and not force:
                return {'created':False,'version':comparison[0]}
            record={'schemaVersion':1,'versionId':uuid.uuid4().hex,'articleId':article_id,
                'parentVersionId':versions[0]['versionId'] if versions else None,
                'versionNumber':None if internal else max((v['versionNumber'] for v in versions),default=0)+1,
                'internal':internal,
                'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'kind':kind,'contentHash':digest,'title':draft.get('title',''),
                'draft':dict(draft,articleId=article_id)}
            self.atomic(self.folder(article_id)/(record['versionId']+'.json'),record)
            return {'created':True,'version':{k:v for k,v in record.items() if k!='draft'}}
    def restore(self,article_id,version_id,current,expected_hash):
        with self.lock:
            target=self.get(article_id,version_id)
            latest=self.root/'articles'/(self.validate(article_id)+'.json')
            if latest.exists() and content_hash(json.loads(latest.read_text(encoding='utf-8')))!=expected_hash:
                raise VersionStoreError('원고가 다른 곳에서 수정됐어요. 현재 원고를 확인한 뒤 다시 시도해 주세요.',409)
            if content_hash(current)!=expected_hash:
                raise VersionStoreError('복원할 원고 상태가 달라졌어요. 다시 시도해 주세요.',409)
            backup=self.create(article_id,current,'before_restore',force=True)
            draft=dict(target['draft'],articleId=article_id,updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
            if target['kind']=='before_restore':draft.pop('__versionReturn',None)
            else:draft['__versionReturn']={'versionId':version_id,'backupVersionId':backup['version']['versionId']}
            restored=self.create(article_id,draft,'restored',force=True)
            try:
                self.atomic(latest,draft)
            except Exception:
                (self.folder(article_id)/(restored['version']['versionId']+'.json')).unlink(missing_ok=True)
                raise
            return {'draft':draft,'version':restored['version'],'backupVersionId':backup['version']['versionId']}
