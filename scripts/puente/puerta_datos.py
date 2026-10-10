# -*- coding: utf-8 -*-
"""Despliega, configura y mide la puerta de datos del A1 desde cualquier neurona con la llave SSH.

    python3 scripts/puente/puerta_datos.py desplegar   # paquete → A1, entorno (sin imprimir), servicio, Caddy, medida
    python3 scripts/puente/puerta_datos.py fichas      # crea en el A1 las fichas que falten y las guarda en ~/.starseed/env
    python3 scripts/puente/puerta_datos.py medir       # salud + métricas (+ sonda HTTPS) → ~/.starseed/puerta-datos.json
    python3 scripts/puente/puerta_datos.py estado      # lo mismo en pantalla, sin IPs, URLs ni fichas
    python3 scripts/puente/puerta_datos.py registrar-llave   # huella de la llave de réplica en Supabase (migración aplicada)
    python3 scripts/puente/puerta_datos.py alta-nodos  # da de alta en la puerta la llave del nodo de MetaGenesis de la Mac y del A1

Contrato: architecture/puerta-datos-a1.md. Usa la conexión SSH de `oracle_nodo.py` (OPO1011) sin
cambiarla: misma llave (~/.ssh/starseed_oracle_ed25519), misma IP de ~/.starseed/oracle.json y la
misma regla de tachar todo lo que salga por pantalla. Secretos: solo por nombre de variable; sus
valores viajan por la entrada estándar de SSH y se guardan con chmod 600/640.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import os
import re
import secrets
import subprocess
import sys
import tarfile
import time
import urllib.request

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)
RAIZ = os.path.dirname(os.path.dirname(DIR))
SERVICIO = os.path.join(RAIZ, "servicios", "puerta-datos")

import oracle_nodo as on  # noqa: E402  (solo se USA: ssh, ip, tachar, entorno)

HOME = os.path.expanduser("~")
ESTADO_JSON = os.path.join(HOME, ".starseed", "puerta-datos.json")
ENV_STARSEED = os.path.join(HOME, ".starseed", "env")
DESTINO_A1 = "/opt/starseed/puerta-datos"
NODE_A1 = "/usr/local/bin/node"

#: Fichas de máquina y sus ámbitos (architecture/puerta-datos-a1.md §4.1). En ~/.starseed/env como
#: PUERTA_DATOS_FICHA_<ROL>; en el A1 solo su huella.
FICHAS = {
    "astraura": ("astraura-mac", "malla,astraura"),
    "enjambre": ("enjambre-mac", "bus,latidos"),
    "vigia": ("vigia-mac", "freno,bus"),
    "genesis": ("genesis-mac", "metricas,metagenesis,latidos"),
    "admin": ("admin-mac", "admin"),
}


def ahora_iso():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def host_publico():
    h = on._host_https()
    return ("datos.%s" % h) if h else ""


def _guardar_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)


def poner_en_env(nombre, valor, ruta=ENV_STARSEED):
    """Añade o reemplaza NOMBRE=valor en ~/.starseed/env (600), con copia del anterior. Nunca imprime."""
    lineas = []
    try:
        with open(ruta, encoding="utf-8") as f:
            lineas = f.read().splitlines()
        with open(ruta + ".bak-puerta", "w", encoding="utf-8") as f:
            f.write("\n".join(lineas) + "\n")
        os.chmod(ruta + ".bak-puerta", 0o600)
    except OSError:
        pass
    patron = re.compile(r"^(export\s+)?%s=" % re.escape(nombre))
    lineas = [l for l in lineas if not patron.match(l)]
    lineas.append("%s=%s" % (nombre, valor))
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp-puerta"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\n".join(lineas) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)


def contenido_env_a1(env):
    """PURA. El /etc/starseed/puerta-datos.env del A1 (valores, nunca la clave de servicio)."""
    van = {
        "SUPABASE_URL": env.get("NEXT_PUBLIC_SUPABASE_URL", ""),
        "SUPABASE_ANON_KEY": env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""),
        "PUERTA_LLAVE_REPLICA": env.get("PUERTA_LLAVE_REPLICA", ""),
        "PUERTA_PUERTO": "8791",
        "PUERTA_REPLICA_DIA": "1500",
        "PUERTA_REPLICA_CADA_S": "300",
    }
    for k, v in van.items():
        if "\n" in v or "SERVICE_ROLE" in k:
            raise ValueError("valor no admitido para %s" % k)
    return "".join("%s=%s\n" % (k, v) for k, v in van.items())


def paquete_tgz():
    """El servicio empaquetado (sin pruebas ni nada que no haga falta en el A1)."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for carpeta in ("bin", "src", "deploy"):
            t.add(os.path.join(SERVICIO, carpeta), arcname="starseed-puerta-datos/%s" % carpeta)
        t.add(os.path.join(SERVICIO, "package.json"), arcname="starseed-puerta-datos/package.json")
    return buf.getvalue()


def desplegar():
    if not on._ip():
        return {"ok": False, "motivo": "sin A1 en ~/.starseed/oracle.json"}
    env = on._env_local()
    if not env.get("PUERTA_LLAVE_REPLICA"):
        llave = secrets.token_urlsafe(36)
        poner_en_env("PUERTA_LLAVE_REPLICA", llave)
        env["PUERTA_LLAVE_REPLICA"] = llave
    rc, salida = on._ssh_bytes("rm -rf /tmp/starseed-puerta-datos && mkdir -p /tmp/starseed-puerta-datos && "
                               "tar xzf - -C /tmp && echo subido", paquete_tgz(), timeout=180)
    if rc != 0:
        return {"ok": False, "paso": "subir", "motivo": salida[-300:]}
    rc, salida = on.ssh("umask 077; cat > /tmp/pd-env.$$ && sudo install -o root -g starseed -m 640 /tmp/pd-env.$$ "
                        "/etc/starseed/puerta-datos.env; r=$?; rm -f /tmp/pd-env.$$; exit $r",
                        entrada=contenido_env_a1(env), timeout=60)
    if rc != 0:
        return {"ok": False, "paso": "entorno", "motivo": salida[-300:]}
    rc, salida = on.ssh("sudo bash /tmp/starseed-puerta-datos/deploy/instalar.sh /tmp/starseed-puerta-datos 2>&1 | tail -n 8", timeout=240)
    res = {"ok": rc == 0, "paso": "instalar", "registro": salida.strip().splitlines()[-8:]}
    if rc == 0:
        res["fichas"] = fichas()
        time.sleep(3)
        res["medida"] = medir()
    return res


def fichas():
    """Crea en el A1 las fichas que esta neurona aún no tiene y las guarda en ~/.starseed/env."""
    env = on._env_local()
    hechas, ya = [], []
    for rol, (nombre, ambitos) in FICHAS.items():
        var = "PUERTA_DATOS_FICHA_%s" % rol.upper()
        if env.get(var, "").startswith("pd_"):
            ya.append(rol)
            continue
        rc, salida = on.ssh("sudo env PUERTA_FICHAS=/etc/starseed/puerta-datos/tokens.json %s --disable-warning=ExperimentalWarning "
                            "%s/bin/puerta-datos.mjs ficha nueva %s %s --imprimir" % (NODE_A1, DESTINO_A1, nombre, ambitos), timeout=60)
        ficha = (salida or "").strip().splitlines()[-1:] or [""]
        if rc == 0 and re.match(r"^pd_[A-Za-z0-9_-]{40,60}$", ficha[0]):
            poner_en_env(var, ficha[0])
            hechas.append(rol)
    host = host_publico()
    if host:
        poner_en_env("PUERTA_DATOS_URL", "https://%s" % host)
    # La ficha que acaba de crearse sirve al momento: el servicio relee tokens.json cada 30 s.
    return {"creadas": hechas, "ya_estaban": ya}


def _sonda_https():
    """¿Responde la puerta por HTTPS desde aquí? (ok, ms). Nunca enseña la URL."""
    host = host_publico()
    if not host:
        return {"ok": False, "motivo": "sin nombre público"}
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request("https://%s/salud" % host, headers={"User-Agent": "starseed-puerta/1"}), timeout=15) as r:
            j = json.loads(r.read().decode("utf-8", "replace") or "{}")
            return {"ok": r.status == 200 and j.get("ok") is True, "ms": int((time.time() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "ms": int((time.time() - t0) * 1000), "motivo": on.tachar(type(e).__name__)}


def medir(guardar=True):
    """Salud y métricas del A1 (por SSH, sin red pública) + sonda HTTPS → puerta-datos.json."""
    datos = {"version": 1, "comprobado": ahora_iso(), "ok": False}
    if not on._ip():
        datos["motivo"] = "sin A1 en ~/.starseed/oracle.json"
    else:
        rc, salida = on.ssh("curl -s -m 5 http://127.0.0.1:8791/salud; echo; sudo -u starseed env PUERTA_DIR=/var/lib/starseed/puerta-datos "
                            "%s --disable-warning=ExperimentalWarning %s/bin/puerta-datos.mjs metricas; echo; "
                            "systemctl is-active starseed-puerta-datos" % (NODE_A1, DESTINO_A1), timeout=60)
        lineas = [l for l in (salida or "").splitlines() if l.strip()]
        try:
            datos["salud"] = json.loads(lineas[0])
        except (IndexError, ValueError):
            datos["salud"] = None
        try:
            m = json.loads(lineas[1])
            datos["hoy"] = m.get("hoy")
            datos["historial"] = m.get("historial")
            datos["presencia"] = m.get("presencia")
        except (IndexError, ValueError):
            pass
        datos["replica"] = (datos.get("salud") or {}).get("replica")
        datos["servicio"] = lineas[-1].strip() if lineas else "desconocido"
        datos["https"] = _sonda_https()
        datos["ok"] = bool(datos.get("salud") and datos["salud"].get("ok") and datos["https"].get("ok"))
        if not datos["ok"]:
            datos["motivo"] = ("el servicio no responde" if not datos.get("salud") else
                               "la puerta responde dentro del A1 pero no por HTTPS" if not datos["https"].get("ok") else "")
    env = on._env_local()
    datos["fichas"] = sorted(r for r in FICHAS if env.get("PUERTA_DATOS_FICHA_%s" % r.upper(), "").startswith("pd_"))
    datos = json.loads(on.tachar(json.dumps(datos, ensure_ascii=False)))
    if guardar:
        _guardar_json(ESTADO_JSON, datos)
    return datos


def registrar_llave():
    """Registra en Supabase la HUELLA de la llave de réplica (necesita la migración aplicada)."""
    env = on._env_local()
    llave = env.get("PUERTA_LLAVE_REPLICA", "")
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    servicio = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not (llave and url and servicio):
        return {"ok": False, "motivo": "faltan PUERTA_LLAVE_REPLICA, la URL o la clave de servicio en esta neurona"}
    cuerpo = json.dumps({"_nombre": "puerta-a1", "_huella": hashlib.sha256(llave.encode()).hexdigest()}).encode()
    req = urllib.request.Request("%s/rest/v1/rpc/puerta_datos_registrar_llave" % url, data=cuerpo, method="POST",
                                 headers={"apikey": servicio, "Authorization": "Bearer " + servicio,
                                          "Content-Type": "application/json", "User-Agent": "starseed-puerta/1"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return {"ok": r.status == 200}
    except Exception as e:  # noqa: BLE001
        codigo = getattr(e, "code", None)
        return {"ok": False, "motivo": "la migración aún no está aplicada" if codigo == 404 else on.tachar("%s %s" % (type(e).__name__, codigo or ""))}


_RE_LLAVE_NODO = re.compile(r"Nodo ([a-z0-9-]{3,40}) · huella de su llave: ([0-9a-f]{64})")


def _llave_de_nodo(salida):
    """PURA. (nodo, huella) de la salida de `nodo_metagenesis.py llave`, o None."""
    m = _RE_LLAVE_NODO.search(salida or "")
    return (m.group(1), m.group(2)) if m else None


def _medio_de_nodo(nodo):
    return "oracle-a1" if nodo.startswith("oracle-a1-") else nodo.rsplit("-", 1)[0]


def alta_nodos():
    """(PDA1011) Da de alta en la puerta (ficha admin, `POST /v1/admin/nodos`) la llave del nodo de
    MetaGenesis de esta Mac y la del A1. Solo viaja la HUELLA; cada llave se crea donde vive si falta."""
    env = on._env_local()
    url, ficha = env.get("PUERTA_DATOS_URL", "").rstrip("/"), env.get("PUERTA_DATOS_FICHA_ADMIN", "")
    if not url.startswith("https://") or not ficha.startswith("pd_"):
        return {"ok": False, "motivo": "faltan PUERTA_DATOS_URL o PUERTA_DATOS_FICHA_ADMIN en ~/.starseed/env"}
    nodos = []
    r = subprocess.run([sys.executable, os.path.join(DIR, "nodo_metagenesis.py"), "llave"], capture_output=True,
                       text=True, timeout=60)
    mac = _llave_de_nodo(r.stdout)
    if mac:
        nodos.append(mac)
    a1 = None
    if on._ip():
        _, salida = on.ssh("sudo -u starseed -H python3 /opt/starseed/nodo/metagenesis/nodo_metagenesis.py llave", timeout=60)
        a1 = _llave_de_nodo(salida)
        if a1:
            nodos.append(a1)
    hechos = []
    for nodo, huella in nodos:
        cuerpo = json.dumps({"nodo": nodo, "medio": _medio_de_nodo(nodo), "huella": huella}).encode()
        req = urllib.request.Request(url + "/v1/admin/nodos", data=cuerpo, method="POST",
                                     headers={"Authorization": "Bearer " + ficha, "Content-Type": "application/json",
                                              "User-Agent": "starseed-puerta/1"})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                hechos.append({"nodo": nodo, "ok": resp.status == 200})
        except Exception as e:  # noqa: BLE001
            hechos.append({"nodo": nodo, "ok": False, "motivo": on.tachar("%s %s" % (type(e).__name__, getattr(e, "code", "")))})
    return {"ok": bool(hechos) and all(h["ok"] for h in hechos), "nodos": hechos,
            "mac": bool(mac), "a1": bool(a1)}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("orden", choices=["desplegar", "fichas", "medir", "estado", "registrar-llave", "alta-nodos"])
    a = p.parse_args(argv)
    if a.orden == "desplegar":
        r = desplegar()
    elif a.orden == "fichas":
        r = fichas()
    elif a.orden == "medir":
        r = medir()
    elif a.orden == "estado":
        r = medir(guardar=False)
    elif a.orden == "alta-nodos":
        r = alta_nodos()
    else:
        r = registrar_llave()
    print(on.tachar(json.dumps(r, ensure_ascii=False, indent=1)))
    return 0 if r.get("ok", True) else 1


if __name__ == "__main__":
    sys.exit(main())
