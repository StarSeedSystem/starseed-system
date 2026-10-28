"""Almacén privado de objetivos de alcance."""

import os
import json
import hashlib
from datetime import datetime, timedelta
from typing import Any, Dict

HOME = os.path.expanduser("~")
BASE_DIR = os.path.join(HOME, ".starseed", "alcance")

def _now(clock):
    return clock() if callable(clock) else datetime.utcnow()

def _ensure_dir(home: str = HOME):
    d = os.path.join(home, ".starseed", "alcance")
    os.makedirs(d, mode=0o700, exist_ok=True)
    os.chmod(d, 0o700)
    return d

def _file_path(home: str, name: str) -> str:
    d = _ensure_dir(home)
    p = os.path.join(d, name)
    return p

def _load_json(home: str, name: str) -> Dict[str, Any]:
    p = _file_path(home, name)
    if not os.path.exists(p):
        return {}
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_json(home: str, name: str, data: Dict[str, Any]) -> None:
    p = _file_path(home, name)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp, 0o600)
    os.replace(tmp, p)
    os.chmod(p, 0o600)

PROHIBIDOS = [
    "salud", "religión", "creencias", "orientación",
    "política personal", "familia", "ubicación privada", "ingresos", "teléfono personal"
]

def _contiene_prohibido(texto: str) -> bool:
    t = texto.lower()
    return any(p in t for p in PROHIBIDOS)

def validar_objetivo(obj: Dict[str, Any]) -> bool:
    oid = obj.get("id")
    if not isinstance(oid, str) or not oid.startswith("obj-"):
        return False
    t = obj.get("tipo")
    if t not in ("persona", "proyecto", "organizacion"):
        return False
    cat = obj.get("categoria")
    if cat not in ("activista", "desarrollador", "influencer", "proyecto-afin", "fundacion", "otro"):
        return False
    if not isinstance(obj.get("afinidad", 0), int) or obj.get("afinidad", 0) > 300:
        return False
    urls = obj.get("urls_oficiales", [])
    if not all(isinstance(u, str) and u.startswith("https://") for u in urls):
        return False
    canal = obj.get("canal_contacto", {})
    if not canal.get("medio") or not canal.get("valor") or not canal.get("fuente_url"):
        return False
    if not canal["fuente_url"].startswith("https://"):
        return False
    if _contiene_prohibido(str(canal.get("valor", ""))):
        return False
    for k, v in obj.items():
        if isinstance(v, str) and _contiene_prohibido(v):
            return False
    return True

def suprimir(identificador: str, home: str = HOME) -> None:
    h = hashlib.sha256(identificador.encode("utf-8")).hexdigest()
    data = _load_json(home, "supresiones.json")
    lista = set(data.get("hashes", []))
    lista.add(h)
    data["hashes"] = sorted(lista)
    _save_json(home, "supresiones.json", data)

def _hash_valor(v: str) -> str:
    return hashlib.sha256(v.encode("utf-8")).hexdigest()

def _carga_supresiones(home: str) -> set:
    data = _load_json(home, "supresiones.json")
    return set(data.get("hashes", []))

def puede_contactar(obj: Dict[str, Any], registro: Dict[str, Any], ahora: datetime, home: str = HOME, tope_diario: int = 5) -> bool:
    nivel = obj.get("nivel") or "alto"
    if nivel == "alto":
        return False
    canal = obj.get("canal_contacto", {})
    valor = canal.get("valor", "")
    if not valor:
        return False
    if _hash_valor(valor) in _carga_supresiones(home):
        return False
    obj_id = str(obj.get("id") or obj.get("nombre_publico") or "")
    reg = registro.get(obj_id, {})
    if reg.get("rechazo_alex"):
        try:
            d = datetime.fromisoformat(reg["rechazo_alex"])
            if ahora - d < timedelta(days=90):
                return False
        except Exception:
            pass
    if reg.get("no_destinatario"):
        try:
            d = datetime.fromisoformat(reg["no_destinatario"])
            if ahora - d < timedelta(days=180):
                return False
        except Exception:
            pass
    envios_hoy = reg.get("envios_hoy", 0)
    if envios_hoy >= tope_diario:
        return False
    ultimo = reg.get("ultimo_envio")
    if ultimo:
        try:
            d = datetime.fromisoformat(ultimo)
            if ahora - d < timedelta(days=14):
                return False
        except Exception:
            pass
    return True
