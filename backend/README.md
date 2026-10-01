# Meducation content API

The FastAPI service reads `src/content/questionBank.generated.json` as the
canonical schema-v4 bank. It serves read-only quiz content; attempts and scoring
remain in the browser.

From the repository root, create the isolated environment if it does not exist:

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.lock
.venv/bin/python -m pip install --no-deps -e backend
.venv/bin/python -m uvicorn meducation_api.main:app --reload --host 127.0.0.1 --port 8000
```

For configuration overrides, copy `backend/.env.example` to `backend/.env` and
edit it there. The default bank path already points to the canonical repository
file.

Set `VITE_CONTENT_SOURCE=api` (the default) and run the Vite app separately.
Vite proxies `/api` to `http://127.0.0.1:8000`. Production hosting must route
the same `/api` prefix to FastAPI. Set
`MEDUCATION_BANK_PATH` only when the canonical file is stored at a different
path. In development, `VITE_CONTENT_SOURCE=local` explicitly selects the
existing local JSON adapter. The local admin editor is available at `/admin.html`
in the development server; normal production builds omit it. To explicitly build
the editor, set `VITE_BUILD_ADMIN=true` when running the Vite build.

On startup the service validates and indexes the bank. Restart the service after
replacing the canonical file. The API never writes or modifies bank content.
Interactive API documentation is available at `/docs` in development.

On Windows, activate `.venv\Scripts\Activate.ps1` and use `python -m pip ...`
and `python -m uvicorn ...` from the repository root.

On Windows, activate `.venv\Scripts\Activate.ps1` and use `python -m pip ...`
and `python -m uvicorn ...` from the repository root.
