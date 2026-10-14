"""Maintained OAuth/OIDC primitives with fixed, bounded network and strict claims."""

import base64
import json
import math
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from threading import RLock
from typing import Any, cast

import httpx2
from authlib.integrations.httpx_client import OAuth2Client  # type: ignore[import-untyped]
from authlib.oidc.core import CodeIDToken  # type: ignore[import-untyped]
from joserfc import jwt
from joserfc.jwk import RSAKey

from meducation_api.auth.config import AuthSettings


class AuthError(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status, self.code = status, code


def unique_object(items: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for k, v in items:
        if k in value:
            raise ValueError("Duplicate JSON key")
        value[k] = v
    return value


class StrictDecoder(json.JSONDecoder):
    def __init__(self, *args: Any, **kwargs: Any):
        kwargs["object_pairs_hook"] = unique_object
        kwargs["parse_constant"] = lambda value: (_ for _ in ()).throw(ValueError("Invalid number"))
        super().__init__(*args, **kwargs)


class LimitedStream(httpx2.SyncByteStream):
    def __init__(self, stream: httpx2.SyncByteStream):
        self.stream = stream

    def __iter__(self) -> Iterator[bytes]:
        size = 0
        deadline = time.monotonic() + 10
        for chunk in self.stream:
            size += len(chunk)
            if size > 131072 or time.monotonic() > deadline:
                raise AuthError(503, "identity_unavailable")
            yield chunk

    def close(self) -> None:
        self.stream.close()


class FixedTransport(httpx2.BaseTransport):
    def __init__(self, endpoints: set[str], transport: httpx2.BaseTransport | None = None):
        self.endpoints = endpoints
        self.transport = transport or httpx2.HTTPTransport(verify=True, trust_env=False, retries=0)

    def handle_request(self, request: httpx2.Request) -> httpx2.Response:
        if str(request.url) not in self.endpoints:
            raise AuthError(503, "identity_unavailable")
        response = self.transport.handle_request(request)
        if (
            response.status_code != 200
            or response.headers.get("content-encoding", "identity") != "identity"
        ):
            response.close()
            raise AuthError(503, "identity_unavailable")
        return httpx2.Response(
            response.status_code,
            headers=response.headers,
            stream=LimitedStream(cast(httpx2.SyncByteStream, response.stream)),
        )

    def close(self) -> None:
        self.transport.close()


@dataclass(frozen=True)
class VerifiedEditorIdentity:
    issuer: str
    subject: str
    provider_sid: str | None
    auth_time: float
    assurance_policy: str


class OIDCClient:
    def __init__(
        self,
        config: AuthSettings,
        *,
        transport: httpx2.BaseTransport | None = None,
        clock: Callable[[], float] = time.time,
        cache_clock: Callable[[], float] = time.monotonic,
    ):
        self.config = config
        self.clock = clock
        self.cache_clock = cache_clock
        self.discovery = config.issuer.rstrip("/") + "/.well-known/openid-configuration"
        self.transport = FixedTransport(
            {self.discovery, config.jwks_uri, config.token_endpoint}, transport
        )
        self.lock = RLock()
        self.keys: dict[str, RSAKey] = {}
        self.loaded = -float("inf")
        self.refreshed = -float("inf")

    @staticmethod
    def _strict_token_response(response: httpx2.Response) -> httpx2.Response:
        value = json.loads(response.content, cls=StrictDecoder)
        if not isinstance(value, dict):
            raise TypeError("Invalid token response")
        return response

    def _client(self) -> OAuth2Client:
        client = OAuth2Client(
            self.config.client_id,
            self.config.client_secret.get_secret_value(),
            token_endpoint_auth_method="client_secret_basic",
            scope="openid",
            redirect_uri=self.config.callback,
            code_challenge_method="S256",
            transport=self.transport,
            timeout=5,
            follow_redirects=False,
            trust_env=False,
            headers={"Accept-Encoding": "identity"},
        )
        client.register_compliance_hook("access_token_response", self._strict_token_response)
        return client

    def authorization(self, *, state: str, nonce: str, verifier: str) -> str:
        # Do not close shared transport between requests; runtime.close owns it.
        client = self._client()
        url, _ = client.create_authorization_url(
            self.config.authorization_endpoint,
            state=state,
            nonce=nonce,
            code_verifier=verifier,
            prompt="login",
            max_age=0,
            response_mode="query",
        )
        return str(url)

    def _json(self, url: str) -> dict[str, Any]:
        response = httpx2.Client(
            transport=self.transport,
            timeout=5,
            follow_redirects=False,
            trust_env=False,
            headers={"Accept-Encoding": "identity"},
        ).get(url)
        value = json.loads(response.content, cls=StrictDecoder)
        if not isinstance(value, dict):
            raise TypeError("Invalid identity document")
        return value

    def _refresh(self) -> None:
        now = self.cache_clock()
        if now - self.refreshed < 5:
            raise AuthError(503, "identity_unavailable")
        self.refreshed = now
        metadata = self._json(self.discovery)
        for key, expected in (
            ("issuer", self.config.issuer),
            ("authorization_endpoint", self.config.authorization_endpoint),
            ("token_endpoint", self.config.token_endpoint),
            ("jwks_uri", self.config.jwks_uri),
        ):
            if metadata.get(key) != expected:
                raise ValueError("Discovery endpoint mismatch")
        for name, value in (
            ("code_challenge_methods_supported", "S256"),
            ("id_token_signing_alg_values_supported", "RS256"),
            ("token_endpoint_auth_methods_supported", "client_secret_basic"),
            ("response_types_supported", "code"),
        ):
            if value not in metadata.get(name, []):
                raise ValueError("Unsupported identity metadata")
        records = self._json(self.config.jwks_uri).get("keys")
        if not isinstance(records, list) or not 1 <= len(records) <= 32:
            raise ValueError("Invalid key set")
        keys: dict[str, RSAKey] = {}
        for record in records:
            if (
                not isinstance(record, dict)
                or record.get("kty") != "RSA"
                or record.get("use", "sig") != "sig"
                or record.get("alg", "RS256") != "RS256"
            ):
                continue
            kid = record.get("kid")
            if (
                not isinstance(kid, str)
                or not 1 <= len(kid) <= 128
                or kid in keys
                or any(k in record for k in ("d", "p", "q", "dp", "dq", "qi"))
            ):
                raise ValueError("Ambiguous/unsafe signing key")
            if (
                not isinstance(record.get("n"), str)
                or len(record["n"]) > 1368
                or not isinstance(record.get("e"), str)
                or len(record["e"]) > 12
            ):
                raise ValueError("Oversized signing key")
            rsa_key = RSAKey.import_key(record)
            if not 2048 <= rsa_key.get_op_key("verify").key_size <= 8192:
                raise ValueError("Unsupported signing key size")
            keys[kid] = rsa_key
        if not keys:
            raise ValueError("No usable signing keys")
        self.keys = keys
        self.loaded = now

    def verify(
        self, token: str, *, nonce: str, access_token: str | None = None
    ) -> VerifiedEditorIdentity:
        try:
            if not isinstance(token, str) or len(token) > 16384 or token.count(".") != 2:
                raise ValueError("Invalid token")
            # Strictly inspect signed-header syntax only. Signature/claims decoding belongs to joserfc.
            header = json.loads(
                base64.urlsafe_b64decode(token.split(".")[0] + "==="), cls=StrictDecoder
            )
            if (
                not isinstance(header, dict)
                or header.get("alg") != "RS256"
                or header.get("typ", "JWT") != "JWT"
                or any(k in header for k in ("jku", "x5u", "jwk", "crit"))
            ):
                raise ValueError("Invalid token header")
            kid = header.get("kid")
            if not isinstance(kid, str) or len(kid) > 128:
                raise ValueError("Invalid key ID")
            with self.lock:
                if self.cache_clock() - self.loaded >= 900 or kid not in self.keys:
                    try:
                        self._refresh()
                    except AuthError:
                        raise
                    except Exception:  # noqa: BLE001 - never expose library or token details  # noqa: BLE001 - untrusted identity/network boundary
                        raise AuthError(503, "identity_unavailable") from None
                if kid not in self.keys:
                    raise ValueError("Unknown key")
                key = self.keys[kid]
            decoded = jwt.decode(token, key, algorithms=["RS256"], decoder_cls=StrictDecoder)
            claims = decoded.claims
            now = self.clock()
            for name in ("exp", "iat", "auth_time"):
                value = claims.get(name)
                if type(value) not in (int, float) or not math.isfinite(cast(float, value)):
                    raise ValueError("Invalid numeric date")
            if "nbf" in claims and (
                type(claims["nbf"]) not in (int, float) or not math.isfinite(claims["nbf"])
            ):
                raise ValueError("Invalid nbf")
            if (
                claims["exp"] <= now
                or claims["iat"] > now + 60
                or claims["auth_time"] > now + 60
                or claims["auth_time"] > claims["iat"] + 60
                or now - claims["auth_time"] > 300
            ):
                raise ValueError("Invalid authentication age")
            if "events" in claims or claims.get("token_use", "id") != "id":
                raise ValueError("Wrong token purpose")
            aud = claims.get("aud")
            if not (
                isinstance(aud, str)
                or isinstance(aud, list)
                and aud
                and all(isinstance(a, str) for a in aud)
            ):
                raise ValueError("Invalid audience")
            if (
                isinstance(aud, list)
                and len(aud) > 1
                and claims.get("azp") != self.config.client_id
            ):
                raise ValueError("Missing authorized party")
            oidc = CodeIDToken(
                claims,
                decoded.header,
                options={
                    "iss": {"essential": True, "value": self.config.issuer},
                    "aud": {"essential": True, "value": self.config.client_id},
                    "sub": {"essential": True},
                    "nonce": {"essential": True},
                    "auth_time": {"essential": True},
                },
                params={
                    "nonce": nonce,
                    "client_id": self.config.client_id,
                    "access_token": access_token,
                    "max_age": 300,
                },
            )
            oidc.validate(now=now, leeway=60)
            if claims.get("sub") != self.config.editor_subject:
                raise AuthError(403, "editor_denied")
            # Synthetic evidence has meaning only in the loopback test harness.
            if (
                not isinstance(claims.get("amr"), list)
                or "mfa" not in claims["amr"]
                or claims.get("synthetic_factor_time") != claims["auth_time"]
            ):
                raise AuthError(403, "assurance_required")
            sid = claims.get("sid")
            if sid is not None and (not isinstance(sid, str) or not 1 <= len(sid) <= 256):
                raise ValueError("Invalid provider sid")
            return VerifiedEditorIdentity(
                self.config.issuer,
                claims["sub"],
                sid,
                float(claims["auth_time"]),
                "synthetic-fresh-factor-v1",
            )
        except AuthError:
            raise
        except Exception:  # noqa: BLE001 - never expose library or token details
            raise AuthError(401, "identity_invalid") from None

    def exchange(self, code: str, *, nonce: str, verifier: str) -> VerifiedEditorIdentity:
        try:
            token = self._client().fetch_token(
                self.config.token_endpoint,
                code=code,
                code_verifier=verifier,
                grant_type="authorization_code",
            )
            if not isinstance(token.get("id_token"), str):
                raise AuthError(401, "identity_invalid")
            return self.verify(
                token["id_token"], nonce=nonce, access_token=token.get("access_token")
            )
        except AuthError:
            raise
        except Exception:  # noqa: BLE001 - never expose library or token details
            raise AuthError(503, "identity_unavailable") from None

    def close(self) -> None:
        self.transport.close()
