#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del plan y la recogida del agente de alcance (INV1025M · Ola 1025R). PURAS:
sin red ni relojes de verdad; el almacén y el repo van a carpetas temporales.
Fijan: plan acotado por la regla (afinidad, sin investigar 30 días, puede_contactar, nivel),
Jev callado (manda la regla) y solo p ≥ 0,8 seguido, tarea SIN dirección (R5), la validación
de borradores (afirmación sin fuente, dominio ajeno, mensaje largo, seguimiento) con
importancia «alta» y estado «esperando-aprobacion» forzados (R2, R7, R8), la cola con
prefijo `cola-suenos-` y la carta ausente (propuesta «Falta la carta de StarSeed»).
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

import alcance_plan as P  # noqa: E402
import agente_alcance as AG  # noqa: E402
import alcance_objetivos as AO  # noqa: E402
import alcance_fichas as AF  # noqa: E402

AHORA = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)
FECHA = "2026-10-29"
CARTA = "Somos StarSeed: abrimos un sistema operativo social libre y seguro. Buscamos aliados."
CANAL = {"medio": "correo", "valor": "secret@mantener-fuera.org", "fuente_url": "https://ejemplo.org/contacto"}


def _objetivo(nombre="Proyecto Puente", afinidad=120, nivel="medio", **extra):
    return AO.validar_objetivo({
        "nombre_publico": nombre, "tipo": "proyecto", "categoria": "proyecto-afin",
        "afinidad": afinidad, "nivel": nivel, "urls_oficiales": ["https://ejemplo.org"],
        "canal_contacto": dict(CANAL), **extra}, AHORA)


def _ficha(obj):
    return {"obj_id": obj["id"], "nombre_publico": obj["nombre_publico"], "que_hacen": "software libre",
            "idioma": "es", "tono": "cercano", "canal_oficial": dict(CANAL),
            "valores_declarados": [{"texto": "Todo nuestro código es abierto", "cita_url": "https://ejemplo.org/valores"}],
            "proyectos": [{"nombre": "Puente", "url": "https://ejemplo.org/puente"}],
            "contenido_reciente": [{"titulo": "Notas", "url": "https://blog.ejemplo.org/notas", "fecha": None}],
            "fuentes": [{"url": "https://ejemplo.org/portada", "fecha": None, "metodo": "lectura-puntual"}],
            "resonancias": [], "avisos": [], "caduca": (AHORA + timedelta(days=1)).isoformat()}


class _Jev:
    """El consultor de lote falso: mismo contrato que `decidir.consultar_lote`."""

    def __init__(self, respuestas):
        self.respuestas, self.quien, self.llamadas = respuestas, None, 0

    def consultar_lote(self, estado, preguntas, quien=None, **kw):
        self.llamadas += 1
        self.quien = quien
        return {"medio": "jev", "respuestas": self.respuestas}


class Base(unittest.TestCase):
    def setUp(self):
        self.raiz = tempfile.mkdtemp(prefix="alcance-raiz-")
        self.home = tempfile.mkdtemp(prefix="alcance-casa-")

    def tearDown(self):
        shutil.rmtree(self.raiz, ignore_errors=True)
        shutil.rmtree(self.home, ignore_errors=True)


class TestPlan(Base):
    def test_plan_acotado_y_por_regla(self):
        a, b, c = _objetivo("Alto", 200), _objetivo("Medio", 100), _objetivo("Bajo", 30)
        elegidos, _ = P.elegir_objetivos([c, a, b], {}, AHORA, 2)
        self.assertEqual([o["id"] for o in elegidos], [a["id"], b["id"]])
        self.assertLessEqual(len(elegidos), 2)

    def test_suprimido_y_con_pausa_fuera(self):
        vale = _objetivo("Vale", 100)
        callado = _objetivo("Suprimido", 300, registro={"suprimido": True})
        elegidos, _ = P.elegir_objetivos([callado, vale], {}, AHORA, 2, jev=False)
        self.assertEqual([o["id"] for o in elegidos], [vale["id"]])

    def test_sin_investigar_30_dias(self):
        fresco, toque = _objetivo("Fresco", 100), _objetivo("Toque", 200)
        estado = {"objetivos": {toque["id"]: {"ultima": (AHORA - timedelta(days=10)).isoformat()}}}
        elegidos, _ = P.elegir_objetivos([toque, fresco], estado, AHORA, 1, jev=False)
        self.assertEqual([o["id"] for o in elegidos], [fresco["id"]])

    def test_jev_callado_manda_la_regla(self):
        a, b = _objetivo("A", 200), _objetivo("B", 50)
        jev = _Jev({})
        elegidos, vetos = P.elegir_objetivos([b, a], {}, AHORA, 2, jev=jev)
        self.assertEqual([o["id"] for o in elegidos], [a["id"], b["id"]])
        self.assertEqual(vetos, [])
        self.assertEqual(jev.llamadas, 1)
        self.assertEqual(jev.quien, P.QUIEN)

    def test_jev_solo_con_p_alta(self):
        a, b = _objetivo("A", 200), _objetivo("B", 50)
        debil = _Jev({"prioridad": {"respuesta": b["id"], "p": 0.5}})
        elegidos, _ = P.elegir_objetivos([a, b], {}, AHORA, 2, jev=debil)
        self.assertEqual([o["id"] for o in elegidos], [a["id"], b["id"]])

    def test_jev_reordena_y_veta_con_p_0_8(self):
        a, b = _objetivo("A", 200), _objetivo("B", 50)
        fuerte = _Jev({"prioridad": {"respuesta": b["id"], "p": 0.9}, "veto1": {"respuesta": "sí", "p": 0.85}})
        elegidos, vetos = P.elegir_objetivos([a, b], {}, AHORA, 2, jev=fuerte)
        self.assertEqual([o["id"] for o in elegidos], [b["id"]])  # B primero; A vetado
        self.assertEqual(vetos, [a["id"]])



class TestTarea(Base):
    def test_tarea_sin_direccion(self):
        obj = _objetivo()
        tarea = P.tarea_de(obj, _ficha(obj), CARTA, AHORA, 3)
        self.assertEqual(tarea["id"], "ALC10293")
        self.assertEqual(tarea["salida"],
                         "starseed_memory_root/imaginacion/agentes/alcance-2026-10-29-3.json")
        self.assertEqual(tarea["agente"], "alcance")
        self.assertEqual(tarea["tipo"], "analisis")
        self.assertEqual(tarea["modo"], "libre")
        self.assertEqual(tarea["rol"], "alcance")
        self.assertEqual(tarea["capacidad"], "alta")
        self.assertEqual(tarea["fuente"], "agentes")
        self.assertEqual(tarea["ambito"], "metagenesis")
        self.assertLessEqual(len(tarea["prompt"]), 7000)
        # R5: la dirección (canal_contacto y canal_oficial) jamás viaja al prompt.
        self.assertNotIn(CANAL["valor"], tarea["prompt"])
        self.assertNotIn("@mantener-fuera", tarea["prompt"])
        self.assertIn(CARTA, tarea["prompt"])
        self.assertIn("R8", tarea["prompt"])

    def test_tarea_sin_carta_rechazada(self):
        with self.assertRaises(ValueError):
            P.tarea_de(_objetivo(), _ficha(_objetivo()), "", AHORA, 1)

    def test_prompt_recorta_carta_maximo_7000(self):
        obj, ficha = _objetivo(), _ficha(_objetivo())
        tarea = P.tarea_de(obj, ficha, "x" * 9000, AHORA, 1)
        self.assertLessEqual(len(tarea["prompt"]), 7000)
        self.assertIn("reglas del encargo", tarea["prompt"].lower())


BASE_OK = {"propuestas": [{
    "titulo": "Hola desde StarSeed", "tipo": "contenido", "importancia": "media",
    "cuerpo": "Asunto: hola\n\nTe escribimos desde StarSeed OS: abrimos nuestro sistema libre y "
              "vimos que también hacéis software abierto; si os resuena, os propongo conversar.\n\n"
              "Si no queréis recibir más, me lo decís y no insisto.",
    "referencias": [{"url": "https://ajena.com/z"}, {"url": "https://starseed-os.vercel.app/a"},
                    {"url": "https://ejemplo.org/puente"}],
    "destino": {"objetivo": "obj-x", "medio": "formulario", "asunto": "hola"},
    "afirmaciones": [{"texto": "Hacéis software libre", "fuente_url": "https://ejemplo.org/portada"}],
}]}


def _normaliza(p, ficha, ahora=AHORA):
    return AG.normalizar_salida({"propuestas": p}, FECHA, 1, ahora, ficha)


class TestValidacion(Base):
    def setUp(self):
        super().setUp()
        self.ficha = _ficha(_objetivo())

    def base(self, **cambios):
        p = json.loads(json.dumps(BASE_OK["propuestas"][0]))
        p.update(cambios)
        return _normaliza([p], self.ficha)

    def test_formato_forzado_alta_y_esperando(self):
        doc = self.base()
        self.assertEqual(doc["formato"], P.FORMATO_SALIDA)
        self.assertEqual(doc["agente"], "alcance")
        p = doc["propuestas"][0]
        self.assertEqual(p["importancia"], "alta")          # R8 forzada
        self.assertEqual(p["estado"], "esperando-aprobacion")  # R2: paso por persona
        self.assertEqual(p["tipo"], "contenido")
        self.assertEqual(p["destino"]["medio"], "formulario")

    def test_afirmacion_sin_fuente_de_la_ficha(self):
        doc = self.base(afirmaciones=[{"texto": "x", "fuente_url": "https://otro.com/a"}])
        self.assertEqual(doc["propuestas"], [])

    def test_afirmacion_con_fuente_de_la_ficha_pasa(self):
        af = [{"texto": "Hacéis software libre", "fuente_url": "https://blog.ejemplo.org/notas"}]
        doc = self.base(afirmaciones=af)
        self.assertEqual(len(doc["propuestas"]), 1)
        self.assertEqual(doc["propuestas"][0]["afirmaciones"][0]["fuente_url"], "https://blog.ejemplo.org/notas")

    def test_referencia_de_dominio_ajeno_fuera(self):
        doc = self.base()
        refs = [r["url"] for r in doc["propuestas"][0]["referencias"]]
        self.assertEqual(refs, ["https://starseed-os.vercel.app/a", "https://ejemplo.org/puente"])

    def test_mensaje_largo_descartado(self):
        doc = self.base(cuerpo=" ".join(["palabra"] * 221))
        self.assertEqual(doc["propuestas"], [])
        doc = self.base(cuerpo=" ".join(["palabra"] * 220))
        self.assertEqual(len(doc["propuestas"]), 1)

    def test_correo_en_la_propuesta_descartado(self):
        doc = self.base(cuerpo="Asunto: hola\n\nEscribime a pepa@ejemplo.com, gracias.")
        self.assertEqual(doc["propuestas"], [])

    def test_seguimiento_descartado(self):
        doc = self.base(cuerpo="Asunto: hola\n\nMira https://ejemplo.org?utm_source=prueba")
        self.assertEqual(doc["propuestas"], [])
        doc = self.base(cuerpo="Asunto: hola\n\nAdjunto una Grimm imagen ilustrativa.")
        self.assertEqual(doc["propuestas"], [])

    def test_ilegible_sin_dict(self):
        doc = AG.normalizar_salida(None, FECHA, 1, AHORA, self.ficha)
        self.assertEqual(doc["propuestas"], [])
        doc = AG.normalizar_salida(["puro texto"], FECHA, 1, AHORA, self.ficha)
        self.assertEqual(doc["propuestas"], [])

    def test_recoger_salidas_normaliza_y_descarta(self):
        ruta = os.path.join(self.raiz, P.REL_SALIDAS)
        os.makedirs(ruta)
        ficha = _ficha(_objetivo())
        crudo = {"formato": P.FORMATO_SALIDA, "fuente": "agentes", "agente": "alcance",
                 "contexto": ficha["obj_id"], "propuestas": [
                     json.loads(json.dumps(BASE_OK["propuestas"][0])),
                     {"titulo": "rota", "cuerpo": "Asunto: hola",
                      "afirmaciones": [{"texto": "dicen que", "fuente_url": "https://ajena.com"}]}]}
        with open(os.path.join(ruta, "alcance-%s-1.json" % FECHA), "w", encoding="utf-8") as f:
            json.dump(crudo, f)
        estado = AG.cargar_estado(self.raiz)
        fuera = AG.recoger_salidas(self.raiz, estado, AHORA, {ficha["obj_id"]: ficha})
        self.assertEqual(fuera["procesadas"], 1)
        self.assertEqual(fuera["propuestas"], 1)
        self.assertEqual(fuera["descartadas"], 1)
        self.assertEqual(fuera["reescritas"], 1)
        with open(os.path.join(ruta, "alcance-%s-1.json" % FECHA), encoding="utf-8") as f:
            doc = json.load(f)
        self.assertEqual(doc["propuestas"][0]["estado"], "esperando-aprobacion")
        self.assertEqual(doc["propuestas"][0]["destino"]["objetivo"], ficha["obj_id"])
        # Ya contada en el estado en mano: un segundo pase no vuelve a contarla.
        otra = AG.recoger_salidas(self.raiz, estado, AHORA, {ficha["obj_id"]: ficha})
        self.assertEqual(otra["procesadas"], 0)


class TestEncargoYCiclo(Base):
    def test_cola_con_prefijo_cola_suenos(self):
        self.assertTrue(P.NOMBRE_COLA.startswith("cola-suenos-"))
        t = {"id": "ALC10291", "agente": "alcance", "creada": AG.D._iso(AHORA), "salida": "x", "titulo": "t"}
        fuera = AG.encargar_por_flota(self.raiz, [t], AHORA, AHORA, vivos=[], apto=(False, 0.0),
                                      libre=(False, 0.0))
        self.assertEqual(fuera["accion"], "cola_lista")
        ruta = os.path.join(self.raiz, "starseed_memory_root", "olas", P.NOMBRE_COLA)
        with open(ruta, encoding="utf-8") as f:
            cola = json.load(f)
        self.assertEqual([x["id"] for x in cola], ["ALC10291"])

    def test_orquestador_vivo_relefan_su_cola(self):
        t = {"id": "ALC10292", "agente": "alcance", "creada": AG.D._iso(AHORA), "salida": "x", "titulo": "t"}
        fuera = AG.encargar_por_flota(self.raiz, [t], AHORA, AHORA,
                                      vivos=[{"pid": 7, "cola": "otra-cola.json", "segundos": 1,
                                              "solo": False}],
                                      apto=(True, AHORA.timestamp()), libre=(True, AHORA.timestamp()))
        self.assertEqual(fuera["accion"], "tanda_viva")
        with open(os.path.join(self.raiz, "starseed_memory_root", "olas", "otra-cola.json"),
                  encoding="utf-8") as f:
            self.assertEqual([x["id"] for x in json.load(f)], ["ALC10292"])

    def test_ciclo_carta_ausente(self):
        r = AG.ciclo(self.raiz, AHORA, encargar=False, home=self.home)
        self.assertTrue(r["carta_falta"])
        self.assertEqual(r["tareas"], [])
        self.assertEqual(r["encargo"]["accion"], "nada")
        ruta = os.path.join(self.raiz, P.REL_SALIDAS, "alcance-%s-1.json" % FECHA)
        with open(ruta, encoding="utf-8") as f:
            doc = json.load(f)
        self.assertEqual(doc["agente"], "alcance")
        p = doc["propuestas"][0]
        self.assertEqual(p["tipo"], "otro")
        self.assertEqual(p["titulo"], "Falta la carta de StarSeed")
        with open(os.path.join(self.raiz, AG.REL_ESTADO), encoding="utf-8") as f:
            estado = json.load(f)
        self.assertIsNotNone(estado.get("sin_carta"))

    def test_ciclo_con_carta_encarga_sin_direccion(self):
        os.makedirs(os.path.join(self.raiz, "memory", "alcance"))
        with open(os.path.join(self.raiz, P.REL_CARTA), "w", encoding="utf-8") as f:
            f.write(CARTA)
        obj = _objetivo()
        AO.escribir("objetivos", [obj], self.home)
        AF.guardar_ficha(_ficha(obj), self.home)
        r = AG.ciclo(self.raiz, AHORA, encargar=False, home=self.home, fichas={obj["id"]: _ficha(obj)})
        self.assertEqual(len(r["tareas"]), 1)
        self.assertEqual(r["tareas"][0]["id"], "ALC10291")
        self.assertEqual(r["encargo"]["accion"], "nada")
        with open(os.path.join(self.raiz, AG.REL_ESTADO), encoding="utf-8") as f:
            estado = json.load(f)
        self.assertIn(obj["id"], estado["objetivos"])
        self.assertIsNone(estado.get("sin_carta"))

    def test_ciclo_cada_20h_y_seco(self):
        r1 = AG.ciclo(self.raiz, AHORA, encargar=False, home=self.home)
        self.assertTrue(r1["carta_falta"])
        with open(os.path.join(self.raiz, AG.REL_ESTADO), encoding="utf-8") as f:
            estado = json.load(f)
        self.assertIsNone(estado["ultimo_ciclo"])
        estado["ultimo_ciclo"] = (AHORA - timedelta(hours=5)).isoformat()
        with open(os.path.join(self.raiz, AG.REL_ESTADO), "w", encoding="utf-8") as f:
            json.dump(estado, f)
        r2 = AG.ciclo(self.raiz, AHORA, encargar=False, home=self.home)
        self.assertFalse(r2["toca"])
        r3 = AG.ciclo(self.raiz, AHORA, encargar=False, home=self.home, forzar=True, seco=True)
        self.assertTrue(r3["seco"])
        self.assertTrue(r3["carta_falta"])
        self.assertNotIn("motivo", r3)  # con forzar, la puerta de 20 h se salta


if __name__ == "__main__":
    unittest.main()
