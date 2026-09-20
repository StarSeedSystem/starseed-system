#!/usr/bin/env python3
"""Mensajes de Alex a un agente EN MARCHA, sin interrumpirlo (2026-09-20).

Alex: «una opción de enviar mensajes al agente para que lo considere en el
trabajo sin interrumpir el proceso». El Mando escribe (POST
/api/mando/agentes/<id>/mensaje) una línea JSON en
`starseed_memory_root/olas/mensajes/<id>.jsonl`:
    {"t": "2026-09-20T23:10:00", "de": "alex", "texto": "…"}
y el orquestador los ENTREGA por dos vías, ninguna corta nada:
  1. `MENSAJES-DEL-DIRECTOR.md` en la raíz del worktree del agente, que el
     prompt le manda leer antes de darse por terminado (y en cada trozo largo);
  2. el bloque «MENSAJES DEL DIRECTOR» al principio del prompt del siguiente
     intento y del revisor.
Cada mensaje lleva `entregado` (cuándo se escribió en el worktree) y `leido`
(cuándo entró en un prompt), que el Mando enseña. Nunca claves: es texto de
trabajo. Funciones puras probadas en test_mensajes_agente.py.
"""
from __future__ import annotations

import json
import os
import re
import time

ARCHIVO_WORKTREE = "MENSAJES-DEL-DIRECTOR.md"
INSTRUCCION = (
    "MENSAJES DEL DIRECTOR: si en la raíz del worktree existe `%s`, léelo antes de "
    "darte por terminado y cada vez que vayas a empezar un archivo nuevo; son notas "
    "de Alex para esta tarea. Tenlas en cuenta sin rehacer lo que ya está bien y "
    "sin salirte de los archivos de la tarea." % ARCHIVO_WORKTREE
)


def ruta_mensajes(olas: str, tid: str) -> str:
    seguro = re.sub(r"[^A-Za-z0-9_-]", "_", tid).strip("_") or "sin-id"
    return os.path.join(olas, "mensajes", seguro + ".jsonl")


def leer(olas: str, tid: str) -> list[dict]:
    """Todos los mensajes de la tarea, en orden; líneas rotas se saltan."""
    ruta = ruta_mensajes(olas, tid)
    salida = []
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea:
                    continue
                try:
                    m = json.loads(linea)
                except ValueError:
                    continue
                if isinstance(m, dict) and str(m.get("texto") or "").strip():
                    salida.append(m)
    except OSError:
        pass
    return salida


def _escribir(olas: str, tid: str, mensajes: list[dict]) -> None:
    ruta = ruta_mensajes(olas, tid)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for m in mensajes:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    os.replace(tmp, ruta)


def anotar(olas: str, tid: str, texto: str, de: str = "alex") -> dict:
    """Añade un mensaje (lo usa el Mando y las pruebas). Devuelve el mensaje."""
    texto = str(texto or "").strip()
    if not texto:
        raise ValueError("mensaje vacío")
    m = {"t": time.strftime("%Y-%m-%dT%H:%M:%S"), "de": de, "texto": texto[:2000]}
    mensajes = leer(olas, tid)
    mensajes.append(m)
    _escribir(olas, tid, mensajes)
    return m


def pendientes(mensajes: list[dict], clave: str) -> list[dict]:
    """Los que aún no tienen `clave` ('entregado' o 'leido')."""
    return [m for m in mensajes if not m.get(clave)]


def texto_worktree(mensajes: list[dict]) -> str:
    """Contenido de MENSAJES-DEL-DIRECTOR.md con TODOS los mensajes de la tarea."""
    lineas = [
        "# Mensajes del director para esta tarea",
        "",
        "Notas de Alex mientras trabajas. Tenlas en cuenta sin rehacer lo que ya está bien.",
        "",
    ]
    for m in mensajes:
        lineas.append("- [%s · %s] %s" % (m.get("t", "?"), m.get("de", "alex"), m.get("texto", "")))
    return "\n".join(lineas) + "\n"


def bloque_prompt(mensajes: list[dict]) -> str:
    """Bloque para el prompt del siguiente intento/revisor; vacío si no hay."""
    if not mensajes:
        return ""
    cuerpo = "\n".join("- %s" % m.get("texto", "") for m in mensajes)
    return "MENSAJES DEL DIRECTOR (Alex, para esta tarea; tenlos en cuenta):\n%s\n\n" % cuerpo


def entregar(olas: str, tid: str, worktree: str | None) -> int:
    """Escribe/actualiza el archivo del worktree si hay mensajes sin entregar.
    Devuelve cuántos se entregaron. Nunca lanza: un fallo aquí no para la ola."""
    try:
        mensajes = leer(olas, tid)
        nuevos = pendientes(mensajes, "entregado")
        if not nuevos or not worktree or not os.path.isdir(worktree):
            return 0
        with open(os.path.join(worktree, ARCHIVO_WORKTREE), "w", encoding="utf-8") as f:
            f.write(texto_worktree(mensajes))
        ahora = time.strftime("%Y-%m-%dT%H:%M:%S")
        for m in nuevos:
            m["entregado"] = ahora
        _escribir(olas, tid, mensajes)
        return len(nuevos)
    except Exception:
        return 0


def para_prompt(olas: str, tid: str) -> str:
    """Bloque de prompt con los mensajes y los marca `leido`. Nunca lanza."""
    try:
        mensajes = leer(olas, tid)
        if not mensajes:
            return ""
        ahora = time.strftime("%Y-%m-%dT%H:%M:%S")
        cambio = False
        for m in mensajes:
            if not m.get("leido"):
                m["leido"] = ahora
                cambio = True
        if cambio:
            _escribir(olas, tid, mensajes)
        return bloque_prompt(mensajes)
    except Exception:
        return ""
