#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del carril de alta capacidad en la nube (ola 1022A): puro, sin red y sin reloj."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timedelta, timezone  # noqa: E402

import alta_capacidad_nube_logica as L  # noqa: E402

VENCE = datetime(2026, 11, 5, 1, 59, tzinfo=timezone(timedelta(hours=-6)))


def _credito(restante=250.0, dias=13.0):
    return {"total_usd": 250, "restante_usd": restante, "vence": VENCE.isoformat()}, VENCE.timestamp() - dias * 86400.0


class AltaCapacidadNubeLogica(unittest.TestCase):

    def test_cupo_con_credito_vencido(self):
        cred, _ = _credito()
        se_lanza, motivo, presupuesto = L.cupo_nube(cred, VENCE.timestamp() + 7200.0, 0)
        self.assertIs(se_lanza, False)
        self.assertEqual(presupuesto, 0.0)
        self.assertIn("venció", motivo)

    def test_cupo_sin_vence_legible(self):
        se_lanza, motivo, _ = L.cupo_nube({"restante_usd": 250.0}, 1763769600.0, 0)
        self.assertIs(se_lanza, False)
        self.assertIn("vencimiento", motivo)

    def test_cupo_por_debajo_de_la_reserva(self):
        cred, ahora = _credito(restante=10.0)
        se_lanza, motivo, _ = L.cupo_nube(cred, ahora, 0)
        self.assertIs(se_lanza, False)
        self.assertIn("reserva", motivo)

    def test_cupo_tope_de_sesiones_vivas(self):
        cred, ahora = _credito()
        self.assertIs(L.cupo_nube(cred, ahora, 3)[0], False)
        self.assertTrue(L.cupo_nube(cred, ahora, 3, max_vivas=3)[1].startswith("ya hay 3"))
        se_lanza, _, _ = L.cupo_nube(cred, ahora, 2)
        self.assertIs(se_lanza, True)

    def test_presupuesto_de_hoy_con_13_dias(self):
        cred, ahora = _credito(restante=250.0, dias=13.0)
        se_lanza, _, presupuesto = L.cupo_nube(cred, ahora, 0)
        self.assertIs(se_lanza, True)
        self.assertAlmostEqual(presupuesto, (250.0 - 10.0) / 13.0)

    def test_presupuesto_de_hoy_con_medio_dia_no_pierde_la_reserva(self):
        cred, ahora = _credito(restante=250.0, dias=0.5)
        _, _, presupuesto = L.cupo_nube(cred, ahora, 0)
        self.assertAlmostEqual(presupuesto, 240.0)

    def test_rama_pedida_sigue_el_formato_de_traer_nube(self):
        self.assertEqual(L.rama_pedida("ALT1022A", "20261022"), "nube/cc-20261022/ola/ALT1022A")

    def test_orden_cli_en_ese_orden(self):
        self.assertEqual(L.orden_cli("claude-opus-5-5", "carril 1022A"),
                         ["claude", "--model", "claude-opus-5-5", "--cloud", "carril 1022A"])

    def test_orden_cli_sin_descripcion_rechaza(self):
        with self.assertRaises(ValueError):
            L.orden_cli("claude-opus-5-5", "")
        with self.assertRaises(ValueError):
            L.orden_cli("claude-opus-5-5", "   ")

    def test_modelo_que_empieza_por_guion_rechazado(self):
        with self.assertRaises(ValueError):
            L.orden_cli("-cloud", "algo")

    TAREA = {"id": "ALT1022A", "titulo": "Carril en la nube", "archivos": ["x.ts", "y.py"],
             "prompt": "Haz {ID} con {FECHA} y la llave {PROMPT} sin tocar nada más"}

    PLANTILLA = """Ola: {ID} · {TITULO}
Fecha: {FECHA}
Archivos: {ARCHIVOS}

{PROMPT}"""

    def test_brief_sustituye_los_marcadores(self):
        salida = L.brief(self.PLANTILLA, self.TAREA, "20261022")
        self.assertTrue(salida.startswith("Ola: ALT1022A · Carril en la nube"))
        self.assertIn("Fecha: 20261022", salida)
        self.assertIn("Archivos: x.ts, y.py", salida)

    def test_brief_no_toca_las_llaves_del_prompt(self):
        salida = L.brief(self.PLANTILLA, self.TAREA, "20261022")
        cuerpo = "Haz {ID} con {FECHA} y la llave {PROMPT} sin tocar nada más"
        self.assertIn(cuerpo, salida)
        self.assertTrue(salida.endswith(cuerpo))

    SALIDA_REAL = ("\x1b[>4m Created cloud session: Canal P2P\r\n"
                   "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0")

    def test_sesion_de_salida_real_con_ansi(self):
        dato = L.sesion_de_salida(self.SALIDA_REAL)
        self.assertEqual(dato, {"sesion": "session_01HW1xkHMRPYXUF5bjHiWxyd",
                                "url": "https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd",
                                "titulo": "Canal P2P"})

    def test_sesion_de_salida_sin_view_devuelve_none(self):
        self.assertIsNone(L.sesion_de_salida("\x1b[>4m sin nada útil\r\notra línea"))
        self.assertIsNone(L.sesion_de_salida(""))

    def _registro(self, t=0.0, rama="nube/cc-20261022/ola/zN9", tarea="zN9"):
        return {"sesiones": [{"tarea": tarea, "sesion": "session_01HW", "url": "https://claude.ai/code/session_01HW",
                              "rama_pedida": rama, "modelo": "claude-opus-5-5", "t": t}]}

    PROGRESO = {"zN9": {"estado": "reasignada", "medio": "claude-nube"},
                "cero": {"estado": "pendiente"},
                "otro": {"estado": "reasignada", "medio": "oracle"}}

    def _ahora(self, horas):
        return datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc).timestamp() + horas * 3600.0

    def test_seg_traer(self):
        """La rama ya está remota e integrada: tráela con traer_nube tras pasarla a pendiente."""
        res = L.seguir(self._registro(), {"nube/cc-20261022/ola/zN9"}, self.PROGRESO, self._ahora(0))
        self.assertEqual(res["zN9"], "traer")

    def test_seg_devolver_tras_la_gracia(self):
        res = L.seguir(self._registro(t=self._ahora(0) - 9 * 3600.0), set(), self.PROGRESO,
                       self._ahora(0), gracia_h=8.0)
        self.assertEqual(res["zN9"], "devolver")

    def test_seg_gracia_exacta_aun_espera(self):
        res = L.seguir(self._registro(t=self._ahora(0) - 8 * 3600.0), set(), self.PROGRESO, self._ahora(0))
        self.assertEqual(res["zN9"], "esperar")

    def test_seg_esperar_con_entrada_reciente(self):
        res = L.seguir(self._registro(t=self._ahora(0) - 30 * 60.0), set(), self.PROGRESO, self._ahora(0))
        self.assertEqual(res["zN9"], "esperar")

    def test_seg_olvidar_la_tarea_que_dejo_de_estar_prestada(self):
        res = L.seguir(self._registro(t=self._ahora(0) - 20 * 3600.0, rama="", tarea="zero"),
                       set(), self.PROGRESO, self._ahora(0))
        self.assertEqual(res["zero"], "olvidar")

    def test_seg_con_fecha_ilegible_no_se_juzga_devolver(self):
        reg = self._registro()
        reg["sesiones"][0]["t"] = "ayer sin formato"
        self.assertEqual(L.seguir(reg, set(), self.PROGRESO, self._ahora(0))["zN9"], "esperar")

    def test_sesiones_vivas_por_medio(self):
        reg = {**self._registro(), "sesiones": [
            {"tarea": "zN9", "t": 0.0, "rama_pedida": ""},
            {"tarea": "cero", "t": 0.0, "rama_pedida": ""},
            {"tarea": "otro", "t": 0.0, "rama_pedida": ""},
            {"tarea": "no_esta", "t": 0.0, "rama_pedida": ""}]}
        vivas = L.sesiones_vivas(reg, self.PROGRESO)
        self.assertEqual(vivas, 1)
        self.assertEqual(L.sesiones_vivas({}, self.PROGRESO), 0)


if __name__ == "__main__":
    unittest.main()
