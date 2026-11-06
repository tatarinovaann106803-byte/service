import json
import pytest
from fastapi.testclient import TestClient
from agrivoltaic.api import app
from agrivoltaic.livestock import profile
from agrivoltaic.physical_scenario import Environment, evaluate_geometry, illumination, mechanism


def test_reference_means_and_missing_data():
    assert profile('КРС — молочное направление')['production_change_pct'] == pytest.approx((13.9/15.5-1)*100)
    sheep = profile('Овцы — прирост живой массы')
    assert sheep['production_change_pct'] == pytest.approx(((120/119-1)+(89/92-1))*50)
    assert sheep['sites'] == 1
    assert profile('Свиньи')['production_factor'] is None
    assert profile('Куры-несушки')['reference_metrics'][0]['value'] == pytest.approx(23.3)


def test_energy_unchanged_for_same_geometry():
    env = Environment(45, tuple([100]*12),22,300,250,500,2024,.3)
    results=[]
    for sector in ['crop','livestock']:
        reference = mechanism(illumination(8,4,25,env),4,env,sector)
        results.append(evaluate_geometry([8,4,25],env,sector,.98,reference,10))
    assert results[0]['energy'] == results[1]['energy']
    assert results[0]['configuration'] == results[1]['configuration']


@pytest.mark.parametrize('name',['КРС — молочное направление','Овцы — прирост живой массы','Куры-несушки','Свиньи','КРС — молодняк'])
def test_public_calculation(name,tmp_path,monkeypatch):
    monkeypatch.setenv('AGRIVOLTAIC_PRIVATE_DIR',str(tmp_path))
    (tmp_path/'policy.json').write_text(json.dumps({'population_size':8,'generations':1}))
    client=TestClient(app)
    payload=dict(sector='livestock',product_name=name,animal_count=100,base_productivity=100,
        lat=45,lon=38,area_ha=10,product_price=20,energy_price=6,radiation_annual=1400)
    response=client.post('/calculate',json=payload)
    assert response.status_code==200,response.text
    result=response.json()['data']
    assert result['variants']
    for v in result['variants']:
        assert len(v['scenarios'])==9
        assert v['livestock']['annual_total_production']==pytest.approx(100*v['productivity']['estimated'])
        assert v['livestock']['microclimate']['relative_humidity_change_pp'] is None
        assert v['energy']['annual_generation_kwh']>0
        assert 'configuration' not in v
        if name in ['Свиньи','Куры-несушки','КРС — молодняк']:
            assert v['productivity']['change_pct']==pytest.approx(0)
    assert client.get('/calculations/'+result['calculation_id']).status_code==200
    del payload['animal_count']
    assert client.post('/calculate',json=payload).status_code==422


def test_database_baseline_is_calculated_on_server():
    from agrivoltaic.public_schemas import PublicRequest
    args=dict(sector='livestock',product_name='КРС — молочное направление',animal_count=100,
              lat=45,lon=38,area_ha=10,product_price=20,energy_price=6,
              livestock_baseline_mode='database',productive_days=200,base_productivity=999)
    request=PublicRequest(**args)
    assert request.base_productivity==3100
    args['product_name']='Овцы — прирост живой массы'
    assert PublicRequest(**args).base_productivity==pytest.approx(21.1)
    args['product_name']='Свиньи'
    with pytest.raises(ValueError):PublicRequest(**args)
