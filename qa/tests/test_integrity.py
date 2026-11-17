import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import digest
from reporting import write_report
from verify import verify
from test_robot import case, report, POLICY


class IntegrityTests(unittest.TestCase):
    def test_complete_report_is_verifiable(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            self.assertEqual(verify(output), [])

    def test_modified_case_is_detected(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            (output / "evidence/KYS-CAP-001.json").write_text('{}')
            self.assertTrue(verify(output))

    def test_extra_or_missing_file_is_detected(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            (output / "hidden-extra.txt").write_text('unrecorded')
            self.assertTrue(verify(output))
            (output / "hidden-extra.txt").unlink()
            (output / "traceability.csv").unlink()
            self.assertTrue(verify(output))

    def test_case_hash_cannot_disagree_with_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            path = output / "report.json"
            value = json.loads(path.read_text())
            value['cases'][0]['evidence_sha256'] = 'fake'
            path.write_text(json.dumps(value))
            manifest_path = output / "manifest.sha256.json"
            manifest = json.loads(manifest_path.read_text())
            manifest['report.json'] = digest(path)
            manifest_path.write_text(json.dumps(manifest))
            self.assertTrue(verify(output))

    def test_traversal_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "output"
            write_report(report(case()), output, POLICY)
            external = Path(temp) / "external.txt"
            external.write_text("private")
            (output / "link.txt").symlink_to(external)
            path = output / "manifest.sha256.json"
            manifest = json.loads(path.read_text())
            manifest['../external.txt'] = digest(external)
            manifest['link.txt'] = digest(external)
            path.write_text(json.dumps(manifest))
            errors = verify(output)
            self.assertIn("Unsafe manifest path", errors)
            self.assertIn("Manifest path escapes evidence directory", errors)


if __name__ == "__main__": unittest.main()
