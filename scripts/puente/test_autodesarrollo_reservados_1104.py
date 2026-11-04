#!/usr/bin/env python3
"""Pruebas de CTR1104K: «clave» solo cuenta como secreta, no en «paso clave», «punto clave», etc."""
import unittest
import autodesarrollo_decidir as D


def existe(ruta):
    return ruta in {"src/lib/algo.ts", "src/lib/otro.ts"}


class ClaveSoloSecretaTest(unittest.TestCase):
    """«clave» en RESERVADOS/SECRETOS solo debe saltar cuando hable de un secreto real."""

    def test_clave_en_contexto_secreto_salta(self):
        """Estos títulos deben ser «de Alex» porque hablan de claves secretas."""
        secretos = (
            "Rotar la clave de API",
            "Cambiar la clave secreta del servidor",
            "Guardar la clave privada en el entorno",
            "Actualizar la clave de acceso a Supabase",
            "Configurar la clave SSH del despliegue",
            "Renovar el token y la clave de API",
            "La clave del cifrado ha caducado",
        )
        for titulo in secretos:
            p = {"titulo": titulo, "cuerpo": "", "archivos": ["src/lib/algo.ts"]}
            motivo = D.es_de_alex(p)
            self.assertTrue(motivo, f"Debería saltar como secreto: {titulo}")
            self.assertIn("pregunta", motivo, titulo)

    def test_clave_en_contexto_no_secreto_no_salta(self):
        """Estos títulos NO deben ser «de Alex»: «clave» significa «importante/paso fundamental»."""
        no_secretos = (
            "Arreglar el paso clave del orquestador",
            "El punto clave es la latencia",
            "Clave para entender el flujo",
            "Es clave que el test pase",
            "Un paso clave en la migración",
            "Punto clave: no borrar la caché",
            "La clave del asunto es el orden",
            "Identificar la causa clave del fallo",
        )
        for titulo in no_secretos:
            p = {"titulo": titulo, "cuerpo": "", "archivos": ["src/lib/algo.ts"]}
            motivo = D.es_de_alex(p)
            self.assertEqual(motivo, "", f"NO debería saltar (no es secreto): {titulo} -> {motivo}")


if __name__ == "__main__":
    unittest.main()