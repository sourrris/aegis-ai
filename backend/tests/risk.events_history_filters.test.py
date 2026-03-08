"""Tests for the historical events filter contract."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

sys.path.append(str(Path(__file__).resolve().parents[1] / "libs" / "common"))
sys.path.append(str(Path(__file__).resolve().parents[1] / "services" / "risk" / "api"))

from app.api import routes_events
from app.infrastructure.db import get_db_session
from app.infrastructure.monitoring_repository import EventRepository


def _test_app(session_obj: object) -> FastAPI:
    app = FastAPI()
    app.include_router(routes_events.router)

    async def _override_db():
        yield session_obj

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[routes_events.get_current_subject] = lambda: "tester@example.com"
    return app


@pytest.mark.asyncio
async def test_list_events_route_accepts_history_filter_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_list_events(_session, **kwargs):
        captured.update(kwargs)
        return {
            "items": [],
            "next_cursor": None,
            "total_estimate": 0,
            "page": kwargs["page"] or 1,
            "page_size": kwargs["limit"],
            "total_pages": 1,
        }

    monkeypatch.setattr(routes_events.EventRepository, "list_events", fake_list_events)

    app = _test_app(SimpleNamespace())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/v1/events",
            params={
                "tenant_id": "tenant-alpha",
                "domain_id": "domain-1",
                "status": "processed",
                "severity": "high",
                "source": "generic_transaction",
                "event_type": "payment",
                "start_date": "2026-03-01T00:00:00Z",
                "end_date": "2026-03-07T23:59:59Z",
                "page": 2,
                "limit": 20,
            },
        )

    assert response.status_code == 200
    assert captured["tenant_id"] == "tenant-alpha"
    assert captured["domain_id"] == "domain-1"
    assert captured["status"] == "processed"
    assert captured["severity"] == "high"
    assert captured["source"] == "generic_transaction"
    assert captured["event_type"] == "payment"
    assert captured["page"] == 2
    assert captured["limit"] == 20
    assert captured["from_ts"] == datetime.fromisoformat("2026-03-01T00:00:00+00:00")
    assert captured["to_ts"] == datetime.fromisoformat("2026-03-07T23:59:59+00:00")


class _FakeRow:
    def __init__(self, mapping: dict[str, object]) -> None:
        self._mapping = mapping


class _FakeRowsResult:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = [_FakeRow(row) for row in rows]

    def __iter__(self):
        return iter(self._rows)


class _FakeScalarResult:
    def __init__(self, value: int) -> None:
        self._value = value

    def scalar_one(self) -> int:
        return self._value


class _FakeSession:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    async def execute(self, stmt, params):
        sql = getattr(stmt, "text", str(stmt))
        self.calls.append((sql, params))
        if "COUNT(*) AS total" in sql:
            return _FakeScalarResult(41)
        return _FakeRowsResult(
            [
                {
                    "event_id": "event-1",
                    "tenant_id": "tenant-alpha",
                    "source": "generic_transaction",
                    "event_type": "payment",
                    "status": "processed",
                    "occurred_at": "2026-03-02T11:00:00Z",
                    "ingested_at": "2026-03-02T11:00:05Z",
                    "risk_score": 0.91,
                    "risk_level": "high",
                    "severity": "high",
                    "domain_id": "domain-1",
                    "domain_hostname": "app.example.com",
                }
            ]
        )


@pytest.mark.asyncio
async def test_list_events_repository_joins_decisions_domains_and_pages_results() -> None:
    session = _FakeSession()

    result = await EventRepository.list_events(
        session,
        tenant_id="tenant-alpha",
        domain_id="domain-1",
        status="processed",
        severity="high",
        source="generic_transaction",
        event_type="payment",
        from_ts=datetime.fromisoformat("2026-03-01T00:00:00+00:00"),
        to_ts=datetime.fromisoformat("2026-03-07T23:59:59+00:00"),
        page=2,
        cursor=None,
        limit=20,
    )

    query_sql, query_params = session.calls[0]
    count_sql, _ = session.calls[1]

    assert "LEFT JOIN risk_decisions rd" in query_sql
    assert "LEFT JOIN alerts_v2 a" in query_sql
    assert "LEFT JOIN tenant_domains td" in query_sql
    assert "registered_domain_id" in query_sql
    assert "COALESCE(a.severity, rd.risk_level) AS severity" in query_sql
    assert "COALESCE(a.severity, rd.risk_level) = :severity" in query_sql
    assert "COUNT(*) AS total" in count_sql
    assert query_params["tenant_id"] == "tenant-alpha"
    assert query_params["domain_id"] == "domain-1"
    assert query_params["severity"] == "high"
    assert query_params["offset"] == 20
    assert query_params["limit"] == 20
    assert result["page"] == 2
    assert result["total_pages"] == 3
    assert result["next_cursor"] == "40"
    assert result["items"][0]["domain_hostname"] == "app.example.com"
    assert result["items"][0]["risk_score"] == 0.91
