"""Pruebas del servicio de flujos: motor y disparadores falsos, sin red y
sin disco real (disco solo en un temporal para `ejecuciones_a_medias`)."""

from __future__ import annotations

from concurrent.futures import Future
import json
from pathlib import Path
import tempfile
import unittest
from typing import Any

from scripts.puente.flujos.modelo import Ejecucion, Flujo, Nodo
from scripts.puente.flujos import servicio


class EjecutorSincrono:
    """Ejecutor falso: corre todo al momento; imita `submit` de Executor."""

    def __init__(self) -> None:
        self.lanzadas: list[Any] = []

    def submit(self, funcion: Any, *args: Any) -> Future:
        self.lanzadas.append(funcion)
        futuro: Future = Future()
        try:
            futuro.set_result(funcion(*args))
        except Exception as error:
            futuro.set_exception(error)
        return futuro


class DisparadoresFalsos:
    def __init__(self, parejas: list[Any]) -> None:
        self.parejas = parejas

    def pendientes(self) -> list[Any]:
        return list(self.parejas)


class MotorFalso:
    def __init__(self, estado: str = "completa") -> None:
        self.estado = estado
        self.ejecutadas: list[tuple[str, list[Any]]] = []
        self.reanudadas: list[str] = []

    def ejecutar(self, flujo: Flujo, entrada: list[Any]) -> Ejecucion:
        self.ejecutadas.append((flujo.id, entrada))
        return Ejecucion("e-" + flujo.id, flujo.id, self.estado, entrada,
                         error="boom" if self.estado == "fallida" else None)

    def reanudar(self, id_ejecucion: str) -> Ejecucion:
        self.reanudadas.append(id_ejecucion)
        return Ejecucion(id_ejecucion, "f1", "completa", [])


def _flujo(id_flujo: str = "f1") -> Flujo:
    return Flujo(id=id_flujo, nombre="Flujo de prueba",
                 nodos=[Nodo(id="n1", tipo="chat"),
                        Nodo(id="n2", tipo="http")])


class ServicioFlujosPruebas(unittest.TestCase):
    def setUp(self) -> None:
        self.avisos: list[dict[str, Any]] = []
        self.motor = MotorFalso()
        self.disparadores = DisparadoresFalsos([])

    def _servicio(self) -> servicio.ServicioFlujos:
        avisos = self.avisos
        return servicio.ServicioFlujos(
            mod_motor=self.motor, mod_disparadores=self.disparadores,
            decir=lambda texto, tipo="mensaje", **kw:
                avisos.append({"texto": texto, "tipo": tipo}),
            ejecutor=EjecutorSincrono())

    def test_ciclo_ejecuta_lo_pendiente_en_silencio(self) -> None:
        self.disparadores.parejas = [(_flujo(), [{"disparador": "chat"}])]
        self.assertEqual(self._servicio().ciclo(), 1)
        self.assertEqual(self.motor.ejecutadas,
                         [("f1", [{"disparador": "chat"}])])
        self.assertEqual(self.avisos, [])  # completa => silencio

    def test_ciclo_avisa_solo_si_falla_del_todo(self) -> None:
        self.motor.estado = "fallida"
        self.disparadores.parejas = [(_flujo(), [])]
        self._servicio().ciclo()
        self.assertEqual(len(self.avisos), 1)
        self.assertEqual(self.avisos[0]["tipo"], "error")
        for fragmento in ("falló del todo", "e-f1", "genesis"):
            self.assertIn(fragmento, self.avisos[0]["texto"])

    def test_tope_de_simultaneas_es_dos(self) -> None:
        self.assertEqual(servicio.TOPE_SIMULTANEOS, 2)  # la Mac es de 8 GB

    def test_reanudar_las_que_quedaron_a_medias(self) -> None:
        with tempfile.TemporaryDirectory() as temporal:
            carpeta = Path(temporal) / "ejecuciones" / "f1"
            carpeta.mkdir(parents=True)
            (carpeta / "a.json").write_text(json.dumps(
                {"id": "a", "estado": "ejecutando"}), encoding="utf-8")
            (carpeta / "b.json").write_text(json.dumps(
                {"id": "b", "estado": "completa"}), encoding="utf-8")
            (carpeta / "c.json").write_text("roto", encoding="utf-8")
            self.assertEqual(
                self._servicio().reanudar_al_arrancar(Path(temporal)), 1)
            self.assertEqual(self.motor.reanudadas, ["a"])
            self.assertEqual(
                servicio.ejecuciones_a_medias(Path(temporal)), ["a"])

    def test_reanudar_averiada_avisa_sin_caerse(self) -> None:
        class MotorRoto(MotorFalso):
            def reanudar(self, id_ejecucion: str) -> Ejecucion:
                raise FileNotFoundError("no está")

        self.motor = MotorRoto()
        s = self._servicio()
        s._ejecutor.submit(s._reanudar_una, "fantasma")
        self.assertEqual(self.avisos[0]["tipo"], "aviso")
        self.assertIn("fantasma", self.avisos[0]["texto"])


if __name__ == "__main__":
    unittest.main()
