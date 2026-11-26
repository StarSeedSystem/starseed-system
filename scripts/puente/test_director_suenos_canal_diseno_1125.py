# -*- coding: utf-8 -*-
"""SUE1125A · el director de Sueños profundos anuncia en el canal de diseño/audiovisual
(con Telegram) sin romper el canal común si algo falla."""
import json
import os
import shutil
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import director_suenos as S  # noqa: E402


class CanalDiseno(unittest.TestCase):
    def setUp(self):
        self.llamadas = []
        self.dichos = []

    def test_publica_una_vez_en_audiovisual_con_el_texto(self):
        def falso(texto):
            self.llamadas.append(texto)
            return True

        hecho = S.anunciar(
            "resumen de la sesión",
            decir=lambda *a: self.dichos.append(a),
            publicar_canal=falso,
        )
        self.assertEqual(self.llamadas, ["resumen de la sesión"])
        self.assertTrue(hecho["canal"])
        self.assertTrue(hecho["audiovisual"])

    def test_un_fallo_no_impide_el_canal_comun(self):
        def rompe(_texto):
            raise RuntimeError("sin canal")

        hecho = S.anunciar(
            "resumen",
            decir=lambda *a: self.dichos.append(a),
            publicar_canal=rompe,
        )
        self.assertTrue(hecho["canal"])
        self.assertFalse(hecho["audiovisual"])
        self.assertEqual(len(self.dichos), 1)

    def test_el_comando_es_el_del_canal_audiovisual_con_telegram(self):
        cmd = S.comando_canal_audiovisual("hola")
        self.assertIn("publicar-canal", cmd)
        self.assertEqual(cmd[cmd.index("--canal") + 1], "audiovisual")
        self.assertEqual(
            cmd[cmd.index("--de") + 1], "Directores de diseño (Sueños profundos)"
        )
        self.assertEqual(cmd[cmd.index("--origen") + 1], "metagenesis")
        self.assertEqual(cmd[cmd.index("--texto") + 1], "hola")
        self.assertNotIn("--sin-telegram", cmd)

    def test_ejecutar_lo_llama_al_consolidar(self):
        d = tempfile.mkdtemp(prefix="suenos-canal-")
        try:
            sesion = os.path.join(d, "profundo", "2026-11-25")
            olas = os.path.join(d, "olas")
            os.makedirs(sesion)
            informe = {
                "id": "SA11251",
                "area": "voz",
                "lente": "arquitectura-deuda",
                "privado": False,
                "hallazgos": [
                    {
                        "clave": S.D.clave("Unificar voz"),
                        "titulo": "Unificar voz",
                        "seccion": "mejora",
                        "archivo": "src/lib/x.ts",
                        "linea": 10,
                        "impacto": 3,
                        "esfuerzo": 2,
                        "confianza": 0.8,
                        "detalle": "detalle",
                        "propuesta": {
                            "titulo": "Hacer: Unificar voz",
                            "archivos": ["src/lib/x.ts"],
                            "cambio": "cambio",
                        },
                    }
                ],
            }
            with open(
                os.path.join(sesion, "voz--arquitectura-deuda.json"),
                "w",
                encoding="utf-8",
            ) as f:
                json.dump(informe, f)
            res = S.ejecutar(
                sesion,
                olas,
                "2026-11-25",
                memoria=os.path.join(d, "encargado.json"),
                consejero=None,
                bus=None,
                decir=lambda *a: None,
                publicar_canal=lambda texto: self.llamadas.append(texto) or True,
            )
            self.assertEqual(self.llamadas, [res["resumen"]])
            self.assertTrue(res["anuncio"]["audiovisual"])
        finally:
            shutil.rmtree(d, ignore_errors=True)
