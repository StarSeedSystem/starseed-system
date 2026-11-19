# -*- coding: utf-8 -*-
"""Pruebas herméticas de respaldo_datos.py (SEG1119D).

Solo lógica pura: plan, nombres, rotación y que ningún secreto viaje por argv.
No toca red, llavero, Supabase ni disco real.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import respaldo_datos as R  # noqa: E402

CLAVE = "contrasena-de-prueba-que-no-debe-salir"
URL = "postgresql://usuario:secreto@base.invalida:5432/os"


class TestNombres(unittest.TestCase):
    def test_nombre_por_tipo_y_fecha(self):
        self.assertEqual(R.nombre_archivo("datos", "2026-11-19"), "datos-os-2026-11-19.gpg")
        self.assertEqual(R.nombre_archivo("memorias", "2026-11-19"), "memorias-meta-2026-11-19.gpg")

    def test_es_nuestro_solo_lo_propio(self):
        self.assertTrue(R.es_nuestro("datos-os-2026-11-19.gpg"))
        self.assertTrue(R.es_nuestro("memorias-meta-2026-11-19.gpg"))
        self.assertFalse(R.es_nuestro("claves-mac-2026-11-19.gpg"))
        self.assertFalse(R.es_nuestro("datos-os-2026-11-19.sql"))
        self.assertFalse(R.es_nuestro("otra-cosa.gpg"))


class TestRotacion(unittest.TestCase):
    def test_conserva_los_14_mas_nuevos(self):
        existentes = ["memorias-meta-2026-11-%02d.gpg" % d for d in range(1, 17)]
        sobran = R.rotar(existentes)
        self.assertEqual(len(sobran), 2)
        self.assertIn("memorias-meta-2026-11-01.gpg", sobran)
        self.assertIn("memorias-meta-2026-11-02.gpg", sobran)
        self.assertNotIn("memorias-meta-2026-11-16.gpg", sobran)

    def test_cuenta_lo_nuevo_antes_de_borrar(self):
        existentes = ["datos-os-2026-11-%02d.gpg" % d for d in range(1, 15)]
        sobran = R.rotar(existentes, ["datos-os-2026-11-15.gpg"])
        self.assertEqual(sobran, ["datos-os-2026-11-01.gpg"])

    def test_no_toca_archivos_ajenos(self):
        existentes = ["claves-mac-2026-01-01.gpg", "nota.txt", "datos-os-2026-11-19.gpg"]
        self.assertEqual(R.rotar(existentes), [])

    def test_mezcla_tipos_y_ordena_por_nombre(self):
        existentes = (["datos-os-2026-11-%02d.gpg" % d for d in range(1, 9)]
                      + ["memorias-meta-2026-11-%02d.gpg" % d for d in range(1, 9)])
        sobran = R.rotar(existentes)
        self.assertEqual(len(sobran), 2)


class TestCredenciales(unittest.TestCase):
    def test_detecta_la_variable_sin_leer_su_valor(self):
        self.assertEqual(R.credenciales_db({"SUPABASE_DB_URL": URL}), "SUPABASE_DB_URL")
        self.assertEqual(R.credenciales_db({"DATABASE_URL": URL}), "DATABASE_URL")
        self.assertIsNone(R.credenciales_db({}))
        self.assertIsNone(R.credenciales_db({"SUPABASE_DB_URL": "   "}))

    def test_no_inventa_variables_de_pago(self):
        self.assertNotIn("OPENROUTER_SHARED_KEY", R.VARIABLES_DB)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", R.VARIABLES_DB)


class TestPlan(unittest.TestCase):
    def test_sin_credenciales_omite_la_base_y_avisa(self):
        p = R.plan(fecha="2026-11-19", existentes={}, variables_db=[])
        datos = [a for a in p["artefactos"] if a["tipo"] == "datos"][0]
        self.assertTrue(datos["omitir"])
        self.assertEqual(datos["motivo"], "sin-variable-de-entorno")
        self.assertEqual(len(p["envios"]), 3)
        self.assertTrue(all(e["archivo"].startswith("memorias-meta-") for e in p["envios"]))

    def test_con_credenciales_envia_dos_artefactos_a_tres_medios(self):
        p = R.plan(fecha="2026-11-19", variables_db=["SUPABASE_DB_URL"], existentes={})
        self.assertEqual(len(p["envios"]), 6)
        self.assertEqual({e["destino"] for e in p["envios"]}, set(R.DESTINOS))
        self.assertEqual({e["archivo"] for e in p["envios"]},
                         {R.nombre_archivo("datos", "2026-11-19"),
                          R.nombre_archivo("memorias", "2026-11-19")})

    def test_plan_calcula_rotacion_por_destino(self):
        existentes = {"maggabox": ["datos-os-2026-11-%02d.gpg" % d for d in range(1, 16)],
                      "a1": [], "gdrive": ["ajeno.txt"]}
        p = R.plan(fecha="2026-11-19", variables_db=["SUPABASE_DB_URL"], existentes=existentes)
        self.assertEqual(len(p["rotacion"]["maggabox"]), 3)
        self.assertEqual(p["rotacion"]["a1"], [])
        self.assertEqual(p["rotacion"]["gdrive"], [])

    def test_plan_no_contiene_secretos(self):
        p = R.plan(fecha="2026-11-19", variables_db=["SUPABASE_DB_URL"], existentes={})
        texto = json.dumps(p, ensure_ascii=False)
        self.assertNotIn(URL, texto)
        self.assertNotIn(CLAVE, texto)
        self.assertNotIn("secreto", texto)


class TestOrdenesSinSecretos(unittest.TestCase):
    def test_cifrar_usa_stdin_y_no_argv(self):
        argv = R.comando_cifrar("entrada", "salida.gpg")
        self.assertIn("--passphrase-fd", argv)
        self.assertNotIn(CLAVE, " ".join(argv))
        self.assertNotIn(CLAVE, argv)

    def test_subida_y_huella_no_llevan_credenciales(self):
        for argv in (R.comando_subida("gdrive", "/tmp/x.gpg", "datos-os-2026-11-19.gpg"),
                     R.comando_subida("maggabox", "/tmp/x.gpg", "datos-os-2026-11-19.gpg"),
                     R.comando_huella("a1", "datos-os-2026-11-19.gpg")):
            self.assertNotIn(URL, " ".join(argv))
            self.assertNotIn(CLAVE, " ".join(argv))

    def test_respaldar_seco_no_ejecuta_nada(self):
        llamadas = []

        def ejecutar(*args, **kwargs):
            llamadas.append(args)
            raise AssertionError("no debe ejecutarse nada en seco")

        resultado = R.respaldar(ejecutar=ejecutar, fecha="2026-11-19", seco=True)
        self.assertEqual(resultado["estado"], "seco")
        self.assertEqual(llamadas, [])

    def test_los_errores_no_arrastran_la_credencial(self):
        self.assertEqual(R._sin_secreto("fallo con " + URL, URL), "fallo con ***")
        self.assertEqual(R._sin_secreto("sin nada", URL), "sin nada")
        self.assertEqual(R._sin_secreto("texto", ""), "texto")

    def test_rotar_destino_borra_solo_lo_que_sobra(self):
        existentes = ["claves-mac-2026-01-01.gpg"] + [
            "datos-os-2026-11-%02d.gpg" % d for d in range(1, 15)]
        borrados = []
        sobran = R._rotar_destino("maggabox", ["datos-os-2026-11-15.gpg"],
                                  lambda d: list(existentes),
                                  lambda d, n: borrados.append(n))
        self.assertEqual(sobran, ["datos-os-2026-11-01.gpg"])
        self.assertEqual(borrados, ["datos-os-2026-11-01.gpg"])
