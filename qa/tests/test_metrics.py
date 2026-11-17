from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from metrics import map_proxy_case


class MapProxyTests(unittest.TestCase):
    def raw(self, duration=4757):
        return {
            "synthetic": True,
            "cells": 1000,
            "visible_cells_verified": 1000,
            "physical_network_sla_verified": False,
            "tap_to_accessible_result_ms": duration,
        }

    def test_measured_over_budget_remains_optional_and_explicitly_a_proxy(self):
        result = map_proxy_case(self.raw(), 3000)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["required"])
        self.assertIn("not prove", result["limitation"])

    def test_exact_boundary_is_not_less_than_three_seconds(self):
        self.assertEqual(map_proxy_case(self.raw(2999), 3000)["status"], "PASS")
        self.assertEqual(map_proxy_case(self.raw(3000), 3000)["status"], "FAIL")

    def test_absent_or_different_fixture_is_not_an_approved_sla(self):
        self.assertEqual(map_proxy_case(None, 3000)["status"], "BLOCKED")
        self.assertEqual(map_proxy_case({"synthetic": False}, 3000)["status"], "ERROR")

    def test_bad_metrics_do_not_become_a_fast_response(self):
        for value in (0, -1, float("nan"), True, "10"):
            self.assertEqual(map_proxy_case(self.raw(value), 3000)["status"], "ERROR")


if __name__ == "__main__":
    unittest.main()
