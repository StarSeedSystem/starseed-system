#!/usr/bin/env python3
"""Pruebas DIR1124A: canal Principal con avisos de directores agrupados y una sola respuesta del presidente.

Reglas:
1. Un aviso de director idéntico al anterior no se vuelve a publicar (se cuenta: «×N, último a las HH:MM»)
2. El presidente responde UNA vez por mensaje de Alex (cerrojo por id de mensaje entre motores)
3. La pestaña Conversación enseña solo Alex y presidente
"""

import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import director_chat as dc
import director_presidente as P


class PruebasAgrupacionDirectores(unittest.TestCase):
    """Un aviso de director idéntico al anterior no se vuelve a publicar."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        (Path(self.raiz) / "starseed_memory_root" / "mando" / "director").mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_publicar_director_identico_no_duplica_agrupa_contador(self):
        """Dos informes idénticos del mismo director se agrupan con contador."""
        # Primer mensaje
        m1 = dc.publicar(
            "Capacidad en la nube: nada que lanzar",
            de="director-capacidad",
            rol="director",
            tipo="informe",
            canal="mando",
            raiz=self.raiz,
        )
        # Segundo mensaje idéntico (simula que llega 2 min después)
        time.sleep(0.01)
        m2 = dc.publicar(
            "Capacidad en la nube: nada que lanzar",
            de="director-capacidad",
            rol="director",
            tipo="informe",
            canal="mando",
            raiz=self.raiz,
        )

        # Debe devolver el MISMO id (no crear uno nuevo) y actualizar contador
        self.assertEqual(m1["id"], m2["id"])
        self.assertEqual(m2.get("agrupado"), 2)
        self.assertIn("último a las", m2.get("texto", ""))

    def test_publicar_director_diferente_sí_crea_nuevo(self):
        """Dos informes diferentes del mismo director crean mensajes separados."""
        m1 = dc.publicar(
            "Capacidad en la nube: nada que lanzar",
            de="director-capacidad",
            rol="director",
            tipo="informe",
            canal="mando",
            raiz=self.raiz,
        )
        m2 = dc.publicar(
            "Capacidad en la nube: 3 tareas listas",
            de="director-capacidad",
            rol="director",
            tipo="informe",
            canal="mando",
            raiz=self.raiz,
        )
        self.assertNotEqual(m1["id"], m2["id"])
        self.assertIsNone(m2.get("agrupado"))

    def test_publicar_mismo_texto_diferente_director_sí_crea_nuevo(self):
        """Mismo texto pero de director distinto crea mensaje nuevo."""
        m1 = dc.publicar(
            "Revisión completada",
            de="director-autocuracion",
            rol="director",
            tipo="informe",
            canal="mando",
            raiz=self.raiz,
        )
        m2 = dc.publicar(
            "Revisión completada",
            de="director-capacidad",
            rol="director",
            tipo="informe",
            canal="mando",
            raiz=self.raiz,
        )
        self.assertNotEqual(m1["id"], m2["id"])

    def test_publicar_alex_no_se_agrupa(self):
        """Mensajes de Alex nunca se agrupan, aunque sean idénticos."""
        m1 = dc.publicar(
            "¿Estado?",
            de="alex",
            rol="alex",
            tipo="mensaje",
            canal="terminal",
            raiz=self.raiz,
        )
        time.sleep(0.01)
        m2 = dc.publicar(
            "¿Estado?",
            de="alex",
            rol="alex",
            tipo="mensaje",
            canal="terminal",
            raiz=self.raiz,
        )
        self.assertNotEqual(m1["id"], m2["id"])
        self.assertIsNone(m1.get("agrupado"))
        self.assertIsNone(m2.get("agrupado"))


class PruebasCerrojoPresidente(unittest.TestCase):
    """El presidente responde UNA vez por mensaje de Alex (cerrojo por id)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        (Path(self.raiz) / "starseed_memory_root" / "mando" / "director").mkdir(parents=True)

        self.alex = dc.publicar(
            "¿Qué dijeron los directores?",
            de="alex",
            rol="alex",
            tipo="mensaje",
            canales=["director-presidente"],
            raiz=self.raiz,
        )
        self.estado = {"atendidos": []}

    def tearDown(self):
        self.tmp.cleanup()

    def atender(self, falso, existe=lambda n: True, lim=None, ahora=None):
        return P.atender(
            self.alex,
            self.estado,
            raiz=self.raiz,
            correr=falso,
            existe=existe,
            limites=lim or {"lecturas": [{"t": datetime.now(timezone.utc).isoformat(), "sesion_pct": 20, "semana_pct": 30}]},
            ahora=ahora or time.time(),
            tope_opus=40,
        )

    def respuestas(self):
        return [r for r in dc.leer(limite=500, raiz=self.raiz) if r.get("tipo") == "respuesta" and r.get("canal") == P.CANAL]

    def test_presidente_responde_una_sola_vez_por_mensaje_alex(self):
        """Llamar a atender dos veces con el mismo mensaje de Alex produce una sola respuesta."""
        falso = mock.Mock(side_effect=[
            (0, json.dumps({"result": "Respuesta 1", "session_id": "s1", "usage": {"input_tokens": 10, "output_tokens": 5}, "total_cost_usd": 0.0})),
            (0, json.dumps({"result": "Respuesta 2", "session_id": "s2", "usage": {"input_tokens": 10, "output_tokens": 5}, "total_cost_usd": 0.0})),
        ])

        r1 = self.atender(falso)
        r2 = self.atender(falso)

        self.assertEqual(r1, "respondido")
        self.assertEqual(r2, "respondido")  # No falla, pero no crea respuesta duplicada
        self.assertEqual(len(self.respuestas()), 1)  # Solo UNA respuesta en el chat

    def test_presidente_responde_a_cada_mensaje_nuevo_de_alex(self):
        """Cada mensaje NUEVO de Alex genera su propia respuesta."""
        falso = mock.Mock(side_effect=[
            (0, json.dumps({"result": "Resp 1", "session_id": "s1", "usage": {"input_tokens": 10, "output_tokens": 5}, "total_cost_usd": 0.0})),
            (0, json.dumps({"result": "Resp 2", "session_id": "s2", "usage": {"input_tokens": 10, "output_tokens": 5}, "total_cost_usd": 0.0})),
        ])

        # Primer mensaje de Alex
        r1 = self.atender(falso)
        self.assertEqual(r1, "respondido")
        self.assertEqual(len(self.respuestas()), 1)

        # Segundo mensaje NUEVO de Alex
        alex2 = dc.publicar(
            "Otra pregunta",
            de="alex",
            rol="alex",
            tipo="mensaje",
            canales=["director-presidente"],
            raiz=self.raiz,
        )
        r2 = P.atender(
            alex2,
            self.estado,
            raiz=self.raiz,
            correr=falso,
            existe=lambda n: True,
            limites={"lecturas": [{"t": datetime.now(timezone.utc).isoformat(), "sesion_pct": 20, "semana_pct": 30}]},
            ahora=time.time(),
            tope_opus=40,
        )
        self.assertEqual(r2, "respondido")
        self.assertEqual(len(self.respuestas()), 2)  # DOS respuestas, una por cada mensaje de Alex


class PruebasPestanaConversacion(unittest.TestCase):
    """La pestaña Conversación enseña solo Alex y presidente."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        (Path(self.raiz) / "starseed_memory_root" / "mando" / "director").mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_es_direccion_solo_alex_y_presidente(self):
        """es_direccion filtra: solo mensajes de Alex y respuestas del presidente son 'dirección'."""
        por_id = {}
        # Mensaje de Alex
        alex_msg = {"id": "a1", "rol": "alex", "tipo": "mensaje", "de": "alex"}
        por_id["a1"] = alex_msg
        # Respuesta del presidente (síntesis)
        pres_msg = {"id": "p1", "rol": "director", "tipo": "respuesta", "de": "director-presidente", "canal": "director-presidente", "sintesis": True, "respondeA": "a1"}
        por_id["p1"] = pres_msg
        # Informe de director-capacidad (NO es dirección)
        dir_msg = {"id": "d1", "rol": "director", "tipo": "informe", "de": "director-capacidad", "canal": "mando"}
        # Informe de director-autocuracion (NO es dirección)
        dir_msg2 = {"id": "d2", "rol": "director", "tipo": "informe", "de": "director-autocuracion", "canal": "mando"}

        self.assertTrue(P.es_direccion(alex_msg, por_id))
        self.assertTrue(P.es_direccion(pres_msg, por_id))
        self.assertFalse(P.es_direccion(dir_msg, por_id))
        self.assertFalse(P.es_direccion(dir_msg2, por_id))

    def test_hilo_direccion_incluye_alex_y_presidente_excluye_rutina(self):
        """hilo_direccion incluye mensajes de Alex y respuestas del presidente, excluye directores de rutina."""
        regs = [
            {"id": "d1", "t": "2026-11-24T10:00:00+00:00", "de": "director-autocuracion", "rol": "director", "tipo": "informe", "texto": "Autocuración OK"},
            {"id": "d2", "t": "2026-11-24T10:01:00+00:00", "de": "director-capacidad", "rol": "director", "tipo": "informe", "texto": "Capacidad: nada"},
            {"id": "a1", "t": "2026-11-24T10:02:00+00:00", "de": "alex", "rol": "alex", "tipo": "mensaje", "texto": "¿Estado?"},
            {"id": "p1", "t": "2026-11-24T10:03:00+00:00", "de": "director-presidente", "rol": "director", "tipo": "respuesta", "texto": "Todo bien", "canal": "director-presidente", "sintesis": True, "respondeA": "a1"},
            {"id": "a2", "t": "2026-11-24T10:04:00+00:00", "de": "alex", "rol": "alex", "tipo": "mensaje", "texto": "¿Y ahora?"},
        ]
        # Excluir el último mensaje de Alex (a2) como si fuera el que se está contestando
        hilo = P.hilo_direccion(regs, excluir_id="a2")
        ids = [r["id"] for r in hilo]
        self.assertIn("a1", ids)  # Alex anterior incluido
        self.assertIn("p1", ids)  # Presidente incluido
        self.assertNotIn("a2", ids)  # a2 excluido correctamente (es el que se contesta)
        self.assertNotIn("d1", ids)  # No director-autocuracion
        self.assertNotIn("d2", ids)  # No director-capacidad


if __name__ == "__main__":
    unittest.main()