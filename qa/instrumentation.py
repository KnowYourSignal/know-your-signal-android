#!/usr/bin/env python3
"""Read raw AndroidJUnitRunner (-r) results, preserving named native contracts."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import uuid

from core import digest, redact
from reporting import write_json, write_report
from robot import QA, REPO, metadata, new_output


def parse_raw(text: str) -> dict:
    current, records = {}, {}
    statuses = {0: "PASS", -1: "ERROR", -2: "FAIL", -3: "BLOCKED", -4: "BLOCKED"}
    for line in text.splitlines():
        match = re.match(r"INSTRUMENTATION_STATUS: (\w+)=(.*)", line)
        if match:
            current[match[1]] = match[2]
            continue
        match = re.match(r"INSTRUMENTATION_STATUS_CODE: (-?\d+)", line)
        if match:
            code = int(match[1])
            if code != 1 and current.get("class") and current.get("test"):
                key = (current["class"], current["test"])
                if key in records:
                    raise ValueError("Duplicate native test completion")
                records[key] = {
                    "status": statuses.get(code, "ERROR"),
                    "message": redact(current.get("stack", current.get("stream", ""))),
                }
            current = {}
        elif current.get("stack"):
            current["stack"] += "\n" + line
    return records


def native_android_cases(text: str, registry: dict) -> list[dict]:
    records = parse_raw(text)
    expected = {(c["class"], c["method"]) for c in registry["cases"]}
    unexpected = records.keys() - expected
    results = []
    for item in registry["cases"]:
        observed = records.get((item["class"], item["method"]))
        if unexpected:
            observed = {
                "status": "ERROR",
                "message": "Native registry differs from actual instrumentation; review before claiming complete coverage",
            }
        if observed is None:
            observed = {
                "status": "ERROR",
                "message": "Named native test has no completed raw record. A dots-only summary is not per-case proof; run with -r.",
            }
        results.append(
            {
                **item,
                "title": item["method"],
                "requirement_id": "NATIVE-ROOM-SYNC",
                "category": "android-native-contract",
                "adapter": "android-raw-instrumentation",
                "operation": "native-test",
                "severity": "high",
                "required": True,
                "setup": "Original Android instrumented test, isolated fixture database/local server; not hosted Cloud",
                "input": {"class": item["class"], "method": item["method"]},
                "expected": "The named original test finishes with success code 0 and no skip/error",
                "evaluators": ["android-status-code", "registry-completeness"],
                "sources": [
                    item["source"],
                    "Issues #2/#3/#4",
                    "PDS persistencia y sincronización",
                ],
                "status": observed["status"],
                "observed": observed["message"]
                or "Original named native assertions passed",
                "evidence_kind": "android_native_integration",
                "attempts": [],
                "limitation": "No per-test latency is inferred from the overall suite duration",
            }
        )
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--producer-revision")
    args = parser.parse_args()
    text = args.input.read_text()
    registry = json.loads((QA / "registry/android-instrumentation.json").read_text())
    cases = native_android_cases(text, registry)
    output = new_output(args.output)
    meta = metadata(REPO, json.loads((QA / "cases/catalog.json").read_text()), 1)
    meta["raw_log_sha256"] = digest(args.input)
    meta["source_revision_declared"] = args.producer_revision
    bound = bool(
        os.environ.get("GITHUB_ACTIONS") == "true"
        and args.producer_revision
        == os.environ.get("GITHUB_SHA")
        == meta["sut_revision"]
    )
    meta["source_execution_bound_by_ci_job"] = bound
    if not bound:
        meta["reporting_revision"] = meta.pop("sut_revision")
        meta["sut_revision"] = "UNBOUND_IMPORTED_EVIDENCE"
    value = {
        "schema_version": "1.0",
        "run_id": "kys-native-android-" + uuid.uuid4().hex[:8],
        "profile": "android-native-integration",
        "metadata": meta,
        "cases": cases,
    }
    policy = json.loads((QA / "config/policy.json").read_text())
    (output / "logs").mkdir()
    (output / "logs/instrumentation.log").write_text(redact(text), encoding="utf-8")
    write_json(output / "policy.json", policy)
    write_report(value, output, policy)
    print(json.dumps({"counts": value["summary"]["counts"], "gate": value["gate"]}))
    return 0 if value["gate"]["decision"] == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(
            "Android instrumentation evidence error: " + redact(str(error)),
            file=sys.stderr,
        )
        raise SystemExit(2)
