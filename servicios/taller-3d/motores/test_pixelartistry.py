#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del motor PixelArtistry (WT1011A) — SIN red ni GPU: la API de ComfyUI se simula.

Ejecutar: python3 -m unittest motores.test_pixelartistry -v
"""
import json
import unittest
from pathlib import Path
from unittest import mock

import pixelartistry as pa


class ComfyFalso:
    """ComfyUI local simulado: responde /system_stats, /object_info, /prompt e /history."""

    def __init__(self, clases=None, falla_post=False, historial=None, vram_usada=2e9):
        self.clases = clases or {n: {} for n in pa.NODOS_REQUERIDOS}
        self.falla_post = falla_post
        self._historial = historial if historial is not None else {
            "p1": {"outputs": {"n1": {"files": [{"filename": "malla.glb", "subfolder": "out"}]}}}
        }
        self.vram_usada = vram_usada
        self.ultimo_prompt = None

    def get(self, ruta, timeout=5):
        if ruta == "/system_stats":
            return {"devices": [{"name": "RTX 3080", "vram_total": 10e9,
                                 "vram_free": 10e9 - self.vram_usada}]}
        if ruta == "/object_info":
            return dict(self.clases)
        if ruta.startswith("/history/"):
            pid = ruta.rsplit("/", 1)[-1]
            return {pid: self._historial[pid]} if pid in self._historial else {}
        raise ValueError(f"ruta no simulada: {ruta}")

    def post(self, ruta, datos, timeout=30):
        if self.falla_post:
            raise RuntimeError("400: prompt inválido (simulado)")
        self.ultimo_prompt = datos
        return {"prompt_id": "p1"}


def _windows_ok():
    """Contexto que simula Windows + NVIDIA RTX."""
    return [mock.patch.object(pa.platform, "system", return_value="Windows"),
            mock.patch.object(pa, "_hay_nvidia", return_value=True)]


FLUJO_EJEMPLO = {
    "1": {"class_type": "LoadImage", "inputs": {"image": "vieja.png"}},
    "2": {"class_type": "WTiVo_Sampler", "inputs": {"resolution": 512, "seed": 7}},
    "3": {"class_type": "MeshQuadReconstruct", "inputs": {}},
}


def _flujo_en_disco(tmp, nombre="PixelArtistry_01_Image_to_Watertight_Mesh.json"):
    ruta = Path(tmp) / nombre
    ruta.write_text(json.dumps(FLUJO_EJEMPLO), encoding="utf-8")
    return tmp


class Disponible(unittest.TestCase):
    def test_en_mac_o_linux_dice_que_no_y_por_que(self):
        for so in ("Darwin", "Linux"):
            with mock.patch.object(pa.platform, "system", return_value=so):
                r = pa.disponible(ComfyFalso())
        self.assertFalse(r["ok"])
        self.assertIn("solo Windows 10/11", r["fallo"])
        self.assertIn("blender-voxel", r["fallo"])

    def test_windows_sin_nvidia_dice_que_no(self):
        with mock.patch.object(pa.platform, "system", return_value="Windows"), \
             mock.patch.object(pa, "_hay_nvidia", return_value=False):
            r = pa.disponible(ComfyFalso())
        self.assertFalse(r["ok"])
        self.assertIn("RTX 20", r["fallo"])

    def test_windows_con_comfyui_caido_dice_que_no(self):
        caido = mock.MagicMock()
        caido.get.side_effect = OSError("conexión rehusada (simulado)")
        for p in _windows_ok():
            p.start()
        try:
            r = pa.disponible(caido)
        finally:
            mock.patch.stopall()
        self.assertFalse(r["ok"])
        self.assertIn("ComfyUI no responde", r["fallo"])

    def test_faltan_nodos_y_lo_dice_con_el_instalador(self):
        comfy = ComfyFalso(clases={"wtivo": {}, "otro_nodo": {}})
        for p in _windows_ok():
            p.start()
        try:
            r = pa.disponible(comfy)
        finally:
            mock.patch.stopall()
        self.assertFalse(r["ok"])
        self.assertIn("quadreconstruct", r["fallo"])
        self.assertIn("watertightMeshes_win_installer.bat", r["fallo"])

    def test_todo_listo_dice_que_si(self):
        comfy = ComfyFalso(clases={n: {} for n in pa.NODOS_REQUERIDOS})
        for p in _windows_ok():
            p.start()
        try:
            self.assertTrue(pa.disponible(comfy)["ok"])
        finally:
            mock.patch.stopall()


class ParchearFlujo(unittest.TestCase):
    def test_cambia_solo_entrada_y_resolucion(self):
        f = pa.parchear_flujo(FLUJO_EJEMPLO, "avatar.png", 1536)
        self.assertEqual(f["1"]["inputs"]["image"], "avatar.png")
        self.assertEqual(f["2"]["inputs"]["resolution"], 1536)
        self.assertEqual(f["2"]["inputs"]["seed"], 7)  # lo demás intacto
        self.assertEqual(FLUJO_EJEMPLO["1"]["inputs"]["image"], "vieja.png")  # no muta el original

    def test_malla_propia_carga_por_meshencoder(self):
        flujo = {"9": {"class_type": "Trellis2MeshEncoder", "inputs": {"mesh": "vieja.obj"}}}
        f = pa.parchear_flujo(flujo, "mi_malla.glb", 1536, es_malla_propia=True)
        self.assertEqual(f["9"]["inputs"]["mesh"], "mi_malla.glb")

    def test_malla_propia_no_toca_loadimage(self):
        f = pa.parchear_flujo(FLUJO_EJEMPLO, "mi_malla.glb", 1536, es_malla_propia=True)
        self.assertEqual(f["1"]["inputs"]["image"], "vieja.png")


class RemallarImagen(unittest.TestCase):
    def setUp(self):
        self.parches = _windows_ok()
        for p in self.parches:
            p.start()
        self.tmp = self._tmpdir()

    def tearDown(self):
        mock.patch.stopall()

    def _tmpdir(self):
        import tempfile
        self._d = tempfile.TemporaryDirectory()
        self.addCleanup(self._d.cleanup)
        return self._d.name

    def test_camino_feliz_devuelve_glb_procedencia_y_pico(self):
        carpeta = _flujo_en_disco(self.tmp)
        comfy = ComfyFalso(vram_usada=6.25e9)
        r = pa.remallar_imagen("avatar.png", resolucion=1536, carpeta_workflows=carpeta,
                               comfy=comfy, dormir=lambda _: None)
        self.assertTrue(r["ok"])
        self.assertEqual(r["glb"], str(Path("out") / "malla.glb"))
        self.assertIsNone(r["fallo"])
        self.assertAlmostEqual(r["pico_memoria_gb"], 6.25)
        self.assertGreaterEqual(r["segundos"], 0)
        # procedencia honesta: flujo MIT + nodos GPL-3.0/MIT
        piezas = [p["pieza"] for p in r["procedencia"]]
        self.assertEqual(piezas, ["flujo cerrada", "nodos MostAadTech"])
        self.assertIn(pa.FUENTE, json.dumps(r["procedencia"]))
        # el prompt enviado lleva la entrada y la resolución pedidas
        prompt = comfy.ultimo_prompt["prompt"]
        self.assertEqual(prompt["1"]["inputs"]["image"], "avatar.png")
        self.assertEqual(prompt["2"]["inputs"]["resolution"], 1536)

    def test_sin_flujos_en_disco_pide_el_instalador(self):
        r = pa.remallar_imagen("a.png", carpeta_workflows=self.tmp,
                               comfy=ComfyFalso(), dormir=lambda _: None)
        self.assertFalse(r["ok"])
        self.assertIn("watertightMeshes_win_installer.bat", r["fallo"])

    def test_prompt_rechazado_devuelve_el_fallo(self):
        carpeta = _flujo_en_disco(self.tmp)
        r = pa.remallar_imagen("a.png", carpeta_workflows=carpeta,
                               comfy=ComfyFalso(falla_post=True), dormir=lambda _: None)
        self.assertFalse(r["ok"])
        self.assertIn("ComfyUI rechazó el prompt", r["fallo"])

    def test_historial_sin_glb_es_agujero(self):
        carpeta = _flujo_en_disco(self.tmp)
        comfy = ComfyFalso(historial={"p1": {"outputs": {"n1": {"files": [{"filename": "malla.obj"}]}}}})
        r = pa.remallar_imagen("a.png", carpeta_workflows=carpeta,
                               comfy=comfy, dormir=lambda _: None)
        self.assertFalse(r["ok"])
        self.assertIn("sin GLB", r["fallo"])

    def test_flujo_desconocido(self):
        r = pa.remallar_imagen("a.png", flujo="inventado", comfy=ComfyFalso())
        self.assertFalse(r["ok"])
        self.assertIn("flujo desconocido", r["fallo"])

    def test_bucle_espera_hasta_que_hay_historial(self):
        carpeta = _flujo_en_disco(self.tmp)
        vacio = {}
        con_glb = {"p1": {"outputs": {"n1": {"files": [{"filename": "malla.glb"}]}}}}
        comfy = ComfyFalso(historial={})
        llamadas = {"n": 0}
        get_real = comfy.get

        def get_lento(ruta, timeout=5):
            if ruta.startswith("/history/"):
                llamadas["n"] += 1
                if llamadas["n"] < 3:
                    return vacio
                return con_glb
            return get_real(ruta, timeout)

        comfy.get = get_lento
        r = pa.remallar_imagen("a.png", carpeta_workflows=carpeta,
                               comfy=comfy, dormir=lambda _: None, espera_s=0.01)
        self.assertTrue(r["ok"])
        self.assertEqual(r["glb"], "malla.glb")
        self.assertEqual(llamadas["n"], 3)

    def test_no_disponible_devuelve_el_dict_completo_con_procedencia(self):
        carpeta = _flujo_en_disco(self.tmp)
        with mock.patch.object(pa.platform, "system", return_value="Linux"):
            r = pa.remallar_imagen("a.png", 512, carpeta_workflows=carpeta,
                                   comfy=ComfyFalso(), dormir=lambda _: None)
        self.assertFalse(r["ok"])
        self.assertIsNone(r["glb"])
        self.assertIn("solo Windows", r["fallo"])
        self.assertEqual([p["pieza"] for p in r["procedencia"]],
                         ["flujo cerrada", "nodos MostAadTech"])
        self.assertGreaterEqual(r["segundos"], 0)
        self.assertEqual(r["pico_memoria_gb"], 0)

    def test_tiempo_agotado(self):
        carpeta = _flujo_en_disco(self.tmp)
        comfy = ComfyFalso(historial={"p1": None})
        # devuelve {} sin el pid: nunca termina
        r = pa.remallar_imagen("a.png", carpeta_workflows=carpeta,
                               comfy=comfy, dormir=lambda _: None,
                               espera_s=0.01, tope_s=0.001)
        self.assertFalse(r["ok"])
        self.assertIn("tiempo agotado", r["fallo"])


if __name__ == "__main__":
    unittest.main()
