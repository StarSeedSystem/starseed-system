# -*- coding: utf-8 -*-
"""Pruebas de RES1121A · relevo de medios: registro, réplica sin secretos, arriendo de un solo
lector por bot de Telegram, offset sin duplicar ni perder y simulacro Mac → A1 → Mac.

Puras, sin red y sin tocar el estado real (`~/.starseed`): el tiempo lo pone cada prueba.
"""
import contextlib
import copy
import io
import json
import os
import sys
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)
import relevo_medios as R  # noqa: E402

CFG = {
    "principal": {"nombre": "Principal", "telegram_bot": "@starseed_neurocortex_bot",
                  "telegram_env_token": "TELEGRAM_MAGGACORTEX_BOT_TOKEN",
                  "telegram_env_chat_id": "TELEGRAM_MAGGACORTEX_CHAT_ID",
                  "telegram_polling_permitido": True},
    "general": {"nombre": "General", "telegram_bot": "@starseed_puente_bot",
                "telegram_env_token": "TELEGRAM_BOT_TOKEN",
                "telegram_env_chat_id": "TELEGRAM_CHAT_ID"},
    "audiovisual": {"nombre": "Audiovisual y diseño", "telegram_bot": "@StarSeed_Design_bot",
                    "telegram_env_token": "TELEGRAM_SINTESIS_BOT_TOKEN",
                    "telegram_env_chat_id": "TELEGRAM_SINTESIS_CHAT_ID"},
}
AHORA = 1_800_000_000.0
OLAS = {"progreso": {"ola": "DIR1121", "tareas": 4, "estado": "en curso"},
        "medios": {"mac": {"latido": AHORA}, "clave_privada": "no-debe-viajar"}}


class Registro(unittest.TestCase):
    def test_los_cuatro_medios_y_sus_especialidades(self):
        esp = {m: set(d["especialidad"]) for m, d in R.REGISTRO.items()}
        self.assertEqual(set(esp), {"mac", "oracle-a1", "maggabox", "nubes-efimeras"})
        self.assertEqual(esp["mac"], {"orquestador", "puertas", "cartero", "presidente", "bot Principal"})
        self.assertEqual(esp["oracle-a1"], {"siempre encendido", "bot de diseño", "guardián de main",
                                            "cola de respaldo", "nube"})
        self.assertEqual(esp["maggabox"], {"almacén", "espejo de GitHub cada 15 min", "versiones",
                                           "respaldos cifrados"})
        self.assertIn("trabajo sin secretos de Alex", esp["nubes-efimeras"])

    def test_cada_medio_declara_quien_lo_releva_y_el_registro_valida(self):
        self.assertEqual(R.validar_registro(), [])
        for medio in ("mac", "oracle-a1"):
            self.assertTrue(R.REGISTRO[medio]["lo_releva"], medio)
        self.assertFalse(R.REGISTRO["maggabox"]["con_claves"])
        self.assertFalse(R.REGISTRO["nubes-efimeras"]["con_claves"])

    def test_un_registro_incompleto_se_detecta(self):
        roto = copy.deepcopy(R.REGISTRO)
        roto["maggabox"]["con_claves"] = True
        roto["mac"]["especialidad"] = ()
        roto["oracle-a1"]["lo_releva"] = ("oracle-a1",)
        fallos = "\n".join(R.validar_registro(roto))
        self.assertIn("maggabox", fallos)
        self.assertIn("mac sin especialidad", fallos)
        self.assertIn("no puede relevarse a sí mismo", fallos)

    def test_tres_copias_dos_medios_y_una_fuera_de_la_mac(self):
        self.assertEqual(R.verificar_resiliencia(), [])
        roto = copy.deepcopy(R.DATOS_CRITICOS)
        roto["canales"]["copias"] = ("mac", "mac")
        roto["claves"]["copias"] = ("mac", "oracle-a1", "maggabox")
        fallos = "\n".join(R.verificar_resiliencia(roto))
        self.assertIn("canales", fallos)
        self.assertIn("nunca al Maggabox", fallos)

    def test_el_paso_de_alex_queda_como_accion_suya(self):
        acciones = "\n".join(R.acciones_de_alex())
        self.assertIn("oracle_nodo.py claves", acciones)
        self.assertIn("General", acciones)


class CanalesYReplica(unittest.TestCase):
    def test_los_tres_canales_tienen_los_nombres_y_bots_canonicos(self):
        publicos = R.canales_publicos(CFG)
        self.assertEqual([c["nombre"] for c in publicos], ["Principal", "General", "Audiovisual y diseño"])
        self.assertEqual([c["bot"] for c in publicos],
                         ["@starseed_neurocortex_bot", "@starseed_puente_bot", "@StarSeed_Design_bot"])
        self.assertEqual(R.canales_publicos({})[0]["nombre"], "Principal")

    def test_los_nombres_salen_del_registro_unico_y_no_se_escriben_a_mano(self):
        cfg = copy.deepcopy(CFG)
        cfg["general"]["nombre"] = "General · dirección"
        self.assertEqual(R.nombre_de_canal("general", cfg), "General · dirección")
        self.assertEqual(R.canales_publicos(cfg)[1]["nombre"], "General · dirección")

    def test_el_a1_recibe_nombres_de_variables_nunca_sus_valores(self):
        a1 = R.canales_para_a1(CFG)
        self.assertEqual(a1["general"]["telegram_env_token"], "TELEGRAM_BOT_TOKEN")
        self.assertEqual(a1["general"]["telegram_bot"], "@starseed_puente_bot")
        self.assertNotIn("123456:", json.dumps(a1))
        self.assertNotIn("sk-", json.dumps(a1))

    def test_el_maggabox_no_recibe_secretos_ni_variables_de_claves(self):
        texto = json.dumps(R.construir_replica("maggabox", CFG, OLAS, ahora=AHORA), ensure_ascii=False)
        self.assertIn("Audiovisual y diseño", texto)
        for prohibido in ("TELEGRAM_", "token", "clave_privada", "no-debe-viajar"):
            self.assertNotIn(prohibido, texto, prohibido)

    def test_las_nubes_efimeras_no_reciben_replica_de_direccion(self):
        with self.assertRaises(ValueError):
            R.construir_replica("nube-efimera", CFG, OLAS)
        self.assertFalse(R.puede_replicar("nube-efimera"))
        self.assertTrue(R.puede_replicar("oracle-a1"))
        self.assertTrue(R.puede_replicar("maggabox"))

    def test_las_claves_solo_van_al_a1_por_oracle_nodo_claves(self):
        self.assertTrue(R.puede_llevar_claves("oracle-a1"))
        for destino in ("maggabox", "nubes-efimeras", "mac", "nube-efimera"):
            self.assertFalse(R.puede_llevar_claves(destino), destino)
        politica = R.destinos_de_claves()
        self.assertEqual(politica["origen"], "oracle_nodo.py claves")
        self.assertEqual(politica["permitidos"], ["oracle-a1"])
        self.assertEqual(set(politica["prohibidos"]), {"maggabox", "nubes-efimeras"})

    def test_la_replica_toca_cada_pocos_minutos_y_no_en_bucle(self):
        self.assertFalse(R.toca_replicar(AHORA + R.INTERVALO_REPLICA_S - 1, AHORA))
        self.assertTrue(R.toca_replicar(AHORA + R.INTERVALO_REPLICA_S, AHORA))


class ArriendoDeBots(unittest.TestCase):
    def _estado(self, mac_t=AHORA, a1_t=AHORA):
        e = R.estado_inicial()
        R.latir(e, "mac", mac_t)
        R.latir(e, "oracle-a1", a1_t)
        R.latir(e, "maggabox", AHORA)
        return e

    def test_la_mac_viva_es_la_lider(self):
        e = self._estado()
        self.assertEqual(R.decidir_lider(e, AHORA), "mac")
        self.assertTrue(R.medio_vivo(e, "mac", AHORA))

    def test_si_la_mac_calla_el_a1_es_la_lider(self):
        e = self._estado(mac_t=AHORA - R.SILENCIO_MAC_S - 1)
        self.assertFalse(R.medio_vivo(e, "mac", AHORA))
        self.assertEqual(R.decidir_lider(e, AHORA), "oracle-a1")

    def test_un_solo_lector_por_bot_mientras_el_arriendo_este_vigente(self):
        e = self._estado()
        plan_mac, e = R.plan_arriendos(e, "mac", AHORA)
        self.assertTrue(all(d["soy"] for d in plan_mac.values()))
        plan_a1, _ = R.plan_arriendos(e, "oracle-a1", AHORA)
        self.assertTrue(all(not d["soy"] for d in plan_a1.values()))
        for canal in R.CANALES:
            self.assertEqual(e["arriendos"][canal]["dueno"], "mac")

    def test_mientras_la_mac_vive_el_a1_no_le_roba_los_bots_libres(self):
        plan, e = R.plan_arriendos(self._estado(), "oracle-a1", AHORA)
        self.assertTrue(all(not d["soy"] for d in plan.values()))
        self.assertEqual(e["arriendos"], {})
        self.assertIn("espera al líder", plan["general"]["motivo"])

    def test_sin_latido_de_la_mac_el_a1_toma_los_tres_bots(self):
        e = self._estado(mac_t=AHORA - R.SILENCIO_MAC_S - 1)
        plan, e = R.plan_arriendos(e, "oracle-a1", AHORA)
        self.assertTrue(all(d["soy"] and d["actuar"] for d in plan.values()))
        self.assertEqual({e["arriendos"][c]["dueno"] for c in R.CANALES}, {"oracle-a1"})

    def test_la_mac_espera_el_getupdates_del_a1_y_luego_recupera_sin_perder_offset(self):
        e = self._estado(mac_t=AHORA - R.SILENCIO_MAC_S - 1)
        _, e = R.plan_arriendos(e, "oracle-a1", AHORA)
        R.anotar_offset(e, "general", 77, AHORA + 5)
        pronto, _ = R.plan_arriendos(e, "mac", AHORA + R.RECLAMO_MAC_S - 1)
        self.assertTrue(all(not d["soy"] for d in pronto.values()))
        tarde = AHORA + R.RECLAMO_MAC_S + 1
        R.latir(e, "mac", tarde)
        plan, e = R.plan_arriendos(e, "mac", tarde)
        self.assertTrue(all(d["soy"] for d in plan.values()))
        self.assertEqual(R.offset_de(e, "general"), 77)
        self.assertEqual(e["arriendos"]["general"]["dueno"], "mac")

    def test_al_volver_la_mac_fusiona_el_offset_que_dejo_el_a1(self):
        local = self._estado(mac_t=AHORA - 600)
        remoto = self._estado(mac_t=AHORA - 600)
        remoto["arriendos"]["general"] = {"dueno": "oracle-a1", "caduca": AHORA + 100, "version": 4, "tomado": AHORA}
        R.anotar_offset(remoto, "general", 77, AHORA)
        plan, e = R.recuperar_al_volver(local, remoto, "mac", AHORA + 61)
        self.assertTrue(all(d["soy"] for d in plan.values()))
        self.assertEqual(R.offset_de(e, "general"), 77)
        self.assertEqual(e["arriendos"]["general"]["dueno"], "mac")

    def test_el_offset_no_duplica_al_repetir_el_lote_y_no_pierde_los_nuevos(self):
        self.assertEqual(R.siguiente_offset(0, [{"update_id": 10}, {"update_id": 11}]), 12)
        self.assertEqual(R.siguiente_offset(12, [{"update_id": 10}, {"update_id": 11}]), 12)
        self.assertEqual(R.siguiente_offset(5, [{"update_id": 3}, {"update_id": 9}]), 10)

    def test_fusionar_no_hace_retroceder_offset_ni_arriendo(self):
        local = self._estado(mac_t=AHORA)
        local["offsets"] = {"general": {"update_id": 10, "actualizado": AHORA}}
        local["arriendos"] = {"general": {"dueno": "mac", "caduca": AHORA + 100, "version": 2, "tomado": AHORA}}
        remoto = self._estado(mac_t=AHORA - 600)
        remoto["offsets"] = {"general": {"update_id": 7, "actualizado": AHORA - 600}}
        remoto["arriendos"] = {"general": {"dueno": "oracle-a1", "caduca": AHORA + 50, "version": 1, "tomado": AHORA}}
        fusion = R.fusionar_estado(local, remoto)
        self.assertEqual(R.offset_de(fusion, "general"), 10)
        self.assertEqual(fusion["arriendos"]["general"]["dueno"], "mac")
        self.assertEqual(R.medio_vivo(fusion, "mac", AHORA), True)

    def test_solo_el_dueno_del_arriendo_o_el_lider_hace_polling(self):
        e = self._estado()
        self.assertTrue(R.decision_lectura(e, "general", "mac", AHORA)["poll"])
        self.assertFalse(R.decision_lectura(e, "general", "oracle-a1", AHORA)["poll"])
        e["arriendos"]["general"] = {"dueno": "oracle-a1", "caduca": AHORA + 100, "version": 3, "tomado": AHORA}
        self.assertFalse(R.decision_lectura(e, "general", "mac", AHORA)["poll"])
        self.assertTrue(R.decision_lectura(e, "general", "oracle-a1", AHORA)["poll"])
        R.anotar_offset(e, "general", 41, AHORA)
        self.assertEqual(R.decision_lectura(e, "general", "oracle-a1", AHORA)["offset"], 41)

    def test_el_arriendo_caducado_lo_toma_el_lider(self):
        e = self._estado(mac_t=AHORA - R.SILENCIO_MAC_S - 1)
        e["arriendos"]["general"] = {"dueno": "mac", "caduca": AHORA - 1, "version": 1, "tomado": AHORA - 500}
        d = R.decidir_arriendo(e, "general", "oracle-a1", AHORA)
        self.assertTrue(d["soy"] and d["actuar"])


class MotoresYSimulacro(unittest.TestCase):
    def test_ningun_motor_de_relevo_es_de_pago(self):
        for motor in R.MOTORES_GRATIS:
            self.assertTrue(R.es_gratis(motor), motor)
        for caro in ("opus", "claude-sonnet-5-5", "openai/gpt-5", "anthropic/opus"):
            self.assertFalse(R.es_gratis(caro), caro)

    def test_el_a1_usa_gratis_y_si_esta_ocupado_encola(self):
        self.assertEqual(R.plan_turno(["openrouter-:free", "hermes"])["motor"], "openrouter-:free")
        ocupado = R.plan_turno(["hermes"], ocupado=True, cola=3)
        self.assertTrue(ocupado["cola"])
        self.assertIsNone(ocupado["motor"])
        self.assertEqual(ocupado["pendientes"], 3)
        solo_caro = R.plan_turno(["claude-opus-5-5"])
        self.assertTrue(solo_caro["cola"])
        self.assertIsNone(solo_caro["motor"])

    def test_el_simulacro_mac_a1_mac_cabe_en_n_mas_dos_minutos(self):
        s = R.simulacro(AHORA)
        self.assertEqual(s["mac_calla_s"], R.SILENCIO_MAC_S)
        self.assertLessEqual(s["respuesta_max_s"], R.SILENCIO_MAC_S + R.MARGEN_SIMULACRO_S)
        self.assertEqual(s["respuesta_max_s"], R.SILENCIO_MAC_S + 120)
        self.assertTrue(s["a1_toma_todos_los_bots"])
        self.assertTrue(s["mac_recupera_todos_los_bots"])
        self.assertEqual(s["offset_antes_de_volver"], s["offset_despues_de_volver"])
        self.assertEqual(s["canal_del_simulacro"], "General")

    def test_la_unidad_del_a1_documenta_el_unico_camino_de_las_claves(self):
        ruta = os.path.join(os.path.dirname(AQUI), "..", "deploy", "oracle", "nodo", "systemd",
                            "starseed-relevo-medios.service")
        with open(os.path.abspath(ruta), encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("relevo_medios.py bucle --medio oracle-a1", texto)
        self.assertIn("EnvironmentFile=-/etc/starseed/direccion.env", texto)
        self.assertIn("oracle_nodo.py claves", texto)
        self.assertNotIn("TOKEN=", texto)

    def test_el_registro_por_cli_no_imprime_secretos(self):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            self.assertEqual(R.main(["registro"]), 0)
        datos = json.loads(salida.getvalue())
        self.assertEqual(datos["fallos"], [])
        self.assertEqual(datos["resiliencia"], [])
        self.assertNotIn("TOKEN", salida.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)
