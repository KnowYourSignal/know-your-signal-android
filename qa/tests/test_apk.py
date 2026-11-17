from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_apk import inspect_apk, verify


class ApkSeparationTests(unittest.TestCase):
    def apk(self, path, files):
        with zipfile.ZipFile(path, "w") as archive:
            for name, content in files.items():
                archive.writestr(name, content)

    def test_fixture_free_app_and_separate_test_class_are_accepted(self):
        with tempfile.TemporaryDirectory() as temp:
            app, test = Path(temp) / "app.apk", Path(temp) / "test.apk"
            self.apk(app, {"classes.dex": b"main application"})
            self.apk(test, {"classes2.dex": b"GnssCaptureJourneyTest GnssIntegrityJourneyTest"})
            self.assertTrue(verify(app, test)["passed"])

    def test_test_tls_key_or_ca_never_belongs_in_the_app(self):
        with tempfile.TemporaryDirectory() as temp:
            app = Path(temp) / "app.apk"
            for name in ["res/raw/ui_test_ca.pem", "assets/ui-test-key.pem"]:
                self.apk(app, {name: b"synthetic fixture"})
                self.assertFalse(verify(app)["passed"])

    def test_test_class_in_app_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            app = Path(temp) / "app.apk"
            self.apk(app, {"classes.dex": b"GnssCaptureJourneyTest"})
            self.assertFalse(verify(app)["passed"])

    def test_missing_new_journey_cannot_silently_pass_a_build(self):
        with tempfile.TemporaryDirectory() as temp:
            app, test = Path(temp) / "app.apk", Path(temp) / "test.apk"
            self.apk(app, {"classes.dex": b"main"})
            self.apk(test, {"classes.dex": b"old tests"})
            self.assertFalse(verify(app, test)["passed"])
            self.apk(test, {"classes.dex": b"GnssCaptureJourneyTest"})
            self.assertFalse(verify(app, test)["passed"])

    def test_negative_fixture_must_also_stay_out_of_the_app(self):
        with tempfile.TemporaryDirectory() as temp:
            app = Path(temp) / "app.apk"
            self.apk(app, {"classes3.dex": b"GnssIntegrityJourneyTest"})
            self.assertFalse(verify(app)["passed"])

    def test_empty_and_corrupt_archives_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            app = Path(temp) / "bad.apk"
            self.apk(app, {})
            with self.assertRaises(ValueError):
                inspect_apk(app)
            app.write_bytes(b"not an APK")
            with self.assertRaises(zipfile.BadZipFile):
                inspect_apk(app)
