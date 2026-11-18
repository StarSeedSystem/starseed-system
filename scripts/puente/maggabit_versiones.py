"""Maggabit: instaladores de cada publicación.

Decide qué versiones del repo de instaladores (StarSeedSystem/starseed-system)
se bajan a «MetaGenesis/instaladores/<etiqueta>/» y comprueba que lo descargado
esté entero frente a su ficha.

Reglas del contrato:
- «plan» y las comparaciones son funciones puras; la E/S (gh y disco) es una
  capa fina con todo inyectable (subprocess, medidor, disco).
- Todo subprocess lleva timeout: si el volumen (exFAT) no responde se devuelve
  «sin-respuesta», nunca se cuelga. Con el disco ausente nada falla ni espera.
- Nunca se borra en el origen: «retirar» solo señala carpetas de instaladores
  ya descargadas en este equipo.
- Nunca se registran tokens, claves ni URLs con credenciales.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from typing import Callable, Optional

REPO_PUBLICACIONES = "StarSeedSystem/starseed-system"
RAIZ_INSTALADORES = "MetaGenesis/instaladores"
CANAL_ESTABLE = "estable"
CANAL_PRUEBAS = "canal-pruebas"
CANAL_SERVIDOR = "servidor-local"
PRUEBAS_CONSERVADAS = 3
TIMEOUT_GH = 120
SIN_RESPUESTA = "sin-respuesta"
DISCO_AUSENTE = "disco-ausente"

Runner = Callable[..., object]
Medidor = Callable[[str, str], Optional[int]]


def canal_de(publicacion: dict) -> str:
    canal = str(publicacion.get("canal", "")).strip()
    if canal:
        return canal
    if numero_de_prueba(publicacion) is not None:
        return CANAL_PRUEBAS
    return CANAL_ESTABLE


def numero_de_prueba(publicacion: dict) -> Optional[int]:
    if publicacion.get("prueba") is not None:
        try:
            return int(publicacion["prueba"])
        except (TypeError, ValueError):
            return None
    etiqueta = str(publicacion.get("etiqueta", ""))
    hallado = re.search(r"prueba-(\d+)", etiqueta)
    return int(hallado.group(1)) if hallado else None


def destino_de(publicacion: dict) -> str:
    etiqueta = str(publicacion.get("etiqueta", "")).strip() or CANAL_ESTABLE
    canal = canal_de(publicacion)
    if canal == CANAL_PRUEBAS:
        numero = numero_de_prueba(publicacion)
        return f"{RAIZ_INSTALADORES}/{CANAL_PRUEBAS}/prueba-{numero if numero is not None else 0}"
    if canal == CANAL_SERVIDOR:
        return f"{RAIZ_INSTALADORES}/{CANAL_SERVIDOR}"
    return f"{RAIZ_INSTALADORES}/{etiqueta}"


def _tamano(archivo: dict) -> int:
    try:
        return int(archivo.get("bytes", archivo.get("size", 0)))
    except (TypeError, ValueError):
        return 0


def _archivos_ordenados(archivos: list) -> list[dict]:
    limpios = [
        {"nombre": str(a.get("nombre", a.get("name", ""))), "bytes": _tamano(a)}
        for a in (archivos or [])
        if isinstance(a, dict)
    ]
    return sorted(limpios, key=lambda a: a["nombre"])


def ficha_de(publicacion: dict) -> dict:
    return {
        "nombre": str(publicacion.get("nombre", publicacion.get("etiqueta", ""))),
        "publicado": str(publicacion.get("publicado", "")),
        "archivos": _archivos_ordenados(publicacion.get("archivos", [])),
    }


def _ficha_de_guardada(guardada: dict) -> dict:
    ficha = guardada["ficha"] if isinstance(guardada.get("ficha"), dict) else guardada
    return {
        "nombre": str(ficha.get("nombre", "")),
        "publicado": str(ficha.get("publicado", "")),
        "archivos": _archivos_ordenados(ficha.get("archivos", [])),
    }


def fichas_iguales(guardada: dict, ficha: dict) -> bool:
    return _ficha_de_guardada(guardada) == ficha_de(ficha)
def _canal_de_guardada(etiqueta: str, guardada: dict) -> str:
    canal = str(guardada.get("canal", "")).strip()
    if canal:
        return canal
    if "prueba" in guardada and guardada["prueba"] is not None:
        return CANAL_PRUEBAS
    if re.search(r"prueba-\d+", etiqueta):
        return CANAL_PRUEBAS
    return CANAL_ESTABLE


def _prueba_de_guardada(etiqueta: str, guardada: dict) -> Optional[int]:
    if guardada.get("prueba") is not None:
        return int(guardada["prueba"])
    destino = str(guardada.get("destino", ""))
    for texto in (etiqueta, destino):
        hallado = re.search(r"prueba-(\d+)", texto)
        if hallado:
            return int(hallado.group(1))
    return None


def _poda(acciones: list[dict], guardadas: dict[str, dict]) -> list[dict]:
    en_juego: list[dict] = []
    vistas: set[str] = set()
    for etiqueta, guardada in (guardadas or {}).items():
        if _canal_de_guardada(etiqueta, guardada) != CANAL_PRUEBAS:
            continue
        numero = _prueba_de_guardada(etiqueta, guardada)
        if numero is None:
            continue
        destino = str(guardada.get("destino", "")) or destino_de(
            {"etiqueta": etiqueta, "canal": CANAL_PRUEBAS, "prueba": numero}
        )
        en_juego.append({"prueba": numero, "etiqueta": etiqueta, "destino": destino})
        vistas.add(etiqueta)
    for baja in acciones:
        if baja.get("canal") == CANAL_PRUEBAS and baja.get("etiqueta") not in vistas:
            en_juego.append(
                {"prueba": int(baja.get("prueba", 0)), "etiqueta": baja["etiqueta"], "destino": baja["destino"]}
            )
    en_juego.sort(key=lambda e: e["prueba"], reverse=True)
    conservadas = en_juego[:PRUEBAS_CONSERVADAS]
    retiradas = en_juego[PRUEBAS_CONSERVADAS:]
    nombres = [e["etiqueta"] for e in conservadas]
    podas = []
    for retirada in retiradas:
        podas.append(
            {
                "accion": "retirar",
                "etiqueta": retirada["etiqueta"],
                "destino": retirada["destino"],
                "canal": CANAL_PRUEBAS,
                "poda": {
                    "motivo": f"Poda del canal de pruebas: se conservan las {PRUEBAS_CONSERVADAS} últimas.",
                    "conservadas": list(nombres),
                    "eliminada": retirada["etiqueta"],
                },
            }
        )
    return podas


def plan(publicaciones: list[dict], guardadas: dict[str, dict]) -> list[dict]:
    acciones: list[dict] = []
    for publicacion in publicaciones or []:
        etiqueta = str(publicacion.get("etiqueta", "")).strip()
        guardada = (guardadas or {}).get(etiqueta)
        if guardada is not None and fichas_iguales(guardada, ficha_de(publicacion)):
            continue
        baja: dict[str, object] = {
            "accion": "bajar",
            "etiqueta": etiqueta,
            "canal": canal_de(publicacion),
            "destino": destino_de(publicacion),
        }
        numero = numero_de_prueba(publicacion)
        if numero is not None:
            baja["prueba"] = numero
        acciones.append(baja)
    acciones.extend(_poda(acciones, guardadas))
    return acciones
def medidor_de_disco(carpeta: str, nombre: str) -> Optional[int]:
    try:
        return os.path.getsize(os.path.join(carpeta, nombre))
    except OSError:
        return None


def comprobar(carpeta: str, ficha: dict, medidor: Medidor | None = None) -> dict:
    medidor = medidor or medidor_de_disco
    fallos: list[dict] = []
    archivos = _ficha_de_guardada(ficha)["archivos"]
    for archivo in archivos:
        medido = medidor(carpeta, archivo["nombre"])
        if medido is None:
            fallos.append({"nombre": archivo["nombre"], "motivo": "falta", "esperados": archivo["bytes"]})
        elif int(medido) != archivo["bytes"]:
            fallos.append(
                {
                    "nombre": archivo["nombre"],
                    "motivo": "medida-distinta",
                    "esperados": archivo["bytes"],
                    "medidos": int(medido),
                }
            )
    completa = bool(archivos) and not fallos
    return {
        "carpeta": carpeta,
        "total": len(archivos),
        "completa": completa,
        "estado": "completa" if completa else "incompleta",
        "fallos": fallos,
    }


def _disco_presente(destino: str) -> bool:
    ruta = os.path.abspath(destino)
    return os.path.isdir(ruta) or os.path.isdir(os.path.dirname(ruta))


def _ejecutar_gh(orden: list[str], runner: Runner | None = None) -> dict:
    runner = runner or _correr_subprocess
    try:
        resultado = runner(orden, TIMEOUT_GH)
    except subprocess.TimeoutExpired:
        return {"estado": SIN_RESPUESTA, "orden": orden, "timeout": TIMEOUT_GH}
    except OSError as error:
        return {"estado": "error", "orden": orden, "motivo": str(error)}
    codigo = int(getattr(resultado, "returncode", 1))
    return {
        "estado": "ok" if codigo == 0 else "error",
        "orden": orden,
        "timeout": TIMEOUT_GH,
        "codigo": codigo,
        "salida": str(getattr(resultado, "stdout", "") or ""),
    }


def _correr_subprocess(orden: list[str], timeout: int):
    return subprocess.run(orden, capture_output=True, text=True, timeout=timeout)


def ver_publicacion(etiqueta: str, runner: Runner | None = None) -> dict:
    orden = [
        "gh", "release", "view", etiqueta,
        "-R", REPO_PUBLICACIONES,
        "--json", "tagName,name,publishedAt,isLatest,assets",
    ]
    resultado = _ejecutar_gh(orden, runner)
    if resultado.get("estado") != "ok":
        return resultado
    try:
        datos = json.loads(resultado["salida"])
    except ValueError:
        return {"estado": "error", "orden": orden, "motivo": "respuesta-ilegible"}
    return {
        "estado": "ok",
        "etiqueta": str(datos.get("tagName", etiqueta)),
        "latest": bool(datos.get("isLatest")),
        "ficha": {
            "nombre": str(datos.get("name", "")),
            "publicado": str(datos.get("publishedAt", "")),
            "archivos": [
                {"nombre": str(a.get("name", "")), "bytes": _tamano(a)}
                for a in (datos.get("assets") or [])
                if isinstance(a, dict)
            ],
        },
    }


def descargar_publicacion(
    etiqueta: str,
    destino: str,
    runner: Runner | None = None,
    disco_presente: Callable[[str], bool] | None = None,
) -> dict:
    disco_presente = disco_presente or _disco_presente
    if not disco_presente(destino):
        return {"estado": DISCO_AUSENTE, "etiqueta": etiqueta, "destino": destino}
    orden = ["gh", "release", "download", etiqueta, "-R", REPO_PUBLICACIONES, "--clobber", "-D", destino]
    resultado = _ejecutar_gh(orden, runner)
    resultado["etiqueta"] = etiqueta
    resultado["destino"] = destino
    return resultado
