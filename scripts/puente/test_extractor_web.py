# -*- coding: utf-8 -*-
"""Pruebas del lector cortés y del extractor web local (INV1025C).

Puras y sin red: la «red» es una tabla de respuestas que graba lo
pedido, el reloj miente y la espera queda apuntada. Las clases corren
igual con `python3 -m unittest test_extractor_web` y con
`pytest scripts/puente/test_extractor_web.py`.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lector_cortes as L  # noqa: E402
import extractor_web as E  # noqa: E402

IP_PUBLICA = "93.184.216.34"
HTML = b"<html><body>Hola</body></html>"


class RedFalsa:
    """`pedir` de atajo: tabla por URL y registro de cada petición."""

    def __init__(self, tabla=None):
        self.tabla = dict(tabla or {})
        self.peticiones = []

    def __call__(self, url, tope=0.0, segundos=0.0):
        self.peticiones.append(url)
        salida = self.tabla.get(url)
        if salida is None:
            return {"estado": 404, "cabeceras": {}, "cuerpo": b""}
        return salida


class RelojFalso:
    """Reloj que no corre: siempre la misma marca."""

    def __init__(self, marca=1000.0):
        self.marca = marca

    def __call__(self):
        return self.marca


class Esparcedor:
    """Apunta cada `dormir` en vez de esperar."""

    def __init__(self):
        self.esperas = []

    def __call__(self, segundos):
        self.esperas.append(segundos)


def respuesta(cuerpo=HTML, estado=200, tipo="text/html", extra=None):
    """Respuesta estándar de la red falsa."""
    return {"estado": estado,
            "cabeceras": {"content-type": tipo, **(extra or {})},
            "cuerpo": cuerpo}


def ctx_cortes(red, esperas=None):
    """Contexto del lector con red, reloj y espera falsos."""
    esp = Esparcedor()
    if esperas is not None:
        esperas.append(esp)
    return L.crear_ctx(pedir=red, dormir=esp, reloj=RelojFalso())


class GuardiaSSRF(unittest.TestCase):
    def setUp(self):
        self.red = RedFalsa()
        self.ctx = ctx_cortes(self.red)

    def test_rechaza_loopback_privadas_y_metadato(self):
        for url in ("http://127.0.0.1/x", "http://10.1.2.3/x",
                    "http://192.168.0.7/x", "http://172.16.5.5/x",
                    "http://169.254.169.254/latest/meta-data/"):
            resultado = L.leer(url, self.ctx)
            self.assertFalse(resultado["ok"], url)
            self.assertEqual("prohibida", resultado.get("bloqueado_por"), url)

    def test_rechaza_esquemas_que_no_son_http(self):
        for url in ("ftp://ejemplo.org/f", "file:///etc/passwd",
                    "javascript:alert(1)"):
            resultado = L.leer(url, self.ctx)
            self.assertFalse(resultado["ok"])
            self.assertEqual("url", resultado.get("bloqueado_por"), url)

    def test_redireccion_hacia_prohibida_se_corta(self):
        destino = f"http://{IP_PUBLICA}/robots.txt"
        self.red.tabla[destino] = respuesta(b"User-agent: *\nAllow: /\n")
        contenido = f"http://{IP_PUBLICA}/p"
        self.red.tabla[contenido] = respuesta(
            estado=302, cuerpo=b"", extra={"location": "http://127.0.0.1/fuga"})
        resultado = L.leer(contenido, self.ctx)
        self.assertFalse(resultado["ok"])
        self.assertEqual("prohibida", resultado.get("bloqueado_por"))


class RobotsYPausa(unittest.TestCase):
    def setUp(self):
        self.base = f"http://{IP_PUBLICA}"
        self.red = RedFalsa()
        self.esperas = []
        self.ctx = ctx_cortes(self.red, self.esperas)

    def test_robots_prohibe_y_no_se_pide_nada_mas(self):
        self.red.tabla[f"{self.base}/robots.txt"] = respuesta(
            b"User-agent: *\nDisallow: /\n")
        resultado = L.leer(f"{self.base}/p", self.ctx)
        self.assertFalse(resultado["ok"])
        self.assertEqual("robots", resultado.get("bloqueado_por"))
        self.assertEqual([f"{self.base}/robots.txt"], self.red.peticiones)

    def test_robots_por_dominio_y_pausa_de_diez_segundos(self):
        self.red.tabla[f"{self.base}/robots.txt"] = respuesta(
            b"User-agent: *\nDisallow:\n")
        for ruta in ("/a", "/b"):
            self.red.tabla[f"{self.base}{ruta}"] = respuesta()
        primera = L.leer(f"{self.base}/a", self.ctx)
        segunda = L.leer(f"{self.base}/b", self.ctx)
        self.assertTrue(primera["ok"] and segunda["ok"])
        self.assertEqual([0.0, 10.0], self.esperas[0].esperas)

    def probar(self, ruta):
        return f"{self.base}{ruta}"


class VetosYTipos(unittest.TestCase):
    """`noai` / `noindex` / `noimageai` y los tipos de contenido válidos."""

    def setUp(self):
        self.base = f"http://{IP_PUBLICA}"
        self.ctx = ctx_cortes(RedFalsa({}))

    def test_x_robots_tag_noai(self):
        red = RedFalsa({
            f"{self.base}/robots.txt": respuesta(b"User-agent: *\nDisallow:\n"),
            f"{self.base}/p": respuesta(extra={"x-robots-tag": "noai, max-snippet:2"}),
        })
        resultado = L.leer(f"{self.base}/p", red_ctx(red))
        self.assertFalse(resultado["ok"])
        self.assertEqual("noai", resultado["bloqueado_por"])

    def test_meta_robots_happy_path_y_noindex(self):
        sin_veto = f"{self.base}/limpia"
        contenido = HTML + b'<meta name="robots" content="index, follow">'
        rojo = RedFalsa({
            f"{self.base}/robots.txt": respuesta(b"User-agent: *\nDisallow:\n"),
            sin_veto: respuesta(contenido),
            f"{self.base}/voto": respuesta(
                HTML + b'<meta content="noai" name="robots">'),
        })
        ctx = red_ctx(rojo)
        self.assertTrue(L.leer(sin_veto, ctx)["ok"])
        resultado = L.leer(f"{self.base}/voto", ctx)
        self.assertEqual("noai", resultado["bloqueado_por"])

    def test_tipos_permitidos_y_opacos(self):
        red = RedFalsa({
            f"{self.base}/robots.txt": respuesta(b"User-agent: *\nDisallow:\n"),
            f"{self.base}/p": respuesta(),
            f"{self.base}/z": respuesta(tipo="application/json"),
        })
        ctx = red_ctx(red)
        self.assertTrue(L.leer(f"{self.base}/p", ctx)["ok"])
        self.assertEqual("tipo", L.leer(f"{self.base}/z", ctx)["bloqueado_por"])


def red_ctx(red):
    return L.crear_ctx(pedir=red, dormir=Esparcedor(), reloj=RelojFalso())


class Entorno(unittest.TestCase):
    """Guarda y repara las variables que tocan las pruebas (R3).

    Solo nombres: en los tests no se escribe ninguna clave, ni siquiera
    de mentira; `STARSEED_EXTRACTOR_*` queda con valores de andamio no
    secretos (una URL local y un nombre de modelo).
    """

    def setUp(self):
        self.guardadas = {clave: os.environ.get(clave) for clave in (
            "SCRAPEGRAPHAI_TELEMETRY_ENABLED", "STARSEED_EXTRACTOR_BASE_URL",
            "STARSEED_EXTRACTOR_MODELO", "STARSEED_EXTRACTOR_TOKEN",
            "STARSEED_EXTRACTOR_API_KEY")}
        os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"
        os.environ.pop("STARSEED_EXTRACTOR_BASE_URL", None)
        os.environ.pop("STARSEED_EXTRACTOR_MODELO", None)
        os.environ.pop("STARSEED_EXTRACTOR_TOKEN", None)

    def tearDown(self):
        for clave, valor in self.guardadas.items():
            if valor is None:
                os.environ.pop(clave, None)
            else:
                os.environ[clave] = valor


class GrafoFalso:
    """Grafo de mentira: recibe la llamada y suelta lo suyo, sin red."""

    def __init__(self, salida):
        self.salida = salida
        self.llamadas = []

    def __call__(self, prompt, fuente, config):
        self.llamadas.append({"prompt": prompt, "fuente": fuente,
                              "config": config})
        return self

    def run(self):
        return self.salida


class ExtraerConGrafoFalso(Entorno, unittest.TestCase):
    def setUp(self):
        super().setUp()
        os.environ["STARSEED_EXTRACTOR_BASE_URL"] = "http://ia.local/v1"
        os.environ["STARSEED_EXTRACTOR_MODELO"] = "modelo-del-os"

    def test_telemetria_activa_bloquea_aun_con_todo_listo(self):
        os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "true"
        salida = E.extraer({"html": HTML, "prompt": "resumir"}, {"grafo": GrafoFalso({})})
        self.assertFalse(salida["ok"])
        self.assertEqual("telemetria-activa", salida["motivo"])

    def test_config_sin_variables_no_arranca_nada(self):
        os.environ.pop("STARSEED_EXTRACTOR_BASE_URL", None)
        os.environ.pop("STARSEED_EXTRACTOR_MODELO", None)
        salida = E.extraer({"html": HTML, "prompt": "x"}, {"grafo": GrafoFalso({})})
        self.assertFalse(salida["ok"])
        self.assertEqual("configuracion-falta", salida["motivo"])
        self.assertTrue(all(n.startswith("STARSEED_EXTRACTOR_")
                            for n in salida["variables"]))

    def test_html_directo_llega_al_grafo_y_valida(self):
        falso = GrafoFalso({"dato": 1, "titulo": "p"})
        salida = E.extraer({"html": HTML.decode(), "prompt": "saca"},
                           {"grafo": falso})
        self.assertTrue(salida["ok"], salida)
        self.assertEqual({"dato": 1, "titulo": "p"}, salida["resultado"])
        self.assertEqual("saca", falso.llamadas[0]["prompt"])
        self.assertEqual(HTML.decode(), falso.llamadas[0]["fuente"])

    def test_url_bloqueada_va_por_lector_y_no_gasta_grafo(self):
        falso = GrafoFalso({})
        ctx = {"grafo": falso, "leer_url": lambda u: {
            "ok": False, "url_final": u, "bloqueado_por": "noai",
            "html": "", "bytes": 0}}
        salida = E.extraer({"url": f"http://{IP_PUBLICA}/x", "prompt": "x"}, ctx)
        self.assertFalse(salida["ok"])
        self.assertEqual("lectura", salida["motivo"])
        self.assertEqual("noai", salida["bloqueado_por"])
        self.assertEqual("http://93.184.216.34/x", salida["url_final"])
        self.assertEqual([], falso.llamadas)

    def test_url_leida_entra_como_texto_de_la_fuente(self):
        falso = GrafoFalso({"ok": "p"})
        html_cortes = "<p>leída</p>"
        ctx = {"grafo": falso, "leer_url": lambda u: {
            "ok": True, "url_final": u, "html": html_cortes,
            "bytes": len(html_cortes), "bloqueado_por": None}}
        salida = E.extraer({"url": f"http://{IP_PUBLICA}/x", "prompt": "saca"}, ctx)
        self.assertTrue(salida["ok"], salida)
        self.assertTrue(falso.llamadas[0]["fuente"].endswith(html_cortes))
        self.assertFalse(falso.llamadas[0]["fuente"].lower().startswith("http"))
        self.assertEqual(f"http://{IP_PUBLICA}/x", salida["url_final"])

    def test_esquema_invalido_se_rechaza(self):
        falso = GrafoFalso({"precio": 7})
        entrada = {"html": HTML.decode(), "prompt": "saca",
                   "esquema": {"type": "object", "required": ["titulo"]}}
        salida = E.extraer(entrada, {"grafo": falso})
        self.assertFalse(salida["ok"])
        self.assertEqual("esquema-invalido", salida["motivo"])

    def test_sin_libreria_da_el_hint_del_venv(self):
        salida = E.extraer({"html": HTML.decode(), "prompt": "x"}, {})
        self.assertFalse(salida["ok"])
        self.assertEqual("scrapegraphai-ausente", salida["motivo"])
        self.assertIn("scrapegraphai==2.3.1", salida["hint"])
        self.assertIn("~/.starseed/venvs/scrapegraph", salida["hint"])

    def test_recorte_20k(self):
        granzas = {"a": "z" * (E.TAMANO_MAXIMO + 100)}
        recortado, recorte = E.recortar_en_20k(granzas)
        self.assertTrue(recorte)
        self.assertLessEqual(len(recortado.encode("utf-8")), E.TAMANO_MAXIMO)
        entero, recorte2 = E.recortar_en_20k({"a": 1})
        self.assertFalse(recorte2)


class Token(Entorno, unittest.TestCase):
    def setUp(self):
        super().setUp()
        os.environ["STARSEED_EXTRACTOR_BASE_URL"] = "http://ia.local/v1"
        os.environ["STARSEED_EXTRACTOR_MODELO"] = "modelo-del-os"

    def test_autoriza_solo_con_bearer_y_token_puesto(self):
        self.assertTrue(E.autoriza("Bearer iru", "iru"))
        self.assertFalse(E.autoriza("Bearer otro", "iru"))
        self.assertFalse(E.autoriza("iru", "iru"))
        self.assertFalse(E.autoriza("Bearer iru", ""))

    def test_post_sin_token_o_ruta_erronea(self):
        codigo, cuerpo = E._atender_post("", "/extraer", b"{}", "t")
        self.assertEqual(401, codigo)
        codigo, cuerpo = E._atender_post("Bearer t", "/otra", b"{}", "t")
        self.assertEqual(404, codigo)
        codigo, cuerpo = E._atender_post(
            "Bearer t", "/extraer", b"{no-es-json", "t")
        self.assertEqual(400, codigo)

    def test_post_justo_responde_al_grafo_falso(self):
        falso = GrafoFalso({"dato": "x"})
        cuerpo = '{"html":"<p>p</p>","prompt":"saca"}'.encode("utf-8")
        codigo, resultado = E._atender_post(
            "Bearer la-token", "/extraer", cuerpo, "la-token",
            {"grafo": falso})
        self.assertEqual(200, codigo)
        self.assertTrue(resultado.get("ok"), resultado)
        self.assertEqual({"dato": "x"}, resultado.get("resultado"))
        self.assertEqual("<p>p</p>", falso.llamadas[0]["fuente"])

    def test_serve_sin_token_no_se_levanta(self):
        self.assertIsNone(E.servidor_local(8793))


if __name__ == "__main__":
    unittest.main()
