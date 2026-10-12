"""Export pinned seq2seq checkpoints and check ONNX versus PyTorch on CPU."""
import argparse, hashlib, importlib.metadata, json, os, shutil, sys
from pathlib import Path
MODELS={
 'headline':('onebeans/keT5-news-title-gen','0c9d139ddcc934390997ce7686a49e6878c36a35'),
 'subtitle':('gogamza/kobart-summarization','31f181b155a0ad74bd93bd90ee04310ff72691f4')}

def export(kind, output):
 import numpy as np
 import torch
 from transformers import AutoTokenizer,AutoModelForSeq2SeqLM
 from optimum.onnxruntime import ORTModelForSeq2SeqLM
 torch.set_num_threads(2)
 source,revision=MODELS[kind]
 target=output/kind
 if target.exists():raise RuntimeError(f'Existing folder: {target}. Choose another output or remove only generated model files.')
 target.parent.mkdir(parents=True,exist_ok=True)
 stage=target.with_name(target.name+'.exporting')
 stage.mkdir(exist_ok=True)
 tokenizer=AutoTokenizer.from_pretrained(source,revision=revision)
 model=ORTModelForSeq2SeqLM.from_pretrained(source,revision=revision,export=True,provider='CPUExecutionProvider',use_cache=True)
 model.save_pretrained(stage);tokenizer.save_pretrained(stage)
 # Actual source checkpoint, not a mock, for numerical and generated-token comparisons.
 reference=AutoModelForSeq2SeqLM.from_pretrained(source,revision=revision,use_safetensors=True).eval()
 samples=['서울시는 공공자전거 대여소를 늘리고 이용 현황을 공개했다. 시민들의 이용 편의를 높이기 위한 조치다.',
          '지역 도서관이 주말 운영 시간을 연장한다. 주민들은 오후에도 자료를 열람할 수 있다.']
 checks=[]
 for text in samples:
  encoded=tokenizer(text,return_tensors='pt',truncation=True,max_length=128)
  decoder=torch.tensor([[reference.config.decoder_start_token_id]])
  with torch.no_grad():a=reference(**encoded,decoder_input_ids=decoder).logits.numpy()
  b=model(**encoded,decoder_input_ids=decoder).logits.detach().numpy()
  difference=float(np.max(np.abs(a-b)))
  np.testing.assert_allclose(a,b,atol=1e-3,rtol=1e-3)
  args=dict(max_new_tokens=32,num_beams=3,num_return_sequences=3,do_sample=False)
  with torch.no_grad():pt=reference.generate(**encoded,**args)
  ort=model.generate(**encoded,**args)
  checks.append({'input':text,'max_abs_logit_difference':difference,'tokens_equal':bool(np.array_equal(pt.numpy(),ort.numpy())),
                 'pytorch':tokenizer.batch_decode(pt,skip_special_tokens=True),'onnx':tokenizer.batch_decode(ort,skip_special_tokens=True)})
 files=[]
 for path in sorted(stage.rglob('*')):
  if path.is_file():
   h=hashlib.sha256()
   with path.open('rb') as stream:
    for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
   files.append({'path':path.relative_to(stage).as_posix(),'bytes':path.stat().st_size,'sha256':h.hexdigest()})
 manifest={'format':'onnx','precision':'fp32','kind':kind,'model_id':source,'source_revision':revision,
           'runtime':'onnxruntime','provider':'CPUExecutionProvider','packages':{p:importlib.metadata.version(p) for p in ('torch','transformers','optimum-onnx','onnx','onnxruntime')},
           'files':files,'validation':checks}
 (stage/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 stage.rename(target)
 print(json.dumps({'kind':kind,'folder':str(target),'bytes':sum(f['bytes'] for f in files),'validation':checks},ensure_ascii=False),flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--kind',choices=MODELS,required=True)
 parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'models'/'onnx')
 args=parser.parse_args();export(args.kind,args.output.resolve())
