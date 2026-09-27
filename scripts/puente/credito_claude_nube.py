#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Crédito de Claude en la nube (2026-09-27).

Alex tiene «Créditos de sesiones en la nube» en claude.ai → Ajustes → Uso: se aplican solos a
las sesiones de Claude en la nube y, al usarse o vencer, vuelve el uso normal del plan. No hay
API para leer el saldo, así que este guion guarda lo que Alex DECLARA y el Mando lo enseña en el
pulso de trabajo (medidor «Crédito Claude nube», `src/lib/mando/credito-claude.ts`).

Uso:
  credito_claude_nube.py declarar --restante 250 [--total 250]
        [--vence 2026-11-05T01:59:00-06:00] [--semanal-todos 15] [--semanal-fable 0]
        [--reinicio "sábado 4:00 a.m."]
  credito_claude_nube.py uso [--desde 2026-09-27]      # DENTRO de una sesión en la nube:
        suma los tokens por modelo de ~/.claude/projects/**/*.jsonl (solo números, nunca texto)
  credito_claude_nube.py anotar <informe.json>          # en la Mac: guarda ese informe
  credito_claude_nube.py ver

Nunca guarda claves ni texto de mensajes. El archivo vive fuera del repo: es un dato de la
cuenta de Alex, no del proyecto.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import tempfile
import time

CONFIG = os.path.expanduser("~/.starseed/credito-claude-nube.json")
POR_DEFECTO = {
    "total_usd": 250,
    "restante_usd": 250,
    "vence": "2026-11-05T01:59:00-06:00",
    "declarado_en": "",
    "semanal": {"todos": 15, "fable": 0, "reinicio": "sábado 4:00 a.m."},
    "sesiones": [],
}
MAX_SESIONES = 20


def ahora_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def leer(ruta: str = CONFIG) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else dict(POR_DEFECTO)
    except (OSError, ValueError):
        return json.loads(json.dumps(POR_DEFECTO))


def guardar(d: dict, ruta: str = CONFIG) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ruta), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)


def declarar(d: dict, restante: float, total: float | None = None, vence: str | None = None,
             semanal_todos: float | None = None, semanal_fable: float | None = None,
             reinicio: str | None = None, cuando: str | None = None) -> dict:
    d = dict(d)
    if total is not None:
        d["total_usd"] = total
    d["restante_usd"] = max(0.0, float(restante))
    if vence:
        d["vence"] = vence
    semanal = dict(d.get("semanal") or {})
    if semanal_todos is not None:
        semanal["todos"] = semanal_todos
    if semanal_fable is not None:
        semanal["fable"] = semanal_fable
    if reinicio:
        semanal["reinicio"] = reinicio
    d["semanal"] = semanal
    d["declarado_en"] = cuando or ahora_iso()
    return d


def uso_de_sesiones(raiz: str, desde: str = "") -> list[dict]:
    """Un informe por archivo de sesión: modelo principal y sus tokens. Solo números."""
    informes = []
    for ruta in glob.glob(os.path.join(raiz, "**", "*.jsonl"), recursive=True):
        por_modelo: dict[str, dict[str, int]] = {}
        ultima = ""
        with open(ruta, encoding="utf-8", errors="ignore") as f:
            for linea in f:
                try:
                    o = json.loads(linea)
                except ValueError:
                    continue
                if desde and str(o.get("timestamp", "")) < desde:
                    continue
                m = o.get("message") if isinstance(o, dict) else None
                u = m.get("usage") if isinstance(m, dict) else None
                if not isinstance(u, dict):
                    continue
                modelo = str(m.get("model") or "?")
                if modelo.startswith("<"):
                    continue
                c = por_modelo.setdefault(modelo, {"salida": 0, "cacheLectura": 0, "cacheEscritura": 0})
                c["salida"] += int(u.get("output_tokens") or 0)
                c["cacheLectura"] += int(u.get("cache_read_input_tokens") or 0)
                c["cacheEscritura"] += int(u.get("cache_creation_input_tokens") or 0)
                ultima = str(o.get("timestamp") or ultima)
        if not por_modelo:
            continue
        modelo, c = max(por_modelo.items(), key=lambda kv: kv[1]["cacheLectura"] + kv[1]["salida"])
        informes.append({
            "sesion": os.path.splitext(os.path.basename(ruta))[0],
            "t": ultima or ahora_iso(),
            "modelo": modelo,
            "salida": sum(v["salida"] for v in por_modelo.values()),
            "cacheLectura": sum(v["cacheLectura"] for v in por_modelo.values()),
            "cacheEscritura": sum(v["cacheEscritura"] for v in por_modelo.values()),
        })
    return informes


def anotar(d: dict, informes: list[dict]) -> dict:
    d = dict(d)
    sesiones = {s.get("sesion"): s for s in d.get("sesiones") or [] if isinstance(s, dict)}
    for inf in informes:
        if isinstance(inf, dict) and inf.get("sesion"):
            sesiones[inf["sesion"]] = {k: inf.get(k) for k in ("sesion", "t", "modelo", "salida", "cacheLectura", "cacheEscritura")}
    d["sesiones"] = sorted(sesiones.values(), key=lambda s: str(s.get("t")), reverse=True)[:MAX_SESIONES]
    return d


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="orden")
    dec = sub.add_parser("declarar")
    dec.add_argument("--restante", type=float, required=True)
    dec.add_argument("--total", type=float)
    dec.add_argument("--vence")
    dec.add_argument("--semanal-todos", type=float)
    dec.add_argument("--semanal-fable", type=float)
    dec.add_argument("--reinicio")
    uso = sub.add_parser("uso")
    uso.add_argument("--desde", default="")
    uso.add_argument("--raiz", default=os.path.expanduser("~/.claude/projects"))
    ano = sub.add_parser("anotar")
    ano.add_argument("informe")
    sub.add_parser("ver")
    a = ap.parse_args(argv)
    if a.orden == "declarar":
        guardar(declarar(leer(), a.restante, a.total, a.vence, a.semanal_todos, a.semanal_fable, a.reinicio))
    elif a.orden == "uso":
        print(json.dumps(uso_de_sesiones(a.raiz, a.desde), ensure_ascii=False, indent=1))
        return 0
    elif a.orden == "anotar":
        with open(a.informe, encoding="utf-8") as f:
            informes = json.load(f)
        guardar(anotar(leer(), informes if isinstance(informes, list) else [informes]))
    d = leer()
    print(json.dumps({k: d.get(k) for k in ("total_usd", "restante_usd", "vence", "declarado_en", "semanal")}, ensure_ascii=False))
    print("sesiones anotadas: %d" % len(d.get("sesiones") or []))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
