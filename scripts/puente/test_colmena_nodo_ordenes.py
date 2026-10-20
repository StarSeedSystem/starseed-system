# -*- coding: utf-8 -*-
"""Pruebas del nodo con órdenes `desconectar` y `contenedor` (COL1012F).

Usa bus, disco y reloj falsos (inyección en Nodo). No depende de red real.
Comentarios en español con acentos, como pide el contrato de diseño.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import unittest
import json
import time
import tempfile
import shutil
from unittest.mock import patch

import nodo_metagenesis as NM
import nodo_metagenesis_logica as L


CARPETA_TEMP = tempfile.mkdtemp(prefix="nodo-test-")


def limpiar_temp():
    shutil.rmtree(CARPETA_TEMP, ignore_errors=True)


class TestNodoContenedor(unittest.TestCase):
    def setUp(self):
        self.addCleanup(limpiar_temp)
    def test_contenedor_escribe_json(self):
        nodo = NM.Nodo(seco=False, sin_red=True, memoria={}, persistir=False,
                       huella="test-huella-123456", llave="llave-test-1234567890abcdef1234567890")
        nodo.mem.setdefault("autonomia", True)
        # Inyectar CARPETA temporal para que escriba en disco de prueba
        import nodo_metagenesis_medio as M
        M.CARPETA = CARPETA_TEMP
        ruta = os.path.join(CARPETA_TEMP, "contenedor.json")
        # Limpiar antes
        if os.path.exists(ruta):
            os.remove(ruta)
        informe = nodo.vuelta()
        # La orden `contenedor` se envía a través del bus simulado; en modo sin_red
        # el nodo no recibe órdenes del bus, así que simulamos directamente.
        # Aquí verificamos que el archivo no existe aún (no hay orden en sin_red).
        # Para probar la ejecución directa, usamos _ejecutar con una orden simulada.
        args_cont = {"activo": True, "trabajadores": 2}
        estado, texto = nodo._ejecutar({"clave": "test-c", "accion": "contenedor",
                                       "nodo": nodo.yo, "motivo": "prueba contenedor",
                                       "args": args_cont, "espera_s": 0},
                                      "neurona", M.raiz_repo(), False, None)
        self.assertIn("hecha", estado)
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, "r", encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(datos.get("activo"), True)
        self.assertEqual(datos.get("trabajadores"), 2)
        self.assertIn("t", datos)

    def test_contenedor_inactivo(self):
        nodo = NM.Nodo(seco=False, sin_red=True, memoria={}, persistir=False,
                       huella="test-huella-654321", llave="llave-test-0987654321fedcba0987654321")
        import nodo_metagenesis_medio as M
        M.CARPETA = CARPETA_TEMP
        ruta = os.path.join(CARPETA_TEMP, "contenedor.json")
        if os.path.exists(ruta):
            os.remove(ruta)
        estado, texto = nodo._ejecutar({"clave": "test-d", "accion": "contenedor",
                                       "nodo": nodo.yo, "motivo": "prueba inactivo",
                                       "args": {"activo": False}, "espera_s": 0},
                                      "neurona", M.raiz_repo(), False, None)
        self.assertIn("hecha", estado)
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, "r", encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(datos.get("activo"), False)

    def test_contenedor_con_trabajadores_fuera_de_rango_falla_validacion(self):
        # Según `colmena_logica`, `contenedor` con `trabajadores` fuera de 1-4 debe fallar.
        # Aquí comprobamos que `ejecutar` rechaza argumentos inválidos.
        # `ejecutar` llama a `L.args_validos` a través de la acción; pero `contenedor`
        # en `ejecutar` no valida argumentos explícitamente (la validación ya pasó por `_orden`).
        # Verificamos que la ejecución con argumentos válidos funciona.
        nodo = NM.Nodo(seco=False, sin_red=True, memoria={}, persistir=False,
                       huella="test-huella-111", llave="llave-test-111111")
        import nodo_metagenesis_medio as M
        M.CARPETA = CARPETA_TEMP
        ruta = os.path.join(CARPETA_TEMP, "contenedor.json")
        if os.path.exists(ruta):
            os.remove(ruta)
        # Trabajadores = 5 debe ser rechazado por la validación de la orden, no por `ejecutar`.
        # Comprobamos que `L.args_validos` detecta el error.
        malos = L.args_validos("contenedor", {"activo": True, "trabajadores": 5})
        self.assertIn("trabajadores fuera de 1–4", malos)


class TestNodoDesconectar(unittest.TestCase):
    """«Desconectar» dice lo que hace de verdad: apaga el contenedor, marca la desconexión y cuenta lo que
    tenía a medias. NO promete traspaso (COL1012E/G/H no están cableados) ni inventa tareas."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="desc-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.carpeta = os.path.join(self.tmp, "nodo")
        self.raiz = os.path.join(self.tmp, "repo")
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)

    def desconectar(self, cola="cola-x.json"):
        import nodo_metagenesis_medio as M
        nodo = NM.Nodo(seco=False, sin_red=True, memoria={}, persistir=False,
                       huella="test-huella-777", llave="llave-test-777777")
        with patch.object(M, "CARPETA", self.carpeta), patch.object(M, "colas_vivas", return_value=[cola] if cola else []):
            return nodo._ejecutar({"clave": "test-desc", "accion": "desconectar", "nodo": nodo.yo,
                                   "motivo": "prueba desconectar", "args": {}, "espera_s": 0},
                                  "neurona", self.raiz, False, None)

    def test_desconectar_apaga_el_contenedor_y_marca_la_desconexion(self):
        os.makedirs(self.carpeta)
        with open(os.path.join(self.carpeta, "contenedor.json"), "w", encoding="utf-8") as f:
            json.dump({"activo": True, "trabajadores": 2}, f)
        antes = time.time()
        estado, texto = self.desconectar()
        self.assertEqual(estado, "hecha")
        with open(os.path.join(self.carpeta, "contenedor.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["activo"], False)
        with open(os.path.join(self.carpeta, "desconectando.json"), encoding="utf-8") as f:
            marca = json.load(f)
        self.assertTrue(marca["desconectando"])
        self.assertGreaterEqual(marca["t"], antes)
        # Nadie lee una orden «guardar_todo» ni la espera: ya no se finge escribirla.
        self.assertFalse(os.path.exists(os.path.join(self.olas, "control-guardartodo.json")))

    def test_desconectar_cuenta_lo_real_y_no_promete_traspaso(self):
        with open(os.path.join(self.olas, "latidos-cola-x.json"), "w", encoding="utf-8") as f:
            json.dump({"tareas": {"T1": {"fase": "escribiendo"}, "T2": {"fase": "completando"}, "T3": {"fase": "tsc"},
                                  "T4": {"fase": "integrando"}, "T5": {"fase": "hecho"}}}, f)
        with open(os.path.join(self.olas, "puntos-control.json"), "w", encoding="utf-8") as f:
            json.dump({"T1": {"rama": "ola/T1", "sha": "abc", "t": 1.0}}, f)
        estado, texto = self.desconectar()
        self.assertEqual(estado, "hecha")
        self.assertIn("4 tarea(s) en curso, 1 con punto de control en este aparato", texto)
        self.assertIn("el traspaso a otro contenedor aún no está activo", texto)
        self.assertNotIn("tarea-ejemplo", texto)
        self.assertNotIn("traspaso con", texto)

    def test_desconectar_sin_trabajo_dice_cero(self):
        estado, texto = self.desconectar(cola=None)
        self.assertEqual(estado, "hecha")
        self.assertIn("0 tarea(s) en curso, 0 con punto de control", texto)

    def test_el_latido_ve_la_desconexion_un_rato(self):
        import nodo_metagenesis_medio as M
        self.desconectar()
        with patch.object(M, "CARPETA", self.carpeta):
            self.assertTrue(M.desconectando_ahora(time.time()))
            self.assertFalse(M.desconectando_ahora(time.time() + 3600))

    def test_desconectar_seco(self):
        nodo = NM.Nodo(seco=True, sin_red=True, memoria={}, persistir=False,
                       huella="test-huella-999", llave="llave-test-999999")
        import nodo_metagenesis_medio as M
        M.CARPETA = CARPETA_TEMP
        estado, texto = nodo._ejecutar({"clave": "test-desc-seco", "accion": "desconectar",
                                       "nodo": nodo.yo, "motivo": "prueba seco",
                                       "args": {}, "espera_s": 0},
                                      "neurona", M.raiz_repo(), True, None)
        self.assertIn("seca", estado)
        # En modo seco el mensaje menciona el motivo de la acción, no el nombre de la orden.
        self.assertIn("prueba seco", texto)


if __name__ == "__main__":
    unittest.main()
