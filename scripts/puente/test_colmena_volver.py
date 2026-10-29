# -*- coding: utf-8 -*-
"""Pruebas de «al volver» (COL1012H): lo que otro siguió mientras el aparato no latía.

Disco y bus falsos: una raíz temporal con sus `latidos-<cola>.json`, un `nov` con las
asignaciones del bus y un `enviar_puntos` que solo apunta lo que recibe. Nada toca la red,
git ni el bus de verdad. Comentarios en español con acentos, como pide el contrato.
"""
import json, os, shutil, sys, tempfile, unittest
from unittest.mock import patch

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as NM  # noqa: E402
import nodo_metagenesis_medio as M  # noqa: E402

AHORA = 1_800_000_000.0


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="volver-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.raiz = os.path.join(self.tmp, "repo")
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        casa = os.path.join(self.tmp, "casa")
        os.makedirs(casa)
        entorno = patch.dict(os.environ, {"HOME": casa})
        entorno.start()
        self.addCleanup(entorno.stop)

    def latidos(self, tareas, cola="cola-x.json"):
        datos = {"t": AHORA, "cola": cola, "medio": "mac", "tareas": tareas}
        with open(os.path.join(self.olas, "latidos-" + cola), "w", encoding="utf-8") as f:
            json.dump(datos, f)

    def salud(self, cola="cola-x"):
        return {"orquestadores": [{"cola": cola}], "periodo_s": 300}

    def nodo(self, enviar=None, memoria=None):
        n = NM.Nodo(seco=False, sin_red=True, memoria=memoria or {}, persistir=False,
                    huella="huella-volver", reloj=lambda: AHORA,
                    ejecutar=lambda *a, **k: ("nada", "ok"), enviar_puntos=enviar)
        n.yo, n.modo = "mac-1", "real"
        return n

    def nov(self, *asignaciones):
        return {"latidos": [], "bajas": [], "asignaciones": list(asignaciones)}

    def control(self, cola="cola-x.json"):
        with open(os.path.join(self.olas, "control-" + cola), encoding="utf-8") as f:
            return json.load(f)


class AlVolver(Base):
    def test_suelta_lo_que_otro_siguio_y_lo_demas_lo_sigue_el(self):
        self.latidos({"T1": {"fase": "escribiendo"}, "T2": {"fase": "tsc"}, "T3": {"fase": "hecho"}})
        enviados = []
        n = self.nodo(enviar=lambda **kw: enviados.append(kw) or True)
        nov = self.nov({"nodo": "a1", "ids": ["T1"], "ts": AHORA - 100},
                       {"nodo": "mac-1", "ids": ["T2"], "ts": AHORA - 100})
        informe = {}
        n._volver(self.raiz, self.salud(), nov, informe, AHORA, AHORA - 1000)
        self.assertEqual(self.control(), {"T1": {"accion": "soltar", "donde": "colmena",
                                                 "quien": "colmena", "t": "2027-01-15 08:00:00"}})
        self.assertEqual((enviados, informe["al_volver"]),
                         ([{"raiz": self.raiz, "ids": ["T1"], "t": AHORA}],
                          {"soltar": ["T1"], "seguir": ["T2"], "puntos": True}))

class Disparo(Base):
    def revisa(self, ultimo):
        n = self.nodo(memoria={"ultimo_latido": ultimo})
        medida = {"medio": "mac", "salud": self.salud(), "cap": {}, "raiz": self.raiz}
        with patch.object(NM.Nodo, "_volver") as volver, patch.object(n, "_medir", return_value=medida):
            n.vuelta()
        return volver

    def test_al_arrancar_o_tras_un_silencio_largo_revisa(self):
        self.revisa(AHORA - NM.C.silencio_max({"periodo_s": 300}) - 1).assert_called_once()
        self.revisa(0).assert_called_once()

    def test_una_vuelta_normal_no_revisa(self):
        self.revisa(AHORA - 60).assert_not_called()


class Umbral(unittest.TestCase):
    def test_silencio_max_manda_sobre_el_arranque(self):
        self.assertTrue(NM.debe_revisar_al_volver(AHORA, AHORA - 1000, 300))
        self.assertFalse(NM.debe_revisar_al_volver(AHORA, AHORA - 500, 300))
        self.assertTrue(NM.debe_revisar_al_volver(AHORA, 0, 300))
        self.assertFalse(NM.debe_revisar_al_volver(AHORA, AHORA - 1000, 600))


class EnviarPuntos(Base):
    def test_adapta_la_firma_y_no_finge_cuando_falla(self):
        visto = {}
        self.assertTrue(NM.enviar_puntos_al_a1(self.raiz, ["T1"], AHORA,
                                               enviar=lambda **kw: visto.update(kw) or True))
        self.assertEqual(visto["ids"], ["T1"])
        self.assertTrue(NM.enviar_puntos_al_a1(self.raiz, ["T1"], AHORA, enviar=lambda: True))
        self.assertTrue(NM.enviar_puntos_al_a1(self.raiz, ["T1"], AHORA, enviar=lambda ids: ids))
        self.assertFalse(NM.enviar_puntos_al_a1(self.raiz, ["T1"], AHORA, enviar=lambda **kw: False))
        self.assertFalse(NM.enviar_puntos_al_a1(self.raiz, [], AHORA, enviar=lambda **kw: True))


class Control(Base):
    def test_escribe_la_orden_con_el_mismo_formato_del_orquestador(self):
        cerrojos = os.path.join(self.tmp, "cerrojos")
        with open(os.path.join(self.olas, "control-cola-x.json"), "w", encoding="utf-8") as f:
            json.dump({"Z": {"accion": "reabrir"}}, f)
        hechos = NM.soltar_en_control(self.olas, "cola-x.json", ["T1"], AHORA, cerrojos=cerrojos)
        self.assertEqual(hechos, ["T1"])
        self.assertEqual(self.control(), {"Z": {"accion": "reabrir"},
                                          "T1": {"accion": "soltar", "donde": "colmena",
                                                 "quien": "colmena", "t": "2027-01-15 08:00:00"}})
        self.assertTrue(os.path.exists(os.path.join(cerrojos, "control-control-cola-x.json.lock")))
        self.assertEqual(NM.soltar_en_control(self.olas, "cola-x.json", [], AHORA, cerrojos=cerrojos), [])

