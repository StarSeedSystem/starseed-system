# -*- coding: utf-8 -*-
"""Pruebas del ahogo de la neurona (LID1101A): una ahogada (presión del núcleo ≥ 2, swap > 90 % o
su Genesis sin contestar) no toma ni renueva el arriendo de líder de dirección, y con la puerta
inalcanzable no se declara líder en local si el A1 latió hace menos de 10 min. La medida se inyecta.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lider_direccion as LD  # noqa: E402
import lider_ahogo as IA  # noqa: E402
import puerta_datos_cliente as pdc  # noqa: E402
import test_lider_direccion as ANTERIOR  # noqa: E402

T0 = 1_900_000_000.0


class Puras(unittest.TestCase):
    def test_presion_del_nucleo_en_aviso_y_critica_ahogan(self):
        self.assertIn("presión", IA.causa_ahogo(2, 0.0, 0.0, True))
        self.assertIn("presión", IA.causa_ahogo(4, 0.0, 0.0, True))
        self.assertEqual(IA.causa_ahogo(1, 0.0, 0.0, True), "")

    def test_swap_al_90_sin_llegar_respira_y_pasado_ahoga(self):
        self.assertEqual(IA.causa_ahogo(None, 90, 100, True), "")
        self.assertEqual(IA.causa_ahogo(None, 90.1, 100, True), "swap 90 de 100 MB")

    def test_genesis_sin_contestar_ahoga_y_lo_que_no_se_mide_no(self):
        self.assertEqual(IA.causa_ahogo(None, 0.0, 0.0, False), "su Genesis no contesta")
        self.assertEqual(IA.causa_ahogo(None, 0.0, 0.0, None), "")
        self.assertEqual(IA.causa_ahogo(None, None, None, True), "")

    def test_el_a1_que_latio_hace_poco_impide_lider_local_sin_puerta(self):
        self.assertEqual(IA.a1_desde({"latido": T0 - 500}, T0), 500.0)
        self.assertIsNone(IA.a1_desde({"latido": 0}, T0))
        self.assertIsNone(IA.a1_desde(None, T0))
        self.assertIn("el A1 latió", str(IA.sin_puerta(T0, {"latido": T0 - 500})))
        self.assertIsNone(IA.sin_puerta(T0, {"latido": T0 - 700}))
        self.assertIsNone(IA.sin_puerta(T0, None))
        self.assertIsNone(IA.sin_puerta(T0, {"latido": T0 + 5}))  # reloj atrasado: mejor en local

    def test_fuera_con_la_medida_inyectada(self):
        sana = {"presion": 1, "swap_usado": 0.0, "swap_total": 0.0, "genesis_ok": True}
        self.assertIsNone(IA.fuera(sana))
        ahogada = {"presion": 2, "swap_usado": 0.0, "swap_total": 0.0, "genesis_ok": None}
        self.assertEqual(IA.fuera(ahogada), "ahogada: presión de memoria 2 del núcleo")


class ConPuerta(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="lider-ahogo-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.f = ANTERIOR.HttpFalso()
        self.p = pdc.Puerta(url="https://puerta.prueba", ficha="pd_" + "f" * 43, http=self.f,
                            ahora=lambda: T0, cola=os.path.join(self.dir, "cola.jsonl"))
        self._sanas = (LD._ahogo, LD._sin_puerta)

    def tearDown(self):
        LD._ahogo, LD._sin_puerta = self._sanas

    def ahogada(self):
        LD._ahogo = lambda *a, **k: "ahogada: su Genesis no contesta"

    def a1_al_lado(self):
        LD._sin_puerta = lambda *a, **k: "sin puerta: el A1 latió hace 120 s"

    def poner(self, dueno, version, caduca, tomado):
        self.f.latidos[LD.ID] = {"id": LD.ID, "clase": LD.CLASE, "t": 0,
                                 "datos": {"dueno": dueno, "version": version, "caduca": caduca,
                                           "tomado": tomado}}

    def test_una_ahogada_no_toma_ni_renueva_el_arriendo(self):
        self.ahogada()
        r = LD.renovar("mac-1", T0, self.p)
        self.assertFalse(r["soy"] or r["escrito"])
        self.assertIn("ahogada", r["motivo"])
        self.assertFalse(LD.soy_lider("mac-1", T0, self.p)["soy"])
        self.assertEqual(self.f.escrituras, 0)  # ni escribe: la puerta no recibe nada suyo

    def test_una_ahogada_que_era_lider_deja_de_creerse_lider(self):
        self.poner("mac-1", 1, T0 + 170, T0)
        self.ahogada()
        d = LD.soy_lider("mac-1", T0 + 30, self.p)
        self.assertFalse(d["soy"])
        self.assertIn("ahogada", d["motivo"])
        self.assertFalse(LD.renovar("mac-1", T0 + 60, self.p)["escrito"])
        self.assertEqual(self.f.escrituras, 0)

    def test_con_la_puerta_caida_y_el_a1_latiendo_no_declara_lider_local(self):
        self.f.sana = False
        self.a1_al_lado()
        d = LD.soy_lider("mac-1", T0, self.p)
        self.assertFalse(d["soy"])
        self.assertIn("el A1 latió", d["motivo"])
        self.assertFalse(LD.renovar("mac-1", T0, self.p)["soy"])

    def test_con_la_puerta_caida_y_nadie_a1_ahi_sigue_lider_local(self):
        self.f.sana = False  # sin A1 al lado y sin medida de ahogo: como hoy, en local
        self.assertTrue(LD.soy_lider("mac-1", T0, self.p)["soy"])
        self.assertTrue(LD.renovar("mac-1", T0, self.p)["soy"])

    def test_la_ahogada_manda_antes_que_el_latido_del_a1(self):
        self.f.sana = False
        self.a1_al_lado()
        self.ahogada()  # doble esta: se dice la causa primera, la del ahogo
        self.assertIn("ahogada", LD.soy_lider("mac-1", T0, self.p)["motivo"])


if __name__ == "__main__":
    unittest.main()
