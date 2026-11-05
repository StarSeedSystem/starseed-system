#!/usr/bin/env python3
"""CTR1104K · 1104C: «clave» en RESERVADOS debe ser secreto, no sinónimo de 'importante'.

Según contract §3 de architecture/imaginacion-calidad.md:
«clave» en RESERVADOS también significa «importante» («un paso clave»). 
Haz que «clave» solo cuente cuando hable de un secreto 
(clave de API, secreta, privada, de acceso, SSH, token, contraseña) 
y no en «paso clave», «punto clave», «clave para», «es clave».
"""
import unittest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autodesarrollo_decidir as D

EXISTEN = {
    "src/lib/algo.ts", "src/lib/otro.ts", "docs/x.md", "src/ai/astraura/router.ts",
    "src/lib/nucleo/x.ts", "supabase/migrations/1.sql", "src/lib/identidad.ts",
    "src/lib/sharing/access.ts", ".github/workflows/x.yml", "scripts/puente/publicar.py",
}

def existe(ruta):
    return ruta in EXISTEN

def propuesta(**cambios):
    base = {
        "id": "P1", "titulo": "Arreglar el lector de archivos", "cuerpo": "",
        "archivos": ["src/lib/algo.ts"], "verificacion": "verificado",
    }
    base.update(cambios)
    return base

class ClaveReservada(unittest.TestCase):
    """CTR1104K: 'clave' como secreto vs. 'clave' como sinónimo de importante."""

    def test_clave_secretas_van_a_pregunta(self):
        """'clave' como secreto (API, access, token, SSH, password) → pregunta."""
        casos_secretas = [
            "Cambiar la clave de API del proyecto",
            "Guardar la clave secreta en el entorno",
            "Mover la clave privada del servidor",
            "Configurar la clave SSH para el deploy",
            "Rotar la clave de acceso a Supabase",
            "Guardar una clave de credencial en .env",
            "Actualizar la clave de personal access token",
            "La clave del certificado SSL",
            "Claves JWT firmadas",
        ]
        for titulo in casos_secretas:
            p = propuesta(titulo=titulo)
            motivo = D.es_de_alex(p)
            self.assertIn("clave", motivo.lower(), f"debe mencionar 'clave' en: {titulo}")
            self.assertIn("pregunta", motivo.lower(), f"debe decir 'pregunta' en: {titulo}")

    def test_paso_clave_no_es_pregunta(self):
        """'un paso clave', 'punto clave', 'clave para', 'es clave' → no pregunta."""
        casos_no_secretos = [
            "Arreglar el ciclo de vida del orquestador: un paso clave",
            "Un punto clave del medidor de memoria",
            "La clave para la sincronización de neuronas",
            "Es clave para la gobernanza del OS",
            "Una clave estratégica de la ola 1104",
            "La clave conceptual del enjambre",
            "Paso clave: validar los tipos",
            "Punto clave del algoritmo de filtro",
            "La clave en el diseño del dock",
            "Clave para la estabilidad del sistema",
        ]
        for titulo in casos_no_secretos:
            p = propuesta(titulo=titulo)
            motivo = D.es_de_alex(p)
            self.assertNotEqual(motivo, "", f"debe ser accionable en: {titulo}", (motivo, titulo))

    def test_clave_en_cuerpo_tambien(self):
        """'clave' como secreto en el cuerpo también → pregunta."""
        p = propuesta(
            titulo="Configurar el sistema de archivos",
            cuerpo="Necesito una clave de acceso a la base de datos para migrar los datos."
        )
        motivo = D.es_de_alex(p)
        self.assertIn("clave", motivo.lower())
        self.assertIn("pregunta", motivo.lower())

    def test_clave_en_archivos_no_es_secreto(self):
        """'clave' en nombres de archivo como referencia → no pregunta (no es secreto escrito)."""
        p = propuesta(
            titulo="Documentar la clave del proyecto en la Guía del Desarrollador",
            archivos=["docs/guia-claves.md"],
        )
        motivo = D.es_de_alex(p)
        self.assertNotEqual(motivo, "", f"debe ser accionable (solo menciona clave como referencia)", (motivo))

    def test_neon_sin_sentido_sin_clave(self):
        """Optimización NEON sin 'clave' como secreto sigue siendo accionable."""
        p = propuesta(
            titulo="Optimización ARM NEON para src/lib/voz/kernels.ts",
            archivos=["src/lib/voz/kernels.ts"],
        )
        motivo = D.es_de_alex(p)
        self.assertNotEqual(motivo, "", f"debe ser accionable (no es clave secreta): {motivo}")

    def test_clave_y_credencial_juntos(self):
        """Cuando hay clave Y credencial, es de Alex."""
        p = propuesta(
            titulo="Guardar la clave de API y credencial en .env.production",
        )
        motivo = D.es_de_alex(p)
        self.assertNotIn("clave", motivo.lower(), "solo debería mencionar credencial, no clave")

if __name__ == "__main__":
    unittest.main()