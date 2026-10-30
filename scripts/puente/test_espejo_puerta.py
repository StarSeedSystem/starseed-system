# -*- coding: utf-8 -*-
"""Pruebas del espejo en la puerta de datos: lo publicado (PDA1012) y el estado
compartido de MetaGenesis (IND1029E: progreso, colas, chat del director, medidores)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from espejo_puerta import (  # noqa: E402
    PROGRESO_MAX, decidir_espejar_estado, decidir_espejo, espejar, espejar_estado,
    leer_estado, resumir_colas, resumir_progreso, resumen_medidores, tachar_valor)


class PuertaFalsa:
    def __init__(self, configurada=True, via="puerta", error=None):
        self._configurada = configurada
        self.via = via
        self.error = error
        self.puestas = []

    def configurada(self):
        return self._configurada

    def astraura_poner(self, clave, data, respaldo=None):
        self.puestas.append((clave, data))
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


# ── IND1029E: estado compartido en la puerta ────────────────────────────────────
class PuertaEstadoFalsa:
    def __init__(self, configurada=True, ok=4):
        self._c, self._ok, self.latidos = configurada, ok, []

    def configurada(self):
        return self._c

    def disponible(self):
        return self._c

    def latido(self, clase, ident, datos=None, respaldo=None):
        self.latidos.append((clase, ident, datos))
        return {"via": "puerta"} if len(self.latidos) <= self._ok else {"via": "cola", "motivo": "fallo"}

    def _pedir(self, metodo, ruta, cuerpo=None, timeout=8):
        self.pedido = (metodo, ruta)
        return 200, {"latidos": self.latidos}


class TestEstado(unittest.TestCase):
    def test_tachar_valor_en_anidadas_y_tope(self):
        r = tachar_valor({"a": "sk-abcdefgh", "b": ["ghp_abcdefghij", 3]})
        self.assertEqual(r, {"a": "[oculto]", "b": ["[oculto]", 3]})
        self.assertEqual(len(tachar_valor("x" * 500, 40)), 40)

    def test_progreso_lo_mas_nuevo_primero_y_tope(self):
        r = resumir_progreso({"v": {"estado": "escribiendo", "t": "9", "medio": "b", "nota": "sk-abcdefghij"},
                              "a": {"estado": "integrada", "t": "1", "medio": "m", "nota": "n"}})
        self.assertEqual([e["id"] for e in r], ["v", "a"])
        self.assertEqual(r[0]["nota"], "[oculto]")
        self.assertEqual(len(resumir_progreso({str(i): {"t": str(999 - i)} for i in range(150)})), PROGRESO_MAX)

    def test_colas_cuenta_por_estado(self):
        prog = {"A": {"estado": "integrada"}, "B": {"estado": "escribiendo"}}
        self.assertEqual(resumir_colas({"c1": ["A", "B", "C"]}, prog),
                         [{"nombre": "c1", "tareas": 3,
                           "estados": {"integrada": 1, "escribiendo": 1, "desconocido": 1}}])

    def test_medidores_resumen_sin_detalle(self):
        r = resumen_medidores({"generadoEn": "t1", "obsoleto": True,
                               "detalle": {"enjambreVivo": True, "latidos": [1, 2], "fila": [1],
                                           "progreso": {"A": {"estado": "integrada"}}}})
        self.assertEqual(r, {"generado_en": "t1", "obsoleto": True, "enjambre_vivo": True,
                             "enjambre_pausado": False, "agentes": 2, "fila": 1, "estados": {"integrada": 1}})

    def test_decidir_estado(self):
        previo = {"t": 100}
        self.assertEqual(decidir_espejar_estado({}, 1)[1], "primera vez")
        self.assertEqual(decidir_espejar_estado(previo, 159), (False, "sin cambios"))
        self.assertEqual(decidir_espejar_estado(previo, 160)[1], "latido")


class TestEspejarEstado(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.raiz = self.dir.name
        self.ruta = os.path.join(self.dir.name, "compartido.json")
        olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        with open(os.path.join(olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({"A": {"estado": "integrada", "t": "1", "medio": "m", "nota": "n"}}, f)

    def _espejar(self, p, ahora):
        return espejar_estado(self.raiz, p, ahora=ahora, pedir_medidores=lambda: {"detalle": {}},
                              lider={"soy": True}, estado_ruta=self.ruta)

    def test_no_lider_no_toca_la_puerta(self):
        p = PuertaEstadoFalsa()
        self.assertEqual(espejar_estado(self.raiz, p, ahora=1, pedir_medidores=lambda: {}, lider={}), "no-lider")
        self.assertEqual(p.latidos, [])

    def test_lidera_copia_los_cuatro_paquetes(self):
        p = PuertaEstadoFalsa()
        self.assertEqual(self._espejar(p, 1000), "puerta")
        self.assertEqual([i for _c, i, _d in p.latidos],
                         ["estado.progreso", "estado.colas", "estado.chat", "estado.medidores"])
        self.assertEqual(p.latidos[0][2], [{"id": "A", "estado": "integrada", "t": "1", "medio": "m", "nota": "n"}])
        self.assertEqual(p.latidos[3][2]["estados"], {})
        with open(self.ruta, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["t"], 1000)

    def test_menos_de_un_minuto_no_copia(self):
        p = PuertaEstadoFalsa()
        self.assertEqual(self._espejar(p, 1000), "puerta")
        self.assertEqual(self._espejar(p, 1030), "sin-cambios")
        self.assertEqual(len(p.latidos), 4)

    def test_fallo_parcial_no_marca_nada(self):
        p = PuertaEstadoFalsa(ok=3)
        self.assertEqual(self._espejar(p, 1000), "fallo")
        self.assertFalse(os.path.exists(self.ruta))

    def test_sin_puerta(self):
        p = PuertaEstadoFalsa(configurada=False)
        self.assertEqual(espejar_estado(self.raiz, p, ahora=1, pedir_medidores=lambda: {}, lider={"soy": True},
                                        estado_ruta=self.ruta), "sin-puerta")


class TestLeerEstado(unittest.TestCase):
    def test_reparte_por_id(self):
        p = PuertaEstadoFalsa()
        p.latidos = [{"id": "estado.chat", "datos": [{"t": "x"}]},
                     {"id": "estado.medidores", "datos": {"agentes": 3}},
                     {"id": "otro", "datos": {}}]
        self.assertEqual(leer_estado(puerta=p), {"chat": [{"t": "x"}], "medidores": {"agentes": 3}})

    def test_sin_puerta_devuelve_none(self):
        self.assertIsNone(leer_estado(puerta=PuertaEstadoFalsa(configurada=False)))


if __name__ == "__main__":
    unittest.main()
