# -*- coding: utf-8 -*-
"""Pruebas del orden de la cola vigente (tarea p321G, 2026-09-14).

Pedido de Alex: cuando un trabajador queda libre, la siguiente tarea se elige
por el ORDEN DE LA COLA VIGENTE, releyendo el archivo solo si cambió el mtime,
y sin tocar jamás lo que ya corre.

Cubre:
  - fusionar_cola ordena por la cola vigente (la primera vigente es la elegida).
  - Si el archivo cambia (mtime nuevo), se relee y la nueva tarea entra por su sitio.
  - Si el mtime no cambió, NO se abre el archivo (parche de `open` que explotaría).
  - Una tarea en marcha (`ocupadas`) nunca vuelve a `pendientes` ni se interrumpe.
  - Una tarea que desaparece de la cola sale de pendientes sin drama.

`releer_cola_si_cambio` toca disco (un archivo temporal); `fusionar_cola` es
pura. El módulo se importa con importlib por los guiones del nombre, como en
test_retiros.py.
"""

import importlib.util
import json
import os
import sys
import tempfile
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


def escribir_cola(ruta, tareas):
    """Escribe el archivo de cola y lo deja con un mtime distinto al anterior."""
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"tareas": tareas}, f)
    # +1 s: el mtime tiene granularidad de segundos en algunos FS y si no se
    # distingue, la relee detectaría «sin cambios» y el test no probaría nada.
    st = os.stat(ruta)
    os.utime(ruta, (st.st_atime, st.st_mtime + 1))


class FusionarColaTest(unittest.TestCase):
    """La fusión pura: orden vigente, altas, bajas y respeto a lo que ya corre."""

    def test_siguiente_es_la_primera_de_la_cola_vigente(self):
        pendientes = {"c": {"id": "c"}, "b": {"id": "b"}, "a": {"id": "a"}}
        estado = {
            "tareas": {"a": {"id": "a"}, "b": {"id": "b"}, "c": {"id": "c"}},
            "orden": ["b", "a", "c"],
        }
        enjambre.fusionar_cola(pendientes, estado, set())
        self.assertEqual(list(pendientes), ["b", "a", "c"])

    def test_tarea_nueva_entra_por_su_sitio(self):
        pendientes = {"c": {"id": "c"}}
        estado = {
            "tareas": {
                "nueva": {"id": "nueva"},
                "c": {"id": "c"},
                "z": {"id": "z"},
            },
            "orden": ["nueva", "c", "z"],
        }
        entradas = enjambre.fusionar_cola(pendientes, estado, set())
        self.assertEqual(list(pendientes), ["nueva", "c", "z"])
        self.assertEqual(sorted(entradas), ["nueva", "z"])

    def test_la_que_ya_no_esta_simplemente_no_se_coge(self):
        pendientes = {"vieja": {"id": "vieja"}, "sigue": {"id": "sigue"}}
        estado = {"tareas": {"sigue": {"id": "sigue"}}, "orden": ["sigue"]}
        enjambre.fusionar_cola(pendientes, estado, set())
        self.assertEqual(list(pendientes), ["sigue"])

    def test_en_marcha_nunca_se_interrumpe_ni_vuelve_a_pendientes(self):
        # «En curso» figura en la cola con más prioridad: no debe duplicarse.
        pendientes = {"b": {"id": "b"}}
        estado = {
            "tareas": {"curso": {"id": "curso"}, "b": {"id": "b"}},
            "orden": ["curso", "b"],
        }
        entradas = enjambre.fusionar_cola(pendientes, estado, {"curso"})
        self.assertEqual(list(pendientes), ["b"])
        self.assertEqual(entradas, [])


class ReleerColaTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.ruta = os.path.join(self._tmp.name, "cola-prueba.json")
        escribir_cola(self.ruta, [{"id": "a"}, {"id": "b"}])

    def tearDown(self):
        self._tmp.cleanup()

    def test_si_cambio_relee_y_la_nueva_entra(self):
        estado = {"mtime": None, "tareas": {}, "orden": []}
        estado, releida = enjambre.releer_cola_si_cambio(self.ruta, estado)
        self.assertTrue(releida)
        self.assertEqual(estado["orden"], ["a", "b"])

        escribir_cola(self.ruta, [{"id": "priori"}, {"id": "b"}, {"id": "a"}])
        estado, releida = enjambre.releer_cola_si_cambio(self.ruta, estado)
        self.assertTrue(releida)
        self.assertEqual(estado["orden"], ["priori", "b", "a"])

        pendientes = {"a": {"id": "a"}, "b": {"id": "b"}}
        enjambre.fusionar_cola(pendientes, estado, set())
        self.assertEqual(list(pendientes), ["priori", "b", "a"])

    def test_si_no_cambio_no_se_abre_el_archivo(self):
        estado = {"mtime": None, "tareas": {}, "orden": []}
        estado, _ = enjambre.releer_cola_si_cambio(self.ruta, estado)
        foto = dict(estado)

        # Si la función intentara abrir el archivo con el mismo mtime, falla:
        import builtins

        original = builtins.open

        def prohibido(*args, **kwargs):
            if args and args[0] == self.ruta:
                raise AssertionError("abrió el archivo sin que cambiara el mtime")
            return original(*args, **kwargs)

        builtins.open = prohibido
        try:
            estado2, releida = enjambre.releer_cola_si_cambio(self.ruta, estado)
        finally:
            builtins.open = original
        self.assertFalse(releida)
        self.assertEqual(estado2["orden"], foto["orden"])

    def test_archivo_ausente_no_toca_el_estado(self):
        estado = {"mtime": 1.0, "tareas": {"a": {"id": "a"}}, "orden": ["a"]}
        estado, releida = enjambre.releer_cola_si_cambio(
            os.path.join(self._tmp.name, "no-existe.json"), estado
        )
        self.assertFalse(releida)
        self.assertEqual(estado["orden"], ["a"])


if __name__ == "__main__":
    unittest.main()
