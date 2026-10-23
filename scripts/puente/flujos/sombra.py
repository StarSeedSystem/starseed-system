"""Sombra permanente: el flujo de n8n frente al motor propio (§5 del contrato).

Por cada webhook del flujo exportado crea un evento de prueba (el cuerpo que
emite `produccion_webhooks._cuerpo_evento`), lo deja como archivo de gancho en
una carpeta TEMPORAL, lo recoge `disparadores.pendientes` y lo ejecuta el
motor con el REGISTRO real. Compara con lo que daría n8n (los `assignments`
del Set de esa rama). Nunca toca `starseed_memory_root/flujos`.
Sale con 1 si algo no coincide.
"""
from __future__ import annotations

from datetime import date
import json
from pathlib import Path
import sys
import tempfile

RAIZ_REPO = Path(__file__).resolve().parents[3]
if str(RAIZ_REPO) not in sys.path:
    sys.path.insert(0, str(RAIZ_REPO))

from scripts.puente import produccion_webhooks as pw  # noqa: E402
from scripts.puente.flujos import REGISTRO, disparadores, guardar_flujo, motor  # noqa: E402
from scripts.puente.flujos.importar_n8n import importar  # noqa: E402

EXPORTACIONES = RAIZ_REPO / "memory/aprendizaje-externos/n8n-export"
INFORMES = RAIZ_REPO / "memory/aprendizaje-externos"


def exportacion_reciente() -> Path:
    """El JSON del flujo en la carpeta de exportación con la fecha más nueva."""
    for carpeta in sorted((c for c in EXPORTACIONES.iterdir() if c.is_dir()), reverse=True):
        jsons = sorted(carpeta.glob("*.json"))
        if jsons:
            return jsons[0]
    raise FileNotFoundError("sin exportaciones de n8n")


def evaluar(valor, cuerpo: dict):
    """`={{ $json.body.X }}` → cuerpo[X]; cualquier otra cosa, constante."""
    if isinstance(valor, str) and valor.startswith("={{") and "$json.body." in valor:
        return cuerpo.get(valor.split("$json.body.", 1)[1].split("}}")[0].strip())
    return valor


def esperado_n8n(exportado: dict, nombre_webhook: str, cuerpo: dict) -> dict:
    """Salida del Set conectado al webhook, evaluado contra {"body": cuerpo}."""
    destinos = exportado["connections"][nombre_webhook]["main"][0]
    por_nombre = {n["name"]: n for n in exportado["nodes"]}
    asignaciones = por_nombre[destinos[0]["node"]]["parameters"]["assignments"]["assignments"]
    return {a["name"]: evaluar(a["value"], cuerpo) for a in asignaciones}


def comparar(ruta_json: Path) -> dict:
    exportado = json.loads(ruta_json.read_text(encoding="utf-8"))
    flujo, _ = importar(exportado)
    informe = {"flujo": ruta_json.stem, "exportacion": str(ruta_json.relative_to(RAIZ_REPO)),
               "registro_del_motor": sorted(REGISTRO), "eventos": []}
    webhooks = [n for n in exportado["nodes"] if n["type"] == "n8n-nodes-base.webhook"]
    antes = motor.RAIZ_FLUJOS
    with tempfile.TemporaryDirectory() as tmp:
        raiz = Path(tmp)
        motor.RAIZ_FLUJOS = raiz  # jamás toca starseed_memory_root/flujos
        guardar_flujo(flujo, raiz)
        try:
            for i, wh in enumerate(webhooks):
                ruta = wh["parameters"]["path"]
                evento = ruta.replace("starseed-", "", 1).replace("-", ".", 1)
                cuerpo = json.loads(pw._cuerpo_evento(evento, {
                    "sha": "sombra", "medios": ["web", "mando"],
                    "tareas": ["T-SOMBRA"], "nota": "prueba en sombra"}))
                (raiz / "entrada").mkdir(exist_ok=True)
                (raiz / "entrada" / f"{i:013d}-{ruta}.json").write_text(
                    json.dumps({"ruta": ruta, "recibido": i, "cuerpo": cuerpo}), encoding="utf-8")
                esperado = esperado_n8n(exportado, wh["name"], cuerpo)
                obtenido, error = None, None
                for fl, entrada in disparadores.pendientes(raiz=raiz):
                    if fl.id == flujo.id:
                        ej = motor.ejecutar(fl, entrada)
                        obtenido, error = (ej.salida or [None])[0], ej.error
                if isinstance(obtenido, dict):
                    obtenido = {k: obtenido.get(k) for k in esperado}
                informe["eventos"].append({"evento": evento, "ruta": ruta, "esperado": esperado,
                                           "obtenido": obtenido, "error": error,
                                           "coincide": obtenido == esperado})
        finally:
            motor.RAIZ_FLUJOS = antes
    informe["coincide"] = all(e["coincide"] for e in informe["eventos"])
    return informe


def main() -> int:
    informe = comparar(exportacion_reciente())
    salida = INFORMES / f"sombra-{date.today().isoformat()}.json"
    salida.write_text(json.dumps(informe, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"sombra: {'coincide' if informe['coincide'] else 'NO COINCIDE'} → {salida.name}")
    return 0 if informe["coincide"] else 1


if __name__ == "__main__":
    sys.exit(main())
