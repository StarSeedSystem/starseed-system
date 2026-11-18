# -*- coding: utf-8 -*-
"""Pruebas herméticas del kit sin internet (MAG1117).

No tocan /Volumes, la red, ~/.starseed ni el disco real: usan datos de mentira,
archivos temporales y dobles inyectados para subprocess, lectura y reloj.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import maggabit_kit as K  # noqa: E402


def capa(identificador: str, papel: str = "reflejo", mb: int = 1,
         sha: str | None = None) -> dict:
    return {
        "id": identificador,
        "capa": papel,
        "sha256": hashlib.sha256(identificador.encode()).hexdigest() if sha is None else sha,
        "archivo": identificador + ".gguf",
        "version": "1.0",
        "tamano_bytes": mb * 1024 * 1024,
        "modelo": "Modelo " + identificador,
    }


class PlanBasico(unittest.TestCase):
    def test_sin_sha_publicado_no_entra_y_lo_dice(self):
        sin_sha = capa("sin-sha", sha="por-verificar")
        sin_clave = capa("sin-clave")
        del sin_clave["sha256"]
        r = K.plan([sin_sha, sin_clave], {}, 100)
        self.assertEqual(r["bajar"], [])
        self.assertEqual(r["ya"], [])
        self.assertEqual(len(r["fuera"]), 2)
        for entrada in r["fuera"]:
            self.assertIn("SHA", entrada["motivo"])

    def test_con_sha_y_sin_presente_se_baja_con_seis_campos(self):
        r = K.plan([capa("nucleo")], {}, 100)
        self.assertEqual(len(r["bajar"]), 1)
        self.assertEqual(r["ya"], [])
        self.assertEqual(r["fuera"], [])
        self.assertEqual(set(r["bajar"][0]),
                         {"archivo", "sistema", "version", "sha256", "bytes", "para_que_sirve"})
        self.assertEqual(r["bajar"][0]["sistema"], "nucleo")
        self.assertEqual(r["bajar"][0]["bytes"], 1024 * 1024)


class PlanConPresentes(unittest.TestCase):
    def test_presente_con_el_mismo_sha_ya_esta(self):
        capa1 = capa("lista")
        r = K.plan([capa1], {"lista": capa1["sha256"]}, 100)
        self.assertEqual(r["ya"][0]["sistema"], "lista")
        self.assertEqual(r["bajar"], [])

    def test_presente_con_otro_sha_se_baja(self):
        r = K.plan([capa("cambiada")], {"cambiada": "f" * 64}, 100)
        self.assertEqual([e["sistema"] for e in r["bajar"]], ["cambiada"])
        self.assertEqual(r["ya"], [])


class PlanPorPapelYTope(unittest.TestCase):
    def test_antes_del_tope_se_ordenan_por_papel(self):
        capas = [capa("prof", "profunda"), capa("raz", "razon"), capa("voz", "voz"),
                 capa("pal", "palabra"), capa("mem", "memoria"), capa("ref", "reflejo")]
        r = K.plan(capas, {}, 100)
        self.assertEqual([e["sistema"] for e in r["bajar"]],
                         ["ref", "mem", "pal", "voz", "raz", "prof"])

    def test_al_pasar_el_tope_queda_fuera_lo_menos_prioritario(self):
        capas = [capa("prof", "profunda", mb=1), capa("ref", "reflejo", mb=1),
                 capa("voz", "voz", mb=1)]
        r = K.plan(capas, {}, 2 / 1024)
        self.assertEqual([e["sistema"] for e in r["bajar"]], ["ref", "voz"])
        self.assertEqual([e["sistema"] for e in r["fuera"]], ["prof"])
        self.assertIn("tope", r["fuera"][0]["motivo"])

    def test_tope_cero_no_baja_nada_y_no_altera_las_entradas(self):
        original = capa("intacta")
        copia = dict(original)
        r = K.plan([original], {}, 0)
        self.assertEqual(r["bajar"], [])
        self.assertEqual(original, copia)
        self.assertIn("tope", r["fuera"][0]["motivo"])


class ComprobarArchivos(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.ruta = os.path.join(self.temporal.name, "capa.gguf")
        with open(self.ruta, "wb") as archivo:
            archivo.write(b"contenido de prueba de la capa")

    def tearDown(self):
        self.temporal.cleanup()

    def test_sha_correcto(self):
        sha = hashlib.sha256(b"contenido de prueba de la capa").hexdigest()
        self.assertTrue(K.comprobar(self.ruta, sha))

    def test_sha_distinto_y_sha_invalido(self):
        self.assertFalse(K.comprobar(self.ruta, "0" * 64))
        self.assertFalse(K.comprobar(self.ruta, "por-verificar"))

    def test_archivo_ausente_no_falla(self):
        self.assertFalse(K.comprobar(self.temporal.name + "/no-esta", "a" * 64))

    def test_lee_por_trozos(self):
        lecturas = []

        def abrir_con_conteo(ruta, modo):
            archivo = open(ruta, modo)

            class Contado:
                def read(self, tamano):
                    lecturas.append(tamano)
                    return archivo.read(tamano)

                def __enter__(self):
                    return self

                def __exit__(self, *_args):
                    archivo.close()
                    return False

            return Contado()

        sha = hashlib.sha256(b"contenido de prueba de la capa").hexdigest()
        self.assertTrue(K.comprobar(self.ruta, sha, abrir=abrir_con_conteo, trozo=7))
        self.assertGreaterEqual(len(lecturas), 5)
        self.assertEqual(set(lecturas), {7})


class IndiceDelKit(unittest.TestCase):
    def resultado(self):
        capas = [capa("lista"), capa("nueva")]
        planeado = K.plan(capas, {"lista": capas[0]["sha256"]}, 100)
        self.assertEqual(len(planeado["bajar"]), 1)
        self.assertEqual(len(planeado["ya"]), 1)
        return planeado

    def test_rutas_del_kit_y_del_indice(self):
        self.assertEqual(K.CARPETA, "RAIZ/MetaGenesis/sin-internet")
        self.assertEqual(K.INDICE, "RAIZ/MetaGenesis/sin-internet/indice.json")

    def test_incluye_lo_que_ya_esta_y_lo_que_se_baja(self):
        archivos = K.indice(self.resultado())["archivos"]
        self.assertEqual([e["sistema"] for e in archivos], ["lista", "nueva"])
        self.assertTrue(all(set(e) == {"archivo", "sistema", "version", "sha256",
                                       "bytes", "para_que_sirve"} for e in archivos))

    def test_instaladores_se_referencian_y_no_se_copian(self):
        instalador = {"archivo": "instalar-app.dmg", "sistema": "instalador",
                      "version": "2", "sha256": "a" * 64, "bytes": 10,
                      "para_que_sirve": "Instala la app sin internet."}
        original = dict(instalador)
        archivos = K.indice(self.resultado(), [instalador])["archivos"]
        self.assertEqual(archivos[-1]["archivo"], "../instaladores/instalar-app.dmg")
        self.assertEqual(instalador, original)
        self.assertEqual(len(archivos), 3)

    def test_reloj_inyectado_sella_la_hora(self):
        self.assertEqual(K.indice(self.resultado(), ahora=lambda: 0.0)["actualizado"],
                         "1970-01-01T00:00:00Z")


class ResultadoFalso:
    def __init__(self, codigo=0):
        self.returncode = codigo


class CorredorFalso:
    def __init__(self, respuesta=None):
        self.respuesta = respuesta
        self.llamadas = []

    def __call__(self, orden, capture_output=True, timeout=None):
        self.llamadas.append((list(orden), timeout))
        if isinstance(self.respuesta, Exception):
            raise self.respuesta
        return self.respuesta or ResultadoFalso()


class CapaFinaDeEntradaSalida(unittest.TestCase):
    def test_cargar_capas_con_lector_inyectado(self):
        vistos = []
        datos = json.dumps({"capas": [capa("del-catalogo")]})

        def leer(ruta, modo, encoding="utf-8"):
            vistos.append((ruta, modo))
            return io.StringIO(datos)

        capas = K.cargar_capas(leer)
        self.assertEqual([c["id"] for c in capas], ["del-catalogo"])
        self.assertEqual(vistos, [(K.CONFIG, "r")])

    def test_cargar_capas_ilegible_devuelve_vacio(self):
        def leer(_ruta, _modo, encoding="utf-8"):
            raise OSError("sin acceso")

        self.assertEqual(K.cargar_capas(leer), [])
        self.assertEqual(K.cargar_capas(lambda *_a, **_k: io.StringIO("no es json")), [])

    def test_copiar_no_tiene_borrado_en_el_origen(self):
        orden = K.orden_copiar("/origen/capa.gguf", "capa.gguf")
        self.assertEqual(orden[0], "rsync")
        self.assertIn("--timeout=", " ".join(orden))
        self.assertNotIn("--delete", orden)
        self.assertIn("/origen/capa.gguf", orden)
        self.assertIn(K.RAIZ + "/MetaGenesis/sin-internet/capa.gguf", orden)

    def test_disco_ausente_no_lanza_nada(self):
        correr = CorredorFalso()
        correr.__call__ = lambda *_a, **_k: self.fail("no debía lanzar nada")
        self.assertEqual(K.ejecutar(["rsync"], correr, existe=lambda _p: False),
                         {"estado": "ausente"})
        self.assertEqual(correr.llamadas, [])

    def test_timeout_devuelve_sin_respuesta_y_siempre_lleva_tope(self):
        correr = CorredorFalso(subprocess.TimeoutExpired("rsync", 5))
        r = K.ejecutar(["rsync"], correr, tope_s=5, existe=lambda _p: True)
        self.assertEqual(r, {"estado": "sin-respuesta"})
        self.assertEqual(correr.llamadas[0][1], 5)

    def test_orden_correcta_y_fallida(self):
        self.assertEqual(K.ejecutar(["rsync"], CorredorFalso(), existe=lambda _p: True),
                         {"estado": "listo"})
        self.assertEqual(K.ejecutar(["rsync"], CorredorFalso(1), existe=lambda _p: True),
                         {"estado": "fallo"})


if __name__ == "__main__":
    unittest.main()
