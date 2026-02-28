import base64
import hashlib
import hmac
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from jose import jwt
from pydantic import BaseModel
from risk_common.schemas import TokenResponse
from risk_common.security import create_access_token
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.infrastructure.db import get_db_session
from app.infrastructure.repositories import UserRepository

router = APIRouter(prefix="/v1/auth", tags=["auth"])
settings = get_settings()

GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
APPLE_OAUTH_AUTHORIZE_URL = "https://appleid.apple.com/auth/authorize"
APPLE_OAUTH_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


class LoginRequest(BaseModel):
    username: str
    password: str


class OAuthStatePayload(BaseModel):
    provider: str
    nonce: str


def _create_oauth_state(provider: str) -> tuple[str, str]:
    """Create a signed opaque state token and raw nonce for OAuth flows."""
    nonce = secrets.token_urlsafe(24)
    payload = OAuthStatePayload(provider=provider, nonce=nonce).model_dump_json().encode("utf-8")
    signature = hmac.new(settings.jwt_secret_key.encode("utf-8"), payload, hashlib.sha256).digest()
    state = f"{base64.urlsafe_b64encode(payload).decode('utf-8')}.{base64.urlsafe_b64encode(signature).decode('utf-8')}"
    return state, nonce


def _validate_oauth_state(provider: str, state: str) -> None:
    """Validate signed OAuth state payload integrity and provider binding."""
    try:
        payload_b64, signature_b64 = state.split(".", 1)
        payload = base64.urlsafe_b64decode(payload_b64.encode("utf-8"))
        provided_sig = base64.urlsafe_b64decode(signature_b64.encode("utf-8"))
    except (ValueError, base64.binascii.Error) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state") from exc

    expected_sig = hmac.new(settings.jwt_secret_key.encode("utf-8"), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(provided_sig, expected_sig):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state signature mismatch")

    parsed = OAuthStatePayload.model_validate_json(payload.decode("utf-8"))
    if parsed.provider != provider:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth provider mismatch")


async def _verify_id_token_with_jwks(id_token: str, jwks_url: str, audience: str) -> dict:
    """Verify ID token signature and audience claim using provider JWKS endpoint."""
    try:
        header = jwt.get_unverified_header(id_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed ID token") from exc

    async with httpx.AsyncClient(timeout=10.0) as client:
        jwks_response = await client.get(jwks_url)
        jwks_response.raise_for_status()
        keys_payload = jwks_response.json().get("keys", [])

    key_payload = next((item for item in keys_payload if item.get("kid") == header.get("kid")), None)
    if key_payload is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to match signing key")

    try:
        claims = jwt.decode(
            id_token,
            key_payload,
            algorithms=[header.get("alg", "RS256")],
            audience=audience,
            options={"verify_at_hash": False},
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid social ID token") from exc

    return claims


async def _finish_social_login(session: AsyncSession, provider: str, claims: dict) -> RedirectResponse:
    """Issue platform token from verified social identity claims."""
    social_subject = claims.get("sub")
    email = claims.get("email")
    if not social_subject:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing social subject claim")

    username = email or f"{provider}:{social_subject}"
    user = await UserRepository.get_or_create_social_user(session=session, username=username)

    token = create_access_token(
        subject=user.username,
        secret_key=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        expires_minutes=settings.jwt_access_token_minutes,
    )

    redirect_query = urlencode({"token": token, "username": user.username})
    return RedirectResponse(url=f"{settings.frontend_base_url}/auth/callback?{redirect_query}", status_code=302)


@router.post("/token", response_model=TokenResponse)
async def issue_token(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> TokenResponse:
    user = await UserRepository.authenticate(session, payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad credentials")

    token = create_access_token(
        subject=user.username,
        secret_key=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        expires_minutes=settings.jwt_access_token_minutes,
    )
    return TokenResponse(access_token=token)


@router.get("/google/login")
async def google_login() -> RedirectResponse:
    """Redirect user-agent to Google OAuth authorization endpoint."""
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Google OAuth is not configured")

    state, nonce = _create_oauth_state("google")
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "prompt": "select_account",
    }
    return RedirectResponse(url=f"{GOOGLE_OAUTH_AUTHORIZE_URL}?{urlencode(params)}", status_code=302)


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> RedirectResponse:
    """Handle Google OAuth callback and issue internal access token."""
    _validate_oauth_state("google", state)

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_response = await client.post(
            GOOGLE_OAUTH_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": settings.google_oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_response.raise_for_status()

    token_payload = token_response.json()
    id_token = token_payload.get("id_token")
    if not id_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google did not return ID token")

    claims = await _verify_id_token_with_jwks(
        id_token=id_token,
        jwks_url=GOOGLE_JWKS_URL,
        audience=settings.google_oauth_client_id,
    )

    return await _finish_social_login(session=session, provider="google", claims=claims)


@router.get("/apple/login")
async def apple_login() -> RedirectResponse:
    """Redirect user-agent to Apple OAuth authorization endpoint."""
    if not settings.apple_oauth_client_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Apple OAuth is not configured")

    state, nonce = _create_oauth_state("apple")
    params = {
        "client_id": settings.apple_oauth_client_id,
        "redirect_uri": settings.apple_oauth_redirect_uri,
        "response_type": "code",
        "response_mode": "form_post",
        "scope": "name email",
        "state": state,
        "nonce": nonce,
    }
    return RedirectResponse(url=f"{APPLE_OAUTH_AUTHORIZE_URL}?{urlencode(params)}", status_code=302)


@router.api_route("/apple/callback", methods=["GET", "POST"])
async def apple_callback(
    request: Request,
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
) -> RedirectResponse:
    """Handle Apple OAuth callback and issue internal access token."""
    callback_data: dict[str, str] = {}
    if request.method == "POST":
        form = await request.form()
        callback_data = {key: str(value) for key, value in form.items()}

    code_value = callback_data.get("code") or code
    state_value = callback_data.get("state") or state

    if not code_value or not state_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Apple callback missing required fields")

    _validate_oauth_state("apple", state_value)

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_response = await client.post(
            APPLE_OAUTH_TOKEN_URL,
            data={
                "code": code_value,
                "client_id": settings.apple_oauth_client_id,
                "client_secret": settings.apple_oauth_client_secret,
                "redirect_uri": settings.apple_oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_response.raise_for_status()

    token_payload = token_response.json()
    id_token = token_payload.get("id_token")
    if not id_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Apple did not return ID token")

    claims = await _verify_id_token_with_jwks(
        id_token=id_token,
        jwks_url=APPLE_JWKS_URL,
        audience=settings.apple_oauth_client_id,
    )

    return await _finish_social_login(session=session, provider="apple", claims=claims)
