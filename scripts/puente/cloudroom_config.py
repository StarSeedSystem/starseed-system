#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Configuración y activación de Cloudroom (CAP1119): lee `config/cloudroom-pi-modelos.json`, dice
qué falta (app, sesión, claves) y aplica `scripts/cloudroom/setup-nube.sh` con `room-cli cloud setup
set`. Nunca escribe valores de claves: solo nombres de variable. Pruebas en `test_cloudroom_config.py`."""
from __future__ import annotations

import json
import os
import subprocess
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
RUTA_MODELOS = os.path.join(RAIZ, "config", "cloudroom-pi-modelos.json")
RUTA_SETUP = os.path.join(RAIZ, "scripts", "cloudroom", "setup-nube.sh")
TOPE_CLI_S = 60
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
import cloudroom_modelos as CM  # noqa: E402
import medio_cloudroom  # noqa: E402


def _dict(valor):
    return valor if isinstance(valor, dict) else {}


def proveedor(modelo):
    """PURA: «nvidia» de «nvidia/z-ai/glm-5.3»; "" si el modelo no lleva prefijo de proveedor."""
    texto = str(modelo or "")
    return texto.split("/", 1)[0].strip().lower() if "/" in texto else ""


def leer_config(ruta=None):
    """PURA salvo el disco: modelos, NOMBRES de claves y topes del JSON de Pi (vacío si no se lee)."""
    try:
        with open(ruta or RUTA_MODELOS, encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError):
        datos = {}
    datos = _dict(datos)
    claves, topes = _dict(datos.get("claves")), _dict(datos.get("simultaneos"))
    modelos = datos.get("modelos")
    modelos = modelos if isinstance(modelos, list) else []
    return {"modelos": [m.strip() for m in modelos if isinstance(m, str) and m.strip()],
            "claves": {str(k).lower(): v.strip() for k, v in claves.items() if isinstance(v, str) and v.strip()},
            "simultaneos": {str(k).lower(): v for k, v in topes.items()
                            if isinstance(v, int) and not isinstance(v, bool) and v >= 0}}


def claves_requeridas(config):
    """PURA: NOMBRES de variable que piden los proveedores de los modelos declarados, sin repetir."""
    claves = _dict((config or {}).get("claves"))
    return sorted({claves[p] for p in map(proveedor, (config or {}).get("modelos") or []) if p in claves})


def claves_faltantes(config, nombres):
    """PURA: requeridas que no están en la nube. `nombres=None` (no se pudo leer) → []: mejor probar."""
    return [] if nombres is None else [n for n in claves_requeridas(config) if n not in nombres]


def modelos_disponibles(config, nombres):
    """PURA: modelos cuyo proveedor tiene su clave en la nube (o no pide una clave conocida)."""
    claves = _dict((config or {}).get("claves"))
    return [m for m in (config or {}).get("modelos") or []
            if nombres is None or not claves.get(proveedor(m)) or claves[proveedor(m)] in nombres]


def instrucciones(cli, config, nombres):
    """PURA: comandos exactos para que Alex ponga las claves que faltan (el valor lo teclea él)."""
    return ["%s cloud env set %s" % (cli or "room-cli", n) for n in claves_faltantes(config, nombres)]


def diagnostico(local, nube, nombres, config, hilos=None, errores=(), cli="room-cli") -> dict:
    """PURA: estado de Cloudroom y lo que falta para que la nube abra hilos de verdad."""
    m = medio_cloudroom.interpretar(local, nube, hilos, errores)
    faltan, modelos = claves_faltantes(config, nombres), modelos_disponibles(config, nombres)
    salida = dict(m, sesion=m["estado"] == "usable", claves_faltantes=faltan, modelos=modelos)
    if m["estado"] != "usable":
        return salida
    if faltan:
        return dict(salida, estado="requiere_alex",
                    detalle="faltan claves en la nube de Cloudroom: " + ", ".join(faltan),
                    siguiente_paso="; ".join(instrucciones(cli, config, nombres)))
    detalle = "%s · %d modelo(s) de Pi con clave" % (m["detalle"], len(modelos)) if modelos else m["detalle"]
    return dict(salida, estado="listo", detalle=detalle)


def aplicar_setup(run=subprocess.run, cli=None, ruta=None, seco=False):
    """Aplica la configuración de Pi en la nube (`room-cli cloud setup set`). Devuelve el parte."""
    cli = cli or medio_cloudroom.cli_path()
    orden = [cli, "cloud", "setup", "set"]
    try:
        with open(ruta or RUTA_SETUP, encoding="utf-8") as f:
            texto = f.read()
    except OSError:
        texto = ""
    res = {"aplicado": False, "comando": orden, "motivo": "", "salida": ""}
    if not cli:
        res["motivo"] = "app sin instalar"
    elif not texto:
        res["motivo"] = "no encontré %s" % (ruta or RUTA_SETUP)
    elif seco:
        res["motivo"] = "en seco: no se aplicó"
    else:
        try:
            p = run(orden, input=texto, capture_output=True, text=True, timeout=TOPE_CLI_S)
        except (OSError, subprocess.SubprocessError) as e:
            res["motivo"] = type(e).__name__
            return res
        res["salida"] = ((p.stdout or "") + (p.stderr or "")).strip()[-400:]
        res["aplicado"] = p.returncode == 0
        res["motivo"] = "configuración aplicada" if res["aplicado"] else (res["salida"] or "salió con %s" % p.returncode)
    return res


def _json_cli(run, cli, args, timeout=TOPE_CLI_S):
    try:
        p = run([cli, *args, "--json"], capture_output=True, text=True, timeout=timeout)
        if p.returncode:
            return None, ((p.stderr or p.stdout or "").strip().splitlines() or ["salió con %s" % p.returncode])[-1][:200]
        return json.loads(p.stdout or "null"), ""
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        return None, type(e).__name__


def leer_estado(run=subprocess.run, cli=None, ruta=None):
    """Sondea la app, la cuenta, los hilos y las claves de la nube; devuelve (diagnóstico, config)."""
    cli, config = cli or medio_cloudroom.cli_path(), leer_config(ruta)
    if not cli:
        return diagnostico(None, None, None, config, errores=("app sin instalar",)), config
    local, e1 = _json_cli(run, cli, ["status"])
    nube, e2 = _json_cli(run, cli, ["cloud", "status"])
    hilos, _ = _json_cli(run, cli, ["thread", "count"])
    lista, _ = _json_cli(run, cli, ["cloud", "env", "list"])
    return diagnostico(local, nube, CM.nombres_env(lista), config, hilos, (e1, e2), cli), config


def activar(run=subprocess.run, cli=None, ruta=None, seco=False):
    """Configura la nube (si hay sesión) y devuelve el diagnóstico con el parte del setup."""
    diag, _config = leer_estado(run, cli, ruta)
    res: dict = dict(diag)
    res["setup"] = (aplicar_setup(run, cli, ruta, seco) if diag.get("sesion")
                    else {"aplicado": False, "motivo": "sin sesión en Cloudroom"})
    return res


def main(argv):
    uso = "uso: cloudroom_config.py [estado|aplicar|activar] [--json] [--seco] [--cli RUTA]"
    pedidas, i = [], 0
    while i < len(argv):
        if argv[i] == "--cli":
            i += 2
            continue
        if not argv[i].startswith("--"):
            pedidas.append(argv[i])
        i += 1
    if any(a not in ("estado", "aplicar", "activar") for a in pedidas) or len(pedidas) > 1:
        raise SystemExit(uso)
    accion = pedidas[0] if pedidas else "estado"
    cli = next((argv[i + 1] for i, a in enumerate(argv) if a == "--cli" and i + 1 < len(argv)), None)
    seco = "--seco" in argv
    if accion == "aplicar":
        res = aplicar_setup(cli=cli, seco=seco)
    elif accion == "activar":
        res = activar(cli=cli, seco=seco)
    else:
        res, _config = leer_estado(cli=cli)
    if "--json" in argv:
        print(json.dumps(res, ensure_ascii=False))
    else:
        texto = " · ".join(str(x) for x in (res.get("estado"), res.get("detalle"), res.get("siguiente_paso"),
                                            (res.get("setup") or {}).get("motivo")) if x)
        print("Cloudroom: " + (texto or res.get("motivo") or "sin datos"))
    if accion == "aplicar":
        return 0 if (res.get("aplicado") or (seco and res.get("motivo") == "en seco: no se aplicó")) else 1
    return 0 if res.get("estado") != "no_disponible" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
