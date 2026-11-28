# -*- coding: utf-8 -*-
"""Pruebas de `cloudroom_config.py`: validar, cargar y revisar la configuración de Cloudroom."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloudroom_config as CC

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _tmp(contenido=None):
    ruta = os.path.join(tempfile.mkdtemp(), "cloudroom-pi-modelos.json")
    if contenido is not None:
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump(contenido, fh)
    return ruta


class Validar(unittest.TestCase):
    def test_defaults_son_validos(self):
        self.assertEqual(CC.validar(CC.DEFAULTS), [])

    def test_no_objeto(self):
        self.assertTrue(CC.validar([1]))

    def test_modelos_invalidos(self):
        for malo in ("x", [1], ["sinproveedor"], [""]):
            self.assertTrue(CC.validar({"modelos": malo}), malo)

    def test_claves_invalidas(self):
        for malo in ("x", {"nvidia": "nvidia-key"}, {"nvidia": 3}):
            self.assertTrue(CC.validar({"claves": malo}), malo)

    def test_simultaneos_invalidos(self):
        for malo in ("x", {"nvidia": -1}, {"nvidia": True}, {"nvidia": "2"}):
            self.assertTrue(CC.validar({"simultaneos": malo}), malo)

    def test_config_real_del_repo_es_valida(self):
        cfg, avisos = CC.cargar(os.path.join(RAIZ, "config", "cloudroom-pi-modelos.json"))
        self.assertEqual(avisos, [])
        self.assertTrue(cfg["modelos"])
        self.assertEqual(CC.validar(cfg), [])


class Cargar(unittest.TestCase):
    def test_falta_o_roto_usa_defaults(self):
        self.assertEqual(CC.cargar(_tmp()), (CC.DEFAULTS, []))
        rota = _tmp()
        with open(rota, "w", encoding="utf-8") as fh:
            fh.write("{ roto")
        self.assertEqual(CC.cargar(rota), (CC.DEFAULTS, []))

    def test_fusion_parcial(self):
        cfg, avisos = CC.cargar(_tmp({"modelos": ["nvidia/z-ai/glm-5.3"],
                                      "claves": {"nvidia": "NVIDIA_API_KEY"},
                                      "simultaneos": {"nvidia": 2}}))
        self.assertEqual(cfg["modelos"], ["nvidia/z-ai/glm-5.3"])
        self.assertEqual(cfg["claves"], {"nvidia": "NVIDIA_API_KEY"})
        self.assertEqual(cfg["simultaneos"], {"nvidia": 2})
        self.assertEqual(avisos, [])

    def test_valores_invalidos_se_descartan_con_aviso(self):
        cfg, avisos = CC.cargar(_tmp({"modelos": ["nvidia/x", 7],
                                      "claves": {"nvidia": "NVIDIA_API_KEY", "xkiro": 3},
                                      "simultaneos": {"nvidia": -1}}))
        self.assertEqual(cfg["modelos"], ["nvidia/x"])
        self.assertEqual(cfg["claves"], {"nvidia": "NVIDIA_API_KEY"})
        self.assertEqual(cfg["simultaneos"], {})
        self.assertEqual(len(avisos), 3)

    def test_clave_desconocida_se_ignora(self):
        cfg, avisos = CC.cargar(_tmp({"no_existe": 1, "modelos": ["nvidia/x"]}))
        self.assertNotIn("no_existe", cfg)
        self.assertEqual(avisos, [])


class ClavesYModelos(unittest.TestCase):
    CFG = {"modelos": ["nvidia/a", "xkiro/b", "llm7/c"],
           "claves": {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"}}

    def test_sin_lectura_no_falta_nada(self):
        self.assertEqual(CC.faltan_claves(self.CFG["claves"], None), [])
        self.assertEqual(CC.modelos_listos(self.CFG, None), self.CFG["modelos"])

    def test_faltan_los_proveedores_sin_clave(self):
        self.assertEqual(CC.faltan_claves(self.CFG["claves"], {"NVIDIA_API_KEY"}), ["xkiro"])

    def test_modelos_listos_filtra_por_clave(self):
        self.assertEqual(CC.modelos_listos(self.CFG, {"NVIDIA_API_KEY"}), ["nvidia/a", "llm7/c"])


class Revisar(unittest.TestCase):
    USABLE = {"estado": "usable", "detalle": "cuenta conectada"}
    CFG = {"modelos": ["nvidia/a"], "claves": {"nvidia": "NVIDIA_API_KEY"}, "simultaneos": {}}

    def test_listo_cuando_todo_esta(self):
        r = CC.revisar(self.USABLE, {"NVIDIA_API_KEY"}, self.CFG, proyecto="p1")
        self.assertTrue(r["listo"], r)
        self.assertEqual(r["faltan"], [])
        self.assertEqual(r["pasos"], [])

    def test_sin_cli_no_listo(self):
        r = CC.revisar({"estado": "no_disponible", "detalle": "app sin instalar",
                        "siguiente_paso": "instala Cloudroom"}, {"NVIDIA_API_KEY"}, self.CFG, "p1")
        self.assertFalse(r["listo"])
        self.assertIn("instala Cloudroom", r["pasos"])

    def test_sin_proyecto_no_listo(self):
        r = CC.revisar(self.USABLE, {"NVIDIA_API_KEY"}, self.CFG)
        self.assertFalse(r["listo"])
        self.assertTrue(any("proyecto" in f for f in r["faltan"]))

    def test_clave_faltante_da_paso_con_nombre_no_valor(self):
        r = CC.revisar(self.USABLE, set(), self.CFG, "p1")
        self.assertFalse(r["listo"])
        paso = " ".join(r["pasos"])
        self.assertIn("NVIDIA_API_KEY", paso)
        self.assertIn("room-cli cloud env set", paso)

    def test_sin_modelos_no_listo(self):
        r = CC.revisar(self.USABLE, set(), {"modelos": [], "claves": {}, "simultaneos": {}}, "p1")
        self.assertFalse(r["listo"])
        self.assertTrue(any("modelo" in f for f in r["faltan"]))


class Activar(unittest.TestCase):
    def test_usable_no_abre(self):
        llamado = []
        medio, abierto = CC.activar({"estado": "usable"}, abrir=lambda _r: llamado.append(1))
        self.assertFalse(abierto)
        self.assertEqual(llamado, [])

    def test_no_usable_abre_y_resondea(self):
        medio, abierto = CC.activar({"estado": "no_disponible"}, abrir=lambda _r: True,
                                    sondear=lambda run: {"estado": "usable"})
        self.assertTrue(abierto)
        self.assertEqual(medio["estado"], "usable")

    def test_si_no_se_puede_abrir_no_cambia(self):
        medio, abierto = CC.activar({"estado": "no_disponible"}, abrir=lambda _r: False)
        self.assertFalse(abierto)
        self.assertEqual(medio["estado"], "no_disponible")


if __name__ == "__main__":
    unittest.main()
