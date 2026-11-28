# -*- coding: utf-8 -*-
"""Pruebas de `cloudroom_config.py` (CAP1119): configuración y activación de Cloudroom.

Nunca ejecuta `room-cli` ni toca la nube: todo el I/O entra por `run`/`leer` falsos.
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cloudroom_config as CC

SETUP = '{"apiKey": "{env:NVIDIA_API_KEY}"}\n"apiKey": "$XKIRO_API_KEY"\n'
PI = {"claves": {"nvidia": "NVIDIA_API_KEY", "gemini": "GEMINI_API_KEY"}}


def _proceso(stdout="{}", returncode=0, stderr=""):
    return type("P", (), {"returncode": returncode, "stdout": stdout, "stderr": stderr})()


class Variables(unittest.TestCase):
    def test_deduce_nombres_del_setup_y_de_pi_sin_repetir(self):
        self.assertEqual(
            CC.variables_necesarias(SETUP, PI),
            ["NVIDIA_API_KEY", "XKIRO_API_KEY", "GEMINI_API_KEY"],
        )

    def test_no_cuela_variables_que_no_son_claves(self):
        self.assertEqual(CC.variables_necesarias('mkdir "$HOME/x"', {}), [])


class ValidarYGuardar(unittest.TestCase):
    def test_defaults_validos(self):
        ok, errores = CC.validar(CC.DEFAULTS)
        self.assertTrue(ok, errores)

    def test_rechaza_tipos_y_rangos(self):
        ok, errs = CC.validar(
            {"activo": "sí", "cupo_nube": 0, "ciclo_dias": -1,
             "aplicar_setup": 1, "cli": 7}
        )
        self.assertFalse(ok)
        self.assertGreaterEqual(len(errs), 5)

    def test_fusionar_ignora_desconocidas_y_conserva_el_resto(self):
        cfg, avisos = CC.fusionar(
            CC.DEFAULTS, {"cupo_nube": 50, "no_existe": 1, "ciclo_dias": "x"}
        )
        self.assertEqual(cfg["cupo_nube"], 50)
        self.assertEqual(cfg["ciclo_dias"], CC.DEFAULTS["ciclo_dias"])
        self.assertNotIn("no_existe", cfg)
        self.assertTrue(any("ciclo_dias" in a for a in avisos))

    def test_guardar_y_cargar_en_temporal(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "cloudroom.json")
            CC.guardar({"activo": False, "cupo_nube": 40}, ruta=ruta)
            cfg, avisos = CC.cargar(ruta)
            self.assertEqual(avisos, [])
            self.assertFalse(cfg["activo"])
            self.assertEqual(cfg["cupo_nube"], 40)


class Interpretar(unittest.TestCase):
    def test_sin_cli_no_esta_listo(self):
        d = CC.interpretar(CC.DEFAULTS, "", None, None, None, [])
        self.assertFalse(d["listo"])
        self.assertIn("room-cli", d["siguiente_paso"])

    def test_sin_sesion_pide_iniciar_sesion(self):
        d = CC.interpretar(CC.DEFAULTS, "room-cli", {"authenticated": False}, None, None, [])
        self.assertFalse(d["listo"])
        self.assertIn("sesión", d["siguiente_paso"])

    def test_ready_sin_cuenta_no_es_sesion(self):
        d = CC.interpretar(CC.DEFAULTS, "room-cli", {"ready": True}, None, None, [])
        self.assertFalse(d["sesion"])
        self.assertFalse(d["listo"])

    def test_con_sesion_y_claves_queda_listo(self):
        d = CC.interpretar(
            CC.DEFAULTS, "room-cli",
            {"authenticated": True, "account": {"id": "x"}},
            {"variables": [{"name": "NVIDIA_API_KEY"}]},
            {"count": 2}, ["NVIDIA_API_KEY"],
        )
        self.assertTrue(d["listo"], d)
        self.assertEqual(d["hilos"], 2)

    def test_sesion_sin_claves_dice_cuales_faltan(self):
        d = CC.interpretar(
            CC.DEFAULTS, "room-cli", {"ready": True, "account": {"id": "x"}},
            {"variables": [{"name": "NVIDIA_API_KEY"}]}, {"count": 0},
            ["NVIDIA_API_KEY", "GEMINI_API_KEY"],
        )
        self.assertFalse(d["listo"])
        self.assertEqual(d["variables_faltantes"], ["GEMINI_API_KEY"])
        self.assertIn("GEMINI_API_KEY", d["siguiente_paso"])

    def test_si_no_se_puede_leer_la_lista_avisa_pero_no_bloquea(self):
        d = CC.interpretar(
            CC.DEFAULTS, "room-cli", {"ready": True, "account": {"id": "x"}}, None, {"count": 1},
            ["NVIDIA_API_KEY"],
        )
        self.assertTrue(d["listo"])
        self.assertTrue(any("claves" in a for a in d["avisos"]))

    def test_respuesta_invalida_no_se_toma_por_conectada(self):
        d = CC.interpretar(CC.DEFAULTS, "room-cli", "no-json", None, None, [])
        self.assertFalse(d["listo"])
        self.assertIn("inválida", d["avisos"][0])

    def test_hilos_ilegibles_cuentan_cero(self):
        d = CC.interpretar(
            CC.DEFAULTS, "room-cli", {"ready": True, "account": {"id": "x"}},
            {"variables": []},
            {"count": "muchos"}, [],
        )
        self.assertTrue(d["listo"])
        self.assertEqual(d["hilos"], 0)

    def test_desactivado_no_queda_listo(self):
        cfg = dict(CC.DEFAULTS, activo=False)
        d = CC.interpretar(
            cfg, "room-cli", {"account": {"id": "x"}},
            {"variables": [{"name": "NVIDIA_API_KEY"}]}, {"count": 1},
            ["NVIDIA_API_KEY"],
        )
        self.assertFalse(d["listo"])
        self.assertIn("desactivado", d["detalle"])
        self.assertIn("activo", d["siguiente_paso"])


def _run_falso(visto, nube='{"authenticated": true, "account": {"id": "x"}}',
               nombres='{"variables": [{"name": "NVIDIA_API_KEY"}]}'):
    def run(orden, **kw):
        visto.append((orden, kw.get("input")))
        if orden[1:3] == ["cloud", "status"]:
            return _proceso(nube)
        if orden[1:3] == ["cloud", "env"]:
            return _proceso(nombres)
        if orden[1:3] == ["thread", "count"]:
            return _proceso('{"count": 2}')
        if orden[1:3] == ["cloud", "setup"]:
            return _proceso("", 0)
        return _proceso()
    return run


class EstadoYActivar(unittest.TestCase):
    def test_estado_lee_la_nube_y_no_aplica_el_setup(self):
        visto = []
        d = CC.estado(
            cfg=dict(CC.DEFAULTS, cli="/opt/room-cli"),
            run=_run_falso(visto), leer=lambda r, d="": "",
            existe=lambda p: False, env={},
        )
        self.assertTrue(d["listo"], d)
        self.assertEqual(d["hilos"], 2)
        self.assertFalse(any(o[1:3] == ["cloud", "setup"] for o, _ in visto))

    def test_activar_manda_el_setup_por_la_entrada_estandar(self):
        visto = []
        cfg = dict(CC.DEFAULTS, cli="/opt/room-cli", aplicar_setup=True)
        d = CC.activar(
            cfg=cfg, run=_run_falso(visto),
            leer=lambda r, d="": "#!/bin/sh\necho ok\n",
            existe=lambda p: True, env={},
        )
        self.assertTrue(d["listo"], d)
        setup = [entrada for orden, entrada in visto if orden[1:3] == ["cloud", "setup"]]
        self.assertEqual(setup, ["#!/bin/sh\necho ok\n"])

    def test_activar_desactivado_no_aplica_el_setup(self):
        visto = []
        cfg = dict(CC.DEFAULTS, cli="/opt/room-cli", activo=False, aplicar_setup=True)
        d = CC.activar(
            cfg=cfg, run=_run_falso(visto),
            leer=lambda r, d="": "#!/bin/sh\necho ok\n",
            existe=lambda p: True, env={},
        )
        self.assertFalse(d["listo"])
        self.assertFalse(any(o[1:3] == ["cloud", "setup"] for o, _ in visto))

    def test_activar_sin_cli_no_ejecuta_nada(self):
        visto = []
        d = CC.activar(
            cfg=dict(CC.DEFAULTS, cli=""), run=lambda *a, **k: visto.append(a) or _proceso(),
            leer=lambda r, d="": "", existe=lambda p: False,
            buscar=lambda n: None, env={},
        )
        self.assertFalse(d["listo"])
        self.assertEqual(visto, [])


if __name__ == "__main__":
    unittest.main()
