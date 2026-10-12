# su4228 v30 (origin/feature/su4228-article-workspace, 6dc497f) 의 시험을 그대로 가져옴. 달라진 점은 이 머리말(경로 설정)과 fixture 읽기의 encoding='utf-8'(Windows 기본 cp949 대응)뿐이다.
import sys
from pathlib import Path
_ROOT = Path(__file__).resolve().parents[2]  # article_editor/ — integration/·onnx_models.py 가 있는 곳
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
import copy,json,unittest,uuid
from pathlib import Path
from integration.core_contract import *

FIXTURE=json.loads((_ROOT/'integration/contract_v0_8/fixtures/vertical-slice-v0.8.json').read_text(encoding='utf-8'))
class CoreContractTests(unittest.TestCase):
    def setUp(self):self.draft=revision_to_draft(FIXTURE['article'],FIXTURE['revision'])
    def test_fixture_round_trip(self):
        payload=revision_input(self.draft,7)
        for key in ('title','body_html','body_text'):self.assertEqual(payload[key],FIXTURE['revision'][key])
        self.assertEqual(payload['expected_revision_no'],7)
        self.assertEqual(article_id(self.draft),FIXTURE['article']['id'])
    def test_workspace_and_article_validation(self):
        bad=copy.deepcopy(FIXTURE['revision']);bad['article_id']=str(uuid.uuid4())
        with self.assertRaises(ContractError):revision_to_draft(FIXTURE['article'],bad)
    def test_legacy_requires_team_namespace_and_is_stable(self):
        with self.assertRaises(ContractError):legacy_uuid('article','old-id',None)
        # A TEST-ONLY namespace; never installed as a product default.
        namespace=str(uuid.uuid4())
        value=legacy_uuid('article','old-id',namespace)
        self.assertEqual(value,legacy_uuid('article','old-id',namespace))
        self.assertEqual(uuid.UUID(value).version,5)
        self.assertNotEqual(value,legacy_uuid('revision','old-id',namespace))
    def test_media_reusable_and_preserved(self):
        asset=FIXTURE['media_assets'][0]
        photo=media_to_photo(asset)
        self.assertEqual(photo_to_media(photo,FIXTURE['workspace']['id'])['id'],asset['id'])
        self.assertEqual(photo_to_media(photo,FIXTURE['workspace']['id'])['object_ref'],asset['object_ref'])
    def test_inline_images_must_be_stored(self):
        photo=media_to_photo(FIXTURE['media_assets'][0]);photo['original']='data:image/png;base64,eA=='
        with self.assertRaises(ContractError):photo_to_media(photo,FIXTURE['workspace']['id'])
    def test_media_ids_and_editor_state(self):
        self.draft['photos']=[media_to_photo(FIXTURE['media_assets'][0])]
        self.draft['confirmed']={'headline':True,'subheadline':False}
        payload=revision_input(self.draft)
        self.assertEqual(payload['editor_state']['media_asset_ids'],[FIXTURE['media_assets'][0]['id']])
        self.assertTrue(payload['editor_state']['confirmed']['headline'])
        self.assertNotIn('articleId',payload['editor_state'])
    def test_deleted_and_photo_text_excluded(self):
        self.assertEqual(text_of('<p>첫 문단<s>삭제</s></p><p>다음<br>줄</p><figure>사진 설명</figure>'),'첫 문단\n다음\n줄')
    def test_internal_backup_not_revision(self):
        with self.assertRaises(ContractError):version_to_revision({'internal':True},FIXTURE['workspace']['id'],None)

if __name__=='__main__':unittest.main()
