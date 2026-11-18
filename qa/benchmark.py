#!/usr/bin/env python3
"""Derive presentation metrics from an intact evidence package, without rerunning QA.

Counts of unique criteria, repetitions and supplementary suites stay separate.
Latency observations retain their layer, budget, sample size and source.
"""
import argparse
import csv
import html
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from core import digest
from verify import verify

STATES = {"PASS", "FAIL", "ERROR", "BLOCKED", "REVIEW", "NOT_APPLICABLE"}
PROFILES = (
    "portable", "sql/public", "sql/extensions",
    "android/api29/ui", "android/api35/ui",
    "android/api29/native", "android/api35/native",
)


def ratio(passed, total):
    return None if not total else round(100 * passed / total, 4)


def counts(cases):
    found = Counter(c["status"] for c in cases)
    if set(found) - STATES:
        raise ValueError("Unrecognized case status")
    return {"total": len(cases), **{s: found[s] for s in sorted(STATES)},
            "pass_percent": ratio(found["PASS"], len(cases))}


def catalog_metrics(cases):
    ids = [c["case_id"] for c in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate case identifiers would inflate the benchmark")
    auto = [c for c in cases if c["adapter"] not in {"human", "trusted-command"}]
    human = [c for c in cases if c["adapter"] == "human"]
    extra = [c for c in cases if c["adapter"] == "trusted-command"]
    groups = defaultdict(list)
    for c in auto:
        groups[c["adapter"]].append(c)
    repeats = sum(len(c.get("attempts", [])) for c in auto)
    repeated = [c for c in auto if len(c.get("attempts", [])) >= 2]
    stable = sum(len({a["status"] for a in c["attempts"]}) == 1 for c in repeated)
    critical = [c for c in auto if c.get("required") and c["severity"] == "critical"]
    return {
        "catalog_total": len(auto) + len(human),
        "automatic": counts(auto), "human": counts(human),
        "supplementary": counts(extra), "critical_required": counts(critical),
        "by_adapter": {k: counts(v) for k, v in groups.items()},
        "attempts": repeats, "repeat_case_count": len(repeated),
        "stable_case_count": stable,
        "stability_percent": ratio(stable, len(repeated)),
        "definitions": {
            "automatic_pass_percent": "PASS / all unique automatic catalog criteria, including review and blocked criteria in the denominator",
            "critical_pass_percent": "PASS / unique required critical criteria",
            "stability": "Identical attempt verdicts across repetitions, including identical failures. Not sensor accuracy or reliability in the field.",
            "supplementary": "Existing suites and tools stay outside the catalog denominator",
        },
    }


def nearest_rank(values, percentile):
    if not values or not all(type(v) in (int, float) and math.isfinite(v) and v >= 0 for v in values):
        raise ValueError("A latency sample must contain finite nonnegative numbers")
    return sorted(values)[max(0, math.ceil(len(values) * percentile) - 1)]


def safe_path(root, relative):
    if not isinstance(relative, str) or Path(relative).is_absolute() or ".." in Path(relative).parts or "\\" in relative:
        raise ValueError("Unsafe evidence path")
    path = root / relative
    if path.is_symlink() or root not in path.resolve().parents:
        raise ValueError("Unsafe evidence target")
    return path


def build(root):
    root = root.resolve(strict=True)
    manifest = json.loads((root / "PACKAGE_SHA256.json").read_text())
    for relative, expected in manifest.items():
        source = safe_path(root, relative)
        if not source.is_file() or digest(source) != expected:
            raise ValueError("Package evidence missing or modified: " + relative)
    reports = {}
    for profile in PROFILES:
        errors = verify(root / profile)
        if errors:
            raise ValueError(profile + ": " + "; ".join(errors))
        reports[profile] = json.loads((root / profile / "report.json").read_text())
    fingerprints = {r["metadata"]["application_fingerprint"] for r in reports.values()}
    if len(fingerprints) != 1:
        raise ValueError("Different application fingerprints cannot form one snapshot")
    portable = reports["portable"]
    baseline_errors = verify(root / "baseline")
    if baseline_errors:
        raise ValueError("baseline: " + "; ".join(baseline_errors))
    baseline = json.loads((root / "baseline/report.json").read_text())
    comparison = json.loads((root / "comparison.json").read_text())
    if comparison["baseline_run"] != baseline["run_id"] or comparison["candidate_run"] != portable["run_id"]:
        raise ValueError("Comparison does not belong to these source campaigns")
    data = {
        "schema_version": "1.0", "derived_at": datetime.now(timezone.utc).isoformat(),
        "kind": "derived_benchmark_not_a_new_test_execution",
        "application_fingerprint": fingerprints.pop(),
        "source_package_manifest_sha256": digest(root / "PACKAGE_SHA256.json"),
        "sources": {p: {"run_id": r["run_id"], "sut_revision": r["metadata"]["sut_revision"],
                         "report_sha256": digest(root / p / "report.json")}
                    for p, r in reports.items()},
        "catalog": catalog_metrics(portable["cases"]),
        "comparison": {**comparison, "baseline_revision": baseline["metadata"]["sut_revision"],
                       "candidate_revision": portable["metadata"]["sut_revision"]},
        "gate": portable["gate"], "sql": [], "concurrency": [], "android_map": [],
        "native": {}, "android_journeys": {}, "incidents": [],
        "limitations": [
            "Campañas archivadas del 17 de noviembre de 2026. No acreditan otra versión del producto.",
            "Tres repeticiones no crean casos únicos nuevos ni estiman una probabilidad de fallo en producción.",
            "El tiempo SQL de EXPLAIN excluye transporte del cliente, Android y dibujo de la pantalla.",
            "p95 SQL usa diez muestras. El productor original conservó agregados, no los diez tiempos individuales.",
            "El indicador Android incluye UiAutomator y termina en una etiqueta accesible. La pantalla utilizable en teléfono sigue pendiente.",
            "No se ha comprobado una carga física de la app inferior a 0,5 segundos.",
        ],
    }
    for schema in ("public", "extensions"):
        profile = "sql/" + schema
        report = reports[profile]
        for record in report["benchmarks"]:
            data["sql"].append({**record, "schema": schema, "source": profile + "/report.json",
                                "samples_per_query": 10, "raw_samples_retained": False,
                                "p95_seconds": record["p95_ms"] / 1000,
                                "budget_result": "PASS" if record["p95_ms"] < record["sql_budget_ms"] else "FAIL"})
        samples = report["concurrent_map_client_ms"]
        data["concurrency"].append({"schema": schema, "n_clients": len(samples), "samples_ms": samples,
                                     "p50_ms": nearest_rank(samples, .5), "p95_ms": nearest_rank(samples, .95),
                                     "source": profile + "/report.json",
                                     "scope": "Local SQL client elapsed time, including subprocess overhead. Not HTTP or Cloud load."})
        data["native"][profile] = counts(report["cases"])
    for api in (29, 35):
        profile = f"android/api{api}/ui"
        report = reports[profile]
        data["android_journeys"][str(api)] = [{"id": c["case_id"], "title": c["title"], "status": c["status"],
                                                "required": c["required"]} for c in report["cases"]]
        timing = next(c for c in report["cases"] if c["adapter"] == "android-benchmark")
        measurement = timing.get("measurement")
        data["android_map"].append({"api": api, "status": timing["status"],
                                    "n": 1 if measurement else 0, "budget_ms": timing["input"]["budget_ms"],
                                    "measured_ms": measurement.get("tap_to_accessible_result_ms") if measurement else None,
                                    "source": profile + "/report.json", "scope": timing["limitation"]})
        native = f"android/api{api}/native"
        data["native"][native] = counts(reports[native]["cases"])
    for c in portable["cases"]:
        if c["status"] in {"FAIL", "REVIEW"} and c["adapter"] != "human":
            data["incidents"].append({k: c[k] for k in (
                "case_id", "title", "status", "severity", "requirement_id", "adapter", "input",
                "expected", "observed", "sources", "evidence_file", "evidence_kind")})
    return data


def write_outputs(data, destination):
    destination = destination.resolve()
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Output directory must be empty")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "benchmark.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    with (destination / "benchmark_sql.csv").open("w", newline="", encoding="utf-8-sig") as f:
        fields = ["schema", "rows", "query", "samples_per_query", "p50_ms", "p95_ms", "max_ms", "sql_budget_ms", "budget_result", "source"]
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data["sql"])
    sections = []
    def table(title, headers, rows):
        h = "<h2>" + html.escape(title) + "</h2><table><tr>" + "".join("<th>" + html.escape(str(x)) + "</th>" for x in headers) + "</tr>"
        sections.append(h + "".join("<tr>" + "".join("<td>" + html.escape(str(x)) + "</td>" for x in row) + "</tr>" for row in rows) + "</table>")
    a = data["catalog"]["automatic"]
    table("Criterios automáticos únicos", ["Aprobados", "Total", "Tasa", "Fallidos", "Revisión"], [[a["PASS"], a["total"], f'{a["pass_percent"]:.2f} %', a["FAIL"], a["REVIEW"]]])
    table("Resultados por adaptador", ["Capa", "Aprobados", "Total", "Tasa", "Fallidos", "Revisión"], [[k, v["PASS"], v["total"], f'{v["pass_percent"]:.2f} %', v["FAIL"], v["REVIEW"]] for k,v in data["catalog"]["by_adapter"].items()])
    critical = data["catalog"]["critical_required"]
    table("Criterios críticos y decisión original", ["Aprobados", "Total", "Fallidos", "Gate"], [[critical["PASS"], critical["total"], critical["FAIL"], data["gate"]["decision"]]])
    comparison = data["comparison"]
    table("Comparación de versiones", ["Tipo", "Criterios", "Alcance"], [
        ["PASS a FAIL", len(comparison["regressions"]), "Regresiones de criterio"],
        ["FAIL a PASS", len(comparison["improvements"]), "Mejoras de criterio"],
        ["Cambio de capacidad", len(comparison["capability_changes"]), "Se separa de mejoras y regresiones"],
    ])
    table("SQL aislado, diez muestras por escenario", ["Esquema", "Filas", "Consulta", "p50 ms", "p95 ms", "Objetivo ms", "Resultado"], [[r["schema"], r["rows"], r["query"], r["p50_ms"], r["p95_ms"], '< ' + str(r["sql_budget_ms"]), r["budget_result"]] for r in data["sql"]])
    table("Mapa Android, indicador de emulador", ["API", "Muestras", "Observado ms", "Objetivo ms", "Resultado"], [[r["api"], r["n"], r["measured_ms"], '< ' + str(r["budget_ms"]), r["status"]] for r in data["android_map"]])
    sections.append("<h2>Alcance y límites</h2><ul>" + "".join("<li>" + html.escape(x) + "</li>" for x in data["limitations"]) + "</ul>")
    for c in data["incidents"]:
        sections.append("<details><summary>" + html.escape(c["case_id"] + " · " + c["status"] + " · " + c["title"]) + "</summary><pre>" + html.escape(json.dumps(c, ensure_ascii=False, indent=2)) + "</pre></details>")
    page = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>KYS · Benchmark QA</title><style>body{max-width:1100px;margin:40px auto;padding:0 22px;font:17px/1.55 system-ui;color:#132a54}h1,h2{line-height:1.2}h2{margin-top:38px}table{border-collapse:collapse;width:100%;font-size:15px}td,th{border:1px solid #d9d9d9;padding:10px;text-align:left}th{background:#132a54;color:white}tr:nth-child(even){background:#f4f7ff}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}summary{padding:12px 0;cursor:pointer}a{color:#205df5}</style><h1>Benchmark de calidad y rendimiento</h1><p>Campañas del 17 de noviembre de 2026. Este informe deriva cifras de evidencia archivada. No ejecuta nuevas pruebas.</p>' + ''.join(sections) + '</html>'
    (destination / "benchmark.html").write_text(page, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--verbose", action="store_true", help="Print denominators, measured values and scopes")
    args = parser.parse_args()
    try:
        root = args.evidence_root.resolve(strict=True)
        target = args.output.resolve()
        if target == root or root in target.parents:
            raise ValueError("Derived output must stay outside the immutable evidence package")
        data = build(root)
        write_outputs(data, target)
        if args.verbose:
            a = data["catalog"]["automatic"]
            print(f'Automatic catalog: {a["PASS"]}/{a["total"]} PASS ({a["pass_percent"]:.2f}%). FAIL={a["FAIL"]}; REVIEW={a["REVIEW"]}.')
            for r in data["sql"]:
                print(f'SQL {r["schema"]} {r["query"]} {r["rows"]} rows: observed p95={r["p95_ms"]} ms; target <{r["sql_budget_ms"]} ms; {r["budget_result"]}; n=10; no network/Android.')
            for r in data["android_map"]:
                print(f'Android API {r["api"]}: observed={r["measured_ms"]} ms; target <{r["budget_ms"]} ms; {r["status"]}; n={r["n"]}; emulator accessibility proxy.')
        print(json.dumps({"derived_metrics": "CREATED", "product_gate_unchanged": data["gate"]["decision"], "output": str(target)}))
        return 0
    except (OSError, ValueError, KeyError, TypeError, StopIteration) as e:
        print(json.dumps({"derived_metrics": "ERROR", "error": str(e)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
