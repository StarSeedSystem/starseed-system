# -*- coding: utf-8 -*-
"""Pruebas del contexto común de la síntesis diaria (SDP1111A).

Fijan: la rotación arranca en los vídeos 4 y 5 y en Cole Hastings, Sunseed y Damanhur cuando no hay
síntesis previas; se leen las TRES últimas síntesis y su sección «Mañana»; la rotación no repite lo
de esas tres; las salidas de Imaginación se filtran a 24 h; los informes de directores y sueños son
solo los nuevos; y el resumen de actividad se incluye si existe. Todo con directorios temporales,
sin red.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import sintesis_fuentes as F  # noqa: E402

AHORA = datetime(2026, 11, 11, 6, 30)


def _escribir(ruta, texto, horas=0):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)
    sello = (AHORA - timedelta(hours=horas)).timestamp()
    os.utime(ruta, (sello, sello))
    return ruta


def _manana(videos, contactos=(), categoria=""):
    lineas = ["# Síntesis", "", "## Mañana", "- **Vídeos:** %s" % " y ".join(str(v) for v in videos)]
    if contactos:
        lineas.append("- **Contactos:** %s" % ", ".join(contactos))
    if categoria:
        lineas.append("- **Categoría nueva:** %s" % categoria)
    return "\n".join(lineas) + "\n"


class PruebaSintesisFuentes(unittest.TestCase):
    def setUp(self): self.raiz = tempfile.mkdtemp(prefix="sintesis-prueba-")
    def tearDown(self): shutil.rmtree(self.raiz, ignore_errors=True)

    def test_sin_sintesis_previas_arranca_en_4_y_5_y_contactos_iniciales(self):
        r = F.rotacion([])
        self.assertEqual(r["videos"], [4, 5])
        self.assertEqual(r["contactos"], ["Cole Hastings", "Sunseed", "Damanhur"])
        self.assertIsNone(r["categoria"])

    def test_manana_lee_videos_contactos_y_categoria(self):
        m = F.manana("## Mañana\n- **Vídeos:** 4 y 5\n- **Contactos:** Cole Hastings, Sunseed y Damanhur\n"
                     "- **Categoría nueva:** documental\n")
        self.assertEqual(m["videos"], [4, 5])
        self.assertEqual(m["contactos"], ["Cole Hastings", "Sunseed", "Damanhur"])
        self.assertEqual(m["categorias"], ["documental"])

    def test_lee_solo_las_tres_ultimas_sintesis_y_su_manana(self):
        videos = {"08": [2, 3], "09": [4, 5], "10": [6, 7], "11": [8, 9]}
        carpeta = os.path.join(self.raiz, "starseed_memory_root", "produccion-audiovisual", "sintesis")
        for dia in videos:
            _escribir(os.path.join(carpeta, "2026-11-%s.md" % dia),
                      _manana(videos[dia], ["Contacto %s" % dia]))
        c = F.contexto(str(self.raiz), AHORA, home=str(self.raiz))
        self.assertEqual([s["fecha"] for s in c["sintesis"]], ["2026-11-11", "2026-11-10", "2026-11-09"])
        self.assertEqual(c["sintesis"][0]["manana"]["videos"], [8, 9])
        self.assertEqual(c["rotacion"]["videos"], [10, 11])

    def test_rotacion_no_repite_ni_pasa_de_15(self):
        previas = [{"manana": F.manana(_manana([13, 14], ["Cole Hastings", "Sunseed"], "salud"))},
                   {"manana": F.manana(_manana([15, 1], ["Damanhur"], "tecnología"))}]
        r = F.rotacion(previas, contactos_pool=F.CONTACTOS_INICIALES + ("Ada Lovelace",),
                       categorias_pool=("salud", "arte"))
        self.assertEqual(r["videos"], [2, 3])
        self.assertEqual(r["contactos"], ["Ada Lovelace"])
        self.assertEqual(r["categoria"], "arte")

    def test_imaginacion_filtra_las_ultimas_24_horas(self):
        carpeta = os.path.join(self.raiz, "starseed_memory_root", "imaginacion", "agentes")
        _escribir(os.path.join(carpeta, "nueva.json"),
                  json.dumps([{"titulo": "Idea fresca", "fecha": "2026-11-10T23:00:00"}]), horas=2)
        _escribir(os.path.join(carpeta, "vieja.json"), json.dumps({"titulo": "Idea vieja"}), horas=30)
        c = F.contexto(str(self.raiz), AHORA, home=str(self.raiz))
        self.assertEqual([i["titulo"] for i in c["imaginacion"]], ["Idea fresca"])

    def test_informes_nuevos_de_directores_y_suenos(self):
        _escribir(os.path.join(self.raiz, "starseed_memory_root", "directores", "nuevo.json"),
                  json.dumps({"titulo": "Producción al día", "resumen": "Todo listo"}), horas=1)
        _escribir(os.path.join(self.raiz, "starseed_memory_root", "directores", "viejo.json"),
                  json.dumps({"titulo": "Viejo"}), horas=30)
        profundo = os.path.join(self.raiz, "starseed_memory_root", "dream", "profundo")
        _escribir(os.path.join(profundo, "2026-11-11", "INFORME.md"), "# Sueños\nHallazgo nuevo\n", horas=3)
        _escribir(os.path.join(profundo, "2026-11-09", "INFORME.md"), "# Sueños\nViejo\n", horas=50)
        c = F.contexto(str(self.raiz), AHORA, home=str(self.raiz))
        self.assertEqual([d["titulo"] for d in c["informes"]["directores"]], ["Producción al día"])
        self.assertEqual([s["fecha"] for s in c["informes"]["suenos"]], ["2026-11-11"])

    def test_resumen_de_actividad_si_existe(self):
        _escribir(os.path.join(self.raiz, ".starseed", "actividad", "resumen-2026-11-11.json"),
                  json.dumps({"temas": ["vídeo", "contactos"]}), horas=1)
        c = F.contexto(str(self.raiz), AHORA, home=str(self.raiz))
        self.assertEqual(c["actividad"]["fecha"], "2026-11-11")
        self.assertEqual(c["actividad"]["datos"]["temas"], ["vídeo", "contactos"])
        self.assertIsNone(F.contexto(str(self.raiz), AHORA, home=os.path.join(self.raiz, "otro"))["actividad"])

    def test_inyectable_y_sin_directorios_no_lanza(self):
        c = F.contexto(os.path.join(self.raiz, "no-existe"), AHORA, home=str(self.raiz), previas=[],
                       imaginacion=[{"titulo": "Dada"}], informes={"directores": [{"titulo": "D"}]},
                       actividad=None)
        self.assertEqual(c["sintesis"], [])
        self.assertEqual(c["imaginacion"][0]["titulo"], "Dada")
        self.assertEqual(c["informes"]["directores"][0]["titulo"], "D")
        self.assertEqual(c["rotacion"]["videos"], [4, 5])
        self.assertIsNone(c["actividad"])
        self.assertEqual(F.contexto(os.path.join(self.raiz, "no-existe"), AHORA)["rotacion"]["videos"], [4, 5])
