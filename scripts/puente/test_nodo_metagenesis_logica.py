# -*- coding: utf-8 -*-
"""Pruebas PURAS de nodo_metagenesis_logica (INS1027F) que no estaban en test_nodo_metagenesis.py.

Aquí: la neurona INSOMNE suma `PUNTOS_INSOMNE` de estabilidad para liderar y para recibir
préstamos, sin disparar por sí sola el relevo ordenado de `MARGEN_RELEVO` y quedando bajo el
A1 siempre encendido. Nada toca red ni disco: todo son capacidades y latidos de mentira.

(RESC1031C) También: lo agotado (`bloqueada` + `alta_capacidad`, o más de 2 «RT» delante) es del carril
de alta capacidad y ni el rescate de colas-fuente ni el relevo de un aparato perdido lo devuelven al
enjambre gratuito. La última clase prueba `Nodo._relevar` con bus, reloj y progreso falsos.
"""
import os
import sys
import types
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as N  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402

T0 = 1_793_520_000.0  # 2026-10-27 ~12:00 UTC
HASTA = T0 + 2 * 3600  # sesión insomne vigente dos horas más
ACABADA = T0 - 60  # sesión que terminó hace un minuto


def cap_neurona(**anade):
    base = {"medio": "neurona", "modo": "real", "repo": True, "orquestador": True,
            "ram_libre_mb": 2048, "disco_gb": 20}
    base.update(anade)
    return base


def latido_ocioso(nodo, puntos):
    """Un latido que pasa `medio_ocioso`: real, con repo y orquestador, sin cola, con disco."""
    return {"nodo": nodo, "modo": "real", "puntos": puntos, "ts": T0, "secreto": True,
            "salud": {"repo": True, "orquestador": True, "disco_gb": 30, "ram_libre_mb": 8000}}


class TestInsomneVigente(unittest.TestCase):
    def test_sin_sesion(self):
        self.assertFalse(L.insomne_vigente({}))
        self.assertFalse(L.insomne_vigente(cap_neurona()))

    def test_activa_no_vigente(self):
        i = {"activo": True, "hasta": ACABADA}
        self.assertTrue(L.insomne_vigente(cap_neurona(insomne=i)))  # sin reloj, se confía
        self.assertFalse(L.insomne_vigente(cap_neurona(insomne=i), T0))  # con reloj, caducó

    def test_vigente_con_reloj(self):
        i = {"activo": True, "hasta": HASTA}
        self.assertTrue(L.insomne_vigente(cap_neurona(insomne=i), T0))

    def test_hasta_ilegible(self):
        i = {"activo": True, "hasta": "sin leer"}
        self.assertTrue(L.insomne_vigente(cap_neurona(insomne=i), T0))  # con activo, se confía

    def test_inactivo(self):
        i = {"activo": False, "hasta": HASTA}
        self.assertFalse(L.insomne_vigente(cap_neurona(insomne=i), T0))


class TestPuntosInsomne(unittest.TestCase):
    def test_suma_solo_vigente(self):
        sin = L.puntos_nodo(cap_neurona())
        activa = cap_neurona(insomne={"activo": True, "hasta": T0 + 3600})
        acabada = cap_neurona(insomne={"activo": True, "hasta": ACABADA})
        self.assertEqual(sin, L.puntos_nodo(acabada, T0))
        self.assertEqual(L.puntos_nodo(activa, T0), sin + L.PUNTOS_INSOMNE)

    def test_solo_inso_mueve(self):
        base = L.puntos_nodo(cap_neurona())
        self.assertEqual(base + L.PUNTOS_INSOMNE,
                         L.puntos_nodo(cap_neurona(insomne={"activo": True, "hasta": T0 + 3600}), T0))

    def test_por_debajo_del_a1(self):
        self.assertLess(L.MEDIOS["neurona"]["base"] + L.PUNTOS_INSOMNE,
                        L.MEDIOS["oracle-a1"]["base"])

    def test_no_dispara_relevo_solo(self):
        self.assertLess(L.PUNTOS_INSOMNE, L.MARGEN_RELEVO)


class TestLiderarYPrestamos(unittest.TestCase):
    def test_elegir_lider_sin_lider_insomne_gana_entre_iguales(self):
        # Sin líder vigente: entre dos neuronas iguales, la insomne suma y se pone al mando.
        vivos = {"neurona-aaaaaa": {"nodo": "neurona-aaaaaa", "puntos": L.MEDIOS["neurona"]["base"],
                                    "ts": T0, "desde": T0}}
        d = L.elegir_lider("neurona-bbbbbb", L.MEDIOS["neurona"]["base"] + L.PUNTOS_INSOMNE,
                           vivos, [], [], T0)
        self.assertEqual(d["lider"], "neurona-bbbbbb")
        self.assertTrue(d["reclamar"])

    def test_insomne_no_tira_al_lider_por_estar_insomne(self):
        # Líder A1 vivo (250): una neurona insomne (120+80=200 < 250+100) no le dispara relevo.
        vivos = {"oracle-a1-ffffff": {"nodo": "oracle-a1-ffffff", "puntos": L.MEDIOS["oracle-a1"]["base"],
                                      "ts": T0, "desde": T0 - 10 * L.ESTABLE_S}}
        d = L.elegir_lider("neurona-bbbbbb", L.MEDIOS["neurona"]["base"] + L.PUNTOS_INSOMNE,
                           vivos, [], [], T0)
        self.assertEqual(d["lider"], "oracle-a1-ffffff")
        self.assertFalse(d["reclamar"])

    def test_insomne_no_tira_al_lider_igual_medio(self):
        # Líder neurona vivo (con su reclamo vigente): la insomne queda 80 por delante, menos que
        # MARGEN_RELEVO (100): no hay baile de líderes por solo estar insomne.
        vivos = {"neurona-aaaaaa": {"nodo": "neurona-aaaaaa", "puntos": L.MEDIOS["neurona"]["base"],
                                    "ts": T0, "desde": T0 - 10 * L.ESTABLE_S}}
        reclamos = [{"nodo": "neurona-aaaaaa", "termino": 1, "puntos": L.MEDIOS["neurona"]["base"]}]
        d = L.elegir_lider("neurona-bbbbbb", L.MEDIOS["neurona"]["base"] + L.PUNTOS_INSOMNE,
                            vivos, reclamos, [], T0)
        self.assertEqual(d["lider"], "neurona-aaaaaa")
        self.assertFalse(d["reclamar"])

    def test_prestamo_prefiere_al_insomne(self):
        # Mejor medio ocioso para un préstamo: a igualdad de medio y salud, la insomne (más puntos).
        nodos = {"neurona-aaaaaa": latido_ocioso("neurona-aaaaaa", L.MEDIOS["neurona"]["base"]),
                 "neurona-bbbbbb": latido_ocioso("neurona-bbbbbb",
                                                 L.MEDIOS["neurona"]["base"] + L.PUNTOS_INSOMNE)}
        self.assertEqual(L.mejor_medio_ocioso(nodos), "neurona-bbbbbb")


# ─── RESC1031C · lo agotado es del carril de alta capacidad: ni rescate ni relevo ─────────────

HONDO = "RTRTRTS1010-EV-ORACLE-1acbbb"  # tres «RT» delante: la cadena de rescates se agotó (RESC1031A)
EN_ALTA = {"estado": "bloqueada", "bloqueante": True, "alta_capacidad": True,
           "nota": "cadena de rescates agotada: carril de alta capacidad · lleva 3 niveles de rescate"}


class TestEsDeAltaCapacidad(unittest.TestCase):
    def test_la_marca_del_progreso_o_la_cadena_agotada(self):
        self.assertTrue(L.es_de_alta_capacidad("X1", EN_ALTA))
        self.assertTrue(L.es_de_alta_capacidad("X1", {"estado": "bloqueada", "bloqueante": True,
                                                       "alta_capacidad": True}))  # la escalera agotada
        self.assertTrue(L.es_de_alta_capacidad(HONDO, None))  # aún sin entrada en el progreso

    def test_lo_demas_sigue_su_camino(self):
        for tid, entrada in (("X1", None), ("X1", "commit"), ("X1", {"estado": "bloqueada"}),
                             ("RTRTX1b-d1", {"estado": "pendiente"}), ("X1", {"alta_capacidad": "si"})):
            self.assertFalse(L.es_de_alta_capacidad(tid, entrada), (tid, entrada))


class TestRescateSinLoDeAltaCapacidad(unittest.TestCase):
    def test_no_rescata_lo_que_lleva_el_carril_de_alta_capacidad(self):
        tareas = [{"id": i, "titulo": i, "archivos": ["src/a.ts"], "prompt": "haz " + i}
                  for i in ("A1", "A2", "A3", "A4", HONDO)]
        progreso = {"A2": EN_ALTA, "A3": {"estado": "bloqueada", "alta_capacidad": True},
                    "A4": {"estado": "bloqueada"}}
        cands = L.candidatos_rescate([("cola-buena.json", T0 - 3600, tareas)], set(), progreso, [], T0)
        self.assertEqual([c["id"] for c in cands], ["A1", "A4"])  # A4 sin la marca se rescata como siempre


class TestRelevoSinLoAgotado(unittest.TestCase):
    """`Nodo._relevar` sigue lo que un aparato perdido dejó a medias, salvo lo del carril de alta capacidad."""

    def _vuelta(self, progreso, ids=(HONDO, "T3", "T1", "T2")):
        prestadas = []
        tareas = [{"id": i, "titulo": i, "prompt": "haz " + i, "archivos": ["a.py"]} for i in ids]
        n = N.Nodo(seco=False, sin_red=True, env={}, medir=lambda m, t: {}, ejecutar=lambda *a: ("hecha", "ok"),
                   reloj=lambda: T0, memoria={"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True},
                   persistir=False, huella="huella-prueba", candidatos=lambda raiz: list(tareas))
        n.yo, n.modo = "a1", "real"
        n.enlace = types.SimpleNamespace(modo="bus", asignar=lambda *a: True, decision=lambda d: True,
                                         ultimas_colas=lambda: [])
        n._prestar_relevo = lambda tid, destino, tarea, motivo, informe, t: prestadas.append(tid) or True
        salud = {"periodo_s": 300, "contenedor": {"activo": True, "agentes": 2}}  # el A1 tiene 2 huecos
        mac = {"nodo": "mac-1", "ts": T0 - 3600, "medio": "mac", "modo": "real",
               "salud": dict(salud, en_curso=[{"id": i, "fase": "escribiendo"} for i in ids])}
        a1 = {"nodo": "a1", "ts": T0 - 30, "medio": "oracle-a1", "modo": "real", "salud": dict(salud, en_curso=[])}
        nov = {"latidos": [mac, a1], "bajas": [{"nodo": "mac-1", "ts": T0 - 5, "traspaso": True}],
               "asignaciones": []}
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        with mock.patch.object(N.M, "leer_json", return_value=progreso):
            n._relevar(nov, {x["nodo"]: x for x in nov["latidos"]}, "/no/existe", informe, T0)
        return prestadas, informe

    def test_no_sigue_lo_agotado_ni_le_quita_el_hueco_a_otra(self):
        prestadas, informe = self._vuelta({"T3": EN_ALTA})
        self.assertEqual(sorted(prestadas), ["T1", "T2"])  # HONDO (por el id) y T3 (por el progreso) quedan fuera
        quietas = [d["id"] for d in informe["relevo"] if "alta capacidad" in d["resultado"]]
        self.assertEqual(sorted(quietas), sorted([HONDO, "T3"]))  # una decisión por tarea que no se releva

    def test_si_todo_lo_que_dejo_es_de_alta_capacidad_no_hay_relevo(self):
        prestadas, informe = self._vuelta({"T3": EN_ALTA}, ids=(HONDO, "T3"))
        self.assertEqual(prestadas, [])
        self.assertEqual(len(informe["relevo"]), 2)


if __name__ == "__main__":
    unittest.main()

