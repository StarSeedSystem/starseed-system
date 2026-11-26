# -*- coding: utf-8 -*-
"""Pruebas puras de `cloudroom_config` (CAP1119): plan de configuración y activación de Cloudroom.

Nunca se ejecuta `room-cli` ni se toca la red: las órdenes se simulan y el disco es temporal.
"""
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloudroom_config as CC  # noqa: E402


def _correr(ordenes, estado=None, env=None, proyectos=None):
    """room-cli simulado: anota cada orden y contesta JSON donde toca."""
    def run(orden, input=None, **kw):
        ordenes.append((orden, input))
        if orden[1:] == ["cloud", "status", "--json"]:
            return SimpleNamespace(returncode=0, stdout=json.dumps(estado or {}), stderr="")
        if orden[1:] == ["cloud", "env", "list", "--json"]:
            return SimpleNamespace(returncode=0, stdout=json.dumps(env or {"variables": []}), stderr="")
        if orden[1:] == ["project", "list", "--json"]:
            return SimpleNamespace(returncode=0, stdout=json.dumps(proyectos or {"projects": []}), stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")
    return run


class Plan(unittest.TestCase):
    def test_listo_con_sesion_proyecto_modelos_y_claves(self):
        with tempfile.TemporaryDirectory() as raiz:
            estado = {"authenticated": True, "harnesses": [
                {"id": "opencode", "models": [{"model": "nvidia/glm"}]}]}
            proyectos = {"projects": [{"id": "p1", "sources": [{"path": raiz}]}]}
            p = CC.plan(estado, {"NVIDIA_API_KEY"}, proyectos, raiz,
                        {"nvidia": "NVIDIA_API_KEY"}, setup_existe=True)
        self.assertTrue(p["listo"])
        self.assertTrue(p["completo"])
        self.assertEqual("p1", p["proyecto"])
        self.assertEqual(["opencode/nvidia/glm"], p["modelos"])
        self.assertEqual([], p["requiere_alex"])

    def test_sin_sesion_pide_a_alex(self):
        p = CC.plan({"authenticated": False}, set(), {"projects": []}, "/x", {}, True)
        self.assertFalse(p["listo"])
        self.assertTrue(any("inicia sesión" in r for r in p["requiere_alex"]))

    def test_sin_proyecto_ni_modelos_no_esta_listo(self):
        p = CC.plan({"authenticated": True, "harnesses": []}, set(), {"projects": []}, "/x", {}, True)
        self.assertFalse(p["listo"])
        self.assertTrue(any("conecta el repo" in r for r in p["requiere_alex"]))
        self.assertTrue(any("conecta un agente" in r for r in p["requiere_alex"]))

    def test_falta_el_setup(self):
        p = CC.plan({"authenticated": True}, set(), {"projects": []}, "/x", {}, setup_existe=False)
        self.assertFalse(p["listo"])
        self.assertTrue(any("setup-nube.sh" in r for r in p["requiere_alex"]))


class Claves(unittest.TestCase):
    def test_faltantes_solo_nombres_y_sin_lectura_no_inventa(self):
        declaradas = {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"}
        self.assertEqual(["XKIRO_API_KEY"], CC.claves_faltantes(declaradas, {"NVIDIA_API_KEY"}))
        self.assertEqual([], CC.claves_faltantes(declaradas, None))

    def test_proyecto_compara_rutas_reales(self):
        with tempfile.TemporaryDirectory() as raiz:
            proyectos = {"projects": [
                {"id": "otro", "sources": [{"path": os.path.join(raiz, "otro")}]},
                {"id": "bueno", "sources": [{"path": raiz}]},
            ]}
            self.assertEqual("bueno", CC.proyecto_de(proyectos, raiz))
            self.assertEqual("", CC.proyecto_de({"projects": []}, raiz))


class Configurar(unittest.TestCase):
    def _repo(self, raiz):
        setup = os.path.join(raiz, "scripts", "cloudroom", "setup-nube.sh")
        os.makedirs(os.path.dirname(setup), exist_ok=True)
        with open(setup, "w", encoding="utf-8") as f:
            f.write("#!/bin/sh\nexit 0\n")
        return setup

    def test_aplica_setup_y_check_sin_abrir_hilos(self):
        with tempfile.TemporaryDirectory() as raiz:
            setup = self._repo(raiz)
            ordenes = []
            estado = {"authenticated": True, "harnesses": [
                {"id": "opencode", "models": [{"model": "nvidia/glm"}]}]}
            proyectos = {"projects": [{"id": "p1", "sources": [{"path": raiz}]}]}
            r = CC.configurar(seco=False, run=_correr(ordenes, estado, {"variables": [
                {"name": "NVIDIA_API_KEY"}]}, proyectos), cli="room-cli", raiz=raiz,
                setup=setup, declaradas={"nvidia": "NVIDIA_API_KEY"})
            hechas = [o for o, _ in ordenes]
            entradas = {tuple(o): i for o, i in ordenes}
            with open(setup, encoding="utf-8") as f:
                texto = f.read()
        self.assertEqual("listo", r["estado"])
        self.assertIn(["room-cli", "cloud", "setup", "set"], hechas)
        self.assertIn(["room-cli", "cloud", "check"], hechas)
        self.assertFalse(any("thread" in o for o in hechas))
        self.assertEqual(texto, entradas[("room-cli", "cloud", "setup", "set")])

    def test_seco_solo_lee_y_no_aplica(self):
        with tempfile.TemporaryDirectory() as raiz:
            setup = self._repo(raiz)
            ordenes = []
            r = CC.configurar(seco=True, run=_correr(ordenes, {"authenticated": True}),
                              cli="room-cli", raiz=raiz, setup=setup, declaradas={})
        hechas = [o for o, _ in ordenes]
        self.assertNotIn(["room-cli", "cloud", "setup", "set"], hechas)
        self.assertNotIn(["room-cli", "cloud", "check"], hechas)
        self.assertIsNotNone(r["plan"])

    def test_sin_room_cli_es_honesto_y_no_ejecuta(self):
        ordenes = []
        r = CC.configurar(run=_correr(ordenes), cli="")
        self.assertEqual("no_disponible", r["estado"])
        self.assertIn("app sin instalar", r["errores"])
        self.assertEqual([], ordenes)

    def test_sin_sesion_no_aplica_el_setup(self):
        with tempfile.TemporaryDirectory() as raiz:
            setup = self._repo(raiz)
            ordenes = []
            CC.configurar(seco=False, run=_correr(ordenes, {"authenticated": False}),
                          cli="room-cli", raiz=raiz, setup=setup, declaradas={})
        self.assertNotIn(["room-cli", "cloud", "setup", "set"], [o for o, _ in ordenes])

    def test_sin_cloud_status_no_revienta_y_lo_dice(self):
        def run(orden, input=None, **kw):
            if orden[1:] == ["cloud", "status", "--json"]:
                return SimpleNamespace(returncode=1, stdout="", stderr="la app no contesta")
            return SimpleNamespace(returncode=0, stdout="{}", stderr="")

        with tempfile.TemporaryDirectory() as raiz:
            setup = self._repo(raiz)
            r = CC.configurar(seco=True, run=run, cli="room-cli", raiz=raiz,
                              setup=setup, declaradas={})
        self.assertIsNotNone(r["plan"])
        self.assertFalse(r["plan"]["sesion"])
        self.assertIn("la app no contesta", r["errores"])

    def test_texto_del_plan_dice_lo_que_falta(self):
        p = CC.plan({"authenticated": False}, None, {"projects": []}, "/x", {}, False)
        texto = CC.texto_plan(p)
        self.assertIn("sin iniciar", texto)
        self.assertIn("Alex", texto)


class CLI(unittest.TestCase):
    def test_sin_plan_no_revienta(self):
        with mock.patch.object(CC, "configurar", return_value={"plan": None, "errores": ["app sin instalar"]}):
            with redirect_stdout(io.StringIO()):
                self.assertEqual(0, CC.main(["estado"]))
                self.assertEqual(1, CC.main(["probar"]))

    def test_probar_sin_listo_devuelve_1(self):
        p = CC.plan({"authenticated": False}, None, {"projects": []}, "/x", {}, False)
        with mock.patch.object(CC, "configurar", return_value={"plan": p, "errores": []}):
            with redirect_stdout(io.StringIO()):
                self.assertEqual(1, CC.main(["probar"]))
                self.assertEqual(0, CC.main(["estado"]))


if __name__ == "__main__":
    unittest.main()
