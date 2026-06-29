"""Lucent ML service — FastAPI app."""
import time

from fastapi import FastAPI, UploadFile, File, Form, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .settings import settings
from .models import ErrorResponse
from .pipeline.parse import parse_pdf, ParseError
from .pipeline.segment import segment
from .pipeline.rank import rank
from .pipeline.reword import reword_anchors
from .pipeline.assemble import build_response
from .providers.reword_provider import default_provider
from .pipeline.group import default_embedder

app = FastAPI(title="Lucent ML", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:3000"],
    allow_methods=["*"], allow_headers=["*"],
)

_MODELS_READY = True


@app.exception_handler(Exception)
async def _internal_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(error="internal", message=str(exc)).model_dump(),
    )


# Dependency-injection seams (overridden in tests with fakes).
def get_reword_provider():
    return default_provider()


def get_embedder():
    return default_embedder()


@app.get("/healthz")
def healthz():
    return {"status": "ok", "modelsLoaded": _MODELS_READY}


@app.post("/summarize")
async def summarize(
    file: UploadFile = File(...),
    length: str = Form("medium"),
    group: bool = Form(True),
    provider=Depends(get_reword_provider),
    embedder=Depends(get_embedder),
):
    t0 = time.perf_counter()
    data = await file.read()

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > max_bytes:
        return JSONResponse(status_code=413, content=ErrorResponse(
            error="too-large", message=f"file exceeds {settings.MAX_UPLOAD_MB} MB").model_dump())

    try:
        t_parse = time.perf_counter()
        pages, words = parse_pdf(data)
        sentences = segment(words)
        parse_ms = int((time.perf_counter() - t_parse) * 1000)
    except ParseError as e:
        code = "encrypted" if "password" in str(e) else (
            "scanned" if "scanned" in str(e) else "bad-pdf")
        return JSONResponse(status_code=422, content=ErrorResponse(
            error=code, message=str(e)).model_dump())

    top_n = settings.LENGTH_TARGETS.get(length, settings.LENGTH_TARGETS["medium"])
    t_rank = time.perf_counter()
    ranked = rank(sentences, top_n=top_n)
    rank_ms = int((time.perf_counter() - t_rank) * 1000)

    t_word = time.perf_counter()
    points = reword_anchors(ranked, provider=provider)
    reword_ms = int((time.perf_counter() - t_word) * 1000)

    resp = build_response(
        filename=file.filename or "document.pdf",
        pages=pages, points=points,
        embedder=(embedder if group else _SingleThemeEmbedder()),
        timings={
            "parseMs": parse_ms, "rankMs": rank_ms, "rewordMs": reword_ms,
            "totalMs": int((time.perf_counter() - t0) * 1000),
        },
    )
    return JSONResponse(content=resp.model_dump())


class _SingleThemeEmbedder:
    """When group=false, force one theme by returning identical vectors."""
    def encode(self, texts):
        import numpy as np
        return np.ones((len(texts), 2))
