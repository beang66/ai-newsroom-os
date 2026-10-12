"""동아일보 DB 사진 — 동아디지털아카이브 '포토파노라마'(https://www.donga.com/archive/newslibrary/list?m=photo).

- 목록은 HTML 이다(검색 API 없음). 한 쪽에 20장, `p=1, 21, 41 …` 로 넘긴다. 전체 수백 장 규모라
  처음 한 번 모든 쪽을 읽어 메모리에 두고(6시간), 검색어 거르기·정렬(전체/최신순/오래된순)·쪽 나누기는 코어에서 한다.
- 사진 바이트는 목록에 나온 주소(dimg.donga.com)만 받아 온다 — 화면이 임의 주소를 넘길 수 없다.
"""
from __future__ import annotations

import html
import re
import threading
import time
import urllib.parse
import urllib.request

from ..errors import RequestError

LIST_URL = 'https://www.donga.com/archive/newslibrary/list'
SOURCE_URL = LIST_URL + '?m=photo'
IMAGE_HOST = 'dimg.donga.com'
PER_PAGE = 3  # Unsplash 와 같이 한 번에 3장, 나머지는 이전·다음으로
SORTS = ('all', 'latest', 'oldest')  # 전체(= 최신순) / 최신순 / 오래된순
MAX_PAGES = 40  # 쪽당 20장 → 800장까지
CACHE_SECONDS = 6 * 3600
_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
_ITEM = re.compile(
    r'<div class="thumb_cont">\s*<a[^>]*data-src="(\d+)"[^>]*>\s*'
    r"<span class='thumb'><img src='([^']+)'[^>]*/?>\s*</span>\s*"
    r'<span class="tit_box">\s*<span class="date">([^<]*)</span>\s*'
    r'<span class="titie">(.*?)</span>\s*<span class="summary">(.*?)</span>', re.S)
_lock = threading.Lock()
_cache = {'at': 0.0, 'photos': []}


def _text(raw):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', raw))).strip()


def parse_list(page_html):
    """목록 HTML → [{id, image, date, year, title, summary}]"""
    out = []
    for pid, image, date, title, summary in _ITEM.findall(page_html):
        image = html.unescape(image)
        if urllib.parse.urlsplit(image).hostname != IMAGE_HOST:
            continue
        date = date.strip()
        # 목록 사진은 1500px 원본이다 — 검색 결과 썸네일은 동아일보 이미지 서버의 400px 축소본(/a/400/0/90/5/…)
        thumb = 'https://' + IMAGE_HOST + '/a/400/0/90/5' + urllib.parse.urlsplit(image).path
        out.append({'id': pid, 'image': image, 'thumb': thumb, 'date': date, 'year': int(date[:4]) if date[:4].isdigit() else None,
                    'title': _text(title), 'summary': _text(summary)})
    return out


def _get(url, limit=3 * 1024 * 1024):
    req = urllib.request.Request(url, headers={'User-Agent': _UA, 'Accept-Language': 'ko-KR,ko;q=0.9'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read(limit + 1), r.headers.get_content_type(), r.url
    except (OSError, ValueError):
        raise RequestError('동아일보 DB 에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 502) from None


def all_photos():
    """포토파노라마 전체(아카이브 기본 순서). 한 번 읽으면 6시간 동안 다시 읽지 않는다."""
    with _lock:
        if _cache['photos'] and time.time() - _cache['at'] < CACHE_SECONDS:
            return _cache['photos']
        photos, seen = [], set()
        for n in range(MAX_PAGES):
            raw, _, _ = _get(LIST_URL + '?' + urllib.parse.urlencode({'p': 1 + 20 * n, 'm': 'photo', 'p0': '', 'sorting': 0}))
            items = [p for p in parse_list(raw.decode('utf-8', 'replace')) if p['id'] not in seen]
            if not items:
                break
            seen.update(p['id'] for p in items)
            photos += items
        if not photos:
            raise RequestError('동아일보 DB 사진 목록을 읽지 못했어요. 잠시 후 다시 시도해 주세요.', 502)
        _cache.update(at=time.time(), photos=photos)
        return photos


def search(query='', sort='all', page=1):
    """검색어(제목·설명에 모두 들어 있는 낱말)로 거르고 sort(all/latest/oldest)로 늘어놓은 결과의 한 쪽(3장)."""
    if sort not in SORTS:
        raise RequestError('정렬은 전체·최신순·오래된순 중에서 골라 주세요.')
    words = [w for w in (query or '').lower().split() if w]
    found = [p for p in all_photos() if all(w in (p['title'] + ' ' + p['summary']).lower() for w in words)]
    # 날짜는 'YYYY.MM.DD' 라 글자 순서 = 날짜 순서. 전체는 최신순으로 보인다(아카이브 기본 순서는 오래된순과 같아서)
    found = sorted(found, key=lambda p: p['date'], reverse=sort != 'oldest')
    total_pages = max(1, -(-len(found) // PER_PAGE))
    page = min(max(1, page), total_pages)
    start = (page - 1) * PER_PAGE
    return {'photos': found[start:start + PER_PAGE], 'page': page, 'totalPages': total_pages, 'total': len(found), 'sort': sort,
            'sourceUrl': SOURCE_URL}


def photo_bytes(photo_id):
    """목록에 있는 사진의 원본 바이트 → (bytes, mime)."""
    if not re.fullmatch(r'\d{1,12}', photo_id or ''):
        raise RequestError('잘못된 사진 ID입니다.')
    photo = next((p for p in all_photos() if p['id'] == photo_id), None)
    if not photo:
        raise RequestError('동아일보 DB 에서 그 사진을 찾지 못했어요.', 404)
    raw, mime, final = _get(photo['image'], limit=15 * 1024 * 1024)
    if urllib.parse.urlsplit(final).hostname != IMAGE_HOST:
        raise RequestError('잘못된 사진 주소입니다.', 502)
    if len(raw) > 15 * 1024 * 1024 or mime not in ('image/jpeg', 'image/png', 'image/webp'):
        raise RequestError('지원하지 않는 사진입니다.', 413)
    return raw, mime
