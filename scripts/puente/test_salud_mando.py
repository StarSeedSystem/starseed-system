# -*- coding: utf-8 -*-
"""Tests de salud_mando: un caso ok y uno roto por medidor."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from salud_mando import medidores, resumen

AHORA = 1_000_000.0
SERVS_OK = [("com.starseed.mando", "123", "ok")]
T_SANA = lambda: {  # noqa: E731 — fábrica compacta de estado sano
    "en_curso": 1,
    "pendientes": 1,
    "pendientes_detalle": [{"ola": "Ola 316", "id": "q7Z"}],
    "asuntos_main": [],
}
LAT_OK = {"orquestador": {"ts": AHORA - 10}}
PROG_OK = {"esperando_aprobacion": []}


def por_nombre(lista):
    return {m["medidor"]: m for m in lista}


class TestSaludMando(unittest.TestCase):
    def test_todo_ok(self):
        ms = medidores(T_SANA(), LAT_OK, PROG_OK, SERVS_OK, 20.0, AHORA)
        self.assertTrue(all(m["ok"] for m in ms))
        self.assertEqual(resumen(ms), "SALUD · 6/6 ok")

    def test_en_curso_deshonesto(self):
        e = T_SANA()
        e["en_curso"] = 3
        m = por_nombre(medidores(e, LAT_OK, PROG_OK, SERVS_OK, 20.0, AHORA))
        self.assertFalse(m["en_curso_honesto"]["ok"])
        self.assertEqual(m["en_curso_honesto"]["esperado"], 1)

    def test_pendiente_ya_integrada(self):
        e = T_SANA()
        e["asuntos_main"] = ["Ola 316 · q7Z: salud del puente"]
        ms = medidores(e, {}, PROG_OK, SERVS_OK, 20.0, AHORA)
        m = por_nombre(ms)
        self.assertFalse(m["pendientes_reales"]["ok"])
        self.assertEqual(m["pendientes_reales"]["esperado"], 0)
        # Sin pendientes reales, orquestador caído no es fallo
        self.assertTrue(m["orquestador"]["ok"])

    def test_pendiente_sin_ola_usa_id(self):
        e = T_SANA()
        e["pendientes_detalle"] = [{"id": "q7Z"}]
        e["asuntos_main"] = ["q7Z añade tal cosa"]
        m = por_nombre(medidores(e, {}, PROG_OK, SERVS_OK, 20.0, AHORA))
        self.assertIn("pendientes_reales", m)  # el id solo no integra; sigue real
        self.assertEqual(m["pendientes_reales"]["esperado"], 1)

    def test_orquestador_caido_con_pendientes(self):
        m = por_nombre(medidores(T_SANA(), {}, PROG_OK, SERVS_OK, 20.0, AHORA))
        self.assertFalse(m["orquestador"]["ok"])
        self.assertEqual(m["orquestador"]["remedio"], "vigilante debe relanzar")

    def test_servicio_caido(self):
        servs = SERVS_OK + [("com.starseed.relevo", "-", "caido")]
        m = por_nombre(medidores(T_SANA(), LAT_OK, PROG_OK, servs, 20.0, AHORA))
        self.assertFalse(m["servicios_launchd"]["ok"])
        self.assertIn("instalar-servicios.sh", m["servicios_launchd"]["remedio"])

    def test_disco_bajo(self):
        m = por_nombre(medidores(T_SANA(), LAT_OK, PROG_OK, SERVS_OK, 3.0, AHORA))
        self.assertFalse(m["disco"]["ok"])

    def test_aprobacion_quieta(self):
        prog = {"esperando_aprobacion": [{"id": "q7Z", "desde": AHORA - 3600}]}
        m = por_nombre(medidores(T_SANA(), LAT_OK, prog, SERVS_OK, 20.0, AHORA))
        self.assertFalse(m["esperando_aprobacion_quietas"]["ok"])

    def test_resumen_con_fallas(self):
        ms = medidores(T_SANA(), LAT_OK, PROG_OK, SERVS_OK, 3.0, AHORA)
        self.assertEqual(resumen(ms), "SALUD · 5/6 ok · falla: disco (3 GB)")


if __name__ == "__main__":
    unittest.main()
