# -*- coding: utf-8 -*-
"""Pruebas herméticas de la verificación y el manifiesto del Maggabit (MAG1117).

Nada aquí toca /Volumes, la red, ~/.starseed ni el disco real: todo se inyecta.
"""
import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import maggabit_verificar as V  # noqa: E402

AHORA = 1_000_000.0
LISTO = {"estado": "listo"}


def fuente(**cambios):
    datos = {"ritmo_s": 300, "ultimo_bueno": AHORA - 100, "tamano_bytes": 1234,
             "archivos": 7, "ultimo_error": None, "otra_casa": True}
    datos.update(cambios)
    return datos


class TestManifiesto(unittest.TestCase):
    def test_fuente_al_dia(self):
        m = V.manifiesto(LISTO, {"memoria": fuente()}, AHORA)
        f = m["fuentes"]["memoria"]
        self.assertEqual(m["generado"], AHORA)
        self.assertEqual(m["medio"], "listo")
        self.assertEqual(m["rutas"]["manifiesto"], V.RUTA_MANIFIESTO)
        self.assertEqual(m["rutas"]["estado"], V.RUTA_ESTADO)
        self.assertEqual(f["ultimo_bueno"], AHORA - 100)
        self.assertEqual(f["retraso_s"], 0)
        self.assertEqual(f["tamano_bytes"], 1234)
        self.assertEqual(f["archivos"], 7)
        self.assertIsNone(f["ultimo_error"])
        self.assertEqual(m["solo_en_maggabit"], [])

    def test_retraso_error_y_sin_otra_casa(self):
        datos = fuente(ultimo_bueno=AHORA - 500, ritmo_s=300, otra_casa=False,
                       ultimo_error="fallo en https://user:clave@ejemplo.org/x?token=abc")
        f = V.manifiesto(LISTO, {"boveda": datos}, AHORA)["fuentes"]["boveda"]
        self.assertEqual(f["edad_s"], 500)
        self.assertEqual(f["retraso_s"], 200)
        self.assertNotIn("clave@", f["ultimo_error"])
        self.assertNotIn("abc", f["ultimo_error"])
        self.assertEqual(V.manifiesto(LISTO, {"boveda": datos}, AHORA)["solo_en_maggabit"],
                         ["boveda"])
        self.assertEqual(V.manifiesto(LISTO, {"boveda": datos}, AHORA)["fallos"], ["boveda"])
        otro = fuente(ultimo_error="https://u@x.org api_key=xyz Bearer abc")
        e = V.manifiesto(LISTO, {"boveda": otro}, AHORA)["fuentes"]["boveda"]["ultimo_error"]
        self.assertNotIn("u@", e)
        self.assertNotIn("xyz", e)
        self.assertNotIn("abc", e)

    def test_ritmo_por_defecto_y_casas_vacias(self):
        f = V.manifiesto(LISTO, {"nueva": {"ultimo_bueno": AHORA - 100000,
                                            "casas": []}}, AHORA)
        self.assertEqual(f["fuentes"]["nueva"]["ritmo_s"], 86400)
        self.assertEqual(f["solo_en_maggabit"], ["nueva"])

    def test_disco_ausente_o_sin_respuesta_no_falla(self):
        for estado in ("ausente", "sin-respuesta", "otro-disco"):
            m = V.manifiesto({"estado": estado}, {}, AHORA)
            self.assertEqual(m["medio"], estado)
            self.assertEqual(m["fuentes"], {})
            self.assertEqual(m["fallos"], [])


class TestPlan(unittest.TestCase):
    def test_cada_pasada_verifica_el_paquete(self):
        p = V.plan_verificacion(AHORA, {"paquete": "paquete.bundle", "verificar": AHORA})
        self.assertEqual(len(p), 1)
        self.assertIn("git bundle verify", p[0])
        self.assertIn("paquete.bundle", p[0])

    def test_semanal_y_mensual(self):
        u = {"paquete": "paq.bundle", "fsck": AHORA - 8 * 86400,
             "restaurar": AHORA - 31 * 86400, "espejos": ["espejo a", "espejo b"],
             "rama": "main", "commit": "abc123", "temporal": "/tmp/restauracion"}
        p = V.plan_verificacion(AHORA, u)
        self.assertEqual(len([x for x in p if "fsck --connectivity-only" in x]), 2)
        self.assertTrue(any("git clone" in x and "paq.bundle" in x for x in p))
        self.assertTrue(any("rev-parse main" in x for x in p))
        self.assertTrue(any("abc123" in x for x in p))

    def test_no_repite_antes_de_tiempo(self):
        u = {"paquete": "paq.bundle", "fsck": AHORA - 6 * 86400,
             "restaurar": AHORA - 29 * 86400, "espejos": ["espejo"]}
        self.assertEqual(len(V.plan_verificacion(AHORA, u)), 1)

    def test_disco_ausente_no_da_plan(self):
        u = {"paquete": "paq.bundle", "medio": {"estado": "ausente"}}
        self.assertEqual(V.plan_verificacion(AHORA, u), [])


class TestAvisos(unittest.TestCase):
    def test_fallo_nuevo_se_dice_una_vez(self):
        antes = V.manifiesto(LISTO, {"memoria": fuente()}, AHORA)
        roto = fuente(ultimo_error="sin copia en https://u:clave@x.org")
        actual = V.manifiesto(LISTO, {"memoria": roto}, AHORA + 1)
        aviso = V.avisos(antes, actual)
        self.assertEqual(len(aviso), 1)
        self.assertIn("memoria", aviso[0])
        self.assertNotIn("clave@", aviso[0])
        self.assertEqual(V.avisos(actual, actual), [])
        bueno = V.manifiesto(LISTO, {"memoria": fuente()}, AHORA + 2)
        self.assertEqual(V.avisos(actual, bueno), [])
        self.assertEqual(len(V.avisos(bueno, actual)), 1)

    def test_varios_fallos_nuevos(self):
        antes = V.manifiesto(LISTO, {"memoria": fuente(), "estado": fuente()}, AHORA)
        actual = V.manifiesto(LISTO, {"memoria": fuente(ultimo_error="roto"),
                                      "estado": fuente(ultimo_error="roto")}, AHORA + 1)
        self.assertEqual(len(V.avisos(antes, actual)), 2)

    def test_cambio_de_error_no_repite(self):
        a = V.manifiesto(LISTO, {"memoria": fuente(ultimo_error="error a")}, AHORA)
        b = V.manifiesto(LISTO, {"memoria": fuente(ultimo_error="error b")}, AHORA + 1)
        self.assertEqual(V.avisos(a, b), [])

    def test_sin_respaldo_bueno_es_fallo(self):
        a = V.manifiesto(LISTO, {"codigo": fuente()}, AHORA)
        b = V.manifiesto(LISTO, {"codigo": fuente(ultimo_bueno=None)}, AHORA + 1)
        self.assertEqual(len(V.avisos(a, b)), 1)


class Corredor:
    """Doble de subprocess.run: apunta órdenes y topes, sin lanzar nada."""

    def __init__(self, respuesta=None):
        self.llamadas = []
        self.respuesta = respuesta

    def __call__(self, orden, capture_output=True, timeout=None):
        self.llamadas.append((list(orden), timeout))
        if isinstance(self.respuesta, Exception):
            raise self.respuesta
        return subprocess.CompletedProcess(orden, 0)


class TestEscalaEscritura(unittest.TestCase):
    def test_disco_ausente_no_lanza_nada(self):
        c = Corredor()
        self.assertEqual(V.verificar({"estado": "ausente"}, {"paquete": "p.bundle"},
                                     ahora_fn=lambda: AHORA, correr=c), [])
        self.assertEqual(c.llamadas, [])
        self.assertEqual(V.verificar({}, {"paquete": "p.bundle"}, correr=c), [])

    def test_todo_subprocess_lleva_tope(self):
        c = Corredor()
        r = V.verificar(LISTO, {"paquete": "paq.bundle", "fsck": 0.0,
                                "espejos": ["espejo"]}, ahora_fn=lambda: AHORA,
                        correr=c, tope_s=4)
        self.assertEqual(len(r), 2)
        self.assertEqual([t for _o, t in c.llamadas], [4, 4])
        self.assertEqual([o[0] for o, _t in c.llamadas], ["git", "git"])

    def test_timeout_es_sin_respuesta(self):
        c = Corredor(subprocess.TimeoutExpired("git", 4))
        r = V.verificar(LISTO, {"paquete": "paq.bundle"}, ahora_fn=lambda: AHORA,
                        correr=c, tope_s=4)
        self.assertEqual(r[0]["estado"], "sin-respuesta")

    def test_paso_de_comparacion_no_se_lanza(self):
        c = Corredor()
        r = V.verificar(LISTO, {"paquete": "paq.bundle", "restaurar": AHORA - 31 * 86400,
                                "commit": "abc123"}, ahora_fn=lambda: AHORA, correr=c)
        self.assertTrue(any(x["paso"].startswith("comparar") for x in r))
        self.assertEqual(len(c.llamadas), 3)


class TestOrden(unittest.TestCase):
    def test_manifiesto_imprime_json(self):
        capturado = []
        codigo = V.main([], medio_fn=lambda: LISTO, fuentes_fn=lambda: {"memoria": fuente()},
                        ahora_fn=lambda: AHORA, salida=capturado.append)
        self.assertEqual(codigo, 0)
        self.assertEqual(json.loads(capturado[0])["fuentes"]["memoria"]["archivos"], 7)

    def test_orden_desconocida(self):
        self.assertEqual(V.main(["otra"], salida=lambda _s: None), 2)


if __name__ == "__main__":
    unittest.main()
