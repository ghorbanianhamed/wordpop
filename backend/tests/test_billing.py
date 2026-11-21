import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta

import pytest

from app import billing, tts
from app.config import get_settings
from app.models import User

WEBHOOK_SECRET = "whsec_test"
PERIOD_END = int(datetime(2027, 1, 1, tzinfo=UTC).timestamp())


class FakeStripe:
    """Stands in for stripe.StripeClient; records calls."""

    def __init__(self):
        self.calls = []
        self.subscriptions_store = {}
        fake = self

        class Customers:
            def create(self, params):
                fake.calls.append(("customer", params))
                return {"id": "cus_123"}

        class CheckoutSessions:
            def create(self, params):
                fake.calls.append(("checkout", params))
                return {"url": "https://checkout.stripe.test/s1", "client_secret": "cs_test_secret"}

        class PortalSessions:
            def create(self, params):
                fake.calls.append(("portal", params))
                return {"url": "https://billing.stripe.test/p1"}

        class Subscriptions:
            def retrieve(self, sub_id):
                return fake.subscriptions_store[sub_id]

            def list(self, params):
                return list(fake.subscriptions_store.values())

            def cancel(self, sub_id):
                fake.calls.append(("cancel", sub_id))

        class V1:
            customers = Customers()
            subscriptions = Subscriptions()

            class checkout:  # noqa: N801
                sessions = CheckoutSessions()

            class billing_portal:  # noqa: N801
                sessions = PortalSessions()

        self.v1 = V1()


@pytest.fixture()
def stripe_on(monkeypatch):
    s = get_settings()
    for key, value in {
        "stripe_secret_key": "sk_test_x", "stripe_webhook_secret": WEBHOOK_SECRET,
        "stripe_price_monthly": "price_month", "stripe_price_yearly": "price_year",
        "azure_speech_key": "k", "azure_speech_region": "canadacentral",
    }.items():
        monkeypatch.setattr(s, key, value)
    monkeypatch.setattr(tts, "_synthesize", lambda voice, text: b"mp3")
    fake = FakeStripe()
    monkeypatch.setattr(billing, "client", lambda: fake)
    return fake


def subscription(status="active", price="price_year", customer="cus_123", user_id=None):
    return {
        "id": "sub_1", "object": "subscription", "status": status, "customer": customer,
        "cancel_at_period_end": False, "metadata": {"user_id": str(user_id)} if user_id else {},
        "items": {"data": [{"price": {"id": price}, "current_period_end": PERIOD_END}]},
    }


def send_webhook(client, event_type, obj, secret=WEBHOOK_SECRET):
    payload = json.dumps({"id": "evt_1", "object": "event", "type": event_type, "data": {"object": obj}})
    t = int(time.time())
    sig = hmac.new(secret.encode(), f"{t}.{payload}".encode(), hashlib.sha256).hexdigest()
    return client.post("/api/billing/webhook", content=payload,
                       headers={"stripe-signature": f"t={t},v1={sig}", "content-type": "application/json"})


def listen(client, text="Obviously"):
    return client.get("/api/tts", params={"text": text, "voice": "ca-female"})


def test_without_stripe_voices_are_free(user_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "azure_speech_key", "k")
    monkeypatch.setattr(get_settings(), "azure_speech_region", "canadacentral")
    monkeypatch.setattr(tts, "_synthesize", lambda voice, text: b"mp3")
    assert listen(user_client).status_code == 200
    assert user_client.get("/api/billing/status").json()["reason"] == "free"


def test_trial_starts_on_first_listen_then_ends(user_client, stripe_on, session_factory):
    st = user_client.get("/api/billing/status").json()
    assert st["billing_enabled"] and st["plus"] is False and st["trial_started"] is False
    assert st["prices"] == {"monthly": "CA$0.99", "yearly": "CA$9.99"}

    assert listen(user_client).status_code == 200  # first listen starts the 7-day trial
    st = user_client.get("/api/billing/status").json()
    assert st["reason"] == "trial" and st["trial_ends_at"]

    with session_factory() as db:  # 8 days later...
        user = db.query(User).one()
        user.voice_trial_started_at = datetime.now(UTC) - timedelta(days=8)
        db.commit()
    assert listen(user_client, "Another word").status_code == 402
    assert user_client.get("/api/billing/status").json()["plus"] is False
    # the Settings sample stays free so people can hear the voices before buying
    assert listen(user_client, tts.SAMPLE_TEXT).status_code == 200


def test_checkout_subscribe_cancel(user_client, stripe_on, session_factory):
    r = user_client.post("/api/billing/checkout", json={"plan": "yearly"})
    assert r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.test")
    kind, params = stripe_on.calls[-1]
    assert kind == "checkout" and params["mode"] == "subscription" and params["customer"] == "cus_123"
    assert params["line_items"] == [{"price": "price_year", "quantity": 1}]
    assert user_client.post("/api/billing/checkout", json={"plan": "weekly"}).status_code == 422

    # Stripe reports the finished payment
    with session_factory() as db:
        uid = db.query(User).one().id
    stripe_on.subscriptions_store["sub_1"] = subscription(user_id=uid)
    r = send_webhook(user_client, "checkout.session.completed",
                     {"object": "checkout.session", "mode": "subscription", "customer": "cus_123",
                      "client_reference_id": str(uid), "subscription": "sub_1"})
    assert r.status_code == 200 and r.json()["handled"]
    st = user_client.get("/api/billing/status").json()
    assert st["reason"] == "subscription" and st["plan"] == "yearly" and st["renews_at"].startswith("2027-01-01")
    assert listen(user_client).status_code == 200
    assert user_client.post("/api/billing/checkout", json={"plan": "monthly"}).status_code == 409  # no double

    assert user_client.post("/api/billing/portal").json()["url"].startswith("https://billing.stripe.test")

    # cancelled in the portal -> Stripe sends "deleted" at the end of the period
    send_webhook(user_client, "customer.subscription.deleted", subscription(status="canceled"))
    assert user_client.get("/api/billing/status").json()["plus"] is False


def test_webhook_rejects_bad_signature(client, stripe_on):
    r = send_webhook(client, "customer.subscription.updated", subscription(), secret="whsec_wrong")
    assert r.status_code == 400


def test_admin_always_has_plus(client, stripe_on):
    client.post("/api/auth/signup", json={"email": "admin@example.com", "password": "password1"})
    assert client.get("/api/billing/status").json()["reason"] == "admin"


def test_deleting_account_cancels_subscription(user_client, stripe_on, session_factory):
    with session_factory() as db:
        user = db.query(User).one()
        user.stripe_customer_id = "cus_123"
        db.commit()
    stripe_on.subscriptions_store["sub_1"] = subscription()
    assert user_client.delete("/api/auth/me").status_code == 204
    assert ("cancel", "sub_1") in stripe_on.calls


def test_checkout_replaces_a_customer_stripe_no_longer_knows(user_client, stripe_on, session_factory):
    """A customer saved with an earlier key (or in test mode) doesn't exist for the new key."""
    import stripe

    with session_factory() as db:
        user = db.query(User).one()
        user.stripe_customer_id = "cus_from_old_key"
        db.commit()

    sessions = stripe_on.v1.checkout.sessions
    original = sessions.create

    def create(params):
        if params["customer"] == "cus_from_old_key":
            raise stripe.InvalidRequestError("No such customer: 'cus_from_old_key'", param="customer",
                                             code="resource_missing")
        return original(params)

    sessions.create = create
    r = user_client.post("/api/billing/checkout", json={"plan": "monthly"})
    assert r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.test")
    with session_factory() as db:
        assert db.query(User).one().stripe_customer_id == "cus_123"


def test_other_stripe_errors_are_reported(user_client, stripe_on):
    import stripe

    def fail(params):
        raise stripe.InvalidRequestError("No such price: 'prod_X'", param="line_items[0][price]",
                                         code="resource_missing")

    stripe_on.v1.checkout.sessions.create = fail
    r = user_client.post("/api/billing/checkout", json={"plan": "monthly"})
    assert r.status_code == 502 and "payment page" in r.json()["detail"]


def test_embedded_checkout_when_publishable_key_is_set(user_client, stripe_on, monkeypatch):
    monkeypatch.setattr(get_settings(), "stripe_publishable_key", "pk_test_x")
    assert user_client.get("/api/billing/status").json()["publishable_key"] == "pk_test_x"
    r = user_client.post("/api/billing/checkout", json={"plan": "monthly"}).json()
    assert r == {"client_secret": "cs_test_secret"}
    params = stripe_on.calls[-1][1]
    assert params["ui_mode"] == "embedded_page" and params["redirect_on_completion"] == "if_required"
    assert params["return_url"].endswith("/#/settings?plus=success") and "success_url" not in params


def test_hosted_checkout_without_publishable_key(user_client, stripe_on):
    assert user_client.get("/api/billing/status").json()["publishable_key"] == ""
    r = user_client.post("/api/billing/checkout", json={"plan": "monthly"}).json()
    assert r["url"].startswith("https://checkout.stripe.test")
    assert "ui_mode" not in stripe_on.calls[-1][1]


def test_hosted_page_can_be_forced_as_a_fallback(user_client, stripe_on, monkeypatch):
    monkeypatch.setattr(get_settings(), "stripe_publishable_key", "pk_test_x")
    r = user_client.post("/api/billing/checkout", json={"plan": "yearly", "hosted": True}).json()
    assert r["url"].startswith("https://checkout.stripe.test")
    assert "ui_mode" not in stripe_on.calls[-1][1]
