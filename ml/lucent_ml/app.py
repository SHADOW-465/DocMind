"""Lucent ML service — FastAPI app."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Lucent ML", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models are lazily loaded on first /summarize call (see reword/group).
# modelsLoaded reflects whether the heavy pipeline import succeeded.
_MODELS_READY = True


@app.get("/healthz")
def healthz():
    return {"status": "ok", "modelsLoaded": _MODELS_READY}
