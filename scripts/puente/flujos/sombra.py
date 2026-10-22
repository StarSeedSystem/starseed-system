"""Sombra: el flujo de n8n Cloud da lo mismo en el motor propio de Flujos.

Por cada webhook del flujo exportado de n8n se fabrica un evento de prueba con
el cuerpo que enviaría `produccion_webhooks`, se deja como gancho en una
carpeta TEMPORAL y se corre el camino real (gancho → `disparadores.pendientes`
→ `motor.ejecutar`); luego se compara con lo que daría el Set de esa rama.
`starseed_memory_root/flujos` no se toca nunca: el motor se parchea con la
carpeta temporal. CLI: python3 -m scripts.puente.flujos.sombra
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RAIZ_REPO = Path(__file__).resolve().parents[3]
if str(RAIZ_REPO) not in sys.path:
    sys.path.insert(0, str(RAIZ_REPO))

from scripts.puente.flujos import disparadores, motor
from scripts.puente.flujos.importar_n8n import importar
from scripts.puente.flujos.modelo import Flujo, guardar_flujo
from scripts.puente.produccion_webhooks import RUTAS_GANCHO, _cuerpo_evento

RAIZ_EXPORT = RAIZ_REPO / "memory/aprendizaje-externos/n8n-export"
RAIZ_INFORME = RAIZ_REPO / "memory/aprendizaje-externos"
# El evento de prueba: lo mismo que mandaría el director de producción.
SOMBRA = {"sha": "sombra", "medios": ["web", "mando"], "tareas": ["T-SOMBRA"], "nota": "prueba en sombra"}
EXPRESION = re.compile(r"^=\s*\{\{\s*\$json\.body\.(?P<clave>[A-Za-z0-9_]+)\s*\}\}$")
EVENTO_DE_RUTA = {ruta: evento for evento, ruta in RUTAS_GANCHO.items()}
NOTA = ("Se comparan los campos que define el Set de n8n; el motor deja además el sobre del "
        "webhook (body/headers/query/params) porque el importador marca el Set como «conservar».")


def _set_de_rama(n8n: dict[str, Any], flujo: Flujo, origen: str) -> dict[str, Any]:
    """El nodo Set de n8n que cuelga del webhook `origen` (su rama)."""
    alcanzables, visita = {origen}, [origen]
    while visita:
        actual = visita.pop(0)
        for destino in [c.destino for c in flujo.conexiones if c.origen == actual]:
            if destino not in alcanzables:
                alcanzables.add(destino)
                visita.append(destino)
    for nodo in n8n.get("nodes", []):
        if nodo.get("id") in alcanzables and nodo.get("type") == "n8n-nodes-base.set":
            return nodo
    return {}


def _sombra_de_flujo(n8n: dict[str, Any], tmp: Path) -> dict[str, Any]:
    """Compara un flujo de n8n con el motor propio y devuelve su parte del informe."""
    flujo, _ = importar(n8n)
    guardar_flujo(flujo, tmp)
    motor.RAIZ_FLUJOS = tmp  # el motor nunca toca starseed_memory_root/flujos
    eventos = []
    for webhook in [n for n in n8n.get("nodes", []) if n.get("type") == "n8n-nodes-base.webhook"]:
        ruta = str(webhook.get("parameters", {}).get("path", ""))
        set_n8n = _set_de_rama(n8n, flujo, str(webhook.get("id", "")))
        evento = EVENTO_DE_RUTA.get(ruta, ruta.rsplit("-", 1)[-1])
        cuerpo = json.loads(_cuerpo_evento(evento, SOMBRA).decode("utf-8"))
        esperado = {}
        params = set_n8n.get("parameters", {}) or {}
        for asignacion in (params.get("assignments", {}) or {}).get("assignments", []) or []:
            valor = asignacion.get("value")
            encontrado = EXPRESION.match(valor.strip()) if isinstance(valor, str) else None
            esperado[asignacion.get("name")] = cuerpo.get(encontrado.group("clave")) if encontrado else valor
        gancho = tmp / "entrada"
        gancho.mkdir(parents=True, exist_ok=True)
        (gancho / f"{int(datetime.now(timezone.utc).timestamp() * 1000)}-{ruta}.json").write_text(
            json.dumps({"ruta": ruta, "recibido": datetime.now(timezone.utc).isoformat(),
                        "cuerpo": cuerpo}, ensure_ascii=False), encoding="utf-8")
        salida, estado = {}, "sin ejecutar"
        for pendiente, entrada in disparadores.pendientes(raiz=tmp):
            if pendiente.id != flujo.id:
                continue
            ejecucion = motor.ejecutar(pendiente, entrada)
            salida = ejecucion.salida[0] if ejecucion.salida else {}
            estado = ejecucion.estado
        obtenido = {campo: salida.get(campo) for campo in esperado}
        eventos.append({"evento": evento, "ruta": ruta, "esperado": esperado, "obtenido": obtenido,
                        "salida": salida, "estado": estado,
                        "coincide": esperado == obtenido and estado == "completa"})
    return {"flujo": flujo.id, "nombre": flujo.nombre, "eventos": eventos}


def main(argv: list[str] | None = None) -> int:
    """Corre la sombra y escribe el informe; sale con 1 si algo no coincide."""
    parser = argparse.ArgumentParser(description="Sombra: n8n Cloud contra el motor propio de Flujos")
    parser.add_argument("--exportacion", default="", help="Carpeta de exportación (por defecto, la más reciente)")
    parser.add_argument("--informe", default="", help="Ruta del informe (por defecto, sombra-<fecha>.json)")
    args = parser.parse_args(argv)
    carpetas = sorted(p for p in RAIZ_EXPORT.iterdir() if p.is_dir())
    carpeta = Path(args.exportacion) if args.exportacion else (carpetas[-1] if carpetas else None)
    if carpeta is None:
        print(f"No hay exportaciones de n8n en {RAIZ_EXPORT}")
        return 1
    with tempfile.TemporaryDirectory(prefix="flujos-sombra-") as temporal:
        tmp = Path(temporal)
        archivos = [a for a in sorted(carpeta.glob("*.json")) if ".informe." not in a.name]
        flujos = [_sombra_de_flujo(json.loads(a.read_text(encoding="utf-8")), tmp) for a in archivos]
    eventos = [evento for flujo in flujos for evento in flujo["eventos"]]
    informe = {"fecha": datetime.now(timezone.utc).date().isoformat(),
               "exportacion": str(carpeta.relative_to(RAIZ_REPO)) if carpeta.is_relative_to(RAIZ_REPO) else str(carpeta),
               "flujos": flujos, "eventos": eventos, "total": len(eventos), "nota": NOTA,
               "coinciden": sum(1 for evento in eventos if evento["coincide"]),
               "todos_coinciden": bool(eventos) and all(evento["coincide"] for evento in eventos)}
    destino = Path(args.informe) if args.informe else RAIZ_INFORME / f"sombra-{informe['fecha']}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(informe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{informe['coinciden']} de {informe['total']} coinciden · informe en {destino}")
    return 0 if informe["todos_coinciden"] else 1


if __name__ == "__main__":
    sys.exit(main())
