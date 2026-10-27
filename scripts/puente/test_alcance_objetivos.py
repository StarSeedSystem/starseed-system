#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import stat
import tempfile
import unittest

import alcance_objetivos


class TestAlcanceObjetivos(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def test_campos_prohibidos(self):
        obj = {
            "id": "obj-123",
            "nombre_publico": "Ana",
            "tipo": "persona",
            "categoria": "desarrollador",
            "nivel": "medio",
            "afinidad": 100,
            "urls_oficiales": ["https://example.com"],
            "canal_contacto": {"medio": "web", "valor": "https://example.com/contacto", "fuente_url": "https://example.com"},
            "estado": "pendiente",
            "fechas": {},
            "salud": "algo",
        }
        with self.assertRaises(ValueError):
            alcance_objetivos.validar_objetivo(obj)

    def test_hash(self):
        h = alcance_objetivos.suprimir(correo_o_dominio_nombre="test@example.com", home=self.tmpdir)
        self.assertIsInstance(h, str)
        self.assertEqual(len(h), 64)

    def test_cuotas(self):
        obj = {"id": "obj-1", "nombre_publico": "X", "tipo": "proyecto", "categoria": "proyecto-afin", "nivel": "medio", "afinidad": 50, "urls_oficiales": ["https://x.com"], "canal_contacto": {"medio": "web", "valor": "https://x.com/contacto", "fuente_url": "https://x.com"}, "estado": "pendiente", "fechas": {}}
        registro = {"contactos_hoy": 5}
        self.assertFalse(alcance_objetivos.puede_contactar(obj, registro, 1000000, tope_diario=5, home=self.tmpdir))

    def test_pausas(self):
        obj = {"id": "obj-2", "nombre_publico": "Y", "tipo": "persona", "categoria": "desarrollador", "nivel": "medio", "afinidad": 10, "urls_oficiales": ["https://y.com"], "canal_contacto": {"medio": "web", "valor": "https://y.com/contacto", "fuente_url": "https://y.com"}, "estado": "pendiente", "fechas": {}}
        # 90 días de pausa tras rechazo de Alex
        registro = {"rechazo_alex": 1000000 - 10 * 86400}
        self.assertFalse(alcance_objetivos.puede_contactar(obj, registro, 1000000, tope_diario=5, home=self.tmpdir))
        # 180 tras «no» del destinatario
        registro2 = {"no_destinatario": 1000000 - 100 * 86400}
        self.assertFalse(alcance_objetivos.puede_contactar(obj, registro2, 1000000, tope_diario=5, home=self.tmpdir))

    def test_permisos_de_archivo_y_carpeta(self):
        alcance_objetivos.asegurar_carpeta(home=self.tmpdir)
        carpeta = alcance_objetivos.carpeta_alcance(home=self.tmpdir)
        st_carpeta = os.stat(carpeta)
        self.assertEqual(st_carpeta.st_mode & 0o777, 0o700)
        alcance_objetivos.suprimir(correo_o_dominio_nombre="x@y.com", home=self.tmpdir)
        lista = os.path.join(carpeta, "supresion.json")
        self.assertTrue(os.path.exists(lista))
        st_archivo = os.stat(lista)
        self.assertEqual(st_archivo.st_mode & 0o777, 0o600)

    def test_objetivo_sin_nivel_alto(self):
        obj = {
            "id": "obj-sin-nivel",
            "nombre_publico": "Z",
            "tipo": "persona",
            "categoria": "desarrollador",
            "afinidad": 50,
            "urls_oficiales": ["https://z.com"],
            "canal_contacto": {"medio": "web", "valor": "https://z.com/contacto", "fuente_url": "https://z.com"},
            "estado": "pendiente",
            "fechas": {},
        }
        res = alcance_objetivos.validar_objetivo(obj)
        self.assertEqual(res["nivel"], "alto")
        # alto perfil → nunca automático
        self.assertFalse(alcance_objetivos.puede_contactar(res, {}, 1000000, tope_diario=5, home=self.tmpdir))


if __name__ == "__main__":
    unittest.main()
