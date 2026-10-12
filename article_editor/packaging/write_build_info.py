"""빌드 정보(커밋·시각)를 app/build_info.json 에 쓴다. 진단 정보 복사(설정)에서 앱 버전으로 보여 준다. git 이 없으면 'unknown'."""
import datetime
import json
import subprocess
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / 'app'


def main():
    try:
        commit = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True, timeout=10,
                                cwd=APP).stdout.strip() or 'unknown'
        dirty = bool(subprocess.run(['git', 'status', '--porcelain', '--untracked-files=no', '--', '.'], capture_output=True, text=True,
                                    timeout=10, cwd=APP).stdout.strip())
    except (OSError, subprocess.SubprocessError):
        commit, dirty = 'unknown', False
    info = {'commit': commit + ('+수정됨' if dirty else ''), 'builtAt': datetime.datetime.now().astimezone().isoformat(timespec='seconds')}
    (APP / 'build_info.json').write_text(json.dumps(info, ensure_ascii=False), encoding='utf-8')
    print('build_info:', info)


if __name__ == '__main__':
    main()
