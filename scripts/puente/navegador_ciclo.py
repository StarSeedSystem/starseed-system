#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Orquestador del ciclo diario del navegador propio (NAV1112J).

Ejecuta en orden y protegido (fallo de uno no impide los siguientes):
1. navegador_alta.py vigilar
2. Los cuatro lectores de actividad (google-alex, google-fundacion, instagram-maggasukha, instagram-sociedad)
3. navegador_reparar.py
4. Apaga el contenedor Docker del navegador

Si STARSEED_NAVEGADOR=0 termina sin hacer nada.
"""
import json
import os
import sys
import subprocess
from datetime import datetime

# Importar módulos de actividad al nivel de módulo para que sean patchables en tests
import actividad_google as AG
import actividad_instagram as AI

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))

SESIONES_GOOGLE = ("alex", "fundacion")
SESIONES_INSTAGRAM = ("maggasukha", "sociedadstarseed")

CONTENEDOR = os.path.expanduser("~/starseed/nodo/navegador/compose-navegador.yml")


def _cero(valor: str) -> bool:
    return str(valor or "").strip().lower() in ("0", "false", "no", "off")


def _apagado() -> bool:
    return _cero(os.environ.get("STARSEED_NAVEGADOR"))


def _ejecutar_comando(comando: list[str], descripcion: str) -> dict:
    """Ejecuta un comando subprocess y devuelve resultado, nunca lanza excepción."""
    try:
        resultado = subprocess.run(
            comando,
            capture_output=True,
            text=True,
            cwd=RAIZ,
            timeout=1800,
        )
        return {
            "ok": resultado.returncode == 0,
            "descripcion": descripcion,
            "stdout": resultado.stdout[-2000:] if resultado.stdout else "",
            "stderr": resultado.stderr[-2000:] if resultado.stderr else "",
            "codigo": resultado.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "descripcion": descripcion, "error": "timeout"}
    except Exception as e:
        return {"ok": False, "descripcion": descripcion, "error": str(e)}


def _ejecutar_funcion(func, descripcion: str, *args, **kwargs) -> dict:
    """Ejecuta una función y devuelve resultado, nunca lanza excepción."""
    try:
        resultado = func(*args, **kwargs)
        return {"ok": True, "descripcion": descripcion, "resultado": resultado}
    except Exception as e:
        return {"ok": False, "descripcion": descripcion, "error": str(e)}


def _apagar_contenedor() -> dict:
    """Detiene el contenedor Docker del navegador."""
    return _ejecutar_comando(
        ["docker", "compose", "-f", CONTENEDOR, "stop"],
        "apagar contenedor navegador",
    )


def main() -> int:
    if _apagado():
        print(json.dumps({"ok": True, "mensaje": "STARSEED_NAVEGADOR=0, saltando ciclo"}, ensure_ascii=False))
        return 0

    resultados = []

    # 1. navegador_alta.py vigilar
    resultados.append(_ejecutar_comando(
        [sys.executable, os.path.join(DIRECTORIO, "navegador_alta.py"), "vigilar"],
        "navegador_alta.py vigilar",
    ))

    # 2. Los cuatro lectores de actividad (importados directamente para tolerancia a fallos)
    # Google: alex y fundacion
    for alias in SESIONES_GOOGLE:
        def _leer_google(a=alias):
            return AG.leer(alias=[a])
        resultados.append(_ejecutar_funcion(_leer_google, f"lector actividad google-{alias}"))

    # Instagram: maggasukha y sociedadstarseed
    for cuenta in SESIONES_INSTAGRAM:
        def _leer_instagram(c=cuenta):
            return AI.leer(alias=[c], desde_drive=True)
        resultados.append(_ejecutar_funcion(_leer_instagram, f"lector actividad instagram-{cuenta}"))

    # 3. navegador_reparar.py
    resultados.append(_ejecutar_comando(
        [sys.executable, os.path.join(DIRECTORIO, "navegador_reparar.py")],
        "navegador_reparar.py",
    ))

    # 4. Apaga el contenedor
    resultados.append(_apagar_contenedor())

    # Resumen
    fallos = [r for r in resultados if not r.get("ok")]
    print(json.dumps({"ok": len(fallos) == 0, "resultados": resultados}, ensure_ascii=False))
    return 0 if len(fallos) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())