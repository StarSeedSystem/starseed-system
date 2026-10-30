# -*- coding: utf-8 -*-
"""Pruebas del espejo de lo publicado de Astraura en la puerta de datos (PDA1012)."""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from espejo_puerta import decidir_espejo, espejar, estado_compartido, publicar_estado  # noqa: E402


class PuertaFalsa:
    def __init__(self, configurada=True, via="puerta", error=None):
        self._configurada = configurada
        self.via = via
        self.error = error
        self.puestas = []
        self.latidos = []

    def configurada(self):
        return self._configurada

    def astraura_poner(self, clave, data, respaldo=None):
        self.puestas.append((clave, data))
        r = {"via": self.via}
        if self.error:
            r["error"] = self.error
        return r

    def latido(self, clase, ident, data, respaldo=None):
        self.latidos.append((clase, ident, data))
        r = {"via": self.via}
        if self.error:
            r["error"] = self.error
        return r


class TestDecidir(unittest.TestCase):
    def test_primera_vez_copia(self):
        self.assertEqual(decidir_espejo("https://a.trycloudflare.com", {}, 100)[0], True)

    def test_sin_cambios_no_copia(self):
        previo = {"puerta_url": "https://a.trycloudflare.com", "puerta_t": 100}
        self.assertEqual(decidir_espejo("https://a.trycloudflare.com", previo, 200), (False, "sin cambios"))

    def test_cambio_y_latido(self):
        previo = {"puerta_url": "https://a.trycloudflare.com", "puerta_t": 100}
        self.assertEqual(decidir_espejo("https://b.trycloudflare.com", previo, 200)[1], "cambió")
        self.assertEqual(decidir_espejo("https://a.trycloudflare.com", previo, 100 + 30 * 60)[1], "latido")

    def test_retirada_es_un_cambio(self):
        previo = {"puerta_url": "https://a.sslip.io", "puerta_t": 100}
        self.assertEqual(decidir_espejo(None, previo, 200)[1], "cambió")


class TestEspejar(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.ruta = os.path.join(self.dir, "espejo.json")

    def test_copia_y_recuerda(self):
        p = PuertaFalsa()
        self.assertEqual(espejar("tunel_publico", "https://a.trycloudflare.com", self.ruta, "mac", puerta=p, ahora=1000), "puerta")
        self.assertEqual(p.puestas[0][0], "tunel_publico")
        self.assertEqual(p.puestas[0][1]["url"], "https://a.trycloudflare.com")
        with open(self.ruta, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["puerta_url"], "https://a.trycloudflare.com")
        # Segunda vuelta sin cambios: no vuelve a pedir a la puerta.
        self.assertEqual(espejar("tunel_publico", "https://a.trycloudflare.com", self.ruta, "mac", puerta=p, ahora=1060), "sin-cambios")
        self.assertEqual(len(p.puestas), 1)

    def test_sin_puerta_no_hace_nada(self):
        p = PuertaFalsa(configurada=False)
        self.assertEqual(espejar("destino_fijo", "https://x.sslip.io", self.ruta, puerta=p, ahora=1), "sin-puerta")
        self.assertFalse(os.path.exists(self.ruta))

    def test_fallo_de_la_puerta_no_marca(self):
        p = PuertaFalsa(via="supabase")
        self.assertEqual(espejar("destino_fijo", "https://x.sslip.io", self.ruta, puerta=p, ahora=1), "fallo")
        self.assertFalse(os.path.exists(self.ruta))

    def test_retirada_viaja_como_null(self):
        p = PuertaFalsa()
        espejar("destino_fijo", None, self.ruta, puerta=p, ahora=5)
        self.assertIsNone(p.puestas[0][1]["url"])


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)


class TestEstadoCompartido(unittest.TestCase):
    def test_progreso_colas_y_chat(self):
        prog = {"A": {"estado": "hecho", "t": "2026-01-01"}, "B": {"estado": "trabajando", "t": "2026-01-02", "nota": "x" * 200},
                "C": {"estado": "bloqueada", "t": "2026-01-03"}}
        colas = [{"nombre": "z", "tareas": [{"id": "B"}, {"id": "C"}]}, {"nombre": "a", "tareas": []}]
        chat = [{"id": "m%d" % i, "texto": "t" * 500, "de": "alex", "rol": "alex"} for i in range(20)]
        e = estado_compartido(prog, colas, chat, {}, 0)
        self.assertEqual(e["progreso"]["total"], 3)
        self.assertEqual(e["progreso"]["por_estado"], {"bloqueada": 1, "hecho": 1, "trabajando": 1})
        self.assertEqual([a["id"] for a in e["progreso"]["abiertas"]], ["C", "B"])
        self.assertEqual(len(e["progreso"]["abiertas"][1]["nota"]), 120)
        self.assertEqual([c["cola"] for c in e["colas"]], ["a", "z"])
        self.assertEqual(e["colas"][1]["por_estado"], {"bloqueada": 1, "trabajando": 1})
        self.assertEqual(len(e["chat"]), 4)
        self.assertEqual(len(e["chat"][-1]["texto"]), 120)
        self.assertEqual(e["generado"], "1970-01-01T00:00:00Z")

    def test_medidores_resumidos_sin_rutas(self):
        med = {"latidos": [{"tarea": "A", "fase": "escribiendo", "donde": "/ruta/privada"}],
               "olaActiva": "Ola X", "progreso": {"A": {}},
               "proveedores": [{"id": "codex", "estado": "verde"}]}
        e = estado_compartido({}, [], [], med, 0)["medidores"]
        self.assertEqual((e["agentes"], e["ola_activa"]), (1, "Ola X"))
        self.assertEqual(e["proveedores"], {"codex": "verde"})
        self.assertNotIn("/ruta", json.dumps(e))


class TestPublicarEstado(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.raiz = os.path.join(self.dir, "repo")
        olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        _escribir(os.path.join(olas, "progreso.json"), {"A": {"estado": "trabajando"}, "B": {"estado": "hecho"}})
        _escribir(os.path.join(olas, "cola-x.json"), [{"id": "A"}, {"id": "B"}])
        chat = os.path.join(self.raiz, "starseed_memory_root", "mando", "director", "chat.jsonl")
        os.makedirs(os.path.dirname(chat), exist_ok=True)
        with open(chat, "w", encoding="utf-8") as f:
            f.write(json.dumps({"id": "m1", "texto": "hola", "de": "alex", "rol": "alex"}) + "\n")
        self.marca = os.path.join(self.dir, "marca.json")

    def test_solo_si_lider_y_cada_minuto(self):
        p = PuertaFalsa()
        self.assertEqual(publicar_estado(self.raiz, puerta=p, lider=True, estado_ruta=self.marca, ahora=1000), "puerta")
        self.assertEqual(len(p.latidos), 1)
        clase, ident, datos = p.latidos[0]
        self.assertEqual((clase, ident), ("director", "estado.compartido"))
        self.assertEqual(datos["progreso"]["total"], 2)
        self.assertEqual(datos["colas"][0]["cola"], "x")
        self.assertEqual(publicar_estado(self.raiz, puerta=p, lider=True, estado_ruta=self.marca, ahora=1030), "sin-cambios")
        self.assertEqual(publicar_estado(self.raiz, puerta=p, lider=True, estado_ruta=self.marca, ahora=1060), "puerta")
        self.assertEqual(len(p.latidos), 2)

    def test_no_lider_no_toca_la_puerta(self):
        p = PuertaFalsa()
        self.assertEqual(publicar_estado(self.raiz, puerta=p, lider={"soy": False}, estado_ruta=self.marca, ahora=1), "no-lider")
        self.assertEqual(p.latidos, [])
        self.assertFalse(os.path.exists(self.marca))

    def test_sin_puerta_y_fallo_no_marcan(self):
        self.assertEqual(publicar_estado(self.raiz, puerta=PuertaFalsa(configurada=False), lider=True, estado_ruta=self.marca, ahora=1), "sin-puerta")
        self.assertEqual(publicar_estado(self.raiz, puerta=PuertaFalsa(via="supabase"), lider=True, estado_ruta=self.marca, ahora=1), "fallo")
        self.assertFalse(os.path.exists(self.marca))

    def test_tacha_claves_en_lo_publicado(self):
        clave = "sk-" + "x" * 20
        _escribir(os.path.join(self.raiz, "starseed_memory_root", "olas", "progreso.json"),
                  {"A": {"estado": "trabajando", "nota": clave}})
        p = PuertaFalsa()
        publicar_estado(self.raiz, puerta=p, lider=True, estado_ruta=self.marca, ahora=1)
        enviado = json.dumps(p.latidos[0][2], ensure_ascii=False)
        self.assertNotIn(clave, enviado)
        self.assertIn("[oculto]", enviado)


if __name__ == "__main__":
    unittest.main()
