"""Verify local bundle hashes and optionally execute both checkpoints offline."""
import argparse,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from onnx_models import model_folder,validate_bundle,load

parser=argparse.ArgumentParser()
parser.add_argument('--files-only',action='store_true')
args=parser.parse_args()
os.environ['HF_HUB_OFFLINE']='1'
models={'headline':'onebeans/keT5-news-title-gen','subtitle':'gogamza/kobart-summarization'}
results={}
for kind,model_id in models.items():
    manifest=validate_bundle(model_folder(kind),kind,model_id,verify_hashes=True)
    record={'checksums':'passed','source_revision':manifest['source_revision']}
    if not args.files_only:
        import torch
        torch.set_num_threads(2)
        tokenizer,model=load(kind,model_id)
        inputs=tokenizer('서울시는 공공자전거 대여소를 늘리고 이용 현황을 공개했다.',return_tensors='pt')
        with torch.inference_mode():output=model.generate(**inputs,max_new_tokens=32,num_beams=3)
        record['output']=tokenizer.batch_decode(output,skip_special_tokens=True)
    results[kind]=record
print(json.dumps(results,ensure_ascii=False,indent=2))
