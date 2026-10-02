"""Start this exact workspace on an unused local port and open its editor."""
from pathlib import Path
import os
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent

def available_port():
    for port in range(8877, 8900):
        try:
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', port))
            return port
        except OSError:
            continue
    raise RuntimeError('8877~8899 포트가 사용 중입니다. 실행 중인 편집기를 닫고 다시 시도해 주세요.')

def start_server(port):
    env = dict(os.environ, PORT=str(port))
    return subprocess.Popen([sys.executable, str(ROOT / 'server.py')], cwd=ROOT, env=env)

def wait_ready(url, process):
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError('서버 실행에 실패했습니다. 이 창의 오류 메시지를 확인해 주세요.')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                page = response.read().decode('utf-8')
            if '<article-workspace' not in page:
                raise RuntimeError('새 편집기 시작 화면을 확인하지 못했습니다.')
            return
        except OSError:
            time.sleep(.1)
    raise RuntimeError('서버를 여는 데 시간이 오래 걸립니다. 다시 실행해 주세요.')

def stop_server(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()

def main():
    port = available_port()
    process = start_server(port)
    url = f'http://127.0.0.1:{port}/index.html'
    try:
        wait_ready(url, process)
        print(f'새 기사 편집기 v14: {url}\n실행 폴더: {ROOT}\n이 창을 열어 둔 채 사용하세요. 종료하려면 Ctrl+C를 누르세요.', flush=True)
        if '--check' in sys.argv:
            if '--window' in sys.argv:
                from desktop import shell
                store = shell.storage_dir()
                store.mkdir(parents=True, exist_ok=True)
                print(f'데스크톱 셸: pywebview={shell.shell_available()}, webview2={shell.webview2_version()}, storage={store}', flush=True)
            print('STARTUP CHECK PASSED', flush=True)
            return
        if '--window' in sys.argv:
            from desktop.shell import run_window
            print('데스크톱 셸(pywebview) 창 모드 — 창을 닫으면 종료됩니다.', flush=True)
            run_window(url, debug='--debug' in sys.argv)
            return
        webbrowser.open(url)
        process.wait()
    except KeyboardInterrupt:
        pass
    finally:
        stop_server(process)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
