"""Prove the Android adapter does not turn adb exit=0 or a skip into PASS."""

from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from android import assert_emulator, parse_instrumentation, positive_capture_proof
from core import digest


def raw_completion(code=0, cls="com.knowyoursignal.ui.ExampleTest", method="example"):
    return (
        f"INSTRUMENTATION_STATUS: class={cls}\n"
        f"INSTRUMENTATION_STATUS: test={method}\n"
        f"INSTRUMENTATION_STATUS_CODE: {code}\n"
        "INSTRUMENTATION_RESULT: stream=\nOK (1 test)\n"
        "INSTRUMENTATION_CODE: -1\n"
    )


class AndroidContractTests(unittest.TestCase):
    def state(self, text, code=0, outcome="completed"):
        return parse_instrumentation(text, code, outcome)[0]

    def test_real_success_requires_nonempty_ok_record(self):
        self.assertEqual(self.state(raw_completion()), "PASS")
        self.assertEqual(self.state("OK (15 tests)\n"), "ERROR")
        self.assertEqual(self.state("INSTRUMENTATION_STATUS_CODE: 0\nOK (1 test)\n"), "ERROR")

    def test_actual_dots_only_skipped_gnss_summary_is_not_success(self):
        # AndroidJUnitRunner prints this even when assumeTrue skips the body.
        text = "\ncom.knowyoursignal.ui.GnssCaptureJourneyTest:\ncom.knowyoursignal.ui.GnssCaptureJourneyTest:\n\nTime: 30.133\n\nOK (1 test)\n"
        self.assertEqual(self.state(text), "ERROR")

    def test_raw_assumption_and_ignored_completion_are_blocked(self):
        for code in (-3, -4):
            self.assertEqual(self.state(raw_completion(code)), "BLOCKED")

    def test_missing_runner_completion_or_wrong_class_cannot_pass(self):
        self.assertEqual(self.state(raw_completion().replace("INSTRUMENTATION_CODE: -1", "")), "ERROR")
        self.assertEqual(parse_instrumentation(raw_completion(), 0, "completed", "a.different.Class")[0], "ERROR")

    def test_duplicate_raw_completion_is_not_success(self):
        self.assertEqual(self.state(raw_completion() * 2), "ERROR")

    def test_raw_assertion_failure_beats_a_misleading_ok_summary(self):
        self.assertEqual(self.state(raw_completion(-2)), "FAIL")

    def test_adb_exit_zero_does_not_hide_assertion_failure(self):
        self.assertEqual(self.state("FAILURES!!!\nTests run: 1, Failures: 1\n"), "FAIL")

    def test_process_crash_and_missing_runner_are_not_success(self):
        self.assertEqual(self.state("INSTRUMENTATION_FAILED: Process crashed"), "FAIL")

    def test_empty_skipped_truncated_and_nonzero_are_not_pass(self):
        for text in (
            "",
            "OK (0 tests)\n",
            "OK (1 test)\nINSTRUMENTATION_STATUS_CODE: -3",
            "INSTRUMENTATION_STATUS_CODE: 1",
        ):
            self.assertEqual(self.state(text), "ERROR")
        self.assertEqual(self.state("OK (1 test)\n", 2), "ERROR")

    def test_positive_fixture_needs_completed_two_records_and_matching_png(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            proof = root / "console-gnss-fixture.json"
            png = root / "evidence-current-console-synthetic.png"
            png.write_bytes(b"\x89PNG\r\n\x1a\n" + b"synthetic fixture" * 20)
            attachments = [{"label": p.name, "path": p.name} for p in [proof, png]]
            value = {"completed": True, "local_records": 2, "exported_png_verified": True,
                     "accuracy_m": 5.0, "mock_flag": False, "production_anti_mock_unchanged": True,
                     "png_sha256": digest(png)}
            proof.write_text(json.dumps(value))
            self.assertTrue(positive_capture_proof(root, attachments)[0])
            for key, changed in [("completed", False), ("local_records", 0), ("accuracy_m", True),
                                 ("mock_flag", True), ("png_sha256", "wrong")]:
                proof.write_text(json.dumps({**value, key: changed}))
                self.assertFalse(positive_capture_proof(root, attachments)[0], key)
            proof.write_text(json.dumps(value))
            self.assertFalse(positive_capture_proof(root, attachments[:1])[0])

    def test_timeout_is_infrastructure_error(self):
        self.assertEqual(self.state("", None, "timeout"), "ERROR")

    def test_known_failure_is_retained_if_fixture_also_times_out(self):
        self.assertEqual(self.state(raw_completion(-2), None, "fixture_failed"), "FAIL")
        self.assertEqual(self.state("FAILURES!!!", None, "timeout"), "FAIL")

    def test_unsupported_fixture_never_hides_a_real_failure(self):
        self.assertEqual(self.state("[QA_CAPABILITY_BLOCKED] mock flag"), "BLOCKED")
        self.assertEqual(self.state("FAILURES!!! [QA_CAPABILITY_BLOCKED]"), "FAIL")

    def test_tcp_ip_physical_and_unspecified_targets_are_refused_before_adb(self):
        with patch("android.subprocess.run") as run:
            for serial in ("", "192.168.1.4:5555", "phone-123", "emulator-5554;rm"):
                with self.assertRaises(ValueError):
                    assert_emulator("adb", serial)
            run.assert_not_called()

    def test_physical_hardware_is_refused_even_if_serial_is_spoofed(self):
        with patch(
            "android.subprocess.run",
            return_value=subprocess.CompletedProcess([], 0, "0\n", ""),
        ):
            with self.assertRaises(ValueError):
                assert_emulator("adb", "emulator-5554")

    def test_missing_isolated_package_is_refused(self):
        with patch(
            "android.subprocess.run",
            side_effect=[
                subprocess.CompletedProcess([], 0, "1\n", ""),
                subprocess.CompletedProcess([], 0, "", ""),
            ],
        ):
            with self.assertRaises(ValueError):
                assert_emulator("adb", "emulator-5554")

    def test_verified_emulator_with_isolated_package_is_allowed(self):
        with patch(
            "android.subprocess.run",
            side_effect=[
                subprocess.CompletedProcess([], 0, "1\n", ""),
                subprocess.CompletedProcess(
                    [], 0, "package:/data/app/uitest/base.apk\n", ""
                ),
            ],
        ) as run:
            assert_emulator("adb", "emulator-5554")
            self.assertIn("com.knowyoursignal.uitest", run.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
