#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# fmt: off
"""Pruebas puras de lector_cortes y extractor_web: sin red, sin ScrapeGraphAI."""
import os, subprocess, sys, unittest
import extractor_web as ew
import lector_cortes as lc
PUBLICA = ["93.184.216.34"]
class Grafo:
    def __init__(self, resultado): self.resultado = resultado
    def run(self): return self.resultado
def contexto(respuestas, resolver=None):
    dormidas = []
    def abrir(url, segundos, maximo): return respuestas.get(url, (404, {}, b""))
    ctx = {"abrir": abrir, "resolver": resolver or (lambda host: PUBLICA),
           "dormir": dormidas.append, "reloj": lambda: 100.0, "registros": {}, "robots": {}}
    return ctx, dormidas
def inyectar(resultado, visto):
    def fabricar(prompt, fuente, config):
        visto.update(prompt=prompt, fuente=fuente, config=config)
        return Grafo(resultado)
    return fabricar
CONFIG = {"llm": {"model": "openai/prueba"}}
class LectorCortes(unittest.TestCase):
    def test_rechaza_ssrf_sin_tocar_la_red(self):
        for ip in ("127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "0.0.0.0"):
            ctx, dormidas = contexto({}, lambda host, ip=ip: [ip])
            res = lc.leer("http://example.com/", ctx)
            self.assertFalse(res["ok"]); self.assertEqual(res["bloqueado_por"], "red-privada")
            self.assertEqual(dormidas, [])
    def test_redireccion_a_privada_se_rechaza(self):
        respuestas = {"https://publico.example/": (302, {"location": "http://127.0.0.1/secreto"}, b"")}
        ctx, _ = contexto(respuestas, lambda host: ["127.0.0.1"] if host == "127.0.0.1" else PUBLICA)
        self.assertEqual(lc.leer("https://publico.example/", ctx)["bloqueado_por"], "red-privada")
    def test_robots_prohibe_antes_de_pedir(self):
        respuestas = {"https://example.com/robots.txt": (200, {"content-type": "text/plain"},
                                                          b"User-agent: *\nDisallow: /privado")}
        ctx, _ = contexto(respuestas)
        self.assertEqual(lc.leer("https://example.com/privado", ctx)["bloqueado_por"], "robots")
        self.assertEqual(ctx["registros"], {})
    def test_noai_en_cabecera_y_noindex_en_meta(self):
        cabecera = {"https://example.com/a": (200, {"content-type": "text/html", "x-robots-tag": "noai"},
                                              b"<html>a</html>")}
        ctx, _ = contexto(cabecera)
        self.assertEqual(lc.leer("https://example.com/a", ctx)["bloqueado_por"], "noai")
        meta = {"https://example.com/b": (200, {"content-type": "text/html"},
                                          b'<html><meta name="robots" content="noindex"></html>')}
        ctx, _ = contexto(meta)
        self.assertEqual(lc.leer("https://example.com/b", ctx)["bloqueado_por"], "noindex")
    def test_pausa_de_diez_segundos_por_dominio(self):
        respuestas = {"https://example.com/": (200, {"content-type": "text/html"}, b"<html>ok</html>")}
        ctx, dormidas = contexto(respuestas)
        self.assertTrue(lc.leer("https://example.com/", ctx)["ok"])
        self.assertTrue(lc.leer("https://example.com/", ctx)["ok"])
        self.assertEqual(dormidas, [0.0, 10.0])
    def test_cabeceras_sin_cookies_ni_autorizacion(self):
        cabeceras = {k.lower() for k in lc.cabeceras_peticion()}
        self.assertNotIn("cookie", cabeceras); self.assertNotIn("authorization", cabeceras)
class ExtractorWeb(unittest.TestCase):
    def test_html_entra_como_texto_al_grafo(self):
        visto = {}
        res = ew.extraer({"html": "<html>hola</html>", "prompt": "extrae"},
                         {"config": CONFIG, "grafo": inyectar({"saludo": "hola"}, visto)})
        self.assertTrue(res["ok"]); self.assertEqual(visto["fuente"], "<html>hola</html>")
        self.assertEqual(visto["config"], CONFIG)
    def test_url_usa_solo_lector_cortes(self):
        respuestas = {"https://example.com/": (200, {"content-type": "text/html"}, b"<html>p</html>")}
        lector, _ = contexto(respuestas)
        visto = {}
        res = ew.extraer({"url": "https://example.com/", "prompt": "extrae"},
                         {"config": CONFIG, "grafo": inyectar({"x": 1}, visto), "lector": lector})
        self.assertTrue(res["ok"]); self.assertEqual(visto["fuente"], "<html>p</html>")
    def test_url_privada_no_llama_al_grafo(self):
        visto = {}
        lector, _ = contexto({}, lambda host: ["127.0.0.1"])
        res = ew.extraer({"url": "http://localhost/", "prompt": "x"},
                         {"config": CONFIG, "grafo": inyectar({}, visto), "lector": lector})
        self.assertFalse(res["ok"]); self.assertEqual(res["error"], "lectura")
        self.assertEqual(res["bloqueado_por"], "red-privada"); self.assertEqual(visto, {})
    def test_esquema_invalido(self):
        res = ew.extraer({"html": "<html>x</html>", "prompt": "x",
                          "esquema": {"type": "object", "required": ["b"]}},
                         {"config": CONFIG, "grafo": inyectar({"a": 1}, {})})
        self.assertFalse(res["ok"]); self.assertEqual(res["error"], "esquema")
    def test_recorta_el_resultado_a_veinte_kb(self):
        res = ew.extraer({"html": "<html>x</html>", "prompt": "x"},
                         {"config": CONFIG, "grafo": inyectar({"texto": "x" * 30000}, {})})
        self.assertTrue(res["ok"]); self.assertLessEqual(res["bytes"], 20 * 1024)
        self.assertTrue(res.get("recortado"))
    def test_token_bearer(self):
        self.assertTrue(ew.autorizado("Bearer secreto", "secreto"))
        self.assertFalse(ew.autorizado("Bearer otro", "secreto"))
        self.assertFalse(ew.autorizado("", "secreto")); self.assertFalse(ew.autorizado("Bearer x", ""))
    def test_telemetria_apagada_y_negativa_a_arrancar_si_no(self):
        self.assertEqual(os.environ.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED"), "false")
        entorno = dict(os.environ); entorno["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "true"
        proceso = subprocess.run([sys.executable, "-c", "import extractor_web"],
                                 cwd=os.path.dirname(os.path.abspath(__file__)), env=entorno,
                                 capture_output=True, text=True)
        self.assertNotEqual(proceso.returncode, 0); self.assertIn("R9", proceso.stderr)
if __name__ == "__main__": unittest.main()
