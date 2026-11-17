from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native_backend import NAMES, native_cases


class NativeEvidenceTests(unittest.TestCase):
    def raw(self):
        return {
            "scope": "isolated native PostgreSQL; not Cloud/Android SLA",
            "postgis_schema": "public",
            "checks": [
                {"name": name, "passed": True, "elapsed_ms": 12} for name in NAMES
            ],
        }

    def test_original_checks_are_converted_without_new_product_assertions(self):
        cases = native_cases(self.raw())
        self.assertEqual(len(cases), 10)
        self.assertTrue(all(c["status"] == "PASS" for c in cases))
        self.assertTrue(all("not end-to-end" in c["limitation"] for c in cases))

    def test_original_failure_is_retained(self):
        value = self.raw()
        value["checks"][0].update(passed=False, error="test assertion")
        self.assertEqual(native_cases(value)[0]["status"], "FAIL")

    def test_wrong_scope_missing_or_duplicate_native_check_is_rejected(self):
        for field, value in [
            ("scope", "production"),
            ("postgis_schema", "unknown"),
            ("checks", []),
        ]:
            with self.assertRaises(ValueError):
                native_cases({**self.raw(), field: value})
        raw = self.raw()
        raw["checks"][1] = raw["checks"][0]
        with self.assertRaises(ValueError):
            native_cases(raw)

    def test_truthy_string_and_nan_do_not_become_verified_results(self):
        for changes in ({"passed": "true"}, {"elapsed_ms": float("nan")}):
            raw = self.raw()
            raw["checks"][0].update(changes)
            with self.assertRaises(ValueError):
                native_cases(raw)

    def test_original_stop_keeps_failure_and_marks_later_checks_blocked(self):
        raw = self.raw()
        raw["checks"] = raw["checks"][:3]
        raw["checks"][-1].update(passed=False, error="original assertion")
        raw["error"] = "original assertion"
        cases = native_cases(raw, allow_incomplete=True)
        self.assertEqual([c["status"] for c in cases[:3]], ["PASS", "PASS", "FAIL"])
        self.assertTrue(all(c["status"] == "BLOCKED" for c in cases[3:]))

    def test_guard_or_environment_failure_does_not_invent_sql_execution(self):
        raw = {
            "scope": "isolated native PostgreSQL; not Cloud/Android SLA",
            "checks": [],
            "error": "disposable guard refused target",
        }
        cases = native_cases(raw, allow_incomplete=True)
        self.assertTrue(
            all(c["status"] == "BLOCKED" and c["attempts"] == [] for c in cases)
        )


if __name__ == "__main__":
    unittest.main()
