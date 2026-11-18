# -*- coding: utf-8 -*-
"""Pruebas DIR1118T: [tiempo agotado] cuenta como fallo y reintentos con más tiempo.

Texto "[tiempo agotado]" (y cualquier salida vacía por tiempo) = fallo, igual que
_FALLOS_HERMES / es_fallo_hermes. El mensaje queda en cola con su detalle visible.
Reintento del mismo mensaje usa más tiempo: 120 s, luego 300 s, luego 600 s (como mucho),
y el detalle de la cola lo dice ("reintento con 300 s").
"""

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_chat as dc
import director_presidente as P
import motores_director as M


RAIZ_REPO = Path(__file__).resolve().parent.parent.parent
AHORA = datetime(2026, 11, 18, 15, tzinfo=timezone.utc).timestamp()


def limites(pct_sesion=20, pct_semana=30, hace_min=10):
    t = datetime.fromtimestamp(AHORA, timezone.utc)
    return {"lecturas": [{
        "t": (t - timedelta(minutes=hace_min)).isoformat(),
        "sesion_pct": pct_sesion,
        "sesion_reinicio": (t + timedelta(hours=3)).isoformat(),
        "semana_pct": pct_semana,
        "semana_reinicio": (t + timedelta(days=3)).isoformat(),
    }]}


class Falso:
    """`correr` falso: responde por el primer elemento de la orden (claude/hermes/codex)."""

    def __init__(self, **respuestas):
        self.respuestas = respuestas
        self.llamadas = []

    def __call__(self, orden, entrada=None, segundos=300, env=None, cwd=None):
        motor = orden[0]
        self.llamadas.append((motor, segundos))
        r = self.respuestas.get(motor)
        if r is None:
            raise AssertionError("no se esperaba llamar a %s" % motor)
        return r


def claude_ok(texto="Respuesta de Claude"):
    return (0, json.dumps({"result": texto, "session_id": "s1",
                           "usage": {"input_tokens": 10, "output_tokens": 5}, "total_cost_usd": 0.0}))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.alex = dc.publicar("¿Qué dijeron los directores?", de="alex", rol="alex", tipo="mensaje",
                                canales=["director-presidente"], raiz=self.raiz)
        self.estado = {"atendidos": []}

    def tearDown(self):
        self.tmp.cleanup()

    def atender(self, falso, existe=lambda n: True, lim=None, ahora=AHORA, tope_opus=40):
        return P.atender(self.alex, self.estado, raiz=self.raiz, correr=falso, existe=existe,
                         limites=limites() if lim is None else lim, ahora=ahora, tope_opus=tope_opus)

    def chat(self):
        return dc.leer(limite=500, raiz=self.raiz)

    def respuestas(self):
        return [r for r in self.chat() if r.get("tipo") == "respuesta"]

    def entregas(self):
        return [r for r in self.chat() if r.get("tipo") == "entrega" and r.get("canal") == P.CANAL]


class TestTiempoAgotadoEsFallo(Base):
    """DIR1118T: salida con '[tiempo agotado]' cuenta como fallo (no respuesta)."""

    def test_es_fallo_tiempo_agotado_detecta_marcador(self):
        """motores_director.es_fallo_tiempo_agotado detecta el marcador en la salida."""
        # El marcador que añade _correr al agotar el tiempo
        self.assertTrue(M.es_fallo_tiempo_agotado("algo\n[tiempo agotado]"))
        self.assertTrue(M.es_fallo_tiempo_agotado("[tiempo agotado]"))
        self.assertTrue(M.es_fallo_tiempo_agotado("  [tiempo agotado]  "))
        # Minúsculas/mayúsculas y espacios no importan
        self.assertTrue(M.es_fallo_tiempo_agotado("[TIEMPO AGOTADO]"))
        self.assertTrue(M.es_fallo_tiempo_agotado("[Tiempo Agotado]"))
        # Salida vacía por timeout (rc=-9, salida vacía) también es fallo
        self.assertTrue(M.es_fallo_tiempo_agotado(""))
        # Respuesta normal no es fallo por tiempo
        self.assertFalse(M.es_fallo_tiempo_agotado("Respuesta normal del modelo"))
        self.assertFalse(M.es_fallo_tiempo_agotado("every provider in the fallback chain kept failing over"))

    def test_claude_tiempo_agotado_se_trata_como_fallo(self):
        """Si Claude devuelve [tiempo agotado], se enfriada y pasa al siguiente."""
        # rc=0 pero salida con [tiempo agotado] -> fallo
        falso = Falso(
            claude=(0, "Respuesta parcial\n[tiempo agotado]"),
            hermes=(0, "Respuesta de Hermes"),
        )
        r = self.atender(falso)
        self.assertEqual("respondido", r)
        self.assertEqual("hermes", self.respuestas()[-1]["eleccion"]["proveedor"])
        self.assertIn("claude", self.estado["presidente"]["enfriados"])
        self.assertIn("tiempo agotado", self.estado["presidente"]["enfriados"]["claude"]["motivo"].lower())

    def test_hermes_tiempo_agotado_se_trata_como_fallo(self):
        """Si Hermes devuelve [tiempo agotado], se enfriada y pasa al siguiente."""
        falso = Falso(
            claude=(1, "Credit balance is too low"),
            hermes=(0, "algo\n[tiempo agotado]"),
            codex=(0, "Respuesta de Codex"),
        )
        r = self.atender(falso)
        self.assertEqual("respondido", r)
        self.assertEqual("chatgpt", self.respuestas()[-1]["eleccion"]["proveedor"])
        self.assertIn("hermes", self.estado["presidente"]["enfriados"])
        self.assertIn("tiempo agotado", self.estado["presidente"]["enfriados"]["hermes"]["motivo"].lower())

    def test_chatgpt_tiempo_agotado_se_trata_como_fallo(self):
        """Si ChatGPT devuelve [tiempo agotado], se enfriada."""
        falso = Falso(
            claude=(1, "Credit balance is too low"),
            hermes=(1, "every provider in the fallback chain kept failing over"),
            codex=(0, "[tiempo agotado]"),
        )
        r = self.atender(falso)
        self.assertEqual("cola", r)
        self.assertIn("chatgpt", self.estado["presidente"]["enfriados"])
        self.assertIn("tiempo agotado", self.estado["presidente"]["enfriados"]["chatgpt"]["motivo"].lower())


class TestReintentosConMasTiempo(unittest.TestCase):
    """DIR1118T: reintentos escalonados 120s -> 300s -> 600s (máx)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.alex = dc.publicar("pregunta", de="alex", rol="alex", tipo="mensaje",
                                canales=["director-presidente"], raiz=self.raiz)

    def tearDown(self):
        self.tmp.cleanup()

    def _chat(self, raiz):
        return dc.leer(limite=500, raiz=raiz)

    def _respuestas(self, raiz):
        return [r for r in self._chat(raiz) if r.get("tipo") == "respuesta"]

    def test_primer_intento_usa_120s_y_detalle_dice_reintento_con_120s(self):
        """Primer intento: timeout 120s, detalle menciona 'reintento con 120 s'."""
        # Simular que todos los proveedores fallan por timeout
        def falso_timeout(orden, entrada=None, segundos=300, env=None, cwd=None):
            return (-9, "[tiempo agotado]")

        estado = {"atendidos": []}
        r = P.atender(self.alex, estado, raiz=self.raiz, correr=falso_timeout, existe=lambda n: True,
                      limites=limites(), ahora=AHORA, tope_opus=40)
        self.assertEqual("cola", r)
        cola = estado["presidente"]["cola"]
        self.assertEqual(1, len(cola))
        entrada = list(cola.values())[0]
        self.assertEqual(1, entrada["intentos"])
        self.assertIn("reintento con 120 s", entrada["detalle"].lower())
        # El próximo reintento debe ser a los ~120s
        self.assertAlmostEqual(entrada["proximo"], AHORA + 120, delta=5)

    def test_segundo_intento_usa_300s_y_detalle_dice_reintento_con_300s(self):
        """Segundo intento (tras 120s): timeout 300s, detalle menciona 'reintento con 300 s'."""
        def falso_timeout(orden, entrada=None, segundos=300, env=None, cwd=None):
            return (-9, "[tiempo agotado]")

        estado = {"atendidos": []}
        # Primer intento
        P.atender(self.alex, estado, raiz=self.raiz, correr=falso_timeout, existe=lambda n: True,
                  limites=limites(), ahora=AHORA, tope_opus=40)
        # Segundo intento (simulando que pasaron 120s+)
        r = P.atender(self.alex, estado, raiz=self.raiz, correr=falso_timeout, existe=lambda n: True,
                      limites=limites(), ahora=AHORA + 130, tope_opus=40)
        self.assertEqual("cola", r)
        cola = estado["presidente"]["cola"]
        entrada = list(cola.values())[0]
        self.assertEqual(2, entrada["intentos"])
        self.assertIn("reintento con 300 s", entrada["detalle"].lower())
        self.assertAlmostEqual(entrada["proximo"], AHORA + 130 + 300, delta=5)

    def test_tercer_intento_usa_600s_y_detalle_dice_reintento_con_600s(self):
        """Tercer intento (tras 300s más): timeout 600s, detalle menciona 'reintento con 600 s'."""
        def falso_timeout(orden, entrada=None, segundos=300, env=None, cwd=None):
            return (-9, "[tiempo agotado]")

        estado = {"atendidos": []}
        # Primer intento
        P.atender(self.alex, estado, raiz=self.raiz, correr=falso_timeout, existe=lambda n: True,
                  limites=limites(), ahora=AHORA, tope_opus=40)
        # Segundo intento
        P.atender(self.alex, estado, raiz=self.raiz, correr=falso_timeout, existe=lambda n: True,
                  limites=limites(), ahora=AHORA + 130, tope_opus=40)
        # Tercer intento (simulando que pasaron 300s más)
        r = P.atender(self.alex, estado, raiz=self.raiz, correr=falso_timeout, existe=lambda n: True,
                      limites=limites(), ahora=AHORA + 130 + 310, tope_opus=40)
        self.assertEqual("cola", r)
        cola = estado["presidente"]["cola"]
        entrada = list(cola.values())[0]
        self.assertEqual(3, entrada["intentos"])
        self.assertIn("reintento con 600 s", entrada["detalle"].lower())
        self.assertAlmostEqual(entrada["proximo"], AHORA + 130 + 310 + 600, delta=5)

    def test_cuarto_intento_tambien_usa_600s_techo(self):
        """Cuarto y siguientes intentos usan 600s (techo)."""
        def falso_timeout(orden, entrada=None, segundos=300, env=None, cwd=None):
            return (-9, "[tiempo agotado]")

        estado = {"atendidos": []}
        ahora = AHORA
        # 4 intentos: guardamos el momento de cada intento para verificar 'proximo'
        momentos = []
        for i in range(4):
            momentos.append(ahora)
            r = P.atender(self.alex, estado, raiz=self.raiz, correr=falso_timeout, existe=lambda n: True,
                          limites=limites(), ahora=ahora, tope_opus=40)
            # Avanzar tiempo según el intervalo esperado
            if i == 0:
                ahora += 130  # ~120s
            elif i == 1:
                ahora += 310  # ~300s
            else:
                ahora += 610  # ~600s
        self.assertEqual("cola", r)
        cola = estado["presidente"]["cola"]
        entrada = list(cola.values())[0]
        self.assertEqual(4, entrada["intentos"])
        self.assertIn("reintento con 600 s", entrada["detalle"].lower())
        # El 4to intento fue en momentos[3], su próximo debe ser +600s
        self.assertAlmostEqual(entrada["proximo"], momentos[3] + 600, delta=10)

    def test_si_alguien_contesta_se_responde_y_limpia_cola(self):
        """Si en un reintento alguien contesta, se responde y se limpia la cola.
        En el primer intento todos fallan (timeout). En el segundo, el primero que se prueba contesta."""
        llamada = {"count": 0}

        def falso_primero_todos_timeout_luego_primero_ok(orden, entrada=None, segundos=300, env=None, cwd=None):
            llamada["count"] += 1
            # Primeras 3 llamadas (claude, hermes, chatgpt en primer intento) -> timeout
            if llamada["count"] <= 3:
                return (-9, "[tiempo agotado]")
            # Cuarta llamada (claude en segundo intento) -> éxito
            return (0, "Respuesta tardía pero válida")

        estado = {"atendidos": []}
        # Primer intento: todos timeout -> cola
        r1 = P.atender(self.alex, estado, raiz=self.raiz, correr=falso_primero_todos_timeout_luego_primero_ok,
                       existe=lambda n: True, limites=limites(), ahora=AHORA, tope_opus=40)
        self.assertEqual("cola", r1)
        # Segundo intento: primer proveedor (claude) contesta -> respondido
        r2 = P.atender(self.alex, estado, raiz=self.raiz, correr=falso_primero_todos_timeout_luego_primero_ok,
                       existe=lambda n: True, limites=limites(), ahora=AHORA + 130, tope_opus=40)
        self.assertEqual("respondido", r2)
        self.assertEqual("Respuesta tardía pero válida", self._respuestas(self.raiz)[-1]["texto"])
        self.assertEqual(0, len(estado["presidente"]["cola"]))


if __name__ == "__main__":
    unittest.main()