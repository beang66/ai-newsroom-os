"""팩트체크 임베딩 모델(Qwen3-Embedding-0.6B) → ONNX 변환 + torch 와의 동일성 확인 (개발 도구).

KEEP — 삭제 금지: 로컬 임베딩은 2026-10-08부터 '잠정 폐기'(기본은 원격 /ai/embeddings)일 뿐 코드는 일부러 남겨 둔 것이다.
용도: 로컬 임베딩 모델(ONNX)을 다시 만들거나 갱신할 때 쓰는 유일한 도구.
지금 이 코드를 부르는 곳이 없어 보여도(정적 분석·미사용 검사에 걸려도) 지우지 말 것. 되살리려면 FACTCHECK_EMBEDDING_RUNTIME=onnx 로 명시한다.

EXE 에는 torch/transformers 가 없으므로, 앱 런타임은 이 ONNX 를 onnxruntime + tokenizers 만으로 돌린다
(`app/core/ai/factcheck/onnx_embedding.py`). 변환은 torch·transformers·onnx 가 있는 개발 환경에서만 한다:

    set PYTHONPATH=C:\\ai-newsroom-os\\appCoreTest\\conv_deps      (onnx, onnxscript 가 있는 곳)
    python dev/tools/convert_qwen_embedding_onnx.py --out temp/embedding-onnx

그래프는 `QwenEncoder.encode` 와 똑같이 **마지막 토큰(왼쪽 패딩) 은닉 상태 → float32 → L2 정규화** 까지 포함한다.
입력 input_ids·attention_mask (batch, seq) → 출력 embedding (batch, 1024). 결과 폴더:

    embedding-qwen3-0.6b-onnx/  embedding.onnx (+ embedding.onnx.data), tokenizer.json, embedding.json
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

DEFAULT_SOURCE = Path(os.environ.get('ARCHIVE_EMBEDDING_MODEL_PATH') or Path(os.environ.get('LOCALAPPDATA', '.')) / 'AI Newsroom' / 'models' / 'embedding-qwen3-0.6b')
TOOL_VERSION = 'qwen-embedding-onnx-v2'
SOURCE_REVISION = '97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3'
TASK = 'Given a web search query, retrieve relevant passages that answer the query'
OPSET = 17
SAMPLES = ['서울시는 공공자전거 대여소를 늘리고 이용 현황을 공개했다.', '한국은행은 기준금리를 연 3.5%로 동결했다고 밝혔다.',
           'Instruct: Given a claim, retrieve the passage that supports or contradicts it\nQuery:물류창고 등록 시 화재안전계획서 제출 의무']


def build(source, out):
    import numpy as np
    import torch
    from transformers import AutoModel, AutoTokenizer

    out.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(source, padding_side='left', local_files_only=True)
    model = AutoModel.from_pretrained(source, local_files_only=True, dtype=torch.float32).eval()

    class Embedder(torch.nn.Module):
        def __init__(self, base):
            super().__init__()
            self.base = base

        def forward(self, input_ids, attention_mask):
            hidden = self.base(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            return torch.nn.functional.normalize(hidden[:, -1].float(), p=2, dim=1)

    wrapper = Embedder(model).eval()
    batch = tokenizer(SAMPLES, padding=True, truncation=True, max_length=8192, return_tensors='pt')
    target = out / 'embedding.onnx'
    started = time.time()
    with torch.inference_mode():
        reference = wrapper(batch['input_ids'], batch['attention_mask']).numpy()
        torch.onnx.export(
            wrapper, (batch['input_ids'], batch['attention_mask']), str(target),
            input_names=['input_ids', 'attention_mask'], output_names=['embedding'],
            dynamic_axes={'input_ids': {0: 'batch', 1: 'seq'}, 'attention_mask': {0: 'batch', 1: 'seq'}, 'embedding': {0: 'batch'}},
            opset_version=OPSET, dynamo=False, do_constant_folding=True)
    print('exported in %.0fs' % (time.time() - started))
    _externalize(target)
    tokenizer.save_pretrained(out)  # tokenizer.json 포함
    meta = {'tool': TOOL_VERSION, 'source': str(source.name), 'source_model': 'Qwen/Qwen3-Embedding-0.6B', 'opset': OPSET, 'dtype': 'float32',
            'dimension': int(reference.shape[1]), 'pooling': 'last_token', 'padding_side': 'left', 'normalize': 'l2', 'max_length': 8192,
            'source_revision': SOURCE_REVISION, 'pad_token_id': tokenizer.pad_token_id,
            'query_format': 'Instruct: {instruction}\nQuery:{text}', 'instruction': TASK,
            'inputs': ['input_ids', 'attention_mask'], 'output': 'embedding'}
    (out / 'embedding.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    # tokenizer 부속 파일 중 런타임이 쓰지 않는 것은 지운다(tokenizer.json 만 쓴다)
    for name in ('vocab.json', 'merges.txt', 'tokenizer_config.json', 'special_tokens_map.json', 'added_tokens.json', 'chat_template.jinja'):
        (out / name).unlink(missing_ok=True)
    return reference, batch


def _externalize(target):
    """가중치를 embedding.onnx.data 한 파일로 모은다. 2GB 가 넘는 모델은 내보내기가 텐서마다 파일을 만들기 때문에(수백 개),
    다시 읽어서 한 파일로 저장하고 낱개 파일을 지운다."""
    import onnx
    folder = target.parent
    header = onnx.load(str(target), load_external_data=False)
    locations = {entry.value for tensor in header.graph.initializer
                 for entry in tensor.external_data if entry.key == 'location'}
    destination = target.name + '.data'
    if locations == {destination}:
        return  # Already externalized by the exporter; do not append weights twice.
    if (folder / destination).exists():
        raise FileExistsError('Refusing to overwrite existing consolidated weights')
    model = onnx.load(str(target), load_external_data=True)
    onnx.save_model(model, str(target), save_as_external_data=True, all_tensors_to_one_file=True,
                    location=destination, size_threshold=1024)
    for name in locations - {destination}:
        path = (folder / name).resolve()
        if path.is_relative_to(folder.resolve()) and path.is_file():
            path.unlink()  # Only tensor files referenced by the just-consolidated graph.


def check(out, reference, batch):
    """같은 입력을 onnxruntime 으로 돌려 torch 결과와 비교한다."""
    import numpy as np
    import onnxruntime as ort
    session = ort.InferenceSession(str(out / 'embedding.onnx'), providers=['CPUExecutionProvider'])
    got = session.run(['embedding'], {'input_ids': batch['input_ids'].numpy().astype('int64'), 'attention_mask': batch['attention_mask'].numpy().astype('int64')})[0]
    cos = (got * reference).sum(axis=1)
    print('cosine per sample:', [round(float(c), 7) for c in cos], 'max abs diff: %.2e' % float(np.abs(got - reference).max()))
    return float(cos.min())


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE, help='torch 체크포인트 폴더(기본: 설치된 embedding-qwen3-0.6b)')
    parser.add_argument('--out', type=Path, default=Path('temp/embedding-onnx'), help='결과를 둘 폴더(그 아래 embedding-qwen3-0.6b-onnx/)')
    args = parser.parse_args()
    out = args.out / 'embedding-qwen3-0.6b-onnx'
    if out.exists() and any(out.iterdir()):
        sys.exit('이미 있습니다: %s (지우고 다시 하거나 --out 을 바꾸세요)' % out)
    reference, batch = build(args.source, out)
    lowest = check(out, reference, batch)
    print('min cosine %.7f' % lowest, 'OK' if lowest >= 0.9999 else 'TOO LOW')
    return 0 if lowest >= 0.9999 else 1


if __name__ == '__main__':
    sys.exit(main())
