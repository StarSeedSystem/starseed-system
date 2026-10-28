# -*- coding: utf-8 -*-
"""Pruebas PURAS de nodo_metagenesis_logica (INS1027F) que no estaban en test_nodo_metagenesis.py.

Aquí: la neurona INSOMNE suma `PUNTOS_INSOMNE` de estabilidad para liderar y para recibir
préstamos, sin disparar por sí sola el relevo ordenado de `MARGEN_RELEVO` y quedando bajo el
A1 siempre encendido. Nada toca red ni disco: todo son capacidades y latidos de mentira.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

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


if __name__ == "__main__":
    unittest.main()

