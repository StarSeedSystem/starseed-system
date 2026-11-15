#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(BAN1115O) «banco-cancelar»: la serie en curso acaba limpia, suelta la ronda y `estado` dice «cancelada por <quien>». Nada real."""
import fcntl
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banco_llamadas as BLL  # noqa: E402
import director_pruebas_logica as D  # noqa: E402
from test_banco_llamadas import lec  # noqa: E402
from test_banco_llamadas_serie import Base, serie  # noqa: E402


def pedir_cancelar(m, quien="alex"):
    os.makedirs(m.ruta(), exist_ok=True)
    m.escribir_json(BLL.CANCELAR, {"quien": quien, "t": m.t})


class Cancelar(Base):
    def test_cancelar_mientras_espera_la_calma_acaba_limpia_y_lo_dice(self):
        m = self.m()
        m.lectura = lambda t: lec(t, presion=2, carga1=7.2)       # nunca hay calma: la serie se queda esperando
        veces = []

        def al_dormir(mm):
            veces.append(1)
            if len(veces) == 3:
                pedir_cancelar(mm, "alex")
        m.al_dormir = al_dormir
        s, est = serie(m, 5)
        self.assertEqual(est["estado"], "cancelada")
        self.assertEqual(est["motivo_fin"], "cancelada por alex")
        self.assertIsNone(est.get("espera"))
        self.assertEqual(m.peticiones, [])                         # aún no había pedido la ronda
        self.assertLimpio(m)
        self.assertFalse(os.path.exists(m.ruta(BLL.CANCELAR)), "cancelar.json quedó")
        self.assertEqual(self.guardado()["estado"], "cancelada")

    def test_cancelar_en_plena_llamada_suelta_la_ronda_y_la_orden(self):
        m = self.m()
        m.plan = {1: "silencio"}                                   # la app no toma la orden: la serie espera el «banco inicio»
        hechas = []

        def al_dormir(mm):
            if mm.leer_json(BLL.ORDEN) and not hechas:
                hechas.append(1)
                pedir_cancelar(mm, "claude")
        m.al_dormir = al_dormir
        s, est = serie(m, 3)
        self.assertEqual((est["estado"], est["motivo_fin"]), ("cancelada", "cancelada por claude"))
        self.assertEqual(m.peticiones, ["ronda-iniciar", "ronda-terminar"])    # la ronda de aparatos se soltó
        self.assertLimpio(m)

    def test_estado_dice_como_cancelar_mientras_corre_y_quien_cancelo_despues(self):
        enc = {"serie": "s1", "rep": 5, "esc": "tableta-llama", "estado": "en-curso", "llamadas": [],
               "espera": {"desde": "d", "t": "t", "limite_s": 7200, "quedan_s": 3600, "motivo": "carga", "buenas_seguidas": 0, "se_piden": 3}}
        t = BLL.texto_estado({"series": [enc]})
        self.assertIn("pedir banco-cancelar", t)
        enc.update(estado="cancelada", motivo_fin="cancelada por alex")
        t2 = BLL.texto_estado({"series": [enc]})
        self.assertIn("cancelada · cancelada por alex", t2)
        self.assertNotIn("pedir banco-cancelar", t2)

    def test_sin_serie_en_marcha_no_hay_nada_que_cancelar_ni_se_deja_marca(self):
        ok, texto = BLL.cancelar(self.tmp, "alex")
        self.assertFalse(ok)
        self.assertIn("no hay ninguna serie", texto)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "banco-llamadas", BLL.CANCELAR)))

    def test_con_serie_viva_deja_la_peticion_con_quien_y_la_serie_la_ve(self):
        carpeta = os.path.join(self.tmp, "banco-llamadas")
        os.makedirs(carpeta)
        with open(os.path.join(carpeta, BLL.LOCK), "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)                        # «hay una serie corriendo»
            ok, texto = BLL.cancelar(self.tmp, "hermes")
        self.assertTrue(ok, texto)
        self.assertEqual(json.load(open(os.path.join(carpeta, BLL.CANCELAR)))["quien"], "hermes")
        self.assertEqual(self.m().cancelada(), "hermes")

    def test_el_director_admite_la_accion_y_sin_campos_de_serie(self):
        self.assertIn("banco-cancelar", D.ACCIONES)
        p, err = D.validar_peticion({"id": "pet-banco-cancelar-1", "accion": "banco-cancelar", "quien": "alex"})
        self.assertIsNone(err, err)
        self.assertEqual(p["accion"], "banco-cancelar")
        _, err = D.validar_peticion({"id": "pet-banco-cancelar-2", "accion": "banco-cancelar", "quien": "alex", "rep": 3})
        self.assertIsNotNone(err)


if __name__ == "__main__":
    unittest.main()
