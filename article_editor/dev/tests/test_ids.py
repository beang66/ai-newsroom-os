"""팀 계약 id 규칙(core/ids.py): 레거시 hex id → UUID v5 가 네임스페이스·이름 형식째로 고정되어 있는지."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import hashlib
import unittest
import uuid
from pathlib import Path

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.ids import IdError, TEAM_NAMESPACE, legacy_uuid, media_id, revision_uuid, source_id, uuid_text  # noqa: E402

# 한 번 계산해 박아 둔 값. 네임스페이스나 이름 형식('app-core:article:abc')이 바뀌면 여기서 깨진다.
KNOWN_ARTICLE_ABC = '9faf10d9-0423-5bf9-97ce-806fc477f904'


class LegacyUuidTests(unittest.TestCase):
    def test_namespace_constant(self):
        self.assertEqual(str(TEAM_NAMESPACE), 'fb7978fb-ae58-41b1-a9e5-37c17f46d423')

    def test_known_vector(self):
        self.assertEqual(legacy_uuid('article', 'abc'), KNOWN_ARTICLE_ABC)
        self.assertEqual(legacy_uuid('article', 'abc', system='app-core'), KNOWN_ARTICLE_ABC)

    def test_deterministic(self):
        legacy = 'a' * 32
        self.assertEqual(legacy_uuid('article', legacy), legacy_uuid('article', legacy))

    def test_entity_and_system_change_id(self):
        legacy = '0123456789abcdef0123456789abcdef'
        ids = {legacy_uuid(e, legacy) for e in ('article', 'revision', 'media_asset', 'source')}
        self.assertEqual(len(ids), 4)
        self.assertNotEqual(legacy_uuid('article', legacy), legacy_uuid('article', legacy, system='other'))

    def test_version_5(self):
        self.assertEqual(uuid.UUID(legacy_uuid('source', '0123456789abcdef')).version, 5)

    def test_rejects_empty_or_non_str(self):
        for bad in ('', None, 123, b'abc'):
            with self.assertRaises(IdError):
                legacy_uuid('article', bad)
        self.assertTrue(issubclass(IdError, ValueError))


class UuidTextTests(unittest.TestCase):
    CANON = '9faf10d9-0423-5bf9-97ce-806fc477f904'

    def test_accepts_hyphenated_and_hex(self):
        self.assertEqual(uuid_text(self.CANON), self.CANON)
        self.assertEqual(uuid_text(self.CANON.upper()), self.CANON)
        self.assertEqual(uuid_text(self.CANON.replace('-', '')), self.CANON)

    def test_rejects_garbage(self):
        for bad in ('', 'abc', 'g' * 32, self.CANON + '0', '{' + self.CANON + '}',
                    'urn:uuid:' + self.CANON, None, 42):
            with self.assertRaises(IdError):
                uuid_text(bad)


class RevisionUuidTests(unittest.TestCase):
    def test_name_uses_article_hex_and_number(self):
        import uuid
        from core.ids import TEAM_NAMESPACE
        article = 'f' * 32
        self.assertEqual(revision_uuid(article, 3), str(uuid.uuid5(TEAM_NAMESPACE, 'app-core:revision:' + article + ':3')))

    def test_stable_and_distinct(self):
        article = 'a' * 32
        self.assertEqual(revision_uuid(article, 1), revision_uuid(article, 1))
        self.assertNotEqual(revision_uuid(article, 1), revision_uuid(article, 2))
        self.assertNotEqual(revision_uuid(article, 1), revision_uuid('b' * 32, 1))
        self.assertNotEqual(revision_uuid(article, 1), legacy_uuid('article', article))

    def test_rejects_bad_numbers(self):
        for bad in (0, -1, '1', None, True, 1.5):
            with self.assertRaises(IdError):
                revision_uuid('a' * 32, bad)


class ContentIdTests(unittest.TestCase):
    """자료·사진은 내용에서 UUID 를 계산한다: 같은 내용 = 같은 id(중복 저장 방지), 저장 형태는 32자리 hex(UUID)."""

    def test_source_id_is_uuid_hex_and_deterministic(self):
        value = source_id(b'abc')
        self.assertEqual(value, source_id(b'abc'))
        self.assertNotEqual(value, source_id(b'abd'))
        self.assertRegex(value, r'^[0-9a-f]{32}$')
        self.assertEqual(uuid.UUID(value).version, 5)
        self.assertEqual(uuid_text(value), str(uuid.UUID(value)))

    def test_source_id_fixed_vector(self):
        # 이름 형식 'app-core:source:<sha256>' 과 네임스페이스가 바뀌면 이 값이 달라진다
        self.assertEqual(source_id(b'abc'), uuid.uuid5(TEAM_NAMESPACE, 'app-core:source:' + hashlib.sha256(b'abc').hexdigest()).hex)

    def test_media_id_depends_on_header_and_bytes(self):
        self.assertEqual(media_id('data:image/png;base64', b'x'), media_id('data:image/png;base64', b'x'))
        self.assertNotEqual(media_id('data:image/png;base64', b'x'), media_id('data:image/jpeg;base64', b'x'))
        self.assertNotEqual(media_id('data:image/png;base64', b'x'), media_id('data:image/png;base64', b'y'))
        self.assertEqual(uuid.UUID(media_id('data:image/png;base64', b'x')).version, 5)


if __name__ == '__main__':
    unittest.main()
