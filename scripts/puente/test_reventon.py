# -*- coding: utf-8 -*-
"""Pruebas de reventon.py, con las salidas REALES del 16/09."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import reventon as R

#: Recortada de la salida que el Mando mostró como «los tipos no compilan».
CRASH_REAL = """
79: 0x102da4688 node::builtins::BuiltinLoader::CompileAndCall(v8::Local<v8::Context>, char const*, node::Realm*) [/Users/alex/.nvm/versions/node/v22.14.0/bin/node]
81: 0x102e54f40 node::Realm::ExecuteBootstrapper(char const*) [/Users/alex/.nvm/versions/node/v22.14.0/bin/node]
85: 0x102e100f0 node::NodeMainInstance::Run() [/Users/alex/.nvm/versions/node/v22.14.0/bin/node]
87: 0x191445d54 start [/usr/lib/dyld]
"""

#: Un error de tipos de verdad, del mismo repo.
TIPOS_REAL = (
    "src/lib/mando/modelos-disponibles.ts(88,7): error TS2322: "
    "Type 'string' is not assignable to type 'EstadoPasarela'.\n"
    "Found 1 error in src/lib/mando/modelos-disponibles.ts:88\n"
)


class TestEsReventon(unittest.TestCase):
    def test_el_crash_que_nos_mintio(self):
        self.assertTrue(R.es_reventon(1, CRASH_REAL))

    def test_un_error_de_tipos_no_es_reventon(self):
        self.assertFalse(R.es_reventon(2, TIPOS_REAL))

    def test_verde_nunca_es_reventon(self):
        self.assertFalse(R.es_reventon(0, CRASH_REAL))

    def test_heap_agotado(self):
        self.assertTrue(R.es_reventon(134, "FATAL ERROR: Reached heap limit Allocation failed"))

    def test_matado_por_el_sistema(self):
        self.assertTrue(R.es_reventon(137, ""))
        self.assertTrue(R.es_reventon(139, ""))

    def test_señal_negativa(self):
        self.assertTrue(R.es_reventon(-9, ""))

    def test_disco_lleno(self):
        self.assertTrue(R.es_reventon(1, "ENOSPC: no space left on device"))

    def test_rc_ilegible_se_trata_como_fallo_normal(self):
        self.assertFalse(R.es_reventon(None, "error TS2322"))

    def test_pruebas_en_rojo_no_son_reventon(self):
        self.assertFalse(R.es_reventon(1, "Tests  3 failed | 1945 passed (1948)"))


class TestMotivo(unittest.TestCase):
    def test_no_acusa_al_codigo_cuando_murio_el_proceso(self):
        frase = R.motivo("tsc", 1, CRASH_REAL)
        self.assertIn("murió sin memoria", frase)
        self.assertNotIn("no compilan", frase)

    def test_si_es_de_tipos_lo_dice_claro(self):
        self.assertEqual(R.motivo("tsc", 2, TIPOS_REAL), "los tipos no compilan")

    def test_tiempo_agotado_culpa_a_la_maquina(self):
        frase = R.motivo("vitest", 124, "se pasó de 2400 s sin terminar")
        self.assertIn("ahogada", frase)

    def test_pruebas_en_rojo(self):
        self.assertIn("rojo", R.motivo("vitest", 1, "Tests  3 failed"))
        self.assertIn("rojo", R.motivo("python", 1, "FAILED (errors=8)"))


class TestReintento(unittest.TestCase):
    def test_un_reventon_se_reintenta_una_vez(self):
        self.assertTrue(R.hay_que_reintentar(1, CRASH_REAL, intento=1))
        self.assertFalse(R.hay_que_reintentar(1, CRASH_REAL, intento=2))

    def test_un_error_de_verdad_jamas_se_reintenta(self):
        # Reintentar un error de tipos sería taparlo.
        self.assertFalse(R.hay_que_reintentar(2, TIPOS_REAL, intento=1))


class TestCarreraDeBuild(unittest.TestCase):
    """25-09: tsc leyó `.next-build/types` justo cuando el reconstructor lo movía."""

    CARRERA = (
        "error TS6053: File '/Users/alex/Documents/starseed-os-main/.next-build/types/validator.ts' not found.\n"
        "  The file is in the program because:\n"
        "    Matched by include pattern '.next-build/types/**/*.ts' in '/Users/alex/Documents/starseed-os-main/tsconfig.json'\n"
    )

    def test_la_carrera_se_repite(self):
        self.assertTrue(R.es_carrera_de_build(self.CARRERA))
        self.assertTrue(R.hay_que_reintentar(2, self.CARRERA, intento=1, tope=2))
        self.assertIn("cambiaba de carpeta", R.motivo("tsc", 2, self.CARRERA))

    def test_con_un_error_de_verdad_al_lado_no_se_tapa(self):
        mezcla = self.CARRERA + TIPOS_REAL
        self.assertFalse(R.es_carrera_de_build(mezcla))
        self.assertFalse(R.hay_que_reintentar(2, mezcla, intento=1, tope=2))

    def test_un_ts6053_de_otro_sitio_es_de_verdad(self):
        fuera = "error TS6053: File 'src/lib/no-existe.ts' not found.\n"
        self.assertFalse(R.es_carrera_de_build(fuera))


if __name__ == "__main__":
    unittest.main()
