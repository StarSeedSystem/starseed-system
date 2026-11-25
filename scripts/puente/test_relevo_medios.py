# -*- coding: utf-8 -*-
"""Pruebas del relevo entre medios (RES1121A · DIR1121).

Herméticas: no tocan la red, SSH, Telegram ni las claves. La lógica pura entra con
diccionarios y tiempos fijos; la réplica se comprueba contra un directorio temporal.
"""
import copy
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relevo_medios as R  # noqa: E402

AHORA = 1_800_000_000.0
CFG = {
    "principal": {
        "nombre": "Principal",
        "telegram_bot": "@starseed_neurocortex_bot",
        "hermes_sesion": "sesion-privada",
    },
    "general": {
        "nombre": "General",
        "telegram_bot": "@starseed_puente_bot",
        "token": "NO-DEBE-SALIR",
    },
    "audiovisual": {
        "nombre": "Audiovisual y diseño",
        "telegram_bot": "@StarSeed_Design_bot",
    },
}


class Registro(unittest.TestCase):
    def test_los_tres_canales_se_llaman_igual_en_todos_los_medios(self):
        self.assertEqual(
            [R.nombre_canal(c, CFG) for c in R.CANALES],
            ["Principal", "General", "Audiovisual y diseño"],
        )
        self.assertEqual(
            [R.nombre_canal(c, {}) for c in R.CANALES],
            ["Principal", "General", "Audiovisual y diseño"],
        )

    def test_el_registro_no_deja_dependencias_unicas(self):
        self.assertEqual(R.problemas_registro(), [])

    def test_medios_publicos_sin_claves_y_efimeros_sin_secretos(self):
        for medio in ("maggabox", "github-actions", "cloudroom"):
            datos = R.MEDIOS[medio]
            self.assertTrue(datos["publico"], medio)
            self.assertFalse(datos["claves"], medio)
        self.assertTrue(R.MEDIOS["github-actions"]["efimero"])
        self.assertTrue(R.MEDIOS["cloudroom"]["efimero"])

    def test_cada_canal_tiene_dos_medios_que_lo_atienden(self):
        for canal in R.CANALES:
            capaces = [m for m, d in R.MEDIOS.items() if canal in d["canales"]]
            self.assertGreaterEqual(len(capaces), 2, canal)

    def test_detecta_claves_en_un_medio_publico_y_un_canal_huerfano(self):
        roto = copy.deepcopy(R.MEDIOS)
        roto["maggabox"]["claves"] = True
        roto["mac"]["canales"] = ()
        problemas = R.problemas_registro(roto)
        self.assertTrue(any("maggabox" in p and "claves" in p for p in problemas), problemas)
        self.assertTrue(any("principal" in p for p in problemas), problemas)


class SinSecretos(unittest.TestCase):
    def test_publico_solo_lleva_nombre_y_bot(self):
        pub = R.registro_publico(CFG)
        texto = json.dumps(pub)
        self.assertNotIn("NO-DEBE-SALIR", texto)
        self.assertNotIn("hermes_sesion", texto)
        self.assertEqual(pub["general"]["nombre"], "General")
        self.assertEqual(pub["general"]["telegram_bot"], "@starseed_puente_bot")

    def test_plan_replica_al_a1_y_al_maggabox_y_el_maggabox_sin_secretos(self):
        plan = R.plan_replica()
        destinos = {p["destino"]: p for p in plan}
        self.assertIn("a1", destinos)
        self.assertIn("maggabox", destinos)
        self.assertFalse(destinos["a1"]["sin_secretos"])
        self.assertTrue(destinos["maggabox"]["sin_secretos"])
        self.assertNotIn("github-actions", destinos)


class LatidoYArriendo(unittest.TestCase):
    def test_latido_fresco_y_viejo(self):
        self.assertTrue(R.medio_vivo({"mac": AHORA - 60}, "mac", AHORA, minutos=5))
        self.assertFalse(R.medio_vivo({"mac": AHORA - 6 * 60}, "mac", AHORA, minutos=5))
        self.assertFalse(R.medio_vivo({}, "mac", AHORA, minutos=5))

    def test_mac_callado_el_a1_adquiere_sin_duplicar(self):
        d = R.decidir_arriendo({"mac": AHORA - 10 * 60}, {}, AHORA, medio_local="a1", minutos=5)
        for canal in R.CANALES:
            self.assertEqual(d[canal]["accion"], "adquirir", canal)
            self.assertEqual(d[canal]["dueno"], "a1")

    def test_con_arriendo_vigente_otro_medio_espera(self):
        arriendos = {c: {"dueno": "a1", "vence": AHORA + 60, "offset": 7} for c in R.CANALES}
        d = R.decidir_arriendo({"mac": AHORA - 10 * 60}, arriendos, AHORA, medio_local="mac", minutos=5)
        for canal in R.CANALES:
            self.assertEqual(d[canal]["accion"], "esperar")
            self.assertEqual(d[canal]["offset"], 7)

    def test_el_mac_vuelve_y_el_a1_suelta_con_el_offset(self):
        arriendos = {c: {"dueno": "a1", "vence": AHORA + 60, "offset": 42} for c in R.CANALES}
        d = R.decidir_arriendo({"mac": AHORA, "a1": AHORA}, arriendos, AHORA, medio_local="a1", minutos=5)
        for canal in ("principal", "general"):
            self.assertEqual(d[canal]["accion"], "soltar")
            self.assertEqual(d[canal]["offset"], 42)
        nuevo = R.aplicar_decisiones(arriendos, d, AHORA)
        self.assertEqual(nuevo["principal"]["dueno"], "mac")
        self.assertEqual(nuevo["principal"]["vence"], 0.0)
        self.assertEqual(nuevo["principal"]["offset"], 42)

    def test_el_mac_recupera_con_el_mismo_offset_sin_perder_mensajes(self):
        arriendos = {c: {"dueno": "a1", "vence": AHORA - 1, "offset": 42} for c in R.CANALES}
        d = R.decidir_arriendo({"mac": AHORA, "a1": AHORA}, arriendos, AHORA, medio_local="mac", minutos=5)
        for canal in ("principal", "general"):
            self.assertEqual(d[canal]["accion"], "adquirir")
            self.assertEqual(d[canal]["offset"], 42)

    def test_solo_el_dueno_con_arriendo_vigente_hace_polling(self):
        arriendos = {"general": {"dueno": "a1", "vence": AHORA + 60, "offset": 9}}
        self.assertTrue(R.puede_hacer_polling("general", arriendos, "a1", AHORA))
        self.assertFalse(R.puede_hacer_polling("general", arriendos, "mac", AHORA))
        self.assertFalse(R.puede_hacer_polling("general", arriendos, "a1", AHORA + 61))

    def test_simulacro_responde_dentro_de_n_mas_dos(self):
        n = 5
        sim = R.simular_relevo({"mac": AHORA - (n + 1) * 60}, AHORA, minutos=n)
        self.assertTrue(sim["ok"])
        self.assertLessEqual(sim["responde_en_s"], (n + 2) * 60)
        self.assertEqual(sim["relevado_en_s"], 0)


class ReplicaEnDisco(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="relevo-medios-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.olas = os.path.join(self.tmp, "olas")
        os.makedirs(self.olas)
        with open(os.path.join(self.olas, "progreso.json"), "w") as f:
            f.write('{"ola": "prueba"}')
        self.dir_a1 = os.path.join(self.tmp, "a1")
        self.dir_magga = os.path.join(self.tmp, "maggabox")
        self.canales = os.path.join(self.tmp, "canales.json")
        with open(self.canales, "w") as f:
            json.dump(CFG, f)
        self.dir_estado = os.path.join(self.tmp, "estado")
        R.latir("mac", AHORA, self.dir_estado)

    def test_en_seco_no_escribe_nada(self):
        r = R.replicar(
            destinos={"a1": self.dir_a1, "maggabox": self.dir_magga},
            canales=self.canales, olas_dir=self.olas, dir_estado=self.dir_estado,
            ahora=AHORA, seco=True,
        )
        self.assertTrue(all(x["seco"] for x in r["resultados"]), r)
        self.assertFalse(os.path.exists(self.dir_a1))

    def test_replica_las_olas_y_el_maggabox_sin_secretos(self):
        r = R.replicar(
            destinos={"a1": self.dir_a1, "maggabox": self.dir_magga},
            canales=self.canales,
            olas_dir=self.olas,
            dir_estado=self.dir_estado,
            ahora=AHORA,
        )
        self.assertTrue(all(x["ok"] for x in r["resultados"]), r)
        for carpeta in (self.dir_a1, self.dir_magga):
            with open(os.path.join(carpeta, "canales.json"), encoding="utf-8") as f:
                texto = f.read()
            self.assertNotIn("NO-DEBE-SALIR", texto)
            self.assertNotIn("hermes_sesion", texto)
            self.assertIn("@starseed_puente_bot", texto)
            self.assertTrue(os.path.isfile(os.path.join(carpeta, "olas", "progreso.json")))
            self.assertTrue(os.path.isfile(os.path.join(carpeta, "latido-mac.json")))


if __name__ == "__main__":
    unittest.main()
