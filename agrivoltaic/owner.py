"""Authenticated calculator with full configurations; no history required."""

import html
import logging
import secrets
import uuid
from threading import BoundedSemaphore
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles

from .coefficients import product_catalog
from .config import STATIC
from .optimization import optimize, public_result
from .public_schemas import PublicRequest
from .storage import json_compatible
from .weather import WeatherUnavailable, fetch_weather, season_weather

logger = logging.getLogger(__name__)


def create_owner_app(password: str, username: str = "owner"):
    if len(password) < 12:
        raise ValueError("Для закрытого калькулятора нужен пароль не короче 12 символов")
    basic = HTTPBasic()
    capacity = BoundedSemaphore(1)

    def authorize(credentials: Annotated[HTTPBasicCredentials, Depends(basic)]):
        valid_user = secrets.compare_digest(credentials.username.encode(), username.encode())
        valid_password = secrets.compare_digest(credentials.password.encode(), password.encode())
        if not (valid_user and valid_password):
            raise HTTPException(401, "Неверные данные доступа", headers={"WWW-Authenticate": "Basic"})

    app = FastAPI(
        title="Закрытый калькулятор", docs_url=None, redoc_url=None, openapi_url=None, dependencies=[Depends(authorize)]
    )
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.middleware("http")
    async def private_headers(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse(
            status_code=422,
            content={"detail": [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]},
        )

    @app.get("/", response_class=HTMLResponse)
    @app.get("/calculator", response_class=HTMLResponse)
    def calculator(request: Request):
        prefix = html.escape(request.scope.get("root_path", ""), quote=True)
        page = (STATIC / "index.html").read_text()
        page = page.replace(
            "<head>", f'<head><meta name="api-base" content="{prefix}"><meta name="owner-calculator" content="true">'
        )
        page = page.replace('href="/static/', f'href="{prefix}/static/').replace(
            'src="/static/', f'src="{prefix}/static/'
        )
        return page.replace('href="/calculator"', f'href="{prefix}/"')

    @app.get("/products")
    def products():
        return product_catalog()

    @app.get("/integration/config")
    def integration():
        return {"parent_origins": []}

    @app.get("/weather")
    def weather(
        lat: float = Query(ge=-90, le=90),
        lon: float = Query(ge=-180, le=180),
        year: int = Query(ge=1984, le=2100),
        start_month: int = Query(default=4, ge=1, le=12),
        end_month: int = Query(default=9, ge=1, le=12),
    ):
        try:
            return season_weather(fetch_weather(lat, lon, year), start_month, end_month)
        except WeatherUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.post("/calculate")
    def calculate(request: PublicRequest):
        if not capacity.acquire(blocking=False):
            raise HTTPException(429, "Дождитесь завершения предыдущего расчёта.")
        try:
            record = json_compatible(optimize(request))
            result = public_result(request, record, uuid.uuid4().hex)
            result["owner_view"] = True
            for public, private in zip(result["variants"], record["variants"]):
                public["configuration"] = private["configuration"]
                public["light"] = private["light"]
                public["microclimate"] = private["microclimate"]
            result["calculation_details"] = record
            return {"success": True, "data": result}
        except WeatherUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except Exception as exc:
            logger.exception("Owner calculation failed")
            raise HTTPException(503, "Не удалось завершить расчёт. Повторите запрос позже.") from exc
        finally:
            capacity.release()

    return app
