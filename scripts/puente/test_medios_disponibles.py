import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import medios_disponibles as M  # noqa: E402


class Clasificar(unittest.TestCase):
    def test_mac_dice_cuantos_agentes_y_el_maximo(self):
        d = M.clasificar_mac({"trabajadores": 3, "maximo_hardware": 3, "ram_total_mb": 8192,
                              "ram_libre_mb": 1500, "motivo": "máximo (máquina libre)"})
        self.assertEqual(d["estado"], "listo")
        self.assertIn("3 agente(s)", d["capacidad"])
        self.assertIn("8.0 GB", d["capacidad"])

    def test_mac_sin_gobernador_es_usable_con_siguiente_paso(self):
        d = M.clasificar_mac(None)
        self.assertEqual(d["estado"], "usable")
        self.assertTrue(d["siguiente_paso"])

    def test_claude_listo_solo_con_latido_fresco(self):
        ahora = 1_000_000.0
        reg = {"medios": {"a": {"entorno": "nube", "origen": "claude", "latido": ahora - 60}}}
        self.assertEqual(M.clasificar_claude(reg, ahora)["estado"], "listo")
        viejo = {"medios": {"a": {"entorno": "nube", "origen": "claude", "latido": ahora - 4000}}}
        self.assertEqual(M.clasificar_claude(viejo, ahora)["estado"], "usable")
        self.assertEqual(M.clasificar_claude({"medios": {}}, ahora)["estado"], "no_disponible")

    def test_gh_pide_a_alex_cuando_falta_sesion_o_secretos(self):
        self.assertEqual(M.clasificar_gh(False, True, ["X"], [])["estado"], "requiere_alex")
        self.assertEqual(M.clasificar_gh(True, False, ["X"], [])["estado"], "no_disponible")
        sin = M.clasificar_gh(True, True, [], [])
        self.assertEqual(sin["estado"], "requiere_alex")
        self.assertIn("secretos", sin["siguiente_paso"])

    def test_gh_listo_solo_si_hay_ejecucion_en_marcha(self):
        self.assertEqual(M.clasificar_gh(True, True, ["X"], [{"status": "in_progress"}])["estado"], "listo")
        d = M.clasificar_gh(True, True, ["X"], [{"status": "completed", "conclusion": "success"}])
        self.assertEqual(d["estado"], "usable")
        self.assertIn("lanzar", d["siguiente_paso"])

    def test_hf_gratuito_requiere_alex_y_lo_dice_sin_rodeos(self):
        d = M.clasificar_hf({"name": "x", "isPro": False}, [], None)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("PRO", d["capacidad"])
        self.assertEqual(M.clasificar_hf(None, None, "sin_token")["estado"], "requiere_alex")
        self.assertEqual(M.clasificar_hf({"name": "x", "isPro": True}, [], None)["estado"], "usable")

    def test_gcloud_usable_solo_con_cuenta_activa(self):
        self.assertEqual(M.clasificar_gcloud(False, [], "", [])["estado"], "requiere_alex")
        self.assertEqual(M.clasificar_gcloud(True, [], "", [])["estado"], "requiere_alex")
        d = M.clasificar_gcloud(True, ["a@b.c"], "proy", [{}])
        self.assertEqual(d["estado"], "usable")
        self.assertIn("proy", d["detalle"])

    def test_ningun_medio_inventa_un_estado(self):
        for m in (M.clasificar_mac(None), M.clasificar_claude(None, 1.0),
                  M.clasificar_gh(True, True, ["X"], []), M.clasificar_hf(None, None, "sin_token"),
                  M.clasificar_gcloud(True, ["a"], "p", [])):
            self.assertIn(m["estado"], M.ESTADOS)
            self.assertTrue(m["id"] and m["nombre"])


if __name__ == "__main__":
    unittest.main()
