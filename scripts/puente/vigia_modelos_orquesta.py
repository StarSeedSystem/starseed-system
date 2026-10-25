#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Orquestación del vigía (escritura atómica, estado, cola)."""
from __future__ import annotations
import json, os, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
_RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_RAIZ))
from scripts.puente.vigia_areas import cargar_areas, AreasInvalidas
from scripts.puente.vigia_modelos_evaluar import VigiaError, descubrir, evaluar, LIMITE_FICHAS_DIA
try:
    import director_chat
except Exception:
    director_chat = None


def escribir_novedades(resultado: Dict[str, object], fecha_str: str) -> Path:
    raiz = Path(os.environ.get("STARSEED_ROOT", str(Path.home() / "Documents" / "starseed-os-main")))
    dir_vigia = raiz / "starseed_memory_root" / "vigia"
    dir_vigia.mkdir(parents=True, exist_ok=True)
    ruta = dir_vigia / f"novedades-{fecha_str}.json"
    tmp = ruta.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)
    tmp.rename(ruta)
    return ruta


def escribir_cola(resultado: Dict[str, object], fecha_str: str) -> Path:
    raiz = Path(os.environ.get("STARSEED_ROOT", str(Path.home() / "Documents" / "starseed-os-main")))
    dir_olas = raiz / "starseed_memory_root" / "olas"
    dir_olas.mkdir(parents=True, exist_ok=True)
    ruta = dir_olas / f"cola-vigia-{fecha_str}.json"
    tmp = ruta.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)
    tmp.rename(ruta)
    return ruta


def orquestar_pasada(ruta_areas: str = "", seco: bool = False, solo_area: Optional[str] = None, datos_inyectados: Optional[Dict[str, List[Dict[str, object]]]] = None) -> Dict[str, object]:
    ruta_areas = ruta_areas or str(_RAIZ / "config" / "vigia-areas.json")
    try:
        areas = cargar_areas(ruta_areas)
    except AreasInvalidas as e:
        raise VigiaError(f"Áreas inválidas: {e}") from e
    if solo_area:
        areas = [a for a in areas if a.get("id") == solo_area]
        if not areas:
            raise VigiaError(f"Área no encontrada: {solo_area}")
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    novedades: List[Dict[str, object]] = []
    mejores: List[Dict[str, object]] = []
    for area in areas:
        candidatos = descubrir(area, datos_inyectados.get(area.get("id"), []) if datos_inyectados else None)
        area_aceptados: List[str] = []
        for cand in candidatos:
            ficha = evaluar(cand, area, area_aceptados)
            novedades.append({"area": area.get("id"), "nombre_area": area.get("nombre"), "candidato": ficha, "fecha": hoy})
            if ficha["seguro"] and ficha["clase_licencia"] in ("libre", "condicionada"):
                mejores.append({"id": ficha["id"], "puntaje": ficha["puntaje"], "motivo": ficha["motivo_puntaje"], "clase_licencia": ficha["clase_licencia"]})
        mejores.sort(key=lambda x: x["puntaje"], reverse=True)
        mejores = mejores[:LIMITE_FICHAS_DIA]
    resultado: Dict[str, object] = {"fecha": hoy, "novedades": novedades, "mejores": mejores}
    ruta_novedades = escribir_novedades(resultado, hoy)
    ruta_cola: Optional[Path] = None
    if not seco and mejores:
        cola_resultado = {"fecha": hoy, "tareas": [{"id": m["id"], "puntaje": m["puntaje"], "clase_licencia": m["clase_licencia"]} for m in mejores]}
        ruta_cola = escribir_cola(cola_resultado, hoy)
    if not seco and director_chat is not None:
        texto = f"Vigía de modelos · {hoy}\nÁreas: {len(areas)} · Candidatos evaluados: {len(novedades)} · Mejores fichas: {len(mejores)}\nArchivo: {ruta_novedades}"
        if ruta_cola:
            texto += f"\nCola: {ruta_cola}"
        director_chat.publicar(texto, de="vigia-modelos", rol="director", tipo="informe")
    ruta_estado = Path.home() / ".starseed" / "vigia-modelos.json"
    ruta_estado.parent.mkdir(parents=True, exist_ok=True)
    ids_vistos = [n["candidato"]["id"] for n in novedades]
    estado_persistente: Dict[str, object] = {"ultima_pasada": hoy, "ids_vistos": ids_vistos, "archivo_novedades": str(ruta_novedades)}
    if ruta_cola:
        estado_persistente["archivo_cola"] = str(ruta_cola)
    tmp_estado = ruta_estado.with_suffix(".tmp")
    with open(tmp_estado, "w", encoding="utf-8") as f:
        json.dump(estado_persistente, f, indent=2, ensure_ascii=False)
    tmp_estado.rename(ruta_estado)
    return {"estado": "completado", "fecha": hoy, "archivo_novedades": str(ruta_novedades), "archivo_cola": str(ruta_cola) if ruta_cola else None, "novedades": len(novedades), "mejores": len(mejores)}
