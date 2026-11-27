#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BAP1127L · Convierte pruebas cerradas a experiencias con desenlace real para la automejora.

Lee registro_pruebas_logica.leer_registro (BAP1127E) y usa evaluador_pruebas_logica (BAP1127P)
para producir experiencias en el MISMO formato que automejora_logica.py (capa 'prueba',
id canónico, versión, aparato, veredicto, métricas). Idempotente por id+versión.
"""
from __future__ import annotations
import hashlib, json, os, re
from pathlib import Path
from typing import Any
import evaluador_pruebas_logica as EV
import registro_pruebas_logica as RP

CAPA = "prueba"
VERSION_DEFECTO = "1118"
MARCA_DIR_DEFECTO = Path(os.environ.get("STARSEED_ROOT", Path(__file__).resolve().parents[2])) / "starseed_memory_root" / "aprendizaje" / "experiencias" / ".convertidas"
MARCA_DIR_DEFECTO.mkdir(parents=True, exist_ok=True)

def _marca_path(id_can: str, ver: str, marca_dir: Path | None = None) -> Path:
    base = marca_dir or MARCA_DIR_DEFECTO
    return base / f"{hashlib.sha256(f'{id_can}|{ver}'.encode()).hexdigest()[:16]}.json"

def _ya_convertida(id_can: str, ver: str, marca_dir: Path | None = None) -> bool:
    return _marca_path(id_can, ver, marca_dir).exists()

def _marcar(id_can: str, ver: str, exp: dict, marca_dir: Path | None = None) -> None:
    _marca_path(id_can, ver, marca_dir).write_text(json.dumps(exp, ensure_ascii=False), encoding="utf-8")

def _apparato(pid: str) -> str:
    partes = pid.split("-")
    return "-".join(partes[2:]) if len(partes) >= 3 else "DESCONOCIDO"

def _valor_medida(nota: str, id_can: str) -> float | dict | None:
    nota = nota.strip()
    if not nota: return None
    if id_can == "B3-MT-A1" or "hash" in nota.lower():
        m_v, m_e = re.search(r"valor=(\S+)", nota), re.search(r"esperado=(\S+)", nota)
        if m_v and m_e: return {"valor": m_v.group(1), "esperado": m_e.group(1)}
    if id_can == "B4-MT-A1" or "cuadro" in nota.lower() or "fps" in nota.lower():
        m = re.search(r"(\d+(?:\.\d+)?)", nota)
        if m: return float(m.group(1))
    if id_can in ("B2-MT-A1", "B1-MT-A1", "B5-MT-A1", "PRB-LLAMADA-CONECTA") or "s" in nota.lower():
        m = re.search(r"(\d+(?:\.\d+)?)", nota)
        if m: return float(m.group(1))
    if nota.lower() in ("ok", "pass", "verde", "true", "sí", "si"): return 1.0
    if nota.lower() in ("fail", "rojo", "error", "false", "no"): return 0.0
    try: return float(nota)
    except ValueError: return None

def _eq_map(equiv: str | Path | dict) -> dict[str, str]:
    if isinstance(equiv, dict):
        eq = equiv.get("equivalencias", equiv)
        return {str(k).lower(): str(v) for k, v in eq.items()} if isinstance(eq, dict) else {}
    try:
        t = json.loads(Path(equiv).read_text(encoding="utf-8"))
        eq = t.get("equivalencias", t)
        return {str(k).lower(): str(v) for k, v in eq.items()} if isinstance(eq, dict) else {}
    except (OSError, ValueError): return {}

def _construir(p: dict, veredicto: dict, eq: dict, marca_dir: Path | None) -> dict | None:
    id_orig = str(p.get("id", "")).strip()
    if not id_orig: return None
    id_can = RP.id_canonico(id_orig, eq)
    if not id_can: return None
    ver = str(p.get("version") or VERSION_DEFECTO).strip()
    if _ya_convertida(id_can, ver, marca_dir): return None
    vp = veredicto.get("por_prueba", {}).get(id_can)
    if not vp or vp.get("ok") is None: return None
    ok = "verde" if vp["ok"] else "rojo"
    return {"id": id_can, "task_id": id_can, "capa": CAPA, "version": ver,
        "aparato": _apparato(id_orig), "veredicto": ok,
        "metrica": {"valor": vp.get("valor"), "umbral": vp.get("umbral", {})},
        "entrada": f"Prueba {id_can} v{ver}", "description": f"Prueba {id_can} v{ver}",
        "salida": {"resultado": ok}, "estado": {"resultado": ok}, "resultado": ok}

def convertir(ruta: str | Path, umbrales: dict, equiv: str | Path | dict, marca_dir: Path | None = None) -> list[dict]:
    pruebas = RP.leer_registro(ruta)
    cerradas = [p for p in pruebas if p.get("tipo") == "fin" and p.get("resultado") is not None]
    if not cerradas: return []
    eq = _eq_map(equiv)
    medidas = {}
    for p in cerradas:
        id_can = RP.id_canonico(str(p.get("id", "")), eq)
        if id_can:
            v = _valor_medida(str(p.get("nota", "")), id_can)
            if v is not None: medidas[id_can] = v
    veredicto = EV.evaluar(medidas, umbrales, "anillo", eq)
    exps = []
    for p in cerradas:
        exp = _construir(p, veredicto, eq, marca_dir)
        if exp:
            _marcar(exp["id"], exp["version"], exp, marca_dir)
            exps.append(exp)
    return exps

if __name__ == "__main__":
    RAIZ = Path(__file__).resolve().parents[2]
    U = json.loads((RAIZ / "config" / "umbrales-pruebas.json").read_text(encoding="utf-8"))
    T = RAIZ / "config" / "pruebas-equivalencias.json"
    R = RAIZ / "starseed_memory_root" / "pruebas" / "registro.jsonl"
    print(json.dumps(convertir(R, U, T), ensure_ascii=False, indent=1))