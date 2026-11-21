"""WordPop Plus billing: status, Stripe Checkout, Customer Portal and the Stripe webhook."""

import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import billing
from ..config import get_settings
from ..db import get_db
from ..models import User
from ..security import get_current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])


SUBSCRIPTION_EVENTS = (
    "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
)


class CheckoutIn(BaseModel):
    plan: str = Field(pattern=r"^(monthly|yearly)$")
    hosted: bool = False  # force Stripe's own payment page (fallback from the in-app form)


def _require_billing() -> None:
    if not billing.enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payments are not set up yet")


@router.get("/status")
def get_status(user: User = Depends(get_current_user)):
    return billing.status(user)


@router.post("/checkout")
def checkout(data: CheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Start a Stripe Checkout page for a monthly or yearly subscription."""
    _require_billing()
    if billing.has_subscription(user):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already have WordPop Plus - use Manage to change it"
        )
    app_url = get_settings().app_url
    client = billing.client()

    def new_customer() -> None:
        customer = client.v1.customers.create({"email": user.email, "metadata": {"user_id": str(user.id)}})
        user.stripe_customer_id = customer["id"]
        db.commit()

    embedded = bool(get_settings().stripe_publishable_key) and not data.hosted

    def open_checkout():
        params = {
            "mode": "subscription",
            "customer": user.stripe_customer_id,
            "client_reference_id": str(user.id),
            "line_items": [{"price": billing.price_id(data.plan), "quantity": 1}],
            "subscription_data": {"metadata": {"user_id": str(user.id)}},
            "allow_promotion_codes": True,
        }
        if embedded:  # the payment form opens in a box inside WordPop
            params.update({
                "ui_mode": "embedded_page",  # called "embedded" before Stripe's 2026 API versions
                "redirect_on_completion": "if_required",
                "return_url": f"{app_url}/#/settings?plus=success",
            })
        else:  # Stripe's own full payment page
            params.update({
                "success_url": f"{app_url}/#/settings?plus=success",
                "cancel_url": f"{app_url}/#/settings?plus=cancel",
            })
        return client.v1.checkout.sessions.create(params)

    try:
        if not user.stripe_customer_id:
            new_customer()
        try:
            session = open_checkout()
        except stripe.InvalidRequestError as exc:
            # The saved customer belongs to another Stripe mode or account (e.g. test vs live,
            # or an earlier key): start again with a new customer.
            if getattr(exc, "code", None) != "resource_missing" or getattr(exc, "param", None) != "customer":
                raise
            log.info("Stripe customer %s not found for user %s; creating a new one",
                     user.stripe_customer_id, user.id)
            new_customer()
            session = open_checkout()
    except stripe.StripeError as exc:
        log.warning("Stripe checkout failed for user %s: %s", user.id, exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Couldn't open the payment page - please try again"
        ) from exc
    if embedded:
        return {"client_secret": session["client_secret"]}
    return {"url": session["url"]}


@router.post("/portal")
def portal(user: User = Depends(get_current_user)):
    """Stripe's page to change plan, update the card, see invoices or cancel."""
    _require_billing()
    if not user.stripe_customer_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No subscription yet")
    try:
        session = billing.client().v1.billing_portal.sessions.create({
            "customer": user.stripe_customer_id,
            "return_url": f"{get_settings().app_url}/#/settings",
        })
    except stripe.StripeError as exc:
        log.warning("Stripe portal failed for user %s: %s", user.id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't open the subscription page") from exc
    return {"url": session["url"]}


def _user_for(db: Session, customer_id: str | None, user_id: str | None) -> User | None:
    if customer_id:
        user = db.scalar(select(User).where(User.stripe_customer_id == customer_id))
        if user:
            return user
    if user_id and str(user_id).isdigit():
        return db.get(User, int(user_id))
    return None


@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request, db: Session = Depends(get_db)):
    """Stripe tells us about new, changed and cancelled subscriptions here."""
    secret = get_settings().stripe_webhook_secret
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Webhook not configured")
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, request.headers.get("stripe-signature"), secret)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid signature") from exc

    kind, obj = event["type"], event["data"]["object"]
    obj = obj.to_dict() if hasattr(obj, "to_dict") else dict(obj)  # plain dict: .get() works
    if kind == "checkout.session.completed" and obj.get("mode") == "subscription":
        user = _user_for(db, obj.get("customer"), obj.get("client_reference_id"))
        if user and obj.get("subscription"):
            billing.apply_subscription(user, billing.client().v1.subscriptions.retrieve(obj["subscription"]))
    elif kind in SUBSCRIPTION_EVENTS:
        metadata = obj.get("metadata") or {}
        user = _user_for(db, obj.get("customer"), metadata.get("user_id"))
        if user:
            billing.apply_subscription(user, obj)
    else:
        return {"received": True, "handled": False}
    db.commit()
    return {"received": True, "handled": True}
