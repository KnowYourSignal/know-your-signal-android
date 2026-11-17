"""Declared Android timing proxy. Never call this a physical network SLA."""

from core import statistics


def map_proxy_case(raw: dict | None, budget_ms: int) -> dict:
    value = {
        "case_id": "KYS-ANDROID-009",
        "title": "Respuesta con 1000 celdas: indicador de emulador",
        "requirement_id": "NEC05.03-PERFORMANCE-PROXY",
        "issue_ids": [9],
        "category": "android-performance-proxy",
        "adapter": "android-benchmark",
        "operation": "timing-proxy",
        "severity": "medium",
        "required": False,
        "setup": "Existing CommunityMapTest, local HTTPS, 1000 synthetic cells, UiAutomator on emulator",
        "input": {
            "budget_ms": budget_ms,
            "start": "before tab.click",
            "end": "accessible result label found",
        },
        "expected": f"Emulator accessibility timing proxy < {budget_ms} ms; physical SLA remains pending",
        "evaluators": ["finite-metric", "declared-budget"],
        "sources": ["PDS NEC05.03", "Hoja de ruta C4", "CommunityMapTest.kt"],
        "evidence_kind": "android_accessibility_timing_proxy",
        "attempts": [],
        "limitation": "Includes test-driver overhead. Does not prove fully drawn/usable map, physical phone, real network or production SLA. Optional diagnostic, never a substitute for field acceptance.",
    }
    if raw is None:
        value.update(
            status="BLOCKED",
            observed="The original community journey produced no timing record",
        )
        return value
    if (
        raw.get("synthetic") is not True
        or raw.get("cells") != 1000
        or raw.get("visible_cells_verified") != 1000
        or raw.get("physical_network_sla_verified") is not False
    ):
        value.update(
            status="ERROR",
            observed="Timing fixture/scope does not match the declared proxy",
        )
        return value
    try:
        duration = raw["tap_to_accessible_result_ms"]
        statistics([duration])
        if duration <= 0:
            raise ValueError("Nonpositive duration")
    except (ValueError, KeyError):
        value.update(
            status="ERROR", observed="Invalid timing measurement; no conclusion"
        )
        return value
    value.update(
        status="PASS" if duration < budget_ms else "FAIL",
        observed=f"Observed proxy: {duration} ms, budget: <{budget_ms} ms. Field acceptance is still pending.",
        measurement=raw,
    )
    return value
