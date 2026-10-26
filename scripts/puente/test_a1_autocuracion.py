# -*- coding: utf-8 -*-
"""CAP1026J (2026-10-26) · el A1 se repara solo: servicios caídos, máquina colgada o parada."""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import a1_autocuracion as A  # noqa: E402

T = 1_800_000_000.0
SIN_SSH = {"ssh": False, "detalle": "Connection timed out during banner exchange"}
CON_SSH = {"ssh": True, "caidos": []}


def colgado(min_desde, fallos, acciones=()):
    return {"fallos": fallos, "primer_fallo": T - min_desde * 60, "acciones": list(acciones)}


class SshResponde(unittest.TestCase):
    def test_todo_bien(self):
        self.assertEqual(A.decidir({}, CON_SSH, None, T)[0], "nada")

    def test_servicio_caido_se_reinicia(self):
        accion, motivo = A.decidir({}, {"ssh": True, "caidos": ["starseed-medio"]}, None, T)
        self.assertEqual(accion, "servicios")
        self.assertIn("starseed-medio", motivo)

    def test_un_servicio_no_se_reinicia_en_bucle(self):
        e = {"servicios": {"starseed-medio": T - 60}}
        self.assertEqual(A.servicios_a_reiniciar(e, ["starseed-medio", "starseed-bitnet"], T), ["starseed-bitnet"])

    def test_la_sonda_buena_pone_los_fallos_a_cero(self):
        e = A.anotar_sonda(colgado(30, 5), CON_SSH, T)
        self.assertEqual((e["fallos"], e["primer_fallo"]), (0, None))


class SshNoResponde(unittest.TestCase):
    def test_un_fallo_nuestro_no_reinicia_la_maquina(self):
        for detalle in ("Permission denied (publickey).", "Host key verification failed.", "sin A1 en oracle.json"):
            self.assertEqual(A.decidir(colgado(60, 9), {"ssh": False, "detalle": detalle}, "RUNNING", T)[0], "esperar")
        self.assertTrue(A.fallo_de_maquina("Connection timed out during banner exchange"))

    def test_sin_oracle_no_se_toca(self):
        self.assertEqual(A.decidir(colgado(60, 9), SIN_SSH, None, T)[0], "esperar")

    def test_pocas_sondas_o_poco_tiempo_espera(self):
        self.assertEqual(A.decidir(colgado(4, 1), SIN_SSH, "RUNNING", T)[0], "esperar")
        self.assertEqual(A.decidir(colgado(30, 1), SIN_SSH, "RUNNING", T)[0], "esperar")  # 2 fallos con esta

    def test_colgado_de_verdad_reinicio_suave(self):
        # el caso medido: Oracle «RUNNING», sin saludo de SSH 3 sondas y 10 min
        self.assertEqual(A.decidir(colgado(10, 2), SIN_SSH, "RUNNING", T)[0], "softreset")

    def test_tras_el_suave_se_le_deja_volver_y_si_no_duro(self):
        suave = [{"t": T - 5 * 60, "accion": "softreset"}]
        self.assertEqual(A.decidir(colgado(40, 8, suave), SIN_SSH, "RUNNING", T)[0], "esperar")
        suave = [{"t": T - 16 * 60, "accion": "softreset"}]
        self.assertEqual(A.decidir(colgado(40, 8, suave), SIN_SSH, "RUNNING", T)[0], "reset")
        duro = [{"t": T - 10 * 60, "accion": "reset"}]
        self.assertEqual(A.decidir(colgado(60, 12, duro), SIN_SSH, "RUNNING", T)[0], "esperar")

    def test_mientras_cambia_de_estado_se_espera(self):
        for e in A.TRANSITORIOS:
            self.assertEqual(A.decidir(colgado(60, 9), SIN_SSH, e, T)[0], "esperar")

    def test_parado_se_arranca(self):
        self.assertEqual(A.decidir(colgado(1, 0), SIN_SSH, "STOPPED", T)[0], "start")
        arr = [{"t": T - 60, "accion": "start"}]
        self.assertEqual(A.decidir(colgado(1, 0, arr), SIN_SSH, "STOPPED", T)[0], "esperar")

    def test_tope_de_acciones_al_dia(self):
        muchas = [{"t": T - h * 3600, "accion": "reset"} for h in (20, 15, 10, 5)]
        self.assertEqual(A.decidir(colgado(60, 12, muchas), SIN_SSH, "RUNNING", T)[0], "avisar_tope")
        viejas = [{"t": T - h * 3600, "accion": "reset"} for h in (40, 35, 30, 26)]
        self.assertEqual(A.decidir(colgado(60, 12, viejas), SIN_SSH, "RUNNING", T)[0], "softreset")


class CerrojoDeGitAbandonado(unittest.TestCase):
    """CAP1026M · un index.lock de un git muerto dejaba cada cola del A1 en «rc: checkout»."""

    def test_viejo_y_sin_git_vivo_se_aparta(self):
        self.assertTrue(A.cerrojo_abandonado({"ssh": True, "cerrojo_s": 16488, "git_vivos": 0}))

    def test_reciente_o_con_git_vivo_no(self):
        self.assertFalse(A.cerrojo_abandonado({"ssh": True, "cerrojo_s": 60, "git_vivos": 0}))
        self.assertFalse(A.cerrojo_abandonado({"ssh": True, "cerrojo_s": 16488, "git_vivos": 1}))
        self.assertFalse(A.cerrojo_abandonado({"ssh": True, "cerrojo_s": None, "git_vivos": 0}))
        self.assertFalse(A.cerrojo_abandonado({"ssh": False, "detalle": "timed out"}))


class VueltaDelReinicio(unittest.TestCase):
    def test_tras_volver_se_le_manda_trabajo_una_vez(self):
        e = {"acciones": [{"t": T - 20 * 60, "accion": "softreset"}]}
        self.assertTrue(A.volvio_de_un_reinicio(e, CON_SSH, T))
        e["acciones"][-1]["relanzado"] = T
        self.assertFalse(A.volvio_de_un_reinicio(e, CON_SSH, T))
        self.assertFalse(A.volvio_de_un_reinicio({"acciones": [{"t": T - 60, "accion": "softreset"}]}, SIN_SSH, T))


if __name__ == "__main__":
    unittest.main()
