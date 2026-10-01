import os, json, urllib.request, urllib.parse, urllib.error

from ..errors import RequestError
def unsplash_get(path):
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
    unsplash_get(location)
    return photo
