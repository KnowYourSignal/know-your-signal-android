import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from benchmark import catalog_metrics, nearest_rank, safe_path


class BenchmarkTests(unittest.TestCase):
    def case(self, id, status="PASS", adapter="jest-contract", attempts=None):
        return {"case_id": id, "status": status, "adapter": adapter, "severity": "critical", "required": True,
                "attempts": attempts if attempts is not None else [{"status": status}] * 3}

    def test_reviews_stay_in_denominator_and_repetitions_are_not_cases(self):
        result = catalog_metrics([self.case("a"), self.case("b", "FAIL"), self.case("c", "REVIEW")])
        self.assertEqual(result["automatic"]["total"], 3)
        self.assertAlmostEqual(result["automatic"]["pass_percent"], 33.3333)
        self.assertEqual(result["attempts"], 9)

    def test_human_and_tools_never_inflate_product_pass_rate(self):
        result = catalog_metrics([self.case("a", "FAIL"), self.case("h", "REVIEW", "human"), self.case("tool", adapter="trusted-command")])
        self.assertEqual(result["automatic"]["total"], 1)
        self.assertEqual(result["automatic"]["pass_percent"], 0)
        self.assertEqual(result["catalog_total"], 2)
        self.assertEqual(result["supplementary"]["PASS"], 1)

    def test_consistent_failure_is_not_success_and_flakiness_is_visible(self):
        result = catalog_metrics([self.case("failed", "FAIL"), self.case("flaky", attempts=[{"status": "PASS"}, {"status": "FAIL"}])])
        self.assertEqual(result["stable_case_count"], 1)
        self.assertEqual(result["stability_percent"], 50)
        self.assertEqual(result["automatic"]["PASS"], 1)

    def test_duplicate_and_unknown_case_verdicts_are_rejected(self):
        with self.assertRaises(ValueError):
            catalog_metrics([self.case("same"), self.case("same")])
        with self.assertRaises(ValueError):
            catalog_metrics([self.case("a", "SUCCESS")])

    def test_no_cases_does_not_mean_one_hundred_percent(self):
        self.assertIsNone(catalog_metrics([])["automatic"]["pass_percent"])

    def test_small_sample_p95_is_the_maximum_without_extra_precision(self):
        self.assertEqual(nearest_rank([9, 1, 8, 2, 7, 3, 6, 4, 5, 10], .95), 10)
        for bad in ([True], [float("nan")], [-1], ["2"], []):
            with self.assertRaises(ValueError):
                nearest_rank(bad, .95)

    def test_untrusted_evidence_paths_cannot_escape_the_package(self):
        root = Path("/tmp/benchmark-evidence").resolve()
        for path in ("../secret", "/etc/passwd", "a\\b"):
            with self.assertRaises(ValueError):
                safe_path(root, path)


if __name__ == "__main__":
    unittest.main()
