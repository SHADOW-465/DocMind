"""Runtime configuration via environment variables."""
import os

# Optionally load a local .env (handy for the API-backed "testing" mode so keys
# can live in ml/.env instead of the shell). No-op if python-dotenv is absent.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional
    pass


class Settings:
    MAX_UPLOAD_MB: int = int(os.environ.get("LUCENT_MAX_UPLOAD_MB", "25"))
    # "transformers" (local model, default) | "api" (NVIDIA NIM -> Groq fallback)
    REWORD_PROVIDER: str = os.environ.get("LUCENT_REWORD_PROVIDER", "transformers")
    REWORD_MODEL: str = os.environ.get("LUCENT_REWORD_MODEL", "sshleifer/distilbart-cnn-12-6")
    EMBED_MODEL: str = os.environ.get("LUCENT_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    HF_HOME: str = os.environ.get("HF_HOME", os.path.join(os.path.dirname(__file__), "..", ".hf_cache"))
    # length preset -> target number of summary points
    LENGTH_TARGETS = {"short": 6, "medium": 10, "detailed": 16}

    # --- API reword backends (used when REWORD_PROVIDER == "api") ---
    # Primary: NVIDIA NIM (free tier at build.nvidia.com). Fallback: Groq.
    # Keys are read from env only — never hard-code them.
    NVIDIA_API_KEY: str = os.environ.get("NVIDIA_API_KEY", "")
    NIM_BASE_URL: str = os.environ.get("LUCENT_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
    NIM_MODEL: str = os.environ.get("LUCENT_NIM_MODEL", "meta/llama-3.1-8b-instruct")
    GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")
    GROQ_BASE_URL: str = os.environ.get("LUCENT_GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    GROQ_MODEL: str = os.environ.get("LUCENT_GROQ_MODEL", "llama-3.1-8b-instant")
    API_TIMEOUT_S: float = float(os.environ.get("LUCENT_API_TIMEOUT_S", "30"))

    # CORS: comma-separated origins allowed to call this service. Default is the
    # local web dev server. Set to your deployed frontend's URL (or "*" for open
    # testing) so a hosted frontend can reach a hosted backend.
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.environ.get("LUCENT_CORS_ORIGINS", "http://localhost:3000").split(",")
        if o.strip()
    ]


settings = Settings()
