import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from agrivoltaic.api import app
from agrivoltaic.optimization import optimize
from agrivoltaic.public_schemas import PublicRequest
from agrivoltaic.storage import get_calculation, save_calculation, select_variant


@pytest.fixture
def private_store(tmp_path, monkeypatch):
    monkeypatch.setenv("AGRIVOLTAIC_PRIVATE_DIR", str(tmp_path))
    (tmp_path / "policy.json").write_text(json.dumps({"population_size": 8, "generations": 1}))


def test_numpy_record_round_trip_and_selection(private_store):
    variant_id = "a" * 32
    record = {
        "variants": [
            {
                "id": variant_id,
                "count": np.int64(7),
                "flag": np.bool_(True),
                "values": np.array([1.25, 2.5], dtype=np.float32),
            }
        ],
        "selected_variant_id": None,
    }
    cid = save_calculation({"sector": "crop", "product_name": "Пшеница"}, record)
    saved = get_calculation(cid)["variants"][0]
    assert type(saved["count"]) is int
    assert saved["flag"] is True
    assert saved["values"] == [1.25, 2.5]
    assert select_variant(cid, variant_id)["selected_variant_id"] == variant_id


def test_api_serializes_numpy_in_public_and_private_fields(private_store, monkeypatch):
    request = dict(
        lat=45, lon=38, area_ha=10, product_name="Пшеница", product_price=15, energy_price=6, radiation_annual=1400
    )
    record = optimize(PublicRequest(**request))
    record["search"]["evaluations"] = np.int64(20)
    record["variants"][0]["robustness"]["positive_npv_scenarios"] = np.int64(4)
    record["variants"][0]["energy"]["total_power"] = np.float32(1200.5)
    record["variants"][0]["feasible"] = np.bool_(True)
    monkeypatch.setattr("agrivoltaic.api.optimize", lambda _: record)
    client = TestClient(app)
    response = client.post("/calculate", json=request)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["variants"][0]["robustness"]["positive_npv_scenarios"] == 4
    assert data["variants"][0]["energy"]["installed_power_kw"] == 1200.5
    assert "configuration" not in data["variants"][0]
    assert client.get("/calculations/" + data["calculation_id"]).json()["data"] == data


@pytest.mark.parametrize("value", [np.float32("nan"), np.float64("inf"), np.array([float("nan")])])
def test_nonfinite_numpy_still_rejected(private_store, value):
    with pytest.raises(ValueError):
        save_calculation({"sector": "crop", "product_name": "Пшеница"}, {"value": value})


def test_unsupported_objects_are_not_stringified(private_store):
    with pytest.raises(TypeError):
        save_calculation({"sector": "crop", "product_name": "Пшеница"}, {"value": object()})
