"""Synthetic reviewer records exercise the import, never claim real sign-off."""
import contextlib
import copy
import csv
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import apply_calibration_reviews, digest, gate
from reporting import write_json, write_report
from robot import main
from verify import verify
from test_robot import case, report, POLICY


class CalibrationTests(unittest.TestCase):
    def row(self, **changes):
        value = dict(run_id="fixture-run", source_report_sha256="a" * 64,
                     case_id="KYS-CAP-001", automatic_verdict="FAIL",
                     reviewer="Synthetic test reviewer", human_verdict="PASS",
                     evidence="synthetic-fixture-only", rationale="Exercise a disagreement")
        return {**value, **changes}

    def test_disagreement_is_measured_without_overriding_machine_or_original(self):
        original = report(case(status="FAIL"))
        frozen = copy.deepcopy(original)
        value = apply_calibration_reviews(original, [self.row()], "a" * 64)
        self.assertEqual(original, frozen)
        self.assertEqual(value["cases"][0]["status"], "FAIL")
        self.assertEqual(gate(value["cases"], POLICY)["decision"], "REJECT")
        self.assertEqual(value["judge_agreement"]["observed_agreement"], 0)
        self.assertEqual(value["judge_agreement"]["disagreements"], ["KYS-CAP-001"])
        self.assertEqual(value["judge_agreement"]["confusion_counts"]["FAIL_human_PASS"], 1)

    def test_mixed_pairs_keep_unique_coverage_and_uncertainty(self):
        source = report(case(status="FAIL"), case(case_id="KYS-CAP-002"), case(case_id="KYS-CAP-003"))
        value = apply_calibration_reviews(source, [self.row(), self.row(case_id="KYS-CAP-002", automatic_verdict="PASS")], "a" * 64)
        agreement = value["judge_agreement"]
        self.assertEqual((agreement["n"], agreement["unique_cases"], agreement["observed_agreement"]), (2, 2, .5))
        self.assertAlmostEqual(agreement["coverage_of_machine_verdicts"], 2 / 3)
        self.assertIn("selection bias", agreement["sample_limitations"])

    def test_stale_report_hash_run_id_unknown_and_duplicate_cases_are_refused(self):
        for change in [{"source_report_sha256": "b" * 64}, {"run_id": "other-run"}, {"case_id": "KYS-CAP-999"}]:
            with self.assertRaises(ValueError):
                apply_calibration_reviews(report(case(status="FAIL")), [self.row(**change)], "a" * 64)
        with self.assertRaises(ValueError):
            apply_calibration_reviews(report(case(status="FAIL")), [self.row(), self.row(reviewer="Another reviewer")], "a" * 64)

    def test_blank_unidentified_and_malformed_reviews_are_refused(self):
        for key in ["reviewer", "evidence", "rationale"]:
            for value in ["", "  ", None, True]:
                with self.assertRaises(ValueError):
                    apply_calibration_reviews(report(case(status="FAIL")), [self.row(**{key: value})], "a" * 64)
        for rows in [[], None, [None], "not a review"]:
            with self.assertRaises(ValueError):
                apply_calibration_reviews(report(case(status="FAIL")), rows, "a" * 64)

    def test_machine_verdict_cannot_be_changed_or_skipped_to_calibrate(self):
        for change in [{"automatic_verdict": "PASS"}, {"human_verdict": "REVIEW"}]:
            with self.assertRaises(ValueError):
                apply_calibration_reviews(report(case(status="FAIL")), [self.row(**change)], "a" * 64)
        for state in ["ERROR", "BLOCKED", "REVIEW", "NOT_APPLICABLE"]:
            with self.assertRaises(ValueError):
                apply_calibration_reviews(report(case(status=state)), [self.row()], "a" * 64)
        with self.assertRaises(ValueError):
            apply_calibration_reviews(report(case(status="FAIL", adapter="human")), [self.row()], "a" * 64)

    def source(self, folder):
        folder.mkdir()
        write_json(folder / "policy.json", POLICY)
        write_report(report(case(status="FAIL")), folder, POLICY)
        return folder / "report.json"

    def reviews_csv(self, path, row):
        with path.open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=row.keys())
            writer.writeheader(); writer.writerow(row)

    def test_template_is_bound_to_the_report_and_leaves_real_reviewer_empty(self):
        with tempfile.TemporaryDirectory() as temp:
            source = self.source(Path(temp) / "source")
            with (source.parent / "calibration-template.csv").open(encoding="utf-8-sig") as stream:
                row = next(csv.DictReader(stream))
            self.assertEqual(row["source_report_sha256"], digest(source))
            self.assertEqual(row["automatic_verdict"], "FAIL")
            self.assertEqual(row["reviewer"], "")
            self.assertEqual(verify(source.parent), [])

    def test_cli_import_is_immutable_and_preserves_a_rejected_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = self.source(root / "source")
            before = digest(source); reviews = root / "reviews.csv"
            self.reviews_csv(reviews, self.row(source_report_sha256=before))
            output = root / "calibrated"
            with patch("sys.argv", ["robot.py", "calibrate", str(source), str(reviews), "--output", str(output)]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(), 1)
            self.assertEqual(digest(source), before)
            result = json.loads((output / "report.json").read_text())
            self.assertEqual(result["parent_report_sha256"], before)
            self.assertEqual(result["judge_agreement"]["n"], 1)
            self.assertEqual(result["gate"]["decision"], "REJECT")
            self.assertEqual(verify(output), [])

    def test_cli_refuses_outputs_nested_in_the_source_and_modified_campaigns(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = self.source(root / "source")
            reviews = root / "reviews.csv"; self.reviews_csv(reviews, self.row(source_report_sha256=digest(source)))
            for destination in [source.parent / "raw/new-report", root / "out"]:
                if destination == root / "out":
                    (source.parent / "unrecorded.txt").write_text("not immutable")
                with patch("sys.argv", ["robot.py", "calibrate", str(source), str(reviews), "--output", str(destination)]):
                    with self.assertRaises(ValueError): main()
                self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
