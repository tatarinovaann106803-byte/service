"""Versioned PV benchmarks, in source-year USD/kWdc, not agrivoltaic quotations."""

import json
from functools import lru_cache

from .config import DATA


@lru_cache(maxsize=1)
def cost_catalog():
    return json.loads((DATA / "pv_capex_by_country.json").read_text(encoding="utf-8"))


def resolve_cost(request, policy):
    mode = request.capex_mode
    metadata = {
        "mode": mode,
        "country": request.country,
        "currency": "RUB",
        "usd_rub": request.usd_rub,
        "fx_date": request.fx_date,
        "av_premium_pct": request.av_premium_pct,
        "height_cost_slope": policy["height_cost_slope"],
    }
    if mode == "legacy":
        base = policy["capex_per_kw"][request.sector]
        metadata["source"] = "owner_policy"
    elif mode == "manual":
        base = request.capex_per_kw_rub
        metadata["source"] = "user"
    else:
        row = next((r for r in cost_catalog()["records"] if r["id"] == request.capex_benchmark_id), None)
        if row is None or request.country not in [row["country"], *row.get("aliases", [])]:
            raise ValueError(
                "CAPEX benchmark does not match the selected country. Select a benchmark or use manual costs."
            )
        base = row["usd_per_kw_dc"] * request.usd_rub
        metadata["benchmark"] = row
        metadata["source"] = row["source_url"]
    base *= 1 + request.av_premium_pct / 100
    metadata["base_capex_per_kw_rub"] = base
    metadata["scope"] = (
        "Base cost plus user AV premium; existing height adjustment applied per configuration. No storage."
    )
    return base, metadata
