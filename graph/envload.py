from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    load_dotenv(REPO_ROOT / ".env", override=True)
    load_dotenv()


load_env()
