# -*- coding: utf-8 -*-
"""Pruebas del director de los sueños profundos: rechazos, ajustes, duplicados, tramo de
capacidad primero, cola propuesta sin lanzar y memoria de lo ya encargado."""
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)

import director_suenos as S  # noqa: E402

PATRON_ID_MANDO = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,8}$")  # el de src/lib/mando/colas.ts


def hallazgo(titulo, archivo="src/lib/x.ts", linea=10, impacto=3, esfuerzo=2, confianza=0.8, seccion="mejora", archivos=None):
    return {"clave": S.D.clave(titulo), "titulo": titulo, "seccion": seccion, "archivo": archivo, "linea": linea,
            "impacto": impacto, "esfuerzo": esfuerzo, "confianza": confianza, "detalle": "detalle de " + titulo,
            "propuesta": {"titulo": "Hacer: " + titulo, "archivos": archivos or [archivo], "cambio": "cambio"}}


def informe(tid, area, lente, hallazgos, privado=False):
    return {"id": tid, "area": area, "lente": lente, "privado": privado, "hallazgos": hallazgos}


class Consolidar(unittest.TestCase):
    def setUp(self):
        self.informes = [
            informe("SA09291", "voz", "arquitectura-deuda", [
                hallazgo("Unificar el cliente de voz", impacto=4, esfuerzo=2),
                hallazgo("Quitar código muerto", archivo="src/lib/muerto.ts", impacto=2, esfuerzo=1),
            ]),
            informe("SA09297", "social", "arquitectura-deuda", [
                hallazgo("Unificar el cliente de voz", impacto=4, esfuerzo=2, confianza=0.7),  # duplicado por clave
                hallazgo("Otro título, misma cita", archivo="src/lib/x.ts", linea=12),       # duplicado por cita
            ]),
            informe("SA09293", "mando", "rendimiento-consumo", [
                hallazgo("Subir el tope del gobernador", archivo="scripts/puente/gobernador-recursos.py",
                         impacto=2, esfuerzo=3, confianza=0.5),
            ]),
            informe("SA09294", "mando", "seguridad-privacidad", [
                hallazgo("Validar el origen de la ruta de claves", archivo="src/app/api/mando/claves/route.ts",
                         seccion="riesgo", impacto=5, esfuerzo=1),
            ], privado=True),
            informe("SA09299", "nube", "coherencia-triada", [hallazgo("Todo mal", archivo="x.md")]),
        ]
        self.veredictos = {
            "SA09291": {"estado": "ajustado", "ajustes": {2: {"impacto": 1}}, "rechazados": set(), "por": "claude-opus-5.5"},
            "SA09297": {"estado": "verificado", "ajustes": {}, "rechazados": {2}, "por": "claude-sonnet"},
            "SA09299": {"estado": "rechazado", "ajustes": {}, "rechazados": set(), "por": "claude-opus-5.5"},
        }

    def test_rechazos_ajustes_y_duplicados(self):
        c = S.consolidar(self.informes, self.veredictos)
        titulos = [u["titulo"] for u in c["ranking"]]
        self.assertNotIn("Todo mal", titulos)                  # informe rechazado entero
        self.assertNotIn("Otro título, misma cita", titulos)   # hallazgo rechazado por índice
        self.assertEqual(titulos.count("Unificar el cliente de voz"), 1)
        u = [x for x in c["ranking"] if x["titulo"] == "Unificar el cliente de voz"][0]
        self.assertEqual(sorted(u["areas"]), ["social", "voz"])
        self.assertEqual(u["apariciones"], 2)
        muerto = [x for x in c["ranking"] if x["titulo"] == "Quitar código muerto"][0]
        self.assertEqual(muerto["impacto"], 1)
        self.assertEqual(muerto["verificacion"], "ajustado")
        self.assertEqual(c["cuentas"]["rechazados"], 2)
        self.assertEqual(c["cuentas"]["duplicados"], 1)

    def test_capacidad_primero_y_verificado_pesa_mas(self):
        c = S.consolidar(self.informes, self.veredictos)
        self.assertEqual(c["ranking"][0]["titulo"], "Subir el tope del gobernador")
        self.assertTrue(c["ranking"][0]["capacidad"])
        a = S.puntuar({"verificacion": "verificado", "impacto": 3, "esfuerzo": 3, "confianza": 0.6})
        b = S.puntuar({"verificacion": "sin_verificar", "impacto": 3, "esfuerzo": 3, "confianza": 0.6})
        self.assertGreater(a, b)

    def test_duplicado_por_cita_cercana(self):
        infs = [informe("SA1", "voz", "arquitectura-deuda", [hallazgo("A uno", linea=10)]),
                informe("SA2", "voz", "pruebas-fiabilidad", [hallazgo("B dos", linea=13)])]
        c = S.consolidar(infs, {})
        self.assertEqual(len(c["ranking"]), 1)
        self.assertEqual(sorted(c["ranking"][0]["lentes"]), ["arquitectura-deuda", "pruebas-fiabilidad"])

    def test_cola_propuesta(self):
        c = S.consolidar(self.informes, self.veredictos, encargadas={S.D.clave("Quitar código muerto")})
        cola = S.cola_propuesta(c, "2026-09-29", tope=10)
        self.assertTrue(cola)
        self.assertNotIn("Hacer: Quitar código muerto", [t["titulo"] for t in cola])
        ids = [t["id"] for t in cola]
        self.assertEqual(len(ids), len(set(ids)))
        for t in cola:
            self.assertRegex(t["id"], PATRON_ID_MANDO)
            self.assertTrue(t["aprobacion"])
            self.assertLessEqual(len(t["archivos"]), 3)
            self.assertGreaterEqual(len(t["prompt"]), 20)
            self.assertLessEqual(len(t["prompt"]), 12000)
            self.assertIn("NO APLICA", t["prompt"])
        cap = [t for t in cola if t.get("importancia") == "capacidad"]
        self.assertEqual(len(cap), 1)
        priv = [t for t in cola if t.get("privado")]
        self.assertEqual(len(priv), 1)
        self.assertIn("PRIVADO", priv[0]["prompt"])

    def test_resumen_sin_texto_privado(self):
        c = S.consolidar(self.informes, self.veredictos)
        r = S.resumen_corto(c, "2026-09-29", 3)
        self.assertNotIn("claves", r)
        self.assertIn("Sueños profundos 2026-09-29", r)

    def test_render_no_rompe_vacio_ni_lleno(self):
        vacio = S.render_informe(S.consolidar([], {}), "2026-09-29", planificadas=84)
        self.assertIn("## Top 15 recomendaciones", vacio)
        lleno = S.render_informe(S.consolidar(self.informes, self.veredictos), "2026-09-29", 84, "cola-x.json", 4)
        for seccion in ("## Resumen ejecutivo", "## Por área", "## Riesgos", "## Cómo seguir", "No se ha lanzado"):
            self.assertIn(seccion, lleno)
        self.assertIn("🔒", lleno)


class EnDisco(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="suenos-dir-")
        self.sesion = os.path.join(self.dir, "profundo", "2026-09-29")
        self.olas = os.path.join(self.dir, "olas")
        os.makedirs(self.sesion)
        json.dump(informe("SA09291", "voz", "arquitectura-deuda", [hallazgo("Unificar el cliente de voz")]),
                  open(os.path.join(self.sesion, "voz--arquitectura-deuda.json"), "w"))
        with open(os.path.join(self.sesion, "social--pruebas-fiabilidad.md"), "w", encoding="utf-8") as f:
            f.write("# 🌙 Sueño profundo\n\n> Tarea SA092911 · …\n\n## Riesgos\n\n"
                    "1. **Añadir tiempo límite al fetch** — `src/lib/feed/a.ts:40` · impacto 4 · esfuerzo 1 · confianza 0.70 · sin timeout\n")
        with open(os.path.join(self.sesion, "verificaciones.jsonl"), "w") as f:
            f.write(json.dumps({"tarea": "SA09291", "estado": "verificado", "por": "claude-opus-5.5", "nota": "ok"}) + "\n")
            f.write("basura\n")
        self.memoria = os.path.join(self.dir, "encargado.json")
        self.dichos = []

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_lee_json_y_md_y_escribe_todo(self):
        infs = S.leer_informes(self.sesion)
        self.assertEqual(sorted(i["id"] for i in infs), ["SA09291", "SA092911"])
        md = [i for i in infs if i.get("desde_md")][0]
        self.assertEqual(md["hallazgos"][0]["archivo"], "src/lib/feed/a.ts")
        self.assertEqual(md["hallazgos"][0]["impacto"], 4)
        self.assertEqual(md["hallazgos"][0]["seccion"], "riesgo")
        r = S.ejecutar(self.sesion, self.olas, "2026-09-29", memoria=self.memoria,
                       decir=lambda texto, quien, tipo: self.dichos.append(texto))
        self.assertTrue(os.path.exists(os.path.join(self.sesion, "INFORME.md")))
        cola = json.load(open(os.path.join(self.olas, "cola-suenos-propuesta-2026-09-29.json")))
        self.assertEqual(len(cola), 2)
        self.assertEqual(len(json.load(open(self.memoria))["claves"]), 2)
        self.assertEqual(len(self.dichos), 1)
        self.assertFalse(r["anuncio"]["telegram"])
        # Segunda pasada: lo ya encargado no vuelve a la cola.
        r2 = S.ejecutar(self.sesion, self.olas, "2026-09-29", memoria=self.memoria, decir=lambda *a: None)
        self.assertEqual(r2["propuestas"], 0)

    def test_seco_no_escribe_nada(self):
        r = S.ejecutar(self.sesion, self.olas, "2026-09-29", seco=True, memoria=self.memoria, decir=lambda *a: None)
        self.assertTrue(r["seco"])
        self.assertFalse(os.path.exists(os.path.join(self.sesion, "INFORME.md")))
        self.assertFalse(os.path.exists(self.memoria))

    def test_veredictos_se_funden_en_orden(self):
        with open(os.path.join(self.sesion, "verificaciones.jsonl"), "a") as f:
            f.write(json.dumps({"tarea": "SA09291", "estado": "ajustado", "ajustes": {"1": {"esfuerzo": 4}},
                                "rechazados": [3], "por": "claude-haiku"}) + "\n")
            f.write(json.dumps({"tarea": "SA09291", "estado": "inventado"}) + "\n")
        v = S.leer_veredictos(self.sesion)["SA09291"]
        self.assertEqual(v["estado"], "ajustado")
        self.assertEqual(v["ajustes"][1], {"esfuerzo": 4})
        self.assertEqual(v["rechazados"], {3})
        self.assertEqual(v["por"], "claude-haiku")


if __name__ == "__main__":
    unittest.main()
