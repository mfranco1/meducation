"""Real PG17: admin sessions, OIDC login and private-route guards."""

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from support import (
    auth_app,
    auth_login,
    content_state,
    owner_execute,
    scalar,
    store,
)

pytestmark = pytest.mark.postgres


def test_auth_role_isolation_and_cookie_login_logout(db):
    client, runtime, h = auth_app(db)
    with client:
        assert client.get("/api/admin/access").status_code == 401
        result, fields = auth_login(client, runtime, h)
        assert result.status_code == 303, result.text
        cookie = result.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
        assert "Domain=" not in cookie and "__Host-" not in cookie
        assert result.headers["location"] == runtime.config.origin + "/admin.html"
        assert result.headers["cache-control"] == "no-store"
        assert client.get("/api/admin/access").status_code == 200
        assert (
            client.get(
                "/api/admin/auth/callback", params={"state": fields["state"][0], "code": "replay"}
            ).status_code
            == 401
        )
        assert (
            client.get("/api/admin/access").status_code == 200
        )  # callback failure retains valid session
        info = client.get("/api/admin/session").json()
        assert info["authenticated"]
        assert (
            client.post(
                "/api/admin/auth/logout", json={}, headers={"Origin": runtime.config.origin}
            ).status_code
            == 403
        )
        cookie_value = client.cookies.get(runtime.config.cookie)
        response = client.post(
            "/api/admin/auth/logout",
            json={},
            headers={"Origin": runtime.config.origin, "X-CSRF-Token": info["csrfToken"]},
        )
        assert response.status_code == 200
        assert (
            client.get(
                "/api/admin/access", headers={"Cookie": runtime.config.cookie + "=" + cookie_value}
            ).status_code
            == 401
        )
        assert (
            client.get(
                "/api/v1/subjects", headers={"Cookie": runtime.config.cookie + "=malicious"}
            ).status_code
            == 200
        )
    for engine in (db.reader, db.operator, db.editor):
        with pytest.raises(SQLAlchemyError), engine.connect() as c:
            c.execute(text("SELECT * FROM admin_auth.sessions"))
    for engine in (db.session, db.editor):
        for statement in (
            "SET ROLE meducation_owner",
            "INSERT INTO content.subjects(release_id,id,position,name,accent) VALUES(gen_random_uuid(),'s9',0,'x','#fff')",
            "SELECT content.store_release(NULL,NULL,NULL,NULL,NULL,NULL)",
            "UPDATE content.draft_changes SET actor='bypass'",
        ):
            with pytest.raises(SQLAlchemyError), engine.begin() as c:
                c.execute(text(statement))
    assert scalar(db.backup, "SELECT count(*) FROM admin_auth.sessions") == 1


PRIVATE_ROUTES = [
    ("GET", "/draft"),
    ("GET", "/draft/changes"),
    ("POST", "/draft/changes/1/revert"),
    ("POST", "/draft/discard"),
    ("POST", "/draft/publish"),
    ("POST", "/draft/subjects"),
    ("PUT", "/draft/questions/i1"),
    ("DELETE", "/draft/decks/d1"),
    ("POST", "/draft/cards/f1/move"),
    ("POST", "/draft/quizzes/q1/questions/bulk"),
    ("POST", "/draft/decks/d1/cards/bulk"),
    ("GET", "/releases"),
    ("POST", "/releases/any/activate"),
    ("POST", "/exports"),
]


def private_request(client, method, path, headers=None):
    if method == "GET":
        return client.get("/api/admin" + path, headers=headers)
    return client.request(method, "/api/admin" + path, json={}, headers=headers)


@pytest.mark.parametrize(("method", "path"), PRIVATE_ROUTES)
def test_every_private_operation_is_guarded_before_lookup(db, method, path):
    client, runtime, _h = auth_app(db)
    with client:
        response = private_request(client, method, path, {"Origin": runtime.config.origin})
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
        assert "draft" not in response.text


@pytest.mark.parametrize(
    "fault", ["origin", "sibling", "csrf", "content-type", "host", "oversize", "duplicate", "encoding", "nonascii"]
)
def test_auth_http_transport_denies_bad_browser_requests(db, fault):
    client, runtime, _h = auth_app(db)
    with client:
        csrf = client.get("/api/admin/session").json()["csrfToken"]
        headers = {
            "Origin": runtime.config.origin,
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
        }
        body = "{}"
        if fault == "origin":
            del headers["Origin"]
        elif fault == "sibling":
            headers["Origin"] = "http://localhost:4173"
        elif fault == "csrf":
            headers["X-CSRF-Token"] = "forged"
        elif fault == "content-type":
            headers["Content-Type"] = "text/plain"
        elif fault == "host":
            headers["Host"] = "evil.example"
        elif fault == "nonascii":
            headers["X-CSRF-Token"]=b"\xff"
        elif fault == "encoding":
            headers["Content-Encoding"]="gzip"
        elif fault == "oversize":
            body = " " * 8193
        elif fault == "duplicate":
            body = '{"x":1,"x":2}'
        result = client.post("/api/admin/auth/login", content=body, headers=headers)
        assert result.status_code in (400, 403, 413, 415)
        assert scalar(db.session, "SELECT count(*) FROM admin_auth.logins") == 0
        assert result.headers["x-frame-options"] == "DENY"
        assert result.headers["content-security-policy"].startswith("default-src 'none'")
        assert "access-control-allow-origin" not in result.headers


def test_auth_expiry_epoch_wrong_editor_and_session_store_outage(db):
    from meducation_api.auth.oidc import AuthError

    client, runtime, h = auth_app(db)
    with client:
        result, _ = auth_login(client, runtime, h)
        assert result.status_code == 303
        token = client.cookies.get(runtime.config.cookie)
        for changes in ({"epoch": "different-external-epoch"}, {"editor_subject": "other-editor"}):
            _alternate, other, _ = auth_app(db, **changes)
            with pytest.raises(AuthError), other.store.guard(token):
                pytest.fail("Old session granted access")
        h.now += 901
        csrf = client.get("/api/admin/session").json()["csrfToken"]
        assert (
            client.post(
                "/api/admin/draft/publish",
                json={},
                headers={"Origin": runtime.config.origin, "X-CSRF-Token": csrf},
            ).status_code
            == 403
        )
        # Session bootstrap is polling; it must not extend idle lifetime.
        h.now += 900
        assert not client.get("/api/admin/session").json()["authenticated"]
        h.now -= 1801
        token2, _ = runtime.store.issue(h.client.verify(h.token(), nonce=h.nonce))
        h.now += 28801
        with pytest.raises(AuthError), runtime.store.guard(token2):
            pytest.fail("Absolute expiry bypass")
        h.now -= 28801
        owner_execute(db, "REVOKE USAGE ON SCHEMA admin_auth FROM meducation_session")
        result = client.get(
            "/api/admin/session", headers={"Cookie": runtime.config.cookie + "=" + token2}
        )
        assert result.status_code == 503
        assert "admin_auth" not in result.text
        assert client.get("/api/v1/subjects").status_code == 200


def test_auth_rotation_cancelled_stepup_and_logout_prevents_reissue(db):
    from meducation_api.auth.oidc import AuthError

    client, runtime, h = auth_app(db)
    with client:
        result, _ = auth_login(client, runtime, h)
        assert result.status_code == 303
        old = client.cookies.get(runtime.config.cookie)
        old_csrf = client.get("/api/admin/session").json()["csrfToken"]
        h.now += 6
        result, _ = auth_login(client, runtime, h, stepup=True)
        assert result.status_code == 303
        new = client.cookies.get(runtime.config.cookie)
        assert new != old
        assert client.get("/api/admin/session").json()["csrfToken"] != old_csrf
        with pytest.raises(AuthError), runtime.store.guard(old):
            pytest.fail("Rotated cookie remained active")
        h.now += 6
        h.token_changes = {"sub": "other-editor"}
        result, _ = auth_login(client, runtime, h, stepup=True)
        assert result.status_code == 403
        assert client.get("/api/admin/access").status_code == 200
        identity = h.client.verify(h.token(), nonce=h.nonce)
        with runtime.store.guard(new, interactive=False) as principal:
            runtime.store.revoke(principal)
        with pytest.raises(AuthError):
            runtime.store.issue(identity, previous=hashlib.sha256(new.encode()).hexdigest())
        assert scalar(db.session, "SELECT count(*) FROM admin_auth.sessions WHERE NOT revoked") == 0


def test_session_lock_serializes_protected_work_and_logout_across_workers(db):
    from threading import Event

    from meducation_api.auth.oidc import AuthError
    from meducation_api.auth.store import SessionStore

    store(db)
    _, runtime, h = auth_app(db)
    token, _ = runtime.store.issue(h.client.verify(h.token(), nonce=h.nonce))
    other = SessionStore(db.session, runtime.config, clock=lambda: h.now)
    entered = Event()
    release = Event()
    revoked = Event()

    def protected():
        with runtime.store.guard(token) as p:
            p.connection.execute(text("SELECT token_hash FROM admin_auth.sessions WHERE token_hash=:h FOR NO KEY UPDATE"),{"h":p.token_hash})
            entered.set()
            assert release.wait(5)
            # Commit a representative protected content write before releasing auth lock.
            with db.editor.begin() as c:
                c.execute(
                    text(
                        "INSERT INTO content.draft_subjects(id,position,name,accent) "
                        "VALUES('s900',900,'Locked write','#123456')"
                    )
                )

    def logout():
        assert entered.wait(5)
        with other.guard(token) as p:
            other.revoke(p)
        revoked.set()

    with ThreadPoolExecutor(2) as pool:
        work = pool.submit(protected)
        out = pool.submit(logout)
        assert entered.wait(5)
        assert not revoked.wait(0.1)
        release.set()
        work.result(timeout=5)
        out.result(timeout=5)
    assert scalar(db.operator, "SELECT count(*) FROM content.draft_subjects WHERE id='s900'") == 1
    with pytest.raises(AuthError), runtime.store.guard(token):
        pytest.fail("Revoked session accepted")


def test_loopback_oidc_flow_exchanges_real_http_code_pkce_and_stepup(db):
    """A disposable synthetic issuer exercises sockets/redirects, not real MFA."""
    import base64
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread
    from urllib.parse import parse_qs, urlencode, urlsplit

    import httpx2

    from meducation_api.auth.oidc import OIDCClient

    _client,runtime,h=auth_app(db)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):
            pass  # Never log synthetic codes either.
        def do_GET(self):
            if urlsplit(self.path).path=='/authorize':
                fields=parse_qs(urlsplit(self.path).query)
                assert fields['response_type']==['code'] and fields['code_challenge_method']==['S256']
                assert fields['redirect_uri']==[runtime.config.callback] and fields['scope']==['openid']
                h.nonce=fields['nonce'][0]; h.code='once-only-loopback-code'; self.server.challenge=fields['code_challenge'][0]
                self.send_response(302); self.send_header('Location',runtime.config.callback+'?'+urlencode({'code':h.code,'state':fields['state'][0]})); self.end_headers()
            else:
                result=h.request(httpx2.Request('GET',runtime.config.issuer+self.path))
                self.send_response(result.status_code); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(result.content)
        def do_POST(self):
            data=self.rfile.read(int(self.headers['Content-Length']))
            verifier=parse_qs(data.decode())['code_verifier'][0]
            assert base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')==self.server.challenge
            h.verifier=verifier
            result=h.request(httpx2.Request('POST',runtime.config.token_endpoint,content=data,headers={'Authorization':self.headers['Authorization']}))
            self.send_response(result.status_code); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(result.content)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=Thread(target=server.serve_forever,daemon=True); thread.start()
    issuer='http://127.0.0.1:'+str(server.server_address[1])
    cfg=runtime.config.model_copy(update={'issuer':issuer,'authorization_endpoint':issuer+'/authorize','token_endpoint':issuer+'/token','jwks_uri':issuer+'/jwks'})
    # Rebuild the app with the same private DB and a real (non-mocked) client.
    actual,rt,h=auth_app(db,issuer=issuer,authorization_endpoint=cfg.authorization_endpoint,token_endpoint=cfg.token_endpoint,jwks_uri=cfg.jwks_uri)
    rt.oidc=OIDCClient(rt.config,clock=lambda:h.now)
    runtime=rt
    try:
        with actual,httpx2.Client(follow_redirects=False,trust_env=False) as browser:
            old=None
            for path in ('/api/admin/auth/login','/api/admin/auth/reauthenticate'):
                csrf=actual.get('/api/admin/session').json()['csrfToken']
                login=actual.post(path,json={},headers={'Origin':rt.config.origin,'X-CSRF-Token':csrf})
                assert login.status_code==200
                authorize=browser.get(login.json()['authorizationUrl'])
                assert authorize.status_code==302
                result=actual.get(authorize.headers['Location'])
                assert result.status_code==303,result.text
                token=actual.cookies.get(rt.config.cookie); assert token and token!=old; old=token
                assert actual.get('/api/admin/access').status_code==200
                h.now+=6
    finally:
        rt.oidc.close(); server.shutdown(); server.server_close(); thread.join(timeout=2)


@pytest.mark.parametrize('fault',['browser','state','duplicate','expired','cancel','missing-mfa','wrong-issuer','wrong-purpose'])
def test_login_callback_faults_create_no_session(db,fault):
    from urllib.parse import parse_qs, urlsplit
    client,runtime,h=auth_app(db)
    with client:
        csrf=client.get('/api/admin/session').json()['csrfToken']
        login=client.post('/api/admin/auth/login',json={},headers={'Origin':runtime.config.origin,'X-CSRF-Token':csrf})
        fields=parse_qs(urlsplit(login.json()['authorizationUrl']).query)
        h.nonce=fields['nonce'][0]; h.code='disposable-code'
        h.verifier=json.loads(runtime.store.cipher.decrypt(scalar(db.session,'SELECT ciphertext FROM admin_auth.logins').encode()))['verifier']
        params=[('state',fields['state'][0]),('code',h.code)]
        if fault=='browser': client.cookies.clear()
        elif fault=='state': params[0]=('state','x'*43)
        elif fault=='duplicate': params.append(params[0])
        elif fault=='expired': h.now+=601
        elif fault=='cancel': params=[('state',fields['state'][0]),('error','access_denied')]
        elif fault=='missing-mfa': h.token_changes={'amr':['pwd']}
        elif fault=='wrong-issuer': h.token_changes={'iss':'http://untrusted.invalid'}
        elif fault=='wrong-purpose': h.token_changes={'token_use':'logout'}
        result=client.get('/api/admin/auth/callback',params=params)
        assert result.status_code in (303,400,401,403)
        assert scalar(db.session,'SELECT count(*) FROM admin_auth.sessions')==0
        assert client.get('/api/admin/access').status_code==401
        assert 'disposable-code' not in result.text
        assert result.headers['cache-control']=='no-store'


def test_auth_login_rate_limit_and_no_header_identity_bypass(db):
    client,runtime,h=auth_app(db)
    with client:
        csrf=client.get('/api/admin/session').json()['csrfToken']
        for _ in range(6):
            response=client.post('/api/admin/auth/login',json={},headers={'Origin':runtime.config.origin,'X-CSRF-Token':csrf})
            assert response.status_code==200
        response=client.post('/api/admin/auth/login',json={},headers={'Origin':runtime.config.origin,'X-CSRF-Token':csrf})
        assert response.status_code==429
        assert scalar(db.session,'SELECT count(*) FROM admin_auth.logins')==6
        assert client.get('/api/admin/access',headers={'Authorization':'Bearer '+h.token(),'X-Editor-Subject':runtime.config.editor_subject}).status_code==401
        assert client.get('/api/v1/subjects').status_code==200


def test_all_private_paths_reject_revoked_expired_wrong_editor_and_old_epoch(db):
    client,runtime,h=auth_app(db)
    before=content_state(db)
    with client:
        identity=h.client.verify(h.token(),nonce=h.nonce)
        for field,value in [('revoked',True),('epoch','restored-old-epoch'),('subject','wrong-editor'),('last_activity',h.now-1801),('expires',h.now-1)]:
            token,csrf=runtime.store.issue(identity)
            with db.session.begin() as c:
                c.execute(text(f'UPDATE admin_auth.sessions SET {field}=:v WHERE token_hash=:h'),{'v':value,'h':hashlib.sha256(token.encode()).hexdigest()})
            for method,path in PRIVATE_ROUTES:
                headers={'Cookie':runtime.config.cookie+'='+token,'Origin':runtime.config.origin,'X-CSRF-Token':csrf}
                response=private_request(client,method,path,headers)
                assert response.status_code==401,(field,path,response.text)
                assert response.headers['cache-control']=='no-store'
        assert content_state(db)==before
