# -*- coding: utf-8 -*-
"""Maggabit: verificación del respaldo vivo y manifiesto de estado (MAG09).

La decisión es pura (manifiesto, plan_verificacion, avisos) y la E/S es una
capa fina con todo inyectable: reloj, subprocess y lectura de disco.

Reglas del contrato (MAG1117):
- Principio 0: con el disco ausente nada falla ni espera.
- Todo subprocess lleva timeout; un volumen exFAT que no responde devuelve
  «sin-respuesta», nunca se cuelga.
- Nunca se borra en el origen y nunca se imprimen tokens, claves ni URLs con
  credenciales.
- El manifiesto destino de RAIZ/MetaGenesis/estado/manifiesto.json y de
  ~/.starseed/maggabit/estado.json sale de `manifiesto`, que no lee ni
  escribe nada.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Callable

SEMANA_SEGUNDOS = 7 * 24 * 3600.0
MES_SEGUNDOS = 30 * 24 * 3600.0
SIN_RESPUESTA = "sin-respuesta"
RUTA_MANIFIESTO_RAIZ = "MetaGenesis/estado/manifiesto.json"
RUTA_ESTADO_MAGGABIT = "~/.starseed/maggabit/estado.json"
TIMEOUT_POR_DEFECTO = 30.0


def _estado_fuente(datos: dict, ahora: float) -> dict:
    ultimo = datos.get("ultimo_bueno")
    if ultimo is None:
        return {
            "ultimo_bueno": None,
            "retraso_segundos": None,
            "estado": "sin-respaldo",
            "tamano_bytes": datos.get("tamano_bytes"),
            "recuentos": datos.get("recuentos") or {},
            "ultimo_error": datos.get("ultimo_error"),
            "casas": list(datos.get("casas") or []),
        }
    retraso = max(0.0, ahora - ultimo)
    ritmo = datos.get("ritmo")
    al_dia = not ritmo or retraso <= ritmo
    return {
        "ultimo_bueno": ultimo,
        "retraso_segundos": retraso,
        "estado": "al-dia" if al_dia else "atrasado",
        "tamano_bytes": datos.get("tamano_bytes"),
        "recuentos": datos.get("recuentos") or {},
        "ultimo_error": datos.get("ultimo_error"),
        "casas": list(datos.get("casas") or []),
    }


def manifiesto(medio: str, fuentes: dict[str, dict], ahora: float) -> dict:
    """Manifiesto puro: por fuente último respaldo bueno, retraso frente a su
    ritmo, tamaños, recuentos y último error; más lo que no tiene otra casa."""
    detalle = {nombre: _estado_fuente(datos, ahora) for nombre, datos in fuentes.items()}
    solo = sorted(nombre for nombre, datos in detalle.items() if not datos["casas"])
    return {
        "medio": medio,
        "generado": ahora,
        "fuentes": detalle,
        "solo_en_maggabit": solo,
    }


def plan_verificacion(ahora: float, ultimas: dict) -> list[str]:
    """Plan puro: en cada pasada `git bundle verify` del paquete tocado;
    semanal `git fsck --connectivity-only` de cada espejo; mensual restauración
    de prueba (clonar desde el paquete a una carpeta temporal y comparar el
    commit de la rama por defecto)."""
    ultimas = ultimas or {}
    plan: list[str] = []
    paquete = ultimas.get("paquete")
    if paquete:
        plan.append(f"git bundle verify {paquete}")
    fsck_ultimo = ultimas.get("fsck")
    if fsck_ultimo is None or ahora - fsck_ultimo >= SEMANA_SEGUNDOS:
        for espejo in ultimas.get("espejos") or []:
            plan.append(f"git fsck --connectivity-only {espejo}")
    restauracion_ultima = ultimas.get("restauracion")
    if paquete and (restauracion_ultima is None or ahora - restauracion_ultima >= MES_SEGUNDOS):
        plan.append(f"restauracion-prueba {paquete}")
    return plan


def _fallos(manifiesto_dato: dict) -> dict[str, str]:
    fallos: dict[str, str] = {}
    for nombre, datos in (manifiesto_dato or {}).get("fuentes", {}).items():
        if datos.get("ultimo_error"):
            fallos[nombre] = str(datos["ultimo_error"])
        elif datos.get("estado") in ("atrasado", "sin-respaldo"):
            fallos[nombre] = str(datos["estado"])
    return fallos


def avisos(manifiesto_antes: dict, manifiesto_ahora: dict) -> list[str]:
    """Avisos puros: un fallo nuevo se dice una vez; lo ya conocido y lo
    recuperado no repiten."""
    previos = _fallos(manifiesto_antes)
    nuevos = _fallos(manifiesto_ahora)
    return [
        f"{nombre}: {nuevos[nombre]}"
        for nombre in sorted(nuevos)
        if nombre not in previos
    ]


def ejecutar_subproceso(
    comando: str, timeout: float = TIMEOUT_POR_DEFECTO, lanzar: Callable | None = None
) -> dict:
    """Corre un comando con timeout siempre puesto: un volumen exFAT que no
    responde devuelve «sin-respuesta», nunca se cuelga. Nunca registra ni
    imprime el contenido del comando."""
    lanzar = lanzar or subprocess.run
    try:
        proceso = lanzar(comando, shell=True, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"estado": SIN_RESPUESTA, "codigo": None, "salida": "", "error": ""}
    except OSError:
        return {"estado": "error", "codigo": None, "salida": "", "error": ""}
    estado = "ok" if proceso.returncode == 0 else "error"
    return {
        "estado": estado,
        "codigo": proceso.returncode,
        "salida": proceso.stdout or "",
        "error": proceso.stderr or "",
    }


def verificar_medio(
    raiz: str,
    plan: list[str],
    existe: Callable | None = None,
    ejecutar: Callable | None = None,
    timeout: float = TIMEOUT_POR_DEFECTO,
) -> dict:
    """Principio 0: con el disco ausente devuelve «ausente» sin ejecutar nada
    ni esperar; con el disco presente corre el plan con timeout por elemento."""
    existe = existe or os.path.isdir
    if not raiz or not existe(raiz):
        return {"estado": "ausente", "resultados": []}
    ejecutar = ejecutar or ejecutar_subproceso
    resultados = [
        {"comando": item, **ejecutar(item, timeout)} for item in plan
    ]
    return {"estado": "presente", "resultados": resultados}


def _escritor_por_defecto(ruta: str, contenido: str) -> None:
    destino = Path(ruta)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(contenido, encoding="utf-8")


def guardar_manifiesto(
    datos: dict, rutas: list[str] | None = None, escritor: Callable | None = None
) -> list[str]:
    """Capa fina de disco: escribe el manifiesto en las rutas destino
    (MetaGenesis/estado y ~/.starseed/maggabit). El escritor va inyectable
    para que las pruebas no toquen el disco real."""
    rutas = rutas or [RUTA_MANIFIESTO_RAIZ, RUTA_ESTADO_MAGGABIT]
    escritor = escritor or _escritor_por_defecto
    escritas: list[str] = []
    for ruta in rutas:
        ruta_expandida = os.path.expanduser(ruta)
        escritor(ruta_expandida, json.dumps(datos, ensure_ascii=False, indent=2) + "\n")
        escritas.append(ruta_expandida)
    return escritas
