"""PV screening calculation using module face area, irradiation and efficiency."""

import calendar

PANEL_LENGTH_M = 2.382
PANEL_WIDTH_M = 1.134
PANEL_AREA_M2 = PANEL_LENGTH_M * PANEL_WIDTH_M
PANEL_POWER_KW = 0.610
STC_IRRADIANCE_KW_M2 = 1.0
PANEL_EFFICIENCY = PANEL_POWER_KW / (PANEL_AREA_M2 * STC_IRRADIANCE_KW_M2)
DEFAULT_PERFORMANCE_RATIO = 0.85


def annual_to_monthly(annual: float, year: int) -> list[float]:
    days = [calendar.monthrange(year, m)[1] for m in range(1, 13)]
    return [annual * d / sum(days) for d in days]


def energy_from_modules(count: int, monthly: list[float], performance_ratio: float, irradiation_plane: str) -> dict:
    """Monthly irradiation is kWh/m²; efficiency and PR are separate factors.

    PR aggregates operating losses (including heat and electrical losses).
    Geometry shading must already be included in plane-of-array irradiation.
    """
    area = count * PANEL_AREA_M2
    power = count * PANEL_POWER_KW
    monthly_energy = [area * radiation * PANEL_EFFICIENCY * performance_ratio for radiation in monthly]
    return {
        "num_panels": count,
        "total_power": power,
        "panel_area_total": area,
        "panel_area_m2": PANEL_AREA_M2,
        "panel_efficiency": PANEL_EFFICIENCY,
        "performance_ratio": performance_ratio,
        "annual_energy": sum(monthly_energy),
        "monthly_energy": monthly_energy,
        "specific_yield": sum(monthly_energy) / power if power else 0,
        "total_efficiency": PANEL_EFFICIENCY * performance_ratio,
        "method": "module face area × irradiation × STC module efficiency × performance ratio",
        "irradiation_plane": irradiation_plane,
        "units": {"total_power": "kWp", "annual_energy": "kWh/year", "panel_area_total": "m²"},
    }


def calculate_energy(area_ha: float, coverage: float, monthly: list[float], performance_ratio: float) -> dict:
    """Legacy horizontal screening; coverage means module face area / land area."""
    count = int(area_ha * 10000 * coverage / PANEL_AREA_M2)
    return energy_from_modules(count, monthly, performance_ratio, "horizontal")
