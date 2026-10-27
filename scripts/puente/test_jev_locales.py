"""Pruebas de los extremos locales SystemOne de Jev (Laya 4470 · Colibri 4480), sin red."""

import os
import sys
import tempfile
import time
import unittest
import urllib.parse

import jev


def _falso(respuestas=None, fallan=(), retrasos=None):
    """Transporte local de mentira: apunta los extremos y responde o falla por puerto."""
    llamadas = []
    retrasos = retrasos or {}

    def t(endpoint, cuerpo, timeout):
        puerto = urllib.parse.urlsplit(endpoint).port
        llamadas.append((endpoint, timeout, cuerpo))
        if puerto in fallan:
            raise OSError("sin respuesta")
        time.sleep(retrasos.get(puerto, 0))
        return {"answers": respuestas or {"q": {"type": "noul", "noul": 0.8}}}

    t.llamadas = llamadas
    return t


class LocalesSystemOne(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.CONCESION = os.path.join(self._dir, "conversacion.json")
        jev.TRANSPORTE = None
        jev.TRANSPORTE_LOCAL = None
        self._env = {}
        for k in ("STARSEED_LAYA_URL", "STARSEED_SYSTEMONE_LOCALES", "STARSEED_JEV"):
            self._env[k] = os.environ.pop(k, None)
        self.addCleanup(self._restaurar_env)
        sys.modules["jev_local"] = None
        self.addCleanup(lambda: sys.modules.pop("jev_local", None))

    def _restaurar_env(self):
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def _decidir(self):
        return jev.decidir_con_laya(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
        )

    def _puertos(self):
        return [
            urllib.parse.urlsplit(u).port
            for u, _, _ in jev.TRANSPORTE_LOCAL.llamadas
        ]

    def test_por_defecto_laya_y_luego_colibri(self):
        jev.TRANSPORTE_LOCAL = _falso(fallan={4470})
        res = self._decidir()
        self.assertEqual(res["motor"], "colibri-local")
        self.assertEqual(self._puertos(), [4470, 4480])
        self.assertEqual(jev.TRANSPORTE_LOCAL.llamadas[0][1], 1.5)

    def test_laya_url_va_primero_y_se_respeta_la_lista(self):
        os.environ["STARSEED_LAYA_URL"] = "http://127.0.0.1:4499/v1/systemone"
        os.environ["STARSEED_SYSTEMONE_LOCALES"] = (
            "http://127.0.0.1:4481/v1/systemone,http://127.0.0.1:4480/v1/systemone"
        )
        jev.TRANSPORTE_LOCAL = _falso(fallan={4499, 4481})
        res = self._decidir()
        self.assertEqual(res["motor"], "colibri-local")
        self.assertEqual(self._puertos(), [4499, 4481, 4480])

    def test_el_mas_rapido_se_recuerda_10_min(self):
        os.environ["STARSEED_SYSTEMONE_LOCALES"] = (
            "http://127.0.0.1:4470/v1/systemone,http://127.0.0.1:4480/v1/systemone"
        )
        jev.TRANSPORTE_LOCAL = _falso(fallan={4470})
        self.assertEqual(self._decidir()["motor"], "colibri-local")
        jev.TRANSPORTE_LOCAL = _falso()
        self.assertEqual(self._decidir()["motor"], "colibri-local")
        self.assertEqual(self._puertos()[0], 4480)
        uso = jev._leer(jev.USO, {})
        uso["systemone"]["t"] -= jev.PREFERENCIA_LOCAL_S + 1
        jev._escribir(jev.USO, uso)
        jev.TRANSPORTE_LOCAL = _falso()
        self.assertEqual(self._decidir()["motor"], "laya-local")
        self.assertEqual(self._puertos()[0], 4470)

    def test_ninguno_responde_devuelve_none(self):
        jev.TRANSPORTE_LOCAL = _falso(fallan={4470, 4480})
        self.assertIsNone(self._decidir())

    def test_decidir_anota_medio_colibri_local(self):
        os.environ["STARSEED_SYSTEMONE_LOCALES"] = "http://127.0.0.1:4480/v1/systemone"
        jev.TRANSPORTE_LOCAL = _falso()
        res = jev.decidir(
            {"texto": "prueba"},
            {"q": {"type": "noul", "instructions": "?"}},
            usar_cache=False,
        )
        self.assertEqual(res["medio"], "colibri-local")
        self.assertEqual(res["motor"], "colibri-local")
        self.assertEqual(jev._leer(jev.USO, {})["por_medio"]["colibri-local"]["llamadas"], 1)


if __name__ == "__main__":
    unittest.main()
