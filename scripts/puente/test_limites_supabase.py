# -*- coding: utf-8 -*-
"""Topes del servidor de Supabase: solo baja, idempotente, en seco y sin secretos (sin red)."""
import contextlib
import io
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import limites_supabase as L

CRED = {"ref": "refprueba", "token": "sbp_tokenSecretoDePrueba"}


class Falso:
    """La API de gestión de mentira: guarda la configuración y cuenta las llamadas."""

    def __init__(self, configs, rechaza=(), falla_get=None):
        self.configs = {k: dict(v) for k, v in configs.items()}
        self.rechaza = set(rechaza)
        self.falla_get = falla_get
        self.llamadas = []

    def _servicio(self, url):
        return "postgrest" if url.endswith("/postgrest") else url.rsplit("/", 1)[1]

    def __call__(self, metodo, url, token, cuerpo=None, timeout=30):
        s = self._servicio(url)
        self.llamadas.append((metodo, s, cuerpo))
        if metodo == "GET":
            if self.falla_get == s:
                return 401, ""
            return 200, json.dumps(self.configs[s])
        if any(c in self.rechaza for c in cuerpo):
            return 400, '{"message":"campo no permitido"}'
        self.configs[s].update(cuerpo)
        return 200, "{}"

    def parches(self):
        return [c for c in self.llamadas if c[0] == "PATCH"]


def configs_reales():
    return {
        "postgrest": {"db_schema": "public", "max_rows": 1000, "db_pool": None,
                      "jwt_secret": "SECRETO-JWT-QUE-NO-SE-IMPRIME"},
        "auth": {"rate_limit_token_refresh": 150, "rate_limit_verify": 30, "rate_limit_otp": 30,
                 "rate_limit_anonymous_users": 30, "rate_limit_email_sent": 2,
                 "smtp_pass": "SMTP-SECRETO", "external_google_secret": "GOOGLE-SECRETO"},
        "realtime": {"max_concurrent_users": 200, "max_events_per_second": 100, "private_only": False},
    }


def correr(http, *argv):
    salida = io.StringIO()
    with contextlib.redirect_stdout(salida):
        codigo = L.main(list(argv), http=http, cred=CRED)
    return codigo, salida.getvalue()


class Plan(unittest.TestCase):
    def test_solo_baja_y_solo_numeros_que_existen(self):
        p = L.plan({"a": 150, "b": 10, "c": None, "d": True, "e": "300"}, {"a": 60, "b": 15, "c": 5, "d": 0, "e": 1,
                                                                          "f": 9})
        self.assertEqual(p, {"a": (150, 60)})


class Aplicar(unittest.TestCase):
    def test_en_seco_no_toca_nada(self):
        http = Falso(configs_reales())
        codigo, texto = correr(http, "--seco")
        self.assertEqual(codigo, 0)
        self.assertEqual(http.parches(), [])
        self.assertIn("auth.rate_limit_token_refresh: 150 → 60 (en seco)", texto)
        self.assertIn("postgrest.max_rows: 1000 (ya está en su tope o por debajo)", texto)

    def test_aplica_un_parche_por_servicio_con_solo_lo_que_baja(self):
        http = Falso(configs_reales())
        codigo, texto = correr(http)
        self.assertEqual(codigo, 0)
        parches = {s: c for _m, s, c in http.parches()}
        self.assertEqual(set(parches), {"auth", "realtime"})  # postgrest ya estaba en 1000
        self.assertEqual(parches["auth"], {"rate_limit_token_refresh": 60, "rate_limit_verify": 15,
                                           "rate_limit_otp": 10, "rate_limit_anonymous_users": 10})
        self.assertNotIn("rate_limit_email_sent", parches["auth"])  # no es nuestro: no se toca
        self.assertEqual(parches["realtime"], {"max_concurrent_users": 60, "max_events_per_second": 50})
        self.assertIn("auth.rate_limit_web3: no existe en esta API (se omite)", texto)
        self.assertIn("realtime.max_joins_per_second: no existe en esta API (se omite)", texto)
        self.assertIn("se reconectan solos", texto)

    def test_idempotente(self):
        http = Falso(configs_reales())
        correr(http)
        n = len(http.parches())
        codigo, texto = correr(http)
        self.assertEqual(codigo, 0)
        self.assertEqual(len(http.parches()), n)
        self.assertNotIn("→", texto)

    def test_max_rows_alto_baja_a_1000(self):
        c = configs_reales()
        c["postgrest"]["max_rows"] = 100000
        http = Falso(c)
        correr(http, "--sin-realtime")
        self.assertIn(("PATCH", "postgrest", {"max_rows": 1000}), http.llamadas)
        self.assertFalse(any(s == "realtime" for _m, s, _c in http.llamadas))

    def test_nunca_imprime_secretos(self):
        _codigo, texto = correr(Falso(configs_reales()))
        for secreto in ("SECRETO-JWT", "SMTP-SECRETO", "GOOGLE-SECRETO", CRED["token"]):
            self.assertNotIn(secreto, texto)

    def test_campo_rechazado_no_impide_los_demas_y_no_insiste(self):
        http = Falso(configs_reales(), rechaza={"rate_limit_otp"})
        codigo, texto = correr(http, "--sin-realtime")
        self.assertEqual(codigo, 1)
        auth = [c for _m, s, c in http.parches() if s == "auth"]
        # 1 parche conjunto + 1 por campo (4), y ni uno más.
        self.assertEqual(len(auth), 5)
        self.assertEqual(http.configs["auth"]["rate_limit_token_refresh"], 60)
        self.assertEqual(http.configs["auth"]["rate_limit_otp"], 30)
        self.assertIn("auth: NO aplicado → rate_limit_otp (HTTP 400)", texto)

    def test_lectura_fallida_no_parchea(self):
        http = Falso(configs_reales(), falla_get="auth")
        codigo, texto = correr(http, "--sin-realtime")
        self.assertEqual(codigo, 1)
        self.assertIn("auth: no se pudo leer (HTTP 401)", texto)
        self.assertFalse(any(s == "auth" for _m, s, _c in http.parches()))

    def test_sin_credenciales(self):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = L.main([], http=Falso(configs_reales()), cred={"ref": "", "token": ""})
        self.assertEqual(codigo, 2)


if __name__ == "__main__":
    unittest.main()
