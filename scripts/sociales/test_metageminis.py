#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de scripts/sociales/metageminis.py (unittest, sin red, sin claves, sin tocar ~/.starseed).

  cd scripts/sociales && python3 -m unittest -v

Lo que vigilan, por orden de importancia:
  1. el agente NUNCA envía: la única red es _post_json y su lista blanca no incluye ningún sitio del directorio;
  2. nada nace aprobado, y un borrador siempre lleva el aviso de agente de IA;
  3. los sitios vetados (NLnet, Hacker News, LinkedIn, solo lectura, cerrados) no reciben borrador;
  4. el vocabulario (ramas, canales, columnas) es el de la migración SQL.
"""
import contextlib
import io
import json
import os
import re
import sys
import tempfile
import unittest
import urllib.parse

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import metageminis as mg  # noqa: E402

DIRECTORIO = mg.cargar_directorio()
POR_ID = {s["id"]: s for s in DIRECTORIO}
ENV_VACIO = {}


def sitio(i):
    return POR_ID[i]


class RespuestaFalsa:
    def __init__(self, cuerpo=b""):
        self._cuerpo = cuerpo

    def read(self):
        return self._cuerpo

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def consultar_falso(tipo, estado, pregunta, **kw):
    return {"respuesta": "alto", "p": 0.91, "medio": "local", "experiencia": "exp-1"}


class TestDirectorio(unittest.TestCase):
    def test_tamano_y_unicidad(self):
        self.assertGreaterEqual(len(DIRECTORIO), 40)
        self.assertLessEqual(len(DIRECTORIO), 80)
        ids = [s["id"] for s in DIRECTORIO]
        self.assertEqual(len(ids), len(set(ids)))

    def test_urls_https_y_campos(self):
        claves = {"id", "nombre", "url", "categoria", "que_es", "utilidad", "acceso", "api_o_formulario", "agentes", "reglas",
                  "ia_en_texto", "coste", "coste_nota", "prioridad", "estado", "vence", "pasos_alex", "ramas", "verificacion",
                  "verificado", "fuente"}
        for s in DIRECTORIO:
            self.assertEqual(set(s), claves, s["id"])
            self.assertTrue(s["url"].startswith("https://"), s["id"])
            self.assertTrue(s["fuente"].startswith("https://"), s["id"])
            self.assertIn(s["prioridad"], (1, 2, 3, 4, 5))
            self.assertRegex(s["verificado"], r"^\d{4}-\d{2}-\d{2}$")
            self.assertTrue(set(s["ramas"]) <= set(mg.RAMAS), (s["id"], s["ramas"]))

    def test_fecha_de_verificacion_en_el_ts(self):
        with open(mg.RUTA_DIRECTORIO, encoding="utf-8") as f:
            self.assertRegex(f.read(), r'FECHA_VERIFICACION = "\d{4}-\d{2}-\d{2}"')

    def test_sin_el_bloque_de_datos_falla_claro(self):
        with tempfile.NamedTemporaryFile("w", suffix=".ts", delete=False, encoding="utf-8") as f:
            f.write("export const OTRO = 1;")
        try:
            with self.assertRaises(ValueError):
                mg.cargar_directorio(f.name)
        finally:
            os.unlink(f.name)


class TestReglas(unittest.TestCase):
    def test_vetados_no_se_redactan(self):
        for i in ("nlnet-convocatoria", "hacker-news", "linkedin", "fundsforngos", "bdns-infosubvenciones", "ngi-zero-commons", "sovereign-tech-agency", "kickstarter"):
            with self.subTest(i):
                self.assertFalse(mg.puede_redactar(sitio(i)))
                self.assertFalse(mg.puede_enviar_el_agente(sitio(i)))
                self.assertIsNotNone(mg.motivo_no_redactable(sitio(i)))

    def test_nlnet_por_su_regla_de_ia(self):
        self.assertEqual(sitio("nlnet-convocatoria")["ia_en_texto"], "no-aceptada")
        self.assertIn("IA", mg.motivo_no_redactable(sitio("nlnet-convocatoria")))

    def test_bluesky_puede_por_api_oficial(self):
        s = sitio("bluesky")
        self.assertTrue(mg.puede_redactar(s))
        self.assertTrue(mg.puede_enviar_el_agente(s))
        self.assertEqual(mg.canal_para(s), "api_oficial")

    def test_lo_humano_lo_envia_una_persona(self):
        for i in ("goteo", "otf-internet-freedom-fund", "open-collective"):
            with self.subTest(i):
                self.assertTrue(mg.puede_redactar(sitio(i)))
                self.assertFalse(mg.puede_enviar_el_agente(sitio(i)))
                self.assertEqual(mg.canal_para(sitio(i)), "manual_alex")

    def test_moltbook_pide_primero_a_un_humano(self):
        # Hecho para agentes, pero el alta la reclama una persona (cuenta-humana): el primer paso es de Alex.
        s = sitio("moltbook")
        self.assertTrue(mg.puede_redactar(s))
        self.assertEqual(s["acceso"], "cuenta-humana")
        self.assertEqual(mg.canal_para(s), "manual_alex")

    def test_por_revisar_se_redacta_pero_no_sale_solo(self):
        s = sitio("reddit")
        self.assertEqual(s["estado"], "revisar")
        self.assertTrue(mg.puede_redactar(s))
        self.assertFalse(mg.puede_enviar_el_agente(s))
        self.assertEqual(mg.canal_para(s), "manual_alex")

    def test_todo_canal_es_del_vocabulario(self):
        for s in DIRECTORIO:
            self.assertIn(mg.canal_para(s), mg.CANALES, s["id"])
            self.assertIn(mg.rama_para(s), mg.RAMAS, s["id"])

    def test_el_agente_solo_envia_donde_las_reglas_lo_permiten(self):
        for s in DIRECTORIO:
            if mg.canal_para(s) in ("api_oficial", "formulario"):
                self.assertIn(s["agentes"], ("diseñado-para-agentes", "api-oficial-con-aviso"), s["id"])
                self.assertNotEqual(s["ia_en_texto"], "no-aceptada", s["id"])
                self.assertNotIn(s["estado"], ("revisar", "cerrado", "no-encaja"), s["id"])

    def test_plan_excluye_vetados_aunque_se_pida_todo(self):
        el, ex = mg.plan(DIRECTORIO, prioridad_max=5)
        ids = {e["id"] for e in el}
        for i in ("nlnet-convocatoria", "hacker-news", "linkedin", "hacktoberfest", "ngi-zero-commons"):
            self.assertNotIn(i, ids)
        for e in ex:
            self.assertTrue(e["motivo"])
        self.assertEqual(len(el) + len(ex), len(DIRECTORIO))

    def test_plan_ordena_por_prioridad_y_plazo(self):
        el, _ = mg.plan(DIRECTORIO, prioridad_max=3)
        pr = [e["prioridad"] for e in el]
        self.assertEqual(pr, sorted(pr))

    def test_plan_de_un_sitio_vetado_dice_por_que(self):
        el, ex = mg.plan(DIRECTORIO, 2, "hacker-news")
        self.assertEqual(el, [])
        self.assertEqual(len(ex), 1)
        self.assertIn("IA", ex[0]["motivo"])


class TestVocabularioMigracion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(mg.RUTA_MIGRACION, encoding="utf-8") as f:
            cls.sql = f.read()
        m = re.search(r"CREATE TABLE IF NOT EXISTS public\.metageminis_borradores \((.*?)\n\);", cls.sql, re.S)
        assert m, "no se encontró la tabla metageminis_borradores"
        cls.tabla = m.group(1)

    @staticmethod
    def lista(txt):
        return tuple(x.strip().strip("'") for x in txt.split(","))

    def test_ramas_como_en_la_migracion(self):
        m = re.search(r"id\s+text PRIMARY KEY CHECK \(id IN \(([^)]*)\)\)", self.sql)
        self.assertEqual(set(self.lista(m.group(1))), set(mg.RAMAS))

    def test_canales_como_en_la_migracion(self):
        m = re.search(r"canal\s+text NOT NULL CHECK \(canal IN \(([^)]*)\)\)", self.tabla)
        self.assertEqual(set(self.lista(m.group(1))), set(mg.CANALES))

    def test_niveles_como_en_la_migracion(self):
        m = re.search(r"puntuacion_nivel\s+text CHECK \(puntuacion_nivel IS NULL OR puntuacion_nivel IN \(([^)]*)\)\)", self.tabla)
        self.assertEqual(set(self.lista(m.group(1))), set(mg.NIVELES))

    def test_estado_inicial_como_en_la_migracion(self):
        m = re.search(r"estado\s+text NOT NULL DEFAULT '([a-z_]+)'", self.tabla)
        self.assertEqual(m.group(1), mg.ESTADO_INICIAL)

    def test_columnas_que_inserta_el_agente_existen(self):
        existentes = {l.strip().split()[0] for l in self.tabla.splitlines() if l.strip() and not l.strip().startswith(("--", "CHECK"))}
        for c in mg.ColaSupabase.COLUMNAS:
            self.assertIn(c, existentes)


class TestRedaccion(unittest.TestCase):
    def test_prompt_lleva_las_reglas_y_el_sitio(self):
        p = mg.construir_prompt(sitio("goteo"), "contexto de prueba")
        self.assertIn("agente de IA", p)
        self.assertIn("Goteo", p)
        self.assertIn("no inventes", p)
        self.assertIn("contexto de prueba", p)

    def test_cuerpo_siempre_declara_que_es_ia_y_pasa_por_aprobacion(self):
        c = mg.componer_cuerpo("Hola")
        self.assertTrue(c.endswith(mg.AVISO_IA))
        self.assertIn("agente de IA", mg.AVISO_IA)
        self.assertIn("aprueba", mg.AVISO_IA)

    def test_publicacion_propia_cabe_y_lleva_aviso_corto(self):
        for i in ("bluesky", "telegram", "youtube"):
            c = mg.componer_cuerpo("Texto " * 120, sitio(i))
            self.assertLessEqual(len(c), mg.LIMITE_PUBLICACION, i)
            self.assertTrue(c.endswith(mg.AVISO_IA_CORTO), i)
        self.assertIn("agente de IA", mg.AVISO_IA_CORTO)
        corto = mg.componer_cuerpo("Hola", sitio("bluesky"))
        self.assertEqual(corto, "Hola " + mg.AVISO_IA_CORTO)
        # Fuera de los canales de publicación propia, el aviso completo.
        self.assertTrue(mg.componer_cuerpo("Hola", sitio("goteo")).endswith(mg.AVISO_IA))

    def test_plantillas_para_todas_las_categorias(self):
        for s in DIRECTORIO:
            t = mg.plantilla(s)
            self.assertGreater(len(t), 60, s["id"])
            self.assertNotRegex(t, r"€|\$|gratis para siempre|garantiz", s["id"])

    def test_generar_con_el_primer_proveedor_con_clave(self):
        vistos = []

        def llamar(url, cuerpo, cab):
            vistos.append((url, cab))
            return {"choices": [{"message": {"content": "Un texto suficientemente largo para ser un borrador razonable y honesto de StarSeed."}}]}

        env = {"XKIRO_API_KEY": "valor-de-prueba"}
        texto, prov, modelo = mg.generar_texto(sitio("bluesky"), "ctx", env, llamar=llamar)
        self.assertEqual(prov, "xkiro")
        self.assertTrue(modelo)
        self.assertIn("xkiro.com", vistos[0][0])
        self.assertEqual(vistos[0][1]["Authorization"], "Bearer valor-de-prueba")
        self.assertNotIn("valor-de-prueba", texto)

    def test_cae_al_siguiente_proveedor_si_uno_falla(self):
        llamadas = []

        def llamar(url, cuerpo, cab):
            llamadas.append(url)
            if "xkiro" in url:
                raise RuntimeError("429")
            return {"choices": [{"message": {"content": "Respuesta del segundo proveedor, lo bastante larga para valer como borrador de prueba."}}]}

        _, prov, _ = mg.generar_texto(sitio("goteo"), "ctx", {"XKIRO_API_KEY": "a", "NVIDIA_API_KEY": "b"}, llamar=llamar)
        self.assertEqual(prov, "nim")
        self.assertEqual(len(llamadas), 2)

    def test_sin_respuesta_devuelve_none_para_usar_la_plantilla(self):
        def llamar(url, cuerpo, cab):
            raise RuntimeError("sin cupo")

        self.assertEqual(mg.generar_texto(sitio("goteo"), "ctx", {}, llamar=llamar), (None, None, None))

    def test_rechaza_salidas_con_forma_de_clave(self):
        falsa = "sk" + "-" + "a" * 30

        def llamar(url, cuerpo, cab):
            return {"choices": [{"message": {"content": "Aquí tienes el texto " + falsa + " y algo más para que mida bastante más de sesenta caracteres."}}]}

        self.assertEqual(mg.generar_texto(sitio("goteo"), "ctx", {}, llamar=llamar), (None, None, None))

    def test_contexto_de_starseed(self):
        c = mg.contexto_starseed()
        self.assertIn("Ontocracia", c)
        self.assertLessEqual(len(c), 3300)
        self.assertIn("StarSeed", mg.contexto_starseed("/no/existe.md"))


class TestRedYSeguridad(unittest.TestCase):
    def test_http_solo_a_hosts_permitidos(self):
        permitidos = {"api.xkiro.com"}
        with self.assertRaises(mg.HostNoPermitido):
            mg._post_json("https://www.moltbook.com/api/v1/posts", {}, {}, permitidos)
        with self.assertRaises(mg.HostNoPermitido):
            mg._post_json("http://api.xkiro.com/v1/chat/completions", {}, {}, permitidos)
        r = mg._post_json("https://api.xkiro.com/v1/x", {"a": 1}, {}, permitidos, abrir=lambda req, timeout: RespuestaFalsa(b'{"ok": true}'))
        self.assertEqual(r, {"ok": True})

    def test_ningun_sitio_del_directorio_esta_en_la_lista_blanca(self):
        env = {"SUPABASE_URL": "https://abcd1234.supabase.co"}
        permitidos = mg.hosts_permitidos(env)
        self.assertIn("abcd1234.supabase.co", permitidos)
        for s in DIRECTORIO:
            for u in (s["url"], s["fuente"]):
                self.assertNotIn(urllib.parse.urlparse(u).hostname, permitidos, s["id"])

    def test_el_codigo_no_envia(self):
        with open(mg.__file__.replace(".pyc", ".py"), encoding="utf-8") as f:
            src = f.read()
        self.assertEqual(src.count("urlopen"), 1, "toda la red pasa por _post_json")
        self.assertNotRegex(src, r"(?m)^def (enviar|publicar|postear)")
        for prohibido in ("smtplib", "subprocess", "socket", "webbrowser", "selenium", "playwright"):
            self.assertNotIn("import " + prohibido, src)

    def test_sin_claves_en_el_codigo(self):
        with open(mg.__file__.replace(".pyc", ".py"), encoding="utf-8") as f:
            src = f.read()
        for p in mg._SECRETOS:
            self.assertIsNone(p.search(src), p.pattern)
        self.assertNotIn("Bearer " + "ey", src)

    def test_leer_env_prefiere_el_entorno_y_nunca_lo_imprime(self):
        with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as f:
            f.write("# comentario\nexport XKIRO_API_KEY=prueba-del-archivo\nOTRA=1\n")
        try:
            env = mg.leer_env(f.name, base={"XKIRO_API_KEY": "del-entorno"})
            self.assertEqual(env["XKIRO_API_KEY"], "del-entorno")
            self.assertEqual(env["OTRA"], "1")
            self.assertEqual(mg.leer_env(f.name, base={})["XKIRO_API_KEY"], "prueba-del-archivo")
        finally:
            os.unlink(f.name)

    def test_llm7_no_necesita_clave(self):
        self.assertEqual(mg.proveedores_disponibles({}), ["llm7"])
        self.assertEqual(mg.proveedores_disponibles({"NVIDIA_SHARED_KEY": "x"})[0], "nim")


class TestPuntuacion(unittest.TestCase):
    def test_usa_la_respuesta_de_jev(self):
        self.assertEqual(mg.puntuar(sitio("goteo"), "texto", consultar_falso), ("alto", 0.91, "local", "exp-1"))

    def test_si_jev_calla_manda_la_regla(self):
        def roto(*a, **k):
            raise RuntimeError("sin motor")

        n, p, medio, exp = mg.puntuar(sitio("reddit"), "texto", roto)
        self.assertEqual((n, p, medio, exp), ("bajo", None, "regla", None))

    def test_respuesta_fuera_de_los_niveles_cae_a_la_regla(self):
        n, *_ = mg.puntuar(sitio("goteo"), "texto", lambda *a, **k: {"respuesta": "genial", "p": 0.5, "medio": "x"})
        self.assertEqual(n, mg.regla_de_nivel(sitio("goteo")))

    def test_reglas_de_nivel(self):
        self.assertEqual(mg.regla_de_nivel(sitio("bluesky")), "alto")
        self.assertEqual(mg.regla_de_nivel(sitio("reddit")), "bajo")
        self.assertEqual(mg.regla_de_nivel(sitio("mastodon")), "medio")

    def test_con_decidir_real_y_jev_apagado(self):
        import importlib

        anterior = os.environ.get("STARSEED_JEV")
        os.environ["STARSEED_JEV"] = "0"
        try:
            sys.path.insert(0, os.path.join(mg.RAIZ, "scripts", "puente"))
            decidir = importlib.import_module("decidir")

            def sin_anotar(*a, **k):
                return decidir.consultar(*a, **dict(k, anotar=False))

            n, p, medio, exp = mg.puntuar(sitio("goteo"), "texto", sin_anotar)
        except ImportError:
            self.skipTest("decidir.py no se pudo importar aquí")
        finally:
            if anterior is None:
                os.environ.pop("STARSEED_JEV", None)
            else:
                os.environ["STARSEED_JEV"] = anterior
        self.assertEqual((n, medio), (mg.regla_de_nivel(sitio("goteo")), "regla"))
        self.assertIsNone(p)
        self.assertIsNone(exp)


class TestCola(unittest.TestCase):
    def fila(self, i="goteo", cuerpo="Cuerpo de prueba"):
        return mg.nueva_fila(sitio(i), mg.componer_cuerpo(cuerpo), "medio", 0.5, "regla")

    def test_nada_nace_aprobado(self):
        f = self.fila()
        self.assertEqual(f["estado"], "para_aprobar")
        for k in ("aprobado_por", "aprobado_en", "enviado_en", "respondido_en"):
            self.assertNotIn(k, f)
        self.assertRegex(f["huella"], r"^[0-9a-f]{64}$")
        self.assertLessEqual(len(f["asunto"]), 200)
        self.assertIn(f["canal"], mg.CANALES)
        self.assertIn(f["rama_id"], mg.RAMAS)

    def test_huella_ignora_espacios_y_mayusculas_pero_no_el_sitio(self):
        a = mg.huella("goteo", "Hola   Mundo\n")
        self.assertEqual(a, mg.huella("goteo", "hola mundo"))
        self.assertNotEqual(a, mg.huella("bluesky", "hola mundo"))

    def test_cola_local_no_repite(self):
        with tempfile.TemporaryDirectory() as d:
            c = mg.ColaLocal(os.path.join(d, "x", "cola.jsonl"))
            self.assertEqual(c.leer(), [])
            self.assertTrue(c.agregar(self.fila()))
            self.assertFalse(c.agregar(self.fila()))
            self.assertTrue(c.agregar(self.fila("bluesky")))
            filas = c.leer()
            self.assertEqual(len(filas), 2)
            self.assertTrue(all(f["estado"] == "para_aprobar" and f["creado_en"] for f in filas))

    def test_supabase_solo_inserta_columnas_conocidas_y_para_aprobar(self):
        env = {"SUPABASE_URL": "https://abcd1234.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "clave-de-prueba", "METAGEMINIS_AGENTE_ID": "11111111-1111-1111-1111-111111111111"}
        capturado = {}

        def abrir(req, timeout):
            capturado["url"] = req.full_url
            capturado["metodo"] = req.get_method()
            capturado["cab"] = {k.lower(): v for k, v in req.header_items()}
            capturado["cuerpo"] = json.loads(req.data.decode("utf-8"))
            return RespuestaFalsa(b"")

        c = mg.ColaSupabase(env, abrir=abrir)
        self.assertTrue(c.disponible())
        f = self.fila()
        f["_experiencia"] = "no-debe-salir"
        self.assertTrue(c.agregar(f))
        self.assertEqual(capturado["metodo"], "POST")
        self.assertTrue(capturado["url"].endswith("/rest/v1/metageminis_borradores?on_conflict=huella"))
        self.assertEqual(set(capturado["cuerpo"]), set(mg.ColaSupabase.COLUMNAS))
        self.assertEqual(capturado["cuerpo"]["estado"], "para_aprobar")
        self.assertEqual(capturado["cuerpo"]["agente_id"], env["METAGEMINIS_AGENTE_ID"])
        self.assertIn("ignore-duplicates", capturado["cab"]["prefer"])

    def test_supabase_no_disponible_sin_variables(self):
        self.assertFalse(mg.ColaSupabase({}).disponible())
        self.assertFalse(mg.ColaSupabase({"SUPABASE_URL": "http://x", "SUPABASE_SERVICE_ROLE_KEY": "k"}).disponible())

    def test_elegir_cola(self):
        local = mg.ColaLocal("/tmp/no-se-usa.jsonl")
        self.assertIs(mg.elegir_cola("auto", {}, local), local)
        with self.assertRaises(SystemExit):
            mg.elegir_cola("supabase", {})


class TestCiclo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cola = mg.ColaLocal(os.path.join(self.tmp.name, "cola.jsonl"))

    def tearDown(self):
        self.tmp.cleanup()

    def correr(self, **kw):
        args = dict(maximo=3, prioridad_max=2, sin_llm=True, consultar=consultar_falso, contexto="ctx")
        args.update(kw)
        return mg.ciclo(DIRECTORIO, ENV_VACIO, self.cola, **args)

    def test_deja_borradores_para_aprobar_con_aviso(self):
        r = self.correr()
        self.assertEqual(len(r["hechos"]), 3)
        filas = self.cola.leer()
        self.assertEqual(len(filas), 3)
        for f in filas:
            self.assertEqual(f["estado"], "para_aprobar")
            self.assertTrue(f["cuerpo"].endswith(mg.AVISO_IA) or f["cuerpo"].endswith(mg.AVISO_IA_CORTO))
            self.assertIn("agente de IA", f["cuerpo"])
            self.assertEqual(f["puntuacion_nivel"], "alto")
        self.assertTrue(all(h["origen"] == "plantilla" for h in r["hechos"]))

    def test_no_repite_y_sigue_con_el_siguiente(self):
        primera = {h["sitio"] for h in self.correr()["hechos"]}
        segunda = self.correr()
        # (OPO1010) Lo que espera la decisión de Alex no se vuelve a redactar: queda «en espera».
        self.assertEqual(set(segunda["en_espera"]), primera)
        self.assertEqual(len(segunda["hechos"]), 3)
        self.assertFalse(primera & {h["sitio"] for h in segunda["hechos"]})

    def test_24_7_con_textos_distintos_no_duplica_borradores(self):
        # Servir 24/7 con un modelo: cada pasada el texto cambia (y su huella también). Antes cada
        # hora entraba otro borrador casi igual para los mismos sitios; ahora ninguno se repite.
        n = {"i": 0}

        def llamar(url, cuerpo, cab):
            n["i"] += 1
            return {"choices": [{"message": {"content": "Versión %d del texto del modelo, distinta en cada pasada y bastante larga." % n["i"]}}]}

        for _ in range(5):
            self.correr(sin_llm=False, llamar=llamar)
        sitios = [f["sitio_id"] for f in self.cola.leer()]
        self.assertEqual(len(sitios), len(set(sitios)))
        self.assertEqual(len(sitios), min(15, len(mg.plan(DIRECTORIO, 2)[0])))

    def test_un_sitio_decidido_vuelve_a_poder_redactarse(self):
        self.correr(maximo=1)
        fila = self.cola.leer()[0]
        with open(self.cola.ruta, "w", encoding="utf-8") as f:
            f.write(json.dumps(dict(fila, estado="descartado")) + "\n")
        self.assertNotIn(fila["sitio_id"], mg.sitios_con_borrador_pendiente(self.cola))
        self.assertEqual(mg.sitios_con_borrador_pendiente(object()), set())

    def test_modo_seco_no_guarda(self):
        self.assertEqual(len(self.correr(seco=True)["hechos"]), 3)
        self.assertEqual(self.cola.leer(), [])

    def test_con_modelo_dice_de_donde_vino(self):
        def llamar(url, cuerpo, cab):
            return {"choices": [{"message": {"content": "Texto generado por el modelo de prueba, bastante más largo que sesenta caracteres."}}]}

        r = self.correr(sin_llm=False, llamar=llamar, maximo=1)
        self.assertTrue(r["hechos"][0]["origen"].startswith("llm7/"))

    def test_jamas_redacta_para_los_vetados(self):
        self.correr(maximo=200, prioridad_max=5)
        sitios = {f["sitio_id"] for f in self.cola.leer()}
        for i in ("nlnet-convocatoria", "hacker-news", "linkedin", "fundsforngos", "ngi-zero-commons"):
            self.assertNotIn(i, sitios)

    def test_el_canal_automatico_solo_donde_las_reglas_lo_permiten(self):
        self.correr(maximo=200, prioridad_max=5)
        for f in self.cola.leer():
            s = sitio(f["sitio_id"])
            if f["canal"] == "api_oficial":
                self.assertTrue(mg.puede_enviar_el_agente(s), s["id"])

    def test_un_solo_sitio(self):
        r = self.correr(solo_sitio="bluesky")
        self.assertEqual([h["sitio"] for h in r["hechos"]], ["bluesky"])

    def test_latido(self):
        ruta = os.path.join(self.tmp.name, "latido.json")
        mg.escribir_latido({"STARSEED_MEDIO": "oracle_a1"}, {"hechos": [1, 2], "repetidos": []}, ruta)
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        self.assertEqual((d["medio"], d["borradores"]), ("oracle_a1", 2))
        self.assertEqual(mg.medio_actual({"STARSEED_MEDIO": "desconocido"}), "enjambre")


class TestCerrarCiclo(unittest.TestCase):
    def test_acierto_de(self):
        self.assertTrue(mg.acierto_de("alto", "respondido"))
        self.assertTrue(mg.acierto_de("medio", "respondido"))
        self.assertFalse(mg.acierto_de("bajo", "respondido"))
        self.assertTrue(mg.acierto_de("bajo", "descartado"))
        self.assertFalse(mg.acierto_de("alto", "descartado"))
        self.assertFalse(mg.acierto_de("alto", "sin_respuesta"))
        self.assertIsNone(mg.acierto_de("alto", "enviado"))

    def test_el_ciclo_recuerda_la_experiencia_y_se_confirma(self):
        with tempfile.TemporaryDirectory() as d:
            cola = mg.ColaLocal(os.path.join(d, "cola.jsonl"))
            r = mg.ciclo(DIRECTORIO, ENV_VACIO, cola, maximo=1, sin_llm=True, consultar=consultar_falso, contexto="ctx")
            self.assertEqual(r["hechos"][0]["experiencia"], "exp-1")
            ruta = mg.ruta_experiencias(cola)
            self.assertTrue(ruta.startswith(d))
            huella = cola.leer()[0]["huella"]
            vistos = []
            ok = mg.cerrar_ciclo(huella, "respondido", ruta, confirmar=lambda e, a, n: vistos.append((e, a, n)))
            self.assertTrue(ok)
            self.assertEqual(vistos[0][:2], ("exp-1", True))
            self.assertIsNone(mg.cerrar_ciclo("0" * 64, "respondido", ruta, confirmar=lambda *a: 1 / 0))
            self.assertIsNone(mg.cerrar_ciclo(huella, "enviado", ruta, confirmar=lambda *a: 1 / 0))
            self.assertIsNone(mg.cerrar_ciclo(huella, "respondido", os.path.join(d, "no-existe.jsonl")))


class TestLineaDeOrdenes(unittest.TestCase):
    def test_plan_json(self):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            code = mg.main(["plan", "--json"])
        self.assertEqual(code, 0)
        d = json.loads(salida.getvalue())
        self.assertGreater(len(d["elegibles"]), 5)
        self.assertTrue(all(e["motivo"] for e in d["excluidos"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
