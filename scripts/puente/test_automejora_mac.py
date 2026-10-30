#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de automejora_mac (MTN1027H2): decisiones y guardado por trozos, SIN ssh."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import automejora_mac as AM  # noqa: E402


def _ahora(hora):
    return datetime(2026, 10, 30, hora, 30, tzinfo=timezone.utc).timestamp()


class Config(unittest.TestCase):
    def test_capas_encendidas_tolerante(self):
        self.assertEqual(AM.capas_encendidas({"capas": {"juicio": True}}), ["juicio"])
        encendidas = {"juicio": {"encendida": True}, "otra": {"encendida": False}}
        self.assertEqual(AM.capas_encendidas(encendidas), ["juicio"])
        self.assertEqual(AM.capas_encendidas({}), [])

    def test_filtrar_archivos_por_neurona(self):
        nombres = ["mac.jsonl", "a1.jsonl", "nota.txt"]
        self.assertEqual(AM.filtrar_archivos(nombres, None), ["a1", "mac"])
        self.assertEqual(AM.filtrar_archivos(nombres, {"a1": {"aportar": True}, "mac": False}), ["a1"])
        self.assertEqual(AM.filtrar_archivos(nombres, {"mac": False}), [])


class Union(unittest.TestCase):
    def test_seleccionar_lineas_unica_por_id(self):
        a = json.dumps({"id": "x", "capa": "jev"})
        b = json.dumps({"id": "y", "capa": "jev"})
        unido = AM.seleccionar_lineas({"mac": a + "\n" + b, "a1": a + "\nlinea-que-no-es-json"})
        self.assertEqual(unido.splitlines(), [a, b])

    def test_elegir_salida_toma_la_mas_nueva(self):
        listado = ("salida/2026-10-30.json\nsalida/2026-10-29.json")
        self.assertEqual(AM.elegir_salida(listado), "salida/2026-10-30.json")
        self.assertIsNone(AM.elegir_salida(""))


class Toca(unittest.TestCase):
    def test_enviar_tras_dos_y_traer_tras_seis_una_vez_al_dia(self):
        self.assertFalse(AM.toca({}, _ahora(1), "enviar"))
        self.assertTrue(AM.toca({}, _ahora(3), "enviar"))
        self.assertFalse(AM.toca({"enviar_dia": "2026-10-30"}, _ahora(3), "enviar"))
        self.assertFalse(AM.toca({}, _ahora(5), "traer"))
        self.assertTrue(AM.toca({}, _ahora(7), "traer"))
        self.assertFalse(AM.toca({"traer_dia": "2026-10-30"}, _ahora(7), "traer"))


class Version(unittest.TestCase):
    DIRECTIVA = {"capa": "jev", "texto": "responde con una frase y di tu confianza",
                 "acierto": 0.8, "base": 0.7, "n": 30}

    def test_directiva_del_juez_queda_activa_con_historial(self):
        dato: dict = AM.version_directivas(None, "jev", [self.DIRECTIVA], "2026-10-30")
        self.assertEqual(dato["capa"], "jev")
        self.assertEqual([d["version"] for d in dato["historial"]], [1])
        self.assertEqual(dato["historial"][0]["estado"], "activa")
        self.assertEqual(dato["historial"][0]["origen"], "meta-n")

    def test_texto_con_url_no_se_guarda_nunca(self):
        dato: dict = AM.version_directivas(None, "jev", [dict(self.DIRECTIVA, texto="mira https://x.com")], "2026-10-30")
        self.assertEqual(dato["historial"], [])


class Enviar(unittest.TestCase):
    def test_sin_capas_o_sin_experiencias_no_manda_nada(self):
        llamadas = []
        apagada = AM.enviar(lambda o, d: llamadas.append((o, d)) or (0, ""), config={})
        self.assertEqual(apagada, {"ok": True, "no": "automejora apagada: no se manda nada"})
        self.assertFalse(llamadas)
        vacia = AM.enviar(subir=lambda o, d: (0, ""), config={"capas": {"juicio": True}}, textos={})
        self.assertEqual(vacia, {"ok": True, "no": "sin experiencias que mandar"})

    def test_manda_las_experiencias_y_luego_la_config(self):
        llamadas = []

        def subir(orden, datos):
            llamadas.append((orden, datos))
            return 0, ""

        r = AM.enviar(subir, config={"capas": {"juicio": True}},
                      textos={"local": json.dumps({"id": "ok", "capa": "jev"})})
        self.assertTrue(r["ok"])
        self.assertEqual(r["capas"], ["juicio"])
        self.assertEqual(len(llamadas), 2)
        orden_exp, datos = llamadas[0]
        self.assertIn("/var/lib/starseed/automejora/entrada", orden_exp)
        self.assertIn("experiencias.jsonl", orden_exp)
        self.assertIn('"capa": "jev"', datos.decode("utf-8"))
        orden_cfg, datos_cfg = llamadas[1]
        self.assertIn("config.json", orden_cfg)
        self.assertIn('"juicio"', datos_cfg.decode("utf-8"))


class Guardar(unittest.TestCase):
    """traer con transporte falso y todo guardado en una RAIZ provisional."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.addCleanup(self.tmp.cleanup)

    def _bajar(self, informe):
        llamada = []

        def bajar(orden):
            llamada.append(orden)
            if "ls -1t" in orden:
                return 0, "/var/lib/starseed/automejora/salida/2026-10-30.json"
            return 0, json.dumps(informe)

        self.llamada = llamada
        return bajar

    def _precargar(self):
        version = AM.version_directivas(None, "jev", [Version.DIRECTIVA], "2026-10-29")
        ruta = os.path.join(self.raiz, "starseed_memory_root", "aprendizaje", "directivas", "jev.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(version, f)
        return ruta

    def test_mismo_texto_de_nuevo_no_repite_version(self):
        self._precargar()
        r = AM.traer(self._bajar(self._informe()), raiz=self.raiz)
        self.assertTrue(r["ok"])
        self.assertEqual(r["directivas"], [])
        ruta = os.path.join(self._rutas()["directivas"], "jev.json")
        with open(ruta, encoding="utf-8") as f:
            self.assertEqual(len(json.load(f)["historial"]), 1)

    def _informe(self):
        return {"ultima_noche": "2026-10-30", "motivo": "hecho",
                "directivas": [dict(Version.DIRECTIVA)],
                "propuestas": [{"task_id": "AMJ202610301", "capa": "jev"}]}

    def _rutas(self):
        base = os.path.join(self.raiz, "starseed_memory_root")
        return {
            "directivas": os.path.join(base, "aprendizaje", "directivas"),
            "propuestas": os.path.join(base, "olas", "propuestas-automejora", "2026-10-30.json"),
            "resumen": os.path.join(base, "aprendizaje", "automejora", "ultima-noche.json"),
        }

    def _cargar(self, ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)

    def test_traer_guarda_directivas_propuestas_y_resumen(self):
        r = AM.traer(self._bajar(self._informe()), raiz=self.raiz)
        self.assertTrue(r["ok"])
        self.assertEqual(r["fecha"], "2026-10-30")
        self.assertEqual(r["directivas"], ["jev"])
        rutas = self._rutas()
        directo = self._cargar(os.path.join(rutas["directivas"], "jev.json"))
        self.assertEqual(directo["historial"][0]["estado"], "activa")
        self.assertEqual(directo["historial"][0]["version"], 1)
        self.assertEqual(self._cargar(rutas["propuestas"])["tareas"][0]["task_id"], "AMJ202610301")
        resumen = self._cargar(rutas["resumen"])
        self.assertEqual(resumen["guardadas"], ["jev"])
        self.assertEqual(resumen["propuestas_nuevas"], 1)
        self.assertEqual(resumen["motivo"], "hecho")

    def test_segunda_pasada_no_duplica_nada(self):
        primera = AM.traer(self._bajar(self._informe()), raiz=self.raiz)
        rutas = self._rutas()
        r = AM.traer(self._bajar(self._informe()), raiz=self.raiz)
        self.assertTrue(primera["ok"] and r["ok"])
        self.assertEqual(r["directivas"], [])
        self.assertEqual(r["propuestas"], 0)
        self.assertEqual(len(self._cargar(rutas["propuestas"])["tareas"]), 1)
        directo = self._cargar(os.path.join(rutas["directivas"], "jev.json"))
        self.assertEqual(len(directo["historial"]), 1)

    def test_sin_salidas_no_guarda_nada(self):
        llamada = []

        def bajar(orden):
            llamada.append(orden)
            return 0, ""

        r = AM.traer(bajar, raiz=self.raiz)
        self.assertEqual(r, {"ok": True, "no": "sin salidas en el A1"})
        self.assertEqual(len(llamada), 1)


class Autopiloto(unittest.TestCase):
    def test_marca_el_dia_y_no_repite(self):
        marcados = []

        def subir(orden, datos):
            marcados.append(orden)
            return 0, ""

        def bajar(orden):
            return 0, ""

        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            estado = os.path.join(tmp, "estado.json")
            primero = AM.autopiloto(_ahora(8), subir, bajar, estado)
            self.assertIn("enviar", primero)
            self.assertIn("traer", primero)
            with open(estado, encoding="utf-8") as f:
                marcas = json.load(f)
            self.assertEqual(marcas["enviar_dia"], "2026-10-30")
            self.assertEqual(marcas["traer_dia"], "2026-10-30")
            self.assertFalse(AM.autopiloto(_ahora(10), subir, bajar, estado))


if __name__ == "__main__":
    unittest.main()



if __name__ == "__main__":
    unittest.main()
