# -*- coding: utf-8 -*-
"""Pruebas unitarias del módulo flota_opcional (MOD1116).

Cobertura: tabla rol × estado; ninguna mutación de la lista de entrada;
orden estable. Ninguna llama a la red.
"""

import unittest
from datetime import datetime, timedelta

from scripts.enjambre.flota_opcional import agregar_opcionales


LISTA_BASE = [
    ("llm7", "gpt-oss"),
    ("nim", "minimaxai/minimax-m3.1-flash"),
    ("xkiro", "minimax/minimax-m2.7-highspeed:free"),
]


class TestAgregarOpcionales(unittest.TestCase):

    # ── roles que bloquean ──────────────────────────────────────

    def test_rol_escritor_no_agrega(self):
        """rol 'escritor' → lista sale igual, con motivo."""
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "escritor", {}, {"permitido": True}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertEqual(resultado, LISTA_BASE)
        self.assertIn("escritura", motivos[0])

    def test_rol_revisor_no_agrega(self):
        """rol 'revisor' → lista sale igual."""
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "revisor", {}, {"permitido": True}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertEqual(resultado, LISTA_BASE)

    # ── roles permitidos ────────────────────────────────────────

    def test_rol_suenomapa_sin_abliteration(self):
        """rol 'sueno-mapa' sin STARSEED_ABLITERATION → abliteration no entra."""
        entorno = {}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-mapa", entorno, {"permitido": True}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("abliteration",), [x[0] for x in resultado])
        self.assertTrue(
            any("STARSEED_ABLITERATION" in m for m in motivos),
        )

    def test_rol_suenomapa_sin_creditos(self):
        """rol 'sueno-mapa' con STARSEED_ABLITERATION=1 pero sin créditos."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-mapa", entorno, {"permitido": False}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("abliteration",), [x[0] for x in resultado])
        self.assertTrue(
            any("créditos" in m for m in motivos),
        )

    def test_rol_suenomapa_permite_conjunto(self):
        """rol 'sueno-mapa' con todo ok → ambos opcionales al final."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_privado = {"vivo": True, "ultima_lectura": "2026-11-16T09:55:00"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-mapa", entorno, {"permitido": True}, estado_privado,
            "2026-11-16T10:00:00",
        )
        self.assertIn(("abliteration", "abliterated-model"), resultado)
        self.assertIn(("privado", "lectura"), resultado)
        self.assertEqual(motivos, [])

    def test_rol_suedireccion_privado_bloqueado(self):
        """rol 'direccion' → privado NUNCA se agrega, aunque vivo y reciente."""
        entorno = {}
        estado_privado = {"vivo": True, "ultima_lectura": "2026-11-16T09:55:00"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "direccion", entorno, {"permitido": True}, estado_privado,
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("privado",), [x[0] for x in resultado])
        self.assertTrue(
            any("direccion" in m for m in motivos),
        )

    def test_rol_suenoreduce_sin_creditos(self):
        """rol 'sueno-reduce' sin créditos abliteration."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-reduce", entorno, {"permitido": False}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("abliteration",), [x[0] for x in resultado])

    def test_rol_suenocontraste_sin_abliteration(self):
        """rol 'sueno-contraste' sin STARSEED_ABLITERATION."""
        entorno = {}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-contraste", entorno, {"permitido": True}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("abliteration",), [x[0] for x in resultado])

    def test_rol_sintesis_con_todo(self):
        """rol 'sintesis' con todo ok → ambos opcionales al final."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_privado = {"vivo": True, "ultima_lectura": "2026-11-16T09:55:00"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sintesis", entorno, {"permitido": True}, estado_privado,
            "2026-11-16T10:00:00",
        )
        self.assertEqual(resultado[:3], LISTA_BASE)  # original preserved + order
        self.assertEqual(resultado[3], ("abliteration", "abliterated-model"))
        self.assertEqual(resultado[4], ("privado", "lectura"))
        self.assertEqual(motivos, [])

    # ── sin mutación de la lista de entrada ─────────────────────

    def test_sin_mutacion_siempre(self):
        """la lista de entrada nunca se muta, en cualquier rol/estado."""
        original = LISTA_BASE.copy()
        test_cases = [
            ("escritor", {}),
            ("revisor", {"STARSEED_ABLITERATION": "1"}),
            ("sueno-mapa", {"STARSEED_ABLITERATION": "1"}),
            ("direccion", {}),
        ]
        for rol, kwargs in test_cases:
            with self.subTest(rol=rol):
                entorno = kwargs.get("entorno", {})
                estado_ablit = kwargs.get("estado_abliteration", {"permitido": True})
                estado_priv = kwargs.get("estado_privado", {"vivo": True})
                ahora = kwargs.get("ahora_iso", "2026-11-16T10:00:00")
                resultado, _ = agregar_opcionales(
                    LISTA_BASE, rol, entorno, estado_ablit, estado_priv, ahora,
                )
                self.assertEqual(LISTA_BASE, original, f"mutó la lista para rol {rol}")
                original = LISTA_BASE.copy()

    # ── orden estable de la lista original ──────────────────────

    def test_orden_estable_sempre(self):
        """el orden de la lista original se preserva siempre."""
        for rol in ["sueno-mapa", "sueno-reduce", "sueno-contraste", "sintesis"]:
            with self.subTest(rol=rol):
                entorno = {"STARSEED_ABLITERATION": "1"}
                resultado, _ = agregar_opcionales(
                    LISTA_BASE, rol, entorno, {"permitido": True},
                    {"vivo": True}, "2026-11-16T10:00:00",
                )
                self.assertEqual(resultado[:3], LISTA_BASE)

    # ── pruebas específicas del abliteración ────────────────────

    def test_abliteration_con_starseed_y_creditos(self):
        """STARSEED_ABLITERATION=1 + creditos ok → abliteration se agrega al final."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-mapa", entorno, {"permitido": True}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertIn(("abliteration", "abliterated-model"), resultado)
        self.assertEqual(resultado[-1], ("abliteration", "abliterated-model"))

    def test_abliteration_sin_starseed(self):
        """sin STARSEED_ABLITERATION → abliteration no entra."""
        entorno = {}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-mapa", entorno, {"permitido": True}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("abliteration",), [x[0] for x in resultado])
        self.assertTrue(
            any("STARSEED_ABLITERATION" in m for m in motivos),
        )

    def test_abliteration_sin_creditos(self):
        """con STARSEED_ABLITERATION=1 pero sin créditos → no entra."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-mapa", entorno, {"permitido": False}, {"vivo": True},
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("abliteration",), [x[0] for x in resultado])
        self.assertTrue(
            any("créditos" in m for m in motivos),
        )

    # ── pruebas específicas del modo privado ────────────────────

    def test_privado_vivo_y_reciente_se_agrega(self):
        """rol no direccion, estado_privado.vivo=True, lectura < 10 min → se agrega privado."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_privado = {"vivo": True, "ultima_lectura": "2026-11-16T09:55:00"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-reduce", entorno, {"permitido": True}, estado_privado,
            "2026-11-16T10:00:00",
        )
        self.assertIn(("privado", "lectura"), resultado)
        self.assertEqual(motivos, [])

    def test_privado_sin_vida_no_se_agrega(self):
        """rol no direccion, estado_privado.vivo=False → privado no se agrega."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        estado_privado = {"vivo": False, "ultima_lectura": "2026-11-16T09:55:00"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-mapa", entorno, {"permitido": True}, estado_privado,
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("privado",), [x[0] for x in resultado])

    def test_privado_lectura_vieja_no_se_agrega(self):
        """rol no direccion, pero lectura tiene más de 10 minutos → privado no se agrega."""
        entorno = {"STARSEED_ABLITERATION": "1"}
        # lectura hace 15 minutos: 2026-11-16T09:45:00, ahora 2026-11-16T10:00:00
        estado_privado = {"vivo": True, "ultima_lectura": "2026-11-16T09:45:00"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "sueno-mapa", entorno, {"permitido": True}, estado_privado,
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("privado",), [x[0] for x in resultado])
        self.assertTrue(
            any("vieja" in m for m in motivos),
        )

    def test_privado_direccion_bloqueaa_aun_vivo(self):
        """rol 'direccion' bloquea privado aun cuando vivo y reciente."""
        entorno = {}
        estado_privado = {"vivo": True, "ultima_lectura": "2026-11-16T09:55:00"}
        resultado, motivos = agregar_opcionales(
            LISTA_BASE, "direccion", entorno, {"permitido": True}, estado_privado,
            "2026-11-16T10:00:00",
        )
        self.assertNotIn(("privado",), [x[0] for x in resultado])
        self.assertTrue(
            any("direccion" in m for m in motivos),
        )


if __name__ == "__main__":
    unittest.main()