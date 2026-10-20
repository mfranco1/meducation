"""Synthetic signing/JWKS evidence, not hosted provider assurance acceptance."""

import base64
import json
import time

import httpx2
import pytest
from cryptography.fernet import Fernet
from joserfc import jwt
from joserfc.jwk import RSAKey
from pydantic import ValidationError

from meducation_api.auth.config import AuthSettings
from meducation_api.auth.oidc import AuthError, OIDCClient, StrictDecoder

NOW = time.time()
KEY = RSAKey.generate_key(2048)
KEY2 = RSAKey.generate_key(2048)


def config(**changes):
    values = {
        "enabled": True,
        "environment": "local",
        "origin": "http://127.0.0.1:4173",
        "issuer": "http://127.0.0.1:9090",
        "authorization_endpoint": "http://127.0.0.1:9090/authorize",
        "token_endpoint": "http://127.0.0.1:9090/token",
        "jwks_uri": "http://127.0.0.1:9090/jwks",
        "client_id": "test-client",
        "client_secret": "disposable-test-client-secret",
        "editor_subject": "exact-editor",
        "epoch": "disposable-epoch-01",
        "encryption_key": Fernet.generate_key().decode(),
        "session_database_url": "postgresql+psycopg://meducation_session:disposable-test-secret@127.0.0.1:5433/meducation_test_auth?sslmode=disable",
        "editor_database_url": "postgresql+psycopg://meducation_editor:disposable-other-secret@127.0.0.1:5433/meducation_test_auth?sslmode=disable",
    }
    values.update(changes)
    return AuthSettings(**values)


class Harness:
    def __init__(self, settings=None):
        self.config = settings or config()
        self.now = NOW
        self.records = [self.public(KEY, "first")]
        self.fail = False
        self.calls = []
        self.code = None
        self.nonce = "nonce"
        self.verifier = None
        self.token_changes = {}
        self.key = KEY
        self.kid = "first"
        self.client = OIDCClient(
            self.config,
            transport=httpx2.MockTransport(self.request),
            clock=lambda: self.now,
            cache_clock=lambda: self.now,
        )

    @staticmethod
    def public(key, kid):
        return {**key.as_dict(private=False), "kid": kid, "alg": "RS256", "use": "sig"}

    def claims(self, **changes):
        values = {
            "iss": self.config.issuer,
            "sub": self.config.editor_subject,
            "aud": self.config.client_id,
            "exp": self.now + 300,
            "iat": self.now,
            "auth_time": self.now,
            "nonce": self.nonce,
            "amr": ["pwd", "mfa"],
            "synthetic_factor_time": self.now,
            "sid": "disposable-provider-session",
        }
        values.update(changes)
        return values

    def token(self, **changes):
        return jwt.encode({"alg": "RS256", "kid": self.kid}, self.claims(**changes), self.key)

    def request(self, request):
        self.calls.append(str(request.url))
        if self.fail:
            raise httpx2.ConnectError("secret identity failure", request=request)
        if request.url.path.endswith("openid-configuration"):
            return httpx2.Response(
                200,
                json={
                    "issuer": self.config.issuer,
                    "authorization_endpoint": self.config.authorization_endpoint,
                    "token_endpoint": self.config.token_endpoint,
                    "jwks_uri": self.config.jwks_uri,
                    "code_challenge_methods_supported": ["S256"],
                    "id_token_signing_alg_values_supported": ["RS256"],
                    "token_endpoint_auth_methods_supported": ["client_secret_basic"],
                    "response_types_supported": ["code"],
                },
            )
        if request.url.path == "/jwks":
            return httpx2.Response(200, json={"keys": self.records})
        if request.url.path == "/token":
            from urllib.parse import parse_qs

            fields = parse_qs(request.content.decode())
            assert fields["code"] == [self.code]
            assert fields["code_verifier"] == [self.verifier]
            assert fields["redirect_uri"] == [self.config.callback]
            assert request.headers["authorization"].startswith("Basic ")
            self.code = None
            return httpx2.Response(
                200,
                json={
                    "id_token": self.token(**self.token_changes),
                    "access_token": "unused-access",
                    "token_type": "Bearer",
                },
            )
        raise AssertionError("Unexpected endpoint")


@pytest.mark.parametrize(
    "changes",
    [
        {"environment": "production"},
        {"adapter": "zitadel"},
        {"origin": "http://remote.example"},
        {"issuer": "http://127.0.0.1:9090/?injected=1"},
        {"origin": "http://127.0.0.1:4173/path"},
        {"editor_subject": ""},
        {"epoch": ""},
        {"client_secret": ""},
        {"session_database_url": None},
        {
            "session_database_url": "postgresql+psycopg://meducation_operator:secret@127.0.0.1/db?sslmode=disable"
        },
    ],
)
def test_production_and_insecure_configuration_fail_closed(changes):
    with pytest.raises(ValidationError):
        config(**changes)


def test_disabled_learner_configuration_does_not_need_identity():
    assert not AuthSettings(enabled=False).enabled


@pytest.mark.parametrize(
    "changes",
    [
        {"iss": "other"},
        {"aud": "other"},
        {"azp": "other"},
        {"aud": ["test-client", "other"]},
        {"nonce": "other"},
        {"sub": "another-editor"},
        {"sub": ""},
        {"exp": NOW - 1},
        {"iat": NOW + 61},
        {"auth_time": NOW + 61},
        {"auth_time": NOW - 301},
        {"auth_time": None},
        {"iat": True},
        {"nbf": NOW + 61},
        {"nbf": False},
        {"amr": []},
        {"amr": ["pwd"]},
        {"synthetic_factor_time": NOW - 1},
        {"token_use": "access"},
        {"events": {"http://schemas.openid.net/event/backchannel-logout": {}}},
    ],
)
def test_token_faults_deny_without_identity(changes):
    h = Harness()
    with pytest.raises(AuthError) as caught:
        h.client.verify(h.token(**changes), nonce=h.nonce)
    assert caught.value.status in (401, 403)
    assert "secret" not in str(caught.value)


def test_valid_id_token_and_multi_audience_with_azp():
    h = Harness()
    identity = h.client.verify(
        h.token(aud=["test-client", "other"], azp="test-client"), nonce=h.nonce
    )
    assert identity.subject == "exact-editor"
    assert identity.assurance_policy == "synthetic-fresh-factor-v1"


@pytest.mark.parametrize(
    "token", ["none", "x" * 16385, "e30.e30.", "eyJhbGciOiJIUzI1NiJ9.e30.signature"]
)
def test_malformed_unsigned_or_hs_token(token):
    with pytest.raises(AuthError):
        Harness().client.verify(token, nonce="nonce")


@pytest.mark.parametrize("part", [0, 1])
def test_duplicate_signed_json_is_rejected(part):
    h = Harness()
    token = h.token().split(".")
    raw = base64.urlsafe_b64decode(token[part] + "===")
    name = "alg" if part == 0 else "iss"
    raw = raw[:-1] + b',"' + name.encode() + b'":"duplicated"}'
    token[part] = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    with pytest.raises(AuthError):
        h.client.verify(".".join(token), nonce=h.nonce)
    with pytest.raises(ValueError):
        json.loads(raw, cls=StrictDecoder)


def test_key_rotation_removal_outage_and_refresh_coalescing():
    h = Harness()
    original = h.token()
    h.client.verify(original, nonce=h.nonce)
    h.now += 6
    h.records.append(h.public(KEY2, "second"))
    h.key = KEY2
    h.kid = "second"
    h.client.verify(h.token(), nonce=h.nonce)
    calls = len(h.calls)
    h.client.verify(h.token(), nonce=h.nonce)
    assert len(h.calls) == calls
    h.now += 901
    h.records = [h.public(KEY2, "second")]
    h.client.verify(h.token(), nonce=h.nonce)
    with pytest.raises(AuthError):
        h.client.verify(original, nonce=h.nonce)
    h.now += 901
    h.fail = True
    with pytest.raises(AuthError) as caught:
        h.client.verify(h.token(), nonce=h.nonce)
    assert caught.value.code == "identity_unavailable"


@pytest.mark.parametrize(
    "fault",
    ["duplicate", "weak", "wrong-signature", "redirect", "oversize", "metadata", "unknown-kid"],
)
def test_key_and_network_faults(fault):
    h = Harness()
    if fault == "duplicate":
        h.records *= 2
    elif fault == "weak":
        h.records = [h.public(RSAKey.generate_key(1024), "first")]
    elif fault == "wrong-signature":
        h.records = [h.public(KEY2, "first")]
    elif fault == "unknown-kid":
        h.kid = "unknown"
    else:

        def reply(request):
            if fault == "redirect":
                return httpx2.Response(302, headers={"Location": "http://untrusted.invalid/jwks"})
            if fault == "oversize":
                return httpx2.Response(200, content=b" " * 131073)
            return httpx2.Response(200, json={"issuer": "wrong"})

        h.client.transport.transport = httpx2.MockTransport(reply)
    with pytest.raises(AuthError):
        h.client.verify(h.token(), nonce=h.nonce)


def test_authorization_url_is_fixed_pkce_code_flow():
    from urllib.parse import parse_qs, urlsplit

    h = Harness()
    verifier = "v" * 43
    url = h.client.authorization(state="s" * 43, nonce="n" * 43, verifier=verifier)
    fields = parse_qs(urlsplit(url).query)
    assert fields["response_type"] == ["code"] and fields["code_challenge_method"] == ["S256"]
    assert (
        fields["scope"] == ["openid"]
        and fields["prompt"] == ["login"]
        and fields["max_age"] == ["0"]
    )
    assert fields["redirect_uri"] == [h.config.callback]


@pytest.mark.parametrize("missing", ["iss", "aud", "sub", "exp", "iat", "auth_time", "nonce"])
def test_missing_required_signed_claims(missing):
    h = Harness()
    claims = h.claims()
    del claims[missing]
    token = jwt.encode({"alg": "RS256", "kid": "first"}, claims, KEY)
    with pytest.raises(AuthError):
        h.client.verify(token, nonce=h.nonce)


@pytest.mark.parametrize("field", ["jku", "x5u", "jwk"])
def test_signed_token_cannot_select_its_own_key_source(field):
    h = Harness()
    header = {"alg": "RS256", "kid": "first", field: "https://untrusted.invalid/keys"}
    if field == "jwk":
        header[field] = h.public(KEY2, "second")
    token = jwt.encode(header, h.claims(), KEY)
    with pytest.raises(AuthError):
        h.client.verify(token, nonce=h.nonce)
    assert not h.calls


def test_duplicate_token_endpoint_fields_and_untrusted_redirect_are_rejected():
    h = Harness()
    h.client.transport.transport = httpx2.MockTransport(
        lambda request: httpx2.Response(200, content=b'{"id_token":"one","id_token":"two"}')
    )
    with pytest.raises(AuthError):
        h.client.exchange("code", nonce="nonce", verifier="v" * 43)


def test_production_cookie_clear_uses_host_prefix_secure_flags():
    from meducation_api.auth.http import error_response

    settings = AuthSettings(enabled=False, environment="production", origin="https://admin.example")
    response = error_response(AuthError(401, "session_required"), settings)
    cookie = response.headers["set-cookie"]
    assert (
        "__Host-meducation-admin=" in cookie
        and "Secure" in cookie
        and "HttpOnly" in cookie
        and "Path=/" in cookie
        and "Domain=" not in cookie
    )


def test_inherited_local_identity_cannot_enable_default_production_app():
    from meducation_api.main import create_app
    from meducation_api.settings import Settings

    with pytest.raises(ValueError, match="explicit local"):
        create_app(Settings(_env_file=None), auth_settings=config())


@pytest.mark.parametrize("field,length", [("n", 1369), ("e", 13)])
def test_rsa_material_is_bounded_before_crypto_import(field, length):
    h = Harness()
    h.records[0][field] = "A" * length
    with pytest.raises(AuthError, match="identity_unavailable"):
        h.client.verify(h.token(), nonce=h.nonce)
