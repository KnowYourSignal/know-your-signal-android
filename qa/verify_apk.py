#!/usr/bin/env python3
"""Inspect QA/test ZIP contents without relying on optional CI shell utilities.

This is a packaging separation check. It does not replace apksigner, zipalign,
Android installation, or proof that an APK behaves correctly.
"""
import argparse
import json
from pathlib import Path
import re
import zipfile

FIXTURE_CLASSES = (b"GnssCaptureJourneyTest", b"GnssIntegrityJourneyTest")


def inspect_apk(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if not names or archive.testzip() is not None:
            raise ValueError("APK ZIP is empty or corrupt")
        fixture_names = [
            name
            for name in names
            if "ui_test_ca" in name.lower() or "ui-test-key" in name.lower()
        ]
        fixture_classes = set()
        for name in names:
            if re.fullmatch(r"classes\d*\.dex", name):
                data = archive.read(name)
                fixture_classes.update(item.decode() for item in FIXTURE_CLASSES if item in data)
    return {
        "file": path.name,
        "fixture_files": fixture_names,
        "contains_console_qa_class": bool(fixture_classes),
        "console_qa_classes": sorted(fixture_classes),
    }


def verify(app: Path, test: Path | None = None) -> dict:
    main = inspect_apk(app)
    checks = {
        "app_excludes_test_tls_fixtures": not main["fixture_files"],
        "app_excludes_console_qa_test_class": not main["contains_console_qa_class"],
    }
    value = {
        "scope": "APK/test fixture separation, not behavioral or signing certification",
        "app": main,
        "checks": checks,
    }
    if test is not None:
        test_data = inspect_apk(test)
        value["test"] = test_data
        checks["test_apk_contains_both_new_qa_journeys"] = (
            set(test_data["console_qa_classes"]) == {item.decode() for item in FIXTURE_CLASSES}
        )
    value["passed"] = all(checks.values())
    return value


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--test", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = verify(args.app, args.test)
        text = json.dumps(result, indent=2) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text, encoding="utf-8")
        print(text)
        raise SystemExit(0 if result["passed"] else 1)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(json.dumps({"passed": False, "error": str(error)}))
        raise SystemExit(2)
