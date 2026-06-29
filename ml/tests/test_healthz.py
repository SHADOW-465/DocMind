from fastapi.testclient import TestClient
from lucent_ml.app import app

client = TestClient(app)


def test_healthz_ok():
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "modelsLoaded" in body
