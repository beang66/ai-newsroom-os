"""Development check only: pip install jsonschema PyYAML."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import yaml
from jsonschema import Draft4Validator,RefResolver,FormatChecker
from integration.core_contract import revision_to_draft,revision_input,draft_to_article,media_to_photo,photo_to_media
root=Path(__file__).resolve().parents[1]
contract=yaml.safe_load((root/'integration/contract_v0_8/OPENAPI_v0.8.yaml').read_text())
fixture=json.loads((root/'integration/contract_v0_8/fixtures/vertical-slice-v0.8.json').read_text())
draft=revision_to_draft(fixture['article'],fixture['revision'])
checks={'Article':draft_to_article(draft,fixture['workspace']['id']),
        'ArticleRevisionInput':revision_input(draft,7),
        'ArticleRevision':fixture['revision'],
        'ArticleSnapshot':fixture['snapshot'],
        'MediaAsset':photo_to_media(media_to_photo(fixture['media_assets'][0]),fixture['workspace']['id'])}
for name,value in checks.items():
 Draft4Validator(contract['components']['schemas'][name],resolver=RefResolver.from_schema(contract),format_checker=FormatChecker()).validate(value)
 print('PASS',name)
