#!/usr/bin/env python3
"""Verify immutable evidence without trusting paths supplied by a report."""
import argparse
import json
import re
from pathlib import Path
from core import digest, validate_report


def verify(folder: Path) -> list[str]:
    folder = folder.resolve(strict=True)
    if (folder / "manifest.sha256.json").is_symlink():
        return ["Integrity manifest cannot be a symlink"]
    manifest = json.loads((folder / "manifest.sha256.json").read_text())
    errors = []
    if not isinstance(manifest, dict) or not manifest:
        return ["Missing/nonempty integrity manifest required"]
    for relative, expected in manifest.items():
        if (
            not isinstance(relative, str)
            or Path(relative).is_absolute()
            or ".." in Path(relative).parts
            or "\\" in relative
            or ":" in relative
        ):
            errors.append("Unsafe manifest path")
            continue
        path = (folder / relative).resolve()
        if not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
            errors.append("Invalid evidence digest: " + relative)
            continue
        if (folder / relative).is_symlink():
            errors.append("Symlink evidence is not permitted: " + relative)
        if folder not in path.parents:
            errors.append("Manifest path escapes evidence directory")
        elif not path.is_file() or digest(path) != expected:
            errors.append("Missing or modified evidence: " + relative)
    actual_files = {
        str(p.relative_to(folder))
        for p in folder.rglob("*")
        if p.is_file() and p != folder / "manifest.sha256.json"
    }
    if any(p.is_symlink() for p in folder.rglob("*")):
        errors.append("Evidence inventory contains a symlink")
    if actual_files != set(manifest):
        errors.append("Evidence file inventory differs from manifest")
    report = json.loads((folder / "report.json").read_text())
    validate_report(report)
    for case in report["cases"]:
        relative = case.get("evidence_file")
        if relative not in manifest or case.get("evidence_sha256") != manifest.get(
            relative
        ):
            errors.append(
                "Case evidence/hash missing from manifest: " + case["case_id"]
            )
        elif isinstance(relative, str) and not Path(relative).is_absolute() and ".." not in Path(relative).parts:
            evidence_path = (folder / relative).resolve()
            if folder in evidence_path.parents and evidence_path.is_file():
                evidence = json.loads(evidence_path.read_text())
                canonical_case = {k: v for k, v in case.items() if k not in {"evidence_file", "evidence_sha256"}}
                if evidence != canonical_case:
                    errors.append("Case record differs from its evidence: " + case["case_id"])
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    try:
        errors = verify(args.directory)
        print(json.dumps({"integrity": "FAIL" if errors else "PASS", "errors": errors}))
        raise SystemExit(int(bool(errors)))
    except (OSError, ValueError, TypeError) as error:
        print(json.dumps({"integrity": "ERROR", "error": str(error)}))
        raise SystemExit(2)
