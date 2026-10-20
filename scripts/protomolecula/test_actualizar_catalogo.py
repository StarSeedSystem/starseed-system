#!/usr/bin/env python3
"""Pruebas de actualizar_catalogo.py con respuestas SIMULADAS (no tocan la red).
Ejecutar: python3 -m unittest scripts/protomolecula/test_actualizar_catalogo.py
"""
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import actualizar_catalogo as ac  # noqa: E402


def entrada(id, fuente, ref, version="v1.0.0", fecha="2026-01-01", lic="MIT", filtro=None):
    extra = f", filtro: {json.dumps(filtro)}" if filtro else ""
    v = "null" if version is None else json.dumps(version)
    f = "null" if fecha is None else json.dumps(fecha)
    return (f'  {{\n    id: "{id}", nombre: "Nombre {id}", categoria: "xr", tipo: "app", origen: "github",\n'
            f'    descripcion: "x",\n    licencia: "{lic}", codigo: null, web: null,\n'
            f'    actualizacion: {{ fuente: "{fuente}", ref: "{ref}", ultimaVersion: {v}, fechaVersion: {f}{extra} }},\n    ia: [],\n  }},')


def catalogo(*entradas):
    return "export const X = [\n" + "\n".join(entradas) + "\n];\n"


class Falso:
    """Servidor simulado: respuestas por URL exacta; cuenta las llamadas."""

    def __init__(self, respuestas):
        self.r = respuestas
        self.vistas = []

    def __call__(self, url, cabeceras=None, plazo=30):
        self.vistas.append((url, dict(cabeceras or {})))
        if url in self.r:
            v = self.r[url]
            return v if isinstance(v, tuple) else (200, {}, json.dumps(v))
        return 404, {}, ""


def consultor(falso, tmp, **kw):
    kw.setdefault("entorno", {})
    return ac.Consultor(get=falso, dormir=lambda s: None, ahora=kw.pop("ahora", lambda: 1000.0), cache_ruta=Path(tmp) / "c.json", **kw)


API = "https://api.github.com"


class LecturaTS(unittest.TestCase):
    def test_lee_ids_licencia_y_actualizacion(self):
        t = catalogo(entrada("uno", "github-releases", "o/r", filtro=r"^v\d+$", lic="MIT OR Apache-2.0"), entrada("dos", "web", "https://x.org", None, None))
        es = ac.leer_catalogo(t)
        self.assertEqual([e.id for e in es], ["uno", "dos"])
        self.assertEqual((es[0].fuente, es[0].ref, es[0].version, es[0].fecha, es[0].filtro, es[0].licencia), ("github-releases", "o/r", "v1.0.0", "2026-01-01", r"^v\d+$", "MIT OR Apache-2.0"))
        self.assertIsNone(es[1].version)
        self.assertIsNone(es[1].fecha)

    def test_una_entrada_con_el_nombre_en_otra_linea_tambien_se_lee(self):
        """pixelartistry-watertight va con `nombre:` debajo del `id:` y el lector la dejaba fuera (240 != 241)."""
        t = ('  {\n    id: "largo",\n    nombre: "Largo",\n    licencia: "MIT",\n'
             '    actualizacion: { fuente: "web", ref: "", ultimaVersion: null, fechaVersion: null },\n  },\n')
        es = ac.leer_catalogo(t)
        self.assertEqual([(e.id, e.nombre, e.licencia, e.fuente) for e in es], [("largo", "Largo", "MIT", "web")])

    def test_entrada_sin_actualizacion_falla_en_alto(self):
        with self.assertRaises(ValueError):
            ac.leer_catalogo('  {\n    id: "a", nombre: "A", categoria: "xr"\n  },\n  {\n    id: "b", nombre: "B", x: 1\n')

    def test_el_catalogo_real_se_lee_entero(self):
        texto = ac.CATALOGO.read_text("utf-8")
        es = ac.leer_catalogo(texto)
        self.assertEqual(len(es), len(re.findall(r'(?m)^    id: "', texto)))
        self.assertGreater(len(es), 200)
        self.assertEqual(len({e.id for e in es}), len(es))
        for e in es:
            self.assertIn(e.fuente, {"github-releases", "github-tags", "npm", "pypi", "flathub", "web"})
            self.assertTrue(e.licencia, e.id)
        # la línea se regenera idéntica: reescribir sin cambios no toca nada
        lineas = texto.split("\n")
        for e in es:
            self.assertEqual(ac.linea_actualizacion(e, e.version, e.fecha), lineas[e.linea], e.id)


class GitHub(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def uno(self, e, falso, **kw):
        return consultor(falso, self.tmp.name, **kw).consultar(ac.leer_catalogo(catalogo(e))[0])

    def test_releases_latest(self):
        f = Falso({f"{API}/repos/o/r/releases/latest": {"tag_name": "v2.0.0", "published_at": "2026-10-09T10:00:00Z"}})
        self.assertEqual(self.uno(entrada("a", "github-releases", "o/r"), f), {"version": "v2.0.0", "fecha": "2026-10-09", "via": "api"})

    def test_sin_latest_cae_a_la_lista_y_salta_preliminares_y_borradores(self):
        f = Falso({f"{API}/repos/o/r/releases?per_page=30": [
            {"tag_name": "v3.0.0-rc1", "prerelease": True, "published_at": "2026-10-09T00:00:00Z"},
            {"tag_name": "v2.9.0", "draft": True, "published_at": "2026-10-08T00:00:00Z"},
            {"tag_name": "v2.8.0", "published_at": "2026-10-07T12:00:00Z"}]})
        self.assertEqual(self.uno(entrada("a", "github-releases", "o/r"), f)["version"], "v2.8.0")

    def test_filtro_elige_la_estable_aunque_latest_apunte_a_otra(self):
        f = Falso({f"{API}/repos/o/r/releases?per_page=30": [
            {"tag_name": "bonsai-0.9.1-alpha2610100615", "published_at": "2026-10-10T06:00:00Z"},
            {"tag_name": "bonsai-0.9.0", "published_at": "2026-09-29T06:00:00Z"}]})
        r = self.uno(entrada("a", "github-releases", "o/r", filtro=r"^bonsai-\d+\.\d+\.\d+$"), f)
        self.assertEqual((r["version"], r["fecha"]), ("bonsai-0.9.0", "2026-09-29"))
        self.assertFalse(any(u.endswith("/releases/latest") for u, _ in f.vistas), "con filtro no se pide latest")

    def test_tags_elige_la_mayor_version_y_pone_fecha_del_commit(self):
        f = Falso({
            f"{API}/repos/o/r/tags?per_page=60": [
                {"name": "nightly", "commit": {"sha": "aaaaaaa1111"}}, {"name": "v1.9.0", "commit": {"sha": "bbbbbbb2222"}},
                {"name": "v1.10.0", "commit": {"sha": "ccccccc3333"}}],
            f"{API}/repos/o/r/commits/ccccccc3333": {"commit": {"committer": {"date": "2026-10-01T09:00:00Z"}}}})
        r = self.uno(entrada("a", "github-tags", "o/r"), f)
        self.assertEqual((r["version"], r["fecha"], r["sha"]), ("v1.10.0", "2026-10-01", "ccccccc"))

    def test_limite_de_la_api_cae_al_atom_publico_y_no_reintenta_la_api(self):
        atom = ('<feed><entry><link rel="alternate" href="https://github.com/o/r/releases/tag/v5.1.0"/><updated>2026-10-05T01:02:03Z</updated></entry>'
                '<entry><link rel="alternate" href="https://github.com/o/r/releases/tag/v5.0.0"/><updated>2026-09-01T01:02:03Z</updated></entry></feed>')
        f = Falso({f"{API}/repos/o/r/releases/latest": (403, {"x-ratelimit-remaining": "0"}, ""),
                   "https://github.com/o/r/releases/latest": (200, {"x-url-final": "https://github.com/o/r/releases/tag/v5.1.0"}, "<html/>"),
                   "https://github.com/o/r/releases.atom": (200, {}, atom)})
        c = consultor(f, self.tmp.name)
        r = c.consultar(ac.leer_catalogo(catalogo(entrada("a", "github-releases", "o/r")))[0])
        self.assertEqual(r, {"version": "v5.1.0", "fecha": "2026-10-05", "via": "atom"})
        self.assertTrue(c.api_github_limitada)
        n_api = sum(1 for u, _ in f.vistas if u.startswith(API))
        c.consultar(ac.leer_catalogo(catalogo(entrada("b", "github-releases", "o/r2")))[0])
        self.assertEqual(sum(1 for u, _ in f.vistas if u.startswith(API)), n_api, "limitada: no se vuelve a llamar a la API")

    def test_atom_de_tags_ignora_lo_que_no_parece_version(self):
        atom = ('<feed><entry><link href="https://github.com/o/r/releases/tag/helm-chart-1.3.6"/><updated>2026-10-09T00:00:00Z</updated></entry>'
                '<entry><link href="https://github.com/o/r/releases/tag/v1.2.0"/><updated>2026-08-01T00:00:00Z</updated></entry></feed>')
        f = Falso({f"{API}/repos/o/r/tags?per_page=60": (500, {}, ""), "https://github.com/o/r/tags.atom": (200, {}, atom)})
        self.assertEqual(self.uno(entrada("a", "github-tags", "o/r"), f)["version"], "v1.2.0")

    def test_sin_respuesta_devuelve_none_sin_lanzar(self):
        self.assertIsNone(self.uno(entrada("a", "github-releases", "o/r"), Falso({})))

    def test_el_token_solo_viaja_a_la_api_de_github_y_no_se_guarda(self):
        f = Falso({f"{API}/repos/o/r/releases/latest": {"tag_name": "v1", "published_at": "2026-10-01T00:00:00Z"},
                   "https://registry.npmjs.org/paq/latest": {"version": "1.0.0", "license": "MIT"},
                   "https://registry.npmjs.org/paq": {"time": {"1.0.0": "2026-10-02T00:00:00Z"}}})
        c = consultor(f, self.tmp.name, entorno={"GITHUB_TOKEN": "token-de-prueba-123"})
        c.consultar(ac.leer_catalogo(catalogo(entrada("a", "github-releases", "o/r")))[0])
        c.consultar(ac.leer_catalogo(catalogo(entrada("b", "npm", "paq", version=None, fecha=None)))[0])
        c.guardar_cache()
        for url, cab in f.vistas:
            if url.startswith(API):
                self.assertEqual(cab.get("Authorization"), "Bearer token-de-prueba-123")
            else:
                self.assertNotIn("Authorization", cab, url)
        self.assertNotIn("token-de-prueba-123", (Path(self.tmp.name) / "c.json").read_text())

    def test_licencia_de_github_solo_si_se_pide(self):
        f = Falso({f"{API}/repos/o/r/releases/latest": {"tag_name": "v1", "published_at": "2026-10-01T00:00:00Z"},
                   f"{API}/repos/o/r/license": {"license": {"spdx_id": "AGPL-3.0"}}})
        c = consultor(f, self.tmp.name)
        e = ac.leer_catalogo(catalogo(entrada("a", "github-releases", "o/r")))[0]
        self.assertNotIn("licencia", c.consultar(e))
        c2 = consultor(f, self.tmp.name + "/otra")
        self.assertEqual(c2.consultar(e, con_licencia=True)["licencia"], "AGPL-3.0")


class Registros(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def uno(self, e, falso):
        return consultor(falso, self.tmp.name).consultar(ac.leer_catalogo(catalogo(e))[0])

    def test_npm_misma_version_no_baja_el_paquete_entero(self):
        f = Falso({"https://registry.npmjs.org/@a%2Fb/latest": {"version": "1.2.3", "license": "MIT"}})
        r = self.uno(entrada("n", "npm", "@a/b", version="1.2.3", fecha="2026-05-05"), f)
        self.assertEqual((r["version"], r["fecha"], r["licencia"]), ("1.2.3", "2026-05-05", "MIT"))
        self.assertEqual(len(f.vistas), 1)

    def test_npm_version_nueva_busca_la_fecha(self):
        f = Falso({"https://registry.npmjs.org/paq/latest": {"version": "2.0.0", "license": {"type": "Apache-2.0"}},
                   "https://registry.npmjs.org/paq": {"time": {"2.0.0": "2026-10-03T08:00:00.000Z", "1.0.0": "2025-01-01T00:00:00Z"}}})
        r = self.uno(entrada("n", "npm", "paq", version="1.0.0"), f)
        self.assertEqual((r["version"], r["fecha"], r["licencia"]), ("2.0.0", "2026-10-03", "Apache-2.0"))

    def test_pypi(self):
        f = Falso({"https://pypi.org/pypi/demucs/json": {"info": {"version": "4.1.0", "license_expression": "MIT"}, "urls": [{"upload_time_iso_8601": "2026-04-02T10:00:00Z"}]}})
        r = self.uno(entrada("p", "pypi", "demucs"), f)
        self.assertEqual((r["version"], r["fecha"], r["licencia"]), ("4.1.0", "2026-04-02", "MIT"))

    def test_flathub_toma_el_lanzamiento_mas_reciente(self):
        f = Falso({"https://flathub.org/api/v2/appstream/org.kde.krita": {"project_license": "GPL-3.0-only", "releases": [
            {"version": "5.2.0", "timestamp": "1700000000"}, {"version": "5.3.1", "timestamp": "1790000000"}]}})
        r = self.uno(entrada("k", "flathub", "org.kde.krita"), f)
        self.assertEqual((r["version"], r["fecha"], r["licencia"]), ("5.3.1", "2026-09-21", "GPL-3.0-only"))

    def test_web_no_se_consulta(self):
        f = Falso({})
        self.assertIsNone(self.uno(entrada("w", "web", "https://x.org", None, None), f))
        self.assertEqual(f.vistas, [])

    def test_respuesta_rota_no_lanza(self):
        f = Falso({"https://pypi.org/pypi/x/json": (200, {}, "esto no es json")})
        self.assertIsNone(self.uno(entrada("p", "pypi", "x"), f))


class Cache(unittest.TestCase):
    def test_seis_horas_de_cache_y_pausa_entre_llamadas(self):
        with tempfile.TemporaryDirectory() as tmp:
            reloj = [1000.0]
            f = Falso({f"{API}/repos/o/r/releases/latest": {"tag_name": "v1", "published_at": "2026-10-01T00:00:00Z"},
                       f"{API}/repos/o/s/releases/latest": {"tag_name": "v2", "published_at": "2026-10-02T00:00:00Z"}})
            dormidas = []
            c = ac.Consultor(get=f, dormir=dormidas.append, ahora=lambda: reloj[0], cache_ruta=Path(tmp) / "c.json", pausa=0.7, entorno={})
            a, b = ac.leer_catalogo(catalogo(entrada("a", "github-releases", "o/r"), entrada("b", "github-releases", "o/s")))
            c.consultar(a)
            c.consultar(b)
            self.assertEqual(dormidas, [0.7], "pausa solo entre llamadas, no antes de la primera")
            c.guardar_cache()
            llamadas = len(f.vistas)
            c2 = ac.Consultor(get=f, dormir=dormidas.append, ahora=lambda: reloj[0] + 5 * 3600, cache_ruta=Path(tmp) / "c.json", entorno={})
            self.assertEqual(c2.consultar(a)["version"], "v1")
            self.assertEqual(len(f.vistas), llamadas, "dentro de 6 h no hay red")
            c3 = ac.Consultor(get=f, dormir=dormidas.append, ahora=lambda: reloj[0] + 6 * 3600 + 1, cache_ruta=Path(tmp) / "c.json", entorno={})
            c3.consultar(a)
            self.assertEqual(len(f.vistas), llamadas + 1, "pasadas 6 h se vuelve a preguntar")

    def test_los_fallos_no_se_cachean(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Falso({})
            c = consultor(f, tmp)
            e = ac.leer_catalogo(catalogo(entrada("a", "pypi", "x")))[0]
            self.assertIsNone(c.consultar(e))
            c.guardar_cache()
            self.assertFalse((Path(tmp) / "c.json").exists())


class Diferencias(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.cat = self.dir / "catalogo.ts"
        self.sal = self.dir / "salida" / "versiones.json"
        self.texto = catalogo(entrada("igual", "github-releases", "o/igual", version="v1.0.0"),
                              entrada("cambia", "github-releases", "o/cambia", version="v1.0.0", fecha="2026-01-01"),
                              entrada("vieja", "pypi", "vieja", version=None, fecha=None),
                              entrada("manual", "web", "https://x.org", "Alpha 4", "2026-07-31"),
                              entrada("muerta", "npm", "no-existe"))
        self.cat.write_text(self.texto, "utf-8")
        self.f = Falso({
            f"{API}/repos/o/igual/releases/latest": {"tag_name": "v1.0.0", "published_at": "2026-01-01T00:00:00Z"},
            f"{API}/repos/o/cambia/releases/latest": {"tag_name": "v1.1.0", "published_at": "2026-10-08T00:00:00Z"},
            "https://pypi.org/pypi/vieja/json": {"info": {"version": "0.3"}, "urls": []}})

    def correr(self, **kw):
        c = consultor(self.f, self.dir, **{k: v for k, v in kw.items() if k == "entorno"})
        return ac.ejecutar(self.cat, self.sal, c, aplicar=kw.get("aplicar", False), con_licencia=kw.get("lic", False), ahora_iso="2026-10-10T12:00:00Z")

    def test_el_informe_lleva_solo_las_diferencias(self):
        r = self.correr()
        self.assertEqual({c["id"] for c in r["cambios"]}, {"cambia", "vieja"})
        self.assertEqual((r["iguales"], r["omitidas"], len(r["errores"])), (1, ["manual"], 1))
        informe = json.loads(self.sal.read_text("utf-8"))
        self.assertEqual([c["id"] for c in informe["cambios"]], ["cambia", "vieja"])
        self.assertEqual(informe["cambios"][0]["desde"], {"version": "v1.0.0", "fecha": "2026-01-01"})
        self.assertEqual(informe["cambios"][0]["hasta"]["version"], "v1.1.0")
        self.assertEqual(informe["errores"][0]["id"], "muerta")
        self.assertEqual(self.cat.read_text("utf-8"), self.texto, "sin --aplicar el catálogo no se toca")

    def test_sin_diferencias_no_se_escribe_nada(self):
        self.cat.write_text(catalogo(entrada("igual", "github-releases", "o/igual", version="v1.0.0")), "utf-8")
        r = self.correr()
        self.assertFalse(r["escrito"])
        self.assertFalse(self.sal.exists())

    def test_aplicar_reescribe_solo_las_lineas_que_cambian(self):
        r = self.correr(aplicar=True)
        self.assertEqual(r["lineasReescritas"], 2)
        nuevo = self.cat.read_text("utf-8")
        antes, despues = self.texto.split("\n"), nuevo.split("\n")
        self.assertEqual(len(antes), len(despues))
        cambiadas = [i for i, (a, b) in enumerate(zip(antes, despues)) if a != b]
        self.assertEqual(len(cambiadas), 2)
        for i in cambiadas:
            self.assertIn("actualizacion:", despues[i])
        es = {e.id: e for e in ac.leer_catalogo(nuevo)}
        self.assertEqual((es["cambia"].version, es["cambia"].fecha), ("v1.1.0", "2026-10-08"))
        self.assertEqual((es["vieja"].version, es["vieja"].fecha), ("0.3", None))
        self.assertEqual(es["manual"].version, "Alpha 4", "la fuente web no se toca")

    def test_el_filtro_sobrevive_a_la_reescritura(self):
        self.cat.write_text(catalogo(entrada("b", "github-releases", "o/b", version="bonsai-0.8.0", filtro=r"^bonsai-\d+\.\d+\.\d+$")), "utf-8")
        self.f.r[f"{API}/repos/o/b/releases?per_page=30"] = [{"tag_name": "bonsai-0.9.0", "published_at": "2026-09-29T00:00:00Z"}]
        self.correr(aplicar=True)
        e = ac.leer_catalogo(self.cat.read_text("utf-8"))[0]
        self.assertEqual((e.version, e.filtro), ("bonsai-0.9.0", r"^bonsai-\d+\.\d+\.\d+$"))

    def test_si_el_catalogo_cambia_durante_la_consulta_no_se_pisa(self):
        original = self.f.__call__
        cat = self.cat

        def get(url, cab=None, plazo=30):
            cat.write_text(cat.read_text("utf-8") + "\n// editado por otro\n", "utf-8")
            return original(url, cab, plazo)

        c = ac.Consultor(get=get, dormir=lambda s: None, cache_ruta=self.dir / "c.json", entorno={})
        r = ac.ejecutar(self.cat, self.sal, c, aplicar=True)
        self.assertEqual(r["lineasReescritas"], 0)
        self.assertIn("cambió durante la consulta", r["aviso"])
        self.assertIn("// editado por otro", self.cat.read_text("utf-8"))

    def test_solo_limita_las_consultas(self):
        c = consultor(self.f, self.dir)
        r = ac.ejecutar(self.cat, self.sal, c, solo={"cambia"})
        self.assertEqual([x["id"] for x in r["cambios"]], ["cambia"])

    def test_cambio_de_licencia_se_avisa_aunque_la_version_sea_la_misma(self):
        self.cat.write_text(catalogo(entrada("l", "npm", "paq", version="1.0.0", lic="MIT")), "utf-8")
        f = Falso({"https://registry.npmjs.org/paq/latest": {"version": "1.0.0", "license": "AGPL-3.0"}})
        r = ac.ejecutar(self.cat, self.sal, consultor(f, self.dir), aplicar=True)
        self.assertEqual(r["cambios"][0]["licenciaCambiada"], {"catalogo": "MIT", "upstream": "AGPL-3.0"})
        self.assertTrue(r["cambios"][0]["soloLicencia"])
        self.assertEqual(r["lineasReescritas"], 0, "la licencia no se reescribe sola: la revisa una persona")

    def test_licencia_equivalente_no_es_cambio(self):
        for catalogo_lic, up in [("GPL-3.0-or-later", "GPL-3.0+"), ("MIT OR Apache-2.0", "MIT"), ("LGPL-2.1-or-later", "LGPL-2.1-only"), ("MIT", "(MIT AND ISC)")]:
            self.assertFalse(ac.licencia_cambio(catalogo_lic, up), (catalogo_lic, up))
        self.assertTrue(ac.licencia_cambio("MIT", "GPL-3.0-only"))
        self.assertFalse(ac.licencia_cambio("LicenseRef-tldraw", "MIT"), "las propias no se comparan")


class Linea(unittest.TestCase):
    def test_orden_de_versiones_numericas(self):
        self.assertGreater(ac._clave_version("v1.10.0"), ac._clave_version("v1.9.0"))
        self.assertGreater(ac._clave_version("n8.1.3"), ac._clave_version("n7.1.2"))
        self.assertGreater(ac._clave_version("prod-2026-03-11"), ac._clave_version("prod-2025-12-31"))

    def test_la_linea_regenerada_conserva_el_formato(self):
        e = ac.leer_catalogo(catalogo(entrada("a", "github-tags", "o/r", filtro=r"^release_xt_")))[0]
        self.assertEqual(ac.linea_actualizacion(e, "release_xt_1.3.4", "2024-08-11"),
                         '    actualizacion: { fuente: "github-tags", ref: "o/r", ultimaVersion: "release_xt_1.3.4", fechaVersion: "2024-08-11", filtro: "^release_xt_" },')


if __name__ == "__main__":
    unittest.main()
