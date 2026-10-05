# 라이선스·출처 표기 메모 (factcheck-judge, 2026-10-05)

외부 배포(다른 회사·고객) 전에 이 목록을 법무 검토에 넘긴다. 내부 연구·학습·사내 배포는 출처 표기 기록으로 충분하다고 판단했다.

## 학습·평가 데이터

### KLUE-NLI — CC BY-SA 4.0
- 출처: Park et al., "KLUE: Korean Language Understanding Evaluation", 2021 (arXiv:2105.09680) · github.com/KLUE-benchmark/KLUE
  (주최 Upstage, 공동주최 NAVER AI Lab·NYU·KAIST). 라이선스 https://creativecommons.org/licenses/by-sa/4.0/
- 쓴 것: 학습 세트 중 뉴스·정책·위키 출처 3,000쌍(학습 2,700 `data/klue_train.jsonl`, dev 300 `data/klue_dev.jsonl`),
  검증 세트 1,800쌍(평가 전용, `eval_external.py`).
- 변경: 함의/중립/모순 → SUPPORTED_LOCAL/GAP_LOCAL/CONFLICT_LOCAL 로 라벨 이름 변경, 필드 이름 변경.
- **`data/klue_*.jsonl` 은 CC BY-SA 4.0** — 재배포 시 같은 라이선스·출처 표기. 다른 데이터와 섞지 않는다(동일조건이 번지지 않게).
- 원문(전제 문장) 라이선스: 위키백과 CC BY-SA 3.0, 위키뉴스 CC BY 2.5, 위키트리 CC BY-SA 2.0, 정책브리핑 공공누리 1유형.
- 미정 쟁점: 학습한 모델을 **외부에 배포**할 때 모델이 2차적 저작물인지(그렇다면 CC BY-SA 공개 필요). KLUE 논문은
  상업·파생·재배포를 "any purpose" 로 허용하고 학습 자체는 의도된 용도. 업계 관행은 가중치를 2차적 저작물로 보지 않음.
- 표기 문구 예: `This product uses KLUE-NLI (Park et al., 2021), licensed under CC BY-SA 4.0.`

### 정책브리핑 「사실은 이렇습니다」 팩트체크 데이터 — 공공누리 1유형 + CC BY 4.0
- 원문: 대한민국 정책브리핑(korea.kr) 「사실은 이렇습니다」, 공공누리 제1유형(출처표시).
- 정리·주석: github.com/chelsseeey/korean-factcheck-dataset — 주석 CC BY 4.0(코드 MIT, 우리는 코드 미사용·미실행).
- 쓴 것: 해명자료 절반 → `data/train.jsonl`·`dev.jsonl`(origin `policy/*`), 나머지 절반 → 평가 전용(`policy_heldout`).
- 표기 문구 예: `출처: 대한민국 정책브리핑(www.korea.kr) 「사실은 이렇습니다」, 공공누리 제1유형 / 주석: korean-factcheck-dataset (CC BY 4.0)`

### 우리가 만든 데이터의 원문
- OpenDART 공시 문서(금융감독원 전자공시) — OpenDART 이용약관 따름. **확인 필요**: 공시 원문 일부를 학습 데이터로 재배포해도 되는지.
- 지자체·교육청 보도자료(김포·의정부·양평 교육지원청, 부여군) — 대부분 공공누리 표기. **확인 필요**: 기관별 공공누리 유형(1유형 외면 상업 이용 제한).
- 바꿔 쓴 문장·충돌·중립·일반화 문장(`data/paraphrases`, `conflicts`, `gaps`, `general`) — Claude 작성.
- 옛 v14 REVIEW 문장(`data/legacy_review.jsonl`) — 내부 제작(C:\TEST).

## 모델
| 모델 | 용도 | 라이선스 |
|---|---|---|
| Qwen3-0.6B / 1.7B / 4B | 판정기 베이스 | Apache-2.0 |
| Qwen3-Embedding-0.6B | 근거 검색 임베딩 | Apache-2.0 |
| klue/roberta-base | 청킹 경계 모델(boundary-roberta-base-v3) 베이스 | **확인 필요** — Hugging Face 모델 카드에 라이선스 표기 없음, KLUE 저장소는 CC BY-SA 4.0 |
| KeT5(onebeans) · KoBART(gogamza) | 제목·부제 | **확인 필요**(docs/LOCAL_MODELS.md 와 동일) |

참고: klue-benchmark.com 은 현재 무관한 사이트로 넘어감 — 문의는 GitHub 저장소·논문 저자로.
