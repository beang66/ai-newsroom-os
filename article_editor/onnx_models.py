"""Load exported checkpoints locally. No automatic download or re-export."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parent

def runtime():
    value=os.environ.get('LOCAL_MODEL_RUNTIME','torch').lower()
    if value not in ('torch','onnx'):raise ValueError('LOCAL_MODEL_RUNTIME must be torch or onnx')
    return value

def dependencies_ready():
    base=all(importlib.util.find_spec(p) is not None for p in ('torch','transformers'))
    if not base or runtime()!='onnx':return base
    try:return importlib.util.find_spec('onnxruntime') is not None and importlib.util.find_spec('optimum.onnxruntime') is not None
    except (ImportError,ModuleNotFoundError):return False

def model_folder(kind):
    key='HEADLINE_ONNX_DIR' if kind=='headline' else 'SUBTITLE_ONNX_DIR'
    folder=Path(os.environ.get(key,f'models/onnx/{kind}'))
    return folder if folder.is_absolute() else ROOT/folder

def validate_bundle(folder,kind,model_id,verify_hashes=False):
    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('format')!='onnx' or manifest.get('model_id')!=model_id or manifest.get('kind')!=kind:
        raise ValueError('ONNX manifest does not match requested checkpoint')
    for item in manifest['files']:
        path=(folder/item['path']).resolve()
        if not path.is_relative_to(folder.resolve()) or not path.is_file():raise ValueError('Missing or invalid model file')
        if path.stat().st_size!=item['bytes']:raise ValueError('Model file size mismatch')
        if verify_hashes:
            h=hashlib.sha256()
            with path.open('rb') as stream:
                for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
            if h.hexdigest()!=item['sha256']:raise ValueError('Model checksum mismatch')
    return manifest

def load(kind,model_id):
    from transformers import AutoTokenizer
    from optimum.onnxruntime import ORTModelForSeq2SeqLM
    folder=model_folder(kind)
    validate_bundle(folder,kind,model_id)
    tokenizer=AutoTokenizer.from_pretrained(folder,local_files_only=True)
    model=ORTModelForSeq2SeqLM.from_pretrained(folder,export=False,local_files_only=True,
        provider='CPUExecutionProvider',use_cache=True,use_merged=False)
    return tokenizer,model

def status():
    return {'runtime':runtime(),'headline_bundle_present':(model_folder('headline')/'manifest.json').is_file(),
            'subtitle_bundle_present':(model_folder('subtitle')/'manifest.json').is_file()}

def metadata(kind,model_id):
    record={'model':model_id,'runtime':runtime()}
    if runtime()=='onnx':
        manifest=validate_bundle(model_folder(kind),kind,model_id)
        record.update(source_revision=manifest['source_revision'],precision=manifest['precision'])
    return record
