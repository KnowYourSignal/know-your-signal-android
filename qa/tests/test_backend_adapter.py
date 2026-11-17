"""Backend evidence must represent actual named leaf tests, not green commands."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import aggregate_backend, parse_backend_xml
from test_robot import case


class BackendAdapterTests(unittest.TestCase):
    XML = '<testsuites><testsuite name="suite"><testcase classname="suite" name="leaf" time="0.25"/></testsuite></testsuites>'

    def item(self):
        return case(
            adapter="node-backend",
            operation="backend",
            input={"classname": "suite", "test_name": "leaf"},
        )

    def test_read_leaf_result_and_duration(self):
        records = parse_backend_xml(self.XML)
        self.assertEqual(len(records), 1)
        self.assertEqual(records["suite", "leaf"]["status"], "PASS")
        self.assertEqual(records["suite", "leaf"]["evaluation_duration_ms"], 250)

    def test_parent_container_is_not_an_extra_case(self):
        self.assertEqual(
            len(
                parse_backend_xml(
                    self.XML.replace('name="suite"', 'name="suite" tests="2"')
                )
            ),
            1,
        )

    def test_failure_error_and_skip_are_distinct(self):
        for tag, expected in [
            ("failure", "FAIL"),
            ("error", "ERROR"),
            ("skipped", "BLOCKED"),
        ]:
            xml = self.XML.replace(
                'time="0.25"/>', f'time="0.25"><{tag} message="reason"/></testcase>'
            )
            self.assertEqual(
                parse_backend_xml(xml)["suite", "leaf"]["status"], expected
            )

    def test_empty_missing_case_is_error(self):
        result = aggregate_backend([self.item()], [{"records": {}, "exit_code": 0}], 1)
        self.assertEqual(result[0]["status"], "ERROR")

    def test_unknown_leaf_does_not_silently_escape_the_catalog(self):
        records = parse_backend_xml(self.XML.replace('name="leaf"', 'name="unknown"'))
        self.assertEqual(
            aggregate_backend([self.item()], [{"records": records, "exit_code": 0}], 1)[
                0
            ]["status"],
            "ERROR",
        )

    def test_expected_repetitions_and_failed_exit_are_checked(self):
        records = parse_backend_xml(self.XML)
        self.assertEqual(
            aggregate_backend([self.item()], [{"records": records, "exit_code": 0}], 3)[
                0
            ]["status"],
            "ERROR",
        )
        self.assertEqual(
            aggregate_backend([self.item()], [{"records": records, "exit_code": 2}], 1)[
                0
            ]["status"],
            "ERROR",
        )
        self.assertEqual(
            aggregate_backend(
                [self.item()], [{"records": records, "exit_code": 0}] * 3, 3
            )[0]["status"],
            "PASS",
        )

    def test_invalid_xml_and_external_entities_are_rejected(self):
        for xml in (
            "<broken",
            "<html/>",
            '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><testsuites/>',
        ):
            with self.assertRaises(ValueError):
                parse_backend_xml(xml)

    def test_duplicate_names_and_invalid_time_are_rejected(self):
        for xml in (
            self.XML.replace(
                "</testsuite>", '<testcase classname="suite" name="leaf"/></testsuite>'
            ),
            self.XML.replace("0.25", "NaN"),
        ):
            with self.assertRaises(ValueError):
                parse_backend_xml(xml)

    def test_secrets_in_tool_failures_are_filtered(self):
        xml = self.XML.replace(
            'time="0.25"/>',
            'time="0.25"><failure>Bearer do-not-publish</failure></testcase>',
        )
        self.assertNotIn(
            "do-not-publish", parse_backend_xml(xml)["suite", "leaf"]["message"]
        )


if __name__ == "__main__":
    unittest.main()
