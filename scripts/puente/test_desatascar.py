#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de desatascar.py — las tres paradas medidas el 2026-09-13."""

import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import desatascar as d


def _hace(minutos, ahora):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora - minutos * 60))


class TestArbolSucio(unittest.TestCase):
    def test_estorbo_sin_seguimiento(self):
        e, t = d.clasificar_sucio(["?? error.log", "?? x.new", "?? .DS_Store"])
        self.assertEqual(e, ["error.log", "x.new", ".DS_Store"])
        self.assertEqual(t, [])

    def test_trabajo_nunca_se_aparta(self):
        e, t = d.clasificar_sucio([" M src/a.ts", "?? src/nuevo.ts", "UU src/c.ts", "A  src/d.ts"])
        self.assertEqual(e, [])
        self.assertEqual(len(t), 4)

    def test_lineas_basura_se_ignoran(self):
        e, t = d.clasificar_sucio(["", "  ", None, "??"])
        self.assertEqual((e, t), ([], []))


class TestPuertas(unittest.TestCase):
    def setUp(self):
        self.ahora = time.time()

    def test_bloqueante_madura_se_rechaza(self):
        p = {"A": {"estado": "esperando_aprobacion", "revisor": "bloqueante", "t": _hace(60, self.ahora)}}
        self.assertEqual([x[0] for x in d.puertas_a_rechazar(p, self.ahora)], ["A"])

    def test_alcance_incompleto_ya_no_se_rechaza_solo_por_eso(self):
        """(2026-09-21) Cambio de politica: ver test_alcance_parcial.py.

        Tirar una rama con las cuatro puertas en verde porque falta un archivo
        costo 2 h 30 min de agentes en una sola noche. Ahora se integra lo hecho
        y lo que falta sale como tarea de seguimiento.
        """
        p = {"C": {"estado": "esperando_aprobacion", "revisor": "respondio",
                   "faltan": ["x.py"], "t": _hace(60, self.ahora)}}
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])
        _, parciales = d.clasificar_puertas(p, self.ahora, {"C": ["x.py", "y.py"]})
        self.assertEqual([x[0] for x in parciales], ["C"])

    def test_alcance_vacio_del_todo_si_se_rechaza(self):
        """No tocar NINGUN archivo declarado es otra cosa: hizo otro trabajo."""
        p = {"C": {"estado": "esperando_aprobacion", "revisor": "respondio",
                   "faltan": ["x.py"], "t": _hace(60, self.ahora)}}
        rech, _ = d.clasificar_puertas(p, self.ahora, {"C": ["x.py"]})
        self.assertEqual([x[0] for x in rech], ["C"])

    def test_puerta_en_verde_no_se_toca(self):
        p = {"B": {"estado": "esperando_aprobacion", "revisor": "respondio",
                   "motivo_vb": "pedido por la cola", "t": _hace(60, self.ahora)}}
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])

    def test_recien_llegada_no_se_toca(self):
        p = {"D": {"estado": "esperando_aprobacion", "revisor": "bloqueante", "t": _hace(1, self.ahora)}}
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])

    def test_otros_estados_no_entran(self):
        p = {"E": {"estado": "pendiente", "revisor": "bloqueante", "t": _hace(60, self.ahora)}}
        self.assertEqual(d.puertas_a_rechazar(p, self.ahora), [])


class TestOrquestadorAtascado(unittest.TestCase):
    def test_vivo_con_trabajadores_no_esta_atascado(self):
        self.assertFalse(d.orquestador_atascado(True, 3, 999)[0])

    def test_vivo_sin_trabajadores_y_quieto_si(self):
        ok, razon = d.orquestador_atascado(True, 0, 58)
        self.assertTrue(ok)
        self.assertIn("58", razon)

    def test_vivo_sin_trabajadores_pero_recien_no(self):
        self.assertFalse(d.orquestador_atascado(True, 0, 5)[0])

    def test_parado_no_es_asunto_de_esta_funcion(self):
        self.assertFalse(d.orquestador_atascado(False, 0, 999)[0])


class TestColgados(unittest.TestCase):
    def test_recien_arrancado_no_se_mata(self):
        ahora = 100000.0
        self.assertEqual(d.colgados_a_matar([{"pid": 9, "ultimo_byte": ahora - 60}], ahora), [])

    def test_media_hora_sin_bytes_se_mata(self):
        ahora = 100000.0
        self.assertEqual(d.colgados_a_matar([{"pid": 9, "ultimo_byte": ahora - 3600}], ahora), [9])

    def test_pid_invalido_y_propio_nunca(self):
        ahora = 100000.0
        procesos = [{"pid": 1, "ultimo_byte": 1}, {"pid": 0, "ultimo_byte": 1},
                    {"pid": 7, "ultimo_byte": 1, "propio": True}]
        self.assertEqual(d.colgados_a_matar(procesos, ahora), [])

    def test_sin_ultimo_byte_cae_a_inicio(self):
        ahora = 100000.0
        self.assertEqual(d.colgados_a_matar([{"pid": 5, "ultimo_byte": 0, "inicio": ahora - 7200}], ahora), [5])


class TestRelojDeAvance(unittest.TestCase):
    def test_cuenta_desde_que_deja_de_cambiar(self):
        import tempfile
        ruta = os.path.join(tempfile.mkdtemp(), "estado.json")
        ahora = 100000.0
        p = {"A": {"estado": "commit"}}
        self.assertEqual(d.minutos_sin_integrar(p, ahora, ruta), 0.0)
        self.assertAlmostEqual(d.minutos_sin_integrar(p, ahora + 600, ruta), 10.0, places=1)
        p["B"] = {"estado": "commit"}
        self.assertEqual(d.minutos_sin_integrar(p, ahora + 900, ruta), 0.0)


if __name__ == "__main__":
    unittest.main()
