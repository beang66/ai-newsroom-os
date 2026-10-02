"""데스크톱 셸(pywebview) 검증 스파이크.

실제 창을 띄운 뒤 항목별로 자동 확인하고 결과를 JSON으로 남긴다.

    python desktop/smoke.py --mode write      # IndexedDB 에 표식 기록
    python desktop/smoke.py --mode read       # 이전 실행 표식이 남아 있는지 확인(영속성)
    AINewsroom-debug.exe --smoke write        # 배포 exe 로 같은 검증(packaging/)

자동 확인
  1) 창 부팅: 커스텀 엘리먼트 승격 + Shadow DOM 렌더
  2) 코어 연결: GET /api/status (기존 HTTP 계약 그대로)
  3) IndexedDB 쓰기 / 재시작 후 영속
  4) 클립보드 API 가용
  5) WebView 엔진이 DataTransfer + File 을 DOM 리스너까지 전달하는지(합성 이벤트)

사람이 직접 확인해야 하는 항목(자동화 불가)
  - 실제 OS 파일 드래그&드롭, <a download> 저장 대화상자, 인쇄 대화상자
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent.parent
if not getattr(sys, 'frozen', False) and str(_APP_DIR) not in sys.path:
    sys.path.insert(0, str(_APP_DIR))

from app_paths import WORKSPACE  # noqa: E402
from desktop import runtime  # noqa: E402
from desktop import shell  # noqa: E402

RESULT_PATH = WORKSPACE / 'desktop-shell-smoke.json'

BOOT_JS = """JSON.stringify((() => {
  const root = document.getElementById('root');
  return {
    state: document.readyState,
    reactRoot: !!root,
    mounted: !!(root && root.childElementCount > 0),
    idb: typeof indexedDB !== 'undefined',
    clipboard: !!(navigator.clipboard && navigator.clipboard.writeText),
    userAgent: navigator.userAgent,
  };
})())"""

STATUS_JS = """JSON.stringify((() => {
  const s = (window.__smoke = window.__smoke || {});
  if (s.status === undefined) {
    s.status = 'pending';
    fetch('/api/status').then((r) => r.json())
      .then((d) => { s.status = d; })
      .catch((e) => { s.status = 'error:' + e; });
  }
  return s.status;
})())"""

IDB_WRITE_JS = """JSON.stringify((() => {
  const s = (window.__smoke = window.__smoke || {});
  if (s.write !== undefined) return s.write;
  s.write = 'pending';
  const r = indexedDB.open('desktop-shell-smoke', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('marker');
  r.onsuccess = () => {
    const db = r.result;
    const tx = db.transaction('marker', 'readwrite');
    tx.objectStore('marker').put(new Date().toISOString(), 'last-write');
    tx.oncomplete = () => { db.close(); s.write = 'ok'; };
    tx.onerror = () => { s.write = 'error:' + tx.error; };
  };
  r.onerror = () => { s.write = 'error:' + r.error; };
  return s.write;
})())"""

IDB_READ_JS = """JSON.stringify((() => {
  const s = (window.__smoke = window.__smoke || {});
  if (s.read !== undefined) return s.read;
  s.read = 'pending';
  const r = indexedDB.open('desktop-shell-smoke', 1);
  r.onsuccess = () => {
    const db = r.result;
    const q = db.transaction('marker', 'readonly').objectStore('marker').get('last-write');
    q.onsuccess = () => { db.close(); s.read = q.result === undefined ? 'missing' : q.result; };
    q.onerror = () => { s.read = 'error:' + q.error; };
  };
  r.onerror = () => { s.read = 'error:' + r.error; };
  return s.read;
})())"""

DROP_JS = """JSON.stringify((() => {
  // 새 React 앱에는 드롭 전용 호스트 엘리먼트가 없다 → 창(웹뷰)이 드롭을 전달하는지 자체를 본다.
  const host = document.body;
  if (!host) return { delivered: false, reason: 'no-host' };
  let flag = 'none';
  host.addEventListener('drop', () => { flag = 'received'; }, { capture: true, once: true });
  let files = -1;
  try {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'smoke.png', { type: 'image/png' }));
    files = dt.files.length;
    host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  } catch (e) {
    return { delivered: false, reason: String(e) };
  }
  return { delivered: flag === 'received', files };
})())"""


def parse(raw):
    """pywebview evaluate_js 는 JSON 텍스트를 문자열로 그대로 돌려준다. 여기서 해석한다."""
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return raw
    return raw


def safe_eval(window, script):
    try:
        return parse(window.evaluate_js(script))
    except Exception:
        return None


def wait_value(window, script, seconds):
    """evaluate_js 값이 'pending' 이 아닐 때까지 폴링."""
    deadline = time.time() + seconds
    value = 'pending'
    while time.time() < deadline:
        current = safe_eval(window, script)
        if current is not None:
            value = current
        if value != 'pending':
            return value
        time.sleep(0.2)
    return value


def destroy(window):
    try:
        window.destroy()
    except Exception:
        pass


def runner(window, mode, checks, timeout):
    watchdog = threading.Timer(timeout, lambda: destroy(window))
    watchdog.start()
    try:
        try:
            window.events.loaded.wait(25)
        except Exception:
            pass

        boot = None
        deadline = time.time() + 25
        while time.time() < deadline:
            boot = safe_eval(window, BOOT_JS)
            if isinstance(boot, dict) and boot.get('reactRoot') and boot.get('mounted'):
                break
            time.sleep(0.25)

        ok_boot = isinstance(boot, dict) and bool(boot.get('reactRoot')) and bool(boot.get('mounted'))
        checks.append(('창 부팅: React 마운트(#root 에 자식 노드)', ok_boot, boot))
        if isinstance(boot, dict):
            checks.append(('IndexedDB API 가용', bool(boot.get('idb')), boot.get('idb')))
            checks.append(('클립보드 API 가용', bool(boot.get('clipboard')), boot.get('clipboard')))
            checks.append(('WebView 엔진', True, boot.get('userAgent')))

        status = wait_value(window, STATUS_JS, 20)
        checks.append(('코어 연결: GET /api/status', isinstance(status, dict), status))

        if mode == 'write':
            written = wait_value(window, IDB_WRITE_JS, 15)
            checks.append(('IndexedDB 쓰기', written == 'ok', written))
        else:
            stored = wait_value(window, IDB_READ_JS, 15)
            ok = isinstance(stored, str) and stored != 'missing' and not stored.startswith('error:')
            checks.append(('IndexedDB 영속: 이전 실행 값 유지', ok, stored))

        drop = safe_eval(window, DROP_JS)
        checks.append(
            ('DataTransfer + File 전달(합성 이벤트)', bool(isinstance(drop, dict) and drop.get('delivered')), drop)
        )
    finally:
        watchdog.cancel()
        destroy(window)


def run(mode='write', timeout=45.0, debug=False):
    """창을 띄워 항목별로 확인하고 종료 코드를 돌려준다.

    배포 exe(`AINewsroom-debug.exe --smoke write`)도 이 함수를 그대로 쓴다.
    """
    try:
        import webview
    except ImportError:
        print('pywebview 미설치: pip install pywebview', file=sys.stderr)
        return 2

    server = runtime.start_server()
    url = server.url
    checks = []
    store = shell.storage_dir()
    try:
        runtime.wait_ready(url, server)
        store.mkdir(parents=True, exist_ok=True)
        window = webview.create_window('shell-smoke', url, width=1100, height=820, min_size=(900, 600))
        webview.start(
            runner,
            args=(window, mode, checks, timeout),
            private_mode=False,
            storage_path=str(store),
            debug=debug,
        )
    except Exception as error:
        print(f'셸 실행 실패: {error}', file=sys.stderr)
        return 3
    finally:
        server.stop()

    print(f'storage_path = {store}')
    print(f'webview2     = {shell.webview2_version()}')
    passed = 0
    for name, ok, detail in checks:
        passed += 1 if ok else 0
        print(f"{'PASS' if ok else 'FAIL'}  {name}  {json.dumps(detail, ensure_ascii=False)}")
    print(f'--- {passed}/{len(checks)} passed (mode={mode}) ---')

    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(
        json.dumps(
            {
                'mode': mode,
                'storage_path': str(store),
                'webview2': shell.webview2_version(),
                'checks': [{'item': name, 'ok': ok, 'detail': detail} for name, ok, detail in checks],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding='utf-8',
    )
    return 0 if checks and passed == len(checks) else 1


def main():
    parser = argparse.ArgumentParser(description='데스크톱 셸 검증 스파이크')
    parser.add_argument('--mode', choices=('write', 'read'), default='write')
    parser.add_argument('--timeout', type=float, default=45)
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args()
    return run(mode=args.mode, timeout=args.timeout, debug=args.debug)


if __name__ == '__main__':
    sys.exit(main())


