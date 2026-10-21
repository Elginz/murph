"""ADC Credential Discovery, OAuth2 Token Exchange & Status Mixin (`drive_adc_auth.py`).

Handles locating `application_default_credentials.json`, exchanging refresh tokens
for short-lived OAuth2 access tokens, executing Drive v3 REST GET requests with
quota-project fallback, and inspecting granted scopes/identity.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from typing import Any, TYPE_CHECKING
import urllib.error
import urllib.parse
import urllib.request

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.integrations import drive_adc_samples
else:
    try:
        from google3.experimental.users.efch.murph.backend.integrations import drive_adc_samples
    except ImportError:
        from backend.integrations import drive_adc_samples  # type: ignore


GCLOUD_ADC_DRIVE_LOGIN_CMD = drive_adc_samples.GCLOUD_ADC_DRIVE_LOGIN_CMD
GLINUX_GDRIVE_BIN = drive_adc_samples.GLINUX_GDRIVE_BIN


class DriveADCAuthMixin:
    """Mixin providing ADC file discovery, OAuth2 token minting, and Drive status inspection."""

    access_token_override: str
    quota_project_override: str
    target_user_override: str
    _cached_token: str
    _cached_token_expiry: float
    _cached_status: dict[str, Any] | None
    _cached_status_time: float

    def find_adc_file(self) -> str:
        """Locates the Application Default Credentials JSON file on disk."""
        candidates = []
        env_adc = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if env_adc:
            candidates.append(env_adc)
        cloudsdk_cfg = os.environ.get("CLOUDSDK_CONFIG", "").strip()
        if cloudsdk_cfg:
            candidates.append(
                os.path.join(cloudsdk_cfg, "application_default_credentials.json")
            )
        candidates.append(
            os.path.expanduser(
                "~/.config/gcloud/application_default_credentials.json"
            )
        )
        for path in candidates:
            if path and os.path.isfile(path):
                return path
        return candidates[-1]

    def load_adc_json(self) -> dict[str, Any]:
        """Reads the local ADC JSON file if present."""
        path = self.find_adc_file()
        if not os.path.isfile(path):
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def configure(
        self,
        access_token: str = "",
        quota_project_id: str = "",
        target_user: str = "",
    ) -> dict[str, Any]:
        """Updates runtime token or quota project overrides and refreshes ADC status."""
        if access_token is not None:
            self.access_token_override = access_token.strip()
        if quota_project_id is not None and quota_project_id.strip():
            self.quota_project_override = quota_project_id.strip()
        if target_user is not None and target_user.strip():
            self.target_user_override = (
                target_user.strip().split("@")[0].strip()
            )
        self._cached_token = ""
        self._cached_token_expiry = 0.0
        self._cached_status = None
        return self.get_status(force_refresh=True, probe_network=True)

    def _mint_access_token(self) -> tuple[str, str, str]:
        """Returns (access_token, quota_project_id, error_msg) from override or ADC."""
        adc_data = self.load_adc_json()
        quota_proj = (
            self.quota_project_override
            or str(adc_data.get("quota_project_id", "")).strip()
        )

        if self.access_token_override:
            return self.access_token_override, quota_proj, ""

        now = time.time()
        if self._cached_token and now < self._cached_token_expiry - 30:
            return self._cached_token, quota_proj, ""

        mint_err_msg = ""
        if adc_data.get("type") == "authorized_user":
            client_id = str(adc_data.get("client_id", "")).strip()
            client_secret = str(adc_data.get("client_secret", "")).strip()
            refresh_token = str(adc_data.get("refresh_token", "")).strip()
            if client_id and client_secret and refresh_token:
                form_body = urllib.parse.urlencode(
                    {
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "refresh_token": refresh_token,
                        "grant_type": "refresh_token",
                    }
                ).encode("utf-8")
                req = urllib.request.Request(
                    "https://oauth2.googleapis.com/token",
                    data=form_body,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(req, timeout=3.5) as resp:
                        token_resp = json.loads(resp.read().decode("utf-8"))
                    token = str(token_resp.get("access_token", "")).strip()
                    expires_in = int(token_resp.get("expires_in", 3000))
                    if token:
                        self._cached_token = token
                        self._cached_token_expiry = now + expires_in
                        return token, quota_proj, ""
                except Exception as exc:  # pylint: disable=broad-exception-caught
                    mint_err_msg = f"ADC token exchange failed: {exc}"
                else:
                    mint_err_msg = ""
        else:
            mint_err_msg = ""

        for cmd in (
            ["gcloud", "auth", "application-default", "print-access-token", "--quiet"],
            ["gcloud", "auth", "print-access-token", "--quiet"],
        ):
            try:
                proc = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=2.2, check=False
                )
                tok = (proc.stdout or "").strip().splitlines()
                if proc.returncode == 0 and tok and len(tok[-1].strip()) > 20:
                    token = tok[-1].strip()
                    self._cached_token = token
                    self._cached_token_expiry = now + 1800
                    return token, quota_proj, ""
            except Exception:  # pylint: disable=broad-exception-caught
                continue

        return "", quota_proj, mint_err_msg or "No active ADC access token could be minted."

    def _drive_api_get(
        self,
        url: str,
        access_token: str,
        quota_project_id: str = "",
        raw_bytes: bool = False,
    ) -> tuple[Any, str]:
        """Executes a GET against Google Drive API v3, retrying without quota project if needed."""
        headers_list = []
        if quota_project_id:
            headers_list.append(
                {
                    "Authorization": f"Bearer {access_token}",
                    "X-Goog-User-Project": quota_project_id,
                }
            )
        headers_list.append({"Authorization": f"Bearer {access_token}"})

        last_err = ""
        for hdrs in headers_list:
            req = urllib.request.Request(url, headers=hdrs, method="GET")
            try:
                with urllib.request.urlopen(req, timeout=4.5) as resp:
                    body = resp.read()
                    if raw_bytes:
                        return body.decode("utf-8", errors="replace"), ""
                    return json.loads(body.decode("utf-8")), ""
            except urllib.error.HTTPError as http_err:
                try:
                    err_payload = http_err.read().decode("utf-8", errors="replace")
                except Exception:  # pylint: disable=broad-exception-caught
                    err_payload = str(http_err)
                last_err = f"HTTP {http_err.code}: {err_payload[:280]}"
                if (
                    "ACCESS_TOKEN_SCOPE_INSUFFICIENT" in err_payload
                    or "insufficientPermissions" in err_payload
                ):
                    break
            except Exception as exc:  # pylint: disable=broad-exception-caught
                last_err = str(exc)
                break
        return None, last_err

    def get_status(
        self, force_refresh: bool = False, probe_network: bool = False
    ) -> dict[str, Any]:
        """Inspects current ADC credentials, Google Login identity, and Drive scope."""
        now = time.time()
        if (
            not force_refresh
            and self._cached_status is not None
            and (now - self._cached_status_time) < 30.0
        ):
            return self._cached_status

        adc_path = self.find_adc_file()
        adc_data = self.load_adc_json()
        adc_found = bool(adc_data)
        cred_type = (
            "access_token_override"
            if self.access_token_override
            else str(adc_data.get("type", "none"))
        )
        quota_proj = (
            self.quota_project_override
            or str(adc_data.get("quota_project_id", "")).strip()
        )
        gdrive_cli_ok = os.path.isfile(GLINUX_GDRIVE_BIN)

        default_ldap = (self.target_user_override or os.environ.get("USER", "")).strip()
        email = str(adc_data.get("account", "")).strip() or (
            f"{default_ldap}@google.com" if default_ldap else ""
        )
        display_name = default_ldap.upper()
        granted_scopes: list[str] = []
        drive_scope_active = False
        token_valid = bool(self.access_token_override or self._cached_token)
        mint_err = ""

        if probe_network:
            token, quota_proj, mint_err = self._mint_access_token()
            if token:
                token_valid = True
                info_url = (
                    "https://oauth2.googleapis.com/tokeninfo?access_token="
                    + urllib.parse.quote(token)
                )
                try:
                    with urllib.request.urlopen(info_url, timeout=3.0) as resp:
                        tinfo = json.loads(resp.read().decode("utf-8"))
                    if tinfo.get("email"):
                        email = str(tinfo["email"]).strip()
                    raw_scope = str(tinfo.get("scope", ""))
                    granted_scopes = [s for s in raw_scope.split() if s]
                    drive_scope_active = any(
                        s in granted_scopes
                        for s in (
                            "https://www.googleapis.com/auth/drive",
                            "https://www.googleapis.com/auth/drive.readonly",
                            "https://www.googleapis.com/auth/drive.metadata.readonly",
                        )
                    )
                except Exception:  # pylint: disable=broad-exception-caught
                    pass

                uinfo_data, _ = self._drive_api_get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    access_token=token,
                )
                if isinstance(uinfo_data, dict):
                    if uinfo_data.get("email"):
                        email = str(uinfo_data["email"]).strip()
                    if uinfo_data.get("name"):
                        display_name = str(uinfo_data["name"]).strip()

                about_data, _ = self._drive_api_get(
                    "https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)",
                    access_token=token,
                    quota_project_id=quota_proj,
                )
                if isinstance(about_data, dict) and isinstance(
                    about_data.get("user"), dict
                ):
                    drive_scope_active = True
                    u_info = about_data["user"]
                    if u_info.get("emailAddress"):
                        email = str(u_info["emailAddress"]).strip()
                    if u_info.get("displayName"):
                        display_name = str(u_info["displayName"]).strip()

        ldap = email.split("@")[0].strip() if "@" in email else email
        if display_name == default_ldap.upper() and ldap:
            display_name = (
                ldap.replace(".", " ").title()
                if "." in ldap
                else ldap.upper()
            )

        if drive_scope_active:
            transport_mode = "adc_drive_v3"
            status_msg = (
                f"Connected to Google Drive v3 API via ADC as {email} "
                f"(Quota Project: {quota_proj or 'default'})."
            )
        elif token_valid:
            transport_mode = (
                "glinux_gdrive_cli" if gdrive_cli_ok else "adc_needs_drive_scope"
            )
            status_msg = (
                f"ADC authenticated as {email}, but the current ADC token only has "
                f"cloud-platform scopes (missing `drive.readonly`). Run the gcloud command "
                f"below to add Google Drive scope to ADC."
            )
        elif adc_found:
            transport_mode = (
                "glinux_gdrive_cli" if gdrive_cli_ok else "adc_needs_drive_scope"
            )
            status_msg = (
                f"Found ADC file at {adc_path} ({mint_err or 'refresh needed'}). "
                f"Run `{GCLOUD_ADC_DRIVE_LOGIN_CMD}` to refresh Google Login + Drive scopes."
            )
        else:
            transport_mode = "unconfigured"
            status_msg = (
                "No ADC file found. Run the gcloud command below to sign in with "
                "Google and enable Google Drive querying."
            )

        status_payload = {
            "adc_found": adc_found,
            "adc_path": adc_path,
            "credential_type": cred_type,
            "quota_project_id": quota_proj,
            "authenticated_email": email,
            "authenticated_name": display_name,
            "authenticated_ldap": ldap,
            "token_valid": token_valid,
            "drive_scope_active": drive_scope_active,
            "granted_scopes": granted_scopes,
            "gdrive_cli_available": gdrive_cli_ok,
            "transport_mode": transport_mode,
            "status_message": status_msg,
            "gcloud_login_command": GCLOUD_ADC_DRIVE_LOGIN_CMD,
        }
        self._cached_status = status_payload
        self._cached_status_time = now
        return status_payload
