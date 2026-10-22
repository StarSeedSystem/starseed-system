# -*- coding: utf-8 -*-
"""Pruebas de la parte del MEDIO en «alimentar la cola viva» (CAP1018Ab, parte 2).

El latido publica `salud.cola_viva` (trabajando, esperando, libres, sin_nuevas_s) y la orden
`repartir` con `modo: "alimentar"` añade tareas a SU cola viva de forma atómica, sin repetir ids
y JAMÁS si aquí no hay orquestador vivo (UN orquestador por medio). Sin red: `ps` simulado.
"""
import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_medio as M  # noqa: E402


def ps(cola="cola-t", workers=2, pid=9001):
    return ["%d /usr/bin/python3 /x/enjambre/starseed-enjambre.py "
            "/r/starseed_memory_root/olas/%s.json --workers %d --localhost 1" % (pid, cola, workers)]


class Alimentar(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.olas = os.path.join(self.d, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        self.cola = os.path.join(self.olas, "cola-t.json")
        with open(self.cola, "w") as f:
            json.dump([{"id": "A"}], f)
        self.lineas = ps()

    def alimentar(self, args, lineas=None):
        return M.alimentar_cola_viva(args, self.d, self.lineas if lineas is None else lineas)

    def contenido(self):
        with open(self.cola) as f:
            return json.load(f)

    def test_libre_anade_al_final(self):
        estado, texto = self.alimentar({"_tareas": [{"id": "CAP1"}, {"id": "CAP2"}], "tope": 8})
        self.assertEqual(estado, "hecha")
        self.assertIn("modo alimentar", texto)
        lista = self.contenido()
        self.assertEqual([t["id"] for t in lista], ["A", "CAP1", "CAP2"])
        self.assertEqual(lista[0], {"id": "A"})

    def test_respeta_el_tope(self):
        self.alimentar({"_tareas": [{"id": "T%d" % i} for i in range(4)], "tope": 2})
        self.assertEqual([t["id"] for t in self.contenido()], ["A", "T0", "T1"])

    def test_ocupado_nada_fuera_orquestador(self):
        estado, texto = self.alimentar({"_tareas": [{"id": "CAP1"}]}, lineas=[])
        self.assertEqual(estado, "nada")
        self.assertIn("orquestador", texto)
        self.assertEqual(self.contenido(), [{"id": "A"}])

    def test_sin_duplicados(self):
        self.alimentar({"_tareas": [{"id": "CAP1"}]})
        estado, _ = self.alimentar({"_tareas": [{"id": "CAP1"}, {"id": "CAP2"}]})
        self.assertEqual(estado, "hecha")
        self.assertEqual([t["id"] for t in self.contenido()], ["A", "CAP1", "CAP2"])
        estado, texto = self.alimentar({"_tareas": [{"id": "CAP1"}]})
        self.assertEqual(estado, "nada")
        self.assertIn("nada que alimentar", texto)

    def test_sin_duplicados_con_el_progreso(self):
        with open(os.path.join(self.olas, "progreso.json"), "w") as f:
            json.dump({"CAP1": {"estado": "hecho"}}, f)
        estado, _ = self.alimentar({"_tareas": [{"id": "CAP1"}]})
        self.assertEqual(estado, "nada")
        self.assertEqual(self.contenido(), [{"id": "A"}])

    def test_ids_invalidos_no_entran(self):
        estado, _ = self.alimentar({"_tareas": [{"id": ""}, "x", {"id": "CAP1"}], "tope": 3})
        self.assertEqual(estado, "hecha")
        self.assertEqual([t["id"] for t in self.contenido()], ["A", "CAP1"])

    def test_forma_dict_de_la_cola_se_conserva(self):
        with open(self.cola, "w") as f:
            json.dump({"tareas": [{"id": "A"}]}, f)
        self.alimentar({"_tareas": [{"id": "CAP1"}]})
        d = self.contenido()
        self.assertEqual(d, {"tareas": [{"id": "A"}, {"id": "CAP1"}]})

    def test_sin_tareas_utilizables_nada(self):
        estado, texto = self.alimentar({})
        self.assertEqual(estado, "nada")
        self.assertEqual(self.contenido(), [{"id": "A"}])

    def test_via_ejecutar(self):
        with mock.patch.object(M, "lineas_ps", return_value=self.lineas):
            estado, _ = M.ejecutar({"accion": "repartir", "args": {"modo": "alimentar", "_tareas": [{"id": "CAP1"}]}},
                                   "neurona", self.d, False)
        self.assertEqual(estado, "hecha")
        self.assertEqual([t["id"] for t in self.contenido()], ["A", "CAP1"])

    def test_via_ejecutar_sin_modo_no_alimenta(self):
        with mock.patch.object(M, "lineas_ps", return_value=self.lineas):
            estado, texto = M.ejecutar({"accion": "repartir", "args": {"_tareas": [{"id": "CAP1"}]}},
                                       "neurona", self.d, False)
        self.assertEqual(estado, "nada")
        self.assertIn("desconocida", texto)


class Resumen(unittest.TestCase):
    def test_libre(self):
        datos = {"tareas": {"A1": {"fase": "escribiendo"}, "A2": {"fase": "tsc"},
                            "A3": {"fase": "esperando proveedor"}, "A4": {"fase": "hecho"}}}
        self.assertEqual(M.resumen_cola_viva(datos, 3, 700.0),
                         {"trabajando": 2, "esperando": 1, "libres": 1, "sin_nuevas_s": 700.0})

    def test_ocupado_pila_de_trabajo(self):
        datos = {"tareas": {"A%d" % i: {"fase": "integrando"} for i in range(3)}}
        self.assertEqual(M.resumen_cola_viva(datos, 2, None)["libres"], 0)

    def test_sin_campo_nuevo_compatibilidad(self):
        self.assertEqual(M.resumen_cola_viva(None, 2, None)["trabajando"], 0)
        self.assertEqual(M.resumen_cola_viva({"tareas": "no"}, 2, None)["esperando"], 0)


class Latido(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.olas = os.path.join(self.d, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        with open(os.path.join(self.olas, "cola-t.json"), "w") as f:
            json.dump([{"id": "A"}], f)
        with open(os.path.join(self.olas, "latidos-cola-t.json"), "w") as f:
            json.dump({"tareas": {"A": {"fase": "esperando proveedor"}}}, f)
        self.env = dict(os.environ, STARSEED_ROOT=self.d)

    def test_resumen_discreto_del_orquestador(self):
        ahora = time.time() + 10.0
        with mock.patch.object(M, "lineas_ps", return_value=ps()), mock.patch.dict(os.environ, self.env):
            r = M.resumen_cola_viva_de(self.d, ps(), ahora)
        self.assertEqual(r["esperando"], 1)
        self.assertEqual(r["trabajando"], 0)
        self.assertEqual(r["libres"], 2)
        self.assertGreaterEqual(r["sin_nuevas_s"], 0.0)

    def test_sin_orquestador_vivo_no_afirma_nada(self):
        with mock.patch.object(M, "lineas_ps", return_value=[]), mock.patch.dict(os.environ, self.env):
            m = M.medir("real", time.time())
        self.assertIsNone(m["salud"]["cola_viva"])

    def test_el_latido_publica_el_resumen(self):
        ahora = time.time() + 10.0
        with mock.patch.object(M, "lineas_ps", return_value=ps()), mock.patch.dict(os.environ, self.env, clear=False):
            m = M.medir("real", ahora)
        self.assertEqual(m["salud"]["cola_viva"], M.resumen_cola_viva_de(self.d, ps(), ahora))


if __name__ == "__main__":
    unittest.main()
