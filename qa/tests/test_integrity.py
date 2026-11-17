import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import digest
from reporting import safe_csv_cell, write_report
from verify import verify
from test_robot import case, report, POLICY


class IntegrityTests(unittest.TestCase):
    def test_run_identifier_cannot_inject_formulas_into_review_templates(self):
        for value in ['=HYPERLINK("bad")', "a/b", None, "a\nb", "a" * 182]:
            with tempfile.TemporaryDirectory() as temp:
                with self.assertRaises(ValueError):
                    write_report(report(case(), run_id=value), Path(temp) / "out", POLICY)

    def test_unsafe_case_id_is_refused_before_any_evidence_is_written(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "out"
            with self.assertRaises(ValueError):
                write_report(report(case(case_id="../../escape")), output, POLICY)
            self.assertFalse(output.exists())

    def test_csv_is_data_not_a_spreadsheet_formula(self):
        for value in (
            '=HYPERLINK("https://example.invalid")',
            "+1+1",
            "-1+1",
            "@SUM(1)",
            "  =1+1",
        ):
            self.assertTrue(safe_csv_cell(value).startswith("'"))
        self.assertEqual(safe_csv_cell("KYS-CAP-001"), "KYS-CAP-001")

    def test_complete_report_is_verifiable(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            self.assertEqual(verify(output), [])

    def test_modified_case_is_detected(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            (output / "evidence/KYS-CAP-001.json").write_text("{}")
            self.assertTrue(verify(output))

    def test_extra_or_missing_file_is_detected(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            (output / "hidden-extra.txt").write_text("unrecorded")
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
            value["cases"][0]["evidence_sha256"] = "fake"
            path.write_text(json.dumps(value))
            manifest_path = output / "manifest.sha256.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["report.json"] = digest(path)
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
            manifest["../external.txt"] = digest(external)
            manifest["link.txt"] = digest(external)
            path.write_text(json.dumps(manifest))
            errors = verify(output)
            self.assertIn("Unsafe manifest path", errors)
            self.assertIn("Manifest path escapes evidence directory", errors)

    def test_internal_symlinks_are_also_refused_before_review_import(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            (output / "alias.json").symlink_to(output / "report.json")
            manifest = json.loads((output / "manifest.sha256.json").read_text())
            manifest["alias.json"] = digest(output / "report.json")
            (output / "manifest.sha256.json").write_text(json.dumps(manifest))
            self.assertTrue(any("Symlink" in e or "symlink" in e for e in verify(output)))

    def test_nested_manifest_named_file_is_not_silently_excluded(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            (output / "raw").mkdir()
            (output / "raw/manifest.sha256.json").write_text("unrecorded")
            self.assertIn("Evidence file inventory differs from manifest", verify(output))

    def test_report_verdict_must_match_its_per_case_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(report(case()), output, POLICY)
            source = output / "report.json"
            value = json.loads(source.read_text()); value["cases"][0]["status"] = "FAIL"
            source.write_text(json.dumps(value))
            manifest_path = output / "manifest.sha256.json"
            manifest = json.loads(manifest_path.read_text()); manifest["report.json"] = digest(source)
            manifest_path.write_text(json.dumps(manifest))
            self.assertTrue(any("differs from its evidence" in e for e in verify(output)))


if __name__ == "__main__":
    unittest.main()
