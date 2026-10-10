# -*- coding: utf-8 -*-
"""PDA1011: el nodo de MetaGenesis con el arriendo en la PUERTA DE DATOS del A1.

La puerta es un simulador con las reglas de `servicios/puerta-datos/src/arriendo.mjs` reducidas
(toma libre o caducado, renueva el líder) y Supabase el PostgREST simulado de las pruebas del nodo.
Nada toca la red ni ~/.starseed.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as N  # noqa: E402
import nodo_metagenesis_bus as B  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402
from test_nodo_metagenesis import ENV, MedioFalso, Reloj, SupabaseSimulado, orden_firmada, publicar_orden  # noqa: E402

LLAVE = "llave-de-prueba-" + "k" * 20


class PuertaSimulada:
    def __init__(self, reloj):
        self.reloj = reloj
        self.caida = False
        self.lider, self.termino, self.expira, self.puntos = None, 0, 0.0, 0
        self.nodos = {}
        self.llamadas = []
        self.ordenes = []
        self.resultados = []

    def disponible(self):
        return not self.caida

    def metagenesis_latir(self, nodo, llave, medio, puntos, datos=None, ttl_s=900):
        self.llamadas.append(("latir", nodo))
        if self.caida or llave != LLAVE:
            return None
        t = self.reloj()
        self.nodos[nodo] = {"nodo": nodo, "medio": medio, "puntos": puntos, "datos": datos, "ts": t}
        if puntos >= 0 and (self.lider in (None, nodo) or self.expira < t):
            self.termino += 0 if self.lider == nodo else 1
            self.lider, self.expira, self.puntos = nodo, t + ttl_s, puntos
        mias = [o for o in self.ordenes if o["para"] in (nodo, medio) or (o["para"] == "lider" and self.lider == nodo)]
        self.ordenes = [o for o in self.ordenes if o not in mias]
        return {"arriendo": {"lider": self.lider, "termino": self.termino, "puntos": self.puntos},
                "nodos": [n for n in self.nodos.values() if n["ts"] > t - ttl_s], "ordenes": mias}

    def metagenesis(self, accion, nodo, llave, **extra):
        self.llamadas.append((accion, nodo))
        if self.caida:
            return None
        if accion == "orden-resultado":
            self.resultados.append(extra)
        if accion == "ceder" and self.lider == nodo:
            self.expira = 0
        return True


def nodo_puerta(sb, puerta, reloj, medio_falso, huella, env=ENV, llave=LLAVE):
    return N.Nodo(env=dict(env), medir=medio_falso.medir, ejecutar=medio_falso.ejecutar, http=sb, reloj=reloj,
                  memoria={"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True}, persistir=False,
                  huella=huella, chat=lambda texto: None, llave=llave, puerta=puerta)


def bus(sb, metodo):
    return [u for m, u in sb.llamadas if m == metodo and "/relevo_eventos" in u]


class TestNodoPorLaPuerta(unittest.TestCase):
    def setUp(self):
        self.reloj = Reloj()
        self.sb = SupabaseSimulado(self.reloj)
        self.puerta = PuertaSimulada(self.reloj)

    def test_el_lider_sale_del_arriendo_y_el_bus_se_lee_cada_10_min_no_cada_vuelta(self):
        n = nodo_puerta(self.sb, self.puerta, self.reloj, MedioFalso(), "mac-1")
        for _ in range(15):  # 30 min de vueltas del líder (cada 120 s)
            i = n.vuelta()
            self.reloj.t += 120
        self.assertEqual(i["enlace"], "puerta")
        self.assertTrue(i["soy_lider"])
        self.assertEqual(i["motivo_lider"], "arriendo en la puerta de datos")
        lecturas, escrituras = bus(self.sb, "GET"), bus(self.sb, "POST")
        self.assertLessEqual(len(lecturas), 4)                       # antes: 15 (una por vuelta)
        self.assertLessEqual(len(self.sb.de_tipo(L.T_LATIDO)), 3)    # espejo cada 10 min (antes: 6)
        self.assertGreaterEqual(len(self.sb.de_tipo(L.T_LATIDO)), 2)  # la vista del OS lo sigue viendo vivo
        self.assertEqual(self.sb.de_tipo(L.T_LIDER), [])              # el mando ya no se reclama en el bus
        self.assertEqual(sum(1 for a, _ in self.puerta.llamadas if a == "latir"), 15)
        self.assertLess(len(lecturas) + len(escrituras), 15)

    def test_dos_medios_por_la_puerta_tienen_un_solo_lider(self):
        mac = nodo_puerta(self.sb, self.puerta, self.reloj, MedioFalso(medio="mac"), "mac-1")
        a1 = nodo_puerta(self.sb, self.puerta, self.reloj, MedioFalso(medio="oracle-a1", autoritativo=False), "a1-1")
        for _ in range(4):
            im, ia = mac.vuelta(), a1.vuelta()
            self.reloj.t += 300
        self.assertTrue(im["soy_lider"])
        self.assertFalse(ia["soy_lider"])
        self.assertEqual(im["lider"], ia["lider"])
        self.assertIn(a1.yo, im["vivos"])

    def test_puerta_caida_sigue_por_el_bus_en_la_misma_vuelta_y_vuelve_sola(self):
        n = nodo_puerta(self.sb, self.puerta, self.reloj, MedioFalso(), "mac-1")
        n.vuelta()
        self.reloj.t += 120
        self.puerta.caida = True
        i = n.vuelta()
        self.assertTrue(i["enlace"].startswith("bus"))
        self.assertTrue(i["soy_lider"])           # el bus elige como siempre (su espejo ya decía quién mandaba)
        self.assertEqual(i["termino"], 1)          # sin saltar de término: no hay relevo por el corte
        self.reloj.t += 120
        self.assertEqual(n.vuelta()["enlace"], "bus")  # sin rebotar contra la puerta caída
        self.puerta.caida = False
        self.reloj.t += N.PUERTA_REINTENTO_S
        self.assertEqual(n.vuelta()["enlace"], "puerta")

    def test_llave_sin_dar_de_alta_no_rebota_cada_vuelta(self):
        n = nodo_puerta(self.sb, self.puerta, self.reloj, MedioFalso(), "mac-1", llave="otra-llave-" + "x" * 20)
        for _ in range(3):
            n.vuelta()
            self.reloj.t += 120
        self.assertEqual(sum(1 for a, _ in self.puerta.llamadas if a == "latir"), 1)
        self.assertIn("puerta_motivo", n.mem)

    def test_orden_firmada_del_bus_y_orden_de_la_puerta(self):
        n = nodo_puerta(self.sb, self.puerta, self.reloj, MedioFalso(), "mac-1")
        publicar_orden(self.sb, orden_firmada("pausar", t=self.reloj.t))
        self.puerta.ordenes.append({"id": 7, "accion": "reanudar", "args": {}, "para": "lider", "por": "cuenta-1",
                                    "t": B.iso(self.reloj.t)})
        i = n.vuelta()
        hechas = {o["accion"]: o["estado"] for o in i["ordenes"]}
        self.assertEqual(hechas.get("pausar"), "hecha")
        self.assertEqual(hechas.get("reanudar"), "hecha")
        self.assertEqual(len(self.sb.de_tipo(L.T_ORDEN_HECHA)), 1)    # la firmada responde por el bus
        self.assertEqual(self.puerta.resultados[0]["id"], 7)           # la de la puerta, por la puerta

    def test_orden_del_bus_sin_firma_se_rechaza(self):
        n = nodo_puerta(self.sb, self.puerta, self.reloj, MedioFalso(), "mac-1")
        o = orden_firmada("pausar", t=self.reloj.t)
        o["firma"] = "0" * 64
        publicar_orden(self.sb, o)
        i = n.vuelta()
        self.assertEqual(i["ordenes"][0]["estado"], "rechazada")
        self.assertTrue(n.mem.get("autonomia", True))

    def test_interruptor_apagada_es_el_bus_de_siempre(self):
        env = dict(ENV, STARSEED_NODO_PUERTA="apagada")
        n = nodo_puerta(self.sb, self.puerta, self.reloj, MedioFalso(), "mac-1", env=env)
        self.assertEqual(n.vuelta()["enlace"], "bus")
        self.assertEqual(self.puerta.llamadas, [])


if __name__ == "__main__":
    unittest.main()
