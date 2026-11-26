# -*- coding: utf-8 -*-
"""Pruebas de sugerencias_potentes.py (CAP1126A): lógica pura, sin red ni lanzamiento.

Cubre: reparto por tipo de tarea, topes de cupo y que sin cupo no se sugiere.
"""
import json
import os
import sys
import tempfile
import time
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sugerencias_potentes as SP  # noqa: E402

AHORA = time.mktime((2026, 11, 26, 3, 0, 0, 0, 0, -1))


def _entrada(**kw):
    e = {"estado": "pendiente", "intentos_auto": 0, "t": "2026-11-25 10:00:00"}
    e.update(kw)
    return e


def _tarea(tid, titulo="Tarea", archivos=None, prioridad=None, urgente=None, capacidad=None):
    t = {"id": tid, "titulo": titulo}
    if archivos is not None:
        t["archivos"] = archivos
    if prioridad is not None:
        t["prioridad"] = prioridad
    if urgente is not None:
        t["urgente"] = urgente
    if capacidad is not None:
        t["capacidad"] = capacidad
    return t


def _cola(*tareas):
    return [("cola-test.json", list(tareas))]


def _ctx(**kw):
    ctx = {
        "cupo_claude_ok": True,
        "semana_pct": 30,
        "sesion_pct": 40,
        "cupo_ag": {m: {"disponible": True, "disponible_hoy": 10} for m in SP.MODELO_AG.values()},
        "cupo_explabs": False,
        "cupos_pago": {p: False for p in SP.DE_PAGO},
        "codex_habilitado": True,
    }
    ctx.update(kw)
    return ctx


class _AntigravityFalso:
    """Sustituye antigravity_flota en sys.modules para controlar la reserva."""

    def __init__(self, reserva):
        self.reserva = reserva

    def en_reserva(self, modelo):
        return bool(self.reserva.get(modelo, False))

    def estimar_cuota_diaria(self, modelo):
        return {"disponible_hoy": 0 if self.reserva.get(modelo) else 10}


def _instala_ag(reserva):
    mod = types.ModuleType("antigravity_flota")
    mod.en_reserva = _AntigravityFalso(reserva).en_reserva
    mod.estimar_cuota_diaria = _AntigravityFalso(reserva).estimar_cuota_diaria
    sys.modules["antigravity_flota"] = mod


class TestCandidatas(unittest.TestCase):
    def test_prioridad_alta_y_capacidad_es_candidata(self):
        t = _tarea("A", prioridad=100, capacidad="alta")
        self.assertTrue(SP.es_candidata(t, _entrada(), AHORA))

    def test_prioridad_baja_no_es_candidata_aunque_alta(self):
        t = _tarea("A", prioridad=50, capacidad="alta")
        self.assertFalse(SP.es_candidata(t, _entrada(), AHORA))

    def test_prioridad_exacto_90_es_candidata(self):
        t = _tarea("A", prioridad=90, capacidad="alta")
        self.assertTrue(SP.es_candidata(t, _entrada(), AHORA))

    def test_urgente_es_candidata(self):
        t = _tarea("A", urgente=True, capacidad="alta")
        self.assertTrue(SP.es_candidata(t, _entrada(), AHORA))

    def test_dos_fallos_es_candidata(self):
        t = _tarea("A", prioridad=95)
        self.assertTrue(SP.es_candidata(t, _entrada(estado="fallo", intentos_auto=3), AHORA))

    def test_horas_sin_turno_es_candidata(self):
        t = _tarea("A", prioridad=95)
        entrada = _entrada(t="2026-11-23 10:00:00")  # ~73 h antes
        self.assertTrue(SP.es_candidata(t, entrada, AHORA))

    def test_no_candidata_sin_nada(self):
        t = _tarea("A", prioridad=95)
        self.assertFalse(SP.es_candidata(t, _entrada(), AHORA))

    def test_candidatas_filtra_colas(self):
        colas = _cola(
            _tarea("A", prioridad=100, capacidad="alta"),
            _tarea("B", prioridad=10),  # sin prioridad
            _tarea("C", prioridad=95),  # sin nada más
        )
        got = SP.candidatas(colas, {"A": _entrada(), "B": _entrada(), "C": _entrada()}, AHORA)
        ids = [t["id"] for t, _ in got]
        self.assertEqual(ids, ["A"])


class TestClasificar(unittest.TestCase):
    def test_rust_nativo_por_extension(self):
        self.assertEqual(SP.clasificar_tarea(_tarea("A", archivos=["src/nativo.rs"]), _entrada()), "rust_nativo")

    def test_ui_typescript_por_extension(self):
        self.assertEqual(SP.clasificar_tarea(_tarea("A", archivos=["componente.tsx"]), _entrada()), "ui_typescript")

    def test_arquitectura_por_ruta(self):
        self.assertEqual(SP.clasificar_tarea(_tarea("A", archivos=["architecture/diseno.md"]), _entrada()), "arquitectura")

    def test_mecanico_por_titulo(self):
        self.assertEqual(SP.clasificar_tarea(_tarea("A", titulo="renombrar variables de entorno"), _entrada()), "mecanico")

    def test_fallo_dificil_tiene_precedencia(self):
        t = _tarea("A", archivos=["pantalla.tsx"], prioridad=100)
        self.assertEqual(SP.clasificar_tarea(t, _entrada(estado="fallo_tests", intentos_auto=4)), "fallo_dificil")

    def test_otro_por_defecto(self):
        self.assertEqual(SP.clasificar_tarea(_tarea("A", prioridad=95), _entrada()), "otro")


class TestElegirAgente(unittest.TestCase):
    def test_rust_usa_opus_alta(self):
        r = SP.elegir_agente("rust_nativo", _ctx())
        self.assertEqual(r, ("Antigravity", "claude-opus-5-5-high", SP.MOTIVO_AG["rust_nativo"],
                             SP.COSTE_AG, "10 llamada(s) hoy disponibles"))

    def test_ui_usa_neon(self):
        r = SP.elegir_agente("ui_typescript", _ctx())
        self.assertEqual((r[0], r[1]), ("Antigravity", "gemini-4-neon-high"))

    def test_arquitectura_usa_hydrogen_xhigh(self):
        r = SP.elegir_agente("arquitectura", _ctx())
        self.assertEqual((r[0], r[1]), ("Antigravity", "gemini-4-hydrogen-xhigh"))

    def test_mecanico_usa_flash(self):
        r = SP.elegir_agente("mecanico", _ctx())
        self.assertEqual((r[0], r[1]), ("Antigravity", "gemini-3.8-flash"))

    def test_sin_cupo_en_nada_devuelve_none(self):
        ctx = _ctx(cupo_ag={m: {"disponible": False, "disponible_hoy": 0} for m in SP.MODELO_AG.values()},
                   cupo_claude_ok=False, cupo_explabs=False, codex_habilitado=False,
                   cupos_pago={p: False for p in SP.DE_PAGO})
        self.assertIsNone(SP.elegir_agente("rust_nativo", ctx))

    def test_fallback_claude_mac_cuando_ag_en_reserva(self):
        ctx = _ctx(cupo_ag={"claude-opus-5-5-high": {"disponible": False, "disponible_hoy": 0}})
        r = SP.elegir_agente("rust_nativo", ctx)
        self.assertEqual(r[0], "Claude Code (Mac)")
        self.assertTrue(r[4].startswith("semana"))

    def test_pago_solo_con_cupo(self):
        ctx = _ctx(cupo_ag={m: {"disponible": False, "disponible_hoy": 0} for m in SP.MODELO_AG.values()},
                   cupo_claude_ok=False, cupo_explabs=False, codex_habilitado=False,
                   cupos_pago={"xai": True, "deepseek": False, "anthropic": False, "openai": False})
        r = SP.elegir_agente("otro", ctx)
        self.assertEqual(r[0], "pago: xai")
        self.assertIn("xai", r[4])

    def test_sin_cupo_pago_no_se_sugiere(self):
        ctx = _ctx(cupo_ag={m: {"disponible": False, "disponible_hoy": 0} for m in SP.MODELO_AG.values()},
                   cupo_claude_ok=False, cupo_explabs=False, codex_habilitado=False,
                   cupos_pago={p: False for p in SP.DE_PAGO})
        self.assertIsNone(SP.elegir_agente("otro", ctx))


class TestSugerencias(unittest.TestCase):
    def test_separa_sugeridas_y_sin_cupo(self):
        colas = _cola(
            _tarea("A", prioridad=100, capacidad="alta"),
            _tarea("B", prioridad=95),
        )
        prog = {"A": _entrada(), "B": _entrada(estado="fallo", intentos_auto=3)}
        ctx = _ctx(cupo_ag={m: {"disponible": False, "disponible_hoy": 0} for m in SP.MODELO_AG.values()},
                   cupo_claude_ok=False, cupo_explabs=False, codex_habilitado=False,
                   cupos_pago={p: False for p in SP.DE_PAGO})
        sugs, sin = SP.sugerencias(colas, prog, ctx, AHORA)
        self.assertEqual(sugs, [])
        self.assertEqual(sorted(s["id"] for s in sin), ["A", "B"])

    def test_una_sugerida_con_modo_plan(self):
        colas = _cola(_tarea("A", prioridad=100, capacidad="alta"))
        sugs, sin = SP.sugerencias(colas, {"A": _entrada()}, _ctx(), AHORA, modo="plan")
        self.assertEqual(len(sugs), 1)
        self.assertEqual(sugs[0]["id"], "A")
        self.assertEqual(sugs[0]["modo"], "plan")
        self.assertEqual(sin, [])

    def test_modo_escribir(self):
        colas = _cola(_tarea("A", prioridad=100, capacidad="alta"))
        sugs, _ = SP.sugerencias(colas, {"A": _entrada()}, _ctx(), AHORA, modo="escribir")
        self.assertEqual(sugs[0]["modo"], "escribir")


class TestGuardarYTexto(unittest.TestCase):
    def test_guardar_escribe_json(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "sug.json")
            datos = SP.guardar_sugerencias(ruta, [{"id": "A"}], [{"id": "B"}])
            self.assertEqual(datos["total"], 1)
            with open(ruta, encoding="utf-8") as f:
                grabado = json.load(f)
            self.assertEqual(grabado["sugerencias"], [{"id": "A"}])
            self.assertEqual(grabado["sin_cupo"], [{"id": "B"}])
            self.assertIn("prioridad ≥ 90", grabado["regla"])

    def test_texto_linea(self):
        sugs = [{"tipo": "ui_typescript", "modelo": "gemini-4-neon-high", "modo": "plan"}]
        t = SP.texto_linea(sugs, [])
        self.assertIn("1 sugerencia(s)", t)
        self.assertIn("ui_typescript→gemini-4-neon-high (plan)", t)
        t2 = SP.texto_linea([], [])
        self.assertEqual(t2, "Agentes potentes: sin candidatas con prioridad ≥ 90")
        t3 = SP.texto_linea([], [{"id": "Z"}, {"id": "Y"}])
        self.assertIn("2 sin cupo (Z, Y)", t3)


class TestContextoDisco(unittest.TestCase):
    def test_claude_semana_sobre_85_sin_cupo(self):
        with tempfile.TemporaryDirectory() as d:
            limites = os.path.join(d, "limites.json")
            ahora_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(AHORA))
            with open(limites, "w", encoding="utf-8") as f:
                json.dump({"lecturas": [{"t": ahora_iso, "semana_pct": 90, "sesion_pct": 10}]}, f)
            with mock.patch.object(SP, "RUTA_LIMITES_CLAUDE", limites):
                _instala_ag({})
                ctx = SP.contexto_desde_disco(AHORA)
                self.assertFalse(ctx["cupo_claude_ok"])

    def test_claude_semana_bajo_85_con_cupo(self):
        with tempfile.TemporaryDirectory() as d:
            limites = os.path.join(d, "limites.json")
            ahora_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(AHORA))
            with open(limites, "w", encoding="utf-8") as f:
                json.dump({"lecturas": [{"t": ahora_iso, "semana_pct": 30, "sesion_pct": 40}]}, f)
            with mock.patch.object(SP, "RUTA_LIMITES_CLAUDE", limites):
                _instala_ag({})
                ctx = SP.contexto_desde_disco(AHORA)
                self.assertTrue(ctx["cupo_claude_ok"])

    def test_ag_en_reserva_no_tiene_cupo(self):
        with tempfile.TemporaryDirectory() as d:
            limites = os.path.join(d, "limites.json")
            ahora_iso = time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(AHORA))
            with open(limites, "w", encoding="utf-8") as f:
                json.dump({"lecturas": [{"t": ahora_iso, "semana_pct": 30, "sesion_pct": 40}]}, f)
            with mock.patch.object(SP, "RUTA_LIMITES_CLAUDE", limites):
                _instala_ag({"claude-opus-5-5-high": True})
                ctx = SP.contexto_desde_disco(AHORA)
                self.assertFalse(ctx["cupo_ag"]["claude-opus-5-5-high"]["disponible"])

    def test_pasarelas_sin_archivo_sin_cupo_pago(self):
        _instala_ag({})
        with mock.patch.object(SP, "RUTA_PASARELAS", "/no/existe/pasarelas-informe.json"):
            ctx = SP.contexto_desde_disco(AHORA)
            self.assertFalse(ctx["cupo_explabs"])
            self.assertTrue(all(v is False for v in ctx["cupos_pago"].values()))


class TestSugerenciasDeOlas(unittest.TestCase):
    def test_lee_colas_y_progreso_de_disco(self):
        with tempfile.TemporaryDirectory() as d:
            olas = os.path.join(d, "olas")
            os.makedirs(olas)
            with open(os.path.join(olas, "cola-test.json"), "w", encoding="utf-8") as f:
                json.dump({"tareas": [_tarea("A", prioridad=100, capacidad="alta")]}, f)
            with open(os.path.join(d, "progreso.json"), "w", encoding="utf-8") as f:
                json.dump({"A": _entrada()}, f)
            sugs, sin = SP.sugerencias_de_olas(olas, os.path.join(d, "progreso.json"), _ctx(), AHORA)
            self.assertEqual(len(sugs), 1)
            self.assertEqual(sugs[0]["id"], "A")


if __name__ == "__main__":
    unittest.main()
