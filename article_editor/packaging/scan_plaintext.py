"""프로필 폴더에서 표식 문장이 평문으로 남아 있는지 검사한다(UTF-8·UTF-16LE).
    python scan_plaintext.py <프로필 폴더> <표식> [<표식> ...]
저장소(vault*.db)에 있으면 실패(암호화 안 됨). 웹뷰 저장소(IndexedDB 등)에 있으면 경고(저장 전 임시 백업 — 저장이 끝나면 지워지지만
LevelDB 는 정리 전까지 흔적이 남을 수 있다). 그 밖의 파일에 있으면 실패. 종료 코드 0 = 실패 없음.
"""
import sys
from pathlib import Path


def hits(path, needles):
    try:
        data = path.read_bytes()
    except OSError:
        return []
    return [n for n in needles if n[0] in data or n[1] in data]


def main(argv):
    sys.stdout.reconfigure(errors='replace')  # 콘솔 인코딩이 한글을 못 쓰는 경우에도 멈추지 않는다
    if len(argv) < 3:
        print(__doc__)
        return 2
    root, markers = Path(argv[1]), argv[2:]
    needles = [(m.encode('utf-8'), m.encode('utf-16-le')) for m in markers]
    fail, warn, scanned = [], [], 0
    for path in sorted(p for p in root.rglob('*') if p.is_file()):
        scanned += 1
        if not hits(path, needles):
            continue
        rel = path.relative_to(root).as_posix()
        (warn if 'webview' in path.relative_to(root).parts else fail).append(rel)
    print(f'검사한 파일 {scanned}개 / 표식 {len(markers)}개')
    for rel in fail:
        print('실패(평문):', rel)
    for rel in warn:
        print('경고(웹뷰 저장소):', rel)
    vaults = [p.name for p in root.rglob('vault*.db')]
    print('저장소 파일:', vaults or '없음')
    print('결과:', '평문 잔여물 없음(웹뷰 경고 제외)' if not fail else '평문 잔여물 발견')
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
