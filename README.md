# Lucent

Verifiable PDF summarization — every summary point links by a bezier beam to the
exact region of the source PDF it came from.

## Dev (two processes)

ML service:
    cd ml && python -m venv .venv && .venv/Scripts/activate  # (or source .venv/bin/activate)
    pip install -e ".[dev]"
    uvicorn lucent_ml.app:app --reload --port 8000

Web:
    cd web && npm install && npm run dev   # http://localhost:3000

First ML request downloads model weights (cached under ml/.hf_cache).

## Tests
    cd ml && pytest -m "not slow"     # fast unit tests (no model download)
    cd ml && pytest                   # includes the real-model e2e
    cd web && npm run test:run
