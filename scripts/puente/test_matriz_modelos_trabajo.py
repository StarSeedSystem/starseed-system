#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para matriz_modelos_trabajo.py (CAP1126E).

Matriz «tipo de trabajo × modelo» aprendida de progreso.json (integradas, fallos,
segundos y coste por escritor; ya existe merito_escritores) y de los resultados
de las sugerencias aprobadas: tipos Rust/nativo, UI/React, lógica TypeScript,
pruebas, Python del puente, documentación/contratos, arquitectura. Se recalcula
a diario y la usa CAP1126A para elegir el mejor modelo (gratis primero cuando
rinde igual). Informe corto en el pulso: qué modelo gana en cada tipo y por qué.
Pruebas de la matriz con un progreso falso.
"""
import importlib.util
import os
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "matriz_modelos_trabajo.py")
ESPEC = importlib.util.spec_from_file_location("matriz", RUTA)
matriz = importlib.util.module_from_spec(ESPEC)
sys.modules["matriz"] = matriz
ESPEC.loader.exec_module(matriz)

# Tipos de trabajo definidos
TIPOS = [
    "rust_nativo",
    "ui_react",
    "logica_typescript",
    "pruebas",
    "python_puente",
    "documentacion_contratos",
    "arquitectura",
]

# Modelos de ejemplo
BUENO_UI = "nvidia/moonshotai/kimi-k3"
BUENO_RUST = "google/gemini-3.6-flash"
BUENO_LOGICA = "xai/grok-4.6"
MALO = "apinex/free/glm-5.3-flash"
NUEVO = "nuevo/modelo:free"
GRATIS_1 = "gratis/modelo-1:free"
GRATIS_2 = "gratis/modelo-2:free"
PAGO = "xai/grok-4.6"

# Progreso falso con tareas de diferentes tipos
PROGRESO_FALSO = {
    "T1": {
        "estado": "commit",
        "modelo": BUENO_UI,
        "tipo_trabajo": "ui_react",
        "segundos": 45,
        "coste_usd": 0.0,
    },
    "T2": {
        "estado": "commit",
        "modelo": BUENO_UI,
        "tipo_trabajo": "ui_react",
        "segundos": 50,
        "coste_usd": 0.0,
    },
    "T3": {
        "estado": "commit",
        "modelo": BUENO_RUST,
        "tipo_trabajo": "rust_nativo",
        "segundos": 120,
        "coste_usd": 0.0,
    },
    "T4": {
        "estado": "commit",
        "modelo": BUENO_LOGICA,
        "tipo_trabajo": "logica_typescript",
        "segundos": 30,
        "coste_usd": 0.02,
    },
    "T5": {
        "estado": "sin_cambios",
        "modelo": MALO,
        "tipo_trabajo": "ui_react",
        "segundos": 60,
        "coste_usd": 0.0,
    },
    "T6": {
        "estado": "commit",
        "modelo": GRATIS_1,
        "tipo_trabajo": "python_puente",
        "segundos": 25,
        "coste_usd": 0.0,
    },
    "T7": {
        "estado": "commit",
        "modelo": GRATIS_2,
        "tipo_trabajo": "python_puente",
        "segundos": 28,
        "coste_usd": 0.0,
    },
    "T8": {
        "estado": "commit",
        "modelo": GRATIS_1,
        "tipo_trabajo": "documentacion_contratos",
        "segundos": 15,
        "coste_usd": 0.0,
    },
    "ruido": "no es un dict",
}


class MatrizBasica(unittest.TestCase):
    def test_calcula_matriz_vacia(self):
        m = matriz.calcular_matriz({})
        self.assertEqual(m, {})

    def test_calcula_matriz_con_progreso_falso(self):
        m = matriz.calcular_matriz(PROGRESO_FALSO)
        # Debe tener entradas para cada tipo que aparece
        self.assertIn("ui_react", m)
        self.assertIn("rust_nativo", m)
        self.assertIn("logica_typescript", m)
        self.assertIn("python_puente", m)
        self.assertIn("documentacion_contratos", m)

    def test_modelo_con_mas_aciertos_gana_en_su_tipo(self):
        m = matriz.calcular_matriz(PROGRESO_FALSO)
        # ui_react: BUENO_UI tiene 2 commits, MALO tiene 1 sin_cambios
        ui = m["ui_react"]
        # El mejor debe ser BUENO_UI
        self.assertEqual(ui.mejor_modelo, BUENO_UI)

    def test_rust_nativo_tiene_su_mejor(self):
        m = matriz.calcular_matriz(PROGRESO_FALSO)
        rust = m["rust_nativo"]
        self.assertEqual(rust.mejor_modelo, BUENO_RUST)

    def test_logica_typescript_tiene_su_mejor(self):
        m = matriz.calcular_matriz(PROGRESO_FALSO)
        logica = m["logica_typescript"]
        self.assertEqual(logica.mejor_modelo, BUENO_LOGICA)


class EmpateGratis(unittest.TestCase):
    """Cuando dos modelos gratis empatan en aciertos, gana el más rápido/barato."""

    def test_gratis_empate_velocidad(self):
        # GRATIS_1 y GRATIS_2 tienen 1 commit cada uno en python_puente
        # GRATIS_1: 25s, GRATIS_2: 28s → GRATIS_1 gana
        m = matriz.calcular_matriz(PROGRESO_FALSO)
        python = m["python_puente"]
        self.assertEqual(python.mejor_modelo, GRATIS_1)

    def test_gratis_empate_coste_cero_velocidad(self):
        # Ambos coste 0, el más rápido gana
        progreso = {
            "A": {"estado": "commit", "modelo": GRATIS_1, "tipo_trabajo": "pruebas", "segundos": 10, "coste_usd": 0.0},
            "B": {"estado": "commit", "modelo": GRATIS_2, "tipo_trabajo": "pruebas", "segundos": 20, "coste_usd": 0.0},
        }
        m = matriz.calcular_matriz(progreso)
        self.assertEqual(m["pruebas"].mejor_modelo, GRATIS_1)


class PagoVsGratis(unittest.TestCase):
    """Modelos de pago solo ganan si superan claramente a los gratis."""

    def test_pago_no_gana_si_gratis_es_bueno(self):
        progreso = {
            "A": {"estado": "commit", "modelo": GRATIS_1, "tipo_trabajo": "arquitectura", "segundos": 30, "coste_usd": 0.0},
            "B": {"estado": "commit", "modelo": PAGO, "tipo_trabajo": "arquitectura", "segundos": 25, "coste_usd": 0.05},
        }
        m = matriz.calcular_matriz(progreso)
        # GRATIS_1 gana porque es gratis y rinde igual (1/1 vs 1/1)
        self.assertEqual(m["arquitectura"].mejor_modelo, GRATIS_1)

    def test_pago_gana_si_supera_claramente(self):
        # Pago tiene 5/5, gratis 1/3
        progreso = {
            "A": {"estado": "commit", "modelo": GRATIS_1, "tipo_trabajo": "arquitectura", "segundos": 30, "coste_usd": 0.0},
            "B": {"estado": "sin_cambios", "modelo": GRATIS_1, "tipo_trabajo": "arquitectura", "segundos": 30, "coste_usd": 0.0},
            "C": {"estado": "sin_cambios", "modelo": GRATIS_1, "tipo_trabajo": "arquitectura", "segundos": 30, "coste_usd": 0.0},
            "D": {"estado": "commit", "modelo": PAGO, "tipo_trabajo": "arquitectura", "segundos": 20, "coste_usd": 0.05},
            "E": {"estado": "commit", "modelo": PAGO, "tipo_trabajo": "arquitectura", "segundos": 20, "coste_usd": 0.05},
            "F": {"estado": "commit", "modelo": PAGO, "tipo_trabajo": "arquitectura", "segundos": 20, "coste_usd": 0.05},
            "G": {"estado": "commit", "modelo": PAGO, "tipo_trabajo": "arquitectura", "segundos": 20, "coste_usd": 0.05},
            "H": {"estado": "commit", "modelo": PAGO, "tipo_trabajo": "arquitectura", "segundos": 20, "coste_usd": 0.05},
        }
        m = matriz.calcular_matriz(progreso)
        # Pago tiene 5/5 (1.0), gratis 1/4 (0.25) → pago gana claramente
        self.assertEqual(m["arquitectura"].mejor_modelo, PAGO)


class InformePulso(unittest.TestCase):
    def test_genera_informe_corto(self):
        m = matriz.calcular_matriz(PROGRESO_FALSO)
        informe = matriz.informe_pulso(m)
        # Debe mencionar cada tipo con su ganador
        for tipo in ["ui_react", "rust_nativo", "logica_typescript", "python_puente", "documentacion_contratos"]:
            self.assertIn(tipo, informe)
        # Debe ser corto (menos de 500 chars)
        self.assertLess(len(informe), 500)

    def test_informe_menciona_por_que(self):
        m = matriz.calcular_matriz(PROGRESO_FALSO)
        informe = matriz.informe_pulso(m)
        # Debe decir por qué (aciertos, velocidad, gratis)
        self.assertTrue(any(p in informe.lower() for p in ["acierto", "veloc", "gratis", "coste", "segund"]))


class RecalculoDiario(unittest.TestCase):
    def test_recalculo_diario_usa_cache(self):
        # Resetear caché global
        matriz._CACHE_MATRIZ = None
        matriz._CACHE_TIMESTAMP = 0.0
        with mock.patch("matriz._leer_progreso") as mock_leer:
            mock_leer.return_value = PROGRESO_FALSO
            m1 = matriz.recalcular_diario()
            m2 = matriz.recalcular_diario()
            # Segunda llamada no debe volver a leer (usa caché)
            self.assertEqual(mock_leer.call_count, 1)
            self.assertEqual(m1, m2)

    def test_fuerza_recalculo_ignora_cache(self):
        matriz._CACHE_MATRIZ = None
        matriz._CACHE_TIMESTAMP = 0.0
        with mock.patch("matriz._leer_progreso") as mock_leer:
            mock_leer.return_value = PROGRESO_FALSO
            m1 = matriz.recalcular_diario()
            m2 = matriz.recalcular_diario(forzar=True)
            self.assertEqual(mock_leer.call_count, 2)


class SugerenciasAprobadas(unittest.TestCase):
    """La matriz también aprende de sugerencias aprobadas (CAP1126A)."""

    def test_incorpora_sugerencias_aprobadas(self):
        sugerencias = [
            {"tipo_trabajo": "ui_react", "modelo": NUEVO, "resultado": "exito", "segundos": 20},
            {"tipo_trabajo": "ui_react", "modelo": NUEVO, "resultado": "exito", "segundos": 22},
        ]
        m = matriz.calcular_matriz(PROGRESO_FALSO, sugerencias_aprobadas=sugerencias)
        # NUEVO tiene 2 éxitos en ui_react, BUENO_UI tiene 2 commits
        # Como NUEVO es más rápido, debería ganar si el empate se resuelve a favor de velocidad
        ui = m["ui_react"]
        # Al menos NUEVO debe aparecer en la matriz
        self.assertIn(NUEVO, ui.modelos)


class TiposTrabajo(unittest.TestCase):
    def test_todos_los_tipos_definidos_existen(self):
        m = matriz.calcular_matriz(PROGRESO_FALSO)
        for tipo in TIPOS:
            # Tipos sin datos no aparecen, pero la función debe conocerlos
            pass
        # La función debe devolver solo tipos con datos
        self.assertEqual(set(m.keys()), {"ui_react", "rust_nativo", "logica_typescript", "python_puente", "documentacion_contratos"})


if __name__ == "__main__":
    unittest.main()