#!/usr/bin/env python3
"""Relevo del carril de Claude (REL1026A): lo que Claude reparte a sus agentes nunca se queda huérfano.

Órdenes (la lógica pura vive en `relevo_carril_claude_logica.py`):
  latido                      Claude sigue vivo (lo llama la sesión de Claude cada vez que trabaja).
  registrar --json ARCHIVO    Anota tareas que Claude reparte: [{id, ola?, titulo, prompt, archivos, depende?, capacidad?}].
  cerrar ID… [--cancelar]     Claude cierra lo terminado (o lo descarta).
  estado                      Qué hay abierto, la edad del latido y si tocaría relevar.
  revisar [--forzar]          Si Claude calla (latido viejo) o su límite se agotó, convierte lo abierto en una cola de
                              MetaGenesis (`olas/cola-relevo-claude-*.json`) que el enjambre gratuito toma solo.

La autocuración (`autocuracion_mando.revisar`, cada pasada del vigía) llama a `revisar()`: no depende de Claude.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relevo_carril_claude_logica as L  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
REGISTRO = os.environ.get("STARSEED_CARRIL_CLAUDE") or os.path.join(OLAS, "carril-claude", "registro.json")
UMBRAL_MIN = float(os.environ.get("STARSEED_RELEVO_CLAUDE_MIN") or L.UMBRAL_LATIDO_MIN)


def ahora() -> datetime:
    return datetime.now().astimezone()


def leer(ruta: str = REGISTRO) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def guardar(datos: dict, ruta: str = REGISTRO) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def estado_limites() -> dict | None:
    """Lo que dice `limites_claude.py` (lecturas declaradas de claude.ai); sin datos, None."""
    try:
        import limites_claude
        return limites_claude.estado(limites_claude.leer(), ahora())
    except Exception:
        return None


def asuntos_de_main(n: int = 600) -> list[str]:
    try:
        r = subprocess.run(["git", "-C", RAIZ, "log", "main", "-%d" % n, "--format=%s"],
                           capture_output=True, text=True, timeout=30)
        return r.stdout.splitlines() if r.returncode == 0 else []
    except (OSError, subprocess.SubprocessError):
        return []


def revisar(forzar: bool = False, ruta: str = REGISTRO, olas: str = OLAS, limites=None, asuntos=None,
            momento: datetime | None = None) -> dict:
    """Una pasada. Devuelve {"relevado": bool, "motivo": str, "cola": nombre|None, "tareas": n, "hechas": [...]}."""
    momento = momento or ahora()
    reg = leer(ruta)
    if not reg:
        return {"relevado": False, "motivo": "sin registro del carril de Claude"}
    limites = estado_limites() if limites is None else limites
    toca, motivo = L.debe_relevar(reg, momento, limites, UMBRAL_MIN)
    if forzar and L.tareas_abiertas(reg):
        toca, motivo = True, "relevo pedido a mano (" + motivo + ")"
    if not toca:
        return {"relevado": False, "motivo": motivo}
    plan = L.planificar_relevo(reg, asuntos_de_main() if asuntos is None else asuntos, momento)
    if plan["cola"]:
        destino = os.path.join(olas, plan["nombre_cola"])
        os.makedirs(olas, exist_ok=True)
        with open(destino + ".tmp", "w", encoding="utf-8") as f:
            json.dump(plan["cola"], f, ensure_ascii=False, indent=1)
        os.replace(destino + ".tmp", destino)
    guardar(L.aplicar_plan(reg, plan, momento, motivo), ruta)
    return {"relevado": True, "motivo": motivo, "cola": plan["nombre_cola"] if plan["cola"] else None,
            "tareas": len(plan["cola"]), "hechas": plan["hechas"]}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
    sub.add_parser("latido")
    r = sub.add_parser("registrar"); r.add_argument("--json", required=True)
    c = sub.add_parser("cerrar"); c.add_argument("ids", nargs="+"); c.add_argument("--cancelar", action="store_true")
    sub.add_parser("estado")
    v = sub.add_parser("revisar"); v.add_argument("--forzar", action="store_true")
    a = p.parse_args(argv)
    if a.orden == "latido":
        reg = leer(); reg["latido"] = ahora().isoformat(); guardar(reg)
        print("latido anotado · %d tarea(s) abierta(s)" % len(L.tareas_abiertas(reg)))
    elif a.orden == "registrar":
        with open(a.json, encoding="utf-8") as f:
            nuevas = json.load(f)
        reg = L.registrar(leer(), nuevas if isinstance(nuevas, list) else [nuevas], ahora())
        guardar(reg)
        print("registradas %d · abiertas %d" % (len(nuevas) if isinstance(nuevas, list) else 1, len(L.tareas_abiertas(reg))))
    elif a.orden == "cerrar":
        guardar(L.cerrar(leer(), a.ids, "cancelada" if a.cancelar else "hecha"))
        print("cerradas: %s" % ", ".join(a.ids))
    elif a.orden == "estado":
        reg, m = leer(), ahora()
        toca, motivo = L.debe_relevar(reg, m, estado_limites(), UMBRAL_MIN)
        print(json.dumps({"abiertas": [t["id"] for t in L.tareas_abiertas(reg)],
                          "latido_hace_min": L.edad_latido_min(reg, m), "tocaria_relevar": toca, "motivo": motivo,
                          "ultimos_relevos": (reg.get("relevos") or [])[-3:]}, ensure_ascii=False, indent=1))
    else:
        print(json.dumps(revisar(forzar=a.forzar), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
