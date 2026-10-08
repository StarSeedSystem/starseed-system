#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del director de diseño (DIS1005E · §1, §5 y §8 del contrato).

Todo inyectado: sin disco, sin red, sin procesos, sin ~/.starseed. Cubre: brief
una sola vez por tarea de interfaz al entrar en `en_curso`; commit de una tarea
.tsx → verificación y nota; nota baja → arreglos al agente y al revisor más aviso
en el Chat Director y el canal; `--seco` no escribe ni publica; el lunes, una
sola tarea de tendencias DIST<AAMMDD> por semana; juez visual que frena sin
suspender por sí solo; informe horario.
"""
import importlib.util
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_spec = importlib.util.spec_from_file_location(
    "director_diseno",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "director-diseno.py"),
)
DD = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(DD)

LUNES = time.mktime((2026, 10, 5, 9, 0, 0, 0, 0, -1))  # lunes 2026-10-05 09:00 local
MARTES = time.mktime((2026, 10, 6, 9, 0, 0, 0, 0, -1))


def informe_limpio():
    return {
        "ruta": "/genesis",
        "tamano": "movil",
        "desbordes": [],
        "contraste_bajo": [],
        "dianas_chicas": [],
        "errores_consola": [],
        "fuera_horizontal": [],
    }


def deps_falsas(progreso=None, tareas=None, informes=None, config=None,
                estado=None, juez=None, seco=False):
    """Dependencias falsas que lo anotan todo y no tocan nada."""
    reg = {"anotar": [], "verificar": [], "publicar": [], "decir": [],
           "encolar": [], "aprender": [], "rotacion": [], "estado": estado or {},
           "pesos": {}, "latido": 0}
    deps = {
        "seco": seco,
        "leer_progreso": lambda: progreso or {},
        "leer_colas": lambda: tareas or [],
        "cargar_memoria": lambda: {"identidades": "", "armonia": "",
                                   "referencias": "", "adn": {}},
        "cargar_config": lambda: config if config is not None else {
            "activo": True, "umbral": 75, "juez_visual": True,
            "max_capturas_tarea": 14, "intervalo_s": 120},
        "anotar": lambda tid, texto: reg["anotar"].append((tid, texto)),
        "verificar": lambda tid, rutas: (
            reg["verificar"].append((tid, list(rutas))),
            list(informes) if informes is not None else [informe_limpio()])[1],
        "diff_de": lambda tid: "",
        "juez": lambda tid, rutas: juez,
        "publicar": lambda texto, tipo="informe": reg["publicar"].append((tipo, texto)),
        "decir": lambda texto, tipo="hecho": reg["decir"].append((tipo, texto)),
        "encolar": lambda tarea: reg["encolar"].append(tarea),
        "latido": lambda ahora: reg.__setitem__("latido", reg["latido"] + 1),
        "leer_estado": lambda: reg["estado"],
        "guardar_estado": lambda est: reg.__setitem__("estado_guardado", est),
        "leer_pesos": lambda: dict(reg["pesos"]),
        "guardar_pesos": lambda p: reg.__setitem__("pesos", dict(p)),
        "guardar_rotacion": lambda r: reg["rotacion"].append(r),
        "aprender_linea": lambda linea: reg["aprender"].append(linea),
    }
    return deps, reg


def tarea_interfaz(tid="T1", estado_archivo="src/components/mando/panel.tsx"):
    return {
        "id": tid,
        "titulo": "Panel de prueba en Genesis",
        "prompt": "Una tarjeta con un botón.",
        "archivos": [estado_archivo],
    }


class TestBrief(unittest.TestCase):
    """§1.1: brief una sola vez por tarea de interfaz al pasar a en_curso."""

    def test_brief_una_sola_vez(self):
        deps, reg = deps_falsas(
            progreso={"T1": {"estado": "en_curso", "modelo": "nim/kimi-k3"}},
            tareas=[tarea_interfaz()],
        )
        r1 = DD.ciclo(MARTES, deps)
        r2 = DD.ciclo(MARTES, deps)
        self.assertEqual(r1["briefs"], 1)
        self.assertEqual(r2["briefs"], 0)
        self.assertEqual(len(reg["anotar"]), 1)
        tid, texto = reg["anotar"][0]
        self.assertEqual(tid, "T1")
        self.assertIn("Brief de diseño", texto)
        self.assertIn("Matriz de pantallas", texto)
        self.assertTrue(reg["estado"]["briefs"]["T1"])

    def test_sin_interfaz_no_hay_brief(self):
        tarea = {"id": "T2", "titulo": "Refactor del endpoint",
                 "archivos": ["src/lib/api/foo.ts"]}
        deps, reg = deps_falsas(
            progreso={"T2": {"estado": "en_curso"}},
            tareas=[tarea],
        )
        r = DD.ciclo(MARTES, deps)
        self.assertEqual(r["briefs"], 0)
        self.assertEqual(reg["anotar"], [])

    def test_director_inactivo_no_hace_nada(self):
        deps, reg = deps_falsas(
            progreso={"T1": {"estado": "en_curso"}},
            tareas=[tarea_interfaz()],
            config={"activo": False},
        )
        r = DD.ciclo(MARTES, deps)
        self.assertFalse(r["activo"])
        self.assertEqual(reg["anotar"], [])
        self.assertEqual(reg["verificar"], [])


class TestVerificacion(unittest.TestCase):
    """§1.2: commit de una tarea .tsx → verificación, nota y aprendizaje."""

    def test_commit_verifica_y_aprueba(self):
        deps, reg = deps_falsas(
            progreso={"T1": {"estado": "commit", "modelo": "nim/kimi-k3"}},
            tareas=[tarea_interfaz()],
        )
        r = DD.ciclo(MARTES, deps)
        self.assertEqual(r["verificadas"], 1)
        self.assertEqual(reg["verificar"], [("T1", ["/genesis"])])
        self.assertEqual(reg["anotar"], [])  # aprobada: sin mensajes al agente
        self.assertEqual([p[0] for p in reg["publicar"]], ["informe"])
        self.assertEqual(len(reg["aprender"]), 1)
        self.assertIn("T1", reg["aprender"][0])
        self.assertIn("nim/kimi-k3", reg["aprender"][0])
        self.assertIn("nim/kimi-k3", reg["pesos"])
        self.assertEqual(reg["rotacion"][-1]["orden"][0], "nim/kimi-k3")
        self.assertTrue(reg["estado"]["verificadas"]["T1"]["aprobado"])

    def test_nota_baja_arreglos_y_aviso(self):
        informe = informe_limpio()
        informe["desbordes"] = ["div.a", "div.b", "div.c", "div.d", "div.e"]
        deps, reg = deps_falsas(
            progreso={"T1": {"estado": "commit", "modelo": "nim/kimi-k3"}},
            tareas=[tarea_interfaz()],
            informes=[informe],
        )
        DD.ciclo(MARTES, deps)
        self.assertEqual(len(reg["anotar"]), 1)
        tid, texto = reg["anotar"][0]
        self.assertEqual(tid, "T1")
        self.assertIn("/100", texto)
        self.assertIn("Arreglos", texto)
        self.assertIn("acorta el texto", texto)
        avisos = [p for p in reg["publicar"] if p[0] == "aviso"]
        self.assertEqual(len(avisos), 1)
        self.assertIn("T1", avisos[0][1])
        self.assertTrue(any(t == "aviso" and "T1" in x for t, x in reg["decir"]))
        self.assertFalse(reg["estado"]["verificadas"]["T1"]["aprobado"])

    def test_no_verifica_dos_veces(self):
        deps, reg = deps_falsas(
            progreso={"T1": {"estado": "commit", "modelo": "m"}},
            tareas=[tarea_interfaz()],
        )
        DD.ciclo(MARTES, deps)
        r2 = DD.ciclo(MARTES, deps)
        self.assertEqual(r2["verificadas"], 0)
        self.assertEqual(len(reg["verificar"]), 1)

    def test_sin_rutas_deducibles_se_dice(self):
        tarea = tarea_interfaz("T3", "src/lib/gadgets/tarjeta.tsx")
        deps, reg = deps_falsas(
            progreso={"T3": {"estado": "commit"}},
            tareas=[tarea],
        )
        r = DD.ciclo(MARTES, deps)
        self.assertEqual(reg["verificar"], [])
        self.assertTrue(any("sin rutas" in a for a in r["avisos"]))
        self.assertTrue(reg["estado"]["verificadas"]["T3"]["sin_rutas"])

    def test_juez_visual_frena_sin_suspender(self):
        deps, reg = deps_falsas(
            progreso={"T1": {"estado": "commit", "modelo": "m"}},
            tareas=[tarea_interfaz()],
            juez=10,
        )
        r = DD.ciclo(MARTES, deps)
        self.assertTrue(reg["estado"]["verificadas"]["T1"]["aprobado"])
        self.assertEqual(reg["anotar"], [])  # el juez solo frena, nunca suspende un aprobado
        self.assertTrue(any("juez visual" in a for a in r["avisos"]))


class TestSeco(unittest.TestCase):
    """--seco: no escribe ni publica; solo imprime (aquí, lo llena el resumen)."""

    def test_seco_no_escribe_ni_publica(self):
        deps, reg = deps_falsas(
            progreso={
                "T1": {"estado": "en_curso", "modelo": "m"},
                "T2": {"estado": "commit", "modelo": "m"},
            },
            tareas=[tarea_interfaz(),
                    {"id": "T2", "titulo": "Otra tarjeta",
                     "archivos": ["src/components/mando/otra.tsx"]}],
            seco=True,
        )
        r = DD.ciclo(LUNES, deps)
        self.assertEqual(reg["anotar"], [])
        self.assertEqual(reg["verificar"], [])
        self.assertEqual(reg["publicar"], [])
        self.assertEqual(reg["decir"], [])
        self.assertEqual(reg["encolar"], [])
        self.assertNotIn("estado_guardado", reg)
        self.assertEqual(reg["latido"], 0)
        self.assertTrue(r["seco"])
        self.assertEqual(r["tendencias"], "DIST" + time.strftime("%y%m%d", time.localtime(LUNES)))


class TestTendencias(unittest.TestCase):
    """§2: cada lunes una tarea DIST<AAMMDD>; como mucho una por semana."""

    def test_lunes_encola_una_sola_vez(self):
        deps, reg = deps_falsas()
        r1 = DD.ciclo(LUNES, deps)
        r2 = DD.ciclo(LUNES + 3600, deps)
        self.assertEqual(len(reg["encolar"]), 1)
        tarea = reg["encolar"][0]
        self.assertTrue(tarea["id"].startswith("DIST"))
        self.assertEqual(tarea["id"], r1["tendencias"])
        self.assertIn("tendencias.md", tarea["archivos"][0])
        self.assertIsNone(r2["tendencias"])

    def test_martes_no_encola(self):
        deps, reg = deps_falsas()
        r = DD.ciclo(MARTES, deps)
        self.assertIsNone(r["tendencias"])
        self.assertEqual(reg["encolar"], [])


class TestInforme(unittest.TestCase):
    """§8: informe al Chat Director cada hora, no en cada ciclo."""

    def test_informe_una_vez_por_hora(self):
        estado = {"notas": [
            {"tid": "T0", "nota": 92, "modelo": "nim/kimi-k3", "tipos": []},
            {"tid": "T9", "nota": 40, "modelo": "otro/x", "tipos": ["desborde"]},
        ]}
        deps, reg = deps_falsas(estado=estado)
        DD.ciclo(MARTES, deps)
        informes = [p for p in reg["publicar"] if p[0] == "informe"]
        self.assertEqual(len(informes), 1)
        self.assertIn("Mejor escritor", informes[0][1])
        self.assertIn("nim/kimi-k3", informes[0][1])
        self.assertEqual(reg["estado"]["ultimo_informe"], MARTES)
        DD.ciclo(MARTES + 600, deps)
        self.assertEqual(len([p for p in reg["publicar"] if p[0] == "informe"]), 1)
        DD.ciclo(MARTES + 3700, deps)
        self.assertEqual(len([p for p in reg["publicar"] if p[0] == "informe"]), 2)


class TestRutasDe(unittest.TestCase):
    def test_tabla_y_regla_app(self):
        self.assertEqual(DD.rutas_de(["src/components/mando/panel.tsx"]), ["/genesis"])
        self.assertEqual(DD.rutas_de(["src/app/(app)/audiomorphic/page.tsx"]),
                         ["/audiomorphic"])
        self.assertEqual(DD.rutas_de(["src/app/comunidad/page.tsx"]), ["/comunidad"])
        self.assertEqual(DD.rutas_de(["src/lib/x.py"]), [])
        self.assertEqual(DD.rutas_de([]), [])


if __name__ == "__main__":
    unittest.main()
