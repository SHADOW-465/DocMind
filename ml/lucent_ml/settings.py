"""Runtime configuration via environment variables."""
import os


class Settings:
    MAX_UPLOAD_MB: int = int(os.environ.get("LUCENT_MAX_UPLOAD_MB", "25"))
    REWORD_PROVIDER: str = os.environ.get("LUCENT_REWORD_PROVIDER", "transformers")
    REWORD_MODEL: str = os.environ.get("LUCENT_REWORD_MODEL", "sshleifer/distilbart-cnn-12-6")
    EMBED_MODEL: str = os.environ.get("LUCENT_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    HF_HOME: str = os.environ.get("HF_HOME", os.path.join(os.path.dirname(__file__), "..", ".hf_cache"))
    # length preset -> target number of summary points
    LENGTH_TARGETS = {"short": 6, "medium": 10, "detailed": 16}


settings = Settings()
