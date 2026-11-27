#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BAP1127R · De la propuesta con evidencia a la tarea del enjambre (§7, C.17, D.3).
a_tarea y filtrar son PURAS. encolar escribe la cola del día y el registro."""

from __future__ import annotations

import fnmatch
import json
from pathlib import Path

OLA = "bap-propuestas"
TOPE_POR_ITERACION = 3
CONFIANZA_MINIMA = 0.6
MAX_ARCHIVOS = 3
REGISTRO = Path.home() / ".starseed" / "bap-propuestas.jsonl"
COLAS = Path("starseed_memory_root/olas")

# §8: lo que BAP nunca toca solo (puertas, umbrales, batería, libro de firmas, lanzador).
PROTEGIDOS = (
    "scripts/puente/puerta_*.py", "scripts/puente/*_puerta.py", "scripts/puente/*_puertas.py",
    "scripts/puente/puerta_arreglos.py", "config/umbrales-pruebas.json",
    "scripts/puente/*bateria*", "scripts/puente/*libro*firma*", "scripts/puente/*firma*libro*",
    "scripts/puente/lanzador*", "scripts/enjambre/lanzar*", "scripts/enjambre/tsc-turno.sh",
)


def es_protegido(ruta: str, protegidos: tuple[str, ...] = PROTEGIDOS) -> bool:
    ruta = ruta.lstrip("./")
    return any(fnmatch.fnmatch(ruta, p) for p in protegidos)


def _evidencia(p: dict) -> list[str]:
    ev = p.get("evidencia")
    if isinstance(ev, str):
        ev = [ev]
    return [str(e).strip() for e in (ev or []) if str(e).strip()]


def filtrar(propuestas: list[dict], protegidos: tuple[str, ...] = PROTEGIDOS) -> list[dict]:
    """Deja solo las que tienen evidencia, confianza ≥ 0.6 y no tocan lo protegido."""
    salida = []
    for p in propuestas:
        if not _evidencia(p) or float(p.get("confianza") or 0) < CONFIANZA_MINIMA:
            continue
        archivos = p.get("archivos_sospechosos") or []
        if any(es_protegido(a, protegidos) for a in archivos):
            continue
        salida.append(p)
    return salida


def a_tarea(p: dict, fecha: str = "00000000", n: int = 1) -> dict:
    """Propuesta → tarea de cola (formato de olas/cola-*.json)."""
    archivos = list(dict.fromkeys(p.get("archivos_sospechosos") or []))[:MAX_ARCHIVOS]
    confianza = float(p.get("confianza") or 0)
    prioridad = 70 + round(max(0.0, min(1.0, (confianza - CONFIANZA_MINIMA) / 0.4)) * 10)
    titulo = str(p.get("titulo") or p.get("id") or "propuesta de BAP")
    ev = "\n".join(f"- {e}" for e in _evidencia(p))
    prompt = (
        f"Propuesta de BAP «{p.get('id', '?')}»: {titulo}.\n"
        f"Evidencia citada:\n{ev}\n"
        f"Archivos a revisar: {', '.join(archivos) or 'ninguno indicado'}.\n"
        "Primero escribe la prueba de aceptación que reproduzca el fallo y compruébala en rojo. "
        "Luego arregla lo mínimo para ponerla en verde. No toques puertas, umbrales, batería, "
        "libro de firmas ni lanzador. Comprueba antes si el fallo sigue existiendo."
    )
    return {
        "id": f"BAPP{fecha}{n}", "ola": OLA, "titulo": titulo, "archivos": archivos,
        "depende": [], "prioridad": prioridad, "propuesta": p.get("id"), "prompt": prompt,
    }


def _leer_registro(registro: Path) -> set[str]:
    if not registro.exists():
        return set()
    ids = set()
    for linea in registro.read_text(encoding="utf-8").splitlines():
        try:
            ids.add(json.loads(linea).get("propuesta"))
        except json.JSONDecodeError:
            continue
    return ids


def encolar(propuestas: list[dict], ahora, colas: Path = COLAS, registro: Path = REGISTRO) -> list[dict]:
    """Escribe como mucho 3 tareas nuevas por iteración. Devuelve las escritas."""
    fecha = ahora.strftime("%Y%m%d")
    vistas = _leer_registro(registro)
    nuevas = [p for p in filtrar(propuestas) if p.get("id") not in vistas][:TOPE_POR_ITERACION]
    if not nuevas:
        return []
    colas.mkdir(parents=True, exist_ok=True)
    ruta = colas / f"cola-bap-propuestas-{fecha}.json"
    cola = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {"ola": OLA, "tareas": []}
    n0 = len(cola["tareas"])
    tareas = [a_tarea(p, fecha, n0 + i + 1) for i, p in enumerate(nuevas)]
    cola["tareas"].extend(tareas)
    ruta.write_text(json.dumps(cola, ensure_ascii=False, indent=2), encoding="utf-8")
    registro.parent.mkdir(parents=True, exist_ok=True)
    with registro.open("a", encoding="utf-8") as f:
        for t in tareas:
            f.write(json.dumps({"propuesta": t["propuesta"], "tarea": t["id"], "cuando": ahora.isoformat()}) + "\n")
    return tareas
