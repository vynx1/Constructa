"""Deepgram voice pipeline (BUILD_PLAN §6).

Foreman audio -> Deepgram transcription -> structured daily log. The web API's
/api/agents/voice-log proxies here. Stub returns a placeholder structure until
the Deepgram SDK is wired (DEEPGRAM_API_KEY).
"""
from __future__ import annotations

from typing import Any


def transcribe_and_structure(payload: dict[str, Any]) -> dict:
    """Transcribe audio (Deepgram) and structure into a daily log entry.

    Stub: echo the transcript if provided. Real impl calls Deepgram for ASR,
    then hands the transcript to Claude (web API side) for structuring.
    """
    transcript = payload.get("transcript", "")
    return {
        "summary": "mock daily log entry",
        "transcript": transcript,
        "structured": {"weather": None, "crew": None, "work": None, "issues": []},
    }
