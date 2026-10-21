"""Unit tests for the Cloud Run metadata-server credentials behind Vertex AI Gemini calls."""

from __future__ import annotations
from typing import TYPE_CHECKING, Any

import json
import os
import subprocess
import unittest
from unittest import mock
import urllib.request

if TYPE_CHECKING:
    from google3.experimental.users.efch.murph.backend.integrations import cloud_run_metadata
    from google3.experimental.users.efch.murph.backend.integrations import llm_client
else:
    try:
        from google3.experimental.users.efch.murph.backend.integrations import cloud_run_metadata
        from google3.experimental.users.efch.murph.backend.integrations import llm_client
    except ImportError:
        from backend.integrations import cloud_run_metadata  # type: ignore
        from backend.integrations import llm_client  # type: ignore

_TOKEN_PATH = "instance/service-accounts/default/token"
_PROJECT_PATH = "project/project-id"
_SA_TOKEN_JSON = json.dumps(
    {"access_token": "test-token-cloud-run-sa", "expires_in": 3599, "token_type": "Bearer"}
)
_VERTEX_BODY: dict[str, Any] = {
    "candidates": [{"content": {"parts": [{"text": json.dumps({"ok": True})}]}}]
}
_ENV_KEYS = (
    "K_SERVICE",
    "VERTEX_PROJECT_ID",
    "GOOGLE_CLOUD_PROJECT",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
)


def _fake_metadata(path: str, timeout: float = 2.0) -> str:
    del timeout  # Unused.
    return {_TOKEN_PATH: _SA_TOKEN_JSON, _PROJECT_PATH: "efch-501106"}.get(path, "")


class _FakeResponse:
    """Minimal stand-in for the context manager returned by `urllib.request.urlopen`."""

    def __init__(self, payload: dict[str, Any]) -> None:
        self._raw = json.dumps(payload).encode("utf-8")

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, *exc_info: object) -> None:
        return None

    def read(self) -> bytes:
        return self._raw


class CloudRunMetadataTest(unittest.TestCase):

    def setUp(self) -> None:
        super().setUp()
        clean_env = {k: v for k, v in os.environ.items() if k not in _ENV_KEYS}
        self._patch_dict(clean_env)

    def _patch_dict(self, values: dict[str, str]) -> None:
        patcher = mock.patch.dict(os.environ, values, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _patch(self, target: Any, attribute: str, **kwargs: Any) -> mock.MagicMock:
        patcher = mock.patch.object(target, attribute, **kwargs)
        mocked = patcher.start()
        self.addCleanup(patcher.stop)
        return mocked

    def _new_client(self) -> llm_client.MurphLLMClient:
        client = llm_client.MurphLLMClient(allow_adc=True)
        client._dotenv_key_cache = ""  # pylint: disable=protected-access
        return client

    def test_runtime_credentials_read_metadata_server_on_cloud_run(self) -> None:
        os.environ["K_SERVICE"] = "murph"
        get = self._patch(cloud_run_metadata, "metadata_get", side_effect=_fake_metadata)

        token, ttl, project = cloud_run_metadata.runtime_credentials()

        self.assertEqual(token, "test-token-cloud-run-sa")
        self.assertEqual(ttl, cloud_run_metadata.MAX_TOKEN_CACHE_SEC)
        self.assertEqual(project, "efch-501106")
        self.assertEqual([c.args[0] for c in get.call_args_list], [_TOKEN_PATH, _PROJECT_PATH])

    def test_short_lived_token_gets_short_cache_window(self) -> None:
        os.environ["K_SERVICE"] = "murph"
        short = json.dumps({"access_token": "test-token-short", "expires_in": 300})
        self._patch(cloud_run_metadata, "metadata_get", side_effect=[short, "efch-501106"])

        self.assertEqual(
            cloud_run_metadata.runtime_credentials(), ("test-token-short", 180.0, "efch-501106")
        )

    def test_runtime_credentials_skip_metadata_server_off_cloud_run(self) -> None:
        get = self._patch(cloud_run_metadata, "metadata_get", side_effect=_fake_metadata)

        self.assertEqual(cloud_run_metadata.runtime_credentials(), ("", 0.0, ""))
        get.assert_not_called()

    def test_vertex_call_on_cloud_run_uses_service_account_without_quota_header(self) -> None:
        os.environ["K_SERVICE"] = "murph"
        self._patch(cloud_run_metadata, "metadata_get", side_effect=_fake_metadata)
        gcloud = self._patch(subprocess, "check_output")
        urlopen = self._patch(urllib.request, "urlopen", return_value=_FakeResponse(_VERTEX_BODY))
        client = self._new_client()

        result = client.generate_multi_turn_json(
            [{"role": "user", "parts": [{"text": "hi"}]}], schema={"type": "OBJECT"}
        )

        self.assertEqual(result, {"ok": True})
        self.assertTrue(client.is_live_enabled())
        gcloud.assert_not_called()
        request = urlopen.call_args.args[0]
        self.assertIn("/projects/efch-501106/locations/global/", request.full_url)
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token-cloud-run-sa")
        self.assertIsNone(request.get_header("X-goog-user-project"))

    def test_local_gcloud_login_still_sends_quota_project(self) -> None:
        os.environ["GOOGLE_CLOUD_PROJECT"] = "efch-501106"
        meta = self._patch(cloud_run_metadata, "metadata_get", side_effect=_fake_metadata)
        self._patch(subprocess, "check_output", return_value=b"test-token-user-login\n")
        urlopen = self._patch(urllib.request, "urlopen", return_value=_FakeResponse(_VERTEX_BODY))
        client = self._new_client()

        result = client.generate_multi_turn_json(
            [{"role": "user", "parts": [{"text": "hi"}]}], schema={"type": "OBJECT"}
        )

        self.assertEqual(result, {"ok": True})
        meta.assert_not_called()
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token-user-login")
        self.assertEqual(request.get_header("X-goog-user-project"), "efch-501106")


if __name__ == "__main__":
    unittest.main()
