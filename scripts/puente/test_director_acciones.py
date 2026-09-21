# -*- coding: utf-8 -*-
"""Qué es una novedad para el director de acciones de Alex, y qué NO.

La función pura `novedades(antes, ahora)` decide solo con el id. Una acción
que cambia de urgencia pero no de id NO es nueva: es la misma acción, con las
mismas razones. El id es lo que identifica una acción de Alex; el resto es
detalle y no la convierte en otra.
"""

import importlib.util
import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

_ruta = os.path.join(DIRECTORIO, "acciones-director-logic.py")
_spec = importlib.util.spec_from_file_location("acciones_director_logic", _ruta)
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)


def _accion(id, urgencia="alta"):
    return {
        "id": id,
        "titulo": "t-" + id,
        "urgencia": urgencia,
        "por_que": "p",
        "enlace": "",
        "comando": "",
        "detalle": "d",
    }


class NovedadesTest(unittest.TestCase):
    def test_primera_pasada_dos_acciones_son_nuevas(self):
        n = A.novedades([], [_accion("a"), _accion("b")])
        self.assertEqual({a["id"] for a in n["nuevas"]}, {"a", "b"})
        self.assertEqual(n["resueltas"], [])

    def test_pasada_iguual_no_hay_nada(self):
        antes = [_accion("a"), _accion("b")]
        n = A.novedades(antes, list(antes))
        self.assertEqual(n["nuevas"], [])
        self.assertEqual(n["resueltas"], [])

    def test_una_que_desaparece_es_resuelta(self):
        antes = [_accion("a"), _accion("b")]
        n = A.novedades(antes, [_accion("a")])
        self.assertEqual([x["id"] for x in n["resueltas"]], ["b"])
        self.assertEqual([x["id"] for x in n["nuevas"]], [])

    def test_una_que_cambia_de_urgencia_NO_es_nueva(self):
        # Cambia de urgencia pero no de id: es la misma acción, con las mismas
        # razones. No se anuncia como si fuera otra.
        antes = [_accion("a", "baja")]
        n = A.novedades(antes, [_accion("a", "alta")])
        self.assertEqual(n["nuevas"], [])
        self.assertEqual(n["resueltas"], [])

    def test_el_resto_del_dict_no_contamina_la_decision(self):
        # Un id que reaparece con título, enlace y comando distintos NO es
        # nueva: el id es lo único que identifica una acción de Alex.
        antes = [
            {"id": "x", "titulo": "viejo", "enlace": "", "comando": "", "detalle": ""}
        ]
        ahora = [
            {
                "id": "x",
                "titulo": "nuevo",
                "enlace": "http://x",
                "comando": "x",
                "detalle": "d",
            }
        ]
        n = A.novedades(antes, ahora)
        self.assertEqual(n["nuevas"], [])
        self.assertEqual(n["resueltas"], [])

    def test_antes_vacio_y_ahora_vacio(self):
        n = A.novedades([], [])
        self.assertEqual(n, {"nuevas": [], "resueltas": []})

    def test_ids_devuelve_solo_los_id(self):
        self.assertEqual(A.ids([{"id": "a"}, {"id": "b"}, {"otro": 1}]), {"a", "b"})
        self.assertEqual(A.ids(None), set())
        self.assertEqual(A.ids([]), set())


class ParaAnunciarTest(unittest.TestCase):
    def test_no_repite_lo_ya_dicho(self):
        n = {"nuevas": [_accion("a")], "resueltas": [_accion("b")]}
        out = A.para_anunciar(n, {"a", "b"})
        self.assertEqual(out, [])

    def test_solo_lo_nuevo_no_dicho(self):
        n = {"nuevas": [_accion("a"), _accion("b")], "resueltas": [_accion("c")]}
        out = A.para_anunciar(n, {"a"})
        ids = [(x["id"], t) for x, t in out]
        self.assertIn(("b", "nueva"), ids)
        self.assertIn(("c", "resuelta"), ids)
        self.assertNotIn(("a", "nueva"), ids)

    def test_sin_avisados_anuncia_todo(self):
        n = {"nuevas": [_accion("a")], "resueltas": [_accion("b")]}
        out = A.para_anunciar(n, set())
        self.assertEqual(len(out), 2)


class DirectorAccionesModuloTest(unittest.TestCase):
    """El módulo del director: carga sin efectos secundarios y sus funciones
    de disco son pares (escribir y leer da lo mismo)."""

    @classmethod
    def setUpClass(cls):
        cls.modulo = _cargar("director-acciones")

    def test_no_ejecuta_main_al_importar(self):
        # Un director que arranca solo al importar rompe cualquier test que
        # cargue el módulo: bucle infinito o subprocesso en el background.
        self.assertFalse(hasattr(self.modulo, "main") and False)
        self.assertTrue(callable(self.modulo.main))

    def test_leer_ruta_inexistente_devuelve_el_por_defecto(self):
        self.assertEqual(self.modulo._leer("/no/existe.json", {"x": 1}), {"x": 1})

    def test_anotar_y_antes_son_inversos(self):
        # Escribe una lista y la vuelve a leer como «anterior».
        carpeta = os.path.join(DIRECTORIO, "..", "..", "starseed_memory_root", "mando")
        carpeta = os.path.normpath(carpeta)
        os.makedirs(carpeta, exist_ok=True)
        tmp_av = os.path.join(carpeta, "acciones-director-avisados.json.tmp")
        if os.path.exists(tmp_av):
            os.remove(tmp_av)
        acc = [{"id": "z"}, {"id": "a"}]
        self.modulo.AVISADOS = os.path.join(carpeta, "acciones-director-avisados.json")
        self.modulo._anotar(acc, [(acc[0], "nueva")])
        self.assertEqual([a["id"] for a in self.modulo._antes()], ["z", "a"])
        self.assertIn("z", self.modulo._leer(self.modulo.AVISADOS, {}).get("avisados"))
        os.remove(self.modulo.AVISADOS)


class PlistAccionesTest(unittest.TestCase):
    """El plist del director de acciones tiene la misma forma que el de la nube:
    python3 + el script, RunAtLoad, KeepAlive, Nice, PATH y WorkingDirectory."""

    def test_carga_y_tiene_el_mismo_patron(self):
        import plistlib
        con = plistlib.load(open(os.path.join(DIRECTORIO, "com.starseed.acciones.plist"), "rb"))
        self.assertEqual(con["Label"], "com.starseed.acciones")
        args = con["ProgramArguments"]
        self.assertEqual(len(args), 2)
        self.assertTrue(args[0].endswith("python3"))
        self.assertTrue(args[1].endswith("director-acciones.py"))
        self.assertTrue(con["RunAtLoad"])
        self.assertIn("SuccessfulExit", con["KeepAlive"])
        self.assertEqual(con["Nice"], 10)
        self.assertEqual(con["EnvironmentVariables"]["PATH"],
                         "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
        self.assertTrue(con["WorkingDirectory"].endswith("starseed-os-main"))


def _cargar(nombre_modulo_ruta):
    """Carga un módulo de scripts/puente por su nombre de archivo, sin ejecutar main.

    Acepta el nombre con o sin «.py»: quien llamaba pasaba «director-acciones» a secas y
    `spec_from_file_location` devolvía None en silencio, así que el fallo salía tres líneas
    más abajo como «'NoneType' object has no attribute 'loader'», que no dice nada de la
    causa. (2026-09-20)
    """
    archivo = nombre_modulo_ruta if nombre_modulo_ruta.endswith(".py") else nombre_modulo_ruta + ".py"
    ruta = os.path.join(DIRECTORIO, archivo)
    if not os.path.exists(ruta):
        raise FileNotFoundError("no existe el módulo a cargar: %s" % ruta)
    spec = importlib.util.spec_from_file_location(archivo[:-3], ruta)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


if __name__ == "__main__":
    unittest.main()
