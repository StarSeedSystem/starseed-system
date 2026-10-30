# -*- coding: utf-8 -*-
"""Pruebas del agente de alcance (INV1025M): plan acotado, Jev callado y con umbral,
tarea sin dirección, validación de borradores, forzado de importancia/estado, cola
con prefijo `cola-suenos-` y carta ausente. Puras: sin red, sin orquestador."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import agente_alcance as A  # noqa: E402
import alcance_objetivos as AO  # noqa: E402
import alcance_plan as P  # noqa: E402

AHORA = datetime(2026, 10, 29, 9, 0, tzinfo=timezone.utc)
FECHA = "2026-10-29"


def objetivo(oid="obj-1", afinidad=200, nivel="medio", **extra):
    o = {"id": oid, "nombre_publico": "Taller de Viento", "tipo": "proyecto", "categoria": "proyecto-afin",
         "nivel": nivel, "afinidad": afinidad, "urls_oficiales": ["https://tallerviento.org/"], "estado": "nuevo"}
    o.update(extra)
    return o


def ficha(oid="obj-1"):
    return {"obj_id": oid, "nombre_publico": "Taller de Viento", "que_hacen": "Estudio de arte comunitario.",
            "canal_oficial": {"medio": "correo", "valor": "hola@tallerviento.org",
                              "fuente_url": "https://tallerviento.org/contacto"},
            "valores_declarados": [{"texto": "El arte manda", "cita_url": "https://tallerviento.org/sobre"}],
            "proyectos": [{"nombre": "Barrios", "url": "https://tallerviento.org/proyectos"}],
            "fuentes": [{"url": "https://tallerviento.org/sobre", "fecha": "2026-10-01", "metodo": "lectura"}],
            "contenido_reciente": [], "resonancias": [], "avisos": [], "idioma": "es", "tono": "creativo"}


def propuesta(**extra):
    p = {"titulo": "Una idea para el taller",
         "cuerpo": "**Asunto:** Colaborar\n\nHola, somo StarSeed y nos gustaría proponeros una colaboración "
                   "tranquila para compartir herramientas de código abierto con vuestros proyectos de barrio.",
         "tipo": "contenido", "importancia": "baja", "referencias": ["https://tallerviento.org/proyectos"],
         "destino": {"objetivo": "obj-1", "medio": "correo", "asunto": "Colaborar"},
         "afirmaciones": [{"texto": "Hacen proyectos de barrio", "fuente_url": "https://tallerviento.org/proyectos"}]}
    p.update(extra)
    return p


class TestPlan(unittest.TestCase):
    def test_plan_acotado_y_rotacion(self):
        objs = [objetivo("obj-1", 300), objetivo("obj-2", 100), objetivo("obj-3", 50), objetivo("obj-4", 200)]
        estado = {"objetivos": {"obj-1": {"ultima": (AHORA - timedelta(days=2)).isoformat()}}}
        self.assertEqual([o["id"] for o in P.elegir_objetivos(objs, estado, AHORA, tope=2, jev=False)],
                         ["obj-4", "obj-2"])
        viejo = {"objetivos": {"obj-1": {"ultima": (AHORA - timedelta(days=31)).isoformat()}}}
        self.assertEqual(P.elegir_objetivos(objs, viejo, AHORA, tope=1, jev=False)[0]["id"], "obj-1")
        self.assertEqual(P.elegir_objetivos(objs, {}, AHORA, tope=0, jev=False), [])

    def test_jev_callado_manda_la_regla(self):
        objs = [objetivo("obj-1", 100), objetivo("obj-2", 200)]
        self.assertEqual([o["id"] for o in P.elegir_objetivos(objs, {}, AHORA, tope=2, jev=False)],
                         ["obj-2", "obj-1"])

    def test_jev_ordena_y_veta_solo_con_p_08(self):
        objs = [objetivo("obj-1", 300), objetivo("obj-2", 100), objetivo("obj-3", 50), objetivo("obj-4", 200)]

        def jev(estado, preguntas, quien=None):
            self.assertEqual(quien, "agente-alcance")
            self.assertIn("orden", preguntas)
            return {"respuestas": {"orden": {"respuesta": "obj-3", "p": 0.9},
                                   "veto1": {"respuesta": "sí", "p": 0.85}}}
        self.assertEqual([o["id"] for o in P.elegir_objetivos(objs, {}, AHORA, tope=2, jev=jev)], ["obj-3", "obj-4"])
        flojo = lambda e, p, quien=None: {"respuestas": {"orden": {"respuesta": "obj-3", "p": 0.6},
                                                         "veto1": {"respuesta": "sí", "p": 0.6}}}
        self.assertEqual([o["id"] for o in P.elegir_objetivos(objs, {}, AHORA, tope=2, jev=flojo)],
                         ["obj-1", "obj-4"])

    def test_suprimido_fuera_del_plan(self):
        vale = objetivo("obj-1", 100)
        callado = objetivo("obj-2", 300, suprimido=True)
        elegidos = P.elegir_objetivos([callado, vale], {}, AHORA, 2, jev=False)
        self.assertEqual([o["id"] for o in elegidos], [vale["id"]])

    def test_sin_investigar_30_dias(self):
        fresco, toque = objetivo("obj-1", 100), objetivo("obj-2", 200)
        estado = {"objetivos": {toque["id"]: {"ultima": (AHORA - timedelta(days=10)).isoformat()}}}
        elegidos = P.elegir_objetivos([toque, fresco], estado, AHORA, 1, jev=False)
        self.assertEqual([o["id"] for o in elegidos], [fresco["id"]])


class TestTarea(unittest.TestCase):
    def test_tarea_sin_direccion_y_en_formato_del_contrato(self):
        t = P.tarea_de(objetivo(), ficha(), "Somos StarSeed: buscamos desarrollo más profesional y seguro.", AHORA, 1)
        self.assertEqual(t["id"], "ALC10291")
        self.assertEqual((t["tipo"], t["modo"]), ("analisis", "libre"))
        self.assertEqual((t["rol"], t["capacidad"], t["agente"], t["fuente"], t["ambito"]),
                         ("alcance", "alta", "alcance", "agentes", "metagenesis"))
        self.assertEqual(t["salida"], "starseed_memory_root/imaginacion/agentes/alcance-2026-10-29-1.json")
        self.assertNotIn("hola@tallerviento.org", t["prompt"])
        self.assertIn("Taller de Viento", t["prompt"])
        self.assertIn("R1", t["prompt"])
        self.assertIn('"propuestas"', t["prompt"])
        self.assertIn("≤ 220 palabras", t["prompt"])
        self.assertLessEqual(len(t["prompt"]), P.MAX_PROMPT)

    def test_prompt_recorta_carta_larga(self):
        t = P.tarea_de(objetivo(), ficha(), "x" * 9000, AHORA, 1)
        self.assertLessEqual(len(t["prompt"]), P.MAX_PROMPT)
        self.assertIn("R8", t["prompt"])


class TestNormalizacion(unittest.TestCase):
    def test_validacion_afirmacion_dominio_mensaje_y_correo(self):
        self.assertTrue(A.normalizar_salida({"propuestas": [propuesta()]}, FECHA, 1, AHORA, "obj-1", ficha())["propuestas"])
        sin_fuente = propuesta(afirmaciones=[{"texto": "Hacen barrio", "fuente_url": "https://otro.example/x"}])
        self.assertEqual(A.normalizar_salida({"propuestas": [sin_fuente]}, FECHA, 1, AHORA, "obj-1", ficha())["propuestas"], [])
        ajeno = propuesta(referencias=["https://evil.example/x"])
        self.assertEqual(A.normalizar_salida({"propuestas": [ajeno]}, FECHA, 1, AHORA, "obj-1", ficha())["propuestas"], [])
        largo = propuesta(cuerpo="palabra " * 240)
        self.assertEqual(A.normalizar_salida({"propuestas": [largo]}, FECHA, 1, AHORA, "obj-1", ficha())["propuestas"], [])
        correo = propuesta(destino={"objetivo": "obj-1", "medio": "correo", "asunto": "hola@evil.example"})
        self.assertEqual(A.normalizar_salida({"propuestas": [correo]}, FECHA, 1, AHORA, "obj-1", ficha())["propuestas"], [])
        adjunto = propuesta(cuerpo="**Asunto:** Hola\n\nTe adjunto un archivo.")
        self.assertEqual(A.normalizar_salida({"propuestas": [adjunto]}, FECHA, 1, AHORA, "obj-1", ficha())["propuestas"], [])

    def test_fuerza_importancia_alta_y_estado_esperando_aprobacion(self):
        doc = A.normalizar_salida({"propuestas": [propuesta(importancia="baja", estado="nueva", tipo="contenido")]},
                                  FECHA, 2, AHORA, "obj-1", ficha())
        p = doc["propuestas"][0]
        self.assertEqual((p["importancia"], p["estado"], p["tipo"]),
                         ("alta", "esperando-aprobacion", "contenido"))
        self.assertEqual(p["id"], "agentes:alcance:2026-10-29-2-1")
        self.assertEqual(p["destino"]["objetivo"], "obj-1")
        self.assertEqual(p["referencias"][0]["url"], "https://tallerviento.org/proyectos")
        self.assertEqual((doc["formato"], doc["agente"]), ("starseed-imaginacion-agentes", "alcance"))

    def test_mensaje_de_221_palabras_se_descarta_y_220_pasa(self):
        largo = propuesta(cuerpo="Asunto: hola\n\n" + " ".join(["palabra"] * 221))
        self.assertEqual(A.normalizar_salida({"propuestas": [largo]}, FECHA, 1, AHORA, "obj-1", ficha())["propuestas"], [])
        justo = propuesta(cuerpo="Asunto: hola\n\n" + " ".join(["palabra"] * 220))
        self.assertEqual(len(A.normalizar_salida({"propuestas": [justo]}, FECHA, 1, AHORA, "obj-1", ficha())["propuestas"]), 1)

    def test_salida_ilegible_no_rompe(self):
        self.assertEqual(A.normalizar_salida(None, FECHA, 1, AHORA, "", ficha())["propuestas"], [])
        self.assertEqual(A.normalizar_salida(["puro texto"], FECHA, 1, AHORA, "", ficha())["propuestas"], [])


class TestCiclo(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(self.raiz)
        self.home = os.path.join(self.tmp, "home")

    def tearDown(self):
        self._tmp.cleanup()

    def test_cola_con_prefijo_de_suenos(self):
        self.assertTrue(A.NOMBRE_COLA.startswith("cola-suenos-"))
        t = P.tarea_de(objetivo(), ficha(), "carta", AHORA, 1)
        d = A.encargar_por_flota(self.raiz, [t], ahora=AHORA)
        self.assertEqual((d["accion"], d["tareas"]), ("cola_lista", [t["id"]]))
        with open(os.path.join(self.raiz, A.REL_OLAS, A.NOMBRE_COLA), encoding="utf-8") as f:
            self.assertEqual([x["id"] for x in json.load(f)], [t["id"]])
        self.assertIn("nunca lanza un orquestador", d["mensaje"])

    def test_carta_ausente_no_encarga_y_deja_propuesta(self):
        AO.escribir("objetivos", [objetivo()], home=self.home)
        r = A.ciclo(self.raiz, AHORA, encargar=False, jev=False, home=self.home)
        self.assertTrue(r["ok"])
        self.assertEqual((r["motivo"], r["tareas"]), ("falta_carta", []))
        self.assertEqual(r["propuesta"], "Falta la carta de StarSeed")
        self.assertFalse(os.path.exists(os.path.join(self.raiz, A.REL_OLAS, A.NOMBRE_COLA)))
        salidas = [n for n in os.listdir(os.path.join(self.raiz, P.REL_SALIDAS)) if n.startswith("alcance-")]
        self.assertEqual(len(salidas), 1)
        with open(os.path.join(self.raiz, P.REL_SALIDAS, salidas[0]), encoding="utf-8") as f:
            doc = json.load(f)
        self.assertEqual(doc["propuestas"][0]["tipo"], "otro")
        self.assertEqual(doc["propuestas"][0]["titulo"], "Falta la carta de StarSeed")

    def test_ciclo_con_carta_elige_encarga_y_recoge(self):
        os.makedirs(os.path.join(self.raiz, "memory", "alcance"))
        with open(os.path.join(self.raiz, "memory", "alcance", "carta-starseed.md"), "w", encoding="utf-8") as f:
            f.write("Somos StarSeed.")
        AO.escribir("objetivos", [objetivo()], home=self.home)
        carpeta = os.path.join(self.home, ".starseed", "alcance", "fichas")
        os.makedirs(carpeta)
        with open(os.path.join(carpeta, "obj-1.json"), "w", encoding="utf-8") as f:
            json.dump(ficha(), f)
        encargos = []

        def encargar(raiz_, tareas, fecha=None, ahora=None):
            encargos.append([t["id"] for t in tareas])
            return {"ok": True, "accion": "cola_lista", "cola": A.NOMBRE_COLA, "mensaje": "lista"}
        r = A.ciclo(self.raiz, AHORA, encargar=encargar, jev=False, home=self.home)
        self.assertTrue(r["toca"])
        self.assertEqual([x["objetivo"] for x in r["tareas"]], ["obj-1"])
        self.assertEqual(encargos, [["ALC10291"]])
        with open(os.path.join(self.raiz, A.REL_ESTADO), encoding="utf-8") as f:
            estado = json.load(f)
        self.assertEqual(estado["ciclos"], 1)
        self.assertIn("obj-1", estado["objetivos"])
        self.assertNotIn("Taller", json.dumps(estado))
        salida = os.path.join(self.raiz, P.REL_SALIDAS, "alcance-2026-10-29-1.json")
        os.makedirs(os.path.dirname(salida), exist_ok=True)
        with open(salida, "w", encoding="utf-8") as f:
            json.dump({"propuestas": [propuesta(), propuesta(referencias=["https://evil.example/x"])]}, f)
        estado2 = A.cargar_estado(self.raiz)
        res = A.recoger_salidas(self.raiz, estado2, AHORA, home=self.home, fichas={"obj-1": ficha()})
        self.assertEqual(res, {"procesadas": 1, "validas": 1, "descartadas": 1})
        with open(salida, encoding="utf-8") as f:
            doc = json.load(f)
        self.assertEqual(doc["propuestas"][0]["estado"], "esperando-aprobacion")
        self.assertEqual(estado2["salidas"]["alcance-2026-10-29-1.json"]["descartadas"], 1)

    def test_recoger_salidas_no_cuenta_dos_veces(self):
        ruta = os.path.join(self.raiz, P.REL_SALIDAS)
        os.makedirs(ruta)
        crudo = {"formato": "starseed-imaginacion-agentes",
                 "fuente": "agentes", "agente": "alcance", "objetivo": "obj-1",
                 "propuestas": [propuesta(),
                                {"titulo": "rota", "cuerpo": "Asunto: hola",
                                 "afirmaciones": [{"texto": "dicen que", "fuente_url": "https://ajena.com"}]}]}
        with open(os.path.join(ruta, "alcance-%s-1.json" % FECHA), "w", encoding="utf-8") as f:
            json.dump(crudo, f)
        estado = A.cargar_estado(self.raiz)
        fuera = A.recoger_salidas(self.raiz, estado, AHORA, fichas={"obj-1": ficha()})
        self.assertEqual(fuera, {"procesadas": 1, "validas": 1, "descartadas": 1})
        with open(os.path.join(ruta, "alcance-%s-1.json" % FECHA), encoding="utf-8") as f:
            doc = json.load(f)
        self.assertEqual(doc["propuestas"][0]["estado"], "esperando-aprobacion")
        self.assertEqual(doc["propuestas"][0]["destino"]["objetivo"], "obj-1")
        otra = A.recoger_salidas(self.raiz, estado, AHORA, fichas={"obj-1": ficha()})
        self.assertEqual(otra["procesadas"], 0)

    def test_ciclo_respeta_la_puerta_de_20_horas(self):
        os.makedirs(os.path.join(self.raiz, "memory", "alcance"))
        with open(os.path.join(self.raiz, "memory", "alcance", "carta-starseed.md"), "w", encoding="utf-8") as f:
            f.write("Somos StarSeed.")
        r1 = A.ciclo(self.raiz, AHORA, encargar=False, jev=False, home=self.home)
        self.assertTrue(r1["toca"])
        estado = A.cargar_estado(self.raiz)
        estado["ultimo_ciclo"] = (AHORA - timedelta(hours=5)).isoformat()
        with open(os.path.join(self.raiz, A.REL_ESTADO), "w", encoding="utf-8") as f:
            json.dump(estado, f)
        r2 = A.ciclo(self.raiz, AHORA, encargar=False, jev=False, home=self.home)
        self.assertFalse(r2["toca"])
        self.assertIn("20 h", r2["motivo"])
        r3 = A.ciclo(self.raiz, AHORA, encargar=False, jev=False, home=self.home, forzar=True, seco=True)
        self.assertTrue(r3["toca"])
        self.assertTrue(r3["seco"])
        with open(os.path.join(self.raiz, A.REL_ESTADO), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["ciclos"], 1)
