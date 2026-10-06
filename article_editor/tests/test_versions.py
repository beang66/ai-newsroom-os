import json
import tempfile
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from version_store import JsonVersionStore,VersionStoreError,content_hash

class Versions(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.store=JsonVersionStore(self.temp.name);self.id='a'*32
    def draft(self,text='첫 원고'):
        return {'articleId':self.id,'title':'제목','subtitle':'부제','bodyHtml':'<p><b>'+text+'</b></p>',
          'confirmed':{'headline':True},'photos':[{'id':'photo1','original':'data:image/png;base64,aaa','caption':'설명'}],
          'summary':{'paragraphs':['핵심'],'metadata':{'models':[{'model':'모델명'}]}}}
    def test_persistent_versions_and_unchanged_dedup(self):
        d=self.draft();a=self.store.create(self.id,d)
        self.assertTrue(a['created'])
        self.assertFalse(self.store.create(self.id,dict(d,updatedAt='다른 시각'))['created'])
        reopened=JsonVersionStore(self.temp.name)
        self.assertEqual(reopened.get(self.id,a['version']['versionId'])['draft'],d)
    def test_restore_keeps_backup_and_all_data(self):
        old=self.draft();v=self.store.create(self.id,old)['version']
        current=self.draft('최신 원고')
        self.store.atomic(Path(self.temp.name)/'articles'/(self.id+'.json'),current)
        result=self.store.restore(self.id,v['versionId'],current,content_hash(current))
        restored=json.loads((Path(self.temp.name)/'articles'/(self.id+'.json')).read_text())
        for key in ('bodyHtml','confirmed','photos','summary'):self.assertEqual(restored[key],old[key])
        self.assertEqual(self.store.get(self.id,result['backupVersionId'])['draft'],current)
        self.assertEqual(len(self.store.list(self.id)),1)
        self.assertEqual(len(self.store.list(self.id,include_internal=True)),3)
    def test_conflict_preserves_latest(self):
        v=self.store.create(self.id,self.draft())['version']
        current=self.draft('現在');changed=self.draft('別 원고')
        path=Path(self.temp.name)/'articles'/(self.id+'.json');self.store.atomic(path,changed)
        with self.assertRaises(VersionStoreError) as e:self.store.restore(self.id,v['versionId'],current,content_hash(current))
        self.assertEqual(e.exception.status,409);self.assertEqual(json.loads(path.read_text()),changed)
    def test_failed_backup_does_not_replace_current(self):
        from unittest.mock import patch
        v=self.store.create(self.id,self.draft())['version'];current=self.draft('최신')
        path=Path(self.temp.name)/'articles'/(self.id+'.json');self.store.atomic(path,current)
        with patch.object(self.store,'create',side_effect=OSError('disk full')):
            with self.assertRaises(OSError):self.store.restore(self.id,v['versionId'],current,content_hash(current))
        self.assertEqual(json.loads(path.read_text()),current)
    def test_concurrent_duplicate_snapshots(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda _:self.store.create(self.id,self.draft()),range(4)))
        self.assertEqual(sum(r['created'] for r in results),1)
    def test_bad_paths_rejected(self):
        for identifier in ('../other','xyz',''):
            with self.assertRaises(VersionStoreError):self.store.list(identifier)
    def test_different_photos_and_locks_change_hash(self):
        a=self.draft();b=self.draft();b['confirmed']['headline']=False
        self.assertNotEqual(content_hash(a),content_hash(b))
    def test_missing_version(self):
        with self.assertRaises(VersionStoreError) as e:self.store.get(self.id,'b'*32)
        self.assertEqual(e.exception.status,404)
    def test_stable_version_numbers_and_legacy_records(self):
        first=self.store.create(self.id,self.draft())['version']
        path=self.store.folder(self.id)/(first['versionId']+'.json')
        legacy=json.loads(path.read_text());legacy.pop('versionNumber');self.store.atomic(path,legacy)
        self.assertEqual(self.store.get(self.id,first['versionId'])['versionNumber'],1)
        second=self.store.create(self.id,self.draft('수정 원고'))['version']
        self.assertEqual(second['versionNumber'],2)
        self.assertEqual([v['versionNumber'] for v in self.store.list(self.id)],[2,1])

    def test_apply_does_not_consume_visible_number_or_autosnapshot(self):
        first=self.store.create(self.id,self.draft())['version']
        current=self.draft('현재 원고')
        self.store.atomic(Path(self.temp.name)/'articles'/(self.id+'.json'),current)
        result=self.store.restore(self.id,first['versionId'],current,content_hash(current))
        self.assertEqual([v['versionNumber'] for v in self.store.list(self.id)],[1])
        self.assertFalse(self.store.create(self.id,result['draft'],'automatic')['created'])
        next_version=self.store.create(self.id,self.draft('새 수정'),'automatic')['version']
        self.assertEqual(next_version['versionNumber'],2)
        self.assertEqual(self.store.get(self.id,result['backupVersionId'])['draft'],current)
    def test_hidden_backup_return_survives_restart(self):
        source=self.store.create(self.id,self.draft())['version']
        current=self.draft('적용 직전 원고')
        self.store.atomic(Path(self.temp.name)/'articles'/(self.id+'.json'),current)
        applied=self.store.restore(self.id,source['versionId'],current,content_hash(current))
        reopened=JsonVersionStore(self.temp.name)
        latest=json.loads((Path(self.temp.name)/'articles'/(self.id+'.json')).read_text())
        backup_id=latest['__versionReturn']['backupVersionId']
        returned=reopened.restore(self.id,backup_id,latest,content_hash(latest))
        self.assertEqual(returned['draft']['bodyHtml'],current['bodyHtml'])
        self.assertNotIn('__versionReturn',returned['draft'])
        self.assertEqual(len(reopened.list(self.id)),1)
