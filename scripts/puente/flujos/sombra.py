"""Comparación en sombra n8n → Flujos de Genesis (§5 del contrato).

La exportación n8n MÁS RECIENTE (memory/aprendizaje-externos/n8n-export/
<fecha>/*.json) traducida con `importar_n8n`: por cada webhook deja un gancho
de prueba (`<ms>-<ruta>.json`, cuerpo de `_cuerpo_evento` con sha «sombra»)
en una carpeta TEMPORAL y corre `disparadores.pendientes(raiz=tmp)` y
`motor.ejecutar` con el REGISTRO real (parcheando `motor.RAIZ_FLUJOS`, jamás
toca `starseed_memory_root/flujos`), comparando contra lo que daría n8n:
assignments de cada Set de la rama contra `{"body": cuerpo}`. Informe en
memory/aprendizaje-externos/sombra-<fecha>.json (fecha de la exportación);
sale 1 si algo no coincide. Sin red ni procesos; correr desde la raíz.
"""
import json, sys, tempfile, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from scripts.puente.flujos import motor
from scripts.puente.flujos.disparadores import pendientes
from scripts.puente.flujos.expresiones import resolver
from scripts.puente.flujos.importar_n8n import importar
from scripts.puente.flujos.modelo import Nodo, escribir_json, guardar_flujo
from scripts.puente.produccion_webhooks import RUTAS_GANCHO, _cuerpo_evento

EXPORTACIONES = Path("memory/aprendizaje-externos/n8n-export")
INFORMES = Path("memory/aprendizaje-externos")
RUTA_A_EVENTO = {ruta: evento for evento, ruta in RUTAS_GANCHO.items()}


def exportacion_mas_reciente(carpeta: Path = EXPORTACIONES) -> Path:
    """La carpeta `<fecha>` de exportación más reciente que haya."""
    carpetas = sorted((c for c in carpeta.iterdir() if c.is_dir()), key=lambda c: c.name)
    if not carpetas:
        raise FileNotFoundError(f"Sin carpetas de exportación en {carpeta}")
    return carpetas[-1]

def regular_type_version(json_n8n: dict[str, Any]) -> dict[str, Any]:
    """n8n trae `typeVersion` al nivel del nodo y `mapear_set` lo lee dentro de
    los parámetros: sin esta copia un Set v3+ queda `conservar: True` (sombra 0/3)."""
    for nodo in json_n8n.get("nodes", []):
        if nodo.get("type") == "n8n-nodes-base.set":
            nodo.setdefault("parameters", {})["typeVersion"] = nodo.get("typeVersion", 0)
    return json_n8n

def cuerpo_de_prueba(evento: str, flujo_id: str) -> dict[str, Any]:
    """Cuerpo que n8n recibiría; `_cuerpo_evento` añade el evento y el momento."""
    datos = {"sha": "sombra", "medios": ["motor-propio"], "tareas": ["FLU1014Ed"],
             "nota": "Prueba en sombra con el motor propio (no envía nada)",
             "flujo": flujo_id}
    return json.loads(_cuerpo_evento(evento, datos))

def esperado_del_set(nodo: Nodo, cuerpo: dict[str, Any]) -> dict[str, Any]:
    """Lo que daría n8n: assignments evaluados contra `{"body": cuerpo}`."""
    contexto = {"$json": {"body": cuerpo}, "$nodo": {}, "$ahora": ""}
    return {nombre: resolver(valor, contexto)
            for nombre, valor in nodo.configuracion.get("campos", {}).items()}

def _evento_en_sombra(flujo: Any, nodo: Nodo, temporal: Path) -> dict[str, Any]:
    ruta = str(nodo.configuracion.get("ruta") or "")
    evento = RUTA_A_EVENTO.get(ruta, "sombra.prueba")
    cuerpo = cuerpo_de_prueba(evento, flujo.id)
    entrada = temporal / "entrada"
    entrada.mkdir(parents=True, exist_ok=True)
    gancho = json.dumps({"ruta": ruta, "recibido": datetime.now(timezone.utc).isoformat(),
                         "cuerpo": cuerpo}, ensure_ascii=False)
    (entrada / f"{int(time.time() * 1000)}-{ruta}.json").write_text(gancho + "\n", encoding="utf-8")
    par = next(((fp, [it for it in items if it.get("_disparador") == nodo.id])
                for fp, items in pendientes(raiz=temporal)
                if fp.id == flujo.id and any(it.get("_disparador") == nodo.id for it in items)),
               None)
    error = ejecucion = None
    if par is None:
        error = f"disparadores.pendientes no entregó la ruta {ruta!r}"
    else:
        try:
            ejecucion = motor.ejecutar(par[0], par[1])
        except Exception as exc:  # un fallo del motor se informa, nunca se oculta
            error = str(exc)
    por_id = {n.id: n for n in flujo.nodos}
    esperado: dict[str, Any] = {}
    for c in flujo.conexiones:
        if c.origen == nodo.id and por_id[c.destino].tipo == "set":
            esperado.update(esperado_del_set(por_id[c.destino], cuerpo))
    salida = ejecucion.salida if ejecucion is not None and ejecucion.estado == "completa" else []
    obtenido = salida[0] if salida else None
    coincide = error is None and salida == [esperado]
    return {"webhook": nodo.id, "ruta": ruta, "evento": evento, "esperado": esperado,
            "obtenido": obtenido, "coincide": coincide, "error": error}

def correr(carpeta: Path) -> dict[str, Any]:
    """Corre cada JSON de la carpeta por el motor propio; devuelve el informe."""
    eventos: list[dict[str, Any]] = []
    raiz_original = motor.RAIZ_FLUJOS
    with tempfile.TemporaryDirectory() as tmp:
        motor.RAIZ_FLUJOS = Path(tmp)  # toda la sombra vive en una carpeta temporal
        try:
            for archivo in sorted(Path(carpeta).glob("*.json")):
                flujo, informe = importar(regular_type_version(
                    json.loads(archivo.read_text(encoding="utf-8"))))
                guardar_flujo(flujo, motor.RAIZ_FLUJOS)
                eventos.extend(_evento_en_sombra(flujo, n, motor.RAIZ_FLUJOS)
                               for n in flujo.nodos if n.tipo == "webhook")
        finally:
            motor.RAIZ_FLUJOS = raiz_original
    return {"fecha": carpeta.name, "exportacion": str(carpeta), "eventos": eventos,
            "no_traducidos": informe["resumen"]["no_traducidos"],
            "coinciden": sum(1 for e in eventos if e.get("coincide")),
            "total": len(eventos),
            "ok": bool(eventos) and all(e.get("coincide") for e in eventos)}

def escribir_informe(informe: dict[str, Any]) -> Path:
    """`memory/aprendizaje-externos/sombra-<fecha>.json` y devuelve su ruta."""
    ruta = INFORMES / f"sombra-{informe['fecha']}.json"
    escribir_json(ruta, informe)
    return ruta

if __name__ == "__main__":
    informe = correr(exportacion_mas_reciente())
    escribir_informe(informe)
    raise SystemExit(0 if informe["ok"] else 1)
