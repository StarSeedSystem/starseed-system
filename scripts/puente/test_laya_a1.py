#!/usr/bin/env python3
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import laya_a1

class TestLayaA1(unittest.TestCase):
    def test_unidad_systemd(self):
        usuario = "testuser"
        ruta_servicio = "/home/testuser/servidor-laya.mjs"
        result = laya_a1.unidad_systemd(usuario, ruta_servicio)
        self.assertIn("[Unit]", result)
        self.assertIn("Description=Laya Service", result)
        self.assertIn("After=network.target", result)
        self.assertIn("[Service]", result)
        self.assertIn("Type=simple", result)
        self.assertIn(f"ExecStart={ruta_servicio}", result)
        self.assertIn("Restart=on-failure", result)
        self.assertIn("MemoryMax=3G", result)
        self.assertIn("Environment=LAYA_HOST=127.0.0.1", result)
        self.assertIn("Environment=LAYA_CACHE=/home/testuser/.laya_cache", result)
        self.assertIn("[Install]", result)
        self.assertIn("WantedBy=default.target", result)

    def test_ordenes_instalacion(self):
        result = laya_a1.ordenes_instalacion()
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0], "loginctl enable-linger starseed")
        self.assertEqual(result[1], "systemd --user daemon-reload")
        self.assertEqual(result[2], "systemd --user enable --now layas.service")

if __name__ == "__main__":
    unittest.main()