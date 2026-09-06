# -*- coding: utf-8 -*-
"""Tests de la memoria de cupo de los revisores del orquestador (2026-09-06, Ola 261).

Sin red: `SALUD_JSON` se parchea a un archivo temporal con pytest (`monkeypatch`) y se
ejercitan marcar_sin_cupo / sin_cupo / enfriandose / candidatos_revision. El módulo se
importa con importlib porque el nombre del archivo lleva guiones (igual que en
test_alcance.py); el import es seguro porque el arranque vive bajo
`if __name__ == "__main__"`.
"""
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


def _hace(minutos):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - minutos * 60))


@pytest.fixture
def salud(tmp_path, monkeypatch):
    """Archivo de salud temporal: ningún test toca ~/.starseed de verdad."""
    f = tmp_path / "salud-proveedores.json"
    monkeypatch.setattr(enjambre, "SALUD_JSON", str(f))
    yield f


class SinCupoTest(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def _salud(self, salud):
        self.salud = salud

    def test_marcar_y_detectar(self):
        enjambre.marcar_sin_cupo("xkiro", "cuota diaria")
        self.assertTrue(enjambre.sin_cupo("xkiro"))
        # Respeta el resto de campos que ya tenía el proveedor.
        datos = json.load(open(self.salud, encoding="utf-8"))
        self.assertIn("sin_cupo_hasta", datos["xkiro"])
        self.assertEqual(datos["xkiro"]["motivo"], "cuota diaria")

    def test_fecha_pasada_no_es_sin_cupo(self):
        json.dump({"aihubmix": {"sin_cupo_hasta": _hace(60), "motivo": "viejo"}},
                  open(self.salud, "w", encoding="utf-8"))
        self.assertFalse(enjambre.sin_cupo("aihubmix"))

    def test_sin_entrada_no_es_sin_cupo(self):
        self.assertFalse(enjambre.sin_cupo("tokenrouter"))


class EnfriandoseTest(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def _salud(self, salud):
        self.salud = salud

    def test_429_reciente_enfria(self):
        json.dump({"xkiro": {"ultimo_429": _hace(2)}}, open(self.salud, "w", encoding="utf-8"))
        self.assertTrue(enjambre.enfriandose("xkiro"))

    def test_429_antiguo_ya_no_enfria(self):
        json.dump({"xkiro": {"ultimo_429": _hace(20)}}, open(self.salud, "w", encoding="utf-8"))
        self.assertFalse(enjambre.enfriandose("xkiro"))

    def test_sin_429_no_enfria(self):
        self.assertFalse(enjambre.enfriandose("nim"))


class CandidatosTest(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def _salud(self, salud, monkeypatch):
        self.salud = salud
        monkeypatch.setattr(enjambre, "REVISOR_ULTIMO_OK", "")
        yield
        monkeypatch.setattr(enjambre, "REVISOR_ULTIMO_OK", "")

    def test_excluye_agotados_y_enfriandose(self):
        json.dump({
            "xkiro": {"estado": "caido", "t": _hace(5)},
            "aihubmix": {"sin_cupo_hasta": _hace(-24 * 60), "motivo": "cuota"},
            "tokenrouter": {"ultimo_429": _hace(2)},
        }, open(self.salud, "w", encoding="utf-8"))
        candidatos, saltados = enjambre.candidatos_revision()
        proveedores = [p for p, _ in candidatos]
        self.assertNotIn("xkiro", proveedores)        # caído
        self.assertNotIn("aihubmix", proveedores)     # sin cupo
        self.assertNotIn("tokenrouter", proveedores)  # enfriándose
        self.assertTrue(saltados)                     # aviso único con los motivos
        self.assertIn("sin cupo", " ".join(saltados))

    def test_todos_excluidos_devuelve_la_lista_completa(self):
        llena = {}
        for prov, _ in enjambre.REVISORES:
            llena.setdefault(prov, {"estado": "caido", "t": _hace(5)})
        json.dump(llena, open(self.salud, "w", encoding="utf-8"))
        candidatos, saltados = enjambre.candidatos_revision()
        # Nunca nos quedamos sin revisor: la lista completa, como antes de la Ola 261.
        self.assertEqual(candidatos, list(enjambre.REVISORES))

    def test_ultimo_ok_desde_el_archivo(self):
        json.dump({"ultimo_revisor_ok": "nim/moonshotai/kimi-k3"},
                  open(self.salud, "w", encoding="utf-8"))
        candidatos, _ = enjambre.candidatos_revision()
        self.assertEqual("%s/%s" % candidatos[0], "nim/moonshotai/kimi-k3")

    def test_ultimo_ok_de_la_variable(self):
        enjambre.REVISOR_ULTIMO_OK = "llm7/minimax-m2.7"
        try:
            candidatos, _ = enjambre.candidatos_revision()
            self.assertEqual("%s/%s" % candidatos[0], "llm7/minimax-m2.7")
        finally:
            enjambre.REVISOR_ULTIMO_OK = ""


if __name__ == "__main__":
    unittest.main()
