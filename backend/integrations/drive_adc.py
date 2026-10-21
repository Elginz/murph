"""Google Login & Application Default Credentials (ADC) Client for Google Drive.

Modularized into 3 focused submodules:
- `drive_adc_samples.py`: Constants (`GCLOUD_ADC_DRIVE_LOGIN_CMD`, `GLINUX_GDRIVE_BIN`),
  MIME label mapper (`_friendly_mime_label`), and curated Workspace Drive preview
  catalog (`SAMPLE_DRIVE_FILES`).
- `drive_adc_auth.py`: `DriveADCAuthMixin` — ADC file discovery, OAuth2 token
  refresh/minting, Drive v3 authenticated GET helper, and status inspection.
- `drive_adc_files.py`: `DriveADCFilesMixin` — Drive v3 REST search, gLinux `gdrive`
  CLI fallback, and Google Docs/Sheets/Slides content export.
"""

from __future__ import annotations

import os
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.integrations import drive_adc_auth
    from google3.experimental.users.efch.murph.backend.integrations import drive_adc_files
    from google3.experimental.users.efch.murph.backend.integrations import drive_adc_samples
else:
    try:
        from google3.experimental.users.efch.murph.backend.integrations import drive_adc_auth
        from google3.experimental.users.efch.murph.backend.integrations import drive_adc_files
        from google3.experimental.users.efch.murph.backend.integrations import drive_adc_samples
    except ImportError:
        from backend.integrations import drive_adc_auth  # type: ignore
        from backend.integrations import drive_adc_files  # type: ignore
        from backend.integrations import drive_adc_samples  # type: ignore


GCLOUD_ADC_DRIVE_LOGIN_CMD = drive_adc_samples.GCLOUD_ADC_DRIVE_LOGIN_CMD
GLINUX_GDRIVE_BIN = drive_adc_samples.GLINUX_GDRIVE_BIN
SAMPLE_DRIVE_FILES = drive_adc_samples.SAMPLE_DRIVE_FILES
_friendly_mime_label = drive_adc_samples._friendly_mime_label


class GoogleDriveADCClient(
    drive_adc_auth.DriveADCAuthMixin,
    drive_adc_files.DriveADCFilesMixin,
):
    """Manages Google Login identity and Google Drive v3 API queries via ADC."""

    def __init__(self) -> None:
        self.access_token_override: str = os.environ.get(
            "GOOGLE_DRIVE_ACCESS_TOKEN", ""
        ).strip()
        self.quota_project_override: str = os.environ.get(
            "GOOGLE_CLOUD_QUOTA_PROJECT", ""
        ).strip()
        self.target_user_override: str = os.environ.get("USER", "").strip()
        self._cached_token: str = ""
        self._cached_token_expiry: float = 0.0
        self._cached_status: dict[str, Any] | None = None
        self._cached_status_time: float = 0.0
