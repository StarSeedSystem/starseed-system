#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de autodesarrollo_reimaginar (Ola 1024I · IMG1024C): puras, sin red; disco solo en tmp."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_reimaginar as R

AHORA = datetime(2026, 10, 24, 3, 0)
ISO = AHORA.isoformat()


def prop(**cambios):
    p = {"id": "diaria:añadir caché", "fuente": "diaria", "titulo": "Añadir caché", "cuerpo": "Cuerpo libre",
         "archivos": ["src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts", "src/lib/d.ts"], "estado": "nueva",
         "referencias": [{"titulo": "Guía", "url": "https://ejemplo.org/guia"}]}
    p.update(cambios)
    return p


def pedida(por="automatica", **cambios):
    return R.pedir(prop(**cambios), "Hazla más pequeña", [{"titulo": "Ref", "url": "https://r.org"}, "http://no"], por, ISO)


class Pedir(unittest.TestCase):
    def test_marca_reimaginando_con_lo_pedido(self):
        p = R.pedir(prop(estado="esperando-aprobacion"), "n" * 3000, ["https://a.org", "ftp://x"] * 15, "alex", ISO)
        r = p["reimaginacion"]
        self.assertEqual(p["estado"], "reimaginando")
        self.assertEqual((len(r["notas"]), r["por"], r["pedida"], r["antes"]), (2000, "alex", ISO, "esperando-aprobacion"))
        self.assertEqual(r["referencias"], [{"titulo": "a.org", "url": "https://a.org"}])
        self.assertEqual(R.pedir(prop(), "", [], "cualquiera", ISO)["reimaginacion"]["por"], "automatica")


class Tarea(unittest.TestCase):
    def test_codigo_es_analisis_con_su_salida(self):
        t = R.tarea(pedida(), AHORA)
        self.assertEqual((t["tipo"], t["modo"], t["area"], t["version_de"], t["version"]),
                         ("analisis", "reimaginar", "imaginacion", "diaria:añadir caché", 2))
        self.assertRegex(t["salida"], r"^starseed_memory_root/imaginacion/agentes/reimaginada-diaria-anadir-cache-[0-9a-f]{6}-v1\.json$")
        self.assertRegex(t["id"], r"^RIM-diaria-anadir-cache-[0-9a-f]{6}-v2$")
        self.assertIn("reimagina esta propuesta con estas notas y referencias; devuelve una versión nueva en formato libre",
                      t["prompt"].lower())
        self.assertIn("NO escritura", t["prompt"])
        self.assertIn("Hazla más pequeña", t["prompt"])
        self.assertIn("https://r.org", t["prompt"])
        self.assertIn(t["salida"], t["prompt"])
        self.assertEqual(len(t["archivos"]), 3)
        self.assertEqual([r["url"] for r in t["referencias"]], ["https://r.org", "https://ejemplo.org/guia"])
        self.assertNotIn("rol", t)
        self.assertNotIn("capacidad", t)

    def test_diseno_contenido_investigacion_piden_el_rol_de_diseno(self):
        for tipo in ("diseno", "contenido", "investigacion"):
            t = R.tarea(pedida(tipo=tipo), AHORA)
            self.assertEqual((t["rol"], t["capacidad"]), ("diseno", "alta"), tipo)
            self.assertIn("memory/diseno/identidades.md", t["lecturas"])
            self.assertIn("profesional del diseño gráfico", t["prompt"])
        self.assertNotIn("rol", R.tarea(pedida(tipo="otro"), AHORA))

    def test_version_n_da_salida_vn_y_tarea_vn_mas_uno(self):
        t = R.tarea(pedida(version=3), AHORA)
        self.assertTrue(t["salida"].endswith("-v3.json"))
        self.assertTrue(t["id"].endswith("-v4"))
        self.assertEqual(t["version"], 4)

    def test_ids_largos_seguros_y_distintos(self):
        a = R.tarea(pedida(id="diaria:" + "x" * 200), AHORA)["id"]
        b = R.tarea(pedida(id="diaria:" + "x" * 199 + "y"), AHORA)["id"]
        self.assertNotEqual(a, b)
        self.assertRegex(a, r"^RIM-[a-z0-9-]+-v2$")
        self.assertLessEqual(len(a), 52)
        mismo_sin_acentos = [R.tarea(pedida(id=i), AHORA) for i in ("diaria:Añadir caché", "diaria:anadir cache")]
        self.assertNotEqual(mismo_sin_acentos[0]["id"], mismo_sin_acentos[1]["id"])
        self.assertNotEqual(mismo_sin_acentos[0]["salida"], mismo_sin_acentos[1]["salida"])


class Pendientes(unittest.TestCase):
    def test_solo_las_que_no_tienen_tarea(self):
        con = pedida(id="a")
        R.marcar_encolada(con, R.tarea(con, AHORA), "cola.json", ISO)
        otras = [prop(id="b"), pedida(id="c"), con]
        tareas, devueltas = R.pendientes(otras, 2, AHORA)
        self.assertEqual([t["version_de"] for t in tareas], ["c"])
        self.assertEqual(devueltas, [])

    def test_tope_corta_la_automatica_pero_no_a_alex(self):
        auto, alex = pedida(id="a", version=3), pedida(por="alex", id="b", version=9)
        tareas, devueltas = R.pendientes([auto, alex], 2, AHORA)
        self.assertEqual([t["version_de"] for t in tareas], ["b"])
        self.assertEqual(devueltas, [auto])
        R.devolver(auto, "tope", ISO)
        self.assertEqual((auto["estado"], auto["motivo_destino"]), ("nueva", "tope"))

    def test_devolver_vuelve_al_estado_decidible_de_antes(self):
        p = R.pedir(prop(estado="pregunta"), "", [], "alex", ISO)
        self.assertEqual(R.devolver(p, "x", ISO)["estado"], "pregunta")
        q = R.pedir(prop(estado="encargada"), "", [], "alex", ISO)
        self.assertEqual(R.devolver(q, "x", ISO)["estado"], "nueva")


class Enlazar(unittest.TestCase):
    def test_version_nueva_hereda_y_la_vieja_pasa_a_reimaginada(self):
        vieja = pedida(ambito="grupo:G1", tipo="diseno", verificacion="verificado", impacto=4, version=2)
        nueva = {"id": "agentes:reimaginada-x-v2", "fuente": "agentes", "version_de": vieja["id"], "version": 1,
                 "ambito": "metagenesis", "tipo": "codigo", "verificacion": "verificado-por-el-modelo"}
        self.assertIs(R.enlazar(nueva, {vieja["id"]: vieja}, ISO), vieja)
        self.assertEqual((nueva["version"], nueva["ambito"], nueva["tipo"], nueva["verificacion"], nueva["impacto"]),
                         (3, "grupo:G1", "diseno", "verificado", 4))
        self.assertEqual(vieja["estado"], "reimaginada")
        self.assertEqual(vieja["reimaginacion"]["version_nueva"], nueva["id"])

    def test_sin_vieja_conocida_no_toca_nada(self):
        nueva = {"id": "n", "version_de": "nadie", "version": 1}
        self.assertIsNone(R.enlazar(nueva, {}, ISO))
        self.assertEqual(nueva["version"], 1)

    def test_vieja_ya_decidida_conserva_su_estado(self):
        vieja = prop(estado="aprobada")
        nueva = {"id": "n", "version_de": vieja["id"]}
        R.enlazar(nueva, {vieja["id"]: vieja}, ISO)
        self.assertEqual((vieja["estado"], nueva["version"]), ("aprobada", 2))


class Esperadas(unittest.TestCase):
    def test_nombre_de_salida_a_id_y_version(self):
        p = pedida(version=2)
        self.assertEqual(R.esperadas([p]), {})
        R.marcar_encolada(p, R.tarea(p, AHORA), "c.json", ISO)
        self.assertEqual(R.esperadas([p]), {R.nombre_salida(p): {"id": p["id"], "version": 2}})
        self.assertTrue(R.nombre_salida(p).endswith("-v2.json"))


class Caducadas(unittest.TestCase):
    def test_tras_72_h_sin_version(self):
        p = pedida()
        R.marcar_encolada(p, R.tarea(p, AHORA), "c.json", ISO)
        self.assertEqual(R.caducadas([p], AHORA + timedelta(hours=71)), [])
        self.assertEqual(R.caducadas([p], AHORA + timedelta(hours=72)), [p])
        self.assertEqual(R.caducadas([pedida()], AHORA + timedelta(days=9)), [])  # sin encargar no caduca
        p["reimaginacion"]["encolada"] = "no es fecha"
        self.assertEqual(R.caducadas([p], AHORA + timedelta(days=9)), [])


class Encolar(unittest.TestCase):
    def test_escribe_y_no_repite(self):
        with tempfile.TemporaryDirectory() as mem:
            t = R.tarea(pedida(), AHORA)
            self.assertIsNone(R.encolar(mem, [], AHORA))
            nombre = R.encolar(mem, [t], AHORA)
            self.assertEqual(nombre, "cola-suenos-reimaginar-2026-10-24.json")
            self.assertTrue(nombre.startswith("cola-suenos-"))  # los orquestadores de código no la toman
            R.encolar(mem, [t, R.tarea(pedida(id="otra"), AHORA)], AHORA)
            cola = json.load(open(os.path.join(mem, "olas", nombre), encoding="utf-8"))
            self.assertEqual([x["id"] for x in cola], [t["id"], R.id_tarea(pedida(id="otra"))])
            self.assertEqual([n for n in os.listdir(os.path.join(mem, "olas")) if n.startswith(".tmp_")], [])


if __name__ == "__main__":
    unittest.main()
