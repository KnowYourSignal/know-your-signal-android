from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evidence import collect_changed_files
from core import digest


class JourneyEvidenceTests(unittest.TestCase):
    def test_later_failure_does_not_overwrite_previous_phase_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / "source", Path(temp) / "out"
            source.mkdir()
            file = source / "failure.xml"
            file.write_text("<screen>capture state</screen>")
            seen = {}
            first = collect_changed_files(source, output, "capture", seen)
            file.write_text("<screen>guide state</screen>")
            second = collect_changed_files(source, output, "guide", seen)
            self.assertEqual(len(first), 1)
            self.assertEqual(len(second), 1)
            self.assertIn("capture state", (output / first[0]["path"]).read_text())
            self.assertIn("guide state", (output / second[0]["path"]).read_text())
            self.assertFalse(collect_changed_files(source, output, "quality", seen))

    def test_redacted_copy_has_both_original_and_stored_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / "source", Path(temp) / "out"
            source.mkdir()
            file = source / "metadata.json"
            file.write_text('{"password":"synthetic-secret"}')
            result = collect_changed_files(source, output, "capture", {})[0]
            saved = output / result["path"]
            self.assertNotIn("synthetic-secret", saved.read_text())
            self.assertEqual(result["source_sha256_before_redaction"], digest(file))
            self.assertEqual(result["sha256"], digest(saved))

    def test_symlink_executable_and_path_traversal_are_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / "source", Path(temp) / "out"
            source.mkdir()
            external = Path(temp) / "external.xml"
            external.write_text("private")
            (source / "link.xml").symlink_to(external)
            (source / "execute.sh").write_text("untrusted")
            self.assertEqual(collect_changed_files(source, output, "capture", {}), [])
            with self.assertRaises(ValueError):
                collect_changed_files(source, output, "../escape", {})


if __name__ == "__main__":
    unittest.main()
