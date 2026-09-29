# -*- coding: utf-8 -*-
"""Pruebas de suenos_areas: el plan de los sueños profundos (áreas × lentes → tareas).

La primera es la importante: si alguien añade o renombra un área en
`src/lib/mando/areas.ts` y no le da raíces aquí, el sueño de esa área no tendría nada que
leer — y nadie se enteraría. Esta prueba se pone roja en ese mismo commit.
"""
import datetime
import os
import re
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)

import suenos_areas as S  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
FECHA = datetime.date(2026, 9, 29)

REPO = {
    "memory/principles.md": 9000,
    "memory/glossary.md": 3000,
    "src/app/(app)/bienvenida/page.tsx": 12000,
    "src/lib/onboarding/rito.ts": 8000,
    "src/lib/onboarding/__tests__/rito.test.ts": 2000,
    "src/app/api/voz/hablar/route.ts": 4000,
    "src/lib/voces/motor.ts": 20000,
    "src/components/voces/panel.tsx": 7000,
    "src/lib/voces/.env.local": 300,
    "src/lib/voces/logo.png": 5000,
    "src/app/(app)/network/politics/page.tsx": 6000,
    "src/app/(app)/network/page.tsx": 6000,
}


class DerivaConAreasTs(unittest.TestCase):
    """areas.ts y el plan no pueden separarse."""

    @classmethod
    def setUpClass(cls):
        with open(os.path.join(RAIZ, S.AREAS_TS), encoding="utf-8") as f:
            cls.areas_ts = S.leer_areas_ts(f.read())
        cls.plan_areas = S.areas_del_plan(cls.areas_ts)

    def test_areas_ts_se_entiende(self):
        self.assertGreaterEqual(len(self.areas_ts), 11, "no se pudo leer AREAS_TRABAJO de areas.ts")
        for a in self.areas_ts:
            self.assertTrue(a["nombre"] and a["descripcion"], a["id"])

    def test_toda_area_de_areas_ts_tiene_raices(self):
        sin = [a["id"] for a in self.areas_ts if not S.RAICES.get(a["id"])]
        self.assertEqual(sin, [], "áreas de areas.ts sin raíces en suenos_areas.RAICES: %s" % sin)

    def test_no_hay_raices_de_areas_que_ya_no_existen(self):
        validas = {a["id"] for a in self.areas_ts} | set(S.IDS_EXTRA)
        sobran = sorted(set(S.RAICES) - validas)
        self.assertEqual(sobran, [], "RAICES tiene áreas que areas.ts ya no define: %s" % sobran)

    def test_las_extra_no_duplican_areas_ts(self):
        ids = [a["id"] for a in self.plan_areas]
        self.assertEqual(len(ids), len(set(ids)))
        for extra in ("mando", "dashboards", "gobernanza"):
            self.assertIn(extra, ids)

    def test_cada_area_tiene_alguna_raiz_en_el_repo(self):
        for a in self.plan_areas:
            existe = any(os.path.exists(os.path.join(RAIZ, r)) for r in a["raices"])
            self.assertTrue(existe, "ninguna raíz de «%s» existe en el repo" % a["id"])


class LecturaDeAreasTs(unittest.TestCase):
    def test_parsea_un_bloque_con_descripcion_en_varias_lineas(self):
        texto = '''export const AREAS_TRABAJO: AreaTrabajo[] = [
    {
        id: "voz",
        nombre: "Voz",
        descripcion:
            "Voces y daemon.",
        color: "cyan",
        rutas: [{ etiqueta: "Voces", href: "/voces" }],
        documentos: ["a.md", "b.md"],
        olas: ["149"],
    },
];
export const OTRA = [{ id: "no" }];'''
        self.assertEqual(S.leer_areas_ts(texto), [
            {"id": "voz", "nombre": "Voz", "descripcion": "Voces y daemon.", "documentos": ["a.md", "b.md"]}
        ])

    def test_forma_irreconocible_devuelve_vacio(self):
        self.assertEqual(S.leer_areas_ts("const X = 1;"), [])


class Archivos(unittest.TestCase):
    def setUp(self):
        self.areas = {a["id"]: a for a in S.areas_del_plan([
            {"id": "rito", "nombre": "Rito", "descripcion": "d", "documentos": ["memory/principles.md", "memory/glossary.md"]},
            {"id": "voz", "nombre": "Voz", "descripcion": "d", "documentos": []},
            {"id": "social", "nombre": "Social", "descripcion": "d", "documentos": []},
        ])}

    def test_documentos_primero_y_nunca_secretos_ni_binarios(self):
        rito = S.archivos_del_area(self.areas["rito"], REPO, 10)
        self.assertEqual(rito[:2], ["memory/principles.md", "memory/glossary.md"])
        voz = S.archivos_del_area(self.areas["voz"], REPO, 10)
        self.assertNotIn("src/lib/voces/.env.local", voz)
        self.assertNotIn("src/lib/voces/logo.png", voz)
        self.assertIn("src/app/api/voz/hablar/route.ts", voz)

    def test_excluir_aparta_lo_de_otra_area(self):
        social = S.archivos_del_area(self.areas["social"], REPO, 10)
        self.assertIn("src/app/(app)/network/page.tsx", social)
        self.assertNotIn("src/app/(app)/network/politics/page.tsx", social)

    def test_el_tope_reparte_huecos_entre_lentes(self):
        voz = S.archivos_del_area(self.areas["voz"], REPO, 2)
        # Por turnos: arquitectura se lleva el motor grande y ux el .tsx, aunque pese menos.
        self.assertEqual(voz, ["src/components/voces/panel.tsx", "src/lib/voces/motor.ts"])
        solo_seguridad = S.archivos_del_area(self.areas["voz"], REPO, 1, ["seguridad-privacidad"])
        self.assertEqual(solo_seguridad, ["src/app/api/voz/hablar/route.ts"])

    def test_mas_horas_mas_hondo(self):
        self.assertLess(S.archivos_por_area(0), S.archivos_por_area(4))
        self.assertLessEqual(S.archivos_por_area(100), 48)


class Plan(unittest.TestCase):
    def setUp(self):
        self.areas = S.areas_del_plan([
            {"id": "rito", "nombre": "Rito", "descripcion": "Entrada", "documentos": ["memory/principles.md"]},
            {"id": "voz", "nombre": "Voz", "descripcion": "Voces", "documentos": []},
        ])

    def test_ids_validos_unicos_y_estables(self):
        plan = S.construir_plan(self.areas, REPO, FECHA)
        ids = [t["id"] for t in plan["tareas"]]
        self.assertEqual(len(ids), len(set(ids)))
        for i in ids:
            self.assertRegex(i, r"^[A-Za-z][A-Za-z0-9]{0,8}$")
            self.assertTrue(i.startswith("SA0929"))
        solo = S.construir_plan(self.areas, REPO, FECHA, ids_areas=["voz"], ids_lentes=["coherencia-triada"])
        mismo = [t for t in plan["tareas"] if t["area"] == "voz" and t["lente"] == "coherencia-triada"][0]
        self.assertEqual(solo["tareas"][0]["id"], mismo["id"])

    def test_tareas_de_analisis_con_su_forma(self):
        plan = S.construir_plan(self.areas, REPO, FECHA, ids_areas=["rito", "voz"])
        self.assertEqual(len(plan["tareas"]), 2 * len(S.LENTES))
        for t in plan["tareas"]:
            self.assertEqual(t["tipo"], "analisis")
            self.assertEqual(t["depende"], [])
            self.assertIn("NO escritura", t["prompt"])
            self.assertEqual(t["privado"], t["lente"] == "seguridad-privacidad")
            self.assertTrue(t["archivos"])
        # Todas las lentes de un área leen los MISMOS archivos (lectura compartida).
        por_area = {}
        for t in plan["tareas"]:
            por_area.setdefault(t["area"], set()).add(tuple(t["archivos"]))
        self.assertTrue(all(len(v) == 1 for v in por_area.values()))

    def test_filtros_y_desconocidas(self):
        plan = S.construir_plan(self.areas, REPO, FECHA, ids_areas=["voz", "marte"], ids_lentes=["nada"])
        self.assertIn("marte", plan["desconocidas"])
        self.assertIn("nada", plan["desconocidas"])

    def test_ritmo_llena_las_horas_sin_pausas_absurdas(self):
        self.assertEqual(S.pausa_entre_llamadas(100, 0, 5), 0)
        p = S.pausa_entre_llamadas(100, 4, 5)
        self.assertGreater(p, 0)
        self.assertLessEqual(p, 900)
        self.assertEqual(S.pausa_entre_llamadas(1, 100, 1), 900)
        plan = S.construir_plan(self.areas, REPO, FECHA, horas=3)
        self.assertTrue(all(t["pausa_s"] == plan["pausa_s"] for t in plan["tareas"]))

    def test_id_demasiado_largo_se_niega(self):
        with self.assertRaises(ValueError):
            S.id_tarea(FECHA, 1000)
        self.assertTrue(re.match(r"^SA0929999$", S.id_tarea(FECHA, 999)))


if __name__ == "__main__":
    unittest.main()
