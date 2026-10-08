# -*- coding: utf-8 -*-
"""El destino fijo (Oracle) que ven la web y la app: solo URLs válidas y sanas, y la
fila se retira cuando ya no hay ningún servidor sano. Supabase es FALSO (urlopen
parcheado) y HOME apunta a un directorio temporal: cero red, cero disco real de la casa."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publicar_destino_astraura as D  # noqa: E402

FIJO = "https://astraura.132-226-240-1.sslip.io"  # IP de ejemplo, sin OCIDs
TUNEL = "https://uno-dos-tres.trycloudflare.com"


class UrlValida(unittest.TestCase):
    def test_https_tunel_sslip_o_host_permitido_sin_extras(self):
        self.assertTrue(D.url_valida(FIJO))
        self.assertTrue(D.url_valida(FIJO + "/"))
        self.assertTrue(D.url_valida(TUNEL))
        self.assertFalse(D.url_valida("http://astraura.1-2-3-4.sslip.io"))
        self.assertFalse(D.url_valida("https://sslip.io.evil.com"))
        self.assertFalse(D.url_valida("https://evil.example.com"))
        self.assertFalse(D.url_valida(FIJO + "/api"))
        self.assertFalse(D.url_valida(FIJO + "?x=1"))
        self.assertFalse(D.url_valida(FIJO + "/#a"))
        self.assertFalse(D.url_valida("https://usu:clave@astraura.1-2-3-4.sslip.io"))
        self.assertFalse(D.url_valida(None))

    def test_host_extra_de_astraura_tunel_hosts(self):
        with mock.patch.dict(os.environ, {"ASTRAURA_TUNEL_HOSTS": "mi.nodo.org"}):
            self.assertTrue(D.url_valida("https://mi.nodo.org"))


def servidor(url=FIJO, destino=True, ok=True):
    return {"id": "oracle-a1", "nombre": "Oracle A1", "tipo": "oracle", "url": url,
            "destino": destino, "ultimaSonda": {"ok": ok, "ms": 120, "t": "2026-10-07T00:00:00Z",
                                                "detalle": "200"}}


class ServidorDestino(unittest.TestCase):
    def test_el_marcado_destino_y_sano_gana(self):
        self.assertEqual(D.servidor_destino([servidor()]), FIJO)

    def test_sin_destino_true_no_hay_destino(self):
        self.assertEqual(D.servidor_destino([servidor(destino=False, ok=True)]), "")

    def test_sonda_caida_no_es_destino(self):
        self.assertEqual(D.servidor_destino([servidor(ok=False)]), "")

    def test_url_invalida_aunque_este_sana_no_es_destino(self):
        self.assertEqual(D.servidor_destino([servidor(url="https://evil.example.com")]), "")

    def test_registro_vacio_o_mal_formado_no_explota(self):
        self.assertEqual(D.servidor_destino({}), "")
        self.assertEqual(D.servidor_destino([None, "cadena"]), "")


class Decidir(unittest.TestCase):
    def test_destino_nuevo_se_publica(self):
        self.assertEqual(D.decidir(FIJO, {}, 1000), ("publicar", "destino nuevo"))

    def test_mismo_destino_solo_con_latido(self):
        previo = {"url": FIJO, "t": 1000}
        self.assertEqual(D.decidir(FIJO, previo, 1060), ("nada", "sin cambios"))
        self.assertEqual(D.decidir(FIJO, previo, 1000 + D.LATIDO_S), ("publicar", "latido"))

    def test_sin_servidor_sano_habiendo_publicado_se_quita(self):
        self.assertEqual(D.decidir("", {"url": FIJO, "t": 1}, 2), ("quitar", "ya no hay servidor fijo sano"))

    def test_sin_servidor_y_sin_nada_publicado_no_se_toca(self):
        self.assertEqual(D.decidir("", {}, 2), ("nada", "sin servidor fijo sano y nada publicado"))


class _RespFalsa:
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class PublicacionConSupabaseFalso(unittest.TestCase):
    """main() entero con registro, HOME y Supabase falsos: comprueba que escribe la fila
    correcta y que la borra cuando el servidor cae."""

    def _montar(self, tmp, servidores):
        registro = os.path.join(tmp, "starseed_memory_root", "mando", "servidores-astraura.json")
        os.makedirs(os.path.dirname(registro), exist_ok=True)
        with open(registro, "w", encoding="utf-8") as f:
            json.dump({"servidores": servidores}, f)
        hogar = os.path.join(tmp, "home")
        os.makedirs(os.path.join(hogar, ".astraura"), exist_ok=True)
        with open(os.path.join(hogar, ".astraura", "supabase_astraura.json"), "w",
                  encoding="utf-8") as f:
            json.dump({"supabase_url": "https://proyecto.supabase.co",
                       "service_role_key": "clave-falsa"}, f)
        peticiones = []

        class _Urlopen:
            def __call__(self, req, timeout=0):
                peticiones.append((req.get_method(), req.full_url,
                                   (req.data or b"").decode()))
                return _RespFalsa()

        return registro, hogar, peticiones, _Urlopen

    def test_publica_el_destino_sano_y_lo_quita_al_caer(self):
        with tempfile.TemporaryDirectory() as tmp:
            registro, hogar, peticiones, urlopen = self._montar(tmp, [servidor()])
            estado = os.path.join(hogar, ".starseed", "destino-astraura.json")
            with mock.patch.object(D, "REGISTRO", registro), \
                 mock.patch.object(D, "ESTADO", estado), \
                 mock.patch.object(D, "_credenciales", return_value=(
                     "https://proyecto.supabase.co", "clave-falsa")), \
                 mock.patch.object(D.urllib.request, "urlopen", urlopen()):
                self.assertEqual(D.main(), 0)
                self.assertEqual(peticiones[0][0], "POST")
                self.assertIn("on_conflict=key", peticiones[0][1])
                self.assertIn(FIJO, peticiones[0][2])
                self.assertNotIn("clave-falsa", peticiones[0][2])

                # Cae la sonda: ahora borra la fila (DELETE) para volver al túnel.
                self._montar(tmp, [servidor(ok=False)])
                self.assertEqual(D.main(), 0)
                self.assertEqual(peticiones[-1][0], "DELETE")
                self.assertIn("key=eq.destino_fijo", peticiones[-1][1])


if __name__ == "__main__":
    unittest.main()
