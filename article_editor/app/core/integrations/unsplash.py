"""Unsplash 어댑터 — `AI_BACKEND` 에 따라 직접 호출(local) 또는 백엔드 프록시(remote).

키(`UNSPLASH_ACCESS_KEY`)는 local 경로에서만 읽는다(개발 전용).
remote 경로는 앱에 키가 없고, 백엔드가 대신 호출한다.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from .. import backend_proxy
from ..errors import RequestError


def unsplash_get(path):
    if backend_proxy.enabled():
        if path.startswith('https://'):
            return backend_proxy.get('/unsplash/absolute', {'url': path})
        return backend_proxy.get('/unsplash' + path)

    key=os.environ.get('UNSPLASH_ACCESS_KEY','')
    if not key:raise RequestError('사진 검색을 사용하려면 .env에 UNSPLASH_ACCESS_KEY를 넣어 주세요.',503)
    if path.startswith('https://'):
        parts=urllib.parse.urlsplit(path)
        if parts.hostname!='api.unsplash.com':raise RequestError('잘못된 사진 요청입니다.')
        url=path
    else:url='https://api.unsplash.com'+path
    req=urllib.request.Request(url,headers={'Authorization':'Client-ID '+key,'Accept-Version':'v1','User-Agent':'ArticleWorkspace/3.0'})
    try:
        with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
    except urllib.error.HTTPError as e:
        raise RequestError({401:'Unsplash Access Key를 확인해 주세요.',403:'Unsplash 사진 요청 권한이나 사용 한도를 확인해 주세요.',429:'사진 검색 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'}.get(e.code,'사진 검색을 완료하지 못했어요.'),502) from None
    except (OSError,ValueError):raise RequestError('사진 검색 서버에 연결하지 못했어요.',502) from None

def selected_unsplash(photo_id):
    photo=unsplash_get('/photos/'+photo_id)
    location=photo.get('links',{}).get('download_location','')
    if not location:raise RequestError('사진 다운로드 정보를 확인하지 못했어요.',502)
    try:
        unsplash_get(location)  # 다운로드 집계(Unsplash 가이드라인). 실패해도 사진 넣기는 막지 않는다
    except RequestError:
        pass
    return photo
