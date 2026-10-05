"""Ejecución durable y sin red de los Flujos del Mando."""
from __future__ import annotations
from dataclasses import asdict
import json
from pathlib import Path
import time
from typing import Any, Callable
from uuid import uuid4
from .modelo import (Ejecucion, Flujo, Nodo, RAIZ_FLUJOS, cargar_flujo,
                     escribir_json, guardar_flujo, orden_topologico, validar_flujo)
Items = list[dict[str, Any]]
FuncionNodo = Callable[[Items, dict[str, Any]], Items]
REGISTRO: dict[str, FuncionNodo] = {}
def _ruta(ejecucion: Ejecucion) -> Path:
    return RAIZ_FLUJOS / "ejecuciones" / ejecucion.flujo_id / f"{ejecucion.id}.json"
def _persistir(ejecucion: Ejecucion) -> None:
    escribir_json(_ruta(ejecucion), asdict(ejecucion))
def _entradas(flujo: Flujo, nodo_id: str, ejecucion: Ejecucion) -> Items:
    origenes = [c.origen for c in flujo.conexiones if c.destino == nodo_id]
    if not origenes:
        return [dict(item) for item in ejecucion.entrada]
    items: Items = []
    for origen in origenes:
        items.extend(dict(item) for item in
                     ejecucion.nodos.get(origen, {}).get("salida", []))
    return items
def _milisegundos(inicio: Any, fin: Any) -> int:
    diferencia = fin - inicio
    segundos = diferencia.total_seconds() if hasattr(
        diferencia, "total_seconds") else float(diferencia)
    return max(0, round(segundos * 1000))
def _ejecutar_nodo(nodo: Nodo, items: Items, funcion: FuncionNodo,
                   ahora: Callable[[], Any], guardar: Callable[[Ejecucion], None],
                   ejecucion: Ejecucion) -> Items:
    inicio = ahora()
    registro = {"entrada": items, "salida": [], "error": None,
                "ms": 0, "intentos": 0, "estado": "ejecutando"}
    ejecucion.nodos[nodo.id] = registro
    guardar(ejecucion)
    for intento in range(nodo.reintentos + 1):
        registro["intentos"] = intento + 1
        try:
            salida = funcion(items, dict(nodo.configuracion))
            if not isinstance(salida, list) or any(not isinstance(i, dict) for i in salida):
                raise TypeError("Un nodo debe devolver una lista de diccionarios")
            registro.update(salida=salida, estado="completo",
                            ms=_milisegundos(inicio, ahora()))
            return salida
        except Exception as error:  # el registro durable conserva el fallo real
            registro.update(error=str(error), ms=_milisegundos(inicio, ahora()))
            guardar(ejecucion)
            if intento == nodo.reintentos:
                registro["estado"] = "fallido"
                raise
            time.sleep(nodo.espera_ms * (intento + 1) / 1000)
    return []
def _continuar(flujo: Flujo, ejecucion: Ejecucion,
               nodos: dict[str, FuncionNodo], ahora: Callable[[], Any],
               guardar: Callable[[Ejecucion], None]) -> Ejecucion:
    orden = orden_topologico(flujo)
    por_id = {nodo.id: nodo for nodo in flujo.nodos}
    ejecucion.estado = "ejecutando"
    guardar(ejecucion)
    try:
        for indice in range(ejecucion.siguiente, len(orden)):
            nodo = por_id[orden[indice]]
            if nodo.tipo not in nodos:
                raise KeyError(f"No hay ejecutor registrado para el tipo {nodo.tipo}")
            items = _entradas(flujo, nodo.id, ejecucion)
            _ejecutar_nodo(nodo, items, nodos[nodo.tipo], ahora, guardar, ejecucion)
            ejecucion.siguiente = indice + 1
            guardar(ejecucion)
        con_salida = {c.origen for c in flujo.conexiones}
        terminales = [nodo_id for nodo_id in orden if nodo_id not in con_salida]
        terminales = terminales or orden[-1:]
        ejecucion.salida = [dict(item) for nodo_id in terminales
                            for item in ejecucion.nodos[nodo_id]["salida"]]
        ejecucion.estado = "completa"
        ejecucion.error = None
    except Exception as error:
        ejecucion.estado = "fallida"
        ejecucion.error = str(error)
    guardar(ejecucion)
    return ejecucion
def ejecutar(flujo: Flujo, entrada: Items | dict[str, Any],
             nodos: dict[str, FuncionNodo] = REGISTRO,
             ahora: Callable[[], Any] = time.monotonic,
             guardar: Callable[[Ejecucion], None] | None = None) -> Ejecucion:
    """Ejecuta el grafo y devuelve su registro durable, aun cuando falle."""
    validar_flujo(flujo)
    guardar_flujo(flujo, RAIZ_FLUJOS)
    items = [entrada] if isinstance(entrada, dict) else entrada
    ejecucion = Ejecucion(uuid4().hex, flujo.id, "pendiente", [dict(i) for i in items])
    persistencia = guardar or _persistir
    resultado = _continuar(flujo, ejecucion, nodos, ahora, persistencia)
    if resultado.estado == "fallida" and flujo.flujo_error:
        try:
            error = cargar_flujo(flujo.flujo_error, RAIZ_FLUJOS)
            ejecutar(error, [{"ejecucion": resultado.id,
                              "flujo": flujo.id, "error": resultado.error}],
                     nodos=nodos, ahora=ahora, guardar=guardar)
        except Exception:
            pass  # el fallo original nunca queda oculto por el manejador
    return resultado
def _cargar_ejecucion(id_ejecucion: str) -> Ejecucion:
    coincidencias = list((RAIZ_FLUJOS / "ejecuciones").glob(f"*/{id_ejecucion}.json"))
    if len(coincidencias) != 1:
        raise FileNotFoundError(f"Ejecución no encontrada: {id_ejecucion}")
    datos = json.loads(coincidencias[0].read_text(encoding="utf-8"))
    return Ejecucion(**datos)
def reanudar(id_ejecucion: str, nodos: dict[str, FuncionNodo] = REGISTRO,
             ahora: Callable[[], Any] = time.monotonic,
             guardar: Callable[[Ejecucion], None] | None = None) -> Ejecucion:
    ejecucion = _cargar_ejecucion(id_ejecucion)
    if ejecucion.estado == "completa":
        return ejecucion
    flujo = cargar_flujo(ejecucion.flujo_id, RAIZ_FLUJOS)
    return _continuar(flujo, ejecucion, nodos, ahora, guardar or _persistir)
