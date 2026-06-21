"""Constructa agent service (FastAPI).

Hosts the two Python-side jobs from BUILD_PLAN §6:
  - the single Fetch.ai uAgent (Compliance Watchdog)
  - the Deepgram voice pipeline (Voice Log transcription)

Shares Redis with the web API. Endpoints return mock shapes until the
Deepgram / Fetch.ai integrations are wired, so the service runs standalone.
"""
from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from watchdog.agent import active_conditions
from voice.pipeline import transcribe_and_structure

app = FastAPI(title="Constructa Agent Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("WEB_ORIGIN", "*")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "Constructa-agent-service"}


@app.get("/watchdog/{project_id}/{step}")
def watchdog(project_id: str, step: int) -> dict:
    """Compliance Watchdog (Fetch.ai uAgent): conditions active/at-risk at a step."""
    conditions, alerts = active_conditions(project_id, step)
    return {
        "projectId": project_id,
        "step": step,
        "conditions": conditions,
        "alerts": alerts,
    }


@app.post("/voice-log")
async def voice_log(request: Request) -> dict:
    """Deepgram pipeline: audio/transcript -> structured daily log."""
    payload = await request.json()
    return {"log": transcribe_and_structure(payload)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=bool(os.environ.get("RELOAD")),
    )
