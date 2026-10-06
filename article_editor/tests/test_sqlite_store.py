import json
import tempfile
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from sqlite_store import SQLiteVersionStore
from version_store import JsonVersionStore, VersionStoreError, content_hash

class SQLiteVersions(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.id='a'*32; self.store=SQLiteVersionStore(self.temp.name)
    def draft(self, text='원고'):
        return {'articleId':self.id,'title':'제목','subtitle':'부제','bodyHtml':'<p>'+text+'</p>',
            'photos':[{'original':'/api/article-assets/'+'b'*64,'caption':'설명'}],
            'confirmed':{'headline':True},'summary':{'metadata':{'models':[{'model':'kobart'}]}}}
    def test_persistence_and_repeated_dedup(self):
        d=self.draft(); self.store.save_current(self.id,d)
        v=self.store.create(self.id,d)['version']
        other=SQLiteVersionStore(self.temp.name)
        self.assertEqual(other.current(self.id),d)
        self.assertEqual(other.get(self.id,v['versionId'])['draft'],d)
        self.assertFalse(other.create(self.id,dict(d,updatedAt='changed'))['created'])
        self.assertFalse((Path(self.temp.name)/'articles').exists())
        self.assertFalse((Path(self.temp.name)/'versions').exists())
    def test_migration_preserves_originals_and_numbers_once(self):
        old=JsonVersionStore(self.temp.name); d=self.draft()
        a=old.create(self.id,d)['version'];old.create(self.id,self.draft('새 원고'))
        old.atomic(Path(self.temp.name)/'articles'/(self.id+'.json'),d)
        originals={str(p):p.read_bytes() for p in Path(self.temp.name).rglob('*.json')}
        self.assertEqual([v['versionNumber'] for v in self.store.list(self.id)],[2,1])
        self.assertEqual(self.store.current(self.id),d)
        self.assertEqual(self.store.get(self.id,a['versionId'])['draft'],d)
        self.assertEqual(len(SQLiteVersionStore(self.temp.name).list(self.id)),2)
        self.assertEqual(originals,{str(p):p.read_bytes() for p in Path(self.temp.name).rglob('*.json')})
    def test_user_isolation(self):
        other=SQLiteVersionStore(self.temp.name,user_id='other')
        d=self.draft();self.store.save_current(self.id,d);v=self.store.create(self.id,d)['version']
        self.assertEqual(other.list(self.id),[]);self.assertIsNone(other.current(self.id))
        with self.assertRaises(VersionStoreError):other.get(self.id,v['versionId'])
        other.create(self.id,self.draft('다른 사용자'))
        self.assertEqual(len(self.store.list(self.id)),1)
    def test_legacy_not_assigned_to_other_user(self):
        JsonVersionStore(self.temp.name).create(self.id,self.draft())
        self.assertEqual(SQLiteVersionStore(self.temp.name,user_id='other').list(self.id),[])
    def test_apply_return_and_hidden_backups(self):
        d=self.draft();v=self.store.create(self.id,d)['version'];latest=self.draft('최신')
        self.store.save_current(self.id,latest)
        applied=self.store.restore(self.id,v['versionId'],latest,content_hash(latest))
        self.assertEqual(self.store.current(self.id)['bodyHtml'],d['bodyHtml'])
        self.assertFalse(self.store.create(self.id,applied['draft'])['created'])
        self.assertEqual([r['versionNumber'] for r in self.store.list(self.id)],[1])
        reopen=SQLiteVersionStore(self.temp.name);current=reopen.current(self.id)
        returned=reopen.restore(self.id,current['__versionReturn']['backupVersionId'],current,content_hash(current))
        self.assertEqual(returned['draft']['bodyHtml'],latest['bodyHtml'])
        self.assertNotIn('__versionReturn',returned['draft'])
    def test_transaction_rolls_back_restore_on_write_failure(self):
        old=self.draft();v=self.store.create(self.id,old)['version'];latest=self.draft('최신')
        self.store.save_current(self.id,latest)
        with patch.object(self.store,'_save',side_effect=OSError('disk full')):
            with self.assertRaises(OSError):self.store.restore(self.id,v['versionId'],latest,content_hash(latest))
        self.assertEqual(self.store.current(self.id),latest)
        self.assertEqual(len(self.store.list(self.id,True)),1)
    def test_stale_hash_rejected(self):
        d=self.draft();v=self.store.create(self.id,d)['version'];self.store.save_current(self.id,self.draft('외부 수정'))
        with self.assertRaises(VersionStoreError) as error:self.store.restore(self.id,v['versionId'],d,content_hash(d))
        self.assertEqual(error.exception.status,409)
        self.assertEqual(len(self.store.list(self.id,True)),1)
    def test_concurrent_connections_dedup_and_numbering(self):
        stores=[SQLiteVersionStore(self.temp.name) for _ in range(4)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda s:s.create(self.id,self.draft()),stores))
        self.assertEqual(sum(r['created'] for r in results),1)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda pair:pair[1].create(self.id,self.draft(str(pair[0]))),enumerate(stores)))
        self.assertEqual(sorted(v['versionNumber'] for v in self.store.list(self.id)),[1,2,3,4,5])
    def test_bad_ids(self):
        with self.assertRaises(VersionStoreError):self.store.list('../bad')
    def test_broken_migration_rolls_back_and_can_retry(self):
        old=JsonVersionStore(self.temp.name);old.create(self.id,self.draft())
        broken=old.folder(self.id)/('c'*32+'.json');broken.write_text('{bad')
        with self.assertRaises(VersionStoreError):self.store.list(self.id)
        broken.unlink()
        self.assertEqual(len(self.store.list(self.id)),1)
