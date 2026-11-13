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


AVISO_PAUSA = (
    "\u23f8 This chat is paused. Hermes couldn't confirm how the last turn ended (usually because it "
    "restarted mid-turn): \"Diriges el enjambre\u2026\" Hermes won't re-run it by itself. Your message was "
    "not sent. To continue, run `hermes sessions discard 20260909_210504_867626 --yes`, or resume this "
    "session in an interactive chat and /discard the paused turn there; then send it again."
)
SESION = "20260909_210504_867626"


class FalsoHermesPausado:
    """`correr` falso de Hermes: la sesi\u00f3n (`--resume`) est\u00e1 en pausa mientras `pausada`; sin
    `--resume` contesta `fresca`. Guarda cada orden para ver qu\u00e9 se lanz\u00f3."""

    def __init__(self, pausada=True, fresca=(0, "Respuesta desde sesi\u00f3n nueva"), reanudada=(0, "Vuelvo")):
        self.pausada, self.fresca, self.reanudada = pausada, fresca, reanudada
        self.ordenes = []

    def __call__(self, orden, entrada=None, segundos=300, env=None, cwd=None):
        self.ordenes.append(list(orden))
        assert orden[0] == "hermes", orden
        assert "discard" not in orden and "sessions" not in orden  # jam\u00e1s se confirma el turno perdido
        if "--resume" in orden:
            return (3, AVISO_PAUSA) if self.pausada else self.reanudada
        return self.fresca


class TestHermesPausado(Base):
    def atender_h(self, falso, **kw):
        sin_claude = lambda n: n == "hermes"  # noqa: E731
        return P.atender(self.alex, self.estado, raiz=self.raiz, correr=falso, existe=sin_claude, limites={},
                         ahora=kw.pop("ahora", AHORA), tope_opus=40, sesion_hermes=SESION)

    def avisos(self):
        return [r for r in self.chat() if r.get("tipo") == "aviso"]

    def test_pausada_y_fresca_contesta_con_contexto_y_lo_dice(self):
        dc.publicar("Hilo previo de otro director", de="hermes", rol="director", tipo="informe", raiz=self.raiz)
        falso = FalsoHermesPausado()
        self.assertEqual("respondido", self.atender_h(falso))
        self.assertEqual(2, len(falso.ordenes))
        self.assertIn("--resume", falso.ordenes[0])
        self.assertNotIn("--resume", falso.ordenes[1])
        prompt_fresco = falso.ordenes[1][falso.ordenes[1].index("-z") + 1]
        self.assertIn("Hilo previo de otro director", prompt_fresco)
        self.assertIn("sesi\u00f3n nueva", prompt_fresco)
        r = self.respuestas()[-1]
        self.assertEqual("Respuesta desde sesi\u00f3n nueva", r["texto"])
        self.assertNotIn("paused", r["texto"])
        self.assertTrue(r["eleccion"]["sesionNueva"])
        self.assertIn("sesi\u00f3n nueva", r["eleccion"]["modelo"])
        self.assertIn("en pausa", r["eleccion"]["modelo"])
        self.assertEqual("hermes-sesion-nueva", r["uso"]["via"])
        self.assertEqual("respondido", self.entregas()[-1]["estado"])

    def test_pausada_y_fresca_falla_sigue_el_camino_de_fallo_sin_publicar_la_pausa(self):
        falso = FalsoHermesPausado(fresca=(1, "boom"))
        sin_codex = lambda n: n == "hermes"  # noqa: E731
        self.assertEqual("cola", self.atender_h(falso))
        self.assertEqual([], self.respuestas())
        self.assertFalse(any("paused" in (r.get("texto") or "") for r in self.chat()))
        self.assertIn("hermes", self.estado["presidente"]["enfriados"])
        self.assertEqual(1, len(self.avisos()))  # la pausa es real aunque la sesi\u00f3n nueva fallara
        del sin_codex

    def test_pausada_y_fresca_falla_pasa_al_siguiente_proveedor(self):
        class Dos(FalsoHermesPausado):
            def __call__(self, orden, **k):
                if orden[0] == "codex":
                    return (0, "Respuesta de Codex")
                return super().__call__(orden, **k)

        falso = Dos(fresca=(1, "boom"))
        r = P.atender(self.alex, self.estado, raiz=self.raiz, correr=falso, existe=lambda n: n != "claude",
                      limites={}, ahora=AHORA, tope_opus=40, sesion_hermes=SESION)
        self.assertEqual("respondido", r)
        self.assertEqual("chatgpt", self.respuestas()[-1]["eleccion"]["proveedor"])

    def test_sin_pausa_no_hay_aviso_ni_segunda_llamada(self):
        falso = FalsoHermesPausado(pausada=False)
        self.assertEqual("respondido", self.atender_h(falso))
        self.assertEqual(1, len(falso.ordenes))
        self.assertEqual([], self.avisos())
        r = self.respuestas()[-1]
        self.assertNotIn("sesionNueva", r["eleccion"])
        self.assertEqual("hermes/predeterminado", r["eleccion"]["modelo"])

    def test_aviso_una_vez_por_sesion_y_otra_pasado_un_dia(self):
        falso = FalsoHermesPausado()
        self.atender_h(falso)
        avisos = self.avisos()
        self.assertEqual(1, len(avisos))
        t = avisos[0]["texto"]
        self.assertIn(SESION, t)
        self.assertIn("hermes sessions discard %s --yes" % SESION, t)
        self.assertIn("en pausa", t)
        self.assertIn("sesiones nuevas", t)
        self.assertEqual(("cartero", "sistema", "mando"), (avisos[0]["de"], avisos[0]["rol"], avisos[0]["canal"]))
        # Otro mensaje, misma sesi\u00f3n en pausa: no se repite.
        otro = dc.publicar("Otra pregunta", de="alex", rol="alex", tipo="mensaje",
                           canales=["director-presidente"], raiz=self.raiz)
        P.atender(otro, self.estado, raiz=self.raiz, correr=falso, existe=lambda n: n == "hermes",
                  limites={}, ahora=AHORA + 3600, tope_opus=40, sesion_hermes=SESION)
        self.assertEqual(1, len(self.avisos()))
        # Un d\u00eda despu\u00e9s y sigue en pausa: otra vez.
        otro2 = dc.publicar("Y otra", de="alex", rol="alex", tipo="mensaje",
                            canales=["director-presidente"], raiz=self.raiz)
        P.atender(otro2, self.estado, raiz=self.raiz, correr=falso, existe=lambda n: n == "hermes",
                  limites={}, ahora=AHORA + P.REAVISO_PAUSA_S + 1, tope_opus=40, sesion_hermes=SESION)
        self.assertEqual(2, len(self.avisos()))

    def test_al_reabrirse_vuelve_sola_y_lo_dice_una_vez(self):
        falso = FalsoHermesPausado()
        self.atender_h(falso)
        falso.pausada = False
        otro = dc.publicar("Ya?", de="alex", rol="alex", tipo="mensaje",
                           canales=["director-presidente"], raiz=self.raiz)
        r = P.atender(otro, self.estado, raiz=self.raiz, correr=falso, existe=lambda n: n == "hermes",
                      limites={}, ahora=AHORA + 600, tope_opus=40, sesion_hermes=SESION)
        self.assertEqual("respondido", r)
        self.assertEqual("Vuelvo", self.respuestas()[-1]["texto"])
        self.assertNotIn("sesionNueva", self.respuestas()[-1]["eleccion"])
        vueltas = [a for a in self.avisos() if "vuelve a estar abierta" in a["texto"]]
        self.assertEqual(1, len(vueltas))
        self.assertEqual({}, self.estado["hermes_pausas"])
        # Un tercer mensaje ya no repite nada.
        t = dc.publicar("Otra", de="alex", rol="alex", tipo="mensaje", canales=["director-presidente"],
                        raiz=self.raiz)
        P.atender(t, self.estado, raiz=self.raiz, correr=falso, existe=lambda n: n == "hermes", limites={},
                  ahora=AHORA + 700, tope_opus=40, sesion_hermes=SESION)
        self.assertEqual(1, len([a for a in self.avisos() if "vuelve a estar abierta" in a["texto"]]))
        self.assertEqual(1, len([a for a in self.avisos() if "est\u00e1 en pausa" in a["texto"]]))


class TestPromptSesionFresca(unittest.TestCase):
    def test_lleva_contexto_hilo_y_nota(self):
        hilo = [{"id": "a", "rol": "alex", "tipo": "mensaje", "texto": "uno"}]
        p = P.prompt_sesion_fresca("\u00bfy ahora?", hilo, "CTX")
        self.assertIn("sesi\u00f3n nueva", p)
        self.assertIn("CTX", p)
        self.assertIn("uno", p)
        self.assertIn("\u00bfy ahora?", p)

    def test_acotado_descarta_lo_mas_antiguo_y_conserva_la_pregunta(self):
        hilo = [{"id": str(i), "rol": "alex", "tipo": "mensaje", "texto": ("m%02d " % i) * 300} for i in range(20)]
        p = P.prompt_sesion_fresca("PREGUNTA FINAL", hilo, "c" * 8000, tope=6000)
        self.assertLessEqual(len(p), 6000)
        self.assertIn("PREGUNTA FINAL", p)
        self.assertIn("m19", p)
        self.assertNotIn("m00", p)


# ── PET1112I: Tests de manejo de encargos ──────────────────────────────────────

def mensaje_encargo(enc_id="ENC-1112-1430", titulo="Desarrollo de síntesis"):
    """Crea un mensaje de aviso de encargo como lo envía peticiones-a1."""
    texto = (f"Nuevo encargo {enc_id}: «{titulo}» · 3 frentes (F1 Investigación, F2 Desarrollo, F3 Plan y listas de tareas) · 6 entregables")
    return {
        "id": f"md-{int(AHORA * 1000)}-abcd",
        "t": "2026-11-12T10:00:00+00:00",
        "de": "peticiones-a1",
        "rol": "sistema",
        "tipo": "aviso",
        "texto": texto,
        "canal": "director-presidente",
        "canales": ["director-presidente"],
        "tarea": enc_id,
    }


def mensaje_2d3d(enc_id="ENC-1112-1430", frente="F2 Desarrollo", tipo="blender", titulo="Escena Blender"):
    """Crea un mensaje de entregable 2D/3D como lo envía peticiones-a1."""
    texto = f"Entregable 2D/3D para la Mac: {enc_id} · {frente} · {titulo} ({tipo})"
    return {
        "id": f"md-{int(AHORA * 1000)}-efgh",
        "t": "2026-11-12T10:00:00+00:00",
        "de": "peticiones-a1",
        "rol": "sistema",
        "tipo": "aviso",
        "texto": texto,
        "canal": "director-presidente",
        "canales": ["director-presidente"],
        "tarea": f"{enc_id}/{frente}/{tipo}",
    }


class TestPET1112IEncargo(unittest.TestCase):
    """Tests para el manejo de encargos del A1 (PET1112I)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.estado = {"atendidos": []}

    def tearDown(self):
        self.tmp.cleanup()

    def test_es_mensaje_encargo_detecta_correctamente(self):
        """es_mensaje_encargo detecta mensajes de peticiones-a1 con tipo aviso."""
        msg = mensaje_encargo()
        self.assertTrue(P.es_mensaje_encargo(msg))

        # No es encargo si viene de Alex
        msg_alex = dict(msg, de="alex", rol="alex")
        self.assertFalse(P.es_mensaje_encargo(msg_alex))

        # No es encargo si no es tipo aviso
        msg_otro = dict(msg, tipo="mensaje")
        self.assertFalse(P.es_mensaje_encargo(msg_otro))

    def test_extraer_datos_encargo_parsea_texto(self):
        """extraer_datos_encargo extrae ID, título, frentes y entregables del texto."""
        msg = mensaje_encargo("ENC-1112-1430", "Desarrollo de síntesis")
        datos = P.extraer_datos_encargo(msg)

        self.assertIsNotNone(datos)
        self.assertEqual(datos["encargo_id"], "ENC-1112-1430")
        self.assertEqual(datos["titulo"], "Desarrollo de síntesis")
        self.assertEqual(datos["n_frentes"], 3)
        self.assertEqual(datos["n_entregables"], 6)
        self.assertIn("F1 Investigación", datos["frentes_str"])
        self.assertIn("F2 Desarrollo", datos["frentes_str"])

    def test_extraer_datos_encargo_none_si_formato_invalido(self):
        """extraer_datos_encargo devuelve None si el texto no tiene el formato esperado."""
        msg = dict(mensaje_encargo(), texto="Mensaje sin formato de encargo")
        self.assertIsNone(P.extraer_datos_encargo(msg))

    def test_prompt_revisar_plan_incluye_info_encargo(self):
        """prompt_revisar_plan genera prompt con info del encargo y reglas JSON."""
        datos = {"encargo_id": "ENC-1112-1430", "titulo": "Test", "n_frentes": 2, "n_entregables": 4, "frentes_str": "F1, F2"}
        hilo = [{"id": "x1", "rol": "alex", "tipo": "mensaje", "texto": "Contexto previo"}]
        prompt = P.prompt_revisar_plan(datos, hilo, "CONTEXTO PROYECTO")
        
        self.assertIn("ENC-1112-1430", prompt)
        self.assertIn("Test", prompt)
        self.assertIn("F1, F2", prompt)  # Se muestra como "Frentes: F1, F2"
        self.assertIn("Entregables totales: 4", prompt)
        self.assertIn("CONTEXTO PROYECTO", prompt)
        self.assertIn("Contexto previo", prompt)
        self.assertIn("SOLO el JSON", prompt)
        self.assertIn('"frentes"', prompt)

    def test_parsear_plan_mejorado_json_valido(self):
        """parsear_plan_mejorado extrae JSON válido de la respuesta."""
        respuesta = '{"frentes": [{"id": "F1", "nombre": "Investigación", "entregables": []}]}'
        plan = P.parsear_plan_mejorado(respuesta)

        self.assertIsNotNone(plan)
        self.assertEqual(len(plan["frentes"]), 1)
        self.assertEqual(plan["frentes"][0]["id"], "F1")

    def test_parsear_plan_mejorado_json_con_texto_alrededor(self):
        """parsear_plan_mejorado extrae JSON aunque venga con texto alrededor."""
        respuesta = "Aquí tienes el plan:\n```json\n{\"frentes\": [{\"id\": \"F1\"}]}\n```\nFin."
        plan = P.parsear_plan_mejorado(respuesta)

        self.assertIsNotNone(plan)
        self.assertEqual(len(plan["frentes"]), 1)

    def test_parsear_plan_mejorado_none_si_invalido(self):
        """parsear_plan_mejorado devuelve None si no hay JSON válido."""
        self.assertIsNone(P.parsear_plan_mejorado("Solo texto sin JSON"))
        self.assertIsNone(P.parsear_plan_mejorado('{"frentes": "no es lista"}'))

    def test_es_mensaje_entregable_2d3d_detecta_correctamente(self):
        """es_mensaje_entregable_2d3d detecta mensajes de entregable 2D/3D."""
        msg = mensaje_2d3d()
        self.assertTrue(P.es_mensaje_entregable_2d3d(msg))

        msg_normal = dict(msg, texto="Mensaje normal")
        self.assertFalse(P.es_mensaje_entregable_2d3d(msg_normal))

    def test_prompt_entregable_2d3d_incluye_solicitud(self):
        """prompt_entregable_2d3d genera prompt con la solicitud y contexto."""
        msg = mensaje_2d3d(tipo="hyperframes", titulo="Animación")
        hilo = [{"id": "x1", "rol": "alex", "tipo": "mensaje", "texto": "Contexto"}]
        prompt = P.prompt_entregable_2d3d(msg, hilo, "CONTEXTO")

        self.assertIn("Entregable 2D/3D para la Mac", prompt)
        self.assertIn("hyperframes", prompt.lower())
        self.assertIn("Animación", prompt)
        self.assertIn("CONTEXTO", prompt)
        self.assertIn("Contexto", prompt)


class TestPET1112IAtenderEncargo(Base):
    """Tests de atender() con mensajes de encargo (PET1112I)."""

    def atender_encargo(self, falso, msg=None, lim=None, ahora=AHORA, existe=None):
        msg = msg or mensaje_encargo()
        return P.atender(msg, self.estado, raiz=self.raiz, correr=falso, existe=existe or (lambda n: n == "claude"),
                         limites=limites() if lim is None else lim, ahora=ahora, tope_opus=40)

    def test_encargo_con_claude_devuelve_plan_mejorado(self):
        """Al recibir encargo, solo Claude contesta y devuelve plan mejorado (JSON)."""
        plan_json = json.dumps({
            "frentes": [
                {"id": "F1", "nombre": "Investigación MEJORADA", "destino": "fuentes", "estado": "pendiente",
                 "entregables": [{"tipo": "informe", "titulo": "Informe 1", "prompt": "Investiga"}]},
                {"id": "F2", "nombre": "Desarrollo MEJORADO", "destino": "produccion", "estado": "pendiente",
                 "entregables": [{"tipo": "documento", "titulo": "Guion", "prompt": "Escribe"},
                                 {"tipo": "video", "titulo": "Vídeo", "prompt": "Haz vídeo"}]},
            ]
        })
        falso = Falso(claude=claude_ok(plan_json))

        r = self.atender_encargo(falso)

        self.assertEqual("respondido", r)
        self.assertEqual(["claude"], falso.llamadas)
        resp = self.respuestas()[-1]
        self.assertTrue(resp["eleccion"].get("plan_mejorado"))
        self.assertIn("plan", resp["eleccion"])
        self.assertEqual(len(resp["eleccion"]["plan"]["frentes"]), 2)
        self.assertIn("Plan mejorado", resp["texto"])

    def test_encargo_sin_claude_queda_en_cola(self):
        """Si no hay Claude, el encargo queda en cola (solo Claude puede revisar planes)."""
        falso = Falso(hermes=(0, "Hermes no puede hacer JSON"))
        sin_claude = lambda n: n != "claude"

        r = self.atender_encargo(falso, lim={}, existe=sin_claude)

        self.assertEqual("cola", r)
        self.assertEqual([], self.respuestas())
        e = self.entregas()[-1]
        self.assertEqual("pendiente", e["estado"])
        self.assertIn("requerido para revisar planes", e["detalle"])

    def test_encargo_respuesta_no_json_vuelve_a_cola(self):
        """Si Claude responde sin JSON válido, se enfriada y queda en cola."""
        falso = Falso(claude=claude_ok("Esto no es JSON"))

        r = self.atender_encargo(falso)

        self.assertEqual("cola", r)
        self.assertEqual([], self.respuestas())
        self.assertIn("claude", self.estado["presidente"]["enfriados"])
        self.assertIn("JSON", self.estado["presidente"]["enfriados"]["claude"]["motivo"])


class TestPET1112IAtender2D3D(Base):
    """Tests de atender() con entregables 2D/3D (PET1112I)."""

    def atender_2d3d(self, falso, msg=None, lim=None, ahora=AHORA):
        msg = msg or mensaje_2d3d()
        return P.atender(msg, self.estado, raiz=self.raiz, correr=falso, existe=lambda n: True,
                         limites=limites() if lim is None else lim, ahora=ahora, tope_opus=40)

    def test_entregable_2d3d_claude_confirma(self):
        """Entregable 2D/3D: Claude confirma que se atiende en la Mac."""
        falso = Falso(claude=claude_ok("Confirmado: se producirá la escena Blender en la Mac."))

        r = self.atender_2d3d(falso)

        self.assertEqual("respondido", r)
        resp = self.respuestas()[-1]
        self.assertIn("Confirmado", resp["texto"])
        self.assertEqual("claude", resp["eleccion"]["proveedor"])


if __name__ == "__main__":
    unittest.main()
