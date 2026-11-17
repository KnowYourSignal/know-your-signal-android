#!/usr/bin/env python3
"""Robot QA CLI for the unchanged Know Your Signal application.

Commands are defined here, never supplied by an untrusted test case or report.
All network product tests use the existing disposable/local test environment.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path

from core import (
    ROBOT_VERSION,
    SCHEMA_VERSION,
    aggregate_attempts,
    canonical_hash,
    compare_reports,
    digest,
    redact,
    statistics,
    validate_catalog,
    apply_human_reviews,
    validate_policy,
)
from reporting import write_json, write_report
from backend import aggregate_backend, parse_backend_xml

QA = Path(__file__).resolve().parent
REPO = QA.parent
PROTECTED = [
    "App.tsx",
    "src",
    "android/app/src/main",
    "android/app/src/qa",
    "android/app/build.gradle",
    "android/build.gradle",
    "package.json",
    "package-lock.json",
    "supabase",
]


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True, timeout=30
    )
    if result.returncode:
        raise RuntimeError("Git metadata unavailable: " + redact(result.stderr[-1200:]))
    return result.stdout.strip()


def application_fingerprint(root: Path) -> str:
    files = git(
        root, "ls-files", "--cached", "--others", "--exclude-standard", "--", *PROTECTED
    ).splitlines()
    if not files:
        raise RuntimeError("No application files found")
    sha = hashlib.sha256()
    for name in sorted(files):
        path = root / name
        if not path.is_file():
            raise RuntimeError("Tracked app file missing: " + name)
        sha.update(name.encode() + b"\0" + path.read_bytes() + b"\0")
    return sha.hexdigest()


def execute(args: list[str], cwd: Path, log: Path, env: dict, timeout: int) -> dict:
    started = time.perf_counter()
    log.parent.mkdir(parents=True, exist_ok=True)
    outcome = "completed"
    try:
        process = subprocess.Popen(
            args,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            start_new_session=True,
        )
        try:
            stdout, stderr = process.communicate(timeout=timeout)
            code = process.returncode
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
            code, outcome = None, "timeout"
            stderr += "\nQA command exceeded its declared time limit; its process group was terminated."
    except subprocess.TimeoutExpired as error:
        code, outcome = None, "timeout"
        stdout = error.stdout or ""
        stderr = error.stderr or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode(errors="replace")
        if isinstance(stderr, bytes):
            stderr = stderr.decode(errors="replace")
        stderr += "\nQA command exceeded its declared time limit."
    except OSError as error:
        code, outcome, stdout, stderr = None, "unavailable", "", str(error)
    content = redact(stdout + "\n" + stderr)
    log.write_text(content, encoding="utf-8")
    return {
        "argv": args,
        "exit_code": code,
        "outcome": outcome,
        "wall_time_ms": round((time.perf_counter() - started) * 1000, 3),
        "log_file": str(log),
        "log_sha256": digest(log),
        "tail": content[-4000:],
    }


def metadata(root: Path, catalog: dict, repetitions: int) -> dict:
    revision = git(root, "rev-parse", "HEAD")
    changed = git(root, "status", "--porcelain", "--", *PROTECTED)
    versions = {}
    for command in ("node", "npm", "git"):
        executable = shutil.which(command)
        if executable:
            value = subprocess.run(
                [executable, "--version"], capture_output=True, text=True, timeout=15
            )
            versions[command] = value.stdout.strip()
        else:
            versions[command] = None
    return {
        "sut_revision": revision,
        "sut_application_dirty": bool(changed),
        "application_fingerprint": application_fingerprint(root),
        "robot_version": ROBOT_VERSION,
        "robot_revision": git(REPO, "rev-parse", "HEAD"),
        "robot_sources_sha256": {
            str(p.relative_to(QA)): digest(p)
            for p in sorted(QA.rglob("*"))
            if p.is_file() and not any(x in p.parts for x in ("reports", "__pycache__"))
        },
        "catalog_sha256": canonical_hash(catalog),
        "policy_sha256": digest(QA / "config/policy.json"),
        "sources_sha256": digest(QA / "registry/sources.json"),
        "repetitions": repetitions,
        "seed": catalog["seed"],
        "environment": f"{platform.system()} {platform.release()}, Python {platform.python_version()}",
        "tools": versions,
        "model": None,
        "prompt": None,
        "model_reason": "No LLM/RAG in this Android SUT. Semantic/AI safety metrics require a real model adapter and calibration before use.",
    }


def new_output(path: Path, sut_root: Path | None = None):
    path = path.resolve()
    if path.exists() and any(path.iterdir()):
        raise ValueError(
            "Output directory must be new or empty; previous evidence is immutable"
        )
    for root in {REPO, (sut_root or REPO).resolve()}:
        for protected in PROTECTED:
            candidate = root / protected
            if path == candidate or candidate in path.parents:
                raise ValueError("Reports cannot be written over application files")
    path.mkdir(parents=True, exist_ok=True)
    return path


def probe_results(raw: dict, items: list[dict], repetitions: int) -> list[dict]:
    attempts: dict[str, list] = {c["case_id"]: [] for c in items}
    for suite in raw.get("testResults", []):
        for result in suite.get("assertionResults", []):
            match = re.search(
                r"\[(KYS-[A-Z]+-\d{3})\] repetición (\d+)", result.get("fullName", "")
            )
            if not match or match[1] not in attempts:
                continue
            messages = "\n".join(result.get("failureMessages", []))
            status = {"passed": "PASS", "failed": "FAIL"}.get(
                result.get("status"), "BLOCKED"
            )
            if (
                "[QA_UNSUPPORTED_CAPABILITY]" in messages
                or "[QA_SETUP_ERROR]" in messages
            ):
                status = "ERROR"
            attempts[match[1]].append(
                {
                    "repetition": int(match[2]),
                    "status": status,
                    "evaluation_duration_ms": result.get("duration") or 0,
                    "message": redact(messages)[:5000],
                }
            )
    results = []
    for item in items:
        observations = attempts[item["case_id"]]
        seen = [a["repetition"] for a in observations]
        if sorted(seen) != list(range(1, repetitions + 1)):
            observations.append(
                {
                    "repetition": 0,
                    "status": "ERROR",
                    "evaluation_duration_ms": 0,
                    "message": "Missing, skipped or duplicate probe executions; this case is not verified",
                }
            )
        status = aggregate_attempts(observations, repetitions)
        messages = [a["message"] for a in observations if a["message"]]
        static = item["operation"] == "source"
        result = {
            **item,
            "status": status,
            "attempts": observations,
            "evidence_kind": (
                "static_analysis"
                if static
                else (
                    "component_contract"
                    if item["adapter"] == "jest-ui"
                    else "executed_domain_contract"
                )
            ),
            "observed": (
                messages[0][:1800]
                if messages
                else "All declared repetitions met the expected contract"
            ),
            "evaluation_latency_ms": statistics(
                [a["evaluation_duration_ms"] for a in observations]
            ),
            "consistency": len({a["status"] for a in observations}) == 1,
        }
        if any("[QA_UNSUPPORTED_CAPABILITY]" in message for message in messages):
            result["comparable"] = False
        if static:
            result["interpretation"] = (
                "Static diagnostic on actual source. A passing pattern check is not runtime proof. Investigate failed invariants with the team."
            )
            if item.get("requires_interpretation") and status == "FAIL":
                result["raw_automated_status"] = status
                result["status"] = "REVIEW"
                result["observed"] = (
                    "Static pattern observed; technical interpretation required. "
                    + item["review_reason"]
                )
        results.append(result)
    return results


def supplementary(
    ident: str,
    title: str,
    command: list[str],
    root: Path,
    output: Path,
    env: dict,
    policy: dict,
    category="toolchain",
):
    log = output / "logs" / (ident + ".log")
    run = execute(command, root, log, env, policy["command_timeout_seconds"])
    status = (
        "PASS"
        if run["exit_code"] == 0
        else "ERROR" if run["exit_code"] is None else "FAIL"
    )
    return {
        "case_id": ident,
        "title": title,
        "requirement_id": "QA-REPRODUCIBILITY",
        "category": category,
        "adapter": "trusted-command",
        "operation": "command",
        "severity": "high",
        "required": True,
        "setup": "Installed repository test dependencies; no hosted database",
        "input": {"argv": command},
        "expected": "Exit code 0 and a complete test execution",
        "evaluators": ["exit-code", "tool-report"],
        "sources": ["Hoja de ruta p.4", "C5 planificación QA"],
        "status": status,
        "evidence_kind": "toolchain" if category == "toolchain" else "existing_suite",
        "observed": (
            "Command completed successfully"
            if status == "PASS"
            else run["tail"][-1800:]
        ),
        "attempts": [
            {
                "repetition": 1,
                "status": status,
                "evaluation_duration_ms": run["wall_time_ms"],
                "message": run["tail"] if status != "PASS" else "",
            }
        ],
        "execution": {**run, "log_file": str(log.relative_to(output))},
    }


def run_campaign(args) -> int:
    catalog = json.loads((QA / "cases/catalog.json").read_text())
    policy = json.loads((QA / "config/policy.json").read_text())
    errors = validate_catalog(catalog) + validate_policy(policy)
    if errors:
        raise ValueError("Invalid catalog:\n" + "\n".join(errors))
    repeats = (
        args.repetitions if args.repetitions is not None else policy["repetitions"]
    )
    if not 1 <= repeats <= policy["max_repetitions"]:
        raise ValueError("Repetitions outside policy")
    root = Path(args.sut_root).resolve()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = f"kys-{stamp}-{uuid.uuid4().hex[:6]}"
    output = new_output(
        Path(args.output) if args.output else QA / "reports" / run_id, root
    )
    meta = metadata(root, catalog, repeats)
    write_json(output / "catalog.json", catalog)
    write_json(output / "policy.json", policy)
    write_json(
        output / "sources.json", json.loads((QA / "registry/sources.json").read_text())
    )
    env = {
        **os.environ,
        "KYS_QA_SUT_ROOT": str(root),
        "KYS_QA_REPETITIONS": str(repeats),
        "CI": "true",
    }
    print(
        f'Robot QA {ROBOT_VERSION}: {run_id}, app {meta["sut_revision"][:12]}, {repeats} repetitions',
        flush=True,
    )
    raw_path = output / "raw" / "probes.json"
    raw_path.parent.mkdir()
    command = [
        "node",
        str(REPO / "node_modules/jest/bin/jest.js"),
        "--config",
        str(QA / "jest.config.cjs"),
        "--runInBand",
        "--json",
        "--outputFile",
        str(raw_path),
    ]
    execution = execute(
        command,
        REPO,
        output / "logs/probes.log",
        env,
        policy["command_timeout_seconds"],
    )
    write_json(
        output / "raw/probe-command.json", {**execution, "log_file": "logs/probes.log"}
    )
    raw = {}
    if raw_path.exists():
        raw = json.loads(raw_path.read_text())
        # Sanitize stored framework failures too, before any artifact is published.
        write_json(raw_path, raw)
    automatic = [c for c in catalog["cases"] if c["adapter"].startswith("jest-")]
    results = probe_results(raw, automatic, repeats)
    backend_items = [c for c in catalog["cases"] if c["adapter"] == "node-backend"]
    if args.profile == "portable":
        backend_runs = []
        for repetition in range(1, repeats + 1):
            print(
                f"Executing isolated backend leaf contracts: repetition {repetition}",
                flush=True,
            )
            report_path = output / "raw" / f"backend-{repetition}.xml"
            backend_command = [
                "node",
                "--test",
                "--test-reporter=junit",
                "--test-reporter-destination=" + str(report_path),
                "handler.test.mjs",
                "database.test.mjs",
            ]
            execution = execute(
                backend_command,
                root / "tests/backend",
                output / "logs" / f"backend-{repetition}.log",
                env,
                policy["command_timeout_seconds"],
            )
            run = {"exit_code": execution["exit_code"]}
            try:
                if not report_path.is_file():
                    raise ValueError("Node did not produce backend JUnit evidence")
                content = redact(report_path.read_text())
                report_path.write_text(content, encoding="utf-8")
                run["records"] = parse_backend_xml(content)
                if execution["outcome"] != "completed":
                    run["error"] = execution["outcome"]
            except (ValueError, OSError) as error:
                run["error"] = redact(str(error))
            backend_runs.append(run)
        results.extend(aggregate_backend(backend_items, backend_runs, repeats))
    else:
        for item in backend_items:
            results.append(
                {
                    **item,
                    "status": "BLOCKED",
                    "evidence_kind": "isolated_backend_contract",
                    "attempts": [],
                    "observed": "Probe-only profile excludes the backend adapter. Use portable for a complete campaign.",
                }
            )
    for item in catalog["cases"]:
        if item["adapter"] == "human":
            results.append(
                {
                    **item,
                    "status": "REVIEW",
                    "evidence_kind": "human_review",
                    "attempts": [],
                    "observed": "Requires real device/staging evidence and an identified reviewer; not executed by this portable campaign",
                }
            )
    if args.profile == "portable":
        commands = [
            (
                "KYS-CHECK-001",
                "TypeScript del cliente",
                ["npm", "run", "typecheck"],
                "toolchain",
            ),
            (
                "KYS-CHECK-002",
                "ESLint del repositorio",
                ["npm", "run", "lint"],
                "toolchain",
            ),
            (
                "KYS-SUITE-001",
                "Suite JavaScript existente del producto",
                [
                    "node",
                    str(REPO / "node_modules/jest/bin/jest.js"),
                    "--runInBand",
                    "--testPathIgnorePatterns",
                    "/qa/",
                    "--json",
                    "--outputFile",
                    str(output / "raw/existing-jest.json"),
                ],
                "existing-tests",
            ),
            (
                "KYS-CHECK-003",
                "Tipos del contrato backend",
                ["npm", "run", "check:backend"],
                "toolchain",
            ),
        ]
        for ident, title, command, category in commands:
            print("Executing " + ident + ": " + title, flush=True)
            results.append(
                supplementary(
                    ident, title, command, root, output, env, policy, category
                )
            )
        existing_path = output / "raw/existing-jest.json"
        if existing_path.exists():
            existing = json.loads(existing_path.read_text())
            write_json(existing_path, existing)
            result = next(c for c in results if c["case_id"] == "KYS-SUITE-001")
            result["framework_counts"] = {
                k: existing.get(k)
                for k in (
                    "numTotalTests",
                    "numPassedTests",
                    "numFailedTests",
                    "numPendingTests",
                    "numTotalTestSuites",
                    "numPassedTestSuites",
                )
            }
            if (
                not existing.get("numTotalTests")
                or existing.get("numPendingTests")
                or existing.get("numFailedTests")
                or existing.get("numPassedTests") != existing.get("numTotalTests")
            ):
                result.update(
                    status="FAIL",
                    observed="Existing Jest suite was empty, skipped or did not fully pass; inspect raw/existing-jest.json",
                )
    else:
        meta["profile_warning"] = (
            "Probe-only run. Existing client and backend suites were not repeated."
        )
    meta["application_fingerprint_after"] = application_fingerprint(root)
    if meta["application_fingerprint_after"] != meta["application_fingerprint"]:
        raise RuntimeError(
            "Application files changed during QA; evidence cannot be finalized"
        )
    report = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "started_at": stamp,
        "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "profile": args.profile,
        "metadata": meta,
        "cases": results,
        "applicability": {
            "llm_rag_agents": "NOT_APPLICABLE",
            "physical_acceptance": "PENDING",
            "hosted_cloud_current_state": "NOT_VERIFIED",
        },
    }
    write_report(report, output, policy)
    print(
        json.dumps(
            {
                "report": str(output / "report.html"),
                "counts": report["summary"]["counts"],
                "gate": report["gate"],
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    return 0 if report["gate"]["decision"] == "PASS" else 1


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="Run portable cases against the unchanged app")
    run.add_argument("--sut-root", default=str(REPO))
    run.add_argument("--output")
    run.add_argument("--profile", choices=["portable", "probes"], default="portable")
    run.add_argument("--repetitions", type=int)
    sub.add_parser(
        "validate", help="Validate case registry without executing the application"
    )
    compare = sub.add_parser(
        "compare", help="Compare actual campaigns without changing either version"
    )
    compare.add_argument("baseline", type=Path)
    compare.add_argument("candidate", type=Path)
    compare.add_argument("--output", required=True, type=Path)
    review = sub.add_parser(
        "review", help="Import genuine human acceptance records into a new report"
    )
    review.add_argument("report", type=Path)
    review.add_argument("reviews", type=Path)
    review.add_argument("--output", type=Path, required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "run":
        return run_campaign(args)
    if args.command == "validate":
        catalog = json.loads((QA / "cases/catalog.json").read_text())
        errors = validate_catalog(catalog) + validate_policy(
            json.loads((QA / "config/policy.json").read_text())
        )
        print(
            json.dumps(
                {
                    "errors": errors,
                    "unique_cases": len(catalog["cases"]),
                    "evaluators": sorted(
                        {e for c in catalog["cases"] for e in c["evaluators"]}
                    ),
                },
                ensure_ascii=False,
            )
        )
        return int(bool(errors))
    if args.command == "compare":
        old, new = json.loads(args.baseline.read_text()), json.loads(
            args.candidate.read_text()
        )
        diff = compare_reports(old, new)
        if args.output.exists():
            raise ValueError("Comparison output already exists")
        write_json(args.output, diff)
        print(json.dumps(diff, ensure_ascii=False, indent=2))
        return 1 if diff["regressions"] else 0
    if args.command == "review":
        report = json.loads(args.report.read_text())
        with args.reviews.open(encoding="utf-8-sig", newline="") as stream:
            reviews = list(csv.DictReader(stream))
        reviewed = apply_human_reviews(report, reviews)
        reviewed["parent_report_sha256"] = digest(args.report)
        reviewed["reviewed_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        output = new_output(args.output)
        policy = json.loads((args.report.parent / "policy.json").read_text())
        for name in ("logs", "raw"):
            origin = args.report.parent / name
            if origin.is_dir():
                shutil.copytree(origin, output / name)
        for name in ("catalog.json", "policy.json", "sources.json"):
            origin = args.report.parent / name
            if origin.is_file():
                shutil.copy2(origin, output / name)
        write_report(reviewed, output, policy)
        print(
            json.dumps(
                {"report": str(output / "report.html"), "gate": reviewed["gate"]}
            )
        )
        return 0 if reviewed["gate"]["decision"] == "PASS" else 1
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError) as error:
        print("Robot QA setup error: " + redact(str(error)), file=sys.stderr)
        raise SystemExit(2)
