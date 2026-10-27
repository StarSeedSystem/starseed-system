# -*- coding: utf-8 -*-
"""Pruebas del vigía de referencias (RFI1018Lb): puro, red reloj y espera inyectables."""
import datetime as dt
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_referencias as V

_ROBOTS_ABIERTO = "User-agent: *\nDisallow: /privado/\n"

_RSS_V1 = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Fuente</title>
  <item><title>Entrada antigua</title><link>https://blog.ejemplo.com/a</link>
    <pubDate>Tue, 20 Oct 2026 12:00:00 GMT</pubDate></item>
</channel></rss>"""

_RSS_V2 = _RSS_V1.replace(b"</channel>", b"""  <item><title>Entrada nueva</title>
    <link>https://blog.ejemplo.com/b</link>
    <pubDate>Thu, 22 Oct 2026 09:30:00 GMT</pubDate></item>
  </channel>""")

_SITEMAP = b"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://sites.ejemplo.com/x</loc><lastmod>2026-10-21</lastmod></url>
</urlset>"""

_SITEMAP_V2 = _SITEMAP.replace(b"https://sites.ejemplo.com/x", b"https://sites.ejemplo.com/y") \
    .replace(b"2026-10-21", b"2026-10-23")


class RedFalsa:
    """`obtener_url` de atajo: respuesta fija por URL y registro de peticiones."""

    def __init__(self, respuestas):
        self.respuestas = dict(respuestas)
        self.peticiones = []

    def __call__(self, url):
        self.peticiones.append(url)
        return self.respuestas.get(url)


def hacer_raiz(entradas):
    """Crea una raiz temporal con config/referencias-inspiracion.json."""
    raiz = tempfile.mkdtemp()
    os.makedirs(os.path.join(raiz, "config"))
    with open(os.path.join(raiz, "config", "referencias-inspiracion.json"),
              "w", encoding="utf-8") as fichero:
        json.dump({"formato": "referencias-v1", "entradas": entradas}, fichero, ensure_ascii=False)
    return raiz


def leer_estado(raiz):
    ruta = os.path.join(raiz, "starseed_memory_root", "referencias", "estado.json")
    with open(ruta, encoding="utf-8") as fichero:
        return json.load(fichero)


class Cadenas_y_parseo(unittest.TestCase):
    def test_dominios_y_huellas(self):
        self.assertEqual(V.obtener_dominio("https://Api.Ejemplo.COM/x"), "api.ejemplo.com")
        self.assertEqual(V.obtener_dominio("ni-ideal"), "")
        # El puerto forma parte del dominio a efectos de pausas por dominio:
        self.assertEqual(V.obtener_dominio("http://sub.dominio.org:8080/path"),
                         "sub.dominio.org:8080")
        self.assertEqual(V.obtener_dominio("https://usuario:pass@dominio.com"),
                         "usuario:pass@dominio.com")
        self.assertEqual(len(V.huella_sha256(b"algo")), 64)
        self.assertNotEqual(V.huella_sha256(b"algo"), V.huella_sha256(b"algo2"))
        self.assertEqual(V.huella_sha256(b"algo"), V.huella_sha256(b"algo"))

    def test_cargar_json_archivo_inexistente(self):
        raiz = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(raiz, ignore_errors=True))
        ruta = os.path.join(raiz, "no-existe.json")
        self.assertEqual(V.cargar_json(ruta, {"por_defecto": "valor"}),
                         {"por_defecto": "valor"})

    def test_fecha_a_iso(self):
        self.assertEqual(V.fecha_a_iso("Tue, 20 Oct 2026 12:00:00 GMT"),
                         "2026-10-20T12:00:00Z")
        self.assertEqual(V.fecha_a_iso("2026-10-20T12:00:00Z"), "2026-10-20T12:00:00Z")
        self.assertIsNone(V.fecha_a_iso("ayer"))
        self.assertIsNone(V.fecha_a_iso("  "))

    def test_canal_permitido(self):
        self.assertTrue(V.canal_permitido({"tipo": "rss", "url": "https://x/feed"}))
        self.assertTrue(V.canal_permitido({"tipo": "sitemap-lastmod", "url": "https://x/sitemap.xml"}))
        self.assertTrue(V.canal_permitido({"tipo": "github", "ref": "a/b"}))
        self.assertTrue(V.canal_permitido({"tipo": "npm", "ref": "paquete"}))
        self.assertTrue(V.canal_permitido({"tipo": "api", "url": "https://api.fontshare.com/v2/fonts"}))
        # Canales que la tarea NO permite rastrear:
        self.assertFalse(V.canal_permitido({"tipo": "changelog", "url": "https://x/whats-new"}))
        self.assertFalse(V.canal_permitido({"tipo": "sitemap", "url": "https://x/sitemap.xml"}))
        self.assertFalse(V.canal_permitido({"tipo": "blog", "url": "https://x/blog/"}))
        self.assertFalse(V.canal_permitido({"tipo": "youtube-canal", "ref": "@alguien"}))
        self.assertFalse(V.canal_permitido({"tipo": "api", "url": "https://api.ajena.com/v2"}))

    def test_parsear_rss(self):
        items = V.parsear_rss(_RSS_V1)
        self.assertEqual(items, [{"titulo": "Entrada antigua",
                                  "url": "https://blog.ejemplo.com/a",
                                  "fecha": "2026-10-20T12:00:00Z"}])
        atom = b"""<feed xmlns="http://www.w3.org/2005/Atom">
            <entry><title>Uno</title>
            <link href="https://atom.ejemplo.com/1"/>
            <published>2026-10-21T08:00:00Z</published></entry></feed>"""
        self.assertEqual(V.parsear_rss(atom), [{"titulo": "Uno", "url": "https://atom.ejemplo.com/1",
                                                "fecha": "2026-10-21T08:00:00Z"}])
        self.assertEqual(V.parsear_rss(b"no es xml"), [])

    def test_parsear_sitemap(self):
        self.assertEqual(V.parsear_sitemap(_SITEMAP),
                         {"https://sites.ejemplo.com/x": "2026-10-21T00:00:00Z"})
        # Sin lastmod no hay nada que vigilar por ese canal:
        self.assertEqual(V.parsear_sitemap(
            b'<urlset><url><loc>https://a.com/sin</loc></url></urlset>'), {})
        self.assertEqual(V.parsear_sitemap(b"no es xml"), {})

    def test_novedades_rss(self):
        items = V.parsear_rss(_RSS_V2)
        self.assertEqual(V.novedades_rss(items, None), [])  # primera pasada: línea base
        novedad = V.novedades_rss(items, "2026-10-20T12:00:00Z")
        self.assertEqual(len(novedad), 1)
        self.assertEqual(novedad[0]["url"], "https://blog.ejemplo.com/b")
        self.assertEqual(novedad[0]["titulo"], "Entrada nueva")

    def test_novedades_sitemap(self):
        ultimas = V.parsear_sitemap(_SITEMAP_V2)
        novedades, checkpoint = V.novedades_sitemap(ultimas, None)
        self.assertEqual(novedades, [])
        self.assertEqual(checkpoint, "2026-10-23T00:00:00Z")
        novedades2, checkpoint2 = V.novedades_sitemap(ultimas, "2026-10-21T00:00:00Z")
        self.assertEqual([n["fecha"] for n in novedades2], ["2026-10-23T00:00:00Z"])
        self.assertEqual(checkpoint2, "2026-10-23T00:00:00Z")


class Extracciones_y_cortes(unittest.TestCase):
    def test_marcas_github(self):
        commits = b'[{"sha": "abc123"}]'
        release = b'{"tag_name": "v2.0.1"}'
        self.assertEqual(V.extraer_marca_github(commits, releases=False), "abc123")
        self.assertEqual(V.extraer_marca_github(release, releases=True), "v2.0.1")
        self.assertIsNone(V.extraer_marca_github(b"no", True))
        self.assertIsNone(V.extraer_marca_github(b"[]", False))

    def test_version_npm(self):
        self.assertEqual(V.extraer_version_npm(b'{"version": "1.2.3"}'), "1.2.3")
        self.assertIsNone(V.extraer_version_npm(b'{"mal": 1}'))
        self.assertIsNone(V.extraer_version_npm(b"no json"))

    def test_huella_fontshare(self):
        base = V.huella_fontshare(b'{"fonts": [{"id": "satoshi"}, {"id": "clash"}]}')
        self.assertTrue(base.startswith("2/"), base)
        otra = V.huella_fontshare(b'{"fonts": [{"id": "satoshi"}, {"id": "clash"}, {"id": "gosha"}]}')
        self.assertTrue(otra.startswith("3/"))
        self.assertNotEqual(base, otra)
        self.assertIsNone(V.huella_fontshare(b"no json"))
        self.assertIsNone(V.huella_fontshare(b'{"fonts": 3}'))

    def test_pausa_restante(self):
        self.assertEqual(V.pausa_restante(None, 100.0), 0.0)
        self.assertEqual(V.pausa_restante(90.0, 100.0), 0.0)   # ya pasaron 10 s
        self.assertAlmostEqual(V.pausa_restante(97.0, 100.0), 7.0)
        self.assertAlmostEqual(V.pausa_restante(99.5, 100.0, minimo=0.5), 0.0)

    def test_robots_permiten(self):
        url = "https://blog.ejemplo.com/feed"
        self.assertTrue(V.robots_permiten(None, url))
        self.assertTrue(V.robots_permiten(_ROBOTS_ABIERTO.encode(), url))
        self.assertFalse(V.robots_permiten(
            b"User-agent: StarSeedOS-VigiaReferencias\nDisallow: /\n", url))

    def test_debe_verificar_terminos(self):
        ahora = dt.datetime(2026, 10, 22, tzinfo=dt.timezone.utc)
        self.assertTrue(V._debe_verificar_terminos(None, ahora))
        self.assertFalse(V._debe_verificar_terminos("2026-10-22T00:00:00Z", ahora))
        self.assertTrue(V._debe_verificar_terminos("2026-09-01T00:00:00Z", ahora))
        self.assertTrue(V._debe_verificar_terminos("fecha rota", ahora))

    def test_url_github_y_npm(self):
        self.assertEqual(V.url_github("a/b"),
                         "https://api.github.com/repos/a/b/commits?per_page=1")
        self.assertEqual(V.url_github("a/b", releases=True),
                         "https://api.github.com/repos/a/b/releases/latest")
        self.assertEqual(V.url_npm("@lottiefiles/dotlottie-react"),
                         "https://registry.npmjs.org/@lottiefiles/dotlottie-react/latest")


class VigiaConRaizTemp(unittest.TestCase):
    """Recorridos completos con red, espera y reloj falsos (sin conexión)."""

    def setUp(self):
        self.raiz = hacer_raiz([{
            "id": "fuente-prueba", "nombre": "Fuente de prueba", "tema": "prueba",
            "url": "https://blog.ejemplo.com",
            "actualizacion": [{"tipo": "rss", "url": "https://blog.ejemplo.com/feed"}],
            "terminos": "https://blog.ejemplo.com/terminos",
        }])
        self.addCleanup(lambda: __import__("shutil").rmtree(self.raiz, ignore_errors=True))

    def red(self, feed=_RSS_V1, terminos=b"<html>terminos v1</html>"):
        return RedFalsa({
            "https://blog.ejemplo.com/robots.txt": _ROBOTS_ABIERTO.encode(),
            "https://blog.ejemplo.com/feed": feed,
            "https://blog.ejemplo.com/terminos": terminos,
        })

    def test_primera_pasa_es_linea_base_y_la_novedad_llega_despues(self):
        dormir = []
        red = self.red()
        novedades_primera = V.vigilar_referencias(self.raiz, red, dormir.append,
                                                  ahora=dt.datetime(2026, 10, 22, tzinfo=dt.timezone.utc))
        self.assertEqual(novedades_primera, [])
        estado = leer_estado(self.raiz)
        self.assertEqual(estado["fuente-prueba"]["ultima_fecha_rss"], "2026-10-20T12:00:00Z")
        self.assertTrue(estado["fuente-prueba"]["huella_terminos"])
        # Segunda pasada igual: nada nuevo.
        esto = V.vigilar_referencias(self.raiz, red, dormir.append,
                                     ahora=dt.datetime(2026, 10, 22, 1, tzinfo=dt.timezone.utc))
        self.assertEqual(esto, [])
        # El feed trae algo nuevo: novedad con URL, título y fecha.
        red = self.red(feed=_RSS_V2)
        noved = V.vigilar_referencias(self.raiz, red, dormir.append,
                                      ahora=dt.datetime(2026, 10, 22, 2, tzinfo=dt.timezone.utc))
        self.assertEqual(len(noved), 1)
        self.assertEqual(noved[0]["id"], "fuente-prueba")
        self.assertEqual(noved[0]["titulo"], "Entrada nueva")
        self.assertEqual(noved[0]["url"], "https://blog.ejemplo.com/b")
        self.assertEqual(noved[0]["fecha"], "2026-10-22T09:30:00Z")
        self.assertEqual(leer_estado(self.raiz)["fuente-prueba"]["novedades"][0]["url"],
                         "https://blog.ejemplo.com/b")

    def test_terminos_marcados_a_revisar_mes_despues_sin_tocar_clase(self):
        red = self.red()
        dorm = []
        V.vigilar_referencias(self.raiz, red, dorm.append,
                              ahora=dt.datetime(2026, 10, 22, tzinfo=dt.timezone.utc))
        salida = V.vigilar_referencias(
            self.raiz, self.red(terminos=b"<html>terminos CAMBIADOS</html>"), dorm.append,
            ahora=dt.datetime(2026, 12, 6, tzinfo=dt.timezone.utc))
        estado = leer_estado(self.raiz)["fuente-prueba"]
        self.assertTrue(any(n["tipo"] == "terminos" for n in salida))
        self.assertTrue(estado["a_revisar"])
        # Nunca escribimos ni copiamos clase de uso ni contenido: solo huella y fecha:
        self.assertNotIn("clase_uso", estado)
        self.assertNotIn("cuerpo_terminos", estado)

    def test_pausas_y_robots_entre_las_peticiones_del_mismo_dominio(self):
        dorm = []
        red = self.red()
        V.vigilar_referencias(self.raiz, red, dorm.append,
                              ahora=dt.datetime(2026, 10, 22, tzinfo=dt.timezone.utc))
        peticiones = red.peticiones
        self.assertIn("https://blog.ejemplo.com/robots.txt", peticiones)
        self.assertIn("https://blog.ejemplo.com/feed", peticiones)
        self.assertIn("https://blog.ejemplo.com/terminos", peticiones)
        # Tres peticiones al mismo dominio → al menos dos cortes, y todas las
        # peticiones después de la primera esperan ~10 s:
        self.assertGreaterEqual(len(dorm), 2)
        self.assertTrue(all(pausa >= 9.0 for pausa in dorm[1:]), dorm)

    def test_canales_no_permitidos_no_se_rastrean(self):
        raiz = hacer_raiz([{
            "id": "solo-prohibidos", "nombre": "Solo prohibidos", "tema": "prueba",
            "actualizacion": [
                {"tipo": "changelog", "url": "https://x.com/changelog"},
                {"tipo": "sitemap", "url": "https://x.com/sitemap.xml"},
                {"tipo": "youtube-canal", "ref": "@alguien"},
            ],
        }])
        try:
            salida = V.vigilar_referencias(raiz, RedFalsa({}), lambda segundos: None,
                                           ahora=dt.datetime(2026, 10, 22, tzinfo=dt.timezone.utc))
            self.assertEqual(salida, [])
            self.assertEqual(leer_estado(raiz)["solo-prohibidos"]["ultima_revision"],
                             "2026-10-22T00:00:00Z")
        finally:
            __import__("shutil").rmtree(raiz, ignore_errors=True)

    def test_github_y_npm_y_sitemap_y_fontshare(self):
        raiz = hacer_raiz([{
            "id": "con-todo", "nombre": "Con todo", "tema": "prueba",
            "actualizacion": [
                {"tipo": "github", "ref": "uno/dos"},
                {"tipo": "npm", "ref": "paquete"},
                {"tipo": "sitemap-lastmod", "url": "https://sitios.ejemplo.com/sitemap.xml"},
                {"tipo": "api", "url": "https://api.fontshare.com/v2/fonts"},
            ],
        }])
        try:
            dormir = []
            red = RedFalsa({
                "https://api.github.com/robots.txt": _ROBOTS_ABIERTO.encode(),
                "https://api.fontshare.com/robots.txt": _ROBOTS_ABIERTO.encode(),
                f"https://{V.obtener_dominio(V.url_npm('paquete'))}/robots.txt":
                    _ROBOTS_ABIERTO.encode(),
                "https://sitios.ejemplo.com/robots.txt": _ROBOTS_ABIERTO.encode(),
                "https://api.github.com/repos/uno/dos/commits?per_page=1": b'[{"sha": "a1"}]',
                "https://registry.npmjs.org/paquete/latest": b'{"version": "1.0.0"}',
                "https://api.fontshare.com/v2/fonts":
                    b'{"fonts": [{"id": "satoshi"}, {"id": "clash"}]}',
                "https://sitios.ejemplo.com/sitemap.xml": _SITEMAP,
            })
            salida = V.vigilar_referencias(raiz, red, dormir.append,
                                           ahora=dt.datetime(2026, 10, 22, tzinfo=dt.timezone.utc))
            self.assertEqual(salida, [])  # Línea base completa.
            estado = leer_estado(raiz)["con-todo"]
            self.assertEqual(estado["marca_commit"], "a1")
            self.assertEqual(estado["version_npm"], "1.0.0")
            self.assertEqual(estado["ultima_fecha_sitemap"], "2026-10-21T00:00:00Z")
            self.assertTrue(estado["huella_fontshare"].startswith("2/"))
            # Cambian todas las marcas: la segunda pasada trae una novedad por canal.
            red.respuestas["https://api.github.com/repos/uno/dos/commits?per_page=1"] = \
                b'[{"sha": "a2"}]'
            red.respuestas["https://registry.npmjs.org/paquete/latest"] = b'{"version": "1.1.0"}'
            red.respuestas["https://api.fontshare.com/v2/fonts"] = \
                b'{"fonts": [{"id": "satoshi"}, {"id": "clash"}, {"id": "gosha"}]}'
            red.respuestas["https://sitios.ejemplo.com/sitemap.xml"] = _SITEMAP_V2
            salida2 = V.vigilar_referencias(raiz, red, dormir.append,
                                            ahora=dt.datetime(2026, 10, 22, 1, tzinfo=dt.timezone.utc))
            tipos = {n["tipo"] for n in salida2}
            self.assertEqual(tipos, {"github", "npm", "api", "sitemap-lastmod"})
        finally:
            __import__("shutil").rmtree(raiz, ignore_errors=True)


class RaizDelRepositorio(unittest.TestCase):
    """OPF1024A: RAIZ es la raíz del repositorio (no `scripts/`) y respeta STARSEED_ROOT."""

    def _recargar(self, entorno):
        import importlib
        from unittest import mock
        with mock.patch.dict(os.environ, entorno, clear=False):
            if "STARSEED_ROOT" not in entorno:
                os.environ.pop("STARSEED_ROOT", None)
            importlib.reload(V)
            return V.RAIZ, V.CONFIG_PATH, V.ESTADO_PATH

    def tearDown(self):
        import importlib
        importlib.reload(V)

    def test_raiz_por_defecto_es_la_del_repositorio(self):
        repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        raiz, config, estado = self._recargar({})
        self.assertEqual(os.path.abspath(raiz), repo)
        self.assertTrue(os.path.isfile(config), config)
        self.assertEqual(estado, os.path.join(repo, "starseed_memory_root", "referencias", "estado.json"))

    def test_raiz_respeta_starseed_root(self):
        otra = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(otra, ignore_errors=True))
        raiz, config, _ = self._recargar({"STARSEED_ROOT": otra})
        self.assertEqual(raiz, otra)
        self.assertEqual(config, os.path.join(otra, "config", "referencias-inspiracion.json"))


if __name__ == "__main__":
    unittest.main()
