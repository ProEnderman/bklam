"""Model registry and leaderboard persistence."""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Optional

from types_ import RegistryRun, LeaderboardEntry
from config import REGISTRY_DIR, REGISTRY_MAX_RUNS_PER_METRIC, LEADERBOARD_TOP_K

logger = logging.getLogger(__name__)
_lock = threading.Lock()


def _registry_path(metric_name: str, segment_id: Optional[str] = None) -> str:
    os.makedirs(REGISTRY_DIR, exist_ok=True)
    suffix = f"_{segment_id}" if segment_id else ""
    return os.path.join(REGISTRY_DIR, f"{metric_name}{suffix}.jsonl")


def record_run(run: RegistryRun) -> None:
    path = _registry_path(run.metric_name, run.segment_id)
    with _lock:
        with open(path, "a") as f:
            f.write(json.dumps(run.to_dict(), default=str) + "\n")


def _load_runs(metric_name: str, segment_id: Optional[str] = None) -> list[dict]:
    path = _registry_path(metric_name, segment_id)
    if not os.path.exists(path):
        return []
    with _lock:
        with open(path) as f:
            runs = []
            for line in f:
                line = line.strip()
                if line:
                    try:
                        runs.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return runs


def get_leaderboard(
    metric_name: str,
    segment_id: Optional[str] = None,
    top_k: int = LEADERBOARD_TOP_K,
) -> list[LeaderboardEntry]:
    runs = _load_runs(metric_name, segment_id)
    if not runs:
        return []

    best_per_family: dict[str, dict] = {}
    for r in runs:
        fam = r.get("model_family", "unknown")
        err = r.get("mean_error", float("inf"))
        if fam not in best_per_family or err < best_per_family[fam].get("mean_error", float("inf")):
            best_per_family[fam] = r

    sorted_entries = sorted(best_per_family.values(), key=lambda x: x.get("mean_error", float("inf")))

    return [
        LeaderboardEntry(
            model_family=e.get("model_family", ""),
            params=e.get("params", {}),
            transform_name=e.get("transform_name", ""),
            mean_error=e.get("mean_error", float("inf")),
            metric_name=metric_name,
            segment_id=segment_id,
            created_at=e.get("created_at", ""),
        )
        for e in sorted_entries[:top_k]
    ]


def prune_old_runs(metric_name: str, segment_id: Optional[str] = None) -> None:
    path = _registry_path(metric_name, segment_id)
    if not os.path.exists(path):
        return
    runs = _load_runs(metric_name, segment_id)
    if len(runs) <= REGISTRY_MAX_RUNS_PER_METRIC:
        return
    keep = runs[-REGISTRY_MAX_RUNS_PER_METRIC:]
    with _lock:
        with open(path, "w") as f:
            for r in keep:
                f.write(json.dumps(r, default=str) + "\n")


def get_leaderboard_summary(metric_name: str, segment_id: Optional[str] = None) -> dict:
    entries = get_leaderboard(metric_name, segment_id)
    return {
        "metric": metric_name,
        "top_models": [e.to_dict() for e in entries],
    }


# ──────────────────────────────────────────────
#  Monthly accuracy records (append-only JSONL)
# ──────────────────────────────────────────────

def _monthly_accuracy_path(metric_name: str) -> str:
    os.makedirs(REGISTRY_DIR, exist_ok=True)
    return os.path.join(REGISTRY_DIR, f"{metric_name}_monthly_accuracy.jsonl")


def record_monthly_accuracy(entry: dict) -> None:
    path = _monthly_accuracy_path(entry["metric"])
    with _lock:
        with open(path, "a") as f:
            f.write(json.dumps(entry, default=str) + "\n")


def get_monthly_accuracy(metric: str, limit: int = 24) -> list[dict]:
    path = _monthly_accuracy_path(metric)
    if not os.path.exists(path):
        return []
    with _lock:
        with open(path) as f:
            rows = []
            for line in f:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return rows[-limit:]


def validate_registry_integrity(metric_name: str, segment_id: Optional[str] = None) -> dict:
    """Check registry consistency: duplicates, sort order, error plausibility."""
    runs = _load_runs(metric_name, segment_id)
    issues: list[str] = []

    if not runs:
        return {"metric": metric_name, "total_runs": 0, "valid": True, "issues": ["no_runs_found"]}

    timestamps = [r.get("created_at", "") for r in runs]
    unique_ts = set(timestamps)
    if len(unique_ts) < len(timestamps):
        issues.append(f"duplicate_timestamps: {len(timestamps) - len(unique_ts)}")

    sorted_ts = sorted(timestamps)
    if timestamps != sorted_ts:
        issues.append("runs_not_sorted_by_created_at")

    families_seen = set()
    error_values = []
    for r in runs:
        fam = r.get("model_family", "unknown")
        families_seen.add(fam)
        err = r.get("mean_error")
        if err is not None:
            if not isinstance(err, (int, float)) or err < 0:
                issues.append(f"invalid_error_value: {err} in {fam}")
            else:
                error_values.append(err)

    lb = get_leaderboard(metric_name, segment_id)
    lb_families = {e.model_family for e in lb}
    missing_in_lb = families_seen - lb_families - {"unknown"}
    if missing_in_lb:
        issues.append(f"families_in_runs_missing_from_leaderboard: {missing_in_lb}")

    return {
        "metric": metric_name,
        "total_runs": len(runs),
        "unique_timestamps": len(unique_ts),
        "families_seen": sorted(families_seen),
        "leaderboard_families": sorted(lb_families),
        "error_range": {
            "min": round(min(error_values), 6) if error_values else None,
            "max": round(max(error_values), 6) if error_values else None,
        },
        "valid": len(issues) == 0,
        "issues": issues,
    }
