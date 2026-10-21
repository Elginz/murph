"""Checks the Google access token behind Murph's "Sign in with Google".

The Lock Screen runs Google Identity Services' OAuth token client in the
visitor's own browser (scopes `openid email profile`, no Drive) and posts the
access token to `POST /api/auth/google`. Murph trusts the email in it only
after Google confirms the token here:

1. `tokeninfo` must accept the token, which must be issued to Murph's own OAuth
   client (`aud`/`azp` == `GOOGLE_OAUTH_CLIENT_ID`), unexpired, and carry a
   verified email plus a stable Google account id (`sub`);
2. `userinfo` (same token) supplies the display name and must report the same
   `sub`. If it is unreachable the name falls back to the email's local part.

The token is never stored. Tests inject `fetch`; there is no bypass.
"""

from __future__ import annotations

from collections.abc import Callable
import json
import os
from typing import Any
import urllib.error
import urllib.parse
import urllib.request

CLIENT_ID_ENV = "GOOGLE_OAUTH_CLIENT_ID"
TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
TIMEOUT_SECONDS = 8
MAX_TOKEN_LENGTH = 4096

# fetch(url, headers) -> (HTTP status, parsed JSON object or {}).
Fetcher = Callable[[str, dict[str, str]], tuple[int, dict[str, Any]]]


class GoogleIdentityError(ValueError):
    """A Google sign-in Murph must refuse; `str(exc)` is safe to show users."""


def configured_client_id() -> str:
    """The OAuth Web client id from `$GOOGLE_OAUTH_CLIENT_ID` ('' = Google sign-in off)."""
    return os.environ.get(CLIENT_ID_ENV, "").strip()


def _default_fetch(url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as resp:
            status, raw = int(resp.status), resp.read()
    except urllib.error.HTTPError as exc:
        status, raw = int(exc.code), exc.read() or b""
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, ValueError):
        body = {}
    return status, body if isinstance(body, dict) else {}


def _call(fetch: Fetcher, url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    try:
        return fetch(url, headers)
    except (OSError, ValueError) as exc:  # URLError and timeouts are OSErrors.
        raise GoogleIdentityError(
            "Couldn't reach Google to check the sign-in. Try again."
        ) from exc


def _is_true(value: Any) -> bool:
    return value is True or str(value).strip().lower() == "true"


def verify_access_token(
    access_token: str, client_id: str, fetch: Fetcher | None = None
) -> dict[str, str]:
    """Returns `{sub, email, name, picture}` for a valid token, else raises.

    Raises:
      GoogleIdentityError: Google sign-in is off, or the token is missing,
        foreign, expired, unverified or unreachable.
    """
    token = str(access_token or "").strip()
    if not client_id:
        raise GoogleIdentityError("Google sign-in isn't set up on this server.")
    if not token or len(token) > MAX_TOKEN_LENGTH:
        raise GoogleIdentityError("Google didn't return a sign-in token. Try again.")
    do_fetch = fetch or _default_fetch

    query = urllib.parse.urlencode({"access_token": token})
    status, info = _call(do_fetch, f"{TOKENINFO_URL}?{query}", {})
    if status != 200:
        raise GoogleIdentityError("Google rejected this sign-in. Try again.")
    if client_id not in (str(info.get("aud") or ""), str(info.get("azp") or "")):
        raise GoogleIdentityError("This Google sign-in was issued to a different app.")
    try:
        expires_in = int(str(info.get("expires_in") or "0"))
    except ValueError:
        expires_in = 0
    if expires_in <= 0:
        raise GoogleIdentityError("This Google sign-in has expired. Try again.")
    email = str(info.get("email") or "").strip().lower()
    sub = str(info.get("sub") or "").strip()
    if not sub or "@" not in email:
        raise GoogleIdentityError("Google didn't share an email address for this account.")
    if not _is_true(info.get("email_verified")):
        raise GoogleIdentityError("This Google account's email address isn't verified.")

    name, picture = "", ""
    try:
        u_status, profile = _call(
            do_fetch, USERINFO_URL, {"Authorization": f"Bearer {token}"}
        )
    except GoogleIdentityError:
        u_status, profile = 0, {}
    if u_status == 200:
        if str(profile.get("sub") or "").strip() != sub:
            raise GoogleIdentityError("Google returned a different account. Try again.")
        name = str(profile.get("name") or "").strip()
        picture = str(profile.get("picture") or "").strip()
    if not name:
        name = email.split("@")[0].replace(".", " ").replace("_", " ").title()
    return {"sub": sub, "email": email, "name": name[:120], "picture": picture[:500]}
