#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de sanador_recetas: OAuth, Higgsfield, FreeLLMAPI/NIM y Telegram, sin red."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sanador_recetas as R

AHORA = datetime(2026, 11, 14, 12, 0)


def deps(**cambios):
    base = {
        "ejecutar": lambda argv, timeout=30: (0, "ok"),
        "getme": lambda: {"ok": True},
        "renovar_google": lambda alias: {"ok": True},
        "leer_ficha": lambda alias: {"emitido": (AHORA - timedelta(days=1)).isoformat()},
        "avisar": lambda texto: {"ok": True},
        "marcar_proveedor": lambda n, m, a: {"ok": True, "reiniciar": True},
        "reiniciar_servicio": lambda s: {"ok": True},
        "ping_proveedor": lambda n: {"ok": True},
        "ahora": lambda: AHORA,
    }
    base.update(cambios)
    return base


class FalsoSanador:
    def __init__(self):
        self.sesiones = {}

    def registrar(self, nombre, comprobacion, recetas):
        self.sesiones[nombre] = (comprobacion, recetas)


class SanadorRecetasTest(unittest.TestCase):
    def test_cargar_en_registra_las_seis_sesiones(self):
        """El módulo registra el resto del registro de §3.2."""
        s = FalsoSanador()
        R.cargar_en(s, deps())
        self.assertEqual(set(s.sesiones), set(R.SESIONES))

    def test_cargar_en_sirve_para_sanador_sesiones(self):
        """sanador_sesiones puede cargar este módulo sin cableado extra."""
        import sanador_sesiones as SS

        with tempfile.TemporaryDirectory() as t:
            s = SS.SanadorSesiones(log_file=Path(t) / "l.jsonl",
                                   estado_file=Path(t) / "estado.json")
            R.cargar_en(s, deps())
            self.assertEqual(set(s.listar()), set(R.SESIONES))

    def test_google_oauth_renueva_con_refresh_token(self):
        llamadas = []
        reg = R.registro(deps(renovar_google=lambda alias: llamadas.append(alias) or {"ok": True}))
        r = reg["google-oauth-alex"]["recetas"][0]()
        self.assertTrue(r["ok"])
        self.assertEqual(llamadas, ["alex"])

    def test_google_oauth_comprueba_estado(self):
        reg = R.registro(deps(ejecutar=lambda argv, timeout=30: (0, "alex alex@x vivo\n")))
        self.assertTrue(reg["google-oauth-alex"]["comprobacion"]()["ok"])

    def test_aviso_de_publicar_tres_dias_antes(self):
        avisos = []
        ficha = {"emitido": (AHORA - timedelta(days=4)).isoformat()}
        reg = R.registro(deps(leer_ficha=lambda alias: ficha,
                              avisar=lambda t: avisos.append(t) or {"ok": True}))
        self.assertTrue(reg["google-oauth-alex-docs"]["recetas"][0]()["ok"])
        texto = avisos[0]
        for trozo in ("Google Cloud", "Publicar app", "/privacidad",
                      "alta-cuentas-google", "Maggasukha", "SDP1111U"):
            self.assertIn(trozo, texto)
        self.assertNotIn("claude", texto.lower())

    def test_refresh_fallido_avisa_los_pasos_de_publicar(self):
        avisos = []
        reg = R.registro(deps(renovar_google=lambda alias: {"ok": False, "motivo": "refresh caducado"},
                              avisar=lambda t: avisos.append(t) or {"ok": True}))
        self.assertFalse(reg["google-oauth-alex"]["recetas"][0]()["ok"])
        self.assertIn("Publicar app", avisos[0])

    def test_sin_aviso_antes_de_tres_dias(self):
        avisos = []
        ficha = {"emitido": (AHORA - timedelta(days=2)).isoformat()}
        reg = R.registro(deps(leer_ficha=lambda alias: ficha,
                              avisar=lambda t: avisos.append(t) or {"ok": True}))
        reg["google-oauth-alex"]["recetas"][0]()
        self.assertEqual(avisos, [])

    def test_dias_para_caducar(self):
        ficha = {"emitido": (AHORA - timedelta(days=4)).isoformat()}
        self.assertEqual(R.dias_para_caducar(ficha, AHORA), 3)
        self.assertIsNone(R.dias_para_caducar({}, AHORA))

    def test_higgsfield_caido_avisa_el_paso_de_la_mac(self):
        avisos, ordenes = [], []
        reg = R.registro(deps(ejecutar=lambda argv, timeout=30: (ordenes.append(argv) or (1, "no session")),
                              avisar=lambda t: avisos.append(t) or {"ok": True}))
        r = reg["higgsfield"]["comprobacion"]()
        self.assertFalse(r["ok"])
        self.assertIn("higgsfield auth login", r["motivo"])
        aviso = reg["higgsfield"]["recetas"][0]()
        self.assertTrue(aviso["solo_aviso"])
        self.assertIn("higgsfield auth login", avisos[0])
        self.assertNotIn("auth login", " ".join(" ".join(o) for o in ordenes))

    def test_higgsfield_vivo(self):
        self.assertTrue(R.registro(deps())["higgsfield"]["comprobacion"]()["ok"])

    def test_freellmapi_marca_caido_30_min_y_reinicia_una_vez(self):
        marcas, reinicios = [], []

        def marcar(nombre, minutos, ahora):
            marcas.append((nombre, minutos))
            return {"ok": True, "reiniciar": len(marcas) == 1}

        reg = R.registro(deps(marcar_proveedor=marcar,
                              reiniciar_servicio=lambda s: reinicios.append(s) or {"ok": True}))
        self.assertTrue(reg["freellmapi"]["recetas"][0]()["ok"])
        self.assertTrue(reg["freellmapi"]["recetas"][0]()["ok"])
        self.assertEqual(marcas, [("freellmapi", 30), ("freellmapi", 30)])
        self.assertEqual(reinicios, ["starseed-freellmapi"])

    def test_nim_marca_caido_y_reinicia_el_servicio(self):
        marcas, reinicios = [], []

        def marcar(nombre, minutos, ahora):
            marcas.append((nombre, minutos))
            return {"ok": True, "reiniciar": True}

        reg = R.registro(deps(marcar_proveedor=marcar,
                              reiniciar_servicio=lambda s: reinicios.append(s) or {"ok": True}))
        reg["nim"]["recetas"][0]()
        self.assertEqual(marcas, [("nim", 30)])
        self.assertEqual(reinicios, ["starseed-freellmapi"])

    def test_proveedor_vivo_no_se_marca(self):
        self.assertTrue(R.registro(deps())["nim"]["comprobacion"]()["ok"])

    def test_marcar_proveedor_es_una_ventana_de_30_min(self):
        with tempfile.TemporaryDirectory() as t:
            ruta = Path(t) / "salud.json"
            with patch.object(R, "SALUD", ruta):
                self.assertTrue(R._marcar_proveedor("nim", 30, AHORA)["reiniciar"])
                self.assertFalse(R._marcar_proveedor("nim", 30, AHORA + timedelta(minutes=10))["reiniciar"])
                self.assertTrue(R._marcar_proveedor("nim", 30, AHORA + timedelta(minutes=41))["reiniciar"])
            datos = json.loads(ruta.read_text(encoding="utf-8"))
            self.assertNotEqual(datos["nim"].get("estado"), "caido")
            self.assertIn("sin_cupo_hasta", datos["nim"])

    def test_telegram_vivo(self):
        self.assertTrue(R.registro(deps())["telegram"]["comprobacion"]()["ok"])

    def test_telegram_red_caida_no_avisa(self):
        avisos = []
        reg = R.registro(deps(getme=lambda: {"ok": False, "motivo": "sin red", "es_red": True},
                              avisar=lambda t: avisos.append(t) or {"ok": True}))
        r = reg["telegram"]["recetas"][0]()
        self.assertFalse(r["ok"])
        self.assertTrue(r.get("es_red"))
        self.assertEqual(avisos, [])

    def test_telegram_fallo_sin_red_avisa(self):
        avisos = []
        reg = R.registro(deps(getme=lambda: {"ok": False, "motivo": "401"},
                              avisar=lambda t: avisos.append(t) or {"ok": True}))
        reg["telegram"]["recetas"][0]()
        self.assertEqual(len(avisos), 1)

    def test_telegram_red_caida_no_escala_ni_avisa(self):
        import sanador_sesiones as SS

        avisos, enviados = [], []
        with tempfile.TemporaryDirectory() as t:
            s = SS.SanadorSesiones(log_file=Path(t) / "l.jsonl",
                                   estado_file=Path(t) / "e.json")
            R.cargar_en(s, deps(getme=lambda: {"ok": False, "motivo": "sin red", "es_red": True},
                                avisar=lambda texto: avisos.append(texto) or {"ok": True}))
            r = s.reparar("telegram", enviar_fn=lambda texto: enviados.append(texto) or {"ok": True})
        self.assertTrue(r.get("es_red"))
        self.assertEqual(avisos, [])
        self.assertEqual(enviados, [])
