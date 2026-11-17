"""Preserve each journey's changed evidence before a later phase overwrites it."""

from pathlib import Path
import re
import shutil
from core import digest, redact


def collect_changed_files(
    source: Path, output: Path, phase: str, seen: dict
) -> list[dict]:
    if not re.fullmatch(r"[a-z-]+", phase):
        raise ValueError("Unsafe evidence phase")
    attachments = []
    if not source.is_dir():
        return attachments
    source = source.resolve()
    for path in sorted(source.rglob("*")):
        if (
            not path.is_file()
            or path.is_symlink()
            or source not in path.resolve().parents
        ):
            continue
        if (
            path.suffix not in {".png", ".json", ".xml"}
            or path.stat().st_size > 20 * 1024 * 1024
        ):
            continue
        relative = path.relative_to(source)
        original_hash = digest(path)
        if seen.get(str(relative)) == original_hash:
            continue
        target = output / "artifacts" / phase / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix in {".json", ".xml"}:
            target.write_text(
                redact(path.read_text(errors="replace")), encoding="utf-8"
            )
        else:
            shutil.copyfile(path, target)
        attachments.append(
            {
                "path": str(target.relative_to(output)),
                "sha256": digest(target),
                "source_sha256_before_redaction": original_hash,
                "kind": "journey-produced",
                "phase": phase,
                "label": relative.name,
            }
        )
        seen[str(relative)] = original_hash
    return attachments
