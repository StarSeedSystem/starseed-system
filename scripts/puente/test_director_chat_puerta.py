#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas puras de director_chat ↔ puerta de datos del A1 (IND1029H)."""

import os
import sys
import tempfile
import unittest
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_chat as dc

ISO = "2026-10-29T12:00:00+00:00"


class PuertaFalsa:
    def __init__(self, latidos=None):
        self.latidos, self.publicados, self.rutas = list(latidos or []), [], []

    def latido(self, clase, ident, datos, respaldo=None):
        self.publicados.append({"clase": clase, "id": ident, "datos": datos})
        return {"via": "puerta"}

    def _pedir(self, metodo, ruta, cuerpo=None, timeout=8):
        self.rutas.append(ruta)
        return 200, {"latidos": self.latidos}


@contextmanager
def puerta_falsa(cliente):
    """Sustituye la puerta del módulo (fábrica y cachés) y la deja como estaba."""
    previa = (dc._PUERTA_FABRICA, dc._puerta_instancia, dc._puerta_chat_ultimo,
              dc._puerta_chat_lista, dc._puerta_vistos.copy())
    dc._PUERTA_FABRICA = (lambda: cliente) if cliente is not None else None
    dc._puerta_instancia, dc._puerta_chat_ultimo = None, 0.0
    dc._puerta_chat_lista, dc._puerta_vistos = [], set()
    try:
        yield cliente
    finally:
        (dc._PUERTA_FABRICA, dc._puerta_instancia, dc._puerta_chat_ultimo,
         dc._puerta_chat_lista, dc._puerta_vistos) = previa


def latido(t="md-1-abcd", texto="hola", datos=None, tiso=ISO):
    return {"clase": "servicio", "id": dc.PREFIJO_ID_CHAT + t, "t": tiso,
            "datos": datos if datos is not None else {"id": t, "t": tiso, "texto": texto}}


class PruebasPuras(unittest.TestCase):
    def test_identificador_y_lo_que_viaja_a_la_puerta(self):
        self.assertEqual(dc.id_puerta_del_mensaje("md-1699-abcd"), "chat.md-1699-abcd")
        self.assertEqual(dc.a_puerta({"texto": "x" * 20}, tope_texto=5)["texto"], "xxxxx")
        self.assertEqual(len(dc.a_puerta({"texto": "x" * 9999})["texto"]), dc.TOPE_TEXTO_PUERTA)
        self.assertEqual(dc.a_puerta({"texto": "x" * 9}, tope_texto=-2)["texto"], "")

    def test_de_puerta_reconstruye_y_saca_lo_que_no_es_chat(self):
        m = dc.de_puerta({"id": "chat.md-9-zzzz", "datos": {"texto": "hola"}})
        self.assertEqual((m or {}).get("id"), "md-9-zzzz")
        self.assertTrue(m and m.get("via_puerta"))
        self.assertIsNone(dc.de_puerta({"id": "estado.chat", "datos": {}}))
        self.assertIsNone(dc.de_puerta({"id": "chat.md-1-abcd", "datos": None}))
        self.assertIsNone(dc.de_puerta(None))

    def test_mensajes_de_puerta_lo_nuevo_primero_y_techo(self):
        t2 = "2026-10-29T12:00:05+00:00"
        latidos = [latido("md-2-bbbb", tiso=t2), latido("md-1-abcd", tiso=t2)]
        latidos += [latido("md-%d-aaaa" % i) for i in range(150)]
        latidos += [{"id": "estado.chat", "datos": {}}, latido()]
        ms = dc.mensajes_de_puerta(latidos)
        self.assertEqual([m["id"] for m in ms[:2]], ["md-2-bbbb", "md-1-abcd"])
        self.assertEqual(len(ms), dc.CHAT_PUERTA_MAX)
        self.assertEqual(len(dc.mensajes_de_puerta(latidos, maximo=7)), 7)
        self.assertEqual(dc.mensajes_de_puerta(None), [])


class PruebasPublicar(unittest.TestCase):
    def test_publicar_entra_en_el_archivo_y_en_la_puerta(self):
        p = PuertaFalsa()
        with tempfile.TemporaryDirectory() as tmp:
            with puerta_falsa(p):
                m = dc.publicar("informe", de="hermes", raiz=tmp)
            publicado = p.publicados[0]
            self.assertEqual(len(p.publicados), 1)
            self.assertEqual((publicado["clase"], publicado["id"]),
                             (dc.CLASE_CHAT_PUERTA, dc.id_puerta_del_mensaje(m["id"])))
            self.assertEqual(publicado["datos"]["texto"], "informe")
            self.assertTrue(os.path.exists(os.path.join(tmp, "starseed_memory_root", "mando", "director", "chat.jsonl")))
        with puerta_falsa(None):
            with tempfile.TemporaryDirectory() as tmp2:
                sin = dc.publicar("informe", de="hermes", raiz=tmp2)
            self.assertTrue((sin or {}).get("id", "").startswith("md-"))
        self.assertFalse(dc.publicar_puerta({"texto": "sin id"}))
        self.assertFalse(dc.publicar_puerta({"id": "md-1-abcd", "texto": "x"}))


class PruebasAlLeer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = self.tmp.name
        os.makedirs(os.path.join(self.raiz, "starseed_memory_root", "mando", "director"))

    def test_leer_mezcla_sin_duplicar_y_sin_repetir_peticiones(self):
        p = PuertaFalsa([latido("md-2-bbbb", "desde el A1"), latido("md-2-bbbb", "desde el A1")])
        dc.publicar("local", de="alex", rol="alex", raiz=self.raiz)
        with puerta_falsa(p):
            primera = dc.leer(raiz=self.raiz)
            segunda = dc.leer(raiz=self.raiz)
        ids1 = [r.get("id") for r in primera]
        self.assertEqual(ids1.count("md-2-bbbb"), 1)
        self.assertTrue(any(r.get("texto") == "local" for r in primera if not r.get("via_puerta")))
        self.assertNotIn("md-2-bbbb", [r.get("id") for r in segunda])
        self.assertEqual(len(p.rutas), 1)

    def test_recogido_deja_fuera_lo_repetido_lo_local_y_lo_anotado(self):
        p = PuertaFalsa([latido("md-2-bbbb"), latido("md-3-cccc"), latido("md-4-dddd"),
                         latido("md-7-gggg", datos={"texto": "sin id dentro"})])
        with puerta_falsa(p):
            dc._puerta_vistos.add("md-3-cccc")
            salida = dc._anadir_puerta([{"id": "md-2-bbbb", "t": ISO}])
        self.assertEqual([m.get("id") for m in salida[1:]], ["md-7-gggg", "md-4-dddd"])


if __name__ == "__main__":
    unittest.main()
