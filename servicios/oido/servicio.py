import os
from fastapi import FastAPI, File, UploadFile, Header, HTTPException
from typing import List
from pydantic import BaseModel

app = FastAPI()

class TagsResponse(BaseModel):
    tags: List[str]

# Dummy tagging logic

def _classify_audio(data: bytes) -> List[str]:
    # Real logic would use earshot models, omitted for brevity
    return ["dummy_tag"]

# Authorization handling
TOKEN = os.getenv("STARSEED_OIDO_TOKEN")
EOL = os.getenv("EARSHOT_OFFLINE") == "1"

@app.post("/oir", response_model=TagsResponse)
async def oir(file: UploadFile = File(...), authorization: str | None = Header(None)):
    if not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid media type")
    try:
        data = await file.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    # Enforce size limit 15s ~ ~150 KB maybe; skip for brevity
    if TOKEN and not authorization:
        raise HTTPException(status_code=401, detail="Missing token")
    if TOKEN and not authorization.startswith("Bearer ") or authorization.split()[1] != TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")
    if EOL:
        if not getattr(_classify_audio, "downloaded", False):
            _classify_audio.downloaded = True
        else:
            raise HTTPException(status_code=410, detail="Offline mode active")
    tags = _classify_audio(data)
    return TagsResponse(tags=tags)
