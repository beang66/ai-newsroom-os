# dev/spikes/ipc_transport — IPC 전환 실측

출시를 IPC(무포트)로 바꿀 때 **무엇이 되고 무엇이 안 되는지**를 재는 스파이크입니다.
앱 코드는 건드리지 않고, 창을 띄워 아래를 측정합니다.

```
python dev/spikes/ipc_transport/spike.py --mode http     # 기준(지금 방식: HTTP + http origin)
python dev/spikes/ipc_transport/spike.py --mode file     # file:// 로 로컬 파일 직접 로드
python dev/spikes/ipc_transport/spike.py --mode html     # HTML 문자열로 로드(무파일)
python dev/spikes/ipc_transport/spike.py --mode bridge   # 브리지 왕복·15MB·UI 멈춤
python dev/spikes/ipc_transport/spike.py --mode backend  # 외부 백엔드(교차 출처) 연결
```

측정 항목

| 항목 | 왜 보는가 |
|---|---|
| `env.origin` | 로드 모드별 origin (`http://127.0.0.1:<port>` vs `null`) — IndexedDB·CORS의 기준 |
| `idb` | IndexedDB 열기/쓰기/읽기 성공 여부 (임시저장의 생존 조건) |
| `env.componentUpgraded` | ES 모듈이 실제로 로드됐는지 (무포트 로드에서 가장 먼저 깨지는 지점) |
| `core` | 로컬 코어 호출 성공 여부/상태 (무포트 로드에서 Origin 검사에 걸리는지) |
| `backend` | 외부 백엔드로의 교차 출처 호출 + `Authorization` 헤더 통과 여부 |
| `bridgeSmall/Up/Down` | 브리지 왕복 지연, 15MB base64 상·하행 시간 |
| `uiDuring5sPython` | 파이썬이 5초 걸리는 동안 UI 타이머(16ms)가 계속 도는지(렌더 멈춤 여부) |
| `backendOriginsSeen` | 브라우저가 실제로 보낸 Origin 값 목록 |

결과 해석과 결정은 `../../docs/IPC_MIGRATION.md` §측정에 기록합니다.
