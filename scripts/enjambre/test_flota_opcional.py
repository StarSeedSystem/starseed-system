# -*- coding: utf-8 -*-
"""Pruebas de flota_opcional: tabla rol × estado, sin mutación, orden estable."""
import os
import sys
import unittest
from datetime import datetime, timezone, timedelta

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import flota_opcional as F  # noqa: E402


LISTA_BASE = [
    ("llm7", "gpt-oss"),
    ("nim", "minimaxai/minimax-m3.1-flash"),
    ("xkiro", "minimax/minimax-m2.7-highspeed:free"),
    ("groq", "openai/gpt-oss-120b"),
    ("aihubmix", "gemini-3.7-flash-free"),
    ("openrouter", "nvidia/nemotron-3-super-120b-a12b:free"),
    ("llm7", "minimax-m2.7"),
    ("gemini", "gemini-2.5-flash-lite"),
]

AHORA = "2026-11-16T12:00:00Z"
AHORA_DT = datetime.fromisoformat(AHORA.replace("Z", "+00:00"))
RECIENTE = (AHORA_DT - timedelta(seconds=30)).isoformat().replace("+00:00", "Z")
VIEJO = (AHORA_DT - timedelta(seconds=700)).isoformat().replace("+00:00", "Z")


class TablaRolEstado(unittest.TestCase):
    """Tabla completa: cada rol × cada combinación de estados de opcionales."""

    def _llamar(
        self,
        rol: str,
        ablit_flag: bool,
        ablit_permitido: bool,
        privado_vivo: bool,
        privado_reciente: bool,
        privado_etiqueta: str = "mi-modelo",
    ) -> tuple[list[tuple[str, str]], list[str]]:
        entorno = {"STARSEED_ABLITERATION": "1" if ablit_flag else "0"}
        estado_abl = {"permitido": ablit_permitido, "motivo": "ok" if ablit_permitido else "saldo 0"}
        estado_priv = {
            "vivo": privado_vivo,
            "lectura_iso": RECIENTE if privado_reciente else VIEJO,
            "etiqueta": privado_etiqueta,
            "motivo": "ok" if privado_vivo else "apagado",
        }
        return F.agregar_opcionales(LISTA_BASE, rol, entorno, estado_abl, estado_priv, AHORA)

    # ── Roles de escritura/revisión: NUNCA añaden opcionales ──

    def test_escritor_sin_opcionales(self):
        lista, fuera = self._llamar("escritor", True, True, True, True)
        self.assertEqual(lista, LISTA_BASE)
        self.assertEqual(fuera, [])

    def test_revisor_sin_opcionales(self):
        lista, fuera = self._llamar("revisor", True, True, True, True)
        self.assertEqual(lista, LISTA_BASE)
        self.assertEqual(fuera, [])

    # ── Roles de análisis: pueden añadir opcionales ──

    def test_sueno_mapa_ambos_opcionales(self):
        lista, fuera = self._llamar("sueno-mapa", True, True, True, True)
        self.assertEqual(len(lista), len(LISTA_BASE) + 2)
        self.assertEqual(lista[: len(LISTA_BASE)], LISTA_BASE)  # base intacta al principio
        self.assertIn(("abliteration", "abliterated-model"), lista)
        self.assertIn(("privado", "mi-modelo"), lista)
        self.assertEqual(fuera, [])

    def test_sueno_reduce_solo_abliteration(self):
        lista, fuera = self._llamar("sueno-reduce", True, True, False, False)
        self.assertEqual(len(lista), len(LISTA_BASE) + 1)
        self.assertIn(("abliteration", "abliterated-model"), lista)
        self.assertNotIn(("privado", "mi-modelo"), lista)
        self.assertTrue(any("privado" in m for m in fuera))

    def test_sueno_contraste_solo_privado(self):
        lista, fuera = self._llamar("sueno-contraste", False, False, True, True)
        self.assertEqual(len(lista), len(LISTA_BASE) + 1)
        self.assertIn(("privado", "mi-modelo"), lista)
        self.assertNotIn(("abliteration", "abliterated-model"), lista)
        self.assertTrue(any("abliteration" in m for m in fuera))

    def test_sintesis_ninguno(self):
        lista, fuera = self._llamar("sintesis", False, False, False, False)
        self.assertEqual(lista, LISTA_BASE)
        self.assertEqual(len(fuera), 2)

    def test_direccion_nunca_privado_aunque_vivo_reciente(self):
        lista, fuera = self._llamar("direccion", True, True, True, True)
        self.assertEqual(len(lista), len(LISTA_BASE) + 1)
        self.assertIn(("abliteration", "abliterated-model"), lista)
        self.assertNotIn(("privado", "mi-modelo"), lista)
        self.assertTrue(any("direccion" in m for m in fuera))

    def test_direccion_abliteration_si_permitido(self):
        lista, fuera = self._llamar("direccion", True, True, False, False)
        self.assertIn(("abliteration", "abliterated-model"), lista)

    def test_abliteration_flag_apagado_no_entra(self):
        lista, fuera = self._llamar("sueno-mapa", False, True, True, True)
        self.assertNotIn(("abliteration", "abliterated-model"), lista)
        self.assertTrue(any("STARSEED_ABLITERATION" in m for m in fuera))

    def test_abliteration_sin_creditos_no_entra(self):
        lista, fuera = self._llamar("sueno-mapa", True, False, True, True)
        self.assertNotIn(("abliteration", "abliterated-model"), lista)
        self.assertTrue(any("creditos" in m for m in fuera))

    def test_privado_apagado_no_entra(self):
        lista, fuera = self._llamar("sueno-mapa", True, True, False, True)
        self.assertNotIn(("privado", "mi-modelo"), lista)
        self.assertTrue(any("privado" in m for m in fuera))

    def test_privado_lectura_vieja_no_entra(self):
        lista, fuera = self._llamar("sueno-mapa", True, True, True, False)
        self.assertNotIn(("privado", "mi-modelo"), lista)
        self.assertTrue(any("10 min" in m or "inválida" in m for m in fuera))

    def test_privado_etiqueta_personalizada(self):
        lista, fuera = self._llamar("sueno-mapa", False, False, True, True, "mi-llama-7b")
        self.assertIn(("privado", "mi-llama-7b"), lista)


class SinMutacion(unittest.TestCase):
    """La lista de entrada NUNCA se muta."""

    def test_lista_original_intacta(self):
        original = list(LISTA_BASE)
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_abl = {"permitido": True, "motivo": "ok"}
        estado_priv = {"vivo": True, "lectura_iso": RECIENTE, "etiqueta": "x", "motivo": "ok"}
        F.agregar_opcionales(original, "sueno-mapa", entorno, estado_abl, estado_priv, AHORA)
        self.assertEqual(original, LISTA_BASE)

    def test_devuelve_nueva_lista(self):
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_abl = {"permitido": True, "motivo": "ok"}
        estado_priv = {"vivo": True, "lectura_iso": RECIENTE, "etiqueta": "x", "motivo": "ok"}
        lista, _ = F.agregar_opcionales(LISTA_BASE, "sueno-mapa", entorno, estado_abl, estado_priv, AHORA)
        self.assertIsNot(lista, LISTA_BASE)


class OrdenEstable(unittest.TestCase):
    """El orden de la base se respeta; opcionales van al final en orden fijo."""

    def test_orden_base_inmutable(self):
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_abl = {"permitido": True, "motivo": "ok"}
        estado_priv = {"vivo": True, "lectura_iso": RECIENTE, "etiqueta": "x", "motivo": "ok"}
        lista, _ = F.agregar_opcionales(LISTA_BASE, "sueno-mapa", entorno, estado_abl, estado_priv, AHORA)
        self.assertEqual(lista[: len(LISTA_BASE)], LISTA_BASE)

    def test_orden_opcionales_fijo_abliteration_antes_privado(self):
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_abl = {"permitido": True, "motivo": "ok"}
        estado_priv = {"vivo": True, "lectura_iso": RECIENTE, "etiqueta": "x", "motivo": "ok"}
        lista, _ = F.agregar_opcionales(LISTA_BASE, "sueno-mapa", entorno, estado_abl, estado_priv, AHORA)
        idx_abl = lista.index(("abliteration", "abliterated-model"))
        idx_priv = lista.index(("privado", "x"))
        self.assertLess(idx_abl, idx_priv)

    def test_mismo_orden_en_llamadas_repetidas(self):
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_abl = {"permitido": True, "motivo": "ok"}
        estado_priv = {"vivo": True, "lectura_iso": RECIENTE, "etiqueta": "x", "motivo": "ok"}
        l1, _ = F.agregar_opcionales(LISTA_BASE, "sueno-mapa", entorno, estado_abl, estado_priv, AHORA)
        l2, _ = F.agregar_opcionales(LISTA_BASE, "sueno-mapa", entorno, estado_abl, estado_priv, AHORA)
        self.assertEqual(l1, l2)


class EstadosNone(unittest.TestCase):
    """Manejo grácil cuando los estados vienen como None."""

    def test_estado_abliteration_none(self):
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_priv = {"vivo": True, "lectura_iso": RECIENTE, "etiqueta": "x", "motivo": "ok"}
        lista, fuera = F.agregar_opcionales(LISTA_BASE, "sueno-mapa", entorno, None, estado_priv, AHORA)
        self.assertNotIn(("abliteration", "abliterated-model"), lista)
        self.assertTrue(any("sin estado" in m for m in fuera))

    def test_estado_privado_none(self):
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_abl = {"permitido": True, "motivo": "ok"}
        lista, fuera = F.agregar_opcionales(LISTA_BASE, "sueno-mapa", entorno, estado_abl, None, AHORA)
        self.assertNotIn(("privado", "x"), lista)
        self.assertTrue(any("sin estado" in m for m in fuera))

    def test_ambos_none(self):
        entorno = {"STARSEED_ABLITERATION": "1"}
        lista, fuera = F.agregar_opcionales(LISTA_BASE, "sueno-mapa", entorno, None, None, AHORA)
        self.assertEqual(lista, LISTA_BASE)
        self.assertEqual(len(fuera), 2)


class RolesDesconocidos(unittest.TestCase):
    def test_rol_desconocido_devuelve_base_y_motivo(self):
        lista, fuera = F.agregar_opcionales(LISTA_BASE, "fantasma", {}, None, None, AHORA)
        self.assertEqual(lista, LISTA_BASE)
        self.assertTrue(any("desconocido" in m for m in fuera))


class ParseISO(unittest.TestCase):
    def test_parse_iso_z(self):
        dt = F._parse_iso("2026-11-16T12:00:00Z")
        self.assertEqual(dt.tzinfo, timezone.utc)
        self.assertEqual(dt.hour, 12)

    def test_parse_iso_offset(self):
        dt = F._parse_iso("2026-11-16T12:00:00+00:00")
        self.assertEqual(dt.tzinfo, timezone.utc)


if __name__ == "__main__":
    unittest.main()