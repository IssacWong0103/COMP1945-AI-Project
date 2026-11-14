"""Aggregate raw evaluation outputs into report-ready metrics.

Reads results/raw/*.jsonl, validates shape lightly, computes every metric, and
writes results/aggregated/*.json (including summary.json consumed by the
dashboard and report generator). Pure stdlib — no numpy/pandas.

Usage:
    backend/.venv/bin/python evaluation/scripts/analyze.py
"""

from __future__ import annotations

import json
import math
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common  # noqa: E402

VALID_CLASSES = {"valid_single", "model_worn", "multi_item", "collage", "irrelevant", "unreadable"}
NEGATIVE_CLASSES = {"model_worn", "multi_item", "collage", "irrelevant", "unreadable"}

COLOR_SYNONYMS: dict[str, str] = {
    "grey": "gray",
    "charcoal": "gray",
    "denim": "blue",
    "navy": "navy",
    "blue": "blue",
    "white": "white",
    "offwhite": "white",
    "off-white": "white",
    "cream": "beige",
    "ivory": "beige",
    "stone": "beige",
    "nude": "beige",
    "beige": "beige",
    "khaki": "khaki",
    "brown": "brown",
    "tan": "brown",
    "camel": "brown",
    "black": "black",
    "gray": "gray",
    "red": "red",
    "maroon": "red",
    "burgundy": "red",
    "pink": "pink",
    "green": "green",
    "olive": "olive",
    "yellow": "yellow",
    "orange": "orange",
    "purple": "purple",
    "teal": "teal",
}


def normalize_color(value: object) -> str:
    text = re.sub(r"[^a-z]", "", str(value or "").lower())
    return COLOR_SYNONYMS.get(text, text or "unknown")


def percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    values = sorted(sorted_values)
    rank = (len(values) - 1) * (p / 100.0)
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return values[lower]
    weight = rank - lower
    return values[lower] * (1 - weight) + values[upper] * weight


def _round(value: float, digits: int = 4) -> float:
    return round(value, digits)


def analyze_upload(records: list[dict]) -> dict:
    valid = [r for r in records if r.get("expected_class") == "valid_single"]
    negatives = [r for r in records if r.get("expected_class") in NEGATIVE_CLASSES]

    def outcome(r: dict) -> str:
        return r.get("outcome") or "error"

    accepted_valid = [r for r in valid if outcome(r) == "accepted"]
    rejected_valid = [r for r in valid if outcome(r) == "rejected"]
    unavailable_valid = [r for r in valid if outcome(r) == "unavailable"]

    accepted_negatives = [r for r in negatives if outcome(r) == "accepted"]
    rejected_negatives = [r for r in negatives if outcome(r) == "rejected"]

    # Screening confusion matrix over available results (excludes 'unavailable').
    tp = len(accepted_valid)
    fn = len(rejected_valid)
    tn = len(rejected_negatives)
    fp = len(accepted_negatives)

    rejection_reasons: dict[str, int] = {}
    for r in rejected_valid + rejected_negatives:
        detail = str(r.get("error_detail") or "")
        reason = detail.split(". ")[-1][:80] if detail else "unspecified"
        rejection_reasons[reason] = rejection_reasons.get(reason, 0) + 1

    # Tagging accuracy over accepted valid rows.
    category_correct = 0
    color_correct = 0
    style_correct = 0
    formality_errors: list[float] = []
    formality_agree = 0
    per_class: dict[str, dict[str, int]] = {}

    for r in accepted_valid:
        tags = r.get("tags") or {}
        expected_cat = r.get("expected_category")
        expected_color = r.get("expected_color")
        expected_style = r.get("expected_style")
        expected_formality = r.get("expected_formality")

        pred_cat = tags.get("category")
        pred_color = tags.get("color")
        pred_style = tags.get("style")
        pred_formality = tags.get("formalityScore")

        if expected_cat:
            per_class.setdefault(expected_cat, {"tp": 0, "fn": 0})
            if pred_cat == expected_cat:
                category_correct += 1
                per_class[expected_cat]["tp"] += 1
            else:
                per_class[expected_cat]["fn"] += 1
        if expected_color:
            if normalize_color(pred_color) == normalize_color(expected_color):
                color_correct += 1
        if expected_style:
            if pred_style == expected_style:
                style_correct += 1
        if expected_formality is not None and isinstance(pred_formality, (int, float)):
            err = abs(float(pred_formality) - float(expected_formality))
            formality_errors.append(err)
            if err <= 15:
                formality_agree += 1

    # Macro-F1 over the expected categories observed in valid rows.
    f1s: list[float] = []
    for cat in sorted(per_class):
        entry = per_class[cat]
        tp_c = entry["tp"]
        # Precision/recall for a single-class prediction problem approximated per
        # expected class: precision = tp / predicted-as-cat, recall = tp / expected-cat.
        predicted_as = sum(
            1
            for r in accepted_valid
            if (r.get("tags") or {}).get("category") == cat
        )
        precision = tp_c / predicted_as if predicted_as else 0.0
        recall = tp_c / (tp_c + entry["fn"]) if (tp_c + entry["fn"]) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        f1s.append(f1)
    macro_f1 = statistics.mean(f1s) if f1s else 0.0

    accepted_count = len(accepted_valid)
    category_accuracy = category_correct / accepted_count if accepted_count else 0.0
    color_accuracy = color_correct / accepted_count if accepted_count else 0.0
    style_accuracy = style_correct / accepted_count if accepted_count else 0.0
    formality_mae = statistics.mean(formality_errors) if formality_errors else None
    formality_agreement = (
        formality_agree / len(formality_errors) if formality_errors else None
    )

    # End-to-end tagging success over ALL valid rows (accepted and category-correct).
    end_to_end = category_correct / len(valid) if valid else 0.0

    # Heuristic baseline (accept-all screening; attributes from stored heuristic_tags).
    heur_category_correct = 0
    heur_color_correct = 0
    heur_style_correct = 0
    heur_formality_errors: list[float] = []
    for r in accepted_valid:
        tags = r.get("heuristic_tags") or {}
        if tags.get("category") == r.get("expected_category"):
            heur_category_correct += 1
        if normalize_color(tags.get("color")) == normalize_color(r.get("expected_color")):
            heur_color_correct += 1
        if tags.get("style") == r.get("expected_style"):
            heur_style_correct += 1
        if r.get("expected_formality") is not None and isinstance(tags.get("formalityScore"), (int, float)):
            heur_formality_errors.append(abs(float(tags["formalityScore"]) - float(r["expected_formality"])))

    return {
        "counts": {
            "valid_total": len(valid),
            "negative_total": len(negatives),
            "accepted_valid": accepted_count,
            "rejected_valid": len(rejected_valid),
            "unavailable_valid": len(unavailable_valid),
            "accepted_negative": len(accepted_negatives),
            "rejected_negative": len(rejected_negatives),
        },
        "screening": {
            "valid_acceptance_rate": _round(tp / len(valid)) if valid else None,
            "false_rejection_rate": _round(fn / len(valid)) if valid else None,
            "false_acceptance_rate": _round(fp / len(negatives)) if negatives else None,
            "model_worn_rejection_rate": _round(
                sum(1 for r in rejected_negatives if r.get("expected_class") == "model_worn")
                / max(1, sum(1 for r in negatives if r.get("expected_class") == "model_worn"))
            ) if any(r.get("expected_class") == "model_worn" for r in negatives) else None,
            "confusion_matrix": {"tp": tp, "fn": fn, "tn": tn, "fp": fp},
            "rejection_reasons": rejection_reasons,
        },
        "tagging": {
            "category_accuracy": _round(category_accuracy),
            "category_macro_f1": _round(macro_f1),
            "color_accuracy": _round(color_accuracy),
            "style_accuracy": _round(style_accuracy),
            "formality_mae": _round(formality_mae, 2) if formality_mae is not None else None,
            "formality_agreement_rate": _round(formality_agreement) if formality_agreement is not None else None,
            "end_to_end_tagging_success": _round(end_to_end),
        },
        "heuristic_baseline": {
            "screening": {
                "valid_acceptance_rate": 1.0,
                "false_rejection_rate": 0.0,
                "false_acceptance_rate": 1.0,
            },
            "tagging": {
                "category_accuracy": _round(heur_category_correct / accepted_count) if accepted_count else None,
                "color_accuracy": _round(heur_color_correct / accepted_count) if accepted_count else None,
                "style_accuracy": _round(heur_style_correct / accepted_count) if accepted_count else None,
                "formality_mae": _round(statistics.mean(heur_formality_errors), 2) if heur_formality_errors else None,
            },
        },
    }


def analyze_recommend(records: list[dict]) -> dict:
    conditions = ["full", "no_reference", "random"]
    venues: list[str] = sorted({r.get("venue") for r in records if r.get("venue")})
    per_condition: dict[str, dict] = {}
    per_venue: dict[str, dict] = {}

    for cond in conditions:
        subset = [r for r in records if r.get("condition") == cond]
        best_scores: list[float] = []
        venue_fit_scores: list[float] = []
        cohesion_scores: list[float] = []
        complete_count = 0
        duplicate_count = 0
        invalid_count = 0
        empty_count = 0
        fallback_count = 0
        n = len(subset)
        for r in subset:
            outfits = r.get("outfits") or []
            checks = r.get("constraint_checks") or {}
            if outfits:
                best = max((o.get("overall_score") or 0.0) for o in outfits)
                best_scores.append(best)
                venue_fit_scores.append(max((o.get("venue_fit_score") or 0.0) for o in outfits))
                cohesion_scores.append(max((o.get("cohesion_score") or 0.0) for o in outfits))
            if checks.get("complete"):
                complete_count += 1
            if checks.get("duplicate_items"):
                duplicate_count += 1
            if checks.get("invalid_combination"):
                invalid_count += 1
            if checks.get("empty_return") or not outfits:
                empty_count += 1
            if r.get("match_status") == "fallback":
                fallback_count += 1
        per_condition[cond] = {
            "cases": n,
            "overall_mean": _round(statistics.mean(best_scores)) if best_scores else None,
            "overall_median": _round(statistics.median(best_scores)) if best_scores else None,
            "venue_fit_mean": _round(statistics.mean(venue_fit_scores)) if venue_fit_scores else None,
            "cohesion_mean": _round(statistics.mean(cohesion_scores)) if cohesion_scores else None,
            "complete_rate": _round(complete_count / n) if n else None,
            "duplicate_rate": _round(duplicate_count / n) if n else None,
            "invalid_rate": _round(invalid_count / n) if n else None,
            "empty_rate": _round(empty_count / n) if n else None,
            "fallback_rate": _round(fallback_count / n) if n else None,
        }

    # Pairwise full-vs-baseline using best overall per case, matched by (case_id, venue).
    def paired(cond_a: str, cond_b: str) -> dict:
        wins = ties = losses = 0
        diffs: list[float] = []
        by_key: dict[tuple, float] = {}
        for r in records:
            key = (r.get("case_id"), r.get("venue"))
            outfits = r.get("outfits") or []
            best = max((o.get("overall_score") or 0.0) for o in outfits) if outfits else None
            if best is not None:
                by_key[(key, r.get("condition"))] = best
        for key in by_key:
            case_key = key[0]
            a = by_key.get((case_key, cond_a))
            b = by_key.get((case_key, cond_b))
            if a is None or b is None:
                continue
            diffs.append(a - b)
            if a > b + 1e-9:
                wins += 1
            elif b > a + 1e-9:
                losses += 1
            else:
                ties += 1
        return {
            "wins": wins,
            "ties": ties,
            "losses": losses,
            "mean_diff": _round(statistics.mean(diffs)) if diffs else None,
        }

    for venue in venues:
        subset = [r for r in records if r.get("venue") == venue]
        per_venue[venue] = {}
        for cond in conditions:
            cond_subset = [r for r in subset if r.get("condition") == cond]
            scores = []
            for r in cond_subset:
                outfits = r.get("outfits") or []
                if outfits:
                    scores.append(max((o.get("overall_score") or 0.0) for o in outfits))
            per_venue[venue][cond] = {
                "cases": len(cond_subset),
                "overall_mean": _round(statistics.mean(scores)) if scores else None,
            }

    return {
        "conditions": per_condition,
        "per_venue": per_venue,
        "full_vs_no_reference": paired("full", "no_reference"),
        "full_vs_random": paired("full", "random"),
    }


def analyze_latency(records: list[dict]) -> dict:
    scenarios: dict[str, list[dict]] = {}
    for r in records:
        scenarios.setdefault(r.get("scenario"), []).append(r)

    out: dict[str, dict] = {}
    for scenario, rows in scenarios.items():
        elapsed = [r["elapsed_ms"] for r in rows if r.get("elapsed_ms")]
        ok_statuses = {200, 201}
        successful = [
            r
            for r in rows
            if r.get("http_status") in ok_statuses or (scenario == "tryon" and r.get("http_status") == 200)
        ]
        within_20s = [r for r in successful if r.get("elapsed_ms") is not None and r["elapsed_ms"] <= 20000]
        out[scenario] = {
            "count": len(rows),
            "successful": len(successful),
            "timeout_or_failure_rate": _round(1 - len(successful) / len(rows)) if rows else None,
            "median_ms": _round(percentile(elapsed, 50), 1) if elapsed else None,
            "p95_ms": _round(percentile(elapsed, 95), 1) if elapsed else None,
            "min_ms": _round(min(elapsed), 1) if elapsed else None,
            "max_ms": _round(max(elapsed), 1) if elapsed else None,
            "within_20s_rate": _round(len(within_20s) / len(successful)) if successful else None,
            "modes": sorted({r.get("mode") for r in rows if r.get("mode")}),
        }
    return out


def analyze_functional(records: list[dict]) -> dict:
    passed = sum(1 for r in records if r.get("passed") is True)
    failed = sum(1 for r in records if r.get("passed") is False)
    skipped = sum(1 for r in records if r.get("passed") is None)
    total = len(records)
    return {
        "total": total,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "pass_rate": _round(passed / (passed + failed)) if (passed + failed) else None,
        "cases": records,
    }


def validate_upload(records: list[dict]) -> int:
    invalid = 0
    for r in records:
        for key in ("case_id", "filename", "expected_class", "outcome", "recorded_at"):
            if key not in r:
                invalid += 1
                break
        if r.get("expected_class") not in VALID_CLASSES:
            invalid += 1
    return invalid


def main() -> None:
    upload = common.load_jsonl(common.RESULTS_RAW / "upload_results.jsonl")
    recommend = common.load_jsonl(common.RESULTS_RAW / "recommend_results.jsonl")
    latency = common.load_jsonl(common.RESULTS_RAW / "latency_results.jsonl")
    functional = common.load_jsonl(common.RESULTS_RAW / "functional_results.jsonl")

    upload_invalid = validate_upload(upload)
    upload_metrics = analyze_upload(upload)
    recommend_metrics = analyze_recommend(recommend)
    latency_metrics = analyze_latency(latency)
    functional_metrics = analyze_functional(functional)

    summary = {
        "generated_at": common.now_iso(),
        "git_revision": common.git_revision(),
        "upload": upload_metrics,
        "recommend": recommend_metrics,
        "latency": latency_metrics,
        "functional": functional_metrics,
        "validation": {
            "upload_invalid_rows": upload_invalid,
            "upload_rows": len(upload),
            "recommend_rows": len(recommend),
            "latency_rows": len(latency),
            "functional_rows": len(functional),
        },
    }

    common.RESULTS_AGG.mkdir(parents=True, exist_ok=True)
    for name, data in (
        ("upload_metrics.json", upload_metrics),
        ("recommend_metrics.json", recommend_metrics),
        ("latency_metrics.json", latency_metrics),
        ("functional_metrics.json", functional_metrics),
        ("summary.json", summary),
    ):
        path = common.RESULTS_AGG / name
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    print(f"Aggregated metrics written to {common.RESULTS_AGG}")
    if upload_invalid:
        print(f"WARNING: {upload_invalid} upload rows failed schema validation")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
