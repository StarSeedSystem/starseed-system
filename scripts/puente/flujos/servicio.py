#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Servicio `flujos` (com.starseed.flujos): el corazón en marcha de los
Flujos de Genesis. Cada INTERVALO_S segundos: `disparadores.pendientes()` →
`motor.ejecutar` de los flujos activos. Al arrancar, `motor.reanudar` de las
ejecuciones a medias. Avisa al Chat Director solo si un flujo falla del
todo, con enlace a la ejecución en Genesis. Tope simultáneo: 2 (Mac de 8
GB). Todo lo externo se inyecta: las pruebas corren con fakes sin red.
"""

from __future__ import annotations

from concurrent.futures import Executor, ThreadPoolExecutor
import json
from pathlib import Path
import time
from typing import Any, Callable  # noqa: F401  (Executor guía a lectores)

from . import disparadores, motor
from .modelo import Ejecucion, Flujo, RAIZ_FLUJOS

INTERVALO_S = 10
TOPE_SIMULTANEOS = 2  # la Mac es de 8 GB: nunca más de dos flujos a la vez


def _decir_canal(texto: str, tipo: str = "mensaje", **extra: Any) -> None:
    """Publica en el canal común del Chat Director (scripts/puente/puente.py)."""
    from .. import puente  # import perezoso: el servicio no arranca el puente
    puente.decir(texto, quien="flujos", tipo=tipo, **extra)


def ejecuciones_a_medias(raiz: Path = RAIZ_FLUJOS) -> list[str]:
    """Ids de ejecuciones que quedaron «pendiente» o «ejecutando»: se retoman
    en el nodo donde iban al reanudar el servicio."""
    carpeta = Path(raiz) / "ejecuciones"
    ids: list[str] = []
    for archivo in sorted(carpeta.glob("*/*.json")):
        try:
            datos: dict[str, Any] = json.loads(
                archivo.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if datos.get("estado") in ("pendiente", "ejecutando") and datos.get("id"):
            ids.append(str(datos["id"]))
    return ids


def _avisar_fracaso(ejecucion: Ejecucion,
                    decir: Callable[..., None] = _decir_canal) -> None:
    """Avisa en Genesis solo cuando el flujo falló DEL TODO (el motor ya
    reintentó por nodo y corrió el flujo de error si lo hay)."""
    enlace = ("http://localhost:9002/genesis/flujos?ejecucion="
              + ejecucion.id)
    decir(f"El flujo «{ejecucion.flujo_id}» falló del todo: "
          f"{ejecucion.error}. Ejecución: {enlace}",
          tipo="error", tarea=ejecucion.flujo_id)


def _ejecutar_uno(mod_motor: Any, flujo: Flujo, entrada: list[dict[str, Any]],
                  decir: Callable[..., None]) -> None:
    """Una ejecución entera; solo avisa si el flujo cae por completo."""
    ejecucion = mod_motor.ejecutar(flujo, entrada)
    if ejecucion.estado == "fallida":
        _avisar_fracaso(ejecucion, decir)


class ServicioFlujos:
    """Bucle del servicio. Todo lo externo (motor, disparadores, canal y
    ejecutor) entra inyectado para poder probarlo sin red ni disco."""

    def __init__(self, mod_motor: Any = motor,
                 mod_disparadores: Any = disparadores,
                 decir: Callable[..., None] = _decir_canal,
                 ejecutor: Any = None) -> None:  # duck: basta con `submit`
        self._motor, self._disparadores, self._decir = (
            mod_motor, mod_disparadores, decir)
        self._ejecutor = ejecutor or ThreadPoolExecutor(
            max_workers=TOPE_SIMULTANEOS, thread_name_prefix="flujos")

    def reanudar_al_arrancar(self, raiz: Path = RAIZ_FLUJOS) -> int:
        """Retoma las ejecuciones a medias dejadas por un reinicio."""
        ids = ejecuciones_a_medias(raiz)
        for id_ejecucion in ids:
            self._ejecutor.submit(self._reanudar_una, id_ejecucion)
        return len(ids)

    def _reanudar_una(self, id_ejecucion: str) -> None:
        try:
            ejecucion = self._motor.reanudar(id_ejecucion)
        except Exception as error:
            self._decir(f"No pude reanudar la ejecución {id_ejecucion}: "
                        f"{error}", tipo="aviso")
            return
        if ejecucion.estado == "fallida":
            _avisar_fracaso(ejecucion, self._decir)

    def ciclo(self) -> int:
        """Una pasada: consume pendientes y lanza ejecuciones; el ejecutor
        encola lo que pase del tope de dos simultáneas."""
        pendientes = self._disparadores.pendientes()
        for flujo, entrada in pendientes:
            self._ejecutor.submit(_ejecutar_uno, self._motor, flujo,
                                  entrada, self._decir)
        return len(pendientes)

    def correr(self, intervalo_s: float = INTERVALO_S) -> None:
        """Bucle eterno del servicio: arranca reanudando y no se detiene."""
        self.reanudar_al_arrancar()
        self._decir("Servicio de Flujos de Genesis en marcha "
                    f"(cada {intervalo_s}s, máx. {TOPE_SIMULTANEOS} a la vez)",
                    tipo="hecho")
        while True:
            try:
                self.ciclo()
            except Exception as error:  # un ciclo roto nunca tumba el servicio
                self._decir(f"Ciclo de flujos falló y se reintenta: {error}",
                            tipo="aviso")
            time.sleep(intervalo_s)


if __name__ == "__main__":
    ServicioFlujos().correr()
