"""Content-addressed original image files shared by all article versions."""
import hashlib,json,os,re,threading,uuid
from pathlib import Path

class AssetError(Exception):
    def __init__(self,message,status=400):self.message,self.status=message,status

def image_mime(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):return 'image/jpeg'
    if data.startswith((b'GIF87a',b'GIF89a')):return 'image/gif'
    if data[:4]==b'RIFF' and data[8:12]==b'WEBP':return 'image/webp'
    if data.startswith(b'BM'):return 'image/bmp'
    if data[4:8]==b'ftyp' and b'avif' in data[8:32]:return 'image/avif'
    raise AssetError('지원하지 않는 사진 형식입니다. JPG·PNG·WebP·GIF·BMP·AVIF 파일을 사용해 주세요.')

class AssetStore:
    def __init__(self,root):self.root=Path(root);self.lock=threading.RLock()
    def validate(self,asset_id):
        if not re.fullmatch(r'[a-f0-9]{64}',asset_id):raise AssetError('잘못된 사진 ID입니다.')
        return asset_id
    def path(self,asset_id):return self.root/'assets'/(self.validate(asset_id)+'.bin')
    def status(self,asset_id):
        path=self.path(asset_id)
        return {'ready':path.is_file(),'bytes':path.stat().st_size if path.is_file() else 0,'url':'/api/article-assets/'+asset_id}
    def chunk(self,asset_id,index,total,data):
        self.validate(asset_id)
        if not 1<=total<=256 or not 0<=index<total or not 0<len(data)<=1048576:raise AssetError('잘못된 사진 전송 크기입니다.')
        with self.lock:
            if self.path(asset_id).exists():return self.status(asset_id)
            folder=self.root/'uploads'/asset_id;folder.mkdir(parents=True,exist_ok=True)
            manifest=folder/'total.json'
            if manifest.exists() and json.loads(manifest.read_text())!=total:raise AssetError('사진 전송 정보가 달라졌어요. 다시 시도해 주세요.',409)
            manifest.write_text(json.dumps(total))
            part=folder/str(index);temp=folder/(str(index)+'.tmp')
            temp.write_bytes(data);temp.replace(part)
            if not all((folder/str(i)).is_file() for i in range(total)):return {'ready':False,'received':index}
            target=self.path(asset_id);target.parent.mkdir(parents=True,exist_ok=True)
            staging=target.with_suffix('.'+uuid.uuid4().hex+'.tmp');digest=hashlib.sha256()
            try:
                with staging.open('wb') as output:
                    for i in range(total):
                        content=(folder/str(i)).read_bytes();digest.update(content);output.write(content)
                if digest.hexdigest()!=asset_id:raise AssetError('사진 전송 중 파일이 달라졌어요. 다시 시도해 주세요.',409)
                with staging.open('rb') as file:image_mime(file.read(64))
                staging.replace(target)
            finally:staging.unlink(missing_ok=True)
            for file in folder.iterdir():file.unlink()
            folder.rmdir()
            return self.status(asset_id)
    def read(self,asset_id):
        path=self.path(asset_id)
        if not path.exists():raise AssetError('원고에 연결된 사진 파일을 찾지 못했어요.',404)
        with path.open('rb') as file:mime=image_mime(file.read(64))
        return path,mime
