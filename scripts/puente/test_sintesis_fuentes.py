# -*- coding: utf-8 -*-
"""Pruebas de sintesis_fuentes (SDP1111A): fuentes y rotación de la síntesis diaria, con directorios temporales."""
import json
import os
import sys
import tempfile
import time
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)

import sintesis_fuentes as F  # noqa: E402

AHORA = time.time()

def _carpeta_temp():
    return tempfile.mkdtemp(prefix="sintesis-fuentes-")

def _escribir(ruta, texto, mtime=None):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f: f.write(texto)
    if mtime is not None: os.utime(ruta, (mtime, mtime))

class TestSeccionManana(unittest.TestCase):
    def test_extrae_hasta_el_siguiente_encabezado(self):
        texto = "# Síntesis\n## Hoy\n- algo\n## Mañana\n- vídeo 7\n- Cole Hastings\n## Fuentes\n- x\n"
        self.assertEqual(F.seccion_manana(texto), "- vídeo 7\n- Cole Hastings")

    def test_sin_seccion_da_vacio(self):
        self.assertEqual(F.seccion_manana("# Síntesis\nsolo hoy"), "")
        self.assertEqual(F.seccion_manana(""), "")

class TestSintesisPrevias(unittest.TestCase):
    def test_devuelve_las_3_ultimas_en_orden(self):
        raiz = _carpeta_temp()
        for dia in ("2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"):
            _escribir(os.path.join(raiz, F.REL_SINTESIS, dia + ".md"),
                      "# %s\n## Mañana\n- vídeo %s\n" % (dia, dia[-2:]))
        previas = F.sintesis_previas(raiz)
        self.assertEqual([p["fecha"] for p in previas], ["2026-11-09", "2026-11-10", "2026-11-11"])
        self.assertIn("vídeo 11", previas[-1]["manana"])

    def test_sin_carpeta_devuelve_vacio(self):
        self.assertEqual(F.sintesis_previas(_carpeta_temp()), [])

class TestRotacion(unittest.TestCase):
    def test_sin_previas_empieza_por_videos_4_y_5_y_contactos_iniciales(self):
        r = F.rotacion([])
        self.assertEqual(r["videos"], ["4", "5"])
        self.assertEqual(r["contactos"], ["Cole Hastings", "Sunseed", "Damanhur"])
        self.assertIsNone(r["categoria"])

    def test_evita_lo_de_las_3_ultimas(self):
        r = F.rotacion(["vídeos 4 y 5 con Cole Hastings y categoría educación", "vídeos 6 y 7", "vídeos 8 y 9"])
        self.assertEqual(r["videos"], ["10", "11"])
        self.assertNotIn("Cole Hastings", r["contactos"])
        self.assertIn("Sunseed", r["contactos"])
        self.assertEqual(r["categoria"], None)

    def test_da_la_vuelta_al_indice(self):
        r = F.rotacion(["vídeos 14 y 15", "vídeos 1 y 2", "vídeos 3 y 4"])
        self.assertEqual(r["videos"], ["5", "6"])

    def test_las_fechas_de_la_seccion_no_marcan_videos(self):
        r = F.rotacion(["vídeos 4 y 5 (ver 2026-11-11)"])
        self.assertEqual(r["videos"], ["6", "7"])

class TestFuentesDelDia(unittest.TestCase):
    def setUp(self):
        self.raiz = _carpeta_temp()
        self.carpeta_actividad = _carpeta_temp()

    def test_salidas_de_imagenacion_solo_las_de_24_h(self):
        base = os.path.join(self.raiz, F.REL_IMAGINACION)
        _escribir(os.path.join(base, "sintesis-2026-11-11-contactos.json"),
                  json.dumps({"agente": "sintesis", "resumen": "hola"}), AHORA - 60)
        _escribir(os.path.join(base, "viejo.json"), json.dumps({"agente": "x"}), AHORA - 90000)
        _escribir(os.path.join(base, "roto.json"), "{no es json", AHORA - 60)
        salidas = F.salidas_imaginacion(self.raiz, AHORA)
        self.assertEqual([s["archivo"] for s in salidas], ["roto.json", "sintesis-2026-11-11-contactos.json"])
        self.assertEqual(salidas[-1]["agente"], "sintesis")

    def test_informes_directores(self):
        base = os.path.join(self.raiz, F.REL_DIRECTORES)
        _escribir(os.path.join(base, "auto-1.json"), json.dumps({"titulo": "T", "resumen": "R"}), AHORA - 60)
        _escribir(os.path.join(base, "viejo.json"), json.dumps({"titulo": "V"}), AHORA - 90000)
        informes = F.informes_directores(self.raiz, AHORA)
        self.assertEqual(informes, [{"titulo": "T", "resumen": "R"}])

    def test_informes_suenos(self):
        base = os.path.join(self.raiz, F.REL_SUENOS)
        _escribir(os.path.join(base, "2026-11-11-a", "INFORME.md"), "# Informe", AHORA - 60)
        _escribir(os.path.join(base, "2026-11-01-a", "INFORME.md"), "# Viejo", AHORA - 900000)
        self.assertEqual([s["sesion"] for s in F.informes_suenos(self.raiz, AHORA)], ["2026-11-11-a"])

    def test_resumen_de_actividad_si_existe(self):
        _escribir(os.path.join(self.carpeta_actividad, "resumen-2026-11-11.json"),
                  json.dumps({"temas": ["supabase"]}), AHORA - 60)
        self.assertEqual(F.resumen_actividad(AHORA, self.carpeta_actividad), {"temas": ["supabase"]})
        self.assertIsNone(F.resumen_actividad(AHORA, _carpeta_temp()))

class TestContextoComun(unittest.TestCase):
    def test_armado_completo_con_raiz_temporal(self):
        raiz, actividad = _carpeta_temp(), _carpeta_temp()
        _escribir(os.path.join(raiz, F.REL_SINTESIS, "2026-11-11.md"), "# Síntesis\n## Mañana\n- vídeos 4 y 5\n")
        _escribir(os.path.join(raiz, F.REL_IMAGINACION, "a.json"), json.dumps({"agente": "s"}), AHORA - 30)
        _escribir(os.path.join(actividad, "resumen-2026-11-11.json"), json.dumps({"temas": ["x"]}), AHORA - 30)
        c = F.contexto_comun(raiz, ahora=AHORA, carpeta_actividad=actividad)
        self.assertEqual(c["fecha"], time.strftime("%Y-%m-%d", time.localtime(AHORA)))
        self.assertEqual(c["rotacion"]["videos"], ["6", "7"])
        self.assertEqual(c["sintesis_previas"][0]["fecha"], "2026-11-11")
        self.assertEqual(len(c["imaginacion"]), 1)
        self.assertEqual(c["actividad"], {"temas": ["x"]})
        self.assertEqual(c["informes_directores"], [])
        self.assertEqual(c["informes_suenos"], [])

if __name__ == "__main__":
    unittest.main()
