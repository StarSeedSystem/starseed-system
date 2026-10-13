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
    def setUp(self):
        global CARPETA_TEMP
        if not os.path.isdir(CARPETA_TEMP):
            CARPETA_TEMP = tempfile.mkdtemp(prefix="nodo-test-")
        self.addCleanup(limpiar_temp)
    def test_desconectar_activa_guardar_todo_y_baja(self):
        nodo = NM.Nodo(seco=False, sin_red=True, memoria={}, persistir=False,
                       huella="test-huella-777", llave="llave-test-777777")
        import nodo_metagenesis_medio as M
        M.CARPETA = CARPETA_TEMP
        ruta_c = os.path.join(M.CARPETA, "contenedor.json")
        ruta_d = os.path.join(M.CARPETA, "desconectando.json")
        ruta_olas = os.path.join(M.raiz_repo(), "starseed_memory_root", "olas")
        ruta_guardar = os.path.join(ruta_olas, "control-guardartodo.json")
        # Asegurar que no hay archivos previos del test anterior
        for r in (ruta_c, ruta_d, ruta_guardar):
            if os.path.exists(r):
                os.remove(r)
        # Crear un archivo contenedor previo para que `desconectar` lo desactive
        with open(ruta_c, "w", encoding="utf-8") as f:
            json.dump({"activo": True, "trabajadores": 2}, f)
        estado, texto = nodo._ejecutar({"clave": "test-desc", "accion": "desconectar",
                                       "nodo": nodo.yo, "motivo": "prueba desconectar",
                                       "args": {}, "espera_s": 0},
                                      "neurona", M.raiz_repo(), False, None)
        # `desconectar` debe devolver `hecha` (o `seca` en modo `seco`).
        self.assertIn("hecha", estado)
        # El archivo `contenedor.json` debe estar inactivo
        self.assertTrue(os.path.exists(ruta_c))
        with open(ruta_c, "r", encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(datos.get("activo"), False)
        # El archivo `desconectando.json` debe existir
        self.assertTrue(os.path.exists(ruta_d))
        with open(ruta_d, "r", encoding="utf-8") as f:
            datos_d = json.load(f)
        self.assertTrue(datos_d.get("desconectando"))
        # El archivo `control-guardartodo.json` debe existir (simula `guardar_todo`)
        self.assertTrue(os.path.exists(ruta_guardar))
        with open(ruta_guardar, "r", encoding="utf-8") as f:
            datos_g = json.load(f)
        self.assertEqual(datos_g.get("accion"), "guardar_todo")
        # El mensaje debe mencionar `traspaso`
        self.assertIn("traspaso", texto)

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
