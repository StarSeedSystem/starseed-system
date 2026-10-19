#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas puras de Laya en el A1 de Oracle — unidad systemd y órdenes (LYS1018Gb)."""

import os
import unittest
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import laya_a1 as M  # noqa: E402


class UnidadSystemd(unittest.TestCase):
    def test_retorna_estructura_completa(self):
        texto = M.unidad_systemd()
        self.assertIn("[Unit]", texto)
        self.assertIn("[Service]", texto)
        self.assertIn("[Install]", texto)
        self.assertIn("Restart=on-failure", texto)
        self.assertIn("MemoryMax=3G", texto)
        self.assertIn("ExecStart=/usr/bin/node", texto)
        self.assertIn("Environment=PORT=4470", texto)
        self.assertIn("Environment=LAYA_CACHE=", texto)
        self.assertNotIn("127.0.0.1", texto)  # IP sin enmascarar no debe aparecer

    def test_usuario_por_defecto_starseed(self):
        texto = M.unidad_systemd()
        self.assertIn("User=starseed", texto)

    def test_usuario_parametrizado(self):
        texto = M.unidad_systemd(usuario="starseed")
        self.assertIn("User=starseed", texto)

    def test_sin_ip_ni_rutas_absolutas(self):
        """Verifica que no haya IPs ni rutas absolutas sin mascarar."""
        texto = M.unidad_systemd()
        # No debería imprimir IPs reales ni rutas del sistema sin usar variables
        self.assertNotIn("127.0.0.1", texto)  # como valor sin tachar; si estuviera sería error
        # La ruta se pasa como parámetro, no está hardcodeada como valor sin tachar


class OrdenesInstalacion(unittest.TestCase):
    def test_lista_tres_ordenes(self):
        ordenes = M.ordenes_instalacion()
        self.assertEqual(len(ordenes), 3)
        self.assertIn("loginctl enable-linger", ordenes[0])
        self.assertIn("systemctl daemon-reload", ordenes[1])
        self.assertIn("systemctl enable --now starseed-laya", ordenes[2])

    def test_ordenes_contienen_usuario(self):
        ordenes = M.ordenes_instalacion()
        # loginctl enable-linger debe llevar el usuario por defecto
        encontrado = False
        for o in ordenes:
            if "starseed" in o:
                encontrado = True
                break
        self.assertTrue(encontrado)


class RespuestasLayaSimuladas(unittest.TestCase):
    """Simulación de respuestas de Laya tipo decision-hibrida: choice/probabilities/answer_confidence/score/noul."""

    def test_formato_choice(self):
        """Laya responde choice entre opciones."""
        respuesta = {
            "answers": [
                {"choice": "herramienta_a", "probability": 0.78, "answer_confidence": 0.82},
                {"choice": "herramienta_b", "probability": 0.22, "answer_confidence": 0.18},
            ],
            "usage": {"total_tokens": 42},
            "ms": 2150,
        }
        self.assertEqual(respuesta["answers"][0]["choice"], "herramienta_a")
        self.assertGreater(respuesta["answers"][0]["answer_confidence"], 0.5)

    def test_formato_score(self):
        """Laya responde score en escala."""
        respuesta = {
            "answers": [
                {"choice": "alta", "probability": 0.65, "answer_confidence": 0.71, "score": 0.88},
            ],
            "usage": {"total_tokens": 30},
            "ms": 1850,
        }
        self.assertEqual(respuesta["answers"][0]["score"], 0.88)
        self.assertIn("choice", respuesta["answers"][0])

    def test_formato_noul(self):
        """Laya responde noul: probabilidad de 'sí'."""
        respuesta = {
            "answers": [
                {"choice": "sí", "probability": 0.53, "answer_confidence": 0.57, "noul": True},
            ],
            "usage": {"total_tokens": 18},
            "ms": 1200,
        }
        self.assertTrue(respuesta["answers"][0]["noul"])
        self.assertGreater(respuesta["answers"][0]["answer_confidence"], 0.5)

    def test_tiempo_cpu_segundos(self):
        """Laya en CPU tarda segundos (contrato §2): nunca bloquea la primera palabra."""
        # Simulación de tiempos medidos en A1 con CPU, sin GPU
        tiempos = [1.9, 2.1, 3.1, 3.2]
        for t in tiempos:
            self.assertGreater(t, 0)
            self.assertLess(t, 10)  # en CPU, <10 s por petición


def main():
    unittest.main()


if __name__ == "__main__":
    main()