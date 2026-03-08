"""Monitoring repository payload normalization tests."""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "libs" / "common"))
sys.path.append(str(Path(__file__).resolve().parents[1] / "services" / "risk" / "api"))

from app.infrastructure.monitoring_repository import _coerce_json_object


def test_coerce_json_object_parses_json_strings() -> None:
    payload = _coerce_json_object('{"transaction_id":"txn-1","metadata":{"source_name":"ofac_sls"}}')

    assert payload == {
        "transaction_id": "txn-1",
        "metadata": {"source_name": "ofac_sls"},
    }


def test_coerce_json_object_wraps_non_json_strings() -> None:
    payload = _coerce_json_object("plain-text")

    assert payload == {"raw": "plain-text"}
