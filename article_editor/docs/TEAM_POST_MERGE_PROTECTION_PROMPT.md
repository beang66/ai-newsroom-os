# 팀원용: 기사 편집 안정화 변경 보호 프롬프트

아래 내용을 각 담당자의 작업 프롬프트 마지막에 그대로 붙여서 사용한다.

```text
[main 병합 후 기사 편집 안정화 변경 보호]

내 작업을 반영하기 전에 최신 origin/main을 작업 브랜치에 병합하고, main에 들어온 2026-10-19 기사 편집 안정화 변경을 먼저 확인해 줘. 아래 동작은 다른 담당자가 실제 오류를 재현하고 회귀 테스트까지 추가해 고친 것이므로, 내 기능을 합치는 과정에서 이전 코드로 되돌리거나 무력화하면 안 돼.

반드시 유지할 사용자 동작:
1. 기사 미리보기를 보고 작성 화면으로 돌아와도 작성한 본문이 그대로 남아 있어야 한다.
2. AI 부제 추천은 완성형 묶음 1개만 보여야 한다. 각 문장은 실제 줄바꿈으로 구분해야 하며 `첫 문장 / 둘째 문장`처럼 슬래시가 화면에 노출되면 안 된다.
3. 마지막 AI 교열 결과가 부제 길이 제한을 넘더라도, 이미 검증을 통과한 짧은 부제가 있으면 전체 추천을 실패시키지 말고 그 부제를 유지해야 한다.
4. 사진은 기사 맨 위를 포함해 사용자가 표시한 위치로 정확히 이동해야 하고, 이동 뒤 본문이 사라지면 안 된다.
5. 모자이크 도구는 한 번 그린 뒤 자동으로 꺼지지 않고, 사용자가 다른 도구를 선택할 때까지 활성 상태를 유지해야 한다.
6. Unsplash 사진 출처는 `© 작가명 / Unsplash`로 보여야 한다. Unsplash 영문 설명이나 PC 파일명을 사진 설명에 자동으로 넣지 말아야 한다.
7. 보관함에 기사가 하나도 없어도 화면 전체가 비어 버리면 안 된다. 최근 기사 번호·제목·날짜는 왼쪽 정렬이고, 저장된 기사에는 오른쪽 위 휴지통 아이콘이 있어야 한다.

충돌 시 특히 확인할 파일:
- `src/components/ArticleWriter.jsx`
- `src/components/ArchiveView.jsx`
- `src/components/PhotoEditorView.jsx`
- `src/components/photo/ImageEditor.jsx`
- `src/components/PhotoSideDrawer.jsx`
- `src/components/photo/PhotoSearch.jsx`
- `src/services/assistService.js`
- `src/services/photoSearch.js`
- `src/api/editorial.js`
- `src/lib/subtitleCandidates.js`
- `src/lib/photoMarks.js`
- `src/workspace.css`
- `article_editor/app/core/ai/router.py`
- `article_editor/app/core/ai/subtitle_editorial.py`

보호 방법:
- 충돌이 나면 내 브랜치 파일을 통째로 선택하지 말고, main의 위 동작과 내 기능을 모두 유지할 수 있는지 코드 단위로 비교해 줘.
- 함께 유지할 방법이 불분명하면 자동 해결하지 말고 충돌 부분과 두 기능의 의도를 보여주고 물어봐.
- `article_editor/app/frontend/**`는 손으로 합치지 말고 루트 `src/**`를 해결한 뒤 저장소 루트에서 `npm run build`로 다시 생성해 줘.
- 기존 회귀 테스트를 삭제하거나 기대값을 약하게 바꿔서 통과시키지 마.

최소 회귀 확인:
- `npm run lint`
- `npm test`
- `npm run build`
- `npm --prefix article_editor run test:ui:mine`
- Python 부제 코드를 건드렸다면 `article_editor` 기준으로 `python -m unittest discover -s dev/tests -p "test_subtitle_style.py"`

검증 결과는 비개발자도 이해할 수 있게 먼저 사용자 현상을 쓰고, 기술 설명은 뒤에 괄호로 덧붙여 줘. 예:
`현상: 미리보기를 닫고 돌아오면 작성한 기사 본문이 사라짐 (작성 화면 재생성 시 편집 영역 DOM 동기화 누락)`

테스트 결과는 다음 형식으로 공유해 줘:
`[TEST] 항목명 | PASS/FAIL/BLOCKED | P0/P1/P2/P3`
`현상:`
`재현:`
`기대:`
`환경:`
```
