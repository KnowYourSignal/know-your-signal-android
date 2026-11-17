#!/usr/bin/env python3
"""Convert existing disposable PostgreSQL checks to traceable Robot evidence.

The SQL runner itself is unchanged. A native-only PASS is never a phone/Cloud SLA.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sys
import uuid

from core import digest, statistics
from reporting import write_json, write_report
from robot import QA, REPO, metadata, new_output, execute, application_fingerprint

NAMES = [
    "eight simultaneous exact retries produce one row",
    "simultaneous owners cannot claim the same UUID",
    "simultaneous conflicting contents are detected",
    "eight simultaneous batches of one hundred are accepted",
    "sixteen concurrent requests enforce atomic quota",
    "ingestion holds consent until commit; revocation then blocks",
    "revocation holds consent; waiting ingestion is denied",
    "global cell selection works at high latitudes, dateline and origin",
    "map performance and selective GiST plan",
    "eight concurrent map reads preserve identical aggregates",
]


def native_cases(raw: dict, allow_incomplete: bool = False) -> list[dict]:
    if raw.get("scope") != "isolated native PostgreSQL; not Cloud/Android SLA":
        raise ValueError("Native evidence must declare its isolated SQL scope")
    if raw.get("postgis_schema") not in {"public", "extensions"} and not (
        allow_incomplete and raw.get("error")
    ):
        raise ValueError("Unknown PostGIS test schema")
    checks = raw.get("checks")
    if (
        not isinstance(checks, list)
        or any(not isinstance(c, dict) or c.get("name") not in NAMES for c in checks)
        or len({c["name"] for c in checks}) != len(checks)
    ):
        raise ValueError("Native check registry differs; evidence requires review")
    if len(checks) != len(NAMES) and not (allow_incomplete and raw.get("error")):
        raise ValueError("Native check registry differs; evidence requires review")
    index = {c["name"]: c for c in checks}
    cases = []
    for number, name in enumerate(NAMES, 1):
        check = index.get(name)
        if check is not None and type(check.get("passed")) is not bool:
            raise ValueError("A native check needs an explicit boolean verdict")
        if check is not None:
            statistics([check["elapsed_ms"]])
        state = "BLOCKED" if check is None else "PASS" if check["passed"] else "FAIL"
        observed = (
            (
                "Not executed: original runner stopped after a failed prerequisite/check. "
                + raw.get("error", "")
            )
            if check is None
            else (
                "Existing native assertion passed"
                if state == "PASS"
                else check.get("error", "Existing native assertion failed")
            )
        )
        cases.append(
            {
                "case_id": f"KYS-PG-{number:03d}",
                "title": name,
                "requirement_id": "ISSUE-7-8",
                "issue_ids": [7, 8],
                "category": "native-postgres",
                "adapter": "existing-native-sql",
                "operation": "native-check",
                "severity": "high",
                "required": True,
                "setup": "Disposable PostgreSQL/PostGIS service guarded by native_guard_test.py; controlled synthetic fixtures",
                "input": {
                    "postgis_schema": raw.get("postgis_schema"),
                    "original_check": name,
                },
                "expected": "Existing native runner asserts the named SQL/concurrency contract",
                "evaluators": ["existing-native-assertion", "explicit-verdict"],
                "sources": [
                    "Issues #7/#8",
                    "tests/backend/native.py",
                    "Hoja de ruta C",
                ],
                "status": state,
                "evidence_kind": "isolated_native_postgres",
                "observed": observed,
                "attempts": (
                    []
                    if check is None
                    else [
                        {
                            "repetition": 1,
                            "status": state,
                            "evaluation_duration_ms": check["elapsed_ms"],
                            "message": check.get("error", ""),
                        }
                    ]
                ),
                "limitation": "Synthetic isolated SQL check; duration is test execution time, not end-to-end request latency",
            }
        )
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", type=Path, default=REPO / "tests/backend/native-backend-report.json"
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Run the original guarded scripts now, binding evidence to this checkout",
    )
    args = parser.parse_args()
    output = new_output(args.output)
    before = application_fingerprint(REPO)
    executions = []
    if args.execute:
        if (
            args.input.resolve()
            != (REPO / "tests/backend/native-backend-report.json").resolve()
        ):
            raise ValueError("Execution uses the original fixed report location")
        # Only a stale generated test report is removed; never product data.
        if args.input.is_file():
            args.input.unlink()
        for name in ("native_guard_test.py", "native.py"):
            result = execute(
                [sys.executable, str(REPO / "tests/backend" / name)],
                REPO,
                output / "logs" / (name + ".log"),
                os.environ.copy(),
                300,
            )
            executions.append(result)
            if result["exit_code"] != 0:
                write_json(
                    output / "execution-error.json",
                    {"stage": name, "execution": result},
                )
                break  # Preserve original failure and report downstream blockers.
    if args.input.is_file():
        raw = json.loads(args.input.read_text())
    elif args.execute:
        raw = {
            "scope": "isolated native PostgreSQL; not Cloud/Android SLA",
            "checks": [],
            "error": "Original guarded runner did not produce a native report. Inspect retained execution log.",
        }
    else:
        raise ValueError("Imported report does not exist")
    if args.execute and any(c["exit_code"] != 0 for c in executions):
        raw.setdefault(
            "error", "Original native runner exited without completing; inspect its log"
        )
    cases = native_cases(raw, allow_incomplete=args.execute)
    policy = json.loads((QA / "config/policy.json").read_text())
    meta = metadata(REPO, json.loads((QA / "cases/catalog.json").read_text()), 1)
    meta.update(
        postgres=raw.get("environment"),
        postgis_schema=raw.get("postgis_schema"),
        source_report_sha256=digest(args.input) if args.input.is_file() else None,
        source_execution_bound=args.execute,
        application_fingerprint_after=application_fingerprint(REPO),
    )
    if before != meta["application_fingerprint_after"]:
        raise ValueError("Product source changed during native QA")
    if not args.execute:
        meta["reporting_revision"] = meta.pop("sut_revision")
        meta["sut_revision"] = "UNBOUND_IMPORTED_EVIDENCE"
        meta["interpretation"] = (
            "This command imported an existing report. Its producer revision/time must be verified from original CI provenance; no current-checkout execution is claimed."
        )
    value = {
        "schema_version": "1.0",
        "run_id": "kys-native-pg-"
        + str(raw.get("postgis_schema", "unverified"))
        + "-"
        + uuid.uuid4().hex[:8],
        "profile": "isolated-native-postgres",
        "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "metadata": meta,
        "cases": cases,
        "executions": executions,
        "benchmarks": raw.get("benchmarks", []),
        "concurrent_map_client_ms": raw.get("concurrent_map_client_ms", []),
        "applicability": {
            "hosted_supabase": "NOT_VERIFIED",
            "physical_map_3s_sla": "NOT_VERIFIED",
        },
    }
    write_json(output / "raw/native-backend-report.json", raw)
    write_json(output / "policy.json", policy)
    write_report(value, output, policy)
    print(
        json.dumps({"gate": value["gate"], "scope": raw["scope"], "cases": len(cases)})
    )
    return 0 if value["gate"]["decision"] == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        print("Native evidence error: " + str(error), file=sys.stderr)
        raise SystemExit(2)
