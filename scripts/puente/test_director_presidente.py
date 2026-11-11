# -*- coding: utf-8 -*-
"""Pruebas del Director presidente (DIR1111G) con proveedores FALSOS y carpetas temporales.

Ninguna prueba llama a Claude, Hermes ni Codex de verdad: `correr` es un falso que
devuelve lo que cada caso necesita, y el chat vive en un `tempfile.TemporaryDirectory`.
"""

import io
import json
import os
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cartero_director as C
import director_chat as dc
import director_presidente as P

RAIZ_REPO = Path(__file__).resolve().parent.parent.parent
AHORA = datetime(2026, 11, 11, 12, tzinfo=timezone.utc).timestamp()


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
        self.llamadas.append(motor)
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

    def atender(self, falso, existe=lambda n: True, lim=None, ahora=AHORA):
        return P.atender(self.alex, self.estado, raiz=self.raiz, correr=falso, existe=existe,
                         limites=limites() if lim is None else lim, ahora=ahora, tope_opus=40)

    def chat(self):
        return dc.leer(limite=500, raiz=self.raiz)

    def respuestas(self):
        return [r for r in self.chat() if r.get("tipo") == "respuesta"]

    def entregas(self):
        return [r for r in self.chat() if r.get("tipo") == "entrega" and r.get("canal") == P.CANAL]


class TestCanalesDeAmbosLados(unittest.TestCase):
    """La lista de canales de Python y la de TypeScript no pueden separarse otra vez."""

    def test_canales_iguales_a_los_de_typescript(self):
        ts = (RAIZ_REPO / "src/lib/mando/chat-director-tipos.ts").read_text(encoding="utf-8")
        bloque = ts[ts.index("export const CANALES"):ts.index("];", ts.index("export const CANALES"))]
        ids = re.findall(r'\{ id: "([^"]+)"', bloque)
        self.assertEqual(list(dc.CANALES), ids)

    def test_proveedores_iguales_a_los_de_typescript(self):
        ts = (RAIZ_REPO / "src/lib/mando/chat-director-tipos.ts").read_text(encoding="utf-8")
        i = ts.index("export const PROVEEDORES_PRESIDENTE")
        ids = re.findall(r'\{ id: "([^"]+)"', ts[i:ts.index("] as const", i)])
        self.assertEqual(list(P.PROVEEDORES), ids)

    def test_el_cartero_atiende_el_canal(self):
        self.assertIn("director-presidente", C.CANALES_ACTIVOS)


class TestEsDireccion(unittest.TestCase):
    def test_reglas(self):
        alex = {"id": "a", "rol": "alex", "tipo": "mensaje", "de": "alex"}
        aviso = {"id": "b", "rol": "sistema", "tipo": "aviso", "de": "desatascador"}
        por_id = {"a": alex, "b": aviso}
        self.assertTrue(P.es_direccion(alex, por_id))
        self.assertTrue(P.es_direccion({"de": "hermes", "rol": "director", "tipo": "informe"}, por_id))
        # Hermes contestando un aviso del desatascador es rutina (medido el 2026-11-11).
        self.assertFalse(P.es_direccion({"de": "hermes", "rol": "director", "tipo": "respuesta",
                                         "respondeA": "b"}, por_id))
        self.assertTrue(P.es_direccion({"de": "hermes", "rol": "director", "tipo": "respuesta",
                                        "respondeA": "a"}, por_id))
        self.assertFalse(P.es_direccion({"de": "director-produccion", "rol": "director",
                                         "tipo": "informe"}, por_id))
        self.assertTrue(P.es_direccion({"de": "revisor-bloqueadas", "rol": "director",
                                        "tipo": "informe", "sintesis": True}, por_id))
        self.assertTrue(P.es_direccion({"de": "groq", "rol": "director", "tipo": "respuesta",
                                        "respondeA": "a"}, por_id))
        self.assertFalse(P.es_direccion({"tipo": "entrega"}, por_id))

    def test_hilo_y_prompt_llevan_lo_que_dijeron_los_otros(self):
        regs = [
            {"id": "x1", "t": "2026-11-11T10:00:00+00:00", "de": "hermes", "rol": "director",
             "tipo": "informe", "texto": "El A1 vuelve a prestar."},
            {"id": "x2", "t": "2026-11-11T10:01:00+00:00", "de": "director-produccion", "rol": "director",
             "tipo": "informe", "texto": "rutina"},
            {"id": "x3", "t": "2026-11-11T10:02:00+00:00", "de": "alex", "rol": "alex",
             "tipo": "mensaje", "texto": "pregunta"},
        ]
        hilo = P.hilo_direccion(regs, excluir_id="x3")
        self.assertEqual(["x1"], [r["id"] for r in hilo])
        prompt = P.prompt_presidente("pregunta", hilo, "ctx")
        self.assertIn("El A1 vuelve a prestar.", prompt)
        self.assertNotIn("rutina", prompt)


class TestDisponibilidadClaude(unittest.TestCase):
    def test_casos(self):
        self.assertEqual((True, ""), P.disponibilidad_claude(limites(), AHORA, 0, 40))
        ok, m = P.disponibilidad_claude(limites(pct_sesion=95), AHORA, 0, 40)
        self.assertFalse(ok)
        self.assertIn("sesión al 95 %", m)
        ok, m = P.disponibilidad_claude(limites(pct_semana=92), AHORA, 0, 40)
        self.assertIn("semana al 92 %", m)
        ok, m = P.disponibilidad_claude(limites(hace_min=5 * 1440), AHORA, 0, 40)
        self.assertFalse(ok)
        self.assertIn("5 días", m)
        ok, m = P.disponibilidad_claude({}, AHORA, 0, 40)
        self.assertIn("no hay lecturas", m)
        ok, m = P.disponibilidad_claude(limites(), AHORA, 40, 40)
        self.assertIn("tope de Opus", m)

    def test_ordenar_con_enfriados(self):
        disp = {"claude": (False, "límite"), "hermes": (True, ""), "chatgpt": (True, "")}
        cand, desc = P.ordenar(disp, {"hermes": {"hasta": AHORA + 10, "motivo": "rc=1"}}, AHORA)
        self.assertEqual(["chatgpt"], cand)
        self.assertEqual(["claude", "hermes"], [p for p, _ in desc])
        cand, _ = P.ordenar(disp, {"hermes": {"hasta": AHORA - 1}}, AHORA)
        self.assertEqual(["hermes", "chatgpt"], cand)


class TestAtender(Base):
    def test_claude_contesta_cuando_sus_limites_lo_permiten(self):
        falso = Falso(claude=claude_ok())
        self.assertEqual("respondido", self.atender(falso))
        r = self.respuestas()[-1]
        self.assertEqual(("director-presidente", "director-presidente"), (r["de"], r["canal"]))
        self.assertEqual("claude-mac/claude-opus-5-5", r["modelo"])
        self.assertEqual("claude", r["eleccion"]["proveedor"])
        self.assertNotIn("descartes", r["eleccion"])
        self.assertTrue(r["sintesis"])
        self.assertEqual(self.alex["id"], r["respondeA"])
        self.assertEqual("respondido", self.entregas()[-1]["estado"])
        self.assertEqual(1, self.estado["opus_hoy"])

    def test_sin_limites_de_claude_contesta_hermes_y_dice_por_que(self):
        falso = Falso(hermes=(0, "Respuesta de Hermes"))
        self.assertEqual("respondido", self.atender(falso, lim=limites(pct_sesion=96)))
        self.assertEqual(["hermes"], falso.llamadas)
        r = self.respuestas()[-1]
        self.assertEqual("hermes/predeterminado", r["modelo"])
        self.assertEqual("claude", r["eleccion"]["descartes"][0]["proveedor"])
        self.assertIn("96", r["eleccion"]["descartes"][0]["motivo"])

    def test_hermes_falla_y_contesta_chatgpt(self):
        falso = Falso(claude=(1, "Credit balance is too low"),
                      hermes=(0, "every provider in the fallback chain kept failing over"),
                      codex=(0, "Respuesta de Codex"))
        self.assertEqual("respondido", self.atender(falso))
        r = self.respuestas()[-1]
        self.assertEqual("chatgpt", r["eleccion"]["proveedor"])
        self.assertEqual(["claude", "hermes"], [d["proveedor"] for d in r["eleccion"]["descartes"]])
        self.assertIn("hermes", self.estado["presidente"]["enfriados"])

    def test_nadie_puede_queda_en_cola_visible_sin_frase_hecha(self):
        falso = Falso(hermes=(1, ""))
        sin_codex = lambda n: n != "codex"  # noqa: E731
        self.assertEqual("cola", self.atender(falso, existe=sin_codex, lim={}))
        self.assertEqual([], self.respuestas())
        e = self.entregas()[-1]
        self.assertEqual("pendiente", e["estado"])
        self.assertTrue(e["detalle"].startswith("En cola:"))
        self.assertIn("Claude", e["detalle"])
        self.assertIn("ChatGPT", e["detalle"])
        n = len(self.entregas())
        # Antes de los 2 min no se reintenta ni se repite la entrega.
        self.assertEqual("espera", self.atender(falso, existe=sin_codex, lim={}, ahora=AHORA + 30))
        self.assertEqual(n, len(self.entregas()))
        # Al volver un proveedor, se contesta.
        vuelve = Falso(hermes=(0, "Hermes ha vuelto"))
        r = self.atender(vuelve, existe=sin_codex, lim={}, ahora=AHORA + P.ENFRIAMIENTO_S + 1)
        self.assertEqual("respondido", r)
        self.assertEqual("Hermes ha vuelto", self.respuestas()[-1]["texto"])
        self.assertNotIn(self.alex["id"], self.estado["presidente"]["cola"])

    def test_la_cola_no_repite_la_misma_entrega(self):
        falso = Falso(hermes=(1, ""))
        sin = lambda n: n == "hermes"  # noqa: E731
        self.atender(falso, existe=sin, lim={})
        self.atender(falso, existe=sin, lim={}, ahora=AHORA + P.ENFRIAMIENTO_S + 1)
        detalles = [e.get("detalle") for e in self.entregas() if e.get("detalle")]
        self.assertEqual(len(detalles), len(set(detalles)))

    def test_fuera_de_vista(self):
        self.atender(Falso(hermes=(1, "")), existe=lambda n: n == "hermes", lim={})
        self.assertEqual([self.alex["id"]], [m["id"] for m in P.fuera_de_vista(self.estado, [])])
        self.assertEqual([], P.fuera_de_vista(self.estado, [self.alex["id"]]))


class TestCartero(Base):
    def test_pasada_del_cartero_lleva_al_presidente(self):
        llamadas = []
        original = P.atender

        def falso(mensaje, estado, raiz=None, **kw):
            llamadas.append(mensaje["id"])
            return "cola"

        P.atender = falso
        try:
            C.atender(self.alex, "director-presidente", self.estado, raiz=self.raiz)
        finally:
            P.atender = original
        self.assertEqual([self.alex["id"]], llamadas)
        # En cola: no se da por atendido, la próxima pasada lo vuelve a intentar.
        self.assertEqual([], self.estado["atendidos"])
        self.assertEqual([(self.alex["id"], "director-presidente")],
                         C.que_hacer(self.chat(), self.estado))


class TestPublicarDesdeLaTerminal(unittest.TestCase):
    def test_publicar_de_hermes_con_sintesis(self):
        with tempfile.TemporaryDirectory() as tmp:
            anterior = os.environ.get("STARSEED_ROOT")
            os.environ["STARSEED_ROOT"] = tmp
            try:
                with redirect_stdout(io.StringIO()):
                    dc._principal(["publicar", "Síntesis: el A1 presta otra vez", "--de", "hermes",
                                   "--sintesis", "--modelo", "hermes/predeterminado"])
                    dc._principal(["publicar", "Informe de Cowork", "--de", "claude-cowork"])
                    dc._principal(["publicar", "Rutina", "--de", "director-produccion"])
            finally:
                if anterior is None:
                    os.environ.pop("STARSEED_ROOT", None)
                else:
                    os.environ["STARSEED_ROOT"] = anterior
            regs = dc.leer(raiz=tmp)
        h, c, d = regs
        self.assertEqual(("hermes", "director", "informe", "hermes", True),
                         (h["de"], h["rol"], h["tipo"], h["canal"], h["sintesis"]))
        self.assertEqual(("claude-cowork", "claude-cowork"), (c["de"], c["canal"]))
        self.assertNotIn("sintesis", c)
        self.assertEqual("mando", d["canal"])
        self.assertTrue(P.es_direccion(h) and P.es_direccion(c))
        self.assertFalse(P.es_direccion(d))

    def test_lineas_viejas_se_siguen_leyendo(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "starseed_memory_root/mando/director/chat.jsonl"
            ruta.parent.mkdir(parents=True)
            ruta.write_text(json.dumps({"id": "md-1-aaaa", "t": "2026-10-04T10:00:00+00:00", "de": "hermes",
                                        "rol": "director", "tipo": "informe", "texto": "viejo",
                                        "canal": "mando"}) + "\n", encoding="utf-8")
            self.assertEqual("viejo", dc.leer(raiz=tmp)[0]["texto"])


if __name__ == "__main__":
    unittest.main()
