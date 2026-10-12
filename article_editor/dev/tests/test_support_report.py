"""문제 보고용 진단 정보: 필요한 항목은 있고, 이메일·사용자 이름 경로 같은 개인 정보는 없다."""
import json
import unittest

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture  # noqa: F401
from core import auth, support_report


class SupportReportTests(unittest.TestCase):
    def test_report_has_versions_and_no_personal_data(self):
        auth.set_session('tok', 'ref', 3600, email='secret.person@example.test', user_id='u-secret')
        self.addCleanup(auth.clear)
        models = {'models': [{'id': 'judge', 'installed': True, 'files': 2, 'filesDone': 2},
                             {'id': 'boundary', 'installed': False, 'files': 3, 'filesDone': 1}]}
        report = support_report.report(models, 'external', {'cloudBackup': True, 'localFactcheck': False})
        for key in ('appVersion', 'pipelineVersion', 'os', 'factcheckMode', 'signedIn', 'models', 'settings'):
            self.assertIn(key, report)
        self.assertEqual(report['models'][1], {'id': 'boundary', 'installed': False, 'files': '1/3'})
        text = json.dumps(report, ensure_ascii=False)
        for secret in ('secret.person', 'u-secret', 'tok', 'Users' + chr(92)):
            self.assertNotIn(secret, text)


if __name__ == '__main__':
    unittest.main()
