#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para los nuevos proveedores en medios_disponibles.py (CAP1119C)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medios_disponibles as M  # noqa: E402


class AbliterationTest(unittest.TestCase):
    def test_sin_datos_requiere_alex(self):
        d = M.clasificar_abliteration(None, 1_000_000.0)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("abliteration.py", d["siguiente_paso"])

    def test_saldo_cero_requiere_alex(self):
        d = M.clasificar_abliteration({"saldo_usd": 0.0}, 1_000_000.0)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("agotado", d["detalle"])

    def test_saldo_positivo_listo(self):
        d = M.clasificar_abliteration({"saldo_usd": 10.0, "gastado_total_usd": 0.1}, 1_000_000.0)
        self.assertEqual(d["estado"], "listo")
        self.assertIn("10.00 USD", d["detalle"])

    def test_cerca_tope_usable(self):
        # Con tope por defecto 0.50, gastado 0.45 = 90% -> usable
        d = M.clasificar_abliteration({"saldo_usd": 10.0, "gastado_total_usd": 0.45}, 1_000_000.0)
        self.assertEqual(d["estado"], "usable")
        self.assertIn("cerca del tope", d["detalle"])


class OllamaA1Test(unittest.TestCase):
    def test_sin_oracle_requiere_alex(self):
        d = M.clasificar_ollama_a1(None, 1_000_000.0)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("oracle_desplegar", d["siguiente_paso"])

    def test_oracle_vinculada_sin_a1_requiere_alex(self):
        datos = {"vinculada": True, "instancias": []}
        d = M.clasificar_ollama_a1(datos, 1_000_000.0)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("oracle_desplegar", d["siguiente_paso"])

    def test_a1_running_sin_nodo_usable(self):
        A1 = {"nombre": "starseed-a1", "forma": "VM.Standard.A1.Flex", "estado": "RUNNING"}
        datos = {"vinculada": True, "instancias": [A1], "nodo": {}}
        d = M.clasificar_ollama_a1(datos, 1_000_000.0)
        self.assertEqual(d["estado"], "usable")
        self.assertIn("no anuncia latido fresco", d["detalle"])

    def test_a1_running_con_nodo_vivo_listo(self):
        A1 = {"nombre": "starseed-a1", "forma": "VM.Standard.A1.Flex", "estado": "RUNNING"}
        ahora = 1_000_000.0
        datos = {"vinculada": True, "instancias": [A1], "nodo": {"vivo": True, "latido": ahora - 60, "fase": "escribiendo"}}
        d = M.clasificar_ollama_a1(datos, ahora)
        self.assertEqual(d["estado"], "listo")
        self.assertIn("nodo MetaGenesis vivo", d["detalle"])


class CodexTest(unittest.TestCase):
    def test_sin_marca_listo(self):
        # Mock cupo_codex.leer para que devuelva dict vacio (sin marca)
        import cupo_codex
        original_leer = cupo_codex.leer
        cupo_codex.leer = lambda ruta=None: {}
        try:
            d = M.clasificar_codex(None, 1_000_000.0)
            self.assertEqual(d["estado"], "listo")
            self.assertIn("sin marca", d["detalle"])
        finally:
            cupo_codex.leer = original_leer

    def test_marca_vencida_listo(self):
        # Marca de hace 4 horas (ya vencida, 3h de separacion)
        marca = {"hasta": 1_000_000.0 - 4 * 3600, "motivo": "cuota"}
        d = M.clasificar_codex(marca, 1_000_000.0)
        self.assertEqual(d["estado"], "listo")

    def test_marca_vigente_usable(self):
        # Marca vigente por 1 hora mas
        marca = {"hasta": 1_000_000.0 + 3600, "motivo": "cuota"}
        d = M.clasificar_codex(marca, 1_000_000.0)
        self.assertEqual(d["estado"], "usable")
        self.assertIn("vuelve en", d["detalle"])


class OpenCodeZenTest(unittest.TestCase):
    def test_sin_config_no_disponible(self):
        d = M.clasificar_opencode_zen(None)
        self.assertEqual(d["estado"], "no_disponible")
        self.assertIn("opencode.json no encontrado", d["detalle"])

    def test_config_sin_zen_usable(self):
        config = {"provider": {"nvidia": {"options": {}}}}
        d = M.clasificar_opencode_zen(config)
        self.assertEqual(d["estado"], "usable")
        self.assertIn("sin modelos Zen", d["detalle"])

    def test_config_con_zen_listo(self):
        config = {"provider": {"zen": {"options": {"model": "glm-5.3-flash-free"}}}}
        d = M.clasificar_opencode_zen(config)
        self.assertEqual(d["estado"], "listo")
        self.assertIn("configurado con modelos Zen", d["detalle"])


class ExperientialLabsTest(unittest.TestCase):
    def test_sin_estado_requiere_alex(self):
        d = M.clasificar_explabs(None, 1_000_000.0)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("explabs_promos.py", d["siguiente_paso"])

    def test_estado_sin_promos_usable(self):
        estado = {"hecho": True, "decisiones_gratis": [], "chat_gratis": [], "chat_promocion": []}
        d = M.clasificar_explabs(estado, 1_000_000.0)
        self.assertEqual(d["estado"], "usable")
        self.assertIn("sin promociones activas", d["detalle"])

    def test_con_decisiones_gratis_listo(self):
        estado = {"hecho": True, "decisiones_gratis": ["jev-latest", "clef-flash"], "chat_gratis": [], "chat_promocion": []}
        d = M.clasificar_explabs(estado, 1_000_000.0)
        self.assertEqual(d["estado"], "listo")
        self.assertIn("jev-latest", d["detalle"])
        self.assertIn("clef-flash", d["detalle"])

    def test_con_chat_gratis_listo(self):
        estado = {"hecho": True, "decisiones_gratis": [], "chat_gratis": ["deepseek-v4-flash"], "chat_promocion": []}
        d = M.clasificar_explabs(estado, 1_000_000.0)
        self.assertEqual(d["estado"], "listo")
        self.assertIn("deepseek-v4-flash", d["detalle"])

    def test_con_chat_promo_listo(self):
        estado = {"hecho": True, "decisiones_gratis": [], "chat_gratis": [], "chat_promocion": [{"slug": "clef", "descuento": 50}]}
        d = M.clasificar_explabs(estado, 1_000_000.0)
        self.assertEqual(d["estado"], "listo")
        self.assertIn("clef (-50%)", d["detalle"])


class LimpiarMediosTest(unittest.TestCase):
    def setUp(self):
        self.ahora = 1_000_000.0
        self.medios_base = {
            "codex:mac:mac:30929": {"latido": self.ahora - 100, "capacidad": 2, "carga": 1},
            "codex:mac:mac:30930": {"latido": self.ahora - 200, "capacidad": 2, "carga": 0},
            "codex:mac:mac:30931": {"latido": self.ahora - 50, "capacidad": 2, "carga": 1},
            "opencode:mac:mac:1949": {"latido": self.ahora - 7000, "capacidad": 1, "carga": 0},  # inactivo
            "opencode:mac:mac:1950": {"latido": self.ahora - 100, "capacidad": 1, "carga": 1},
            "opencode:mac:mac:1951": {"latido": self.ahora - 50, "capacidad": 1, "carga": 0},
            "opencode:nube:hermes:9013": {"latido": self.ahora - 100, "capacidad": 3, "carga": 2},
            "codex:nube:hermes:9013": {"latido": self.ahora - 7000, "capacidad": 2, "carga": 0},  # inactivo
        }

    def test_agrupa_codex_mac_por_puerto_mayor(self):
        import limpiar_medios as L
        nuevos, acciones = L._filtrar_medios(self.medios_base, self.ahora)
        # Debe conservar solo codex:mac:mac:30931 (puerto mayor, latido fresco)
        self.assertIn("codex:mac:mac:30931", nuevos)
        self.assertNotIn("codex:mac:mac:30929", nuevos)
        self.assertNotIn("codex:mac:mac:30930", nuevos)
        # Verificar que se menciona en acciones
        self.assertTrue(any("conservo codex:mac:mac:30931" in a for a in acciones))
        self.assertTrue(any("elimino duplicado" in a for a in acciones))

    def test_agrupa_opencode_mac_por_puerto_mayor(self):
        import limpiar_medios as L
        nuevos, acciones = L._filtrar_medios(self.medios_base, self.ahora)
        # Debe conservar solo opencode:mac:mac:1951 (puerto mayor, latido fresco)
        # opencode:mac:mac:1949 esta inactivo (latido viejo)
        self.assertIn("opencode:mac:mac:1951", nuevos)
        self.assertNotIn("opencode:mac:mac:1950", nuevos)
        self.assertNotIn("opencode:mac:mac:1949", nuevos)

    def test_conserva_otros_tipos(self):
        import limpiar_medios as L
        nuevos, _ = L._filtrar_medios(self.medios_base, self.ahora)
        # opencode:nube:hermes:9013 debe conservarse (tipo distinto)
        self.assertIn("opencode:nube:hermes:9013", nuevos)
        # codex:nube:hermes:9013 esta inactivo, no se conserva
        self.assertNotIn("codex:nube:hermes:9013", nuevos)

    def test_elimina_inactivos(self):
        import limpiar_medios as L
        medios_con_inactivos = {
            "codex:mac:mac:1111": {"latido": self.ahora - 7000, "capacidad": 1, "carga": 0},  # inactivo
        }
        nuevos, acciones = L._filtrar_medios(medios_con_inactivos, self.ahora)
        self.assertEqual(len(nuevos), 0)
        self.assertTrue(any("inactivo" in a for a in acciones))

    def test_limpiar_seco_no_escribe(self):
        import limpiar_medios as L
        import tempfile
        import os

        # Crear archivo temporal
        d = tempfile.mkdtemp()
        ruta = os.path.join(d, "medios.json")
        backup_dir = os.path.join(d, "backups")
        with open(ruta, "w") as f:
            json.dump({"generado": "2026-01-01T00:00:00", "medios": self.medios_base}, f)

        # Usar la funcion de test para cambiar rutas
        antes_m, antes_b = L._set_rutas_para_test(ruta, backup_dir)
        try:
            r = L.limpiar(seco=True, ahora=self.ahora)
            self.assertTrue(r.get("seco"))
            self.assertEqual(r["antes"], 8)
            # codex:mac:mac -> 1 (30931), opencode:mac:mac -> 1 (1951), opencode:nube:hermes -> 1 = 3
            self.assertEqual(r["despues"], 3)
        finally:
            L._set_rutas_para_test(antes_m, antes_b)

    def test_ver_muestra_estado(self):
        import limpiar_medios as L
        import tempfile
        import os

        d = tempfile.mkdtemp()
        ruta = os.path.join(d, "medios.json")
        with open(ruta, "w") as f:
            json.dump({"generado": "2026-01-01T00:00:00", "medios": self.medios_base}, f)

        antes_m, antes_b = L._set_rutas_para_test(ruta, None)
        try:
            r = L.ver()
            self.assertTrue(r["existe"])
            self.assertEqual(r["total"], 8)
            self.assertIn("codex:mac:mac", r["por_tipo"])
            self.assertIn("opencode:mac:mac", r["por_tipo"])
        finally:
            L._set_rutas_para_test(antes_m, antes_b)


if __name__ == "__main__":
    unittest.main()