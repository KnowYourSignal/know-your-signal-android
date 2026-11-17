from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gps import EmulatorGps


class ConsoleFixtureTests(unittest.TestCase):
    def test_refuses_ambiguous_and_physical_serials(self):
        for argv in (
            ["adb"],
            ["adb", "-s", "physical"],
            ["adb", "-s", "192.168.1.2:5555"],
        ):
            with self.assertRaises(ValueError):
                EmulatorGps(argv, Path("unused.json"))

    def test_console_command_failure_is_not_a_position(self):
        with patch(
            "gps.subprocess.run",
            return_value=subprocess.CompletedProcess([], 0, "KO: unsupported", ""),
        ):
            with self.assertRaises(ValueError):
                EmulatorGps(["adb", "-s", "emulator-5554"], Path("unused.json")).send()

    def test_fixture_stops_and_records_synthetic_scope_without_bypass(self):
        with tempfile.TemporaryDirectory() as temp, patch(
            "gps.subprocess.run",
            return_value=subprocess.CompletedProcess([], 0, "OK\n", ""),
        ) as command:
            log = Path(temp) / "fixture.json"
            with EmulatorGps(["adb", "-s", "emulator-5554"], log) as gps:
                self.assertEqual(gps.sent, 1)
            self.assertFalse(gps.thread.is_alive())
            self.assertIn('"anti_mock_bypassed": false', log.read_text())
            self.assertIn("geo", command.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
