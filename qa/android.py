#!/usr/bin/env python3
"""Collect independent UI journeys without hiding the first failed scenario.

This adapter may change Wi-Fi/permissions ONLY inside an Android emulator with
the isolated com.knowyoursignal.uitest application. It refuses physical phones.
No original journey/assertion/production component is modified by this runner.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid

from core import digest, redact
from reporting import write_json, write_report
from robot import execute, metadata, new_output, QA, REPO
from metrics import map_proxy_case
from evidence import collect_changed_files
from gps import EmulatorGps
from instrumentation import parse_raw

PACKAGE = "com.knowyoursignal.uitest"
RUNNER = PACKAGE + ".test/androidx.test.runner.AndroidJUnitRunner"
# The source journeys use a real isolated Room DB. Some later journeys need the
# TWO records produced by CaptureJourneyTest; they must not be called passed or
# failed if this precondition was not established.
PHASES = [
    (
        "KYS-ANDROID-001",
        "map-permission",
        "MapPermissionJourneyTest",
        False,
        "ROADMAP-B1",
    ),
    ("KYS-ANDROID-002", "capture", "CaptureJourneyTest", False, "ROADMAP-A1/B5"),
    (
        "KYS-ANDROID-010",
        "gnss-capture",
        "GnssCaptureJourneyTest",
        False,
        "ROADMAP-A1/B5-POSITIVE-FIXTURE",
    ),
    ("KYS-ANDROID-003", "guide", "GuideJourneyTest", False, "ROADMAP-B5"),
    ("KYS-ANDROID-004", "restore", "HistoryRestoreTest", True, "ROADMAP-B4"),
    ("KYS-ANDROID-005", "community", "CommunityMapTest", False, "ROADMAP-C4"),
    (
        "KYS-ANDROID-006",
        "accessibility",
        "AccessibilityJourneyTest",
        True,
        "ROADMAP-B5",
    ),
    ("KYS-ANDROID-007", "quality", "CaptureQualityTest", False, "ROADMAP-A1"),
    ("KYS-ANDROID-008", "permissions", "PermissionsJourneyTest", True, "ROADMAP-A1/B4"),
]


def parse_instrumentation(
    text: str, exit_code: int | None, outcome: str, expected_class: str | None = None
) -> tuple[str, str]:
    """am instrument can return exit 0 even when assertions fail: parse evidence."""
    if re.search(r"FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed|shortMsg=", text):
        return (
            "FAIL",
            "The existing Android journey reported a failure; inspect the log and screenshot",
        )
    try:
        records = parse_raw(text)
    except ValueError as error:
        return "ERROR", str(error)
    if expected_class and any(cls != expected_class for cls, _ in records):
        return "ERROR", "Raw instrumentation completed a different class than requested"
    if any(r["status"] in {"FAIL", "ERROR"} for r in records.values()):
        return "FAIL", "Raw Android test completion contains an assertion error or test failure"
    if outcome != "completed" or exit_code is None:
        return "ERROR", "ADB command unavailable or timed out; not a product verdict"
    if "[QA_CAPABILITY_BLOCKED]" in text or any(
        r["status"] == "BLOCKED" for r in records.values()
    ):
        return (
            "BLOCKED",
            "Android reported an ignored/assumption test or a blocked fixture capability; the scenario was not verified. Production anti-mock is unchanged.",
        )
    ok = re.search(r"^OK \((\d+) tests?\)\s*$", text, re.MULTILINE)
    if (
        exit_code == 0
        and records
        and ok
        and int(ok[1]) > 0
        and int(ok[1]) == len(records)
        and all(r["status"] == "PASS" for r in records.values())
        and re.search(r"^INSTRUMENTATION_CODE: -1\s*$", text, re.MULTILINE)
        and not re.search(
            r"AssumptionViolated|INSTRUMENTATION_STATUS_CODE: -[1234]", text
        )
    ):
        return (
            "PASS",
            f"{ok[1]} Android test(s) completed in the declared emulator fixture",
        )
    return (
        "ERROR",
        "No complete named raw Android success record; a dots-only OK summary, skip or missing completion is not PASS",
    )


def positive_capture_proof(output: Path, attachments: list[dict]) -> tuple[bool, str]:
    """A skipped JUnit test must never establish the two-record prerequisite."""
    candidates = [a for a in attachments if a.get("label") == "console-gnss-fixture.json"]
    if len(candidates) != 1:
        return False, "Missing unique journey completion evidence"
    try:
        proof = json.loads((output / candidates[0]["path"]).read_text())
    except (OSError, ValueError, KeyError):
        return False, "Unreadable journey completion evidence"
    if not (
        proof.get("completed") is True
        and proof.get("mock_flag") is False
        and proof.get("production_anti_mock_unchanged") is True
        and proof.get("local_records") == 2
        and proof.get("exported_png_verified") is True
        and not isinstance(proof.get("accuracy_m"), bool)
        and isinstance(proof.get("accuracy_m"), (int, float))
        and 0 < proof["accuracy_m"] < 10
    ):
        return False, "Console GNSS journey did not prove two local records and the actual PNG flow"
    pngs = [a for a in attachments if a.get("label") == "evidence-current-console-synthetic.png"]
    if len(pngs) != 1:
        return False, "Actual journey-produced PNG attachment is missing"
    png = output / pngs[0]["path"]
    try:
        valid_png = png.stat().st_size > 100 and png.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
    except OSError:
        valid_png = False
    if not valid_png or proof.get("png_sha256") != digest(png):
        return False, "PNG bytes do not match the completed journey proof"
    return True, "Two local records and the exported PNG were verified by the completed journey"


def assert_emulator(adb, serial: str):
    if not re.fullmatch(r"emulator-\d+", serial):
        raise ValueError("Only an explicit emulator-N serial is permitted")
    process = subprocess.run(
        [adb, "-s", serial, "shell", "getprop", "ro.kernel.qemu"],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if process.returncode or process.stdout.strip() != "1":
        raise ValueError("Refusing changes: target is not a verified Android emulator")
    process = subprocess.run(
        [adb, "-s", serial, "shell", "pm", "path", PACKAGE],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if process.returncode or not process.stdout.strip().startswith("package:"):
        raise ValueError("Isolated uitest package is not installed")


def snapshot(adb: list[str], output: Path, phase: str):
    folder = output / "device" / phase
    folder.mkdir(parents=True, exist_ok=True)
    image = subprocess.run(
        adb + ["exec-out", "screencap", "-p"], capture_output=True, timeout=20
    )
    if image.returncode == 0 and image.stdout.startswith(b"\x89PNG\r\n\x1a\n"):
        (folder / "post-instrumentation-screen.png").write_bytes(image.stdout)
    execute(
        adb + ["shell", "uiautomator", "dump", "/sdcard/kys-robot-window.xml"],
        REPO,
        folder / "dump.log",
        os.environ.copy(),
        25,
    )
    xml = subprocess.run(
        adb + ["shell", "cat", "/sdcard/kys-robot-window.xml"],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if xml.returncode == 0:
        (folder / "post-instrumentation-window.xml").write_text(
            redact(xml.stdout), encoding="utf-8"
        )


def run(args):
    adb_executable = shutil.which("adb")
    if not adb_executable:
        raise ValueError("adb not installed")
    assert_emulator(adb_executable, args.serial)
    output = new_output(args.output)
    adb = [adb_executable, "-s", args.serial]
    policy = json.loads((QA / "config/policy.json").read_text())
    catalog = json.loads((QA / "cases/catalog.json").read_text())
    meta = metadata(REPO, catalog, 1)
    meta.update(
        android_serial=args.serial,
        synthetic=True,
        limitation="Existing UiAutomator fixture; simulated GPS and local HTTPS server. Does not replace the two physical phones required by the roadmap.",
    )
    run_id = (
        "kys-android-"
        + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        + "-"
        + uuid.uuid4().hex[:6]
    )
    results = []
    capture_passed = False
    fixture_case = None
    seen_files = {}
    permission_help = execute(
        adb + ["shell", "pm", "help"], REPO, output / "logs/permission-capabilities.log",
        os.environ.copy(), 25,
    )
    supports_flag_reset = (
        permission_help["exit_code"] == 0
        and "clear-permission-flags" in (output / "logs/permission-capabilities.log").read_text()
    )
    meta["permission_flag_reset_supported"] = supports_flag_reset
    deadline = time.monotonic() + policy["android_campaign_budget_seconds"]
    for ident, phase, cls, needs_capture, requirement in PHASES:
        case = {
            "case_id": ident,
            "title": phase,
            "requirement_id": requirement,
            "category": "android-ui",
            "adapter": "android-instrumentation",
            "operation": "journey",
            "severity": "high",
            "required": phase != "gnss-capture",
            "setup": "Isolated uitest package on an emulator; synthetic fixtures",
            "input": {"class": cls, "requires_capture_fixture": needs_capture},
            "expected": "Existing journey finishes with OK (>0 tests), no failures or assumptions",
            "evaluators": ["instrumentation-result", "dependency-precondition"],
            "sources": ["Hoja de ruta A/B/C", "Existing Android source journey"],
            "evidence_kind": "android_emulator",
            "attempts": [],
        }
        if needs_capture and not capture_passed:
            case.update(
                status="BLOCKED",
                observed="CaptureJourney did not establish its two-record prerequisite. This dependent journey was not executed.",
            )
            results.append(case)
            continue
        if needs_capture:
            case["dependency_satisfied_by"] = fixture_case
        remaining = deadline - time.monotonic()
        if remaining < 75:
            case.update(
                status="BLOCKED",
                observed="Declared emulator campaign time budget exhausted; scenario not executed. Earlier evidence is retained.",
            )
            results.append(case)
            continue
        print("Android Robot: " + phase, flush=True)
        # These are declared preconditions from the pre-existing CI, never a
        # retry or modified assertion to make a failed journey pass.
        preconditions = [["shell", "am", "force-stop", PACKAGE]]
        if phase in {"capture", "permissions"}:
            preconditions += [
                ["shell", "pm", "revoke", PACKAGE, "android.permission." + name]
                for name in ("ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION")
            ]
            if phase == "permissions" and supports_flag_reset:
                preconditions += [
                    [
                        "shell",
                        "pm",
                        "clear-permission-flags",
                        PACKAGE,
                        "android.permission." + name,
                        "user-set",
                        "user-fixed",
                    ]
                    for name in ("ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION")
                ]
        if phase == "restore":
            preconditions += [
                ["shell", "svc", "wifi", "disable"],
                ["shell", "svc", "data", "disable"],
            ]
        else:
            preconditions += [
                ["shell", "svc", "wifi", "enable"],
                ["shell", "svc", "data", "enable"],
            ]
        pre_runs = [
            execute(
                adb + cmd,
                REPO,
                output / "logs" / f"{phase}-pre-{i}.log",
                os.environ.copy(),
                25,
            )
            for i, cmd in enumerate(preconditions)
        ]
        if any(r["exit_code"] != 0 for r in pre_runs):
            case.update(
                status="ERROR",
                observed="A declared emulator precondition failed; journey was not executed",
                preconditions=pre_runs,
            )
        else:
            command = adb + [
                "shell",
                "am",
                "instrument",
                "-w",
                "-r",
                "-e",
                "class",
                "com.knowyoursignal.ui." + cls,
            ]
            if phase == "restore":
                command += ["-e", "restorePhase", "true"]
            command += [RUNNER]
            timeout = min(
                policy["android_phase_timeout_seconds"],
                max(1, int(deadline - time.monotonic() - 45)),
            )
            log = output / "logs" / (phase + ".log")
            try:
                if phase == "gnss-capture":
                    with EmulatorGps(adb, output / "logs/console-gps.json") as gps:
                        execution = execute(
                            command, REPO, log, os.environ.copy(), timeout
                        )
                    if gps.failures:
                        execution.update(
                            outcome="fixture_failed",
                            raw_exit_code=execution["exit_code"],
                            exit_code=None,
                        )
                else:
                    execution = execute(command, REPO, log, os.environ.copy(), timeout)
            except (OSError, ValueError, subprocess.TimeoutExpired) as error:
                log.parent.mkdir(parents=True, exist_ok=True)
                log.write_text(redact(str(error)), encoding="utf-8")
                execution = {
                    "argv": command,
                    "exit_code": None,
                    "outcome": "fixture_unavailable",
                    "wall_time_ms": 0,
                    "tail": redact(str(error)),
                    "log_sha256": digest(log),
                }
            text = (output / "logs" / (phase + ".log")).read_text()
            state, explanation = parse_instrumentation(
                text, execution["exit_code"], execution["outcome"],
                "com.knowyoursignal.ui." + cls,
            )
            execution["log_file"] = "logs/" + phase + ".log"
            case.update(
                status=state,
                observed=explanation,
                execution=execution,
                attempts=[
                    {
                        "repetition": 1,
                        "status": state,
                        "evaluation_duration_ms": execution["wall_time_ms"],
                        "message": execution["tail"] if state != "PASS" else "",
                    }
                ],
            )
            try:
                snapshot(adb, output, phase)
            except (OSError, subprocess.TimeoutExpired) as error:
                case["snapshot_warning"] = redact(str(error))
            # The original test captures the app before instrumentation teardown.
            # Pull each phase now: a later failure must not overwrite this screen.
            temporary = output / ".phase-pull"
            if temporary.exists():
                shutil.rmtree(temporary)
            pulled = execute(
                adb
                + [
                    "pull",
                    "/sdcard/Android/data/" + PACKAGE + "/files/verification",
                    str(temporary),
                ],
                REPO,
                output / "logs" / (phase + "-evidence-pull.log"),
                os.environ.copy(),
                60,
            )
            if pulled["exit_code"] == 0:
                case["attachments"] = collect_changed_files(
                    temporary, output, phase, seen_files
                )
            else:
                case["evidence_warning"] = (
                    "Journey-produced evidence could not be pulled; inspect pull log"
                )
            if temporary.exists():
                shutil.rmtree(temporary)
            if phase == "gnss-capture" and case["status"] == "PASS":
                proven, proof_reason = positive_capture_proof(output, case.get("attachments", []))
                case["positive_fixture_proof"] = proof_reason
                if not proven:
                    case["status"], case["observed"] = "ERROR", proof_reason
                    case["attempts"][0].update(status="ERROR", message=proof_reason)
        if phase == "capture":
            capture_passed = case["status"] == "PASS"
            if capture_passed:
                fixture_case = ident
        elif phase == "gnss-capture" and case["status"] == "PASS":
            capture_passed, fixture_case = True, ident
        results.append(case)
    # Restore emulator connectivity and collect all artifacts even after failures.
    for service in ("wifi", "data"):
        execute(
            adb + ["shell", "svc", service, "enable"],
            REPO,
            output / "logs" / (service + "-restore.log"),
            os.environ.copy(),
            25,
        )
    execute(
        adb
        + [
            "pull",
            "/sdcard/Android/data/" + PACKAGE + "/files/verification",
            str(output / "journey-evidence"),
        ],
        REPO,
        output / "logs/pull.log",
        os.environ.copy(),
        60,
    )
    # Any fixture file that is textual is passed through the same secret filter.
    for path in output.rglob("*"):
        if path.is_file() and path.suffix in {".json", ".xml", ".log", ".txt"}:
            path.write_text(redact(path.read_text(errors="replace")), encoding="utf-8")
    metric_path = output / "journey-evidence/map-render-benchmark.json"
    try:
        metric = json.loads(metric_path.read_text()) if metric_path.is_file() else None
    except (OSError, ValueError):
        metric = {}
    results.append(map_proxy_case(metric, policy["map_e2e_budget_ms"]))
    meta["application_fingerprint_after"] = metadata(REPO, catalog, 1)[
        "application_fingerprint"
    ]
    if meta["application_fingerprint_after"] != meta["application_fingerprint"]:
        raise ValueError(
            "Application source changed during Android QA; evidence cannot be finalized"
        )
    value = {
        "schema_version": "1.0",
        "run_id": run_id,
        "profile": "android-emulator",
        "metadata": meta,
        "cases": results,
        "applicability": {
            "physical_acceptance": "PENDING",
            "hosted_cloud": "NOT_VERIFIED",
        },
    }
    write_json(output / "policy.json", policy)
    write_report(value, output, policy)
    print(
        json.dumps(
            {
                "gate": value["gate"],
                "counts": value["summary"]["counts"],
                "report": str(output / "report.html"),
            }
        ),
        flush=True,
    )
    return 0 if value["gate"]["decision"] == "PASS" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", type=Path, required=True)
    try:
        raise SystemExit(run(parser.parse_args()))
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print("Android Robot setup error: " + redact(str(error)), file=sys.stderr)
        raise SystemExit(2)
