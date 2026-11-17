"""Robot safety/measurement contracts, independent of the Android product.

Run: python3 -m unittest discover -s qa/tests -v
These tests never patch product source to manufacture a passing campaign.
"""

import copy
import csv
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import (
    aggregate_attempts,
    apply_human_reviews,
    canonical_hash,
    compare_reports,
    digest,
    gate,
    judge_agreement,
    redact,
    statistics,
    summarize,
    validate_catalog,
    validate_policy,
    validate_report,
)
from reporting import write_json, write_report
from robot import application_fingerprint, execute, new_output, probe_results

QA = Path(__file__).resolve().parents[1]
POLICY = json.loads((QA / "config/policy.json").read_text())


def case(**changes):
    item = {
        "case_id": "KYS-CAP-001",
        "title": "Fixture independiente",
        "requirement_id": "REQ-1",
        "category": "functional",
        "setup": "Only controlled test data",
        "adapter": "jest-contract",
        "operation": "capture",
        "severity": "critical",
        "required": True,
        "input": None,
        "expected": False,
        "sources": ["Test basis"],
        "evaluators": ["exact-contract"],
        "status": "PASS",
        "evidence_kind": "executed_domain_contract",
        "attempts": [],
        "observed": "Controlled fixture",
    }
    item.update(changes)
    return item


def report(*cases, **changes):
    value = {
        "schema_version": "1.0",
        "run_id": "fixture-run",
        "metadata": {"application_fingerprint": "a", "catalog_sha256": "b"},
        "cases": list(cases),
    }
    value.update(changes)
    return value


class RegistryTests(unittest.TestCase):
    def catalog(self, *items):
        return {"schema_version": "1.0", "seed": 1, "cases": list(items)}

    def test_real_catalog_is_valid_and_has_sufficient_unique_coverage(self):
        catalog = json.loads((QA / "cases/catalog.json").read_text())
        self.assertEqual(validate_catalog(catalog), [])
        self.assertGreaterEqual(len({c["case_id"] for c in catalog["cases"]}), 50)
        self.assertGreaterEqual(len({c["category"] for c in catalog["cases"]}), 4)

    def test_nonobject_empty_and_schema_invalid_are_rejected(self):
        for value in (None, [], {}, {"schema_version": "9", "cases": []}):
            with self.subTest(value=value):
                self.assertTrue(validate_catalog(value))

    def test_duplicate_ids_are_not_counted_as_more_coverage(self):
        self.assertTrue(validate_catalog(self.catalog(case(), case())))

    def test_invalid_id_types_do_not_crash_validator(self):
        for value in ([], {}, None, "../../escape", "KYS-../bad-001"):
            with self.subTest(value=value):
                self.assertTrue(validate_catalog(self.catalog(case(case_id=value))))

    def test_unknown_adapter_and_operation_are_rejected(self):
        for changes in (
            {"adapter": "shell"},
            {"operation": "rm"},
            {"adapter": []},
            {"operation": {}},
        ):
            with self.subTest(changes=changes):
                self.assertTrue(validate_catalog(self.catalog(case(**changes))))

    def test_source_path_traversal_absolute_and_windows_paths_are_rejected(self):
        for path in (
            "../../App.tsx",
            "/etc/passwd",
            "src/../App.tsx",
            "C:\\private.txt",
            None,
        ):
            with self.subTest(path=path):
                self.assertTrue(
                    validate_catalog(
                        self.catalog(case(operation="source", input={"path": path}))
                    )
                )

    def test_adapters_cannot_mislabel_manual_or_ui_checks(self):
        for changes in (
            {"adapter": "human"},
            {"operation": "human"},
            {"operation": "ui"},
        ):
            self.assertTrue(validate_catalog(self.catalog(case(**changes))))

    def test_missing_oracle_test_basis_or_setup_is_rejected(self):
        for field in ("expected", "input", "sources", "setup"):
            item = case()
            del item[field]
            self.assertTrue(validate_catalog(self.catalog(item)))

    def test_nonfinite_inputs_are_not_valid_json_oracles(self):
        for value in (float("nan"), float("inf"), float("-inf")):
            self.assertTrue(validate_catalog(self.catalog(case(input=value))))
            with self.assertRaises(ValueError):
                canonical_hash({"value": value})

    def test_unknown_evaluator_or_string_list_is_rejected(self):
        for value in ([], "exact-contract", ["fictional-judge"], [{}]):
            self.assertTrue(validate_catalog(self.catalog(case(evaluators=value))))

    def test_seed_must_be_reproducible_and_bounded(self):
        for seed in (None, -1, True, "random", 2**32):
            self.assertTrue(validate_catalog({**self.catalog(case()), "seed": seed}))

    def test_booleans_are_not_interchangeable_with_required_strings(self):
        self.assertTrue(validate_catalog(self.catalog(case(required="false"))))

    def test_policy_rejects_unbounded_work_and_average_hiding_failure(self):
        self.assertEqual(validate_policy(POLICY), [])
        for changes in (
            {"repetitions": 0},
            {"max_repetitions": 1000},
            {"command_timeout_seconds": -1},
            {"require_human_signoff": "false"},
            {"critical_failure_tolerance": 1},
            {"required_automatic_pass_rate": 0.9},
        ):
            self.assertTrue(validate_policy({**POLICY, **changes}))


class MeasurementTests(unittest.TestCase):
    def test_repetition_never_turns_one_failure_into_majority_pass(self):
        self.assertEqual(
            aggregate_attempts([{"status": x} for x in ("PASS", "PASS", "FAIL")], 3),
            "FAIL",
        )

    def test_empty_missing_and_unknown_attempts_fail_closed(self):
        self.assertEqual(aggregate_attempts([], 3), "ERROR")
        self.assertEqual(aggregate_attempts([{"status": "PASS"}], 3), "ERROR")
        self.assertEqual(aggregate_attempts([{"status": "garbage"}], 1), "ERROR")
        self.assertEqual(aggregate_attempts([], 0), "ERROR")

    def test_complete_repetitions_pass_and_skips_remain_blocked(self):
        self.assertEqual(aggregate_attempts([{"status": "PASS"}] * 3, 3), "PASS")
        self.assertEqual(aggregate_attempts([{"status": "BLOCKED"}] * 3, 3), "BLOCKED")

    def test_statistics_nearest_rank_is_independent_reference(self):
        values = list(range(1, 101))
        actual = statistics(list(reversed(values)))
        self.assertEqual((actual["p50"], actual["p95"], actual["p99"]), (50, 95, 99))
        self.assertEqual(values, list(range(1, 101)))

    def test_small_sample_is_labeled_and_empty_has_no_fake_percentile(self):
        self.assertIsNone(statistics([])["p95"])
        self.assertIn("Small", statistics([25])["caution"])
        self.assertEqual(statistics([25])["p99"], 25)

    def test_invalid_metrics_are_rejected(self):
        for values in ([float("nan")], [float("inf")], [-1], [True], ["2"]):
            with self.assertRaises(ValueError):
                statistics(values)

    def test_summary_counts_unique_cases_not_repetitions(self):
        result = summarize(
            [
                case(attempts=[{"status": "PASS"}] * 3),
                case(
                    case_id="KYS-HUM-001", status="REVIEW", evidence_kind="human_review"
                ),
            ]
        )
        self.assertEqual(
            (result["total"], result["executed_unique"], result["pending_human"]),
            (2, 1, 1),
        )
        self.assertEqual(result["automatic_pass_rate"], 1)
        self.assertEqual(result["execution_coverage"], 0.5)

    def test_absent_human_agreement_is_not_fabricated(self):
        result = judge_agreement([])
        self.assertIsNone(result["observed_agreement"])
        self.assertEqual(result["status"], "NOT_CALIBRATED")

    def test_agreement_reports_uncertainty_not_accuracy(self):
        rows = [
            {"automatic_verdict": "PASS", "human_verdict": verdict}
            for verdict in ("PASS", "FAIL", "PASS", "PASS")
        ]
        result = judge_agreement(rows)
        self.assertEqual(
            (result["n"], result["matches"], result["observed_agreement"]), (4, 3, 0.75)
        )
        self.assertLess(result["wilson_95"][0], 0.75)
        self.assertGreater(result["wilson_95"][1], 0.75)


class GateTests(unittest.TestCase):
    def decision(self, *items):
        return gate(list(items), POLICY)["decision"]

    def test_one_critical_failure_rejects_even_with_many_passes(self):
        self.assertEqual(
            self.decision(*([case()] * 100), case(status="FAIL")), "REJECT"
        )

    def test_high_required_failure_rejects(self):
        self.assertEqual(self.decision(case(status="FAIL", severity="high")), "REJECT")

    def test_error_and_blocked_are_incomplete_not_pass(self):
        for status in ("ERROR", "BLOCKED", "MADE_UP"):
            self.assertEqual(self.decision(case(), case(status=status)), "INCOMPLETE")

    def test_pending_human_never_reports_release_pass(self):
        self.assertEqual(
            self.decision(case(), case(status="REVIEW", adapter="human")),
            "HUMAN_REVIEW",
        )

    def test_empty_or_all_not_applicable_does_not_pass(self):
        self.assertEqual(self.decision(), "INCOMPLETE")
        self.assertEqual(self.decision(case(status="NOT_APPLICABLE")), "INCOMPLETE")
        self.assertEqual(
            self.decision(case(), case(status="NOT_APPLICABLE")), "INCOMPLETE"
        )

    def test_required_verified_checks_pass_in_declared_scope(self):
        self.assertEqual(self.decision(case()), "PASS")

    def test_nonrequired_failure_is_visible_without_changing_required_gate(self):
        self.assertEqual(
            self.decision(case(), case(status="FAIL", required=False)), "PASS"
        )


class ComparisonTests(unittest.TestCase):
    def test_regression_improvement_and_new_case_are_distinct(self):
        before = report(case(), case(case_id="KYS-CAP-002", status="FAIL"))
        after = report(
            case(status="FAIL"),
            case(case_id="KYS-CAP-002"),
            case(case_id="KYS-CAP-003"),
            run_id="candidate",
        )
        diff = compare_reports(before, after)
        self.assertEqual([x["case_id"] for x in diff["regressions"]], ["KYS-CAP-001"])
        self.assertEqual([x["case_id"] for x in diff["improvements"]], ["KYS-CAP-002"])
        self.assertEqual(diff["added"], ["KYS-CAP-003"])

    def test_pending_or_missing_case_is_never_an_improvement(self):
        diff = compare_reports(report(case()), report(case(status="REVIEW")))
        self.assertFalse(diff["improvements"])
        self.assertEqual(len(diff["other_changes"]), 1)

    def test_report_schema_invalid_status_and_duplicates_are_rejected(self):
        for value in (
            report(case(), case()),
            report(case(status="GREEN")),
            report(case(), schema_version="9"),
        ):
            with self.assertRaises(ValueError):
                validate_report(value)

    def test_different_catalog_is_explicit_not_hidden(self):
        diff = compare_reports(
            report(case()), report(case(), metadata={"catalog_sha256": "changed"})
        )
        self.assertFalse(diff["same_catalog"])
        self.assertFalse(diff["same_sut"])

    def test_new_capability_and_infrastructure_recovery_are_not_bug_fixes(self):
        before = report(
            case(status="ERROR", comparable=False),
            case(case_id="KYS-CAP-002", status="ERROR"),
        )
        after = report(case(), case(case_id="KYS-CAP-002"))
        diff = compare_reports(before, after)
        self.assertFalse(diff["improvements"])
        self.assertEqual(len(diff["capability_changes"]), 1)
        self.assertEqual(len(diff["other_changes"]), 1)

    def test_lost_execution_evidence_is_distinct_from_a_failed_product_contract(self):
        diff = compare_reports(report(case()), report(case(status="ERROR")))
        self.assertFalse(diff["regressions"])
        self.assertEqual(len(diff["lost_evidence"]), 1)


class HumanReviewTests(unittest.TestCase):
    def review(self, **changes):
        value = {
            "run_id": "fixture-run",
            "case_id": "KYS-HUM-001",
            "reviewer": "QA A",
            "verdict": "PASS",
            "evidence": "phone-A/capture.png#sha256",
            "notes": "Real test observation",
        }
        value.update(changes)
        return value

    def test_import_is_immutable_and_identified(self):
        original = report(case(case_id="KYS-HUM-001", adapter="human", status="REVIEW"))
        result = apply_human_reviews(original, [self.review()])
        self.assertEqual(original["cases"][0]["status"], "REVIEW")
        self.assertEqual(result["cases"][0]["status"], "PASS")
        self.assertEqual(result["cases"][0]["human_review"]["reviewer"], "QA A")

    def test_human_cannot_override_machine_failure(self):
        with self.assertRaises(ValueError):
            apply_human_reviews(
                report(case(status="FAIL")), [self.review(case_id="KYS-CAP-001")]
            )

    def test_incomplete_foreign_duplicate_and_fake_verdict_are_rejected(self):
        original = report(case(case_id="KYS-HUM-001", adapter="human", status="REVIEW"))
        for changes in (
            {"run_id": "other"},
            {"reviewer": ""},
            {"evidence": ""},
            {"notes": ""},
            {"verdict": "PERFECT"},
        ):
            with self.assertRaises(ValueError):
                apply_human_reviews(original, [self.review(**changes)])
        with self.assertRaises(ValueError):
            apply_human_reviews(original, [self.review(), self.review()])


class EvidenceTests(unittest.TestCase):
    def test_common_secrets_are_redacted(self):
        values = [
            "Bearer abc123-token",
            "eyJhbGci.aabbcc.signature",
            "sb_secret_abc123",
            "ghp_ABCdef123",
            '"password": "not-public"',
            '"access_token":"not-public"',
            "postgresql://user:not-public@localhost/test",
        ]
        for value in values:
            self.assertIn("REDACTED", redact(value))

    def test_sha256_matches_external_known_reference(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "abc.txt"
            path.write_bytes(b"abc")
            self.assertEqual(
                digest(path),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            )

    def test_report_escapes_html_and_preserves_junit_and_hashes(self):
        item = case(
            status="FAIL",
            title='<script>alert("x")</script>',
            observed="Bearer do-not-publish",
        )
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            value = report(item)
            write_report(value, output, POLICY)
            page = (output / "report.html").read_text()
            self.assertNotIn('<script>alert("x")</script>', page)
            self.assertIn("&lt;script&gt;", page)
            self.assertNotIn("do-not-publish", (output / "report.json").read_text())
            xml = ET.parse(output / "junit.xml").getroot()
            self.assertEqual(xml.attrib["failures"], "1")
            self.assertEqual(
                xml.find("testcase").attrib["name"],
                'KYS-CAP-001 <script>alert("x")</script>',
            )
            manifest = json.loads((output / "manifest.sha256.json").read_text())
            for name, expected in manifest.items():
                self.assertEqual(digest(output / name), expected)
            self.assertEqual(
                digest(output / value["cases"][0]["evidence_file"]),
                value["cases"][0]["evidence_sha256"],
            )

    def test_report_human_and_blocked_cases_are_junit_skips(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            write_report(
                report(
                    case(status="REVIEW"), case(case_id="KYS-CAP-002", status="BLOCKED")
                ),
                output,
                POLICY,
            )
            self.assertEqual(
                len(ET.parse(output / "junit.xml").findall("testcase/skipped")), 2
            )

    def test_existing_evidence_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            (path / "evidence.txt").write_text("original")
            with self.assertRaises(ValueError):
                new_output(path)
            self.assertEqual((path / "evidence.txt").read_text(), "original")

    def test_production_output_paths_are_rejected(self):
        with self.assertRaises(ValueError):
            new_output(QA.parent / "src/qa-report")

    def test_other_checkout_source_is_protected_too(self):
        with tempfile.TemporaryDirectory() as temp:
            sut = Path(temp) / "other-checkout"
            with self.assertRaises(ValueError):
                new_output(sut / "src/new-folder", sut)
            self.assertFalse((sut / "src/new-folder").exists())


class AdapterTests(unittest.TestCase):
    def probe(self, status="passed", rep=1):
        return {
            "testResults": [
                {
                    "assertionResults": [
                        {
                            "fullName": f"[KYS-CAP-001] repetición {rep}: fixture",
                            "status": status,
                            "duration": 2,
                            "failureMessages": [],
                        }
                    ]
                }
            ]
        }

    def test_expected_repetitions_are_required(self):
        self.assertEqual(probe_results(self.probe(), [case()], 3)[0]["status"], "ERROR")
        self.assertEqual(probe_results(self.probe(), [case()], 1)[0]["status"], "PASS")

    def test_duplicate_repetition_cannot_fake_coverage(self):
        raw = self.probe()
        raw["testResults"][0]["assertionResults"] *= 3
        self.assertEqual(probe_results(raw, [case()], 3)[0]["status"], "ERROR")

    def test_failed_assertion_is_a_failure_and_static_is_labeled(self):
        result = probe_results(self.probe("failed"), [case(operation="source")], 1)[0]
        self.assertEqual(
            (result["status"], result["evidence_kind"]), ("FAIL", "static_analysis")
        )

    def test_missing_suite_is_error_not_a_product_pass(self):
        self.assertEqual(probe_results({}, [case()], 3)[0]["status"], "ERROR")

    def test_command_failure_and_secret_logs_are_retained_safely(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            result = execute(
                [
                    sys.executable,
                    "-c",
                    "print('Bearer private-test-token'); raise SystemExit(4)",
                ],
                output,
                output / "log.txt",
                os.environ.copy(),
                10,
            )
            self.assertEqual(result["exit_code"], 4)
            self.assertNotIn("private-test-token", (output / "log.txt").read_text())
            self.assertEqual(result["log_sha256"], digest(output / "log.txt"))

    def test_timeout_is_an_infrastructure_error_not_fake_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            result = execute(
                [sys.executable, "-c", "import time; time.sleep(10)"],
                output,
                output / "log.txt",
                os.environ.copy(),
                1,
            )
            self.assertIsNone(result["exit_code"])
            self.assertEqual(result["outcome"], "timeout")
            self.assertIn("process group", (output / "log.txt").read_text())


if __name__ == "__main__":
    unittest.main()
