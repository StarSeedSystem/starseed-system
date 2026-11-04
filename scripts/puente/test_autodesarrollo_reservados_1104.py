#!/usr/bin/env python3
"""Pruebas CTR1104K: «clave» en RESERVADOS solo cuenta como secreto (clave de API, secreta, privada, de acceso, SSH, token, contraseña)
y NO en «paso clave», «punto clave», «clave para», «es clave»."""
import unittest
import autodesarrollo_decidir as D

EXISTEN = {"src/lib/algo.ts"}

def existe(ruta):
    return ruta in EXISTEN

def propuesta(**cambios):
    base = {
        "id": "P1", "titulo": "Arreglar el lector", "cuerpo": "",
        "archivos": ["src/lib/algo.ts"], "verificacion": "verificado",
    }
    base.update(cambios)
    return base

class ClaveReservadosTest(unittest.TestCase):
    """CTR1104K: «clave» solo es de Alex cuando habla de secretos."""

    def test_clave_como_secreto_es_de_alex(self):
        """Estos títulos con 'clave' referida a secretos deben ir a pregunta."""
        secretos = (
            "Cambiar la clave de API",
            "Rotar la clave secreta",
            "Actualizar la clave privada",
            "Configurar la clave de acceso",
            "Generar clave SSH nueva",
            "Guardar la clave API en el entorno",
            "Mover la clave de la base de datos",
            "Renovar la clave de cifrado",
        )
        for titulo in secretos:
            p = propuesta(titulo=titulo)
            motivo = D.es_de_alex(p)
            self.assertTrue(motivo, f"Debe ser de Alex: {titulo}")
            self.assertIn("pregunta", motivo, titulo)

    def test_clave_como_importante_NO_es_de_alex(self):
        """Estos títulos con 'clave' significando 'importante' NO deben ir a pregunta."""
        importantes = (
            "Arreglar el paso clave del orquestador",
            "Identificar el punto clave del fallo",
            "Este parámetro es clave para el rendimiento",
            "La clave está en el orden de las operaciones",
            "Un paso clave para la estabilidad",
            "Punto clave: no bloquear el bucle principal",
            "Clave para entender el flujo",
            "Es clave que exista el archivo",
        )
        for titulo in importantes:
            p = propuesta(titulo=titulo)
            motivo = D.es_de_alex(p)
            self.assertEqual(motivo, "", f"NO debe ser de Alex: {titulo} → {motivo}")

    def test_arreglar_ciclo_vida_orquestador_NO_es_pregunta(self):
        """El ejemplo del documento: 'Arreglar el ciclo de vida del orquestador' no debe ir a pregunta por 'clave'."""
        p = propuesta(titulo="Arreglar el ciclo de vida del orquestador")
        motivo = D.es_de_alex(p)
        self.assertEqual(motivo, "", f"No debe ser de Alex: {motivo}")

    def test_otras_palabras_reservadas_siguen_funcionando(self):
        """Verificar que el resto de RESERVADOS sigue funcionando."""
        reservadas = (
            "Publicar el paquete",
            "Desplegar en Vercel",
            "Cambiar la contraseña",
            "Actualizar la credencial",
            "Decisión de Alex",
            "Que Alex decida",
            "Preguntar a Alex",
            "Avisar a Alex",
            "Elección de Alex",
        )
        for titulo in reservadas:
            p = propuesta(titulo=titulo)
            motivo = D.es_de_alex(p)
            self.assertTrue(motivo, f"Debe ser de Alex: {titulo}")
            self.assertIn("pregunta", motivo, titulo)


if __name__ == "__main__":
    unittest.main()