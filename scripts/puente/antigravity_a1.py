#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Antigravity CLI (`agy`) sin pantalla en el A1 (GEM1119E).

Deja el trabajo largo de los directores fuera de la Mac: instala y prueba el
CLI oficial de Antigravity en el A1 (Linux ARM64, usuario, sin root) y elige
máquina para el reparto de GEM1119C. La sesión de Google la abre Alex UNA vez
por SSH; nadie más pega códigos ni contraseñas. Sin secretos en este archivo.
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import time

URL_INSTALADOR = "https://antigravity.google/cli/install.sh"
AGY_REMOTO = "~/.local/bin/agy"
RUTA_PRUEBAS = os.path.expanduser("~/.starseed/antigravity-a1-pruebas.json")
PROMPT_CORTO = "Responde solo: OK"

PISTAS = {
    "tiempo": ("tiempo agotado", "timed out", "timeout"),
    "sin_agy": ("command not found", "agy: not found", "no such file or directory: agy",
                "no se encontró agy"),
    "red": ("could not resolve", "temporary failure in name resolution",
            "network is unreachable", "connection refused", "connection reset",
            "failed to connect", "no route to host"),
    "cuota": ("quota", "cuota", "rate limit", "ratelimit", "resource exhausted",
              "too many requests", "429", "402", "insufficient", "credit", "billing",
              "limit exceeded"),
    "sin_sesion": ("not logged in", "login required", "please log in", "unauthorized",
                   "unauthenticated", "session expired", "no session", "invalid api key",
                   "permission denied", "authentication"),
}


# ── lógica pura ───────────────────────────────────────────────────────────────

def normalizar_arquitectura(uname_m: str) -> str:
    """PURA. `aarch64`/`arm64` → `arm64`; `x86_64`/`amd64` → `x86_64`."""
    t = str(uname_m or "").strip().lower()
    if t in ("aarch64", "arm64", "armv8", "armv8l"):
        return "arm64"
    if t in ("x86_64", "amd64"):
        return "x86_64"
    return t or "desconocida"


def _lista(estado, exige_alcanzable: bool = False) -> bool:
    """PURA. Una máquina sirve si tiene agy y sesión; el A1 además debe ser alcanzable."""
    if not isinstance(estado, dict):
        return False
    if exige_alcanzable and not estado.get("alcanzable"):
        return False
    return bool(estado.get("agy")) and bool(estado.get("sesion"))


def elegir_maquina(estado_a1, estado_mac) -> dict:
    """PURA. Reparto GEM1119C: A1 vivo primero; si no, la Mac; si no, nada."""
    if _lista(estado_a1, exige_alcanzable=True):
        return {"maquina": "agy-A1",
                "motivo": "el A1 está vivo y con sesión de Google: el trabajo largo no carga la Mac"}
    a1 = estado_a1 if isinstance(estado_a1, dict) else {}
    mac = estado_mac if isinstance(estado_mac, dict) else {}
    if _lista(mac):
        causa = "no está alcanzable" if not a1.get("alcanzable") else "no tiene sesión"
        if not a1.get("agy"):
            causa = "no tiene agy instalado"
        return {"maquina": "agy-Mac", "motivo": "el A1 %s: se usa la Mac" % causa}
    return {"maquina": None,
            "motivo": "ni el A1 ni la Mac tienen agy con sesión: instalar o iniciar sesión"}


def leer_error(salida, rc: int = 0) -> dict:
    """PURA. Clasifica la salida de `agy`: ok · sin_agy · sin_sesion · cuota · red · tiempo · otro."""
    texto = str(salida or "").strip()
    if not texto:
        return {"clase": "otro", "detalle": "agy no devolvió nada"}
    bajo = texto.lower()
    corto = len(texto) < 600
    sospechoso = corto and any(p in bajo for grupo in PISTAS.values() for p in grupo)
    if rc == 0 and not sospechoso:
        return {"clase": "ok", "detalle": ""}
    for clase in ("tiempo", "sin_agy", "red", "cuota", "sin_sesion"):
        if any(p in bajo for p in PISTAS[clase]):
            return {"clase": clase, "detalle": texto[:300]}
    if rc != 0:
        return {"clase": "otro", "detalle": "agy salió con código %s: %s" % (rc, texto[:300])}
    return {"clase": "ok", "detalle": ""}


def verificar_fuente_oficial(texto: str, arquitectura: str = "arm64") -> dict:
    """PURA. Comprueba que el instalador es el oficial, trae ARM64 y no pide root."""
    t = str(texto or "")
    bajo = t.lower()
    if not t.strip():
        return {"ok": False, "motivo": "el instalador oficial llegó vacío"}
    if "antigravity" not in bajo:
        return {"ok": False, "motivo": "el contenido no parece el instalador oficial de Antigravity"}
    if arquitectura == "arm64" and not any(p in bajo for p in ("aarch64", "arm64")):
        return {"ok": False, "motivo": "el instalador no declara Linux ARM64"}
    if ".local/bin" not in t:
        return {"ok": False, "motivo": "el instalador no usa ~/.local/bin (usuario, sin root)"}
    return {"ok": True, "motivo": "instalador oficial con Linux ARM64 y destino de usuario"}


def _json_en_texto(texto):
    """PURA. Primer objeto JSON del texto, aunque vengan líneas de stderr delante."""
    crudo = str(texto or "").strip()
    try:
        datos = json.loads(crudo)
        return datos if isinstance(datos, dict) else None
    except (TypeError, ValueError):
        pass
    inicio = crudo.find("{")
    if inicio < 0:
        return None
    try:
        datos, _ = json.JSONDecoder().raw_decode(crudo[inicio:])
        return datos if isinstance(datos, dict) else None
    except ValueError:
        return None


def parsear_tokens(salida) -> dict:
    """PURA. Tokens de entrada/salida del JSON de `agy` (o ceros si no hay)."""
    datos = _json_en_texto(salida)
    uso = datos.get("usage") if isinstance(datos, dict) else None
    uso = uso if isinstance(uso, dict) else {}

    def entero(*claves):
        for clave in claves:
            valor = uso.get(clave)
            if isinstance(valor, (int, float)):
                return int(valor)
        return 0

    return {"entrada": entero("input_tokens", "prompt_tokens"),
            "salida": entero("output_tokens", "completion_tokens")}


def interpretar_sonda(salida, rc: int = 0) -> dict:
    """PURA. Lee la sonda del A1: arquitectura, agy, versión, sesión y control remoto."""
    if rc != 0 or not str(salida or "").strip():
        return {"alcanzable": False, "detalle": str(salida or "").strip()[:300]}
    lineas = [l.strip() for l in str(salida or "").splitlines() if l.strip()]
    datos = {"alcanzable": True, "arquitectura": "desconocida", "agy": False,
             "version": "", "sesion": False, "control_remoto": False}
    for linea in lineas:
        arq = normalizar_arquitectura(linea)
        if arq in ("arm64", "x86_64"):
            datos["arquitectura"] = arq
            break
    for linea in lineas:
        if linea.startswith("AGY="):
            datos["agy"] = linea.split("=", 1)[1] == "si"
        elif linea.startswith("VERSION="):
            datos["version"] = linea.split("=", 1)[1]
        elif linea.startswith("SESION="):
            datos["sesion"] = linea.split("=", 1)[1] == "si"
        elif linea.startswith("REMOTE="):
            datos["control_remoto"] = linea.split("=", 1)[1] == "si"
    return datos


# ── E/S (solo en los comandos; las pruebas no la tocan) ───────────────────────

SONDA = (
    "uname -m; "
    "if command -v agy >/dev/null 2>&1; then echo AGY=si; "
    "agy --version 2>/dev/null | head -1 | sed 's/^/VERSION=/'; else echo AGY=no; fi; "
    # DIR1121G (2026-11-21, medido): la sesión se comprueba USANDO agy (¿lista modelos?), no buscando archivos con nombre
    # de credencial: en macOS la sesión vive en el llavero y la búsqueda decía «sin sesión» con la sesión activa.
    "if perl -e 'alarm 60; exec @ARGV' agy models </dev/null 2>/dev/null "
    "| grep -Eq '^[a-z0-9][a-z0-9.-]*-(low|medium|high|xhigh)([[:space:]]|$)'; "
    "then echo SESION=si; else echo SESION=no; fi; "
    "if agy remote-control --help >/dev/null 2>&1; then echo REMOTE=si; else echo REMOTE=no; fi"
)


def _ssh(orden: str, timeout: int = 240):
    """Ejecuta como el usuario `starseed` del A1; la IP nunca se imprime.

    El SSH entra como `ubuntu`; el nodo trabaja como `starseed`, así que todo
    pasa por `sudo -u starseed -H` (HOME correcto y sin root).
    """
    try:
        import oracle_nodo
    except Exception as e:  # noqa: BLE001
        return 2, "no se pudo cargar el canal ssh del puente: %s" % e
    return oracle_nodo.ssh("sudo -u starseed -H sh -c %s" % shlex.quote(orden),
                           timeout=timeout)


def _ejecutar(orden: str, local: bool, timeout: int = 240):
    """(rc, salida). En el A1 por ssh; aquí por subprocess. stdin cerrado siempre."""
    if not local:
        return _ssh(orden, timeout=timeout)
    try:
        r = subprocess.run(orden, shell=True, capture_output=True, text=True, timeout=timeout,
                           stdin=subprocess.DEVNULL)
        return r.returncode, ((r.stdout or "") + (r.stderr or "")).strip()
    except subprocess.TimeoutExpired:
        return 124, "tiempo agotado"
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def _leer_prueba() -> dict:
    try:
        with open(RUTA_PRUEBAS, encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else {}
    except (OSError, ValueError):
        return {}


def _guardar_prueba(datos: dict) -> None:
    try:
        os.makedirs(os.path.dirname(RUTA_PRUEBAS), exist_ok=True)
        tmp = RUTA_PRUEBAS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, RUTA_PRUEBAS)
    except OSError:
        pass


def _marcar_sesion(sonda: dict) -> dict:
    """Si la última prueba del A1 salió bien, la sesión de Google está confirmada."""
    if sonda.get("sesion"):
        return sonda
    ultima = _leer_prueba()
    if ultima.get("clase") == "ok" and ultima.get("maquina") == "agy-A1":
        sonda = dict(sonda)
        sonda["sesion"] = True
        sonda["sesion_confirmada"] = True
    return sonda


def _opcion(args, nombre: str, defecto: str = "") -> str:
    for i, a in enumerate(args):
        if a == nombre and i + 1 < len(args):
            return args[i + 1]
        if a.startswith(nombre + "="):
            return a.split("=", 1)[1]
    return defecto


def orden_login() -> str:
    """Orden exacta para Alex: saca la IP de oracle.json sin imprimirla nunca."""
    sacar_ip = ("python3 -c \"import json,os;d=json.load(open(os.path.expanduser("
                "'~/.starseed/oracle.json')));print([i['ip_publica'] for i in "
                "d.get('instancias',[]) if 'a1' in str(i.get('nombre','')).lower()][0])\"")
    return ("ssh -i ~/.ssh/starseed_oracle_ed25519 ubuntu@$(%s) "
            "\"sudo -u starseed -H sh -c '%s login'\"" % (sacar_ip, AGY_REMOTO))


def _estado_maquina(local: bool) -> dict:
    rc, salida = _ejecutar(SONDA, local, timeout=90 if local else 60)
    return interpretar_sonda(salida, rc)


def _elegir_auto() -> dict:
    a1 = _marcar_sesion(_estado_maquina(local=False))
    mac = _estado_maquina(local=True)
    return elegir_maquina(a1, mac)


def _ultima_prueba() -> str:
    d = _leer_prueba()
    if not d:
        return "sin pruebas todavía"
    return "%s en %s: %s (%.1f s, tokens %s/%s)" % (
        d.get("maquina"), d.get("cuando"), d.get("clase"), float(d.get("segundos") or 0),
        d.get("tokens_entrada"), d.get("tokens_salida"))


def cmd_estado(args) -> int:
    local = "--local" in args
    sonda = _estado_maquina(local)
    if not local:
        sonda = _marcar_sesion(sonda)
    etiqueta = "Máquina local" if local else "A1"
    print("%s: %s" % (etiqueta, "alcanzable" if sonda["alcanzable"] else "no alcanzable"))
    if not sonda["alcanzable"]:
        print("  detalle: %s" % sonda.get("detalle", ""))
    else:
        print("  arquitectura: %s" % sonda["arquitectura"])
        print("  agy: %s%s" % ("instalado" if sonda["agy"] else "no instalado",
                               (" · " + sonda["version"]) if sonda["version"] else ""))
        print("  sesión de Google: %s" % ("detectada" if sonda["sesion"] else "no detectada"))
        print("  control remoto (agy remote-control): %s"
              % ("disponible" if sonda["control_remoto"] else "no disponible"))
    if local:
        a1, mac = sonda, {}
    else:
        a1, mac = sonda, _estado_maquina(local=True)
    eleccion = elegir_maquina(a1, mac)
    print("Reparto GEM1119C: %s" % (eleccion["maquina"] or "sin motor"))
    print("  %s" % eleccion["motivo"])
    print("Última prueba: %s" % _ultima_prueba())
    if sonda["alcanzable"] and not sonda["sesion"]:
        print("\nTe toca a ti (una sola vez; nadie más pega códigos):")
        print("  " + ("~/.local/bin/agy login" if local else orden_login()))
    return 0 if sonda["alcanzable"] else 1


def cmd_instalar(args) -> int:
    seco = "--seco" in args
    local = "--local" in args
    rc, crudo = _ejecutar("uname -m", local, timeout=30)
    if rc != 0:
        print("No se pudo preguntar la arquitectura del A1: %s" % crudo[:300])
        return 1
    arq = normalizar_arquitectura(crudo)
    print("Arquitectura de la máquina: %s (%s)" % (arq, crudo.strip()))
    if arq != "arm64":
        print("El A1 debe ser Linux ARM64; esta arquitectura no es la esperada.")
        return 1
    rc, curl = _ejecutar("command -v curl", local, timeout=30)
    if rc != 0:
        print("Falta curl en el A1. Instalarlo pide root: eso lo decide Alex.")
        return 1
    rc, instalador = _ejecutar("curl -fsSL %s" % URL_INSTALADOR, local, timeout=120)
    if rc != 0:
        print("No se pudo leer el instalador oficial: %s" % instalador[:300])
        return 1
    veredicto = verificar_fuente_oficial(instalador, arq)
    print("Fuente oficial: %s" % veredicto["motivo"])
    if not veredicto["ok"]:
        return 1
    if seco:
        print("Seco: instalaría con el instalador oficial en ~/.local/bin (usuario, sin root).")
        print("No se ha ejecutado nada.")
        return 0
    print("Instalando en el usuario del A1 (sin root)…")
    rc, salida = _ejecutar("curl -fsSL %s | bash" % URL_INSTALADOR, local, timeout=600)
    print(salida[-2000:])
    if rc != 0:
        print("El instalador falló (código %s)." % rc)
        return 1
    rc, version = _ejecutar("%s --version" % AGY_REMOTO, local, timeout=60)
    print("agy: %s" % (version.strip() or "instalado, sin versión legible"))
    if rc == 0:
        print("\nFalta la sesión de Google. Te toca a ti (una sola vez):")
        print("  " + ("~/.local/bin/agy login" if local else orden_login()))
    return 0 if rc == 0 else 1


def cmd_probar(args) -> int:
    maquina = _opcion(args, "--maquina", "auto")
    if "--local" in args and maquina == "auto":
        maquina = "mac"
    if maquina == "auto":
        eleccion = _elegir_auto()
        print("Reparto: %s (%s)" % (eleccion["maquina"] or "sin motor", eleccion["motivo"]))
        if eleccion["maquina"] is None:
            return 1
        maquina = "a1" if eleccion["maquina"] == "agy-A1" else "mac"
    if maquina not in ("a1", "mac"):
        print("Máquina desconocida: %s (usa a1, mac o auto)" % maquina, file=sys.stderr)
        return 2
    local = maquina == "mac"
    etiqueta = "agy-Mac" if local else "agy-A1"
    agy = "agy" if local else AGY_REMOTO
    orden = ("%s -p %s --mode plan --disable-slash-commands --print-timeout 180s "
             "--output-format json" % (agy, shlex.quote(PROMPT_CORTO)))
    inicio = time.perf_counter()
    rc, salida = _ejecutar(orden, local, timeout=200)
    segundos = time.perf_counter() - inicio
    error = leer_error(salida, rc)
    tokens = parsear_tokens(salida)
    resultado = {"maquina": etiqueta, "segundos": round(segundos, 2),
                 "tokens_entrada": tokens["entrada"], "tokens_salida": tokens["salida"],
                 "clase": error["clase"], "detalle": error["detalle"],
                 "cuando": time.strftime("%Y-%m-%d %H:%M:%S")}
    _guardar_prueba(resultado)
    print("%s: %s en %.1f s · tokens %s/%s"
          % (etiqueta, error["clase"], segundos, tokens["entrada"], tokens["salida"]))
    if error["clase"] != "ok":
        print("  detalle: %s" % error["detalle"])
        if error["clase"] == "sin_sesion":
            print("  Te toca a ti: " + orden_login())
    return 0 if error["clase"] == "ok" else 1


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        print((__doc__ or "").strip())
        print("\nUso: antigravity_a1.py <estado|instalar|probar> [--seco] [--local] "
              "[--maquina a1|mac|auto]")
        return 0
    cmd, args = argv[0], argv[1:]
    if cmd == "estado":
        return cmd_estado(args)
    if cmd == "instalar":
        return cmd_instalar(args)
    if cmd == "probar":
        return cmd_probar(args)
    print("Comando desconocido: %s" % cmd, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
