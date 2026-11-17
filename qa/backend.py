"""Adapt the existing backend's leaf assertions to case-level Robot evidence.

No SQL or product test is modified. Node's real JUnit output is the oracle result;
the enclosing test container is not counted as another independent case.
"""

from __future__ import annotations
import xml.etree.ElementTree as ET
from core import aggregate_attempts, redact, statistics


def parse_backend_xml(text: str) -> dict[tuple[str, str], dict]:
    if "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
        raise ValueError("External entities are not allowed in test evidence")
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise ValueError("Malformed backend JUnit evidence") from error
    if root.tag not in {"testsuites", "testsuite"}:
        raise ValueError("Not a JUnit report")
    records = {}
    for case in root.iter("testcase"):
        key = (case.get("classname", ""), case.get("name", ""))
        if not key[1] or key in records:
            raise ValueError("Duplicate or unnamed backend leaf test")
        failure, error, skipped = (
            case.find("failure"),
            case.find("error"),
            case.find("skipped"),
        )
        state = (
            "FAIL"
            if failure is not None
            else (
                "ERROR"
                if error is not None
                else "BLOCKED" if skipped is not None else "PASS"
            )
        )
        element = (
            failure if failure is not None else error if error is not None else skipped
        )
        message = (
            ""
            if element is None
            else " ".join(filter(None, [element.get("message"), element.text]))
        )
        duration = float(case.get("time", "0")) * 1000
        statistics([duration])  # Validate finite/nonnegative values from a tool.
        records[key] = {
            "status": state,
            "message": redact(message)[:5000],
            "evaluation_duration_ms": duration,
        }
    return records


def aggregate_backend(
    items: list[dict], runs: list[dict], repetitions: int
) -> list[dict]:
    expected_keys = {(c["input"]["classname"], c["input"]["test_name"]) for c in items}
    attempts = {c["case_id"]: [] for c in items}
    for index, run in enumerate(runs, 1):
        records = run.get("records", {})
        extra = records.keys() - expected_keys
        bad_exit_without_named_failure = run.get("exit_code") != 0 and not any(
            r["status"] in {"FAIL", "ERROR"} for r in records.values()
        )
        for item in items:
            key = (item["input"]["classname"], item["input"]["test_name"])
            observation = records.get(key)
            if run.get("error") or extra or bad_exit_without_named_failure:
                observation = {
                    "status": "ERROR",
                    "evaluation_duration_ms": 0,
                    "message": run.get("error")
                    or "Backend execution has unknown tests or an unexplained failed exit; catalog/environment requires review",
                }
            elif observation is None:
                observation = {
                    "status": "ERROR",
                    "evaluation_duration_ms": 0,
                    "message": "The declared leaf assertion is missing from JUnit evidence",
                }
            attempts[item["case_id"]].append(
                {
                    **observation,
                    "repetition": index,
                    "raw_evidence": f"raw/backend-{index}.xml",
                }
            )
    results = []
    for item in items:
        observations = attempts[item["case_id"]]
        state = aggregate_attempts(observations, repetitions)
        messages = [a["message"] for a in observations if a["message"]]
        results.append(
            {
                **item,
                "status": state,
                "attempts": observations,
                "evidence_kind": "isolated_backend_contract",
                "observed": (
                    messages[0]
                    if messages
                    else "All declared existing backend leaf assertions passed in every repetition"
                ),
                "evaluation_latency_ms": statistics(
                    [a["evaluation_duration_ms"] for a in observations]
                ),
                "interpretation": "Existing handler/SQL contract with controlled fixtures. Does not verify current hosted Supabase state or Android/Cloud end-to-end behavior.",
            }
        )
    return results
