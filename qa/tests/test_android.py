"""Prove the Android adapter does not turn adb exit=0 or a skip into PASS."""

from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from android import assert_emulator, parse_instrumentation


class AndroidContractTests(unittest.TestCase):
    def state(self, text, code=0, outcome="completed"):
        return parse_instrumentation(text, code, outcome)[0]

    def test_real_success_requires_nonempty_ok_record(self):
        self.assertEqual(
            self.state("INSTRUMENTATION_STATUS_CODE: 0\nOK (1 test)\n"), "PASS"
        )
        self.assertEqual(self.state("OK (15 tests)\n"), "PASS")

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

    def test_timeout_is_infrastructure_error(self):
        self.assertEqual(self.state("", None, "timeout"), "ERROR")

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
