"""Modelo persistente de los Flujos de Genesis."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
import os
from pathlib import Path
from typing import Any

RAIZ_FLUJOS = Path("starseed_memory_root/flujos")

@dataclass(frozen=True)
class Nodo:
    id: str
    tipo: str
    configuracion: dict[str, Any] = field(default_factory=dict)
    reintentos: int = 0
    espera_ms: int = 0

@dataclass(frozen=True)
class Conexion:
    origen: str
    destino: str

@dataclass
class Flujo:
    id: str
    nombre: str
    nodos: list[Nodo]
    conexiones: list[Conexion] = field(default_factory=list)
    flujo_error: str | None = None

    def __post_init__(self) -> None:
        validar_flujo(self)

@dataclass
class Ejecucion:
    id: str
    flujo_id: str
    estado: str
    entrada: list[dict[str, Any]]
    nodos: dict[str, dict[str, Any]] = field(default_factory=dict)
    salida: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    siguiente: int = 0

def _orden(flujo: Flujo) -> list[str]:
    """Ordena el DAG; las salidas de un nodo bucle son retroenlaces."""
    por_id = {n.id: n for n in flujo.nodos}
    grados = {n.id: 0 for n in flujo.nodos}
    salidas: dict[str, list[str]] = {n.id: [] for n in flujo.nodos}
    for conexion in flujo.conexiones:
        if por_id[conexion.origen].tipo == "bucle":
            continue
        grados[conexion.destino] += 1
        salidas[conexion.origen].append(conexion.destino)
    pendientes = [n.id for n in flujo.nodos if grados[n.id] == 0]
    orden: list[str] = []
    while pendientes:
        actual = pendientes.pop(0)
        orden.append(actual)
        for destino in salidas[actual]:
            grados[destino] -= 1
            if grados[destino] == 0:
                pendientes.append(destino)
    if len(orden) != len(flujo.nodos):
        raise ValueError("El flujo contiene un ciclo sin nodo de tipo bucle")
    return orden

def validar_flujo(flujo: Flujo) -> None:
    ids = [n.id for n in flujo.nodos]
    if not flujo.id or any(not valor for valor in ids):
        raise ValueError("El flujo y sus nodos necesitan un id")
    if len(ids) != len(set(ids)):
        raise ValueError("Los ids de nodo deben ser únicos")
    conocidos = set(ids)
    for conexion in flujo.conexiones:
        if conexion.origen not in conocidos or conexion.destino not in conocidos:
            raise ValueError("Una conexión apunta a un nodo inexistente")
    if any(n.reintentos < 0 or n.espera_ms < 0 for n in flujo.nodos):
        raise ValueError("Los reintentos y la espera no pueden ser negativos")
    _orden(flujo)

def _seguro(valor: Any) -> Any:
    secretos = {v for v in os.environ.values() if v}
    if isinstance(valor, str):
        return "[PROTEGIDO]" if valor in secretos else valor
    if isinstance(valor, dict):
        return {str(k): _seguro(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [_seguro(v) for v in valor]
    return valor

def escribir_json(ruta: Path, valor: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(ruta.suffix + ".tmp")
    temporal.write_text(json.dumps(_seguro(valor), ensure_ascii=False,
                                   indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporal.replace(ruta)

def guardar_flujo(flujo: Flujo, raiz: Path = RAIZ_FLUJOS) -> Path:
    validar_flujo(flujo)
    ruta = raiz / f"{flujo.id}.json"
    escribir_json(ruta, asdict(flujo))
    return ruta


def cargar_flujo(flujo_id: str, raiz: Path = RAIZ_FLUJOS) -> Flujo:
    datos = json.loads((raiz / f"{flujo_id}.json").read_text(encoding="utf-8"))
    datos["nodos"] = [Nodo(**nodo) for nodo in datos["nodos"]]
    datos["conexiones"] = [Conexion(**conexion) for conexion in datos["conexiones"]]
    flujo = Flujo(**datos)
    validar_flujo(flujo)
    return flujo


orden_topologico = _orden
