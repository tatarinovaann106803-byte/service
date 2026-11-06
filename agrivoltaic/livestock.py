"""Animal-production reference means and explicitly labelled scenario outputs."""
import json
from functools import lru_cache
from .config import DATA


@lru_cache(maxsize=1)
def dataset():
    return json.loads((DATA / 'livestock_coefficients.json').read_text(encoding='utf-8'))


def profiles():
    return dataset()['profiles']


def profile(name):
    for item in profiles():
        if name == item['name']:
            return item
    raise ValueError('Unknown livestock species / production type')


def livestock_coefficient(name):
    item = profile(name)
    return {
        'factor': item['production_factor'] if item['production_factor'] is not None else 1.0,
        'rows': item['observations'], 'publications': len({r['doi'] for r in item['lineage']}),
        'sites': item['sites'], 'method': 'within_site_then_across_sites_mean',
        'status': item['status'], 'lineage': item['lineage'],
        'message': 'Descriptive reference; not a validated animal response function.' if item['lineage'] else 'No production data; unchanged production is a budgeting assumption.',
    }


def livestock_outputs(request, candidate):
    item = profile(request.product_name)
    micro = candidate['microclimate']
    # Geometric shade and cooling are the existing scenario model. Welfare metrics
    # are references only: they are not air temperature or farm-specific forecasts.
    return {
        'animal_count': request.animal_count,
        'baseline_mode': request.livestock_baseline_mode,
        'productive_days': request.productive_days,
        'baseline_daily_kg_per_head': item.get('baseline_daily_kg_per_head') if request.livestock_baseline_mode == 'database' else None,
        'annual_total_production': request.animal_count * request.base_productivity * candidate['productivity_factor'],
        'baseline_total_production': request.animal_count * request.base_productivity,
        'product_unit': item['unit'],
        'production_status': item['status'],
        'reference_change_pct': item['production_change_pct'],
        'sites': item['sites'], 'observations': item['observations'],
        'sources': sorted({r['doi'] for r in item['lineage']}),
        'microclimate': {
            'status': 'existing_geometric_scenario_not_livestock_validated',
            'irradiance_reduction_pct': micro['shade_fraction'] * 100,
            'air_temperature_change_c': -micro['air_or_water_cooling_c'],
            'relative_humidity_change_pp': None,
        },
        'reference_metrics': item.get('reference_metrics', []),
    }
