"""Application settings, read from environment variables (or a local .env file)."""

import os
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
ROOT_DIR = BASE_DIR.parent  # repository root


def _load_dotenv() -> None:
    """Minimal .env loader so local development needs no extra package."""
    for candidate in (ROOT_DIR / ".env", BASE_DIR / ".env"):
        if candidate.exists():
            for line in candidate.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.database_url: str = self._normalize_db_url(
            os.getenv("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'dev.db'}"
        )
        self.secret_key: str = os.getenv("SECRET_KEY", "dev-only-change-me")
        self.app_url: str = os.getenv("APP_URL", "http://localhost:8000").rstrip("/")
        self.vapid_public_key: str = os.getenv("VAPID_PUBLIC_KEY", "")
        self.vapid_private_key: str = os.getenv("VAPID_PRIVATE_KEY", "")
        self.vapid_subject: str = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")
        self.admin_emails: set[str] = {
            e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()
        }
        self.frontend_dir: Path = Path(os.getenv("FRONTEND_DIR", ROOT_DIR / "frontend"))
        self.session_days: int = int(os.getenv("SESSION_DAYS", "30"))
        # Email (for password resets). Works with Gmail + an App Password, or any SMTP provider.
        self.smtp_host: str = os.getenv("SMTP_HOST", "")
        self.smtp_port: int = int(os.getenv("SMTP_PORT") or 587)
        self.smtp_user: str = os.getenv("SMTP_USER", "")
        self.smtp_password: str = os.getenv("SMTP_PASSWORD", "").replace(" ", "")
        self.mail_from: str = os.getenv("MAIL_FROM", "") or self.smtp_user
        self.reset_token_minutes: int = int(os.getenv("RESET_TOKEN_MINUTES") or 60)
        # Secret key for the /api/tasks/send-notifications URL that an uptime monitor calls.
        self.cron_secret: str = os.getenv("CRON_SECRET", "")
        # Natural voices (Azure AI Speech, free tier). Without a key the app uses the phone's voices.
        self.azure_speech_key: str = os.getenv("AZURE_SPEECH_KEY", "").strip()
        self.azure_speech_region: str = os.getenv("AZURE_SPEECH_REGION", "").strip().lower()
        self.tts_daily_limit: int = int(os.getenv("TTS_DAILY_LIMIT") or 300)  # new clips per user/day
        # WordPop Plus (natural voices) through Stripe. Without these the voices are free for all.
        self.stripe_secret_key: str = os.getenv("STRIPE_SECRET_KEY", "").strip()
        # Public key: lets the payment form open inside the app (embedded checkout).
        # Without it, customers are sent to Stripe's own payment page instead.
        self.stripe_publishable_key: str = os.getenv("STRIPE_PUBLISHABLE_KEY", "").strip()
        self.stripe_webhook_secret: str = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
        self.stripe_price_monthly: str = os.getenv("STRIPE_PRICE_MONTHLY", "").strip()
        self.stripe_price_yearly: str = os.getenv("STRIPE_PRICE_YEARLY", "").strip()
        self.plus_price_monthly_label: str = os.getenv("PLUS_PRICE_MONTHLY_LABEL", "CA$0.99")
        self.plus_price_yearly_label: str = os.getenv("PLUS_PRICE_YEARLY_LABEL", "CA$9.99")
        self.plus_trial_days: int = int(os.getenv("PLUS_TRIAL_DAYS") or 7)
        # Google Play app (Trusted Web Activity): its package name and the SHA-256 fingerprint(s)
        # of its signing certificate (Play Console -> App integrity). Used for assetlinks.json.
        self.android_package_name: str = os.getenv("ANDROID_PACKAGE_NAME", "").strip()
        fingerprints = os.getenv("ANDROID_SHA256_CERT_FINGERPRINTS", "")
        self.android_cert_fingerprints: list[str] = [
            f.strip().upper() for f in fingerprints.split(",") if f.strip()
        ]
        self.dictionary_api: str = os.getenv(
            "DICTIONARY_API", "https://api.dictionaryapi.dev/api/v2/entries/en/"
        )

    @property
    def secure_cookies(self) -> bool:
        return self.app_url.startswith("https://")

    @staticmethod
    def _normalize_db_url(url: str) -> str:
        # Neon / Heroku style URLs -> SQLAlchemy psycopg3 driver
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
