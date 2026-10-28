import pytest
from pydantic import ValidationError

from agrivoltaic.costs import cost_catalog, resolve_cost
from agrivoltaic.public_schemas import PublicRequest

BASE = dict(lat=30.9, lon=75.85, area_ha=10, product_name="Пшеница", product_price=15, energy_price=6)
POLICY = {"height_cost_slope": 0.04, "capex_per_kw": {"crop": 60000}}


def test_country_cost_and_explicit_premium():
    req = PublicRequest(
        **BASE, country="India", capex_mode="country", capex_benchmark_id="irena_2024_IN", usd_rub=80, av_premium_pct=20
    )
    cost, meta = resolve_cost(req, POLICY)
    assert cost == pytest.approx(525 * 80 * 1.2)
    assert meta["benchmark"]["price_year"] == 2024
    assert meta["currency"] == "RUB"


def test_mismatched_country_never_falls_back():
    req = PublicRequest(**BASE, country="Brazil", capex_mode="country", capex_benchmark_id="irena_2024_IN")
    with pytest.raises(ValueError, match="does not match"):
        resolve_cost(req, POLICY)


def test_manual_and_legacy_costs():
    assert resolve_cost(PublicRequest(**BASE), POLICY)[0] == 60000
    req = PublicRequest(**BASE, capex_mode="manual", capex_per_kw_rub=80000, usd_rub=90)
    assert resolve_cost(req, POLICY)[0] == 80000


@pytest.mark.parametrize(
    "kwargs", [{"capex_mode": "manual"}, {"capex_mode": "country"}, {"usd_rub": 0}, {"fx_date": "2026-02-30"}]
)
def test_invalid_cost_inputs(kwargs):
    with pytest.raises(ValidationError):
        PublicRequest(**BASE, **kwargs)


def test_catalog_has_traceable_unique_positive_entries():
    rows = cost_catalog()["records"]
    assert len({r["id"] for r in rows}) == len(rows)
    assert len({r["country"] for r in rows}) == 5
    assert all(r["usd_per_kw_dc"] > 0 and r["source_url"].startswith("https://") for r in rows)
