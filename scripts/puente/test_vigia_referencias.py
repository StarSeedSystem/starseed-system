# -*- coding: utf-8 -*-
"""Pruebas del vigía de referencias: funciones puras y orquestación, sin red.

La red, el reloj y la espera llegan inyectadas, así que nada de estas pruebas
toca la conexión: `DescargadorFalso` responde por URL y `RelojFalso` avanza a
mano, para poder comprobar la pausa de 10 s por dominio sin esperar de verdad.
"""

import copy
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

import vigia_referencias as V

T0 = datetime(2026, 10, 22, 9, 0, 0, tzinfo=timezone.utc)

FEED_RSS = b"""<?xml version="1.0"?><rss><channel>
<item><title>Primera</title><link>https://sitio.com/a</link>
<pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate></item>
<item><title>Segunda</title><link>https://sitio.com/b</link>
<pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate></item>
</channel></rss>"""

FEED_ATOM = b"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Nueva</title><link href="https://sitio.com/c"/>
<updated>2024-01-03T12:00:00Z</updated></entry></feed>"""

SITEMAP = b"""<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://sitio.com/p1</loc><lastmod>2026-10-01</lastmod></url>
<url><loc>https://sitio.com/p2</loc><lastmod>2026-10-02</lastmod></url>
</urlset>"""


class DescargadorFalso:
    """Descarga falsa: responde con lo que cada URL tenga anotado y apunta todo."""

    def __init__(self, respuestas=None):
        self.respuestas = dict(respuestas or {})
        self.pedidas = []

    def __call__(self, url, timeout=30):
        self.pedidas.append(url)
        return self.respuestas.get(url, (0, b""))

    def pon(self, url, estado, cuerpo):
        self.respuestas[url] = (estado, cuerpo)


class RelojFalso:
    """Reloj monotónico de mentira: corre a la velocidad que diga la prueba."""

    def __init__(self, t0=0.0):
        self.t = t0

    def __call__(self):
        return self.t


class EsperadorFalso:
    """Espera de mentira: apunta cuántos segundos pediría el vigía."""

    def __init__(self):
        self.segundos = []

    def __call__(self, segundos):
        self.segundos.append(segundos)


def armar(config, estado=None, reloj=None, errores_espera=None, descarga=None, ahora=T0):
    """Vigila con falso reloj, esperador y descarga: (estado, cambios, esperas, descarga)."""
    reloj = reloj or RelojFalso()
    esperar = EsperadorFalso()
    descarga = descarga or DescargadorFalso()
    estado_nuevo, cambios = V.vigilar(
        config, estado, ahora=ahora, reloj=reloj, dormir=esperar, descargar=descarga
    )
    return estado_nuevo, cambios, esperar, descarga


class TestBasicas(unittest.TestCase):
    """Abstracciones elementales: JSON, dominio, hash, fechas y URLs."""

    def test_cargar_json_inexistente_devuelve_el_defecto(self):
        self.assertEqual(V._cargar_json("/ruta/que/no/existe.json", {"a": 1}), {"a": 1})

    def test_guardar_y_cargar_json_de_un_viaje(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "sub", "estado.json")
            V._guardar_json(ruta, {"nombres": ["Typewolf"], "fecha": "2026-10-22"})
            leido = V._cargar_json(ruta, None)
        self.assertEqual(leido, {"nombres": ["Typewolf"], "fecha": "2026-10-22"})

    def test_obtener_dominio(self):
        self.assertEqual(V._obtener_dominio("https://ejemplo.com/ruta"), "ejemplo.com")
        self.assertEqual(
            V._obtener_dominio("http://sub.dominio.org:8080/path"), "sub.dominio.org:8080"
        )
        self.assertEqual(V._obtener_dominio("url_no_valida"), "")

    def test_hash_contenido_detecta_cambios(self):
        h1 = V._hash_contenido(b"terminos v1")
        h2 = V._hash_contenido(b"terminos v2")
        self.assertNotEqual(h1, h2)
        self.assertEqual(len(h1), 64)

    def test_fecha_iso_lee_rfc822_y_iso_y_rechaza_basura(self):
        self.assertEqual(
            V._fecha_iso("Mon, 01 Jan 2024 12:00:00 GMT"), "2024-01-01T12:00:00+00:00"
        )
        self.assertEqual(V._fecha_iso("2024-01-02T12:00:00Z"), "2024-01-02T12:00:00+00:00")
        self.assertIsNone(V._fecha_iso("nada-de-fecha"))
        self.assertIsNone(V._fecha_iso(None))

    def test_a_marca_debería_crecer_con_la_fecha(self):
        antigua = V._a_marca("2024-01-01T12:00:00+00:00")
        reciente = V._a_marca("2024-01-02T12:00:00+00:00")
        self.assertGreater(reciente, antigua)
        self.assertIsNone(V._a_marca(None))

    def test_urls_github_y_npm(self):
        self.assertEqual(
            V.url_github("github", "unu/repo"),
            "https://api.github.com/repos/unu/repo/commits?per_page=1",
        )
        self.assertEqual(
            V.url_github("github-releases", "unu/repo"),
            "https://api.github.com/repos/unu/repo/releases/latest",
        )
        self.assertEqual(
            V._url_npm("@unuser/paquete"),
            "https://registry.npmjs.org/%40unuser%2Fpaquete/latest",
        )

    def test_canal_vigilado_solo_los_permitidos(self):
        vigilan = [
            {"tipo": "rss"},
            {"tipo": "sitemap"},
            {"tipo": "sitemap-lastmod"},
            {"tipo": "sitemap-respetando-robots"},
            {"tipo": "github", "ref": "unu/repo"},
            {"tipo": "npm", "ref": "paquete"},
            {"tipo": "api", "url": "https://api.fontshare.com/v2/fonts"},
        ]
        no_vigilan = [
            {"tipo": "blog", "url": "https://una-web.com/blog/"},
            {"tipo": "changelog", "url": "https://una-web.com/whats-new"},
            {"tipo": "hash-html"},
            {"tipo": "youtube-canal"},
            {"tipo": "api", "url": "https://api.otro.com/v1"},
        ]
        for canal in vigilan:
            self.assertTrue(V._es_canal_vigilado(canal), canal["tipo"])
        for canal in no_vigilan:
            self.assertFalse(V._es_canal_vigilado(canal), canal["tipo"])


class TestTerminos(unittest.TestCase):
    """Huella de la página de términos y su cadencia de un mes."""

    def test_primera_verificacion_no_marca_cambio(self):
        hash_nuevo, cambio = V.decidir_terminos(b"version inicial", None)
        self.assertTrue(hash_nuevo)
        self.assertFalse(cambio)

    def test_con_hash_previo_la_diferencia_es_cambio(self):
        hash_viejo, _ = V.decidir_terminos(b"v1", None)
        _, cambio = V.decidir_terminos(b"v2", hash_viejo)
        self.assertTrue(cambio)
        _, cambio = V.decidir_terminos(b"v1", hash_viejo)
        self.assertFalse(cambio)

    def test_debe_verificar_terminos_nunca_y_reciente_y_antiguo(self):
        self.assertTrue(V._debe_verificar_terminos(None, T0))
        self.assertFalse(V._debe_verificar_terminos((T0 - timedelta(days=29)).isoformat(), T0))
        self.assertTrue(V._debe_verificar_terminos((T0 - timedelta(days=45)).isoformat(), T0))

    def test_fecha_rota_pide_verificar_por_seguridad(self):
        self.assertTrue(V._debe_verificar_terminos("no-es-una-fecha", T0))


class TestRobots(unittest.TestCase):
    """robots.txt se respeta en los sitemaps; sin texto no hay veto."""

    def test_permite_lo_que_robots_no_prohibe(self):
        self.assertTrue(V._robots_permite("", "https://sitio.com/sitemap.xml", V.AGENTE_USUARIO))
        self.assertTrue(
            V._robots_permite(
                "User-agent: *\nAllow: /\n", "https://sitio.com/sitemap.xml", V.AGENTE_USUARIO
            )
        )

    def test_deniega_rutas_prohibidas(self):
        self.assertFalse(
            V._robots_permite(
                "User-agent: *\nDisallow: /\n", "https://sitio.com/sitemap.xml", V.AGENTE_USUARIO
            )
        )


class TestFeeds(unittest.TestCase):
    """RSS, Atom y sitemap: parseo y decisión de novedades."""

    def test_parsear_feed_rss(self):
        items = V.parsear_feed(FEED_RSS.decode("utf-8"))
        self.assertEqual(len(items), 2)
        url, titulo, fecha = items[0]
        self.assertEqual(url, "https://sitio.com/a")
        self.assertEqual(titulo, "Primera")
        self.assertEqual(fecha, "2024-01-01T12:00:00+00:00")

    def test_parsear_feed_atom_con_enlace_en_atributo(self):
        items = V.parsear_feed(FEED_ATOM.decode("utf-8"))
        self.assertEqual(len(items), 1)
        url, titulo, fecha = items[0]
        self.assertEqual(url, "https://sitio.com/c")
        self.assertEqual(titulo, "Nueva")
        self.assertEqual(fecha, "2024-01-03T12:00:00+00:00")

    def test_parsear_feed_xml_roto_da_vacio(self):
        self.assertEqual(V.parsear_feed("<rss><item>malo"), [])

    def test_decidir_rss_primera_vez_es_linea_base_sin_novedades(self):
        estado_c, novedades = V.decidir_rss(FEED_RSS.decode("utf-8"), {})
        self.assertEqual(novedades, [])
        self.assertEqual(len(estado_c["urls_vistas"]), 2)
        self.assertEqual(estado_c["ultima_fecha"], "2024-01-02T12:00:00+00:00")

    def test_decidir_rss_sin_cambio_no_avisa(self):
        estado_c, _ = V.decidir_rss(FEED_RSS.decode("utf-8"), {})
        _, novedades = V.decidir_rss(FEED_RSS.decode("utf-8"), estado_c)
        self.assertEqual(novedades, [])

    def test_decidir_rss_entrada_nueva_y_xml_roto(self):
        estado_c, _ = V.decidir_rss(FEED_RSS.decode("utf-8"), {})
        estado_c, novedades = V.decidir_rss(FEED_ATOM.decode("utf-8"), estado_c)
        self.assertEqual(len(novedades), 1)
        self.assertEqual(novedades[0]["url"], "https://sitio.com/c")
        self.assertEqual(novedades[0]["fecha"], "2024-01-03T12:00:00+00:00")
        # XML roto: sin novedades y sin destruir el estado
        estado_t, novedades = V.decidir_rss("<rss>malo", estado_c)
        self.assertEqual(novedades, [])
        self.assertEqual(estado_t["ultima_fecha"], "2024-01-03T12:00:00+00:00")

    def test_parsear_sitemap_urlset(self):
        locales = V.parsear_sitemap(SITEMAP.decode("utf-8"))
        self.assertEqual(locales["https://sitio.com/p1"], "2026-10-01T00:00:00+00:00")
        self.assertEqual(locales["https://sitio.com/p2"], "2026-10-02T00:00:00+00:00")

    def test_decidir_sitemap_primera_base_luego_cambio_y_quieto(self):
        base, novedades = V.decidir_sitemap(SITEMAP.decode("utf-8"), {})
        self.assertEqual(novedades, [])
        _, novedades = V.decidir_sitemap(SITEMAP.decode("utf-8"), base)
        self.assertEqual(novedades, [])
        cambiado = SITEMAP.decode("utf-8").replace("2026-10-02", "2026-10-20")
        _, novedades = V.decidir_sitemap(cambiado, base)
        self.assertEqual(len(novedades), 1)
        self.assertEqual(novedades[0]["url"], "https://sitio.com/p2")
        self.assertEqual(novedades[0]["fecha"], "2026-10-20T00:00:00+00:00")

    def test_decidir_sitemap_xml_roto_no_rompe_el_estado(self):
        base, _ = V.decidir_sitemap(SITEMAP.decode("utf-8"), {})
        estado_t, novedades = V.decidir_sitemap("<urlset>malo", base)
        self.assertEqual(novedades, [])
        self.assertEqual(estado_t["url_fechas"], base["url_fechas"])


class TestCanalesRed(unittest.TestCase):
    """GitHub, npm, Fontshare y el procesado de un canal con descarga falsa."""

    def _commits(self, sha, fecha="2026-10-19T05:00:00+00:00"):
        return json.dumps([
            {"sha": sha, "commit": {"committer": {"date": fecha}}}
        ]).encode("utf-8")

    def test_decidir_github_primera_vez_base_y_luego_novedad(self):
        base, novedades = V.decidir_github(self._commits("aaa111"), {})
        self.assertEqual(novedades, [])
        self.assertEqual(base["ref_ultima"], "aaa111")
        _, novedades = V.decidir_github(self._commits("bbb222"), base)
        self.assertEqual(len(novedades), 1)
        self.assertEqual(novedades[0]["titulo"], "bbb222")

    def test_decidir_github_releases_y_json_roto(self):
        releases = json.dumps({"tag_name": "v2.0.0", "published_at": "2026-10-01"})
        base, novedades = V.decidir_github(releases, {})
        self.assertEqual(novedades, [])
        _, novedades = V.decidir_github(json.dumps({"tag_name": "v2.1.0"}), base)
        self.assertEqual(novedades[0]["titulo"], "v2.1.0")
        # JSON sin contenido útil o roto: nada que decidir
        self.assertEqual(V.decidir_github("no hay json", {}), ({}, []))
        self.assertEqual(V.decidir_github("[]", {}), ({}, []))

    def test_decidir_npm_version_nueva(self):
        base, novedades = V.decidir_npm(b'{"version": "0.3.2"}', {})
        self.assertEqual(novedades, [])
        _, novedades = V.decidir_npm(b'{"version": "0.4.0"}', base)
        self.assertEqual(novedades[0]["titulo"], "0.4.0")
        self.assertEqual(V.decidir_npm(b"roto", {}), ({}, []))

    def test_decidir_huella_fontshare(self):
        base, novedades = V.decidir_huella(b'[{"slug": "satoshi", "version": 2}]', {})
        self.assertEqual(novedades, [])
        self.assertTrue(base["huella"])
        actual, novedades = V.decidir_huella(b'[{"slug": "satoshi", "version": 3}]', base)
        self.assertEqual(len(novedades), 1)
        _, novedades = V.decidir_huella(b'[{"slug": "satoshi", "version": 3}]', actual)
        self.assertEqual(novedades, [])

    def test_procesar_canal_no_vigilado_no_pide_nada(self):
        descarga = DescargadorFalso()
        esperas = []
        estado_c, novedades = V._procesar_canal(
            {"tipo": "changelog", "url": "https://sitio.com/whats-new"}, {},
            lambda u: descarga(u), T0.isoformat(), RelojFalso(), esperas.append, {}
        )
        self.assertEqual(novedades, [])
        self.assertEqual(descarga.pedidas, [])

    def test_procesar_canal_rss_baja_y_devuelve_estado_del_canal(self):
        descarga = DescargadorFalso({"https://sitio.com/feed": (200, FEED_RSS)})
        estado_c, novedades = V._procesar_canal(
            {"tipo": "rss", "url": "https://sitio.com/feed"}, {},
            descarga, T0.isoformat(), RelojFalso(), lambda s: None, {}
        )
        self.assertEqual(novedades, [])  # primera vez: línea base
        self.assertEqual(len(estado_c["urls_vistas"]), 2)
        self.assertEqual(descarga.pedidas, ["https://sitio.com/feed"])

    def test_procesar_canal_github_construye_la_url(self):
        ref = "unu/repo"
        paquetes = {"https://api.github.com/repos/unu/repo/commits?per_page=1": (200, self._commits("c1"))}
        descarga = DescargadorFalso(paquetes)
        estado_c, _ = V._procesar_canal(
            {"tipo": "github", "ref": ref}, {}, descarga,
            T0.isoformat(), RelojFalso(), lambda s: None, {}
        )
        self.assertEqual(estado_c["ref_ultima"], "c1")

    def test_procesar_canal_fallo_http_no_toca_el_estado(self):
        descarga = DescargadorFalso({"https://api.fontshare.com/v2/fonts": (503, b"")})
        estado_c, novedades = V._procesar_canal(
            {"tipo": "api", "url": "https://api.fontshare.com/v2/fonts"}, {"huella": "x"},
            descarga, T0.isoformat(), RelojFalso(), lambda s: None, {}
        )
        self.assertEqual(novedades, [])
        self.assertEqual(estado_c, {"huella": "x"})

    def test_procesar_canal_sitemap_robots_prohibe_no_baja(self):
        descarga = DescargadorFalso({
            "https://sitio.com/robots.txt": (200, b"User-agent: *\nDisallow: /\n"),
            "https://sitio.com/sitemap.xml": (200, SITEMAP),
        })
        estado_c, novedades = V._procesar_canal(
            {"tipo": "sitemap-respetando-robots", "url": "https://sitio.com/sitemap.xml"},
            {}, descarga, T0.isoformat(), RelojFalso(), lambda s: None, {}
        )
        self.assertEqual(novedades, [])
        # robots.txt sí se pidió; el sitemap prohibido, no
        self.assertEqual(descarga.pedidas, ["https://sitio.com/robots.txt"])

    def test_procesar_canal_sitemap_con_robots_ok_dos_peticiones(self):
        descarga = DescargadorFalso({
            "https://sitio.com/robots.txt": (200, b"User-agent: *\nAllow: /\n"),
            "https://sitio.com/sitemap.xml": (200, SITEMAP),
        })
        esperas = []
        estado_c, novedades = V._procesar_canal(
            {"tipo": "sitemap", "url": "https://sitio.com/sitemap.xml"},
            {}, descarga, T0.isoformat(), RelojFalso(), esperas.append, {}
        )
        self.assertEqual(novedades, [])
        self.assertEqual(
            descarga.pedidas, ["https://sitio.com/robots.txt", "https://sitio.com/sitemap.xml"]
        )
        self.assertEqual(estado_c["url_fechas"]["https://sitio.com/p1"], "2026-10-01T00:00:00+00:00")

    def test_procesar_canal_sin_destino_o_estado(self):
        descarga = DescargadorFalso()
        estado_c, novedades = V._procesar_canal(
            {"tipo": "rss"}, {"a": 1}, descarga, T0.isoformat(),
            RelojFalso(), lambda s: None, {}
        )
        self.assertEqual(novedades, [])
        self.assertEqual(estado_c, {"a": 1})


class TestPausaDominio(unittest.TestCase):
    """La pausa de 10 s por dominio se decide pura y se espera antes de pedir."""

    def test_primera_peticion_no_espera(self):
        reloj = RelojFalso(100.0)
        esperar = EsperadorFalso()
        uso = {}
        V._esperar_dominio("sitio.com", uso, reloj, esperar)
        self.assertEqual(esperar.segundos, [])
        self.assertEqual(uso["sitio.com"], 100.0)

    def test_segunda_muy_antes_espera_lo_que_falte(self):
        reloj = RelojFalso(100.0)
        esperar = []
        uso = {}
        V._esperar_dominio("sitio.com", uso, reloj, esperar.append)
        reloj.t = 103.0  # solo pasaron 3 s
        V._esperar_dominio("sitio.com", uso, reloj, esperar.append)
        self.assertEqual(len(esperar), 1)
        self.assertGreaterEqual(esperar[0], 6.9)  # 10 − 3, con margen por redondeo

    def test_segunda_despues_de_la_pausa_no_espera(self):
        reloj = RelojFalso(100.0)
        esperar = []
        uso = {}
        V._esperar_dominio("sitio.com", uso, reloj, esperar.append)
        reloj.t = 110.5  # pasaron 10,5 s
        V._esperar_dominio("sitio.com", uso, reloj, esperar.append)
        self.assertEqual(esperar, [])

    def test_dominios_distintos_no_se_pausan_entre_si(self):
        reloj = RelojFalso(100.0)
        esperar = []
        uso = {}
        V._esperar_dominio("sitio.com", uso, reloj, esperar.append)
        V._esperar_dominio("otro.net", uso, reloj, esperar.append)
        self.assertEqual(esperar, [])
        self.assertEqual(uso["otro.net"], 100.0)


def configurar_de_prueba():
    """Catálogo pequeño: feed RSS, npm y una entrada solo con `terminos`."""
    return {
        "entradas": [
            {
                "id": "feed-de-prueba",
                "nombre": "Feed de prueba",
                "clase_uso": "solo-referencia",
                "url": "https://sitio.com/feed",
                "actualizacion": [{"tipo": "rss", "url": "https://sitio.com/feed"}],
                "terminos": None,
            },
            {
                "id": "npm-de-prueba",
                "nombre": "Paquete de prueba",
                "clase_uso": "reutilizable",
                "actualizacion": [{"tipo": "npm", "ref": "paquete-prueba"}],
                "terminos": None,
            },
            {
                "id": "con-terminos",
                "nombre": "Sitio con términos",
                "clase_uso": "solo-referencia",
                "actualizacion": [],
                "terminos": "https://sitio.com/terminos",
            },
        ]
    }


def descargador_de_vigilancia(n_version="1.0.0", terminos=b"terminos v1"):
    descarga = DescargadorFalso({
        "https://sitio.com/feed": (200, FEED_RSS),
        "https://registry.npmjs.org/paquete-prueba/latest": (200, json.dumps({"version": n_version}).encode()),
        "https://sitio.com/terminos": (200, terminos),
    })
    return descarga


class TestVigilar(unittest.TestCase):
    """La orquestación entera: primera pasada de línea base y segunda con avisos."""

    def test_primera_pasada_linea_base_sin_avisos(self):
        config = configurar_de_prueba()
        descarga = descargador_de_vigilancia()
        estado, cambios, _, _ = armar(config, None, descarga=descarga)
        self.assertEqual(cambios, [])
        self.assertIn("feed-de-prueba", estado)
        self.assertEqual(estado["npm-de-prueba"]["canales"]["npm"]["version_ultima"], "1.0.0")
        # hash de términos ya guardado y fecha de verificación puesta
        self.assertIn("hash_terminos", estado["con-terminos"])
        self.assertIn("ultima_verificacion_terminos", estado["con-terminos"])
        # el catálogo NO se toca: ni clase_uso ni nada
        self.assertEqual(estado["con-terminos"]["clase_uso"], "solo-referencia")

    def test_segunda_pasada_avisa_novedad_npm_con_fecha(self):
        config = configurar_de_prueba()
        estado_primero, _, _, _ = armar(config, None, descarga=descargador_de_vigilancia())
        despues = T0 + timedelta(days=1)
        estado, cambios, _, _ = armar(
            config, estado_primero, descarga=descargador_de_vigilancia(n_version="0.4.0"),
            ahora=despues,
        )
        self.assertEqual(len(cambios), 1)
        self.assertEqual(cambios[0]["id"], "npm-de-prueba")
        self.assertEqual(cambios[0]["tipo"], "novedades")
        novedades = estado["npm-de-prueba"]["novedades"]
        self.assertEqual(novedades[0]["titulo"], "0.4.0")
        self.assertEqual(novedades[0]["fecha"], despues.isoformat())
        self.assertEqual(novedades[0]["canal"], "npm")

    def test_terminos_cambiados_dejan_a_revisar_sin_tocar_la_clase(self):
        config = configurar_de_prueba()
        estado_primero, _, _, _ = armar(config, None, descarga=descargador_de_vigilancia())
        despues = T0 + timedelta(days=40)  # más de un mes: toca volver a mirar
        estado, cambios, _, _ = armar(
            config, estado_primero,
            descarga=descargador_de_vigilancia(terminos=b"terminos v2 PELIGRO"),
            ahora=despues,
        )
        cambios_terminos = [c for c in cambios if c["tipo"] == "terminos"]
        self.assertEqual(len(cambios_terminos), 1)
        self.assertEqual(cambios_terminos[0]["id"], "con-terminos")
        self.assertTrue(estado["con-terminos"]["a_revisar"])
        self.assertEqual(estado["con-terminos"]["clase_uso"], "solo-referencia")

    def test_dentro_del_mes_no_toca_los_terminos(self):
        config = configurar_de_prueba()
        estado_primero, _, _, _ = armar(config, None, descarga=descargador_de_vigilancia())
        descarga = descargador_de_vigilancia(terminos=b"terminos v2 PELIGRO")
        _, cambios, _, _ = armar(
            config, estado_primero, descarga=descarga, ahora=T0 + timedelta(days=5)
        )
        self.assertEqual([c for c in cambios if c["tipo"] == "terminos"], [])
        self.assertNotIn("https://sitio.com/terminos", descarga.pedidas)  # ni pide nada

    def test_con_terminos_que_sigue_igual_no_marca_y_a_revisar_nunca_se_borra(self):
        config = configurar_de_prueba()
        estado_primero, _, _, _ = armar(config, None, descarga=descargador_de_vigilancia())
        # primera revisión de términos (cambia) y luego otra sin cambiar
        estado_segundo, _, _, _ = armar(
            config, estado_primero,
            descarga=descargador_de_vigilancia(terminos=b"cambio"), ahora=T0 + timedelta(days=40),
        )
        estado_tercero, cambios, _, _ = armar(
            config, estado_segundo,
            descarga=descargador_de_vigilancia(terminos=b"cambio"), ahora=T0 + timedelta(days=80),
        )
        self.assertEqual([c for c in cambios if c["tipo"] == "terminos"], [])
        # la bandera no se limpia sola: la revisa una persona
        self.assertTrue(estado_tercero["con-terminos"]["a_revisar"])

    def test_feeds_sin_cambio_entre_pasadas_no_vuelven_a_avisar(self):
        config = configurar_de_prueba()
        estado_primero, _, _, _ = armar(config, None, descarga=descargador_de_vigilancia())
        estado, cambios, _, _ = armar(
            config, estado_primero, descarga=descargador_de_vigilancia(),
            ahora=T0 + timedelta(days=2),
        )
        self.assertEqual(cambios, [])
        self.assertEqual(estado["feed-de-prueba"]["novedades"], [])

    def test_canales_no_vigilados_quedan_anotados_y_config_intacta(self):
        config = configurar_de_prueba()
        config["entradas"][0]["actualizacion"].append(
            {"tipo": "blog", "url": "https://sitio.com/blog/"}
        )
        config["entradas"][0]["actualizacion"].append({"tipo": "youtube-canal", "ref": "@alguien"})
        original = copy.deepcopy(config)
        descarga = descargador_de_vigilancia()
        estado, _, _, _ = armar(config, None, descarga=descarga)
        self.assertEqual(
            sorted(estado["feed-de-prueba"]["canales_no_vigilados"]), ["blog", "youtube-canal"]
        )
        self.assertEqual(config, original)  # catálogo congelado, clase de uso incluida

    def test_novedades_se_recortan_al_maximo(self):
        config = configurar_de_prueba()
        estado_previo = {
            "npm-de-prueba": {
                "nombre": "Paquete de prueba",
                "novedades": [{"fecha": "2026-01-01", "canal": "npm", "url": "x", "titulo": "vieja"}
                              for _ in range(V.MAX_NOVEDADES)],
                "canales": {"npm": {"version_ultima": "0.0.1"}},
            }
        }
        estado, cambios, _, _ = armar(
            config, estado_previo,
            descarga=descargador_de_vigilancia(n_version="1.1.0"), ahora=T0,
        )
        self.assertEqual(len(estado["npm-de-prueba"]["novedades"]), V.MAX_NOVEDADES)
        self.assertEqual(estado["npm-de-prueba"]["novedades"][0]["titulo"], "1.1.0")

    def test_ejecutar_guarda_estado_en_disco(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = configurar_de_prueba()
            os.makedirs(os.path.join(tmp, "config"), exist_ok=True)
            with open(os.path.join(tmp, "config", "referencias-inspiracion.json"), "w") as f:
                json.dump(config, f)
            cambios = V.ejecutar(
                raiz=tmp, descargar=descargador_de_vigilancia(),
                reloj=RelojFalso(), dormir=EsperadorFalso(),
            )
            self.assertEqual(cambios, [])  # primera pasada: línea base
            estado = V._cargar_json(
                os.path.join(tmp, "starseed_memory_root", "referencias", "estado.json"), None
            )
            self.assertIn("feed-de-prueba", estado)
            self.assertIn("ultima_verificacion", estado["con-terminos"])


if __name__ == "__main__":
    unittest.main()
