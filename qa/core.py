"""Pure Robot QA contracts. No application imports or network dependencies."""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.0"
ROBOT_VERSION = "1.0.0"
STATUSES = {"PASS", "FAIL", "ERROR", "BLOCKED", "REVIEW", "NOT_APPLICABLE"}
EVALUATORS = {
    "exact-contract",
    "numeric-boundary",
    "reference-statistic",
    "geometry-bounds",
    "metamorphic-relation",
    "source-rule",
    "ui-state",
    "human-rubric",
}
ADAPTERS = {"jest-contract", "jest-ui", "jest-hook", "node-backend", "human"}
OPERATIONS = {
    "capture",
    "floor",
    "quality",
    "weight",
    "tether",
    "evidence",
    "map",
    "guide",
    "source",
    "metamorphic",
    "ui",
    "sampling",
    "backend",
    "human",
}
ID = re.compile(r"KYS-[A-Z]+-\d{3}$")
REDACTIONS = [
    (
        re.compile(r"([a-zA-Z][a-zA-Z0-9+.-]*://[^:/\s]+:)[^@\s/]+(@)"),
        r"\1[REDACTED]\2",
    ),
    (re.compile(r"(?i)Bearer\s+[A-Za-z0-9_.~+/=-]+"), "Bearer [REDACTED]"),
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
        "[REDACTED_JWT]",
    ),
    (re.compile(r"\bsb_secret_[A-Za-z0-9_-]+\b"), "[REDACTED_SECRET]"),
    (
        re.compile(r"\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]+\b"),
        "[REDACTED_GITHUB_TOKEN]",
    ),
    (
        re.compile(
            r"(?i)([\"']?(?:password|refresh_token|access_token|service_role|secret_key)[\"']?\s*[:=]\s*[\"'])([^\"'\s]+)"
        ),
        r"\1[REDACTED]",
    ),
]


def redact(text: str) -> str:
    for pattern, replacement in REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        sha = hashlib.sha256()
        for chunk in iter(lambda: stream.read(65536), b""):
            sha.update(chunk)
        return sha.hexdigest()


def canonical_hash(data: Any) -> str:
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
    ).hexdigest()


def validate_catalog(catalog: dict) -> list[str]:
    errors = []
    if not isinstance(catalog, dict):
        return ["Catalog must be an object"]
    if catalog.get("schema_version") != SCHEMA_VERSION:
        errors.append("Unsupported catalog schema_version")
    if type(catalog.get("seed")) is not int or not 0 <= catalog["seed"] < 2**32:
        errors.append("Catalog requires an unsigned 32-bit integer seed")
    cases = catalog.get("cases")
    if not isinstance(cases, list) or not cases:
        return errors + ["Catalog needs a nonempty cases array"]
    seen = set()
    for index, item in enumerate(cases):
        if not isinstance(item, dict):
            errors.append(f"Case {index} is not an object")
            continue
        ident = item.get("case_id", "")
        if not isinstance(ident, str) or not ID.fullmatch(ident):
            errors.append(f"Unsafe or invalid case_id at index {index}")
            ident = f"invalid-index-{index}"
        if ident in seen:
            errors.append(f"Duplicate case_id: {ident}")
        seen.add(ident)
        for field in ("title", "requirement_id", "category", "setup"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                errors.append(f"{ident}: missing {field}")
        if not isinstance(item.get("adapter"), str) or item["adapter"] not in ADAPTERS:
            errors.append(f"{ident}: unknown adapter")
        if (
            not isinstance(item.get("operation"), str)
            or item["operation"] not in OPERATIONS
        ):
            errors.append(f"{ident}: unknown operation")
        if not isinstance(item.get("severity"), str) or item["severity"] not in {
            "low",
            "medium",
            "high",
            "critical",
        }:
            errors.append(f"{ident}: invalid severity")
        if type(item.get("required")) is not bool:
            errors.append(f"{ident}: required must be boolean")
        evaluators = item.get("evaluators", [])
        if (
            not isinstance(evaluators, list)
            or not evaluators
            or any(not isinstance(e, str) or e not in EVALUATORS for e in evaluators)
        ):
            errors.append(f"{ident}: unknown or missing evaluator")
        if (
            not isinstance(item.get("sources"), list)
            or not item["sources"]
            or any(not isinstance(s, str) or not s.strip() for s in item["sources"])
        ):
            errors.append(f"{ident}: missing test basis")
        if "input" not in item or "expected" not in item:
            errors.append(f"{ident}: explicit input and expected are required")
        compatible = {
            "human": {"human"},
            "jest-ui": {"ui"},
            "jest-hook": {"sampling"},
            "node-backend": {"backend"},
            "jest-contract": OPERATIONS - {"human", "ui", "sampling", "backend"},
        }
        if (
            isinstance(item.get("adapter"), str)
            and item["adapter"] in compatible
            and isinstance(item.get("operation"), str)
            and item["operation"] not in compatible[item["adapter"]]
        ):
            errors.append(f"{ident}: adapter/operation mismatch")
        if item.get("operation") == "source":
            data = item.get("input")
            relative = data.get("path", "") if isinstance(data, dict) else ""
            if (
                not isinstance(relative, str)
                or not relative
                or Path(relative).is_absolute()
                or ".." in Path(relative).parts
                or "\\" in relative
            ):
                errors.append(f"{ident}: unsafe source path")
        try:
            json.dumps(item, allow_nan=False)
        except (TypeError, ValueError):
            errors.append(f"{ident}: input is not strict JSON")
    return errors


def validate_policy(policy: dict) -> list[str]:
    if not isinstance(policy, dict):
        return ["Policy must be an object"]
    errors = []
    for field in (
        "repetitions",
        "max_repetitions",
        "command_timeout_seconds",
        "android_phase_timeout_seconds",
    ):
        if type(policy.get(field)) is not int or policy[field] < 1:
            errors.append(f"Policy {field} must be a positive integer")
    if not errors and (
        policy["repetitions"] > policy["max_repetitions"]
        or policy["max_repetitions"] > 10
    ):
        errors.append("Repetitions exceed the declared bounded policy (maximum 10)")
    if type(policy.get("require_human_signoff")) is not bool:
        errors.append("Policy require_human_signoff must be boolean")
    if (
        policy.get("critical_failure_tolerance") != 0
        or policy.get("required_automatic_pass_rate") != 1
    ):
        errors.append("Required and critical failures cannot be hidden by an average")
    return errors


def aggregate_attempts(attempts: list[dict], expected: int) -> str:
    if (
        type(expected) is not int
        or expected <= 0
        or any(a.get("status") not in STATUSES for a in attempts)
    ):
        return "ERROR"
    if any(a.get("status") == "FAIL" for a in attempts):
        return "FAIL"
    if any(a.get("status") == "ERROR" for a in attempts):
        return "ERROR"
    if len(attempts) != expected:
        return "ERROR"
    return "PASS" if all(a.get("status") == "PASS" for a in attempts) else "BLOCKED"


def statistics(values: list[float]) -> dict:
    if any(
        type(v) not in (float, int) or not math.isfinite(v) or v < 0 for v in values
    ):
        raise ValueError("Metrics must be finite and nonnegative")
    ordered = sorted(values)
    if not ordered:
        return {"n": 0, "p50": None, "p95": None, "p99": None, "min": None, "max": None}

    def percentile(p: float):
        return ordered[max(0, math.ceil(len(ordered) * p) - 1)]

    return {
        "n": len(ordered),
        "p50": percentile(0.5),
        "p95": percentile(0.95),
        "p99": percentile(0.99),
        "min": ordered[0],
        "max": ordered[-1],
        "method": "nearest-rank",
        "caution": (
            "Small samples do not establish a production SLA"
            if len(ordered) < 100
            else "Controlled sample; production representativeness must be justified"
        ),
    }


def summarize(cases: list[dict]) -> dict:
    counts = Counter(c.get("status") for c in cases)
    executed = sum(counts[s] for s in ("PASS", "FAIL", "ERROR"))
    automatic = [c for c in cases if c.get("adapter") != "human"]
    automatic_executed = [
        c for c in automatic if c.get("status") in {"PASS", "FAIL", "ERROR"}
    ]
    dynamic = [
        c
        for c in cases
        if c.get("evidence_kind")
        not in {"static_analysis", "human_review", "toolchain"}
    ]
    return {
        "total": len(cases),
        "counts": dict(counts),
        "executed_unique": executed,
        "automatic_pass_rate": (
            sum(c.get("status") == "PASS" for c in automatic_executed)
            / len(automatic_executed)
            if automatic_executed
            else None
        ),
        "execution_coverage": executed / len(cases) if cases else 0,
        "dynamic_cases": len(dynamic),
        "categories": dict(Counter(c.get("category") for c in cases)),
        "critical_failures": sum(
            c.get("severity") == "critical" and c.get("status") in {"FAIL", "ERROR"}
            for c in cases
        ),
        "pending_human": sum(c.get("status") == "REVIEW" for c in cases),
    }


def gate(cases: list[dict], policy: dict) -> dict:
    if not cases:
        return {"decision": "INCOMPLETE", "reason": "No test evidence"}
    required = [c for c in cases if c.get("required")]
    if any(c.get("status") not in STATUSES for c in cases):
        return {
            "decision": "INCOMPLETE",
            "reason": "Invalid status in evidence; fail closed",
        }
    if any(
        c.get("severity") == "critical" and c.get("status") == "FAIL" for c in required
    ):
        return {"decision": "REJECT", "reason": "Critical required behavior failed"}
    if any(c.get("status") == "FAIL" for c in required):
        return {"decision": "REJECT", "reason": "Required test criteria failed"}
    if any(c.get("status") in {"ERROR", "BLOCKED", "NOT_APPLICABLE"} for c in required):
        return {
            "decision": "INCOMPLETE",
            "reason": "Required checks could not execute or lack valid evidence",
        }
    if any(c.get("status") == "REVIEW" for c in required) and policy.get(
        "require_human_signoff", True
    ):
        return {
            "decision": "HUMAN_REVIEW",
            "reason": "Physical or human acceptance is pending",
        }
    if not any(c.get("status") == "PASS" for c in required):
        return {"decision": "INCOMPLETE", "reason": "No required behavior verified"}
    return {
        "decision": "PASS",
        "reason": "All required checks passed in the declared scope",
    }


def compare_reports(baseline: dict, candidate: dict) -> dict:
    validate_report(baseline)
    validate_report(candidate)
    if baseline.get("schema_version") != candidate.get("schema_version"):
        raise ValueError("Reports use different schemas")
    old = {c["case_id"]: c for c in baseline["cases"]}
    new = {c["case_id"]: c for c in candidate["cases"]}
    common = sorted(old.keys() & new.keys())
    changes = [
        {"case_id": key, "before": old[key]["status"], "after": new[key]["status"]}
        for key in common
        if old[key]["status"] != new[key]["status"]
    ]
    capability_changes = [
        c
        for c in changes
        if old[c["case_id"]].get("comparable") is False
        or new[c["case_id"]].get("comparable") is False
    ]
    comparable = [c for c in changes if c not in capability_changes]
    regressions = [
        c for c in comparable if c["before"] == "PASS" and c["after"] == "FAIL"
    ]
    improvements = [
        c for c in comparable if c["after"] == "PASS" and c["before"] == "FAIL"
    ]
    lost_evidence = [
        c for c in comparable if c["before"] == "PASS" and c["after"] == "ERROR"
    ]
    return {
        "schema_version": SCHEMA_VERSION,
        "baseline_run": baseline["run_id"],
        "candidate_run": candidate["run_id"],
        "same_sut": baseline["metadata"].get("application_fingerprint")
        == candidate["metadata"].get("application_fingerprint"),
        "same_catalog": baseline["metadata"].get("catalog_sha256")
        == candidate["metadata"].get("catalog_sha256"),
        "regressions": regressions,
        "improvements": improvements,
        "capability_changes": capability_changes,
        "lost_evidence": lost_evidence,
        "other_changes": [
            c
            for c in comparable
            if c not in regressions and c not in improvements and c not in lost_evidence
        ],
        "added": sorted(new.keys() - old.keys()),
        "removed": sorted(old.keys() - new.keys()),
        "common_count": len(common),
        "interpretation": "Only comparable case IDs are contrasted. A missing, blocked or human case is never an improvement. Changes in test basis require human interpretation.",
    }


def validate_report(report: dict):
    if (
        not isinstance(report, dict)
        or report.get("schema_version") != SCHEMA_VERSION
        or not report.get("run_id")
        or not isinstance(report.get("metadata"), dict)
        or not isinstance(report.get("cases"), list)
    ):
        raise ValueError("Unsupported or incomplete report")
    seen = set()
    for case in report["cases"]:
        ident = case.get("case_id") if isinstance(case, dict) else None
        if (
            not isinstance(ident, str)
            or not ID.fullmatch(ident)
            or ident in seen
            or not isinstance(case.get("status"), str)
            or case["status"] not in STATUSES
        ):
            raise ValueError("Invalid or duplicate report case")
        seen.add(ident)


def apply_human_reviews(report: dict, reviews: list[dict]) -> dict:
    validate_report(report)
    # JSON roundtrip creates a new report; the machine evidence remains immutable.
    result = json.loads(json.dumps(report))
    index = {c["case_id"]: c for c in result["cases"]}
    seen = set()
    for review in reviews:
        ident = review.get("case_id")
        if ident in seen:
            raise ValueError(f"Duplicate review: {ident}")
        seen.add(ident)
        if review.get("run_id") != report["run_id"] or ident not in index:
            raise ValueError("Review does not belong to this run/case")
        item = index[ident]
        if item.get("adapter") != "human":
            raise ValueError("A human review cannot overwrite machine failures")
        if (
            review.get("verdict") not in {"PASS", "FAIL"}
            or not str(review.get("reviewer", "")).strip()
        ):
            raise ValueError("Review requires an identified reviewer and PASS/FAIL")
        if (
            not str(review.get("evidence", "")).strip()
            or not str(review.get("notes", "")).strip()
        ):
            raise ValueError("Review requires evidence and rationale")
        item["status"] = review["verdict"]
        item["human_review"] = review
    result["human_reviews"] = reviews
    return result


def judge_agreement(rows: list[dict]) -> dict:
    valid = [
        r
        for r in rows
        if r.get("automatic_verdict") in {"PASS", "FAIL"}
        and r.get("human_verdict") in {"PASS", "FAIL"}
    ]
    n = len(valid)
    if not n:
        return {
            "n": 0,
            "observed_agreement": None,
            "status": "NOT_CALIBRATED",
            "interpretation": "No paired human/automatic evaluations. No agreement is fabricated.",
        }
    matches = sum(r["automatic_verdict"] == r["human_verdict"] for r in valid)
    p = matches / n
    z = 1.96
    center = (p + z * z / (2 * n)) / (1 + z * z / n)
    radius = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / (1 + z * z / n)
    return {
        "n": n,
        "matches": matches,
        "observed_agreement": p,
        "wilson_95": [center - radius, center + radius],
        "status": "OBSERVED",
        "interpretation": "Agreement, not proof of accuracy. Review the sampling and adjudicate disagreements.",
    }
