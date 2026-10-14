"""Pruebas del modelo y el motor durable de flujos."""

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.puente.flujos import (Conexion, Flujo, Nodo, ejecutar,
                                   guardar_flujo, reanudar, validar_flujo)


class MotorFlujosTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporal = tempfile.TemporaryDirectory()
        self.cwd = patch("os.getcwd", return_value=self.temporal.name)
        self.anterior = os.getcwd()
        os.chdir(self.temporal.name)

    def tearDown(self) -> None:
        os.chdir(self.anterior)
        self.temporal.cleanup()

    def test_orden_y_ramas(self) -> None:
        vistos: list[tuple[str, list[dict[str, object]]]] = []

        def accion(nombre: str):
            def aplicar(items, _config):
                vistos.append((nombre, items))
                return [{**item, nombre: True} for item in items]
            return aplicar

        flujo = Flujo("ramas", "Ramas", [Nodo("a", "a"), Nodo("b", "b"),
                      Nodo("c", "c")], [Conexion("a", "b"), Conexion("a", "c")])
        resultado = ejecutar(flujo, {"valor": 1},
                             {letra: accion(letra) for letra in "abc"})
        self.assertEqual([nombre for nombre, _ in vistos], ["a", "b", "c"])
        self.assertEqual(len(resultado.salida), 2)
        self.assertEqual(resultado.estado, "completa")

    def test_validacion_del_grafo(self) -> None:
        with self.assertRaisesRegex(ValueError, "únicos"):
            Flujo("f", "F", [Nodo("x", "t"), Nodo("x", "t")])
        with self.assertRaisesRegex(ValueError, "ciclo"):
            Flujo("f", "F", [Nodo("x", "t"), Nodo("y", "t")],
                  [Conexion("x", "y"), Conexion("y", "x")])
        validar_flujo(Flujo("f", "F", [Nodo("x", "t"), Nodo("b", "bucle")],
                            [Conexion("x", "b"), Conexion("b", "x")]))

    def test_reintenta_con_espera_creciente(self) -> None:
        intentos = 0

        def inestable(items, _config):
            nonlocal intentos
            intentos += 1
            if intentos < 3:
                raise RuntimeError("todavía no")
            return items

        flujo = Flujo("retry", "Retry", [Nodo("n", "inestable", reintentos=2)])
        with patch("scripts.puente.flujos.motor.time.sleep") as dormir:
            resultado = ejecutar(flujo, [{}], {"inestable": inestable})
        self.assertEqual(resultado.estado, "completa")
        self.assertEqual(resultado.nodos["n"]["intentos"], 3)
        self.assertEqual(dormir.call_count, 2)

    def test_ejecuta_el_flujo_de_error(self) -> None:
        avisos: list[dict[str, object]] = []
        error = Flujo("errores", "Errores", [Nodo("aviso", "avisar")])
        guardar_flujo(error)
        principal = Flujo("principal", "Principal", [Nodo("falla", "fallar")],
                          flujo_error="errores")
        registro = {
            "fallar": lambda _i, _c: (_ for _ in ()).throw(RuntimeError("roto")),
            "avisar": lambda items, _c: avisos.extend(items) or items,
        }
        resultado = ejecutar(principal, [{}], registro)
        self.assertEqual(resultado.estado, "fallida")
        self.assertEqual(avisos[0]["error"], "roto")

    def test_reanuda_desde_el_ultimo_nodo_completo(self) -> None:
        veces = {"a": 0, "b": 0}

        def contar(nombre, falla=False):
            def accion(items, _config):
                veces[nombre] += 1
                if falla:
                    raise RuntimeError("corte simulado")
                return items
            return accion

        flujo = Flujo("durable", "Durable", [Nodo("a", "a"), Nodo("b", "b")],
                      [Conexion("a", "b")])
        primera = ejecutar(flujo, [{}], {"a": contar("a"), "b": contar("b", True)})
        segunda = reanudar(primera.id, {"a": contar("a"), "b": contar("b")})
        self.assertEqual(segunda.estado, "completa")
        self.assertEqual(veces, {"a": 1, "b": 2})

    def test_no_persiste_valores_del_entorno(self) -> None:
        secreto = "valor-secreto-irrepetible"
        with patch.dict(os.environ, {"CLAVE_FLUJO": secreto}):
            flujo = Flujo("seguro", "Seguro",
                          [Nodo("n", "eco", {"referencia": "CLAVE_FLUJO",
                                               "incorrecto": secreto})])
            ruta = guardar_flujo(flujo)
            ejecutar(flujo, [{"secreto": secreto}], {"eco": lambda items, _c: items})
        self.assertNotIn(secreto, ruta.read_text(encoding="utf-8"))
        ejecucion = next(Path("starseed_memory_root/flujos/ejecuciones/seguro").glob("*.json"))
        self.assertNotIn(secreto, ejecucion.read_text(encoding="utf-8"))
        self.assertEqual(json.loads(ruta.read_text())["nodos"][0]["configuracion"]["referencia"],
                         "CLAVE_FLUJO")

    def _flujo_dos_disparadores(self) -> Flujo:
        return Flujo("doble", "Doble",
                     [Nodo("g1", "webhook"), Nodo("s1", "set"),
                      Nodo("g2", "webhook"), Nodo("s2", "set")],
                     [Conexion("g1", "s1"), Conexion("g2", "s2")])

    def _registro_falso(self, vistos: list[str]) -> dict:
        def ejecutor_set(items, _config):
            vistos.append("set")
            return [{**item, "ok": True} for item in items]
        return {"set": ejecutor_set,
                "webhook": lambda items, _c: items}

    def test_solo_corre_la_rama_del_disparador(self) -> None:
        vistos: list[str] = []
        registro = self._registro_falso(vistos)
        flujo = self._flujo_dos_disparadores()
        resultado = ejecutar(flujo, [{"_disparador": "g2", "dato": 1}], registro)
        self.assertEqual(vistos, ["set"])
        self.assertEqual(resultado.estado, "completa")
        self.assertEqual(len(resultado.salida), 1)
        self.assertEqual(resultado.nodos["s1"]["estado"], "omitido")
        self.assertEqual(resultado.nodos["g1"]["estado"], "omitido")
        self.assertEqual(resultado.nodos["s2"]["salida"][0]["dato"], 1)

    def test_sin_marca_ejecuta_todo_el_grafo(self) -> None:
        vistos: list[str] = []
        registro = self._registro_falso(vistos)
        flujo = self._flujo_dos_disparadores()
        resultado = ejecutar(flujo, [{"dato": 1}], registro)
        self.assertEqual(vistos, ["set", "set"])
        self.assertEqual(len(resultado.salida), 2)

    def test_reanudar_respeta_la_rama_guardada(self) -> None:
        corte = {"hecho": False}

        def set_falloso(items, _config):
            if not corte["hecho"]:
                corte["hecho"] = True
                raise RuntimeError("corte en la rama")
            return items

        flujo = self._flujo_dos_disparadores()
        registro = {"set": set_falloso, "webhook": lambda i, _c: i}
        primera = ejecutar(flujo, [{"_disparador": "g1"}], registro)
        self.assertEqual(primera.estado, "fallida")
        segunda = reanudar(primera.id, registro)
        self.assertEqual(segunda.estado, "completa")
        self.assertEqual(len(segunda.salida), 1)
        self.assertEqual(segunda.nodos["s2"]["estado"], "omitido")


if __name__ == "__main__":
    unittest.main()
