"""Generate the professor-facing report (REPORT.md + standalone index.html).

Reads results/aggregated/summary.json and the raw outputs, and renders tables
plus simple inline-SVG charts (no external JS/CSS dependencies).

Usage:
    backend/.venv/bin/python evaluation/scripts/report.py
"""

from __future__ import annotations

import html
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common  # noqa: E402

CHART_COLORS = {"full": "#1f6feb", "no_reference": "#8957e5", "random": "#9e9e9e"}


def _fmt(value, suffix: str = "") -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.3f}{suffix}"
    return f"{value}{suffix}"


def bar_chart(title: str, labels: list[str], values: list[float], *, suffix: str = "", max_value: float = 1.0) -> str:
    """Render a horizontal bar chart as inline SVG."""
    if not labels or len(labels) != len(values):
        return ""
    width = 560
    row_h = 34
    label_w = 150
    bar_area = width - label_w - 90
    height = 40 + row_h * len(labels)
    max_value = max(max_value, max(values) if values else 0.0, 1e-9)
    bars = []
    y = 40
    for label, value in zip(labels, values):
        bar_w = max(2, int(bar_area * (value / max_value))) if value else 0
        bars.append(
            f'<text x="0" y="{y + 16}" class="tick">{html.escape(label)}</text>'
            f'<rect x="{label_w}" y="{y + 3}" width="{bar_w}" height="20" rx="3" fill="#1f6feb"/>'
            f'<text x="{label_w + bar_w + 8}" y="{y + 18}" class="val">{_fmt(value, suffix)}</text>'
        )
        y += row_h
    return (
        f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="{html.escape(title)}">'
        f'<text x="0" y="22" class="title">{html.escape(title)}</text>'
        + "".join(bars)
        + "</svg>"
    )


def grouped_bar_chart(title: str, groups: list[str], series: dict[str, list[float]], *, suffix: str = "") -> str:
    if not groups or not series:
        return ""
    n = len(groups)
    m = len(series)
    width = 560
    row_h = 34
    label_w = 150
    bar_area = width - label_w - 100
    height = 40 + row_h * n
    max_value = max([max(v) for v in series.values()] or [0.0])
    max_value = max(max_value, 1e-9)
    group_w = bar_area / n
    bar_w = max(4, int(group_w * 0.7 / m))
    bars = []
    y = 40
    for gi, group in enumerate(groups):
        bars.append(f'<text x="0" y="{y + 16}" class="tick">{html.escape(group)}</text>')
        for si, (sname, svalues) in enumerate(series.items()):
            value = svalues[gi] if gi < len(svalues) else 0.0
            h = int(20 * (value / max_value)) if value else 0
            x = label_w + gi * group_w + si * bar_w
            by = y + 3 + (20 - h)
            bars.append(
                f'<rect x="{x}" y="{by}" width="{max(1, bar_w - 1)}" height="{max(0, h)}" '
                f'rx="2" fill="{CHART_COLORS.get(sname, "#666")}"/>'
            )
        y += row_h
    legend = "".join(
        f'<span class="legend"><span class="swatch" style="background:{CHART_COLORS.get(s, "#666")}"></span>{html.escape(s)}</span>'
        for s in series
    )
    return (
        f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="{html.escape(title)}">'
        f'<text x="0" y="22" class="title">{html.escape(title)}</text>'
        + "".join(bars)
        + "</svg>"
        + f'<div class="legend-row">{legend}</div>'
    )


def build_report(summary: dict, functional: list[dict]) -> str:
    upload = summary.get("upload", {})
    rec = summary.get("recommend", {})
    lat = summary.get("latency", {})
    func = summary.get("functional", {})

    lines: list[str] = []
    lines.append("# USTyle Evaluation Report\n")
    lines.append(f"Generated: `{summary.get('generated_at', '')}` — git `{summary.get('git_revision', 'unknown')}`\n")
    lines.append("This report is produced by the reproducible `evaluation/` pipeline against an isolated backend instance. All metrics are objective and programmatic; no human user study was performed.\n")

    lines.append("## 1. Upload screening and tagging\n")
    lines.append("_How to read: acceptance/rejection rates measure the screen (false rejection = valid photos wrongly blocked, false acceptance = invalid photos wrongly let in — both should be low). Category/color/style accuracy is measured over accepted photos only; end-to-end tagging success is the honest headline number because a wrongly rejected valid photo still counts against it._\n")
    counts = upload.get("counts", {})
    screening = upload.get("screening", {})
    tagging = upload.get("tagging", {})
    heur = upload.get("heuristic_baseline", {}).get("tagging", {})

    cm = screening.get("confusion_matrix", {})
    lines.append("| Confusion matrix | Predicted accept | Predicted reject |")
    lines.append("| --- | ---: | ---: |")
    lines.append(f"| Actually valid | TP = {cm.get('tp', 0)} | FN = {cm.get('fn', 0)} |")
    lines.append(f"| Actually invalid | FP = {cm.get('fp', 0)} | TN = {cm.get('tn', 0)} |\n")

    lines.append("| Metric | VLM | Heuristic baseline |")
    lines.append("| --- | ---: | ---: |")
    lines.append(f"| Valid acceptance rate | {_fmt(screening.get('valid_acceptance_rate'))} | 1.000 |")
    lines.append(f"| False rejection rate | {_fmt(screening.get('false_rejection_rate'))} | 0.000 |")
    lines.append(f"| False acceptance rate | {_fmt(screening.get('false_acceptance_rate'))} | 1.000 |")
    lines.append(f"| Category accuracy | {_fmt(tagging.get('category_accuracy'))} | {_fmt(heur.get('category_accuracy'))} |")
    lines.append(f"| Category macro-F1 | {_fmt(tagging.get('category_macro_f1'))} | — |")
    lines.append(f"| Color accuracy | {_fmt(tagging.get('color_accuracy'))} | {_fmt(heur.get('color_accuracy'))} |")
    lines.append(f"| Style accuracy | {_fmt(tagging.get('style_accuracy'))} | {_fmt(heur.get('style_accuracy'))} |")
    lines.append(f"| Formality MAE (0–100) | {_fmt(tagging.get('formality_mae'))} | {_fmt(heur.get('formality_mae'))} |")
    lines.append(f"| End-to-end tagging success | {_fmt(tagging.get('end_to_end_tagging_success'))} | — |\n")
    lines.append(f"Counts: {counts.get('valid_total', 0)} valid, {counts.get('negative_total', 0)} negative, {counts.get('accepted_valid', 0)} accepted-valid, {counts.get('unavailable_valid', 0)} unavailable.\n")

    reasons = screening.get("rejection_reasons", {})
    if reasons:
        lines.append("Rejection-reason distribution:")
        for reason, count in sorted(reasons.items(), key=lambda kv: -kv[1]):
            lines.append(f"- {reason}: {count}")
        lines.append("")

    lines.append("## 2. Recommendation ablation\n")
    lines.append("_How to read: overall score (0–1) is the system's own ranking, so compare conditions rather than trusting the absolute value. If full beats no-reference more often and by more, retailer-reference styling adds value; if it ties, venue/cohesion rules are doing the work. Complete rate is the share of cases with a full outfit; fallback rate is the share of best-effort returns._\n")
    conds = rec.get("conditions", {})
    lines.append("| Condition | Cases | Overall mean | Venue-fit mean | Cohesion mean | Complete rate | Fallback rate |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for cond in ("full", "no_reference", "random"):
        c = conds.get(cond, {})
        lines.append(
            f"| {cond} | {c.get('cases', 0)} | {_fmt(c.get('overall_mean'))} | "
            f"{_fmt(c.get('venue_fit_mean'))} | {_fmt(c.get('cohesion_mean'))} | "
            f"{_fmt(c.get('complete_rate'))} | {_fmt(c.get('fallback_rate'))} |"
        )
    lines.append("")
    for pair, label in (("full_vs_no_reference", "Full vs no-reference"), ("full_vs_random", "Full vs random")):
        p = rec.get(pair, {})
        lines.append(f"{label}: win/tie/loss = {p.get('wins', 0)}/{p.get('ties', 0)}/{p.get('losses', 0)}; mean overall-score difference = {_fmt(p.get('mean_diff'))}")
    lines.append("")

    lines.append("## 3. Latency\n")
    lines.append("_How to read: median is the typical wait; p95 is the wait in the slowest 5% of runs (what you feel in a demo). The ≤20 s rate is the share of successful upload-to-recommend runs under the 20-second target (aim ≥0.95). A large median–p95 gap means occasional slow runs, usually external API tail latency._\n")
    lines.append("| Scenario | Count | Successful | Median | p95 | Max | ≤20 s rate |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for scenario in ("upload", "recommend", "upload_to_recommend", "tryon"):
        m = lat.get(scenario, {})
        lines.append(
            f"| {scenario} | {m.get('count', 0)} | {m.get('successful', 0)} | "
            f"{_fmt(m.get('median_ms'), ' ms')} | {_fmt(m.get('p95_ms'), ' ms')} | "
            f"{_fmt(m.get('max_ms'), ' ms')} | {_fmt(m.get('within_20s_rate'))} |"
        )
    lines.append("")

    lines.append("## 4. Functional reliability\n")
    lines.append("_How to read: pass rate is the share of defined user-flow scenarios that behaved as expected (aim ≥0.9). Each row compares expected vs actual HTTP status; SKIP means the scenario could not be exercised in this environment._\n")
    lines.append(f"Pass rate: {_fmt(func.get('pass_rate'))} ({func.get('passed', 0)} passed, {func.get('failed', 0)} failed, {func.get('skipped', 0)} skipped)\n")
    lines.append("| Case | Expected | Actual | Result |")
    lines.append("| --- | --- | --- | --- |")
    for case in functional:
        result = "PASS" if case.get("passed") is True else ("FAIL" if case.get("passed") is False else "SKIP")
        lines.append(
            f"| {html.escape(str(case.get('case_id')))} — {html.escape(str(case.get('description')))} "
            f"| {case.get('expected_status')} | {case.get('actual_status')} | {result} |"
        )
    lines.append("")

    lines.append("## 5. Summary\n")
    lines.append("| Metric | Full-system | Baseline | Target | Interpretation |")
    lines.append("| --- | ---: | ---: | ---: | --- |")
    lines.append(
        f"| Upload end-to-end tagging success | {_fmt(tagging.get('end_to_end_tagging_success'))} | "
        f"{_fmt(heur.get('category_accuracy'))} (heuristic cat) | ≥ 0.80 | VLM adds screening value over accept-all heuristic |"
    )
    lines.append(
        f"| Upload-to-recommend p95 | {_fmt(lat.get('upload_to_recommend', {}).get('p95_ms'), ' ms')} | — | ≤ 20000 ms | Tail-latency health of the real-AI path |"
    )
    lines.append(
        f"| Functional pass rate | {_fmt(func.get('pass_rate'))} | — | ≥ 0.90 | Reliability of core user flows |"
    )
    lines.append("")

    lines.append("## 6. Limitations\n")
    lines.append("- Static one-time retailer-reference snapshot; no seasonal lookbook claims.")
    lines.append("- No human user study; LLM judge scores (if added later) are judge preference, not user satisfaction.")
    lines.append("- Small fixed test sets and external API variability limit generalization.")
    lines.append("- Style accuracy is an exact-enum match proxy; subjective style judgments are deferred to a multimodal judge.")
    lines.append("")
    return "\n".join(lines)


def build_html(summary: dict, functional: list[dict]) -> str:
    upload = summary.get("upload", {})
    rec = summary.get("recommend", {})
    lat = summary.get("latency", {})
    func = summary.get("functional", {})

    conds = rec.get("conditions", {})
    rec_groups = ["full", "no_reference", "random"]
    rec_series = {
        "overall": [conds.get(c, {}).get("overall_mean") or 0.0 for c in rec_groups],
        "venue_fit": [conds.get(c, {}).get("venue_fit_mean") or 0.0 for c in rec_groups],
    }
    rec_chart = grouped_bar_chart("Recommendation: mean scores by condition", rec_groups, rec_series)

    tagging = upload.get("tagging", {})
    heur = upload.get("heuristic_baseline", {}).get("tagging", {})
    tag_labels = ["category", "color", "style", "end-to-end"]
    vlm_vals = [tagging.get("category_accuracy") or 0.0, tagging.get("color_accuracy") or 0.0, tagging.get("style_accuracy") or 0.0, tagging.get("end_to_end_tagging_success") or 0.0]
    heur_vals = [heur.get("category_accuracy") or 0.0, heur.get("color_accuracy") or 0.0, heur.get("style_accuracy") or 0.0, 0.0]
    tag_chart = grouped_bar_chart("Tagging accuracy: VLM vs heuristic", tag_labels, {"VLM": vlm_vals, "heuristic": heur_vals})

    lat_labels = []
    lat_med = []
    lat_p95 = []
    for scenario in ("upload", "recommend", "upload_to_recommend", "tryon"):
        m = lat.get(scenario, {})
        if m.get("count"):
            lat_labels.append(scenario)
            lat_med.append(m.get("median_ms") or 0.0)
            lat_p95.append(m.get("p95_ms") or 0.0)
    lat_chart = grouped_bar_chart("Latency (ms): median vs p95", lat_labels, {"median": lat_med, "p95": lat_p95})

    report_md = build_report(summary, functional)
    body = f"""
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>USTyle Evaluation Report</title>
<style>
  body {{ font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem auto; max-width: 980px; padding: 0 1rem; color: #1d1d1f; }}
  h1, h2 {{ border-bottom: 1px solid #e5e5e5; padding-bottom: .25rem; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .9rem; }}
  th, td {{ border: 1px solid #d9d9d9; padding: .4rem .6rem; text-align: left; }}
  th {{ background: #f5f5f7; }}
  .chart {{ width: 100%; max-width: 620px; display: block; margin: .5rem 0; }}
  .chart .title {{ font-weight: 600; font-size: .95rem; fill: #1d1d1f; }}
  .chart .tick {{ font-size: .8rem; fill: #555; }}
  .chart .val {{ font-size: .78rem; fill: #333; }}
  .legend-row {{ font-size: .8rem; color: #555; margin-bottom: 1rem; }}
  .legend {{ margin-right: 1rem; }}
  .swatch {{ display:inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: .25rem; }}
  code {{ background: #f5f5f7; padding: .1rem .3rem; border-radius: 4px; }}
</style>
</head>
<body>
<h1>USTyle Evaluation Report</h1>
<p>Generated {html.escape(str(summary.get('generated_at', '')))} — git <code>{html.escape(str(summary.get('git_revision', 'unknown')))}</code></p>
<p>Objective, programmatic metrics from the reproducible <code>evaluation/</code> pipeline. No human user study.</p>
{rec_chart}
{tag_chart}
{lat_chart}
<h2>Summary tables</h2>
<pre style="white-space:pre-wrap;font-size:.85rem;background:#fafafa;padding:1rem;border:1px solid #eee;">{html.escape(report_md)}</pre>
</body>
</html>
"""
    return body


def main() -> None:
    summary_path = common.RESULTS_AGG / "summary.json"
    if not summary_path.is_file():
        print("No aggregated summary.json found. Run analyze.py first.")
        sys.exit(1)
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    functional = summary.get("functional", {}).get("cases", [])

    common.REPORT_DIR.mkdir(parents=True, exist_ok=True)
    md = build_report(summary, functional)
    (common.REPORT_DIR / "REPORT.md").write_text(md, encoding="utf-8")
    (common.REPORT_DIR / "index.html").write_text(build_html(summary, functional), encoding="utf-8")
    print(f"Report written to {common.REPORT_DIR / 'REPORT.md'} and {common.REPORT_DIR / 'index.html'}")


if __name__ == "__main__":
    main()
