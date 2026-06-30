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

## API reword mode (testing without local models)

Instead of the local transformers summarizer, the reword stage can call hosted
LLMs over the OpenAI-compatible chat API — **NVIDIA NIM primary, Groq fallback**.
If both are unavailable the pipeline still returns correct citations (verbatim
anchor sentences). This avoids downloading the distilbart weights.

    cd ml
    cp .env.example .env          # then fill in NVIDIA_API_KEY and/or GROQ_API_KEY
    # or export inline:
    #   set LUCENT_REWORD_PROVIDER=api  (PowerShell: $env:LUCENT_REWORD_PROVIDER="api")
    uvicorn lucent_ml.app:app --reload --port 8000

`GET /healthz` reports the active provider (`{"rewordProvider": "api"}`). Keys:
NVIDIA NIM (free) at https://build.nvidia.com, Groq at https://console.groq.com/keys.
Backends without a key are skipped, so either one alone works.

## Tests
    cd ml && pytest -m "not slow"     # fast unit tests (no model download)
    cd ml && pytest                   # includes the real-model e2e
    cd web && npm run test:run
