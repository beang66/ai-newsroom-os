"""Organization regression tests against a fresh SQLite database and immutable bytes."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from app import store, ingest, knowledge


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.old=store.DB_PATH
        store.DB_PATH=Path(self.temp.name)/'knowledge.sqlite3'
        store.init();knowledge.init()

    def tearDown(self):
        store.DB_PATH=self.old
        self.temp.cleanup()

    def add(self,text='보도자료\n새빛시 버스 정책을 발표했다. 김가람 교수는 설명했다.',name='보도자료.txt',project=None):
        return knowledge.intake(name,'취재/'+name,text.encode(),project)

    def test_type_tags_and_literal_summary(self):
        doc=self.add();meta=doc['organization']
        self.assertEqual(meta['type'],'press_release')
        self.assertEqual(meta['type_origin'],'rule_suggestion')
        self.assertEqual({t['label'] for t in meta['tags']},{'교통','정책'})
        self.assertEqual(meta['summary_kind'],'extractive_preview')
        blocks={b['id']:b for b in store.get_document(doc['id'])['blocks']}
        for proof in meta['summary']+meta['type_evidence']+[p for t in meta['tags'] for p in t['evidence']]:
            self.assertEqual(blocks[proof['block_id']]['text'][proof['start']:proof['end']],proof['excerpt'])

    def test_openai_suggestion_is_explicit_source_bound_and_requires_acceptance(self):
        doc=self.add()
        client=Mock(model='test-model')
        client.structured.return_value={'document_type':'press_release',
            'tags':[{'label':'교통 정책','source_id':1}], 'summary_ids':[1]}
        proposal=knowledge.suggest(doc['id'],client)
        payload=client.structured.call_args.args[1]
        self.assertEqual(len(payload['snippets']),2)
        self.assertEqual(knowledge.metadata(doc['id'])['revision'],1)
        self.assertEqual(proposal['summary'][0]['excerpt'],payload['snippets'][1]['text'])
        applied=knowledge.edit(doc['id'],proposal['base_revision'],{
            'type':proposal['document_type'], 'tags':[t['label'] for t in proposal['tags']],
            'summary':proposal['summary']})
        self.assertEqual(applied['summary_kind'],'model_selected_excerpt')
        self.assertEqual(applied['summary'],proposal['summary'])
        with self.assertRaises(ValueError):knowledge.edit(doc['id'],proposal['base_revision'],{'tags':['오래된 제안']})

    def test_openai_suggestion_rejects_fabricated_source_and_excerpt(self):
        doc=self.add()
        client=Mock(model='test-model')
        client.structured.return_value={'document_type':'press_release','tags':[], 'summary_ids':[99]}
        with self.assertRaises(ValueError):knowledge.suggest(doc['id'],client)
        self.assertEqual(knowledge.metadata(doc['id'])['revision'],1)
        span=knowledge.metadata(doc['id'])['summary'][0].copy()
        span['excerpt']='가짜 근거'
        with self.assertRaisesRegex(ValueError,'원문'):
            knowledge.edit(doc['id'],1,{'summary':[span]})

    def test_openai_suggestion_requires_server_key(self):
        doc=self.add()
        with patch.dict('os.environ',{'OPENAI_API_KEY':''}):
            with self.assertRaisesRegex(ValueError,'OPENAI_API_KEY'):
                knowledge.suggest(doc['id'])

    def test_ambiguous_and_no_signal_stay_unclassified(self):
        for text in ['내용만 있는 문서','보도자료와 인터뷰']:
            self.assertEqual(self.add(text,'자료.txt')['organization']['type'],'unclassified')

    def test_duplicate_does_not_change_bytes_or_manual_edits(self):
        a=self.add();raw=store.get_original(a['id'])['raw']
        knowledge.edit(a['id'],1,{'type':'note','tags':['기자 지정']})
        b=self.add(name='다른이름.txt')
        self.assertTrue(b['duplicate']);self.assertEqual(a['id'],b['id'])
        self.assertEqual(b['organization']['type'],'note')
        self.assertEqual(store.get_original(a['id'])['raw'],raw)
        self.assertEqual(len(store.list_documents()),1)

    def test_projects_many_to_many_and_undo(self):
        p=knowledge.create_project('교통 취재');q=knowledge.create_project('예산 취재')
        doc=self.add(project=p['id']);meta=doc['organization']
        updated=knowledge.edit(doc['id'],meta['revision'],{'project_ids':[p['id'],q['id']]})
        self.assertEqual(len(updated['project_ids']),2)
        restored=knowledge.edit(doc['id'],updated['revision'],{},undo=True)
        self.assertEqual(restored['project_ids'],[p['id']])
        self.assertGreater(restored['revision'],updated['revision'])
        with self.assertRaises(ValueError):knowledge.edit(doc['id'],restored['revision'],{},undo=True)

    def test_revision_conflict_and_validation(self):
        doc=self.add();knowledge.edit(doc['id'],1,{'tags':['사용자']})
        with self.assertRaises(ValueError):knowledge.edit(doc['id'],1,{'type':'note'})
        for change in [{'type':'invented'},{'tags':['']},{'project_ids':['missing']},{'document_date':'2026-02-30'},{'raw':'overwrite'}]:
            with self.assertRaises(ValueError):knowledge.edit(doc['id'],2,change)
        self.assertEqual(knowledge.metadata(doc['id'])['revision'],2)

    def test_filters_search_dates_and_unknown_dates(self):
        doc=self.add();self.add('다른 자료','other.txt')
        self.assertEqual(knowledge.catalog({'q':'버스'})['matched'],1)
        self.assertEqual(knowledge.catalog({'type':'unclassified'})['matched'],1)
        self.assertEqual(knowledge.catalog({'date_field':'document','from':'2026-01-01'})['matched'],0)
        knowledge.edit(doc['id'],1,{'document_date':'2026-09-27'})
        self.assertEqual(knowledge.catalog({'date_field':'document','from':'2026-09-01','to':'2026-09-30'})['matched'],1)
        with self.assertRaises(ValueError):knowledge.catalog({'from':'2026-09-30','to':'2026-09-01'})

    def test_project_suggestion_is_not_automatic_link(self):
        p=knowledge.create_project('버스');doc=self.add()
        detail=knowledge.detail(doc['id'])
        self.assertEqual(detail['project_suggestions'][0]['id'],p['id'])
        self.assertEqual(detail['organization']['project_ids'],[])

    def test_failure_original_retry_and_removal(self):
        result=knowledge.intake('photo.png','photo.png',b'not a supported image')
        self.assertEqual(result['status'],'failed')
        self.assertEqual(knowledge.failure_original(result['failure_id'])['raw'],b'not a supported image')
        self.assertEqual(knowledge.retry(result['failure_id'])['status'],'failed')
        self.assertEqual(len(knowledge.failures()),1)
        self.assertEqual(store.list_documents(),[])
        self.assertTrue(knowledge.remove_failure(result['failure_id'])['deleted'])
        self.assertEqual(knowledge.failures(),[])

    def test_over_limit_and_unsafe_path_not_retained(self):
        with self.assertRaises(ValueError):knowledge.intake('x.txt','../x.txt',b'x')
        with self.assertRaises(ValueError):knowledge.intake('x.txt','x.txt',b'x'*(ingest.MAX_BYTES+1))
        self.assertEqual(knowledge.failures(),[])

    def test_graph_mentions_are_occurrences_not_person_identity(self):
        self.add('김가람 교수는 설명했다.','one.txt');self.add('김가람 교수는 반박했다.','two.txt')
        graph=knowledge.graph()
        people=[n for n in graph['nodes'] if n['kind']=='person_candidate']
        self.assertEqual(len(people),2)
        self.assertEqual({p['label'] for p in people},{'김가람'})
        self.assertNotEqual(people[0]['id'],people[1]['id'])
        self.assertTrue(all(e['relation']=='mentions' for e in graph['edges']))

    def test_graph_edges_and_provenance(self):
        project=knowledge.create_project('버스 취재');self.add(project=project['id'])
        graph=knowledge.graph({'project':project['id'],'depth':'2'})
        self.assertEqual({e['relation'] for e in graph['edges']},{'filed_in','tagged','mentions'})
        for edge in graph['edges']:
            doc=store.get_document(edge['document_id']);blocks={b['id']:b for b in doc['blocks']}
            for proof in edge['evidence']:
                self.assertEqual(blocks[proof['block_id']]['text'][proof['start']:proof['end']],proof['excerpt'])

    def test_graph_bounds_focus_and_stable_ids(self):
        doc=self.add();a=knowledge.graph({'focus':doc['id'],'limit':'2'})
        self.assertEqual(a['displayed_nodes'],2);self.assertGreater(a['hidden_nodes'],0)
        self.assertEqual(a,knowledge.graph({'focus':doc['id'],'limit':'2'}))
        with self.assertRaises(ValueError):knowledge.graph({'limit':'151'})
        self.assertEqual(knowledge.graph({'focus':'missing'})['nodes'],[])

    def test_delete_cascades_metadata_and_graph(self):
        doc=self.add();knowledge.edit(doc['id'],1,{'tags':['수동']});store.delete_document(doc['id'])
        self.assertEqual(knowledge.graph()['nodes'],[])
        with store.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM organization').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM organization_history').fetchone()[0],0)

    def test_existing_v03_documents_lazy_upgrade(self):
        doc=ingest.ingest('old.txt','old.txt','기존 버스 자료'.encode())
        self.assertEqual(knowledge.metadata(doc['id'])['revision'],1)
        knowledge.init()
        self.assertEqual(len(knowledge.catalog()['documents']),1)
        self.assertEqual(store.get_original(doc['id'])['raw'],'기존 버스 자료'.encode())

    def test_stt_timestamps_original_and_dedup(self):
        payload={'title':'인터뷰','segments':[{'start':0,'end':2.5,'text':'김가람 교수는 말했다.'}]}
        result=knowledge.import_transcript(payload)
        doc=store.get_document(result['id'])
        self.assertEqual(doc['blocks'][0]['locator']['end_seconds'],2.5)
        self.assertEqual(json.loads(store.get_original(result['id'])['raw']),payload)
        self.assertTrue(knowledge.import_transcript(payload)['duplicate'])
        self.assertEqual(len(store.list_documents()),1)

    def test_stt_rejects_bad_times_and_empty_text(self):
        for segment in [{'start':4,'end':3,'text':'말'},{'start':0,'end':float('nan'),'text':'말'},{'start':True,'end':3,'text':'말'},{'start':0,'end':3,'text':''}]:
            with self.assertRaises(ValueError):knowledge.import_transcript({'title':'인터뷰','segments':[segment]})
        self.assertEqual(store.list_documents(),[])


if __name__=='__main__':unittest.main()
