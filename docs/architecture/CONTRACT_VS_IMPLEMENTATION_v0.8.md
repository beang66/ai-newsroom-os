# 계약 문서와 구현의 호출 이름 통일 (2026-10-12)

기준: `OPENAPI_v0.8.yaml`(operationId) ↔ `src/api/core-api.js`(화면이 부르는 이름) ↔ 코어 HTTP 경로(`api.py`).
원칙: 문서·구현 중 **바꾸는 비용이 작고 이름이 직관적인 쪽**을 골랐다. HTTP 경로는 결정 d2대로 `/api/*`를 유지하고 어댑터가 차이를 흡수한다.

| 계약 operationId | 현재 호출 이름 | 코어 경로 | 어느 쪽을 바꿨나 |
|---|---|---|---|
| getArticle | getArticle | `GET /api/articles/<id>` | 같음 |
| saveArticle | saveArticle | `POST /api/articles/save` | 같음(본문 `{draft, expectedRevisionNo}`) |
| createSnapshot | createSnapshot | `POST /api/articles/<id>/snapshots` | 같음 |
| createSource | createSource | `POST /api/materials/extract` | **구현 변경** (`extractText`→) |
| runFactcheck | runFactcheck | `POST /api/factcheck/run` (동기) | **구현 변경** (`factcheckRun`→, 동사 먼저) · **문서 변경** (`verifySnapshot`→) |
| getKnowledgeMap | getKnowledgeMap | `GET /api/knowledge-map` | **구현 변경** (`knowledgeMap`→) |
| generatePlatform | generatePlatform | `POST /api/platform/generate` | **문서 변경** (`createPlatformOutput`→) |
| transcribe | transcribe | `POST /api/interview/transcribe` (동기) | **문서 변경** (`transcribeMedia`→) |
| getTranscript | getTranscript | `GET /api/transcripts/<id>` | 같음 |
| registerMediaAsset | registerMediaAsset | `POST /api/media-assets` | 같음 |
| getMediaAsset | getMediaAsset | `GET /api/media-assets/<id>` | **구현 추가** |
| getJob | getJob | `GET /api/jobs/<id>` | **구현 추가** |
| cancelJob | cancelJob | `POST /api/jobs/<id>/cancel` | **구현 추가** |
| searchEvidence · getVerificationRun · listPlatformOutputs · getPlatformOutput | 없음 | 없음 | 문서에 `x-status: deferred` 표시(필요해지면 구현) |

## 계약에 없지만 구현에 있는 호출 (추가분)
`getSource`, `deleteSource(id, {force})`, `listSnapshots`, `getSnapshot` (이번에 추가), 그 밖에 상태·로그인(`status`, `session`, `signIn`, `signOut`, `setAutoLogin`), 모델(`models`, `installModels`, `cancelModelInstall`), 보조(`assist`, `semanticParse`), 팩트체크(`factcheckStatus`, `factcheckExternal`), 자료(`listSources`, `openSource`, `sourceBytes`, `importKnowledgeFiles`, `getKnowledgeFile`, `deleteKnowledgeFile`), 기사(`latestArticle`, `listArticles`, `listRevisions`, `getRevision`, `restoreRevision`), 사진(`searchPhotos`, `photoBytes`, `mediaBytes`, `trackPhoto`), 플랫폼(`platformKeywords`, `renderPlatformCard`), 백업(`exportVault`, `restoreVault`), 녹취(`listTranscripts`, `transcriptAudio`), 발행(`publishCms`). 계약 문서에 올릴지는 필요할 때 결정한다.
