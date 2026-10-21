"""Authentication, User Profile Settings, File Vault & Google Drive Facade Mixin.

Composes:
- `engine_users.py` (`UserAuthAndSettingsMixin`): 2-account Cloud & Digital Marketing (DM) login, registration & profile settings.
- `engine_google_accounts.py` (`GoogleAccountsMixin`): Google-only private accounts behind "Sign in with Google".
- `engine_files.py` (`FileVaultAndDriveMixin`): File uploads/deletions & Google Drive v3 ADC integration.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.engine import engine_files
    from google3.experimental.users.efch.murph.backend.engine import engine_google_accounts
    from google3.experimental.users.efch.murph.backend.engine import engine_users
else:
    try:
        from google3.experimental.users.efch.murph.backend.engine import engine_files
        from google3.experimental.users.efch.murph.backend.engine import engine_google_accounts
        from google3.experimental.users.efch.murph.backend.engine import engine_users
    except ImportError:
        from backend.engine import engine_files  # type: ignore
        from backend.engine import engine_google_accounts  # type: ignore
        from backend.engine import engine_users  # type: ignore

UserAuthAndSettingsMixin = engine_users.UserAuthAndSettingsMixin
GoogleAccountsMixin = engine_google_accounts.GoogleAccountsMixin
FileVaultAndDriveMixin = engine_files.FileVaultAndDriveMixin


class AuthAndFilesMixin(UserAuthAndSettingsMixin, GoogleAccountsMixin, FileVaultAndDriveMixin):
    """Unified Authentication, User Settings, File Vault & Drive Mixin for PreFlightEngine."""
