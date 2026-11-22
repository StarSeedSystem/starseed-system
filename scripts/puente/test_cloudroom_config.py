# -*- coding: utf-8 -*-
"""Pruebas de `cloudroom_config` sin room-cli ni red: CLI simulada y setup temporal.

Nunca se escribe una clave: solo se comprueban NOMBRES de variable de entorno.
"""
import json, os, subprocess, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloudroom_config as CC  # noqa: E402
import cloudroom_modelos as CM  # noqa: E402

CM.PI_MODELOS = "/nonexistent/cloudroom-pi-modelos.json"
CLAVES = {"nvidia": "NVIDIA_API_KEY", "gemini": "GEMINI_API_KEY"}
NUBE = {"authenticated": True, "harnesses": [{"id": "codex", "models": [{"model": "gpt-6-luna"}]}]}
ENV = {"variables": [{"name": "NVIDIA_API_KEY"}, {"name": "GEMINI_API_KEY"}]}

def _completado(orden, stdout="", rc=0, stderr=""):
    return subprocess.CompletedProcess(orden, rc, stdout=stdout, stderr=stderr)

class Plan(unittest.TestCase):
    def test_sin_cli_pide_instalar(self):
        r = CC.plan(None, None, None)
        self.assertEqual(r["estado"], "no_disponible")
        self.assertEqual(r["pasos"][0]["tipo"], "instalar")

    def test_sin_sesion_pide_iniciar(self):
        r = CC.plan({"running": True}, {"authenticated": False}, None)
        self.assertEqual(r["estado"], "requiere_alex")
        self.assertTrue(any(p["tipo"] == "iniciar_sesion" for p in r["pasos"]))
        self.assertIn("inicia sesión", r["detalle"])

    def test_sin_agente_pide_conectar(self):
        r = CC.plan({"running": True}, {"authenticated": True, "harnesses": []}, None)
        self.assertEqual(r["estado"], "requiere_alex")
        self.assertTrue(any(p["tipo"] == "conectar_agente" for p in r["pasos"]))

    def test_status_local_lento_pero_cuenta_lista(self):
        r = CC.plan(None, dict(NUBE, ready=True), ENV, "setup", CLAVES)
        self.assertEqual(r["estado"], "listo")

    def test_clave_que_falta_se_pide_por_nombre(self):
        env = {"variables": [{"name": "NVIDIA_API_KEY"}]}
        r = CC.plan({"running": True}, NUBE, env, "setup", CLAVES)
        self.assertEqual(r["estado"], "requiere_alex")
        self.assertEqual(r["faltan"], ["GEMINI_API_KEY"])
        paso = next(p for p in r["pasos"] if p["tipo"] == "poner_clave")
        self.assertIn("cloud env set GEMINI_API_KEY", paso["detalle"])
        self.assertNotIn("valor", paso)

    def test_sin_lista_de_variables_no_bloquea(self):
        r = CC.plan({"running": True}, NUBE, None, "setup", CLAVES)
        self.assertEqual(r["faltan"], [])
        self.assertEqual(r["estado"], "listo")

    def test_listo_incluye_aplicar_setup(self):
        r = CC.plan({"running": True}, NUBE, ENV, "setup", CLAVES)
        self.assertEqual(r["estado"], "listo")
        self.assertIn(["room-cli", "cloud", "setup", "set"],
                      [p.get("orden") for p in r["pasos"]])

    def test_sin_script_de_setup_no_disponible(self):
        r = CC.plan({"running": True}, NUBE, ENV, "", CLAVES)
        self.assertEqual(r["estado"], "no_disponible")
        self.assertIn("setup-nube.sh", r["detalle"])

class Configurar(unittest.TestCase):
    def _run(self, ordenes, falla_setup=False):
        def falso(orden, **kwargs):
            ordenes.append((orden, kwargs))
            if orden[1:] == ["cloud", "setup", "set"]:
                return _completado(orden, rc=1 if falla_setup else 0,
                                   stderr="no se pudo" if falla_setup else "")
            if orden[1:] == ["status", "--json"]:
                return _completado(orden, json.dumps({"running": True}))
            if orden[1:] == ["cloud", "status", "--json"]:
                return _completado(orden, json.dumps(NUBE))
            if orden[1:] == ["cloud", "env", "list", "--json"]:
                return _completado(orden, json.dumps(ENV))
            return _completado(orden, rc=1, stderr="orden inesperada")
        return falso

    def _setup(self):
        f = tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False, encoding="utf-8")
        f.write("echo setup\n")
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name
    def test_aplica_setup_y_no_escribe_claves(self):
        ordenes = []
        r = CC.configurar(run=self._run(ordenes), cli="/opt/room-cli", claves=CLAVES,
                          ruta_setup=self._setup())
        self.assertEqual(r["estado"], "listo")
        self.assertTrue(r["setup"]["ok"])
        self.assertIn(["/opt/room-cli", "cloud", "setup", "set"],
                      [o for o, _ in ordenes])
        self.assertFalse([o for o, _ in ordenes if "env" in o and "set" in o])

    def test_seco_no_aplica_el_setup(self):
        ordenes = []
        r = CC.configurar(run=self._run(ordenes), cli="/opt/room-cli", seco=True,
                          claves=CLAVES, ruta_setup=self._setup())
        self.assertFalse(r["setup"]["aplicado"])
        self.assertNotIn(["/opt/room-cli", "cloud", "setup", "set"],
                         [o for o, _ in ordenes])

    def test_setup_fallido_lo_dice(self):
        ordenes = []
        r = CC.configurar(run=self._run(ordenes, falla_setup=True), cli="/opt/room-cli",
                          claves=CLAVES, ruta_setup=self._setup())
        self.assertFalse(r["setup"]["ok"])
        self.assertIn("no se pudo", r["setup"]["error"])

class Texto(unittest.TestCase):
    def test_texto_dice_estado_y_pasos(self):
        r = CC.plan({"running": True}, NUBE, {"variables": [{"name": "NVIDIA_API_KEY"}]},
                    "setup", CLAVES)
        t = CC.texto(r)
        self.assertIn("Cloudroom", t)
        self.assertIn("requiere_alex", t)
        self.assertIn("GEMINI_API_KEY", t)
