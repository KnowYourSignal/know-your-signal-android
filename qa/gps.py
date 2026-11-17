"""Bounded, explicitly synthetic emulator-console position fixture.

Android's production mock checks are not disabled or patched. The native journey
observes the fix flags and declares the fixture blocked if incompatible.
"""

import json
import re
import subprocess
import threading
from pathlib import Path
from core import redact


class EmulatorGps:
    def __init__(self, adb: list[str], log: Path):
        if len(adb) != 3 or adb[1] != "-s" or not re.fullmatch(r"emulator-\d+", adb[2]):
            raise ValueError("Console GPS fixture requires an explicit emulator serial")
        self.adb, self.log = adb, log
        self.stopping = threading.Event()
        self.thread = None
        self.sent, self.failures = 0, []

    def send(self):
        result = subprocess.run(
            self.adb + ["emu", "geo", "fix", "-70.65012", "-33.45012", "520", "8"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode or "OK" not in result.stdout or "KO:" in result.stdout:
            raise ValueError(
                "Emulator console did not accept the declared synthetic position: "
                + redact(result.stdout + result.stderr)[-500:]
            )
        self.sent += 1

    def __enter__(self):
        self.send()

        def repeat():
            while not self.stopping.wait(0.8):
                try:
                    self.send()
                except (OSError, ValueError, subprocess.TimeoutExpired) as error:
                    self.failures.append(redact(str(error)))
                    return

        self.thread = threading.Thread(target=repeat, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.stopping.set()
        if self.thread:
            self.thread.join(timeout=6)
        self.log.parent.mkdir(parents=True, exist_ok=True)
        self.log.write_text(
            json.dumps(
                {
                    "synthetic": True,
                    "method": "emulator console geo fix",
                    "positions_sent": self.sent,
                    "failures": self.failures,
                    "anti_mock_bypassed": False,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
