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
        # "X" ya no basta: el secreto tiene que ser uno de los que lee el workflow.
        self.assertEqual(M.clasificar_gh(True, True, ["GROQ_API_KEY"], [{"status": "in_progress"}])["estado"], "listo")
        d = M.clasificar_gh(True, True, ["GROQ_API_KEY"], [{"status": "completed", "conclusion": "success"}])
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


class SecretosDelEnjambre(unittest.TestCase):
    """Un medio se declara usable por lo que el enjambre necesita, no por lo que haya.

    El 2026-09-20 el repo tenía seis secretos —todos de firma de Android y Tauri— y el
    medio salía «usable»; el workflow moría en el paso de claves con «sin secretos».
    """

    def test_secretos_de_firma_no_cuentan(self):
        d = M.clasificar_gh(True, True, ["ANDROID_KEYSTORE_BASE64", "TAURI_SIGNING_PRIVATE_KEY"], [])
        self.assertEqual("requiere_alex", d["estado"])
        self.assertIn("firma", d["detalle"])

    def test_una_clave_de_proveedor_basta(self):
        d = M.clasificar_gh(True, True, ["ANDROID_KEYSTORE_BASE64", "OPENROUTER_API_KEY"], [])
        self.assertEqual("usable", d["estado"])
        self.assertIn("1 clave", d["detalle"])


class Oracle(unittest.TestCase):
    """Estados del contrato oracle-nube.md §9: ya no es «descartado»."""

    A1 = {"nombre": "starseed-a1", "forma": "VM.Standard.A1.Flex", "ocpus": 2, "gb": 12,
          "estado": "RUNNING", "ip_publica": "203.0.113.10"}

    def test_sin_oracle_json_requiere_a_alex_con_el_paso_de_vinculacion(self):
        d = M.clasificar_oracle(None, None, 1_000_000.0)
        self.assertEqual("requiere_alex", d["estado"])
        self.assertIn("oci setup bootstrap", d["siguiente_paso"])
        self.assertIn("A1 2 OCPU · 12 GB", d["capacidad"])

    def test_vinculada_falsa_sigue_requiriendo_a_alex(self):
        d = M.clasificar_oracle({"vinculada": False}, None, 1_000_000.0)
        self.assertEqual("requiere_alex", d["estado"])

    def test_vinculada_sin_a1_es_usable(self):
        d = M.clasificar_oracle({"vinculada": True, "region": "mx-queretaro-1", "instancias": []},
                                None, 1_000_000.0)
        self.assertEqual("usable", d["estado"])
        self.assertIn("queretaro", d["detalle"])

    def test_a1_en_marcha_sin_orquestador_todavia_es_usable(self):
        datos = {"vinculada": True, "region": "mx-queretaro-1", "instancias": [self.A1]}
        self.assertEqual("usable", M.clasificar_oracle(datos, {"medios": {}}, 1_000_000.0)["estado"])

    def test_a1_en_marcha_con_orquestador_anunciado_es_listo(self):
        ahora = 1_000_000.0
        datos = {"vinculada": True, "region": "mx-queretaro-1", "instancias": [self.A1]}
        reg = {"medios": {"o1": {"entorno": "oracle", "origen": "oracle", "latido": ahora - 60}}}
        d = M.clasificar_oracle(datos, reg, ahora)
        self.assertEqual("listo", d["estado"])

    def test_un_latido_viejo_no_basta_para_listo(self):
        ahora = 1_000_000.0
        datos = {"vinculada": True, "instancias": [self.A1]}
        reg = {"medios": {"o1": {"origen": "oracle", "latido": ahora - 4000}}}
        self.assertEqual("usable", M.clasificar_oracle(datos, reg, ahora)["estado"])

    # (OC1010) El medidor de consumo (~/.starseed/oracle-consumo.json) decide el freno y el margen.
    CONSUMO = {"leido": "2026-10-10T01:00:00Z", "freno": {"activo": False, "motivo": ""},
               "margen": {"apto": True, "cpu_libre_pct": 99.5, "mem_libre_gb": 11.4},
               "reclamacion": {"riesgo": True, "maquinas": [{"nombre": "starseed-a1", "riesgo": True,
                                                              "reclamable_desde": "2026-10-14T23:00:00Z"}]}}

    def test_con_consumo_dice_el_margen_libre_y_el_riesgo_de_reclamacion(self):
        datos = {"vinculada": True, "region": "mx-queretaro-1", "instancias": [self.A1]}
        d = M.clasificar_oracle(datos, {"medios": {}}, 1_000_000.0, self.CONSUMO)
        self.assertEqual("usable", d["estado"])
        self.assertIn("libre ahora: 99,5 % CPU · 11,4 GB", d["capacidad"])
        self.assertIn("reclamarlo desde el 2026-10-14", d["detalle"])

    def test_gasto_mayor_que_cero_frena_el_medio(self):
        ahora = 1_000_000.0
        datos = {"vinculada": True, "region": "mx-queretaro-1", "instancias": [self.A1]}
        reg = {"medios": {"o1": {"origen": "oracle", "latido": ahora - 60}}}
        consumo = dict(self.CONSUMO, freno={"activo": True, "motivo": "el gasto del mes es 0.4 MXN"})
        d = M.clasificar_oracle(datos, reg, ahora, consumo)
        self.assertEqual("requiere_alex", d["estado"])
        self.assertIn("freno", d["detalle"])
        self.assertIn("cloud.oracle.com", d["siguiente_paso"])
