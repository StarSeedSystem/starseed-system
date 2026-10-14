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

    def test_ejecuta_todos_los_nodos_sin_disparador(self) -> None:
        """Sin campo disparador, ejecuta todos los nodos (comportamiento original)."""
        vistos: list[str] = []

        def hacer_visto(nombre: str):
            def aplicar(items, _config):
                vistos.append(nombre)
                return [{**item, "visto": True} for item in items]
            return aplicar

        # Flujo: webhook -> set1 -> set2
        #           \-> set3 -> set4
        flujo = Flujo(
            id="flujo1",
            nombre="Flujo 1",
            nodos=[
                Nodo("webhook", "webhook"),
                Nodo("set1", "set1"),
                Nodo("set2", "set2"),
                Nodo("set3", "set3"),
                Nodo("set4", "set4"),
            ],
            conexiones=[
                Conexion("webhook", "set1"),
                Conexion("webhook", "set3"),
                Conexion("set1", "set2"),
                Conexion("set3", "set4"),
            ]
        )
        
        # Entrada sin campo disparador
        entrada = [{"datos": "inicial"}]
        
        resultado = ejecutar(
            flujo,
            entrada,
            {
                "webhook": hacer_visto("webhook"),
                "set1": hacer_visto("set1"),
                "set2": hacer_visto("set2"),
                "set3": hacer_visto("set3"),
                "set4": hacer_visto("set4"),
            }
        )
        
        # Debería haber ejecutado todos los nodos
        self.assertEqual(resultado.estado, "completa")
        self.assertEqual(set(vistos), {"webhook", "set1", "set2", "set3", "set4"})
        # La salida debería contener los resultados de los nodos terminales (set2 y set4)
        self.assertEqual(len(resultado.salida), 2)

    def test_ejecuta_solo_nodos_alcanzables_con_disparador(self) -> None:
        """Con campo disparador, solo ejecuta nodos alcanzables desde ese nodo."""
        vistos: list[str] = []

        def hacer_visto(nombre: str):
            def aplicar(items, _config):
                vistos.append(nombre)
                return [{**item, "visto": True} for item in items]
            return aplicar

        # Flujo: webhook1 -> set1 -> set2
        #           webhook2 -> set3 -> set4
        flujo = Flujo(
            id="flujo2",
            nombre="Flujo 2",
            nodos=[
                Nodo("webhook1", "webhook1"),
                Nodo("webhook2", "webhook2"),
                Nodo("set1", "set1"),
                Nodo("set2", "set2"),
                Nodo("set3", "set3"),
                Nodo("set4", "set4"),
            ],
            conexiones=[
                Conexion("webhook1", "set1"),
                Conexion("set1", "set2"),
                Conexion("webhook2", "set3"),
                Conexion("set3", "set4"),
            ]
        )
        
        # Entrada con disparador apuntando a webhook2
        entrada = [{"datos": "inicial", "disparador": "webhook2"}]
        
        resultado = ejecutar(
            flujo,
            entrada,
            {
                "webhook1": hacer_visto("webhook1"),
                "webhook2": hacer_visto("webhook2"),
                "set1": hacer_visto("set1"),
                "set2": hacer_visto("set2"),
                "set3": hacer_visto("set3"),
                "set4": hacer_visto("set4"),
            }
        )
        
        # Debería haber ejecutado solo webhook2, set3 y set4 (alcanzables desde webhook2)
        self.assertEqual(resultado.estado, "completa")
        self.assertEqual(set(vistos), {"webhook2", "set3", "set4"})
        # La salida debería contener solo el resultado de set4 (terminal alcanzable)
        self.assertEqual(len(resultado.salida), 1)
        self.assertEqual(resultado.salida[0]["visto"], True)

    def test_marca_nodos_no_alcanzables_como_omitido(self) -> None:
        """Los nodos no alcanzables desde el disparador se marcan como 'omitido'."""
        # Flujo: webhook1 -> set1 -> set2
        #           webhook2 -> set3 -> set4
        flujo = Flujo(
            id="flujo3",
            nombre="Flujo 3",
            nodos=[
                Nodo("webhook1", "webhook1"),
                Nodo("webhook2", "webhook2"),
                Nodo("set1", "set1"),
                Nodo("set2", "set2"),
                Nodo("set3", "set3"),
                Nodo("set4", "set4"),
            ],
            conexiones=[
                Conexion("webhook1", "set1"),
                Conexion("set1", "set2"),
                Conexion("webhook2", "set3"),
                Conexion("set3", "set4"),
            ]
        )
        
        # Entrada con disparador apuntando a webhook2
        entrada = [{"datos": "inicial", "disparador": "webhook2"}]
        
        resultado = ejecutar(
            flujo,
            entrada,
            {
                "webhook1": lambda items, _c: items,
                "webhook2": lambda items, _c: items,
                "set1": lambda items, _c: items,
                "set2": lambda items, _c: items,
                "set3": lambda items, _c: items,
                "set4": lambda items, _c: items,
            }
        )
        
        # Verificar que los nodos alcanzables se ejecutaron normalmente
        self.assertEqual(resultado.nodos["webhook2"]["estado"], "completo")
        self.assertEqual(resultado.nodos["set3"]["estado"], "completo")
        self.assertEqual(resultado.nodos["set4"]["estado"], "completo")
        
        # Verificar que los nodos no alcanzables se marcaron como omitidos
        self.assertEqual(resultado.nodos["webhook1"]["estado"], "omitido")
        self.assertEqual(resultado.nodos["set1"]["estado"], "omitido")
        self.assertEqual(resultado.nodos["set2"]["estado"], "omitido")
        
        # Los nodos omitidos no deben tener entrada ni salida reales
        self.assertEqual(resultado.nodos["webhook1"]["entrada"], [])
        self.assertEqual(resultado.nodos["webhook1"]["salida"], [])
        self.assertEqual(resultado.nodos["set1"]["entrada"], [])
        self.assertEqual(resultado.nodos["set1"]["salida"], [])
        self.assertEqual(resultado.nodos["set2"]["entrada"], [])
        self.assertEqual(resultado.nodos["set2"]["salida"], [])

    def test_reanuda_respetando_disparador(self) -> None:
        """La reanudación respeta el mismo lógica de disparador."""
        vistos: list[str] = []

        def hacer_visto(nombre: str):
            def aplicar(items, _config):
                vistos.append(nombre)
                return [{**item, "visto": True} for item in items]
            return aplicar

        # Flujo: webhook -> set1 -> set2 (set2 fallará a propósito para probar reanudación)
        flujo = Flujo(
            id="flujo4",
            nombre="Flujo 4",
            nodos=[
                Nodo("webhook", "webhook"),
                Nodo("set1", "set1"),
                Nodo("set2", "set2"),
            ],
            conexiones=[
                Conexion("webhook", "set1"),
                Conexion("set1", "set2"),
            ]
        )
        
        # Primera ejecución: set2 falla
        def set1_func(items, _config):
            vistos.append("set1")
            return [{**item, "procesado": True} for item in items]
            
        def set2_func(items, _config):
            vistos.append("set2")
            raise RuntimeError("fallo intencional")
        
        entrada_con_disparador = [{"datos": "inicial", "disparador": "webhook"}]
        
        primera = ejecutar(
            flujo,
            entrada_con_disparador,
            {
                "webhook": hacer_visto("webhook"),
                "set1": set1_func,
                "set2": set2_func,
            }
        )
        
        self.assertEqual(primera.estado, "fallida")
        self.assertEqual(set(vistos), {"webhook", "set1", "set2"})
        
        # Reiniciar la lista de vistos para la segunda ejecución
        vistos.clear()
        
        # Segunda ejecución: debería reanudar desde set2 y tener éxito
        segunda = reanudar(
            primera.id,
            {
                "webhook": hacer_visto("webhook"),
                "set1": set1_func,  # No se volverá a ejecutar porque ya está completo
                "set2": lambda items, _c: vistos.append("set2") or [{**item, "recuperado": True} for item in items],  # Nuevo comportamiento
            }
        )
        
        self.assertEqual(segunda.estado, "completa")
        # Solo debería haber ejecutado set2 (porque webhook y set1 ya estaban completos)
        # y el nuevo set2 que recupera
        self.assertEqual(vistos, ["set2"])
        self.assertEqual(segunda.salida[0]["recuperado"], True)

if __name__ == "__main__":
    unittest.main()
