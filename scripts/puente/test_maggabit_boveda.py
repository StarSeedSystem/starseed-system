# -*- coding: utf-8 -*-
"""Pruebas herméticas de la bóveda cifrada de claves (MAG1117).

No tocan /Volumes, la red, ~/.starseed ni el disco real: el árbol de fuentes se
simula en memoria y subprocess, reloj, recorrido y lectura van inyectados. El
`.credentials.json` no se copia a ningún sitio, ni siquiera desde ~/Documents.
"""
from __future__ import annotations

import os
import subprocess
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import maggabit_boveda as B  # noqa: E402

TEXTO_LISTA = """\
# REGENERABLE: se reconstruye.
node_modules/
# CLAVES: secretos que nunca salen del origen.
.env
.env.*
!.env.example
*.pem
.credentials.json
credentials.json
storage_state*
"""


class PlanBoveda(unittest.TestCase):
    def test_cerrada_no_ordena_nada_y_dice_el_motivo(self):
        self.assertEqual(B.plan("cerrada", ["~/.starseed/env"]), [])
        self.assertIn("cerrada", B.motivo("cerrada"))

    def test_sin_crear_no_ordena_nada_y_dice_el_motivo(self):
        self.assertEqual(B.plan("sin-crear", ["~/.starseed/env"]), [])
        self.assertIn("sin crear", B.motivo("sin-crear"))

    def test_abierta_conserva_la_ruta_relativa_al_home(self):
        p = B.plan("abierta", ["~/.starseed/env", "~/.oci/config"])
        self.assertEqual([o["relativa"] for o in p], [".oci/config", ".starseed/env"])
        self.assertEqual(p[1]["destino"], "claves/.starseed/env")

    def test_abierta_quita_duplicados(self):
        p = B.plan("abierta", ["~/.hermes", "~/.hermes"])
        self.assertEqual(len(p), 1)

    def test_acepta_rutas_absolutas_bajo_el_home(self):
        p = B.plan("abierta", ["/Users/alex/.starseed/env"])
        self.assertEqual([o["relativa"] for o in p], [".starseed/env"])


class Credenciales(unittest.TestCase):
    def test_credentials_en_documents_nunca_se_copia(self):
        p = B.plan("abierta", ["~/Documents/casa/.credentials.json",
                               "~/Documents/casa/credentials.json",
                               "~/Documents/casa/clave.pem"])
        self.assertEqual([o["relativa"] for o in p], ["Documents/casa/clave.pem"])

    def test_patrones_de_claves_con_excepcion(self):
        patrones, excepciones = B.patrones_claves(TEXTO_LISTA)
        self.assertIn(".env", patrones)
        self.assertIn(".env.*", patrones)
        self.assertIn(".env.example", excepciones)
        self.assertTrue(B.coincide_clave(".env.local", patrones, excepciones))
        self.assertFalse(B.coincide_clave(".env.example", patrones, excepciones))
        self.assertFalse(B.coincide_clave(".credentials.json", patrones, excepciones))

    def test_un_comentario_dentro_de_claves_no_corta_la_seccion(self):
        patrones, _ = B.patrones_claves("# CLAVES: cabecera\n\n# nota interna\n.env\n")
        self.assertEqual(patrones, [".env"])


class OrdenesYRegistro(unittest.TestCase):
    def setUp(self):
        self.plan = B.plan("abierta", ["~/.starseed/env"])

    def test_rsync_a_conserva_la_ruta_relativa(self):
        argv = B.ordenes(self.plan)[0]
        self.assertEqual(argv[:2], ["rsync", "-a"])
        self.assertTrue(argv[2].endswith(".starseed/env"))
        self.assertTrue(argv[3].startswith("/Volumes/MaggabitBoveda/claves/"))
        self.assertTrue(argv[3].endswith(".starseed/env"))

    def test_registro_solo_lleva_rutas_y_tamanos(self):
        filas = B.registro(self.plan, base="/boveda", medir=lambda ruta: 42)
        self.assertEqual(filas, [{"ruta": ".starseed/env", "bytes": 42}])
        self.assertEqual(set(filas[0]), {"ruta", "bytes"})


class Fuentes(unittest.TestCase):
    """El árbol de ~ se simula en memoria: ni una llamada al disco real."""

    FICHEROS = {
        "/hogar/.starseed/env": b"",
        "/hogar/.starseed/env.local": b"",
        "/hogar/.starseed/notas.txt": b"",
        "/hogar/.hermes/config.yaml": b"",
        "/hogar/.hermes/.credentials.json": b"",
        "/hogar/.astraura/voz.bin": b"",
        "/hogar/.oci/oci_api_key.pem": b"",
        "/hogar/Documents/casa/.env": b"",
        "/hogar/Documents/casa/.env.example": b"",
        "/hogar/Documents/casa/.credentials.json": b"",
        "/hogar/Documents/casa/cert.pem": b"",
        "/hogar/Documents/casa/notas.txt": b"",
    }
    DIRECTORIOS = {
        "/hogar", "/hogar/.starseed", "/hogar/.hermes", "/hogar/.astraura",
        "/hogar/.oci", "/hogar/Documents", "/hogar/Documents/casa",
    }

    def _existe(self, ruta):
        return ruta in self.FICHEROS or ruta in self.DIRECTORIOS

    def _es_dir(self, ruta):
        return ruta in self.DIRECTORIOS

    def _globo(self, patron):
        base, prefijo = os.path.split(patron)
        prefijo = prefijo.rstrip("*")
        return sorted(r for r in self.FICHEROS
                      if os.path.dirname(r) == base
                      and os.path.basename(r).startswith(prefijo))

    def _recorrer(self, raiz):
        for d in sorted(self.DIRECTORIOS):
            if d != raiz and not d.startswith(raiz.rstrip("/") + "/"):
                continue
            hijos = [c for c in self.DIRECTORIOS if os.path.dirname(c) == d]
            nombres = [r for r in self.FICHEROS if os.path.dirname(r) == d]
            yield d, [os.path.basename(c) for c in hijos], [os.path.basename(n) for n in nombres]

    def _leer(self, ruta):
        if ruta == B.LISTA:
            return TEXTO_LISTA
        raise OSError(ruta)

    def setUp(self):
        self.fuentes = B.fuentes_existentes(
            home="/hogar", existe=self._existe, es_dir=self._es_dir,
            globo=self._globo, recorrer=self._recorrer, leer=self._leer,
        )

    def test_expande_archivos_y_directorios_de_fuentes(self):
        for ruta in ("~/.starseed/env", "~/.starseed/env.local",
                     "~/.hermes/config.yaml", "~/.astraura/voz.bin",
                     "~/.oci/oci_api_key.pem"):
            self.assertIn(ruta, self.fuentes)

    def test_documents_solo_por_la_seccion_claves_y_sin_credenciales(self):
        self.assertIn("~/Documents/casa/.env", self.fuentes)
        self.assertIn("~/Documents/casa/cert.pem", self.fuentes)
        self.assertNotIn("~/Documents/casa/.env.example", self.fuentes)
        self.assertNotIn("~/Documents/casa/.credentials.json", self.fuentes)
        self.assertNotIn("~/Documents/casa/notas.txt", self.fuentes)
        self.assertNotIn("~/.hermes/.credentials.json", self.fuentes)

    def test_el_plan_filtra_lo_que_la_capa_de_entrada_encuentre(self):
        p = B.plan("abierta", self.fuentes)
        self.assertNotIn(".hermes/.credentials.json", [o["relativa"] for o in p])


class Copiar(unittest.TestCase):
    def setUp(self):
        self.plan = B.plan("abierta", ["~/.starseed/env"])

    def test_disco_ausente_no_llama_a_rsync_ni_espera(self):
        llamadas = []
        r = B.copiar(self.plan, base="/Volumes/MaggabitBoveda",
                     existe=lambda ruta: False,
                     correr=lambda *a, **k: llamadas.append((a, k)))
        self.assertEqual(r["estado"], "sin-disco")
        self.assertEqual(llamadas, [])

    def test_timeout_del_volumen_es_sin_respuesta(self):
        def colgado(argv, **kwargs):
            self.assertTrue(kwargs.get("timeout"))
            raise subprocess.TimeoutExpired(argv, kwargs["timeout"])

        r = B.copiar(self.plan, base="/boveda", existe=lambda ruta: True,
                     crear=lambda *a, **k: None, correr=colgado)
        self.assertEqual(r["estado"], "sin-respuesta")

    def test_plan_vacio_no_toca_nada(self):
        r = B.copiar([], existe=lambda ruta: self.fail("no debe mirar el disco"))
        self.assertEqual(r["estado"], "sin-trabajo")


if __name__ == "__main__":
    unittest.main(verbosity=2)
