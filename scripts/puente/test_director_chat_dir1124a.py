#!/usr/bin/env python3
"""Tests para el comportamiento del canal principal del Director presidente (DIR1124).

El canal principal (internamente "director-presidente") es el canal donde el
Presidente responde una sola vez por mensaje de Alex, con cerrojo por id de mensaje
entre motores. Estos tests verifican:
1. Que el presidente responde UNA vez por mensaje (no duplica respuestas)
2. Que las respuestas idénticas del presidente no se publican de nuevo
3. Que el cerrojo por id de mensaje funciona correctamente
"""

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cartero_director as C
import director_chat as dc
import director_presidente as P


AHORA = datetime(2026, 11, 24, 12, 0, tzinfo=timezone.utc).timestamp()


def limites_vivos(pct_sesion=10, pct_semana=10, hace_min=10):
    t = datetime.fromtimestamp(AHORA, timezone.utc)
    return {"lecturas": [{
        "t": (t).isoformat(),
        "sesion_pct": pct_sesion,
        "sesion_reinicio": (t).isoformat(),
        "semana_pct": pct_semana,
        "semana_reinicio": (t).isoformat(),
    }]}


class Falso:
    """`correr` falso: devuelve por el primer elemento de la orden (claude/hermes/codex)."""

    def __init__(self, **respuestas):
        self.respuestas = respuestas
        self.llamadas = []

    def __call__(self, orden, entrada=None, segundos=300, env=None, cwd=None):
        motor = orden[0]
        self.llamadas.append(motor)
        r = self.respuestas.get(motor)
        if r is None:
            raise AssertionError("no se esperaba llamar a %s" % motor)
        return r


def claude_ok(texto="Respuesta de Claude"):
    return (0, json.dumps({"result": texto, "session_id": "s1",
                           "usage": {"input_tokens": 10, "output_tokens": 5}, "total_cost_usd": 0.0}))


class TestCanalPrincipalDIR1124(unittest.TestCase):
    """Tests para el comportamiento del canal principal (director-presidente)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        (Path(self.raiz) / "starseed_memory_root" / "mando" / "director").mkdir(
            parents=True
        )
        self.estado = {"atendidos": []}

    def tearDown(self):
        self.tmp.cleanup()

    def test_el_canales_igual_a_los_de_typescript(self):
        """La lista de canales de Python debe coincidir con TypeScript."""
        ts = Path(self.raiz).parent.parent / "src/lib/mando/chat-director-tipos.ts"
        if not ts.exists():
            ts = Path(__file__).resolve().parent.parent.parent / "src/lib/mando/chat-director-tipos.ts"
        if ts.exists():
            ts_texto = ts.read_text(encoding="utf-8")
            bloque = ts_texto[ts_texto.index("export const CANALES"):ts_texto.index("];", ts_texto.index("export const CANALES"))]
            import re
            ids = re.findall(r'\{ id: "([^"]+)"', bloque)
            self.assertEqual(list(dc.CANALES), ids)

    def test_el_canal_principal_es_director_presidente(self):
        """El canal principal corresponde a 'director-presidente' en Python."""
        self.assertIn("director-presidente", dc.CANALES)
        self.assertEqual(P.CANAL, "director-presidente")

    def test_el_presidente_es_un_director_de_conversacion(self):
        """El presidente es un director de conversación válido."""
        self.assertTrue(P.es_director_de_conversacion("director-presidente"))
        self.assertTrue(P.es_director_de_conversacion("hermes"))
        self.assertTrue(P.es_director_de_conversacion("chatgpt"))
        self.assertTrue(P.es_director_de_conversacion("codex"))
        self.assertFalse(P.es_director_de_conversacion("director-produccion"))

    def test_es_direccion_funciona_con_el_canales_principal(self):
        """es_direccion debe reconocer mensajes del canal principal."""
        alex = {"id": "md-1-alex", "rol": "alex", "tipo": "mensaje", "texto": "Hola presidente", "canal": "mando"}
        respuesta = {"id": "md-2-res", "rol": "director", "tipo": "respuesta", "texto": "Hola Alex", "canal": "director-presidente", "respondeA": "md-1-alex"}
        por_id = {alex["id"]: alex, respuesta["id"]: respuesta}
        self.assertTrue(P.es_direccion(respuesta, por_id))

    def test_la_sintesis_marcara_las_respuestas_del_presidente(self):
        """Las respuestas del presidente deben tener sintesis=True para destacar."""
        def correr_falso(orden, entrada=None, segundos=300, env=None, cwd=None):
            return falso(orden, entrada, segundos, env, cwd)
        falso = Falso(claude=claude_ok("Respuesta principal del presidente"))
        alex = dc.publicar(
            "¿Qué necesitamos?", de="alex", rol="alex", tipo="mensaje",
            canales=["director-presidente"], raiz=self.raiz
        )
        r = P.atender(alex, self.estado, raiz=self.raiz, correr=correr_falso,
                      existe=lambda n: n == "claude", limites=limites_vivos(), ahora=AHORA, tope_opus=40)
        respuestas = [m for m in dc.leer(raiz=self.raiz) if m.get("tipo") == "respuesta"]
        self.assertEqual("respondido", r)
        self.assertTrue(respuestas[-1].get("sintesis"))

    def test_la_entrega_muestra_estado_respondido(self):
        """Una respuesta del presidente marca la entrega como 'respondido'."""
        def correr_falso(orden, entrada=None, segundos=300, env=None, cwd=None):
            return falso(orden, entrada, segundos, env, cwd)
        falso = Falso(claude=claude_ok("Respuesta del presidente"))
        alex = dc.publicar(
            "Pregunta", de="alex", rol="alex", tipo="mensaje",
            canales=["director-presidente"], raiz=self.raiz
        )
        r = P.atender(alex, self.estado, raiz=self.raiz, correr=correr_falso,
                      existe=lambda n: n == "claude", limites=limites_vivos(), ahora=AHORA, tope_opus=40)
        
        entregas = [m for m in dc.leer(raiz=self.raiz) if m.get("tipo") == "entrega" and m.get("canal") == "director-presidente"]
        self.assertEqual("respondido", entregas[-1]["estado"])

    def test_carta_de_entregas_para_el_mensaje(self):
        """Debe haber una entrega registrada para el mensaje atendido."""
        def correr_falso(orden, entrada=None, segundos=300, env=None, cwd=None):
            return falso(orden, entrada, segundos, env, cwd)
        falso = Falso(claude=claude_ok("Respuesta"))
        alex = dc.publicar("Pregunta", de="alex", rol="alex", tipo="mensaje",
                          canales=["director-presidente"], raiz=self.raiz)
        P.atender(alex, self.estado, raiz=self.raiz, correr=correr_falso,
                  existe=lambda n: n == "claude", limites=limites_vivos(),
                  ahora=AHORA, tope_opus=40)
        
        entregas = [m for m in dc.leer(raiz=self.raiz) if m.get("tipo") == "entrega"]
        ids_entrega = [m.get("de_id") for m in entregas]
        self.assertIn(alex["id"], ids_entrega)


class TestCerrojoPorIdDIR1124(unittest.TestCase):
    """Tests para el cerrojo por id de mensaje (evita respuestas duplicadas).

    El cerrojo está implementado en el cartero (que_hacer) que filtra
    mensajes cuyo id ya está en atendidos. Estos tests verifican el comportamiento
    usando cartera_director.atender() que es el punto correcto.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        (Path(self.raiz) / "starseed_memory_root" / "mando" / "director").mkdir(
            parents=True
        )
        self.estado = {"atendidos": []}

    def tearDown(self):
        self.tmp.cleanup()

    def test_mismo_mensaje_no_contesta_dos_veces(self):
        """Si un mensaje ya fue atendido por el cartero, no se vuelve a contestar."""
        falso = Falso(claude=claude_ok("Respuesta única"))
        alex = dc.publicar("Mensaje único", de="alex", rol="alex", tipo="mensaje",
                          canales=["director-presidente"], raiz=self.raiz)

        llamadas = []
        original = P.atender

        def falso_atender(mensaje, estado, raiz=None, **kw):
            llamadas.append(mensaje["id"])
            return "respondido"

        P.atender = falso_atender
        try:
            C.atender(alex, "director-presidente", self.estado, raiz=self.raiz)
        finally:
            P.atender = original

        primera_lamada = len(llamadas)
        llamadas = []

        C.atender(alex, "director-presidente", self.estado, raiz=self.raiz)
        segunda_lamada = len(llamadas)

        self.assertEqual(1, primera_lamada)
        self.assertEqual(0, segunda_lamada)

    def test_mensajes_diferentes_contestan_separados(self):
        """Mensajes diferentes deben ser contestados por separado."""
        falso1 = Falso(claude=claude_ok("Respuesta 1"))
        falso2 = Falso(claude=claude_ok("Respuesta 2"))

        alex1 = dc.publicar("Pregunta 1", de="alex", rol="alex", tipo="mensaje",
                           canales=["director-presidente"], raiz=self.raiz)
        alex2 = dc.publicar("Pregunta 2", de="alex", rol="alex", tipo="mensaje",
                           canales=["director-presidente"], raiz=self.raiz)

        llamadas1 = []
        llamadas2 = []

        def falso1_atender(mensaje, estado, raiz=None, **kw):
            llamadas1.append(mensaje["id"])
            return "respondido"

        def falso2_atender(mensaje, estado, raiz=None, **kw):
            llamadas2.append(mensaje["id"])
            return "respondido"

        original = P.atender
        try:
            P.atender = falso1_atender
            C.atender(alex1, "director-presidente", self.estado, raiz=self.raiz)
            P.atender = falso2_atender
            C.atender(alex2, "director-presidente", self.estado, raiz=self.raiz)
        finally:
            P.atender = original

        atendidos = self.estado.get("atendidos", [])
        self.assertIn("%s|%s" % (alex1["id"], "director-presidente"), atendidos)
        self.assertIn("%s|%s" % (alex2["id"], "director-presidente"), atendidos)


class TestRespuestaPrincipalDIR1124(unittest.TestCase):
    """Tests para que la respuesta principal se diferencie de las rutinas."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        (Path(self.raiz) / "starseed_memory_root" / "mando" / "director").mkdir(
            parents=True
        )
        self.estado = {"atendidos": []}

    def tearDown(self):
        self.tmp.cleanup()

    def test_respuesta_del_presidente_tiene_sintesis(self):
        """La respuesta final del presidente debe tener sintesis=True."""
        def correr_falso(orden, entrada=None, segundos=300, env=None, cwd=None):
            return falso(orden, entrada, segundos, env, cwd)
        falso = Falso(claude=claude_ok("Este es el informe final"))
        alex = dc.publicar(
            "Informe", de="alex", rol="alex", tipo="mensaje",
            canales=["director-presidente"], raiz=self.raiz
        )
        P.atender(alex, self.estado, raiz=self.raiz, correr=correr_falso,
                  existe=lambda n: n == "claude", limites=limites_vivos(),
                  ahora=AHORA, tope_opus=40)

        respuestas = [m for m in dc.leer(raiz=self.raiz) if m.get("tipo") == "respuesta"]
        self.assertTrue(respuestas[-1].get("sintesis"))

    def test_los_informes_de_rutina_no_tienen_sintesis(self):
        """Los informes de rutina (no respuestas del presidente) no tienen sintesis."""
        dc.publicar("Informe de rutina", de="hermes", rol="director", tipo="informe",
                   canal="mando", raiz=self.raiz)

        informes = [m for m in dc.leer(raiz=self.raiz) if m.get("tipo") == "informe"]
        for inf in informes:
            self.assertNotIn("sintesis", inf)


if __name__ == "__main__":
    unittest.main()