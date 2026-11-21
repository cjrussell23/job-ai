from fastapi.testclient import TestClient

from job_ai_scraper import app as app_module

client = TestClient(app_module.app)


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_search_returns_rows(monkeypatch):
    monkeypatch.setattr(
        app_module, "run_search", lambda request: [{"title": "Barista", "site": request.site}]
    )
    response = client.post(
        "/search", json={"site": "indeed", "search_term": "barista", "location": "Calgary, AB"}
    )
    assert response.status_code == 200
    assert response.json() == {"jobs": [{"title": "Barista", "site": "indeed"}], "error": None}


def test_search_failures_are_reported_not_raised(monkeypatch):
    def boom(request):
        raise RuntimeError("429 Too Many Requests")

    monkeypatch.setattr(app_module, "run_search", boom)
    response = client.post(
        "/search", json={"site": "linkedin", "search_term": "x", "location": "Calgary, AB"}
    )
    assert response.status_code == 200
    assert response.json()["jobs"] == []
    assert "429" in response.json()["error"]


def test_unknown_sites_are_rejected():
    response = client.post("/search", json={"site": "google", "search_term": "x", "location": "y"})
    assert response.status_code == 422
