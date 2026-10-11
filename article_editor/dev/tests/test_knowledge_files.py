"""Managed Markdown files: encrypted content, explicit links and backlinks."""
import env_isolation  # noqa: F401
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402
from core import knowledge_files, read_models  # noqa: E402
from core.errors import RequestError  # noqa: E402


class KnowledgeFileTests(unittest.TestCase):
    def setUp(self):
        self.root = use_temp_vault(self)

    def import_one(self, path, content):
        return knowledge_files.import_files({'files': [{'path': path, 'content': content}]})['files'][0]

    def test_import_keeps_id_on_update_and_encrypts_markdown(self):
        first = self.import_one('notes/현장.md', '# 현장\n비공개취재내용')
        second = self.import_one('notes/현장.md', '# 현장\n수정된내용')
        self.assertEqual(first['id'], second['id'])
        self.assertEqual(knowledge_files.get_file(first['id'])['content'], '# 현장\n수정된내용')
        data = b''.join(path.read_bytes() for path in self.root.glob('vault.db*'))
        self.assertNotIn('수정된내용'.encode(), data)

    def test_rejects_escape_path_atomically(self):
        with self.assertRaises(RequestError):
            knowledge_files.import_files({'files': [
                {'path': 'valid.md', 'content': 'valid'},
                {'path': '../secret.md', 'content': 'bad'},
            ]})
        self.assertEqual(read_models.knowledge_map()['files'], [])

    def test_parser_ignores_code_and_external_links(self):
        content = '[[real]]\n```md\n[[fenced]]\n```\n`[[inline]]`\n[[https://example.com/wiki]]\n[web](https://example.com)\n[local](other.md)'
        links = knowledge_files.parse_links(content)
        self.assertEqual([(link['target_ref'], link['kind']) for link in links],
                         [('real', 'wikilink'), ('other.md', 'markdown')])

    def test_import_resolves_links_and_backlinks(self):
        a = self.import_one('notes/a.md', '# A\n[[b]]\n[b again](b.md)')
        b = self.import_one('notes/b.md', '# B')
        graph = read_models.knowledge_map()
        self.assertEqual(len(graph['file_links']), 2)
        self.assertEqual({link['target'] for link in graph['file_links']}, {b['id']})
        self.assertEqual([item['backlink_count'] for item in graph['files'] if item['id'] == b['id']], [2])
        self.assertEqual({(edge['source'], edge['target'], edge['relation']) for edge in graph['edges']},
                         {(a['id'], b['id'], 'links_to')})

    def test_missing_target_becomes_resolved_after_import_and_missing_again_after_delete(self):
        a = self.import_one('a.md', '[[missing]]')
        before = read_models.knowledge_map()
        self.assertEqual(len(before['unresolved']), 1)
        placeholder = before['unresolved'][0]['id']
        b = self.import_one('missing.md', '# Here')
        middle = read_models.knowledge_map()
        self.assertEqual(middle['unresolved'], [])
        self.assertEqual(middle['file_links'][0]['target'], b['id'])
        knowledge_files.delete_file(b['id'])
        after = read_models.knowledge_map()
        self.assertEqual(after['unresolved'][0]['id'], placeholder)
        self.assertEqual(after['file_links'][0]['source'], a['id'])

    def test_wikilink_prefers_nearby_file_and_directory_index(self):
        near = self.import_one('notes/topic.md', '# Near')
        self.import_one('archive/topic.md', '# Far')
        directory = self.import_one('notes/team/index.md', '# Team')
        source = self.import_one('notes/start.md', '[[topic]]\n[[team]]')
        links = knowledge_files.get_file(source['id'])['outgoing']
        self.assertEqual([link['target'] for link in links], [near['id'], directory['id']])

    def test_ambiguous_basename_uses_stable_path_order(self):
        first = self.import_one('archive/topic.md', '# Archive')
        self.import_one('notes/topic.md', '# Notes')
        source = self.import_one('start.md', '[[topic]]')
        self.assertEqual(knowledge_files.get_file(source['id'])['outgoing'][0]['target'], first['id'])

    def test_reimport_replaces_outgoing_links(self):
        source = self.import_one('a.md', '[[old]]')
        self.import_one('a.md', '[[new]]')
        links = knowledge_files.get_file(source['id'])['outgoing']
        self.assertEqual([link['target_ref'] for link in links], ['new'])


if __name__ == '__main__':
    unittest.main()
