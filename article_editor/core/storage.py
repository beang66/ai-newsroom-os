import os, re, json, uuid, datetime, threading

from .config import ROOT
from .errors import RequestError
def save_article(data):
    draft=data.get('draft')
    if not isinstance(draft,dict) or not isinstance(draft.get('bodyHtml'),str):raise RequestError('저장할 원고를 확인해 주세요.')
    identifier=draft.get('articleId') or uuid.uuid4().hex
    if not isinstance(identifier,str) or not re.fullmatch(r'[a-f0-9]{32}',identifier):raise RequestError('잘못된 원고 ID입니다.')
    draft=dict(draft,articleId=identifier,savedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    storage=ROOT/'.article-workspace'
    storage.mkdir(parents=True,exist_ok=True)
    if os.name=='nt':
        import ctypes
        attrs=ctypes.windll.kernel32.GetFileAttributesW(str(storage))
        if attrs!=-1:ctypes.windll.kernel32.SetFileAttributesW(str(storage),attrs|2)
    folder=storage/'articles';folder.mkdir(parents=True,exist_ok=True)
    target=folder/(identifier+'.json');temp=folder/(identifier+'.tmp')
    with SAVE_LOCK:
        temp.write_text(json.dumps(draft,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(target)
    return {'saved':True,'articleId':identifier,'fileName':target.name,'folder':'.article-workspace/articles'}

SAVE_LOCK=threading.Lock()
