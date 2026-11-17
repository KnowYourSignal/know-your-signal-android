"""Self-contained evidence: JSON, HTML, JUnit XML, CSV and incident notes."""

from __future__ import annotations

import csv
import html
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from core import digest, redact, summarize, gate, judge_agreement, validate_report

LABELS = {
    "PASS": "Aprobado",
    "FAIL": "Fallido",
    "ERROR": "Error de ejecución",
    "BLOCKED": "Bloqueado",
    "REVIEW": "Revisión humana",
    "NOT_APPLICABLE": "No aplica",
}


def write_json(path: Path, value: object):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        redact(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)) + "\n",
        encoding="utf-8",
    )


def write_report(report: dict, output: Path, policy: dict):
    validate_report(report)
    output.mkdir(parents=True, exist_ok=True)
    report["summary"] = summarize(report["cases"])
    report["gate"] = gate(report["cases"], policy)
    report.setdefault("judge_agreement", judge_agreement([]))
    report["scope_warning"] = (
        "Pruebas lógicas/componentes con datos controlados, análisis estático y evidencias Android declaradas. No equivalen a aceptación en teléfonos físicos, garantía de anonimato, certificación ISO o SLA de Cloud."
    )
    for case in report["cases"]:
        relative = f'evidence/{case["case_id"]}.json'
        write_json(output / relative, {
            k: v for k, v in case.items() if k not in {"evidence_file", "evidence_sha256"}
        })
        case["evidence_file"] = relative
        case["evidence_sha256"] = digest(output / relative)
    write_json(output / "report.json", report)
    _csv(report, output)
    _junit(report, output)
    _incidents(report, output)
    _html(report, output)
    files = [
        p for p in output.rglob("*") if p.is_file() and p != output / "manifest.sha256.json"
    ]
    write_json(
        output / "manifest.sha256.json",
        {str(p.relative_to(output)): digest(p) for p in sorted(files)},
    )


def _csv(report: dict, output: Path):
    with (output / "traceability.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "case_id",
                "requisito",
                "familia",
                "severidad",
                "estado",
                "tipo_evidencia",
                "titulo",
                "esperado",
                "evidencia",
                "sha256",
            ]
        )
        for c in report["cases"]:
            writer.writerow(
                [
                    safe_csv_cell(value)
                    for value in [
                        c["case_id"],
                        c["requirement_id"],
                        c["category"],
                        c["severity"],
                        c["status"],
                        c["evidence_kind"],
                        c["title"],
                        json.dumps(c.get("expected"), ensure_ascii=False),
                        c["evidence_file"],
                        c["evidence_sha256"],
                    ]
                ]
            )
    with (output / "human-review-template.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as stream:
        writer = csv.writer(stream)
        writer.writerow(
            ["run_id", "case_id", "reviewer", "verdict", "evidence", "notes"]
        )
        for c in report["cases"]:
            if c.get("adapter") == "human":
                writer.writerow([report["run_id"], c["case_id"], "", "", "", ""])
    with (output / "technical-review-template.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as stream:
        writer = csv.writer(stream)
        writer.writerow(
            ["run_id", "case_id", "reviewer", "decision", "evidence", "rationale"]
        )
        for c in report["cases"]:
            if c.get("requires_interpretation"):
                writer.writerow([report["run_id"], c["case_id"], "", "", "", ""])
    with (output / "calibration-template.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as stream:
        writer = csv.writer(stream)
        writer.writerow([
            "run_id", "source_report_sha256", "case_id", "automatic_verdict",
            "reviewer", "human_verdict", "evidence", "rationale",
        ])
        report_sha = digest(output / "report.json")
        for c in report["cases"]:
            if c.get("adapter") != "human" and c["status"] in {"PASS", "FAIL"}:
                writer.writerow([report["run_id"], report_sha, c["case_id"], c["status"], "", "", "", ""])


def safe_csv_cell(value):
    """Keep text untrusted by spreadsheet formula evaluation on opening CSV."""
    text = redact(str(value))
    if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
        return "'" + text
    return text


def _junit(report: dict, output: Path):
    cases = report["cases"]
    root = ET.Element(
        "testsuite",
        name="KnowYourSignal Robot QA",
        tests=str(len(cases)),
        failures=str(sum(c["status"] == "FAIL" for c in cases)),
        errors=str(sum(c["status"] == "ERROR" for c in cases)),
        skipped=str(
            sum(c["status"] in {"BLOCKED", "REVIEW", "NOT_APPLICABLE"} for c in cases)
        ),
    )
    for case in cases:
        test = ET.SubElement(
            root,
            "testcase",
            classname=case["category"],
            name=case["case_id"] + " " + case["title"],
            time=str(
                sum(
                    a.get("evaluation_duration_ms", 0) for a in case.get("attempts", [])
                )
                / 1000
            ),
        )
        state = case["status"]
        if state in {"FAIL", "ERROR"}:
            ET.SubElement(
                test,
                "failure" if state == "FAIL" else "error",
                message=case.get("observed", state)[:600],
            ).text = redact(json.dumps(case.get("attempts", []), ensure_ascii=False))
        elif state in {"BLOCKED", "REVIEW", "NOT_APPLICABLE"}:
            ET.SubElement(test, "skipped", message=case.get("observed", LABELS[state]))
        ET.SubElement(test, "system-out").text = (
            f'run_id={report["run_id"]}; evidence={case["evidence_file"]}; kind={case["evidence_kind"]}'
        )
    ET.indent(root)
    ET.ElementTree(root).write(
        output / "junit.xml", encoding="utf-8", xml_declaration=True
    )


def _incidents(report: dict, output: Path):
    lines = [
        "# Registro de hallazgos",
        "",
        f'Campaña: {report["run_id"]}',
        f'Versión de la app: {report["metadata"].get("sut_revision")}',
        "",
        "Los hallazgos se conservan abiertos. No se aplican correcciones al producto.",
        "",
    ]
    findings = [
        c for c in report["cases"] if c["status"] in {"FAIL", "ERROR", "BLOCKED"}
    ]
    for case in findings:
        priority = "P1" if case["severity"] in {"critical", "high"} else "P2"
        lines += [
            f'## INC-{case["case_id"]} - {case["title"]}',
            "",
            f'- Prioridad de revisión propuesta: {priority}. Estado del criterio: {case["status"]}.',
            f'- Requisito: {case["requirement_id"]}. Evidencia: {case["evidence_kind"]}.',
            f'- Entorno: {report["metadata"].get("environment", "no declarado")}.',
            f'- Qué se esperaba: {json.dumps(case.get("expected"), ensure_ascii=False)}.',
            f'- Qué ocurrió: {redact(case.get("observed", case["status"]))}.',
            f'- Reproducción: ejecutar la campaña y filtrar {case["case_id"]}.',
            f'- Evidencia: [{case["evidence_file"]}]({case["evidence_file"]}).',
            "- La causa, severidad e impacto requieren revisión del equipo. No se declara P0 sin pérdida/guardado/crash confirmado; un bloqueo o error del harness no se atribuye automáticamente a la app.",
            "",
        ]
    if not findings:
        lines += [
            "No se detectaron fallos automáticos en el alcance ejecutado. Revisar los casos humanos pendientes."
        ]
    (output / "incidents.md").write_text(redact("\n".join(lines)), encoding="utf-8")


def _html(report: dict, output: Path):
    esc = lambda x: html.escape(str(x), quote=True)
    summary, metadata = report["summary"], report["metadata"]
    cards = "".join(
        f'<div class="stat"><strong>{n}</strong><span>{esc(LABELS.get(s,s))}</span></div>'
        for s, n in sorted(summary["counts"].items())
    )
    entries = []
    for case in report["cases"]:
        attempts = "".join(
            f'<li>{esc(a.get("status"))} · {esc(a.get("evaluation_duration_ms", "-"))} ms de evaluación<pre>{esc(redact(a.get("message", "")))}</pre></li>'
            for a in case.get("attempts", [])
        )
        attachments = []
        for attachment in case.get("attachments", []):
            relative = attachment.get("path", "")
            if (
                relative
                and not Path(relative).is_absolute()
                and ".." not in Path(relative).parts
                and ":" not in relative
                and "\\" not in relative
            ):
                attachments.append(
                    f'<li><a href="{esc(relative)}">{esc(attachment.get("label", relative))}</a> · {esc(attachment.get("kind", "evidence"))}</li>'
                )
        entries.append(
            f"""<article class="case" data-status="{esc(case['status'])}" data-category="{esc(case['category'])}">
<details><summary><span class="status {esc(case['status'])}">{esc(LABELS[case['status']])}</span><b>{esc(case['case_id'])}</b> {esc(case['title'])}</summary>
<div class="detail"><p><b>Requisito:</b> {esc(case['requirement_id'])} · <b>Riesgo:</b> {esc(case['severity'])} · <b>Familia:</b> {esc(case['category'])}</p>
<p><b>Tipo de evidencia:</b> {esc(case['evidence_kind'])}</p><p><b>Resultado:</b> {esc(case.get('observed',''))}</p>
<p><b>Esperado:</b> {esc(json.dumps(case.get('expected'),ensure_ascii=False))}</p>
<p><b>Base de prueba:</b> {esc(', '.join(case.get('sources', [])))}</p>
<pre>{esc(json.dumps(case.get('input'),ensure_ascii=False,indent=2))}</pre><ol>{attempts}</ol>
<a href="{esc(case['evidence_file'])}">Evidencia JSON del caso</a><ul>{''.join(attachments)}</ul><p class="small">SHA-256: {esc(case['evidence_sha256'])}</p></div></details></article>"""
        )
    document = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Robot QA · Know Your Signal</title>
<style>
:root{{font-family:system-ui,sans-serif;color:#203452;background:#f3f6fc}}body{{margin:0}}header{{background:#122b55;color:white;padding:32px max(24px,calc((100vw - 1160px)/2))}}header p{{color:#d6e3ff}}main{{max-width:1160px;margin:24px auto;padding:0 24px 48px}}h1{{font-size:32px;margin:0 0 12px}}h2{{font-size:21px}}.gate{{font-weight:750;font-size:20px}}.warn{{padding:16px;background:#fff5dc;border-left:4px solid #a16b0c;line-height:1.6}}.stats{{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}}.stat{{background:white;padding:16px 24px;border:1px solid #d8e1ed;display:flex;flex-direction:column;gap:4px}}.stat strong{{font-size:28px}}.stat span,.small{{font-size:13px;color:#52647a}}.meta{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px 24px;overflow-wrap:anywhere}}nav{{display:flex;gap:20px;flex-wrap:wrap;margin:20px 0}}a{{color:#2355c7}}.filters{{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}}label{{display:flex;flex-direction:column;gap:6px}}input,select{{font:inherit;border:1px solid #a8b9d1;border-radius:6px;padding:10px;min-width:190px}}.case{{background:white;border:1px solid #d8e1ed;margin:8px 0;border-radius:8px}}summary{{cursor:pointer;padding:15px;line-height:1.8}}.detail{{padding:0 20px 20px}}.status{{font-size:12px;font-weight:bold;border-radius:5px;padding:4px 8px;margin-right:12px;background:#edf2fc}}.PASS{{color:#18603e;background:#e3f4eb}}.FAIL,.ERROR{{color:#912f3c;background:#fce8eb}}.REVIEW,.BLOCKED{{color:#79500a;background:#fff2d5}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6fc;padding:12px;font-size:12px}}.hidden{{display:none}}button{{font:inherit;padding:10px 14px;cursor:pointer}}@media print{{header{{padding:20px}}.filters,button{{display:none}}.case{{break-inside:avoid}}details:not([open]) .detail{{display:block}}}}
</style></head><body><header><h1>Robot QA · Know Your Signal</h1><p>{esc(report['run_id'])}</p><div class="gate">Decisión: {esc(report['gate']['decision'])}</div><p>{esc(report['gate']['reason'])}</p></header>
<main><p class="warn">{esc(report['scope_warning'])} Los tiempos de los casos lógicos son del evaluador, no la velocidad de la app.</p>
<div class="stats">{cards}</div><section class="meta"><p><b>Commit probado:</b> {esc(metadata.get('sut_revision'))}</p><p><b>App SHA-256:</b> {esc(metadata.get('application_fingerprint'))}</p><p><b>Catálogo SHA-256:</b> {esc(metadata.get('catalog_sha256'))}</p><p><b>Repeticiones:</b> {esc(metadata.get('repetitions'))}</p><p><b>Entorno:</b> {esc(metadata.get('environment'))}</p><p><b>Modelo / prompt:</b> no aplica al producto Android actual</p></section>
<nav><a href="report.json">Reporte completo JSON</a><a href="traceability.csv">Matriz CSV</a><a href="junit.xml">JUnit XML</a><a href="incidents.md">Hallazgos</a><a href="human-review-template.csv">Aceptación humana</a><a href="technical-review-template.csv">Decisiones técnicas</a><a href="calibration-template.csv">Calibración de oráculos</a><a href="manifest.sha256.json">Integridad de evidencias</a></nav>
<p><b>Revisión de evaluadores:</b> {esc(report['judge_agreement'].get('status'))} · pares reales: {esc(report['judge_agreement'].get('n'))}. El acuerdo no modifica los veredictos automáticos ni aprueba una entrega. Consulte sus límites de muestreo en el JSON.</p>
<p>{summary['executed_unique']} casos únicos ejecutados de {summary['total']}. Las repeticiones no aumentan el número de casos. Los casos humanos pendientes no cuentan como aprobados.</p>
<div class="filters"><label>Buscar<input id="query" placeholder="Caso, requisito o título"></label><label>Estado<select id="status"><option value="">Todos</option>{''.join(f'<option>{esc(s)}</option>' for s in LABELS)}</select></label><button id="expand" type="button">Mostrar detalles</button></div>
<section aria-label="Resultados por caso">{''.join(entries)}</section>
<h2>Revisión humana y límites</h2><p>Los revisores completan los casos físicos de la hoja de ruta. Acuerdo automático/humano: {esc(report['judge_agreement']['status'])}. No se simulan personas ni se inventan resultados de teléfonos. La decisión de liberación sigue perteneciendo al equipo.</p></main>
<script>const q=document.getElementById('query'),s=document.getElementById('status');function filter(){{document.querySelectorAll('.case').forEach(c=>c.classList.toggle('hidden',(s.value&&c.dataset.status!==s.value)||!c.textContent.toLowerCase().includes(q.value.toLowerCase())))}}q.addEventListener('input',filter);s.addEventListener('change',filter);document.getElementById('expand').addEventListener('click',()=>document.querySelectorAll('.case:not(.hidden) details').forEach(d=>d.open=true));</script></body></html>"""
    (output / "report.html").write_text(document, encoding="utf-8")
