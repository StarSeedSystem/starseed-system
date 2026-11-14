#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de sanador_recetas (SES1113F): recetas del resto del registro, sin red.

Toda la E/S va simulada (comandos falsos, avisos en memoria, estado en un dict):
ninguna prueba lanza subprocess ni toca la red.
"""
import os
import sys
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sanador_recetas as SR

AHORA = datetime(2026, 11, 14, 12, 0, 0)


def cmd(rc: int = 0, stdout: str = "", stderr: str = "") -> dict:
    return {"returncode": rc, "stdout": stdout, "stderr": stderr}


class GoogleOauthTest(unittest.TestCase):
    """google-oauth alex y alex-docs: estado, aviso a 3 días y refresh."""

    def test_comprobacion_ok_parsea_dias(self):
        llamadas = []

        def ejecutar(c):
            llamadas.append(c)
            return cmd(stdout="caduca en 5 días")

        r = SR.comprobar_google_oauth("alex", ejecutar)
        self.assertTrue(r["ok"])
        self.assertEqual(r["dias_restantes"], 5)
        self.assertFalse(r["aviso_7d"])
        self.assertEqual(llamadas[0], ["cuentas_google", "estado", "alex"])

    def test_aviso_3_dias_antes_con_pasos_para_publicar(self):
        avisos = []

        def avisar(texto):
            avisos.append(texto)
            return {"ok": True}

        def ejecutar(c):
            return cmd(stdout="caduca en 3 días")

        r = SR.comprobar_google_oauth("alex", ejecutar, avisar=avisar)
        self.assertTrue(r["aviso_7d"])
        self.assertIn("Publicar aplicación", avisos[0])
        self.assertIn("SDP1111U", avisos[0])

    def test_sin_aviso_con_mas_de_3_dias(self):
        avisos = []

        def avisar(texto):
            avisos.append(texto)
            return {"ok": True}

        def ejecutar(c):
            return cmd(stdout="caduca en 7 días")

        r = SR.comprobar_google_oauth("alex", ejecutar, avisar=avisar)
        self.assertTrue(r["ok"])
        self.assertEqual(r["aviso_7d"], False)
        self.assertEqual(avisos, [])

    def test_comprobacion_fallo(self):
        r = SR.comprobar_google_oauth("alex", lambda c: cmd(rc=1, stderr="sin credenciales"))
        self.assertFalse(r["ok"])
        self.assertIn("sin credenciales", r["motivo"])

    def test_refresh_ok_y_fallo(self):
        ok = SR.receta_google_oauth_refresh("alex", lambda c: cmd())
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["detalle"], "refresh_token ok")
        caido = SR.receta_google_oauth_refresh("alex", lambda c: cmd(rc=1, stderr="refresh_rejected"))
        self.assertFalse(caido["ok"])
        self.assertIn("refresh falló", caido["motivo"])

    def test_refresh_fallo_red_marca_es_red(self):
        r = SR.receta_google_oauth_refresh("alex", lambda c: cmd(rc=1, stderr="URLError: connection refused"))
        self.assertFalse(r["ok"])
        self.assertTrue(r["es_red"])

    def test_motivo_sin_secretos(self):
        secreto = "sk-abcdefghij1234567890"
        r = SR.receta_google_oauth_refresh("alex", lambda c: cmd(rc=1, stderr=f"bearer {secreto}"))
        self.assertNotIn(secreto, r["motivo"])
        self.assertIn("[REDACTADO]", r["motivo"])

    def test_dias_hasta_caducidad_variantes(self):
        self.assertEqual(SR.dias_hasta_caducidad("caduca en 2 días"), 2)
        self.assertEqual(SR.dias_hasta_caducidad("dias=4"), 4)
        self.assertIsNone(SR.dias_hasta_caducidad("todo en orden"))

class HiggsfieldTest(unittest.TestCase):
    """higgsfield: comprobar con account; sin recetas, solo el aviso de la Mac."""

    def test_comprobacion_ok(self):
        llamadas = []

        def ejecutar(c):
            llamadas.append(c)
            return cmd(stdout="plan fundacionstarseed")

        r = SR.comprobar_higgsfield(ejecutar)
        self.assertTrue(r["ok"])
        self.assertEqual(llamadas[0], ["higgsfield", "account"])

    def test_comprobacion_fallo(self):
        r = SR.comprobar_higgsfield(lambda c: cmd(rc=1, stderr="not logged in"))
        self.assertFalse(r["ok"])
        self.assertIn("not logged in", r["motivo"])

    def test_aviso_trae_el_paso_en_la_mac(self):
        texto = SR.texto_aviso_higgsfield("account falló")
        self.assertIn("higgsfield auth login", texto)
        self.assertIn("account falló", texto)

    def test_en_el_registro_no_tiene_recetas(self):
        self.assertEqual(SR.REGISTRO_RESTO["higgsfield"]["recetas"], [])


class ProveedoresTest(unittest.TestCase):
    """freellmapi y nim: ping, marca de 30 min en el enrutador y reinicio único."""

    def setUp(self):
        self.estado: dict = {}
        self.reinicios: list[list[str]] = []

    def _leer(self):
        return self.estado

    def _guardar(self, est):
        self.estado = est

    def _ejecutar(self, c):
        self.reinicios.append(c)
        return cmd()

    def _receta(self, proveedor, ahora):
        return SR.receta_proveedor(
            proveedor, "starseed-freellmapi", self._ejecutar, ahora,
            self._leer, self._guardar,
        )

    def test_marcar_y_preguntar_son_puros(self):
        marcado = SR.marcar_proveedor_caido({}, "freellmapi", AHORA)
        self.assertEqual(marcado["freellmapi"]["caido_hasta"], (AHORA + timedelta(minutes=30)).isoformat())
        self.assertTrue(SR.proveedor_caido(marcado, "freellmapi", AHORA + timedelta(minutes=29)))
        self.assertFalse(SR.proveedor_caido(marcado, "freellmapi", AHORA + timedelta(minutes=31)))
        self.assertFalse(SR.proveedor_caido({}, "freellmapi", AHORA))

    def test_receta_marca_30_min_y_reinicia_una_vez(self):
        r1 = self._receta("freellmapi", lambda: AHORA)
        self.assertTrue(r1["ok"])
        self.assertEqual(
            self.reinicios, [["systemctl", "--user", "restart", "starseed-freellmapi"]]
        )
        self.assertEqual(len(self.estado), 1)
        self.assertIn("freellmapi", self.estado)

        # Dentro de la ventana: no reinicia de nuevo.
        r2 = self._receta("freellmapi", lambda: AHORA + timedelta(minutes=10))
        self.assertTrue(r2["ok"])
        self.assertEqual(len(self.reinicios), 1)

        # Pasada la ventana (que se desliza con cada marca), incidente nuevo:
        # reinicia una sola vez más.
        r3 = self._receta("freellmapi", lambda: AHORA + timedelta(minutes=41))
        self.assertTrue(r3["ok"])
        self.assertEqual(len(self.reinicios), 2)

    def test_ping_ok_y_fallo(self):
        ok = SR.comprobar_freellmapi(lambda c: cmd())
        self.assertTrue(ok["ok"])
        fallo = SR.comprobar_nim(lambda c: cmd(rc=1, stderr="modelo sin respuesta"))
        self.assertFalse(fallo["ok"])
        self.assertIn("nim", fallo["motivo"])

class TelegramTest(unittest.TestCase):
    """telegram: getMe; con la red caída, no avisar."""

    def test_getme_ok(self):
        r = SR.comprobar_telegram(lambda c: cmd(stdout='{"ok": true}'))
        self.assertTrue(r["ok"])

    def test_red_caida_no_avisa(self):
        r = SR.comprobar_telegram(lambda c: cmd(rc=1, stderr="URLError: network unreachable"))
        self.assertFalse(r["ok"])
        self.assertTrue(r["es_red"])
        self.assertTrue(r["no_avisar"])
        self.assertTrue(SR.no_avisar_si_red(r))

    def test_fallo_sin_red_si_avisaria(self):
        r = SR.comprobar_telegram(lambda c: cmd(rc=1, stderr="respuesta inesperada"))
        self.assertFalse(r["ok"])
        self.assertFalse(r["es_red"])
        self.assertFalse(SR.no_avisar_si_red(r))

    def test_receta_reintentar_conserva_no_avisar(self):
        r = SR.receta_telegram_reintentar(lambda c: cmd(rc=1, stderr="getaddrinfo failed"))
        self.assertTrue(r["no_avisar"])


class RegistroTest(unittest.TestCase):
    """El registro del resto de sesiones, en la forma que carga sanador_sesiones."""

    SESIONES = {
        "google-oauth-alex", "google-oauth-alex-docs", "higgsfield",
        "freellmapi", "nim", "telegram",
    }

    def test_sesiones_del_registro(self):
        self.assertEqual(set(SR.REGISTRO_RESTO.keys()), self.SESIONES)

    def test_forma_compatible_con_el_sanador(self):
        for nombre, config in SR.REGISTRO_RESTO.items():
            self.assertTrue(callable(config["comprobacion"]), nombre)
            self.assertIsInstance(config["recetas"], list, nombre)
            for receta in config["recetas"]:
                self.assertTrue(callable(receta), nombre)

    def test_registro_inyectable_acepta_la_es_inyectada(self):
        avisos = []

        def avisar(texto):
            avisos.append(texto)
            return {"ok": True}

        reg = SR.registro(
            ejecutar=lambda c: cmd(stdout="caduca en 2 días"),
            avisar=avisar,
        )
        r = reg["google-oauth-alex"]["comprobacion"]()
        self.assertTrue(r["aviso_7d"])
        self.assertIn("SDP1111U", avisos[0])


if __name__ == "__main__":
    unittest.main()
