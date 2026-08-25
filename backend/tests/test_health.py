"""Testes do health check."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_responde_200():
    response = client.get("/health")
    assert response.status_code == 200


def test_health_retorna_status_e_identificacao_do_app():
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["app"] == "nutricart"
    assert "env" in body
