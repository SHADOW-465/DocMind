from pathlib import Path
import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_pdf_bytes() -> bytes:
    return (FIXTURES / "sample-2page.pdf").read_bytes()
