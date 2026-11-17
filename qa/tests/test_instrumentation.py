from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from instrumentation import native_android_cases, parse_raw


class RawInstrumentationTests(unittest.TestCase):
    def raw(self, code=0):
        return f"INSTRUMENTATION_STATUS: class=com.example.Test\nINSTRUMENTATION_STATUS: test=leaf\nINSTRUMENTATION_STATUS_CODE: 1\nINSTRUMENTATION_STATUS: class=com.example.Test\nINSTRUMENTATION_STATUS: test=leaf\nINSTRUMENTATION_STATUS: stack=reason\nINSTRUMENTATION_STATUS_CODE: {code}\n"

    def test_android_codes_have_explicit_different_meanings(self):
        for code, expected in [
            (0, "PASS"),
            (-1, "ERROR"),
            (-2, "FAIL"),
            (-3, "BLOCKED"),
            (-4, "BLOCKED"),
            (-9, "ERROR"),
        ]:
            self.assertEqual(
                parse_raw(self.raw(code))["com.example.Test", "leaf"]["status"],
                expected,
            )

    def test_summary_only_cannot_invent_named_test_evidence(self):
        registry = {
            "cases": [
                {
                    "case_id": "KYS-ROOM-001",
                    "class": "com.example.Test",
                    "method": "leaf",
                    "source": "test.kt",
                }
            ]
        }
        self.assertEqual(
            native_android_cases("OK (15 tests)", registry)[0]["status"], "ERROR"
        )

    def test_duplicate_completions_are_refused(self):
        with self.assertRaises(ValueError):
            parse_raw(self.raw() + self.raw())

    def test_unknown_test_does_not_silently_escape_catalog(self):
        registry = {
            "cases": [
                {
                    "case_id": "KYS-ROOM-001",
                    "class": "different.Test",
                    "method": "leaf",
                    "source": "test.kt",
                }
            ]
        }
        self.assertEqual(
            native_android_cases(self.raw(), registry)[0]["status"], "ERROR"
        )

    def test_runner_start_is_not_a_completed_test(self):
        self.assertEqual(
            parse_raw(
                self.raw().split("INSTRUMENTATION_STATUS_CODE: 1")[0]
                + "INSTRUMENTATION_STATUS_CODE: 1"
            ),
            {},
        )


if __name__ == "__main__":
    unittest.main()
