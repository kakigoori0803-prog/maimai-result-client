# register_router.py  ← 新規ファイル（maimai-result リポジトリの中）
from fastapi import APIRouter, Header
import os, json, time, secrets

router = APIRouter()

TOKENS_PATH = "/data/mrc_tokens.json"

def _load():
    try:
        with open(TOKENS_PATH, "r") as f:
            return json.load(f)
    except:
        return {}

def _save(d):
    os.makedirs(os.path.dirname(TOKENS_PATH), exist_ok=True)
    with open(TOKENS_PATH, "w") as f:
        json.dump(d, f)

def _issue_token():
    return secrets.token_hex(16)

@router.get("/register")
@router.post("/register")
def register(x_forwarded_for: str | None = Header(default=None)):
    db = _load()
    token = _issue_token()
    db[token] = {"ip": x_forwarded_for, "ts": int(time.time())}
    _save(db)
    return {
        "api_url": "https://maimai-result.onrender.com/ingest",
        "token": token
    }
