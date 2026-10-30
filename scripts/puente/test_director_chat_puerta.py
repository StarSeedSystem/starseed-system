#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas puras del chat del director compartido por la puerta (IND1029H)."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import director_chat as dc


def _mensaje(idm="md-1-aaaa", t="2026-10-30T10:00:00+01:00", de="nodo-nube", texto="hola"):
    return {
        "id": idm,
        "t": t,
        "de": de,
        "rol": "director",
        "tipo": "informe",
        "texto": texto,
        "canal": "mando",
    }


def _latido(idm, mensaje):
    return {"id": "chat." + idm, "datos": mensaje, "t": mensaje["t"]}


class PruebasPaquete(unittest.TestCase):
    def test_paquete_con_campos_esenciales(self):
        p = dc.paquete_puerta(_mensaje())
        self.assertEqual(p["id"], "md-1-aaaa")
        self.assertEqual(p["de"], "nodo-nube")
        self.assertEqual(p["texto"], "hola")
        self.assertNotIn("uso", p)

    def test_paquete_solo_con_extras_presentes(self):
        m = dict(_mensaje(), canales=["telegram"], modelo="m/x")
        p = dc.paquete_puerta(m)
        self.assertEqual(p["canales"], ["telegram"])
        self.assertEqual(p["modelo"], "m/x")
        self.assertNotIn("respondeA", p)


class PruebasTocaLaPuerta(unittest.TestCase):
    def test_solo_produccion_con_raiz_del_sistema(self):
        self.assertTrue(dc.toca_la_puerta(raiz=None, pruebas=False))
        self.assertFalse(dc.toca_la_puerta(raiz="/temporal", pruebas=False))
        self.assertFalse(dc.toca_la_puerta(raiz=None, pruebas=True))


class PruebasEnPuerta(unittest.TestCase):
    def _puerta_falsa(self, disponible=True, respuesta=None):
        latidos = []

        class Falsa:
            configurada = lambda s: True  # noqa: E731

            def disponible(self):
                return disponible

            def latido(self, clase, ident, datos, respaldo=None):
                latidos.append({"clase": clase, "id": ident, "datos": datos})
                return respuesta or {"via": "puerta", "ok": True}

        return Falsa(), latidos

    def test_deja_el_enjambre_con_id_de_mensaje(self):
        p, latidos = self._puerta_falsa()
        self.assertEqual(dc.publicar_en_puerta(_mensaje("md-2-bbbb"), puerta=p), "puerta")
        self.assertEqual(latidos[0]["clase"], dc.CLASE_PUERTA)
        self.assertEqual(latidos[0]["id"], "chat.md-2-bbbb")
        self.assertEqual(latidos[0]["datos"]["texto"], "hola")

    def test_sin_puerta_devuelve_sin_puerta(self):
        p, _ = self._puerta_falsa(disponible=False)
        self.assertEqual(dc.publicar_en_puerta(_mensaje(), puerta=p), "sin-puerta")

    def test_respuesta_con_via_cola_es_fallo(self):
        p, _ = self._puerta_falsa(respuesta={"via": "cola"})
        self.assertEqual(dc.publicar_en_puerta(_mensaje(), puerta=p), "fallo")

    def test_latido_repetido_mismo_id_una_vez(self):
        # En la puerta el latido se guarda por id: publicar dos veces no lo duplica.
        p, latidos = self._puerta_falsa()
        dc.publicar_en_puerta(_mensaje("md-3-cccc"), puerta=p)
        dc.publicar_en_puerta(_mensaje("md-3-cccc"), puerta=p)
        claves = [(l["clase"], l["id"]) for l in latidos]
        self.assertEqual(len(claves), 2)  # dos envíos, misma clave
        unicos = {l["id"] for l in latidos}
        self.assertEqual(len(unicos), 1)


class PruebasMensajesPuerta(unittest.TestCase):
    def test_unicos_por_id_y_del_mas_viejo_al_mas_nuevo(self):
        t1 = "2026-10-30T10:00:00+01:00"
        t2 = "2026-10-30T10:01:00+01:00"
        m1 = _mensaje("md-4-dddd", t=t1)
        m2 = _mensaje("md-4-dddd", t=t2, texto="hola corregido")
        m3 = _mensaje("md-5-eeee", t=t2)
        fuera = dc.mensajes_puerta([_latido("md-4-dddd", m1), _latido("md-4-dddd", m2),
                                    _latido("md-5-eeee", m3)])
        self.assertEqual([m["id"] for m in fuera], ["md-4-dddd", "md-5-eeee"])
        self.assertEqual(fuera[0]["texto"], "hola corregido")

    def test_ignora_estado_y_datos_raros(self):
        latidos = [
            {"id": "estado.progreso", "datos": {"a": 1}},
            {"id": "chat.md-6-ffff", "datos": "no-mensaje"},
            {"id": "chat.md-7-gggg", "datos": {"id": "md-7-gggg"}},
            "rozado",
        ]
        self.assertEqual(dc.mensajes_puerta(latidos), [])


class PruebasRecoger(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        Path(self.raiz, "starseed_memory_root", "mando", "director").mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_pendientes_descarta_lo_integrado(self):
        dc.publicar("local", de="director", raiz=self.raiz)
        muevo = _mensaje("md-8-hhhh", de="nodo-nube")
        latidos = [_latido("md-8-hhhh", muevo)] + [
            _latido(r["id"], r) for r in dc.leer(raiz=self.raiz) if r.get("id")
        ]
        recogidos = dc.recoger_puerta(pedir=lambda: latidos, raiz=self.raiz)
        self.assertEqual([m["id"] for m in recogidos], ["md-8-hhhh"])
        self.assertEqual(dc.recoger_puerta(pedir=lambda: [], raiz=self.raiz), [])

    def test_recogidos_se_incorporan_y_no_vuelven(self):
        muevo = _mensaje("md-9-iiii", de="nodo-nube")
        latidos = [_latido("md-9-iiii", muevo)]
        dc.incorporar(dc.recoger_puerta(pedir=lambda: latidos, raiz=self.raiz), raiz=self.raiz)
        ids = [r["id"] for r in dc.leer(limite=50, raiz=self.raiz)]
        self.assertIn("md-9-iiii", ids)
        self.assertEqual(dc.recoger_puerta(pedir=lambda: latidos, raiz=self.raiz), [])

    def test_incorporar_nada_nada_escribe(self):
        self.assertEqual(dc.incorporar([], raiz=self.raiz), [])
        self.assertEqual(dc._ids_locales(self.raiz), set())

    def test_sin_puerta_devuelve_vacia(self):
        p = type("Falsa", (), {"configurada": lambda s: False})()
        self.assertEqual(dc.recoger_puerta(puerta=p, raiz=self.raiz), [])


if __name__ == "__main__":
    unittest.main()
