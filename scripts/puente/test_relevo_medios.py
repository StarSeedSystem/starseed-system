# -*- coding: utf-8 -*-
"""RES1121A · relevo de medios: registro, réplica sin secretos, arriendo de canales y simulacro.

Todo es puro: sin red, sin disco y sin reloj propio (el tiempo entra por `ahora`). Las claves
nunca viajan por este módulo salvo por `oracle_nodo.py claves`; aquí solo se comprueba a quién
se le permite guardarlas.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import relevo_medios as R  # noqa: E402

T0 = 1_900_000_000.0


class RegistroTest(unittest.TestCase):
    def test_los_cinco_medios_con_especialidad_y_relevo(self):
        self.assertEqual(set(R.MEDIOS), {"mac", "a1", "maggabox", "github-actions", "cloudroom"})
        for medio, ficha in R.MEDIOS.items():
            self.assertTrue(ficha.get("nombre"), medio)
            self.assertTrue(ficha.get("especialidad"), medio)
            self.assertTrue(ficha.get("releva"), medio)

    def test_maggabox_y_las_nubes_efimeras_nunca_guardan_claves(self):
        self.assertEqual(R.destino_de_claves(), ["a1"])
        for medio in ("maggabox", "github-actions", "cloudroom"):
            self.assertIn(medio, R.medios_sin_claves())
            self.assertFalse(R.MEDIOS[medio]["puede_guardar_claves"], medio)

    def test_mac_y_a1_guardan_las_suyas(self):
        self.assertTrue(R.MEDIOS["mac"]["puede_guardar_claves"])
        self.assertTrue(R.MEDIOS["a1"]["puede_guardar_claves"])

    def test_los_tres_canales_usan_los_nombres_canonicos(self):
        self.assertEqual(set(R.CANALES), {"principal", "general", "audiovisual"})
        self.assertEqual([R.nombre_de_canal(c) for c in R.CANALES],
                         ["Principal", "General", "Audiovisual y diseño"])


class ReplicaTest(unittest.TestCase):
    def test_replica_los_tres_canales_y_el_estado_de_olas(self):
        rutas = R.archivos_de_replica()
        self.assertIn("starseed_memory_root/mando/director/chat.jsonl", rutas)
        self.assertIn("starseed_memory_root/mando/director/general.jsonl", rutas)
        self.assertIn("starseed_memory_root/mando/director/audiovisual.jsonl", rutas)
        self.assertIn("starseed_memory_root/olas", rutas)

    def test_sin_secretos_oculta_claves_y_tokens_anidados(self):
        datos = {
            "canal": "General",
            "telegram_bot": "@starseed_puente_bot",
            "token": "123456:AAH-abcdefghijklmnopqrstuvwxyz012345",
            "nota": "hola 654321:BBH-abcdefghijklmnopqrstuvwxyz012345",
            "anidado": {"api_key": "secreta", "clave": "otra", "estado": "ok"},
        }
        limpio = R.sin_secretos(datos)
        self.assertEqual(limpio["canal"], "General")
        self.assertEqual(limpio["telegram_bot"], "@starseed_puente_bot")
        self.assertEqual(limpio["token"], R.OCULTO)
        self.assertNotIn("654321:BBH", limpio["nota"])
        self.assertEqual(limpio["anidado"]["api_key"], R.OCULTO)
        self.assertEqual(limpio["anidado"]["clave"], R.OCULTO)
        self.assertEqual(limpio["anidado"]["estado"], "ok")

    def test_replicar_cada_pocos_minutos_pero_no_en_cada_pasada(self):
        self.assertFalse(R.toca_replicar(T0, T0 + R.REPLICA_S - 1))
        self.assertTrue(R.toca_replicar(T0, T0 + R.REPLICA_S))


class ArriendoTest(unittest.TestCase):
    def test_el_mac_vivo_conserva_el_arriendo_y_el_a1_cede(self):
        latidos = {"mac": T0, "a1": T0}
        arriendo = {"dueno": "mac", "caduca": T0 + 300, "version": 1, "cursor": {"principal": 9}}
        mac = R.decidir_polling(arriendo, latidos, "mac", T0 + 60)
        self.assertTrue(mac["soy"])
        self.assertEqual(mac["nuevo"]["cursor"], {"principal": 9})
        a1 = R.decidir_polling(arriendo, latidos, "a1", T0 + 60)
        self.assertFalse(a1["soy"])
        self.assertEqual(a1["accion"], "ceder")

    def test_el_a1_espera_al_silencio_del_mac_antes_de_relevar(self):
        latidos = {"mac": T0 + 400, "a1": T0 + 500}
        antes = R.decidir_polling(None, latidos, "a1", T0 + 500 + R.SILENCIO_MAC_S - 1)
        self.assertFalse(antes["soy"])
        despues = R.decidir_polling(None, latidos, "a1", T0 + 500 + R.SILENCIO_MAC_S)
        self.assertTrue(despues["soy"])
        self.assertEqual(despues["accion"], "tomar")

    def test_un_solo_lector_por_bot_y_el_cursor_no_se_pierde(self):
        latidos = {"mac": T0, "a1": T0 + 900}
        a1 = R.decidir_polling({"dueno": "mac", "caduca": T0 + 10, "version": 3,
                                "cursor": {"general": 42}}, latidos, "a1", T0 + 900)
        self.assertTrue(a1["soy"])
        self.assertEqual(a1["nuevo"]["cursor"], {"general": 42})
        otro = R.decidir_polling(a1["nuevo"], {"mac": T0, "a1": T0 + 901}, "mac", T0 + 901)
        self.assertFalse(otro["soy"])
        self.assertEqual(otro["accion"], "esperar")

    def test_el_mac_que_vuelve_recupera_el_canal_sin_duplicar(self):
        vuelta = T0 + 1200
        latidos = {"mac": vuelta, "a1": vuelta}
        arriendo = {"dueno": "a1", "caduca": T0 + 1300, "version": 7, "cursor": {"audiovisual": 5}}
        mac = R.decidir_polling(arriendo, latidos, "mac", vuelta + 1)
        self.assertTrue(mac["soy"])
        self.assertEqual(mac["accion"], "tomar")
        self.assertEqual(mac["nuevo"]["cursor"], {"audiovisual": 5})
        a1 = R.decidir_polling(mac["nuevo"], latidos, "a1", vuelta + 2)
        self.assertFalse(a1["soy"])

    def test_simulacro_responde_en_menos_de_n_mas_dos_minutos_y_vuelve(self):
        s = R.simulacro()
        self.assertTrue(s["cumple"])
        self.assertLessEqual(s["a1_responde_s"], s["limite_s"])
        self.assertTrue(s["mac_recupera"])
        self.assertTrue(s["sin_perder"])
        self.assertTrue(s["sin_duplicar"])


if __name__ == "__main__":
    unittest.main()
