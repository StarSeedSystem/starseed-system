#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de sintesis_fuentes con directorios temporales (sin red, sin reloj)."""
import os, shutil, sys, tempfile, unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sintesis_fuentes as F

VIDEOS = ["v%d" % i for i in range(1, 16)]  # el índice de 15, de mentira
NUEVO, VIEJO = 1800000000.0 - 3600, 1800000000.0 - 30 * 3600


def E(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)
    return ruta


class Ultimas(unittest.TestCase):
    def setUp(self): self.raiz = tempfile.mkdtemp()

    def tearDown(self): shutil.rmtree(self.raiz, ignore_errors=True)

    def test_toma_las_3_mas_nuevas(self):
        for fecha in ("2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"):
            E(os.path.join(self.raiz, "produccion-audiovisual", "sintesis", "%s.md" % fecha), "# %s" % fecha)
        got = F.ultimas_sintesis(self.raiz)
        self.assertEqual([f for f, _ in got], ["2026-11-11", "2026-11-10", "2026-11-09"])
        self.assertIn("2026-11-11", got[0][1]); self.assertEqual(F.ultimas_sintesis(self.raiz, n=1), [("2026-11-11", "# 2026-11-11")])

    def test_carpeta_vacia_o_ausente(self):
        self.assertEqual(F.ultimas_sintesis(self.raiz), [])
        self.assertEqual(F.ultimas_sintesis(os.path.join(self.raiz, "no-es")), [])

    def test_seccion_mañana(self):
        texto = "# Síntesis\n## Rotación\nalgo\n## Mañana\n- vídeo: A y B\nsigue\n## Contactos\nfin"
        self.assertEqual(F.seccion_mañana(texto), "- vídeo: A y B\nsigue")
        self.assertEqual(F.seccion_mañana("## Otra sección"), ""); self.assertEqual(F.seccion_mañana(None), "")



class Usados(unittest.TestCase):
    def test_lee_videos_contactos_y_categoria(self):
        u = F.usados(["## Mañana\n- vídeo: A y B\n- contactos: Cole Hastings; Sunseed\n- categoría: papel, tinta"])
        self.assertEqual(u, {"videos": ["A", "B"], "contactos": ["Cole Hastings", "Sunseed"],
                             "categorias": ["papel", "tinta"]})
        varios = F.usados(["## Mañana\n- vídeo: A", "## Mañana\n- vídeo: A, C", "## Mañana\n- vídeo: D"])
        self.assertEqual(varios["videos"], ["A", "C", "D"])
        self.assertEqual(F.usados([]), {"videos": [], "contactos": [], "categorias": []})


class Rotacion(unittest.TestCase):
    def test_sin_previas_empieza_por_videos_4_y_5_y_contactos_base(self):
        r = F.rotacion([], indice_videos=VIDEOS)
        self.assertEqual(r["videos"], ["v4", "v5"])
        self.assertEqual(r["contactos"], F.CONTACTOS_BASE); self.assertEqual(r["categoria"], "")

    def test_avanza_sin_repetir_lo_de_las_3_ultimas(self):
        previas = [(f, "## Mañana\n- vídeo: v4 y v5\n- contactos: Cole Hastings, Sunseed\n- categoría: papel")
                   for f in ("2026-11-09", "2026-11-10", "2026-11-11")]
        r = F.rotacion(previas, indice_videos=VIDEOS, categorias=["papel", "tinta", "piedra"])
        self.assertEqual(r["videos"], ["v6", "v7"])
        self.assertEqual(r["contactos"], ["Damanhur"])
        self.assertEqual(r["categoria"], "tinta"); self.assertEqual(r["usados"]["videos"], ["v4", "v5"])
    def test_da_la_vuelta_cuando_todo_esta_usado(self):
        previas = [("2026-11-11", "## Mañana\n- vídeo: %s" % ", ".join(VIDEOS))]
        self.assertEqual(F.rotacion(previas, indice_videos=VIDEOS)["videos"], ["v1", "v2"])

    def test_nada_libre_reinicia_la_rotacion(self):
        r = F.rotacion([("2026-11-11", "## Mañana\n- contactos: Cole Hastings")], contactos=["Cole Hastings"])
        self.assertEqual(r["contactos"], F.CONTACTOS_BASE)


class Disco(unittest.TestCase):
    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.memoria = os.path.join(self.raiz, "starseed_memory_root")

    def tearDown(self):
        shutil.rmtree(self.raiz, ignore_errors=True)
    def test_imaginacion_24h_filtra_por_ventana(self):
        agentes = os.path.join(self.memoria, "imaginacion", "agentes")
        nuevo = E(os.path.join(agentes, "sintesis-2026-11-11-contactos.json"), '{"rama": "contactos"}')
        viejo = E(os.path.join(agentes, "viejo.json"), '{"rama": "vieja"}')
        os.utime(nuevo, (NUEVO, NUEVO))
        os.utime(viejo, (VIEJO, VIEJO))
        E(os.path.join(agentes, "notas.txt"), "x")
        got = F.imaginacion_24h(self.raiz, ahora=1800000000.0)
        self.assertEqual([g["archivo"] for g in got], ["sintesis-2026-11-11-contactos.json"])
        self.assertEqual(got[0]["datos"]["rama"], "contactos")
        self.assertEqual(len(F.imaginacion_24h(self.raiz)), 2)
        self.assertEqual(F.imaginacion_24h(os.path.join(self.raiz, "nada")), [])
    def test_informes_nuevos_directores_y_suenos(self):
        p1 = E(os.path.join(self.memoria, "directores", "d1.json"), '{"titulo": "T", "resumen": "R"}')
        p2 = E(os.path.join(self.memoria, "dream", "profundo", "2026-11-11", "INFORME.md"), "primera línea\nresto")
        p3 = E(os.path.join(self.memoria, "dream", "profundo", "2026-11-01", "INFORME.md"), "vieja")
        for p in (p1, p2):
            os.utime(p, (NUEVO, NUEVO))
        os.utime(p3, (VIEJO, VIEJO))
        got = F.informes_nuevos(self.raiz, ahora=1800000000.0)
        self.assertEqual([g["fuente"] for g in got], ["directores", "sueños"])
        self.assertEqual(got[0], {"fuente": "directores", "titulo": "T", "resumen": "R"})
        self.assertEqual(got[1]["titulo"], "2026-11-11"); self.assertEqual(got[1]["resumen"], "primera línea")

    def test_resumen_actividad_ruta_inyectada(self):
        ruta = E(os.path.join(self.raiz, "resumen-2026-11-11.json"), '{"horas": 3}')
        self.assertEqual(F.resumen_actividad("2026-11-11", ruta_actividad=ruta), {"horas": 3})
        self.assertEqual(F.resumen_actividad("2026-11-11", ruta_actividad=ruta + "-no"), {})

    def test_contexto_une_todas_las_fuentes(self):
        E(os.path.join(self.raiz, "produccion-audiovisual", "sintesis", "2026-11-11.md"), "## Mañana\n- vídeo: v1")
        E(os.path.join(self.memoria, "imaginacion", "agentes", "a.json"), '{"ok": 1}')
        ruta = E(os.path.join(self.raiz, "actividad.json"), '{"horas": 2}')
        c = F.contexto(self.raiz, ahora=datetime(2026, 11, 11, 6), indice_videos=VIDEOS,
                       categorias=["a", "b"], ruta_actividad=ruta)
        self.assertEqual(c["sintesis"][0]["mañana"], "- vídeo: v1")
        self.assertEqual(c["rotacion"]["videos"], ["v4", "v5"])
        self.assertEqual(c["rotacion"]["categoria"], "a")
        self.assertEqual(c["imaginacion"][0]["datos"], {"ok": 1}); self.assertEqual(c["actividad"], {"horas": 2})