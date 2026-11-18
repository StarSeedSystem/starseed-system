#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas herméticas de la bóveda Maggabit: nada toca /Volumes, la red,
~/.starseed ni el disco real; todo se decide con datos inventados aquí."""
import os
import subprocess
import unittest

import maggabit_boveda as mb

HOGAR = os.path.expanduser("~")
TEXTO = """
# REGENERABLE
node_modules/
# ARBOLES
/wt-*/
# CLAVES
.env
.env.*
!.env.example
*.pem
*.p12
.credentials.json
credentials.json
storage_state*
"""


def fuente(*partes):
    return os.path.join(HOGAR, *partes)


class PlanPuro(unittest.TestCase):
    def test_cerrada_da_lista_vacia(self):
        self.assertEqual(mb.plan("cerrada", [fuente(".hermes")]), [])

    def test_sin_crear_tambien_da_lista_vacia(self):
        self.assertEqual(mb.plan("sin-crear", [fuente(".astraura")]), [])

    def test_abierta_conserva_la_ruta_relativa_al_hogar(self):
        tareas = mb.plan("abierta", [fuente(".hermes", ".env"),
                                     fuente("Documents", "serv", "llave.pem")])
        self.assertEqual(tareas[0]["destino"], mb.DESTINO_RAIZ + "/.hermes/.env")
        self.assertEqual(tareas[1]["destino"], mb.DESTINO_RAIZ + "/Documents/serv/llave.pem")

    def test_credentials_json_nunca_va_a_la_boveda(self):
        sospechosa = fuente("Documents", "app", ".credentials.json")
        self.assertEqual(mb.plan("abierta", [sospechosa]), [])


class Ordenes(unittest.TestCase):
    def test_rsync_a_sin_borrar_en_el_origen(self):
        argv = mb.ordenes(mb.plan("abierta", [fuente(".starseed", "env")]))[0]
        self.assertEqual(argv[:2], ["rsync", "-a"])
        self.assertNotIn("--delete", argv)

    def test_simulacro_lleva_dry_run(self):
        argv = mb.ordenes(mb.plan("abierta", [fuente(".hermes")]), simulacro=True)[0]
        self.assertIn("--dry-run", argv)


class Patrones(unittest.TestCase):
    def setUp(self):
        self.patrones = mb.patrones_claves(TEXTO)

    def test_seccion_claves_se_para_en_secretos_y_excepciones(self):
        self.assertIn("*.pem", self.patrones["secretos"])
        self.assertIn(".env.example", self.patrones["excepciones"])

    def test_es_clave_decide_por_patron(self):
        self.assertTrue(mb.es_clave("proy/.env", self.patrones))
        self.assertTrue(mb.es_clave("storage_state_buena.json", self.patrones))
        self.assertFalse(mb.es_clave("proy/.env.example", self.patrones))
        self.assertFalse(mb.es_clave("Documents/app/.credentials.json", self.patrones))


class Recogida(unittest.TestCase):
    def test_documentos_da_solo_claves_y_sin_credentials(self):
        def camina(_raiz):
            yield (fuente("Documents", "proy"), [],
                   [".env", "notas.txt", ".credentials.json",
                    "firma.pem", "storage_state_buena.json"])

        halladas = mb.claves_documentos(TEXTO, camina=camina)
        self.assertEqual(sorted(os.path.basename(r) for r in halladas),
                         [".env", "firma.pem", "storage_state_buena.json"])


class FuentesHogar(unittest.TestCase):
    def test_pide_los_patrones_fijos_del_hogar(self):
        vistos = []
        mb.fuentes_hogar(expande=lambda p: vistos.append(p) or [])
        self.assertEqual(vistos, list(mb.FUENTES))


class Copia(unittest.TestCase):
    def setUp(self):
        self.llamadas = []

    def ejecutor_falso(self, argv, **kwargs):
        self.llamadas.append((argv, kwargs))
        return subprocess.CompletedProcess(argv, 0, "", "")

    def test_cerrada_no_ejecuta_nada_y_no_espera(self):
        res = mb.copiar(ejecutar=self.ejecutor_falso, existe=lambda _r: False,
                        expande=lambda _p: [], camina=lambda _r: iter(()), texto=TEXTO)
        self.assertEqual(res["copias"], [])
        self.assertEqual(self.llamadas, [])
        self.assertEqual(res["estado"], "sin-crear")
        self.assertIn("sin crear", res["motivo"])

    def test_cerrada_con_imagen_en_el_medio(self):
        res = mb.copiar(ejecutar=self.ejecutor_falso,
                        existe=lambda r: r == mb.IMAGEN_BOVEDA,
                        expande=lambda _p: [], camina=lambda _r: iter(()), texto=TEXTO)
        self.assertEqual(res["estado"], "cerrada")
        self.assertIn("cerrada", res["motivo"])

    def test_abierta_copia_con_timeout_y_sin_credentials(self):
        existe = lambda r: r == mb.BOVEDA
        expande = lambda p: [fuente(".hermes")] if p == "~/.hermes" else []

        def camina(_raiz):
            yield (fuente("Documents", "proy"), [], ["llave.pem", ".credentials.json"])

        res = mb.copiar(ejecutar=self.ejecutor_falso, existe=existe, expande=expande,
                        camina=camina, medir=lambda _r: 7, texto=TEXTO)
        self.assertEqual(len(res["copias"]), 2)
        argv, kwargs = self.llamadas[0]
        self.assertEqual(argv[0], "rsync")
        self.assertEqual(kwargs.get("timeout"), mb.SEGUNDOS_LIMITE)
        self.assertTrue(all(c["estado"] == "ok" and c["tam_bytes"] == 7
                            for c in res["copias"]))
        origenes = [c["origen"] for c in res["copias"]]
        self.assertNotIn(fuente("Documents", "proy", ".credentials.json"), origenes)

    def test_volumen_mudo_da_sin_respuesta_y_no_se_cuelga(self):
        def mudo(argv, **_kwargs):
            raise subprocess.TimeoutExpired(argv, 5)

        res = mb.copiar(ejecutar=mudo, existe=lambda r: r == mb.BOVEDA,
                        expande=lambda _p: [fuente(".hermes")],
                        camina=lambda _r: iter(()), medir=lambda _r: 3, texto=TEXTO)
        self.assertEqual(res["copias"][0]["estado"], mb.SIN_RESPUESTA)

    def test_registro_solo_rutas_y_tamanos(self):
        res = mb.copiar(ejecutar=self.ejecutor_falso, existe=lambda r: r == mb.BOVEDA,
                        expande=lambda _p: [fuente(".hermes")],
                        camina=lambda _r: iter(()), medir=lambda _r: 1, texto=TEXTO)
        self.assertTrue(all(set(c) <= {"origen", "destino", "estado", "tam_bytes"}
                            for c in res["copias"]))


if __name__ == "__main__":
    unittest.main()
