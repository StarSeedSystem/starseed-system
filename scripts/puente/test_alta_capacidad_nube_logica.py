# -*- coding: utf-8 -*-
"""Pruebas de alta_capacidad_nube_logica.py (Ola 1022C, ALT1022A): todo puro, sin red ni reloj.

Con unittest en vez de pytest (2026-10-23): el corredor de la puerta es
`unittest discover` y aquí `pytest` no está instalado; [RTMGP1011] las dos pruebas
de este carril quedaban en ERROR antes de correr ni una aserción."""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import alta_capacidad_nube_logica as L  # noqa: E402

AHORA = datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc).timestamp()
DIA = 86400.0


def credito(restante=250, vence="2026-11-04T12:00:00+00:00"):
    return {"total_usd": 250, "restante_usd": restante, "vence": vence}


PRESTADA = {"estado": "reasignada", "medio": "claude-nube"}


class CupoNube(unittest.TestCase):
    def test_cupo_credito_vencido(self):
        ok, motivo, hoy = L.cupo_nube(credito(vence="2026-10-21T00:00:00-06:00"), AHORA, 0)
        self.assertFalse(ok)
        self.assertIn("venció", motivo)
        self.assertEqual(hoy, 0)

    def test_cupo_sin_vence_no_lanza(self):
        ok, motivo, _ = L.cupo_nube({"restante_usd": 200}, AHORA, 0)
        self.assertFalse(ok)
        self.assertIn("vence", motivo)

    def test_cupo_por_debajo_de_la_reserva(self):
        ok, motivo, _ = L.cupo_nube(credito(restante=10), AHORA, 0)
        self.assertFalse(ok)
        self.assertIn("reserva", motivo)

    def test_cupo_tope_de_vivas(self):
        ok, motivo, hoy = L.cupo_nube(credito(), AHORA, 3, max_vivas=3)
        self.assertFalse(ok)
        self.assertIn("vivas", motivo)
        self.assertGreater(hoy, 0)

    def test_presupuesto_con_13_dias(self):
        ok, _, hoy = L.cupo_nube(credito(restante=140), AHORA, 0)
        self.assertTrue(ok)
        self.assertAlmostEqual(hoy, (140 - 10) / 13, delta=0.01)

    def test_presupuesto_con_medio_dia_cuenta_uno(self):
        vence = datetime.fromtimestamp(AHORA + DIA / 2, timezone.utc).isoformat()
        ok, _, hoy = L.cupo_nube(credito(restante=50, vence=vence), AHORA, 0)
        self.assertTrue(ok)
        self.assertAlmostEqual(hoy, 40.0)


class RamaOrdenYBrief(unittest.TestCase):
    def test_rama_pedida(self):
        self.assertEqual(L.rama_pedida("ALT1022A", "20261022"), "nube/cc-20261022/ola/ALT1022A")

    def test_orden_cli_en_su_orden(self):
        self.assertEqual(L.orden_cli("sonnet", "Haz X"), ["claude", "--model", "sonnet", "--cloud", "Haz X"])

    def test_orden_cli_rechaza_vacia_y_modelo_opcion(self):
        with self.assertRaises(ValueError):
            L.orden_cli("sonnet", "  ")
        with self.assertRaises(ValueError):
            L.orden_cli("--cloud", "Haz X")

    def test_brief_no_toca_llaves_del_prompt(self):
        plantilla = "{ID} · {TITULO} · {FECHA}\n{ARCHIVOS}\n{PROMPT}"
        tarea = {"id": "T1", "titulo": "Título", "archivos": ["a.py", "b.py"],
                 "prompt": "usa {ID} y {\"x\": 1} literal"}
        self.assertEqual(L.brief(plantilla, tarea, "20261022"),
                         "T1 · Título · 20261022\na.py, b.py\nusa {ID} y {\"x\": 1} literal")


class SesionDeSalida(unittest.TestCase):
    def test_sesion_de_salida_real_con_ansi(self):
        texto = ("\x1b[>4m Created cloud session: Canal P2P\r\n"
                 "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0")
        self.assertEqual(L.sesion_de_salida(texto), {
            "sesion": "session_01HW1xkHMRPYXUF5bjHiWxyd",
            "url": "https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd",
            "titulo": "Canal P2P"})

    def test_sesion_de_salida_sin_view(self):
        self.assertIsNone(L.sesion_de_salida("Error: --cloud requires an interactive terminal"))


def _registro(*tareas, t=AHORA - 3600):
    return {"sesiones": [{"tarea": x, "sesion": "session_" + x, "url": "u/" + x,
                          "rama_pedida": L.rama_pedida(x, "20261022"), "t": t} for x in tareas]}


class SeguirYVivas(unittest.TestCase):
    def test_seguir_trae_con_rama(self):
        reg = _registro("A")
        self.assertEqual(L.seguir(reg, {L.rama_pedida("A", "20261022")}, {"A": PRESTADA}, AHORA),
                         {"A": "traer"})

    def test_seguir_espera_sin_rama_dentro_de_la_gracia(self):
        self.assertEqual(L.seguir(_registro("A"), set(), {"A": PRESTADA}, AHORA), {"A": "esperar"})

    def test_seguir_devuelve_pasada_la_gracia(self):
        reg = _registro("A", t=AHORA - 9 * 3600)
        self.assertEqual(L.seguir(reg, set(), {"A": PRESTADA}, AHORA, gracia_h=8), {"A": "devolver"})

    def test_seguir_olvida_lo_que_ya_no_esta_prestada(self):
        reg = _registro("A")
        self.assertEqual(L.seguir(reg, {L.rama_pedida("A", "20261022")}, {"A": {"estado": "commit"}}, AHORA),
                         {"A": "olvidar"})

    def test_seguir_ignora_las_ya_cerradas(self):
        reg = _registro("A")
        reg["sesiones"][0]["final"] = "traida"
        self.assertEqual(L.seguir(reg, set(), {}, AHORA), {})

    def test_sesiones_vivas(self):
        prog = {"A": PRESTADA, "B": {"estado": "reasignada", "medio": "a1"}}
        self.assertEqual(L.sesiones_vivas(_registro("A", "B", "C"), prog), 1)


class ModeloPara(unittest.TestCase):
    def test_modelo_para_alta_capacidad(self):
        self.assertEqual(L.modelo_para({"id": "X", "alta_capacidad": True}), "claude-opus-5-5")

    def test_modelo_para_tres_archivos(self):
        self.assertEqual(L.modelo_para({"id": "X", "archivos": ["a", "b", "c"]}), "claude-opus-5-5")

    def test_modelo_para_ya_fallo(self):
        self.assertEqual(L.modelo_para({"id": "X", "archivos": ["a"]}, {"intentos_auto": 2}), "claude-opus-5-5")
        self.assertEqual(L.modelo_para({"id": "X", "modelos_fallidos": ["nim/kimi"]}), "claude-opus-5-5")

    def test_modelo_para_sencilla_va_a_sonnet(self):
        self.assertEqual(L.modelo_para({"id": "X", "archivos": ["a", "b"]}), "sonnet")
        self.assertEqual(L.coste_estimado("sonnet"), 1.0)
        self.assertEqual(L.coste_estimado("claude-opus-5-5"), 3.0)


class CandidatasYElegirAuto(unittest.TestCase):
    def test_candidatas_filtra_y_ordena(self):
        colas = [("cola-2.json", [
            {"id": "VIEJA", "archivos": ["a"]},
            {"id": "DEP", "archivos": ["a"], "depende": ["NO"]},
            {"id": "PRIV", "archivos": ["a"], "privada": True},
            {"id": "FALLO", "archivos": ["a"], "intentos_auto": 3},
            {"id": "GRANDE", "archivos": ["a", "b", "c"]},
            {"id": "ALTA", "archivos": ["a"], "alta_capacidad": True, "depende": ["SI"]},
            {"id": "HECHA", "archivos": ["a"]},
            {"id": "REG", "archivos": ["a"]},
        ]), ("cola-1.json", [{"id": "VIEJA", "archivos": ["x", "y", "z"]}])]
        progreso = {"SI": {"estado": "integrada"}, "NO": {"estado": "pendiente"}, "HECHA": {"estado": "commit"}}
        ids = [t["id"] for t, _ in L.candidatas(colas, progreso, _registro("REG"))]
        self.assertEqual(ids, ["ALTA", "GRANDE", "FALLO", "VIEJA"])

    def test_elegir_auto_respeta_huecos_y_presupuesto(self):
        cands = [({"id": "A", "alta_capacidad": True}, "c"), ({"id": "B"}, "c"), ({"id": "C"}, "c")]
        elegidas = L.elegir_auto(cands, vivas=1, max_vivas=4, presupuesto_hoy=4.5, gastado=0)
        self.assertEqual([(t["id"], m) for t, _, m, _ in elegidas],
                         [("A", "claude-opus-5-5"), ("B", "sonnet")])
        self.assertEqual(L.elegir_auto(cands, vivas=4, max_vivas=4, presupuesto_hoy=99, gastado=0), [])
        self.assertEqual(len(L.elegir_auto(cands, vivas=0, max_vivas=4, presupuesto_hoy=99, gastado=0,
                                           maximo=1)), 1)


if __name__ == "__main__":
    unittest.main()
