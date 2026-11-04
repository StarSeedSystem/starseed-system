#!/usr/bin/env python3
"""Pruebas para CTR1104K: «clave» solo cuenta como secreto, no como «importante»."""
import unittest
import autodesarrollo_decidir as D

class ClaveContextoTest(unittest.TestCase):
    """«clave» solo debe detectar secretos, no «paso clave», «punto clave», etc."""

    def _es_alex(self, texto):
        return bool(D.es_de_alex({"titulo": texto, "cuerpo": ""}))

    def test_clave_como_secreto_si(self):
        casos = [
            "Cambiar la clave de API",
            "Renovar la clave secreta del servidor",
            "Actualizar la clave privada",
            "Mover la clave de acceso de Supabase",
            "Generar una clave SSH nueva",
            "Guardar la contraseña",
            "Rotar el token de acceso",
            "Mover GITHUB_TOKEN al servidor",
        ]
        for t in casos:
            with self.subTest(t=t):
                self.assertTrue(self._es_alex(t), f"Debe ser de Alex: {t}")

    def test_clave_como_importante_no(self):
        casos = [
            "Un paso clave en el proceso",
            "Punto clave de la arquitectura",
            "Clave para entender el sistema",
            "Es clave que funcione",
            "Identificar el paso clave",
            "Arreglar el ciclo de vida del orquestador",
        ]
        for t in casos:
            with self.subTest(t=t):
                self.assertFalse(self._es_alex(t), f"No debe ser de Alex: {t}")

    def test_otros_reservados_siguen_funcionando(self):
        for t in (
            "Publicar el paquete",
            "Comprar un dominio",
            "Crear cuentas nuevas",
            "Que Alex decida el diseño",
        ):
            self.assertTrue(self._es_alex(t), t)

    def test_que_no_es_alex_sigue_libre(self):
        for t in (
            "Arreglar el lector de archivos",
            "Optimizar el rendimiento",
            "Documentar la API",
        ):
            self.assertFalse(self._es_alex(t), t)

if __name__ == "__main__":
    unittest.main()
