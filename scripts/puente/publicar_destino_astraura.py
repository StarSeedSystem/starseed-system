# -*- coding: utf-8 -*-
"""Publica en Supabase el servidor FIJO del registro (Oracle Always Free) como destino de la nube.

Contrato `architecture/oracle-nube.md` §4 y §6: un servidor de
`servidores-astraura.json` marcado con `destino: true` cuya última sonda fue ok se
publica en `astraura_state.destino_fijo` (como hoy `tunel_publico`, con su lista
blanca de hosts) y `destinoNube()` lo prueba justo después de `ASTRAURA_CLOUD_URL`
y antes del túnel de la Mac. Si ya no hay ninguno sano, la fila se BORRA para que
el OS vuelva al túnel. Cambiar de la Mac a Oracle es configuración, no código.

Solo acepta https en `*.trycloudflare.com`, `*.sslip.io` o los hosts de
`ASTRAURA_TUNEL_HOSTS`, sin usuario, ruta, consulta ni fragmento. Nunca imprime
claves ni OCIDs.
"""
import datetime as dt
import json
import os
import socket
import sys
import urllib.parse
import urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
REGISTRO = os.environ.get("STARSEED_REGISTRO_SERVIDORES") or os.path.join(
    RAIZ, "starseed_memory_root", "mando", "servidores-astraura.json")
CONFIG = os.path.expanduser("~/.astraura/supabase_astraura.json")
ESTADO = os.path.expanduser("~/.starseed/destino-astraura.json")
CLAVE = "destino_fijo"
LATIDO_S = 30 * 60


def url_valida(url) -> bool:
    """PURA: solo https, host de túnel / sslip.io / ASTRAURA_TUNEL_HOSTS, sin usuario,
    ruta, consulta ni fragmento (la misma lista blanca que `destino-nube.ts`)."""
    try:
        p = urllib.parse.urlparse(str(url or ""))
    except ValueError:
        return False
    extra = [h.strip().lower() for h in (os.environ.get("ASTRAURA_TUNEL_HOSTS") or "").split(",") if h.strip()]
    host = (p.hostname or "").lower()
    if p.scheme != "https" or not host or p.username or p.password:
        return False
    if p.path.strip("/") or p.query or p.fragment:
        return False
    return host.endswith(".trycloudflare.com") or host.endswith(".sslip.io") or host in extra


def servidor_destino(servidores):
    """PURA: la URL del servidor marcado `destino: true` con la última sonda ok, o "".

    `servidores` es la lista del registro (cada entrada con `url`, `destino` y
    `ultimaSonda: {ok, t, ...}`); se ignora lo que no sea un servidor registrado.
    """
    for s in servidores if isinstance(servidores, list) else []:
        if not isinstance(s, dict) or s.get("destino") is not True:
            continue
        sonda = s.get("ultimaSonda")
        if isinstance(sonda, dict) and sonda.get("ok") is True and url_valida(s.get("url")):
            return str(s["url"]).rstrip("/")
    return ""


def decidir(url, previo, ahora, latido_s=LATIDO_S):
    """PURA: ("publicar" | "quitar" | "nada", motivo). Sin servidor sano se quita la
    fila para volver al túnel; con servidor, se publica si cambió o como latido."""
    previo = previo if isinstance(previo, dict) else {}
    anterior = (previo.get("url") or "").rstrip("/")
    if not url:
        if anterior:
            return "quitar", "ya no hay servidor fijo sano"
        return "nada", "sin servidor fijo sano y nada publicado"
    if anterior != url:
        return "publicar", "destino nuevo"
    if ahora - float(previo.get("t") or 0) >= latido_s:
        return "publicar", "latido"
    return "nada", "sin cambios"


def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _credenciales():
    cfg = _leer(CONFIG)
    return (cfg.get("supabase_url") or "").rstrip("/"), cfg.get("service_role_key") or ""


def publicar(url) -> bool:
    base, clave = _credenciales()
    if not base or not clave:
        return False
    ahora = dt.datetime.now(dt.timezone.utc).isoformat()
    fila = {"key": CLAVE, "data": {"url": url, "maquina": socket.gethostname().split(".")[0],
                                   "publicado": ahora}, "updated_at": ahora}
    req = urllib.request.Request(
        base + "/rest/v1/astraura_state?on_conflict=key", json.dumps(fila).encode(),
        {"apikey": clave, "Authorization": "Bearer " + clave, "Content-Type": "application/json",
         "Prefer": "resolution=merge-duplicates,return=minimal"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except OSError:
        return False


def quitar() -> bool:
    """Borra la fila `destino_fijo`: sin servidor sano, el OS vuelve al túnel."""
    base, clave = _credenciales()
    if not base or not clave:
        return False
    req = urllib.request.Request(
        base + "/rest/v1/astraura_state?key=eq." + CLAVE, method="DELETE",
        headers={"apikey": clave, "Authorization": "Bearer " + clave, "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except OSError:
        return False


def main() -> int:
    import time
    registro = _leer(REGISTRO)
    servidores = registro.get("servidores") if isinstance(registro, dict) else registro
    url = servidor_destino(servidores)
    previo = _leer(ESTADO)
    accion, motivo = decidir(url, previo, time.time())
    hecho = publicar(url) if accion == "publicar" else (quitar() if accion == "quitar" else True)
    if accion != "nada" and hecho:
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        with open(ESTADO, "w", encoding="utf-8") as f:
            json.dump({"url": url, "t": time.time()}, f)
        os.chmod(ESTADO, 0o600)
        print("destino fijo %s (%s)" % ("publicado" if accion == "publicar" else "retirado", motivo))
    elif accion == "nada":
        print("no toco: %s" % motivo)
    else:
        print("Supabase no respondió: %s" % motivo)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
