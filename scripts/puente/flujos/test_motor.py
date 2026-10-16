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

        flujo = Flujo(id="ramas", nombre="Ramas", nodos=[Nodo("a", "a"), Nodo("b", "b"), Nodo("c", "c")],
                      conexiones=[Conexion("a", "b"), Conexion("a", "c")])
        resultado = ejecutar(flujo, {"valor": 1},
                             {letra: accion(letra) for letra in "abc"})
        self.assertEqual([nombre for nombre, _ in vistos], ["a", "b", "c"])
        self.assertEqual(len(resultado.salida), 2)
        self.assertEqual(resultado.estado, "completa")

    def test_validacion_del_grafo(self) -> None:
        with self.assertRaisesRegex(ValueError, "únicos"):
            Flujo(id="f", nombre="F", nodos=[Nodo("x", "t"), Nodo("x", "t")])
        with self.assertRaisesRegex(ValueError, "ciclo"):
            Flujo(id="f", nombre="F", nodos=[Nodo("x", "t"), Nodo("y", "t")],
                  conexiones=[Conexion("x", "y"), Conexion("y", "x")])
        validar_flujo(Flujo(id="f", nombre="F", nodos=[Nodo("x", "t"), Nodo("b", "bucle")],
                            conexiones=[Conexion("x", "b"), Conexion("b", "x")]))

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

    def test_ejecuta_solo_rama_disparador(self) -> None:
        # Fluxo con dos ramas independientes: webhook1 -> set1, webhook2 -> set2
        def accion_passthrough(items, _config):
            return items

        def accion_set(campo: str):
            def aplicar(items, _config):
                return [{**item, campo: True} for item in items]
            return aplicar

        flujo = Flujo(
            id="rama_disparador",
            nombre="Rama Disparador",
            nodos=[
                Nodo("webhook1", "webhook"),
                Nodo("set1", "set", {"campo": "set1"}),
                Nodo("webhook2", "webhook"),
                Nodo("set2", "set", {"campo": "set2"}),
            ],
            conexiones=[
                Conexion("webhook1", "set1"),
                Conexion("webhook2", "set2"),
            ],
        )
        nodos = {
            "webhook": accion_passthrough,
            "set": lambda items, config: accion_set(config["campo"])(items, {}),
        }

        # Caso 1: sin _disparador -> se ejecutan ambas ramas
        resultado_todo = ejecutar(flujo, [{"valor": 1}], nodos)
        self.assertEqual(resultado_todo.estado, "completa")
        # Comprobar que todos los nodos están completos
        for nodo_id in ["webhook1", "set1", "webhook2", "set2"]:
            self.assertEqual(
                resultado_todo.nodos[nodo_id]["estado"], "completo",
                f"El nodo {nodo_id} debería estar completo"
            )
        # La salida debe tener dos items: uno de cada rama
        self.assertEqual(len(resultado_todo.salida), 2)
        # Uno tiene set1: True, el otro set2: True
        campos = [set(item.keys()) - {"valor"} for item in resultado_todo.salida]
        self.assertIn({"set1"}, campos)
        self.assertIn({"set2"}, campos)

        # Caso 2: con _disparador en el segundo webhook -> solo se ejecuta la segunda rama
        entrada_con_disparador = [{"valor": 1, "_disparador": "webhook2"}]
        resultado_parcial = ejecutar(flujo, entrada_con_disparador, nodos)
        self.assertEqual(resultado_parcial.estado, "completa")
        # Los nodos de la primera rama deben estar omitidos
        self.assertEqual(
            resultado_parcial.nodos["webhook1"]["estado"], "omitido"
        )
        self.assertEqual(
            resultado_parcial.nodos["set1"]["estado"], "omitido"
        )
        # Los nodos de la segunda rama deben estar completos
        self.assertEqual(
            resultado_parcial.nodos["webhook2"]["estado"], "completo"
        )
        self.assertEqual(
            resultado_parcial.nodos["set2"]["estado"], "completo"
        )
        # La salida debe tener un solo item (de la segunda rama)
        self.assertEqual(len(resultado_parcial.salida), 1)
        item = resultado_parcial.salida[0]
        self.assertEqual(item["valor"], 1)
        self.assertTrue(item.get("set2"))
        self.assertFalse(item.get("set1", False))  # No debe tener set1


if __name__ == "__main__":
    unittest.main()
