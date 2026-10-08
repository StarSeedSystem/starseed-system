"""Servicio de Flujos de Genesis: bucle, reanudación y avisos.

Lo lanza launchd como SCRIPT (`python3 …/flujos/servicio.py`, `instalar-servicios.py`), no como
módulo. (2026-10-08, medido) Con los imports relativos de abajo eso moría al arrancar con
«attempted relative import with no known parent package» y launchd lo relanzaba cada 30 s:
`com.starseed.flujos` llevaba días en un bucle de caídas (último estado 1) en una Mac sin RAM,
y la autocuración se colgaba 30 s intentando reiniciarlo. Si no hay paquete, se monta el de
`scripts.puente.flujos` desde la raíz del repo antes de importar nada.
"""
from __future__ import annotations
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

if not __package__:
    _RAIZ = str(Path(__file__).resolve().parents[3])
    if _RAIZ not in sys.path:
        sys.path.insert(0, _RAIZ)
    import importlib

    importlib.import_module("scripts.puente.flujos")
    __package__ = "scripts.puente.flujos"

from .disparadores import pendientes
from .modelo import RAIZ_FLUJOS
from .motor import ejecutar, reanudar

MAX_CONCURRENTES = 2
INTERVALO = 10

def _reanudar_pendientes() -> None:
    ejecuciones = Path(RAIZ_FLUJOS) / "ejecuciones"
    if not ejecuciones.exists():
        return
    for flujo_dir in ejecuciones.iterdir():
        if not flujo_dir.is_dir():
            continue
        for archivo in flujo_dir.glob("*.json"):
            try:
                reanudar(archivo.stem)
            except Exception:
                pass

def _avisar_fallo(flujo_id: str, ejec_id: str, error: str) -> None:
    try:
        from scripts.puente.director_chat import publicar
        texto = (
            f"Flujo falló: {flujo_id}\n"
            f"Ejecución: {ejec_id}\n"
            f"Error: {error}"
        )
        publicar(texto, de="flujos-servicio", rol="sistema", tipo="aviso")
    except Exception:
        pass

def _ejecutar_pares(pares: list[tuple[Any, list[dict[str, Any]]]]) -> None:
    def trabajo(flujo, entrada):
        try:
            res = ejecutar(flujo, entrada)
            if res.estado == "fallida":
                _avisar_fallo(flujo.id, res.id, res.error or "desconocido")
        except Exception as exc:
            _avisar_fallo(flujo.id, "", str(exc))
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENTES) as pool:
        for flujo, entrada in pares:
            pool.submit(trabajo, flujo, entrada)

def main() -> None:
    _reanudar_pendientes()
    while True:
        try:
            pares = pendientes()
            if pares:
                _ejecutar_pares(pares)
        except Exception:
            pass
        time.sleep(INTERVALO)

if __name__ == "__main__":
    if "--comprobar" in sys.argv:
        # Arranque en seco: importa todo y sale. Lo usa la prueba y quien quiera saber si
        # el servicio puede arrancar sin dejarlo en bucle.
        print("flujos: listo")
        sys.exit(0)
    main()

