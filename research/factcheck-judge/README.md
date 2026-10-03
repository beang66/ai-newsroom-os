# factcheck-judge — 팩트체크 판정 모델 키우기

앱의 판정기(Qwen3-0.6B v10 분류기)를 Qwen3-1.7B~4B 로 키운다. 청킹·임베딩·검색은 충분히 올라왔고
판정이 병목이다(2026-10-03 측정).

## 기준선 — 긴 문서 29건, 같은 검색 근거(Top5)

| 판정기 | 맞힘 | 틀렸는데 '일치' |
|---|---|---|
| Claude | 26/29 | – |
| qwen3:4b-instruct (Ollama Q4, 학습 없음) | 22/29 | – |
| qwen3:4b 생각 모드 (Q4, 생각 2048토큰 제한) | 16/29 (11건 답 못 냄, 답한 18건 중 16) | 2 |
| Kanana 1.5 2.1B (학습 없음) | 17/29 | – |
| **앱 0.6B v10** (입력 192토큰) | **9/29** | 5 |
| 앱 0.6B v10 (입력 512토큰) | 10/29 | 10 |
| q17b-v1 (Qwen3-1.7B LoRA, 데이터 v1) | 13/29 (짧은 18건 14/18, dev 99%) | 4 |

0.6B 는 입력을 늘려도 나아지지 않는다 → 모델 크기 + 데이터 문제.

v1(데이터에 숫자 충돌만) 은 dev 99% 인데 29건 13/29 — 실제 충돌 대부분이 숫자가 아니라 주체·범주·범위·값 맞바꿈이었다
(합병 후 상호, 외부평가 회계법인, 보통/특별결의, 표면/만기이자율, '1학년만'). v2 데이터에 ②~④ 를 넣었다.
생각 모드는 답하면 정확하지만 판정 1건에 약 7분(GTX 1060 3GB, CPU/GPU 분할) — 앱에는 못 쓴다.
옛 학습 데이터(`C:\TEST\experiments\semantic_training`, v6~v14)는 틀 문장 수백 건이라 dev 99% 인데 실제 문서 게이트에서 무너졌다.

## 이번 데이터 — 실제 문서 + 앱과 같은 판정 단위

앱은 주장 하나를 검색 상위 청크와 **하나씩** 판정하고 합친다(`service._judge_qwen_candidates`).
그래서 학습쌍도 `(주장, 근거 청크 1개, 라벨)` 이다. 입력 모양은 `scripts/common.py: render()` = 앱 `_render`.

| 라벨 | 만드는 법 |
|---|---|
| SUPPORTED_LOCAL | 원문 문장 그대로 / Claude 가 바꿔 쓴 문장(`data/paraphrases/*.tsv`) + 그 문장이 든 청크 |
| CONFLICT_LOCAL | 정답 청크 + ① 숫자·날짜·요일 바꿈(SUPPORTED 수의 절반까지만) ② 같은 단위 두 값 맞바꿈 ③ 기관명을 같은 문서의 다른 기관명으로 ④ Claude 가 쓴 의미 충돌(`data/conflicts/*.tsv` — 주체·범주·범위·부정·증감·장소) |
| GAP_LOCAL | 같은 주장 + **앱 검색이 상위로 올린** 다른 청크(어려운 오답). 주장의 숫자가 그 청크에 다 있으면 모호해서 제외 |
| REVIEW_LOCAL / REVIEW_EXTERNAL | 옛 v14 세트에서 추출(`data/legacy_review.jsonl`) — 실제 문서판은 다음 차례 |

- 문서: OpenDART 주요사항보고서 80건 + 보도자료(김포교육·부여군) 표본. 평가 29건·18건의 문서는 제목·본문 겹침으로 제외.
- 분할: **문서 단위**(sha1(doc_id) 80/10/10). test 는 `data/sealed/` 에만 두고 커밋하지 않는다.

| 파일 | 내용 |
|---|---|
| `data/seeds.jsonl` | 사실 문장 + 정답 청크 + 검색 오답 청크 (train·dev) |
| `data/paraphrases/*.tsv` | seed 를 Claude 가 바꿔 쓴 문장 (`sid<TAB>문장`, 근거 청크에 있는 사실만) |
| `data/train.jsonl`, `data/dev.jsonl` | 학습쌍 `{claim, evidence, label, origin, ...}` |
| `data/eval_long29.jsonl`, `data/eval_short18.jsonl` | 주장 단위 평가(검색 근거 Top5 + 정답) |

데이터를 다시 만들 때(이 PC — 앱 코어와 `C:\TEST` 문서가 필요):

```bash
python research/factcheck-judge/scripts/build_seeds.py --exclude <평가 문서 json>...
python research/factcheck-judge/scripts/extract_legacy_review.py
python research/factcheck-judge/scripts/build_pairs.py
```

## 학습 PC (RTX 4060 Ti 8GB) 에서

```bash
git clone https://github.com/beang66/ai-newsroom-os.git
cd ai-newsroom-os
git checkout feature/app-core
python -m venv .venv-judge
.venv-judge\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cu128
pip install -r research/factcheck-judge/requirements.txt
```

베이스 모델은 Hugging Face 에서 처음 실행할 때 내려받는다(1.7B ≈ 3.4GB, 4B ≈ 8GB).

```bash
cd research/factcheck-judge/scripts
# 1) Qwen3-1.7B, bf16 LoRA — 먼저 이것
python train.py --base Qwen/Qwen3-1.7B --name q17b-v1
python evaluate.py --base Qwen/Qwen3-1.7B --adapter ../runs/q17b-v1/adapter
# 2) Qwen3-4B, 4bit QLoRA
python train.py --base Qwen/Qwen3-4B --qlora --name q4b-v1
python evaluate.py --base Qwen/Qwen3-4B --qlora --adapter ../runs/q4b-v1/adapter
```

- 중간에 멈추면(GPU 오류·전원) 같은 명령에 `--resume` 을 붙이면 마지막 에포크 체크포인트부터 이어서 학습한다.
  체크포인트 폴더(`runs/<name>/checkpoints/checkpoint-N`)에도 어댑터가 있어 `evaluate.py --adapter` 로 바로 평가할 수 있다.
- 메모리가 모자라면(`CUDA out of memory`) `--batch 2 --accum 8`, 그래도 모자라면 `--maxlen 384`.
- 결과: `runs/<name>/metrics.json`(dev), `runs/<name>/eval.json`(주장 단위 29·18건). `runs/` 는 커밋되지 않으니
  어댑터 폴더(`runs/<name>/adapter`, 수십 MB)와 두 json 을 이 PC 로 옮겨 오면 봉인 test 평가와 앱 연결을 한다.

## 볼 지표

1. `eval_long29.correct` — 기준선 0.6B 9/29, 목표는 4B 무학습(22) 이상, Claude(26)에 근접
2. `unsafe_false_supported` — 근거가 없거나 어긋나는데 '일치'. 기자에게 가장 위험한 오류라 0 에 가깝게
3. `escalated` — 외부 판정으로 넘긴 수. 많으면 안전하지만 로컬 처리율이 떨어진다

## 앱용 변환·속도 (2026-10-04, 이 PC: i7-6700 4코어, q17b-v2)

봉인 test 770쌍: 정확도 95.3%(dev 95.1%), 근거 없이 '일치' 7 — 처음 보는 문서에도 같은 수준. 29·18건 결과는 GPU 와 동일.

| 실행 방식 | 근거 1개 판정 | float32 와 같은 판정 |
|---|---|---|
| PyTorch float32 (배치 8) | 약 6초 | – |
| **ONNX float32** (`export_onnx.py`) | **3.7초** | 16/16 |
| ONNX 동적 int8 / 행렬곱 int8 | 2.4초 | 4/16 · 0/48 (망가짐) |
| ONNX 가중치 8비트 (±accuracy_level=4) | 8.0초 | 48/48 |
| ONNX 가중치 4비트 | 4.4초 | 46/48 |

이 CPU(AVX-512 VNNI 없음)에서는 양자화로 빨라지지 않는다. 판정 횟수를 줄이는 쪽이 효과가 컸다(`bench_judge.py`, float32 ONNX):

| 방식 | 29건 | 주장당 | 18건 | 주장당 |
|---|---|---|---|---|
| 근거 5개 하나씩(현재 앱) | 17 | 23.4초 | 14 | 11.4초 |
| 근거 5개 묶어서 | 17 | 30.0초 | 14 | 16.9초 |
| 근거 3개 하나씩 | 16 | 14.6초 | 15 | 6.9초 |
| **근거 5개 + 조기 종료** | **21** | **11.9초** | **15** | **4.0초** |
| 근거 3개 + 조기 종료 | 19 | 9.5초 | 15 | 3.5초 |

조기 종료 = 검색 순위대로 판정하다 확신 있는 일치/충돌이 나오면 멈춤. 정확도까지 오른 이유: 낮은 순위의 엉뚱한 근거가
'지지+충돌 → 외부' 규칙을 일으키지 않는다. 남은 확인: 조기 종료에서 근거 없이 '일치'가 늘지 않는지(봉인 test).

## 앱에 넣을 때(통과 후, 이 PC)

봉인 test 평가 → 어댑터를 `article_editor/models/` 로 → 모델 매니페스트 항목 추가 →
`semantic_provider.py` 의 베이스 경로·입력 길이(현재 192)를 새 모델에 맞춤 → `npm run test:python`.
