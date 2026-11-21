"""One endpoint: run a JobSpy search and return its rows as JSON.

The worker owns everything else (matching, storage, scoring). This service has no
database access and no business logic, so a JobSpy breakage stays contained here.
"""

import json
import logging
from typing import Literal

from fastapi import FastAPI
from jobspy import scrape_jobs
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("scraper")

app = FastAPI(title="job-ai scraper")


class SearchRequest(BaseModel):
    site: Literal["indeed", "linkedin"]
    search_term: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1, max_length=200)
    results_wanted: int = Field(default=25, ge=1, le=50)
    hours_old: int = Field(default=72, ge=1, le=24 * 14)
    run_id: str | None = None


class SearchResponse(BaseModel):
    jobs: list[dict]
    error: str | None = None


def run_search(request: SearchRequest) -> list[dict]:
    frame = scrape_jobs(
        site_name=request.site,
        search_term=request.search_term,
        location=request.location,
        results_wanted=request.results_wanted,
        hours_old=request.hours_old,
        country_indeed="Canada",
        # LinkedIn search results carry no description; this adds one request per job.
        fetch_description=request.site == "linkedin",
        description_format="markdown",
        verbose=0,
    )
    return json.loads(frame.to_json(orient="records", date_format="iso"))


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/search")
def search(request: SearchRequest) -> SearchResponse:
    # Errors are returned, not raised, so the worker can log them per source and carry on.
    try:
        jobs = run_search(request)
    except Exception as error:  # noqa: BLE001 - any JobSpy failure is reported the same way
        log.warning("run=%s site=%s search failed: %s", request.run_id, request.site, error)
        return SearchResponse(jobs=[], error=f"{type(error).__name__}: {error}"[:500])
    log.info("run=%s site=%s found=%d", request.run_id, request.site, len(jobs))
    return SearchResponse(jobs=jobs)


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
