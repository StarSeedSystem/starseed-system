#!/usr/bin/env python3
"""Pruebas para CTR1104K: 'clave' en RESERVADOS solo cuenta como secreto, no como 'importante'."""
import unittest
import autodesarrollo_decidir as D

EXISTEN = {"src/lib/algo.ts"}

def existe(ruta):
    return ruta in EXISTEN

def propuesta(**cambios):
    base = {
        "id": "P1", "titulo": "Arreglar el lector de archivos", "cuerpo": "",
        "archivos": ["src/lib/algo.ts"], "verificacion": "verificado",
    }
    base.update(cambios)
    return base


class ClaveReservadosTest(unittest.TestCase):
    """'clave' solo debe activar es_de_alex cuando es un secreto (clave de API, secreta, privada,
    de acceso, SSH, token, contraseña), NO cuando significa 'importante' (paso clave, punto clave,
    clave para, es clave)."""

    def test_clave_como_secreto_es_de_alex(self):
        """Casos donde 'clave' es un secreto → debe ser de Alex."""
        secretos = (
            "Rotar la clave de API",
            "Cambiar la clave secreta del servidor",
            "Actualizar la clave privada SSH",
            "Proteger la clave de acceso a la base de datos",
            "Mover la clave SSH al entorno",
            "Guardar la clave en el entorno",
            "Rotar la contraseña de la cuenta",
        )
        for titulo in secretos:
            with self.subTest(titulo=titulo):
                motivo = D.es_de_alex({"titulo": titulo, "cuerpo": ""})
                self.assertTrue(motivo, f"Debería ser de Alex: {titulo}")
                self.assertIn("pregunta", motivo)

    def test_clave_como_importante_NO_es_de_alex(self):
        """Casos donde 'clave' significa 'importante' → NO debe ser de Alex."""
        importantes = (
            "Arreglar un paso clave del proceso",
            "Identificar el punto clave del fallo",
            "Esta configuración es clave para el rendimiento",
            "El paso clave es validar la entrada",
            "Punto clave: no bloquear el hilo principal",
            "Clave para la estabilidad: reintentar con backoff",
            "Es clave medir la latencia",
        )
        for titulo in importantes:
            with self.subTest(titulo=titulo):
                motivo = D.es_de_alex({"titulo": titulo, "cuerpo": ""})
                self.assertEqual(motivo, "", f"NO debería ser de Alex: {titulo}")

    def test_utilidad_con_clave_importante_sigue_siendou_accionable(self):
        """Una propuesta con 'clave' como 'importante' debe seguir siendo accionable si cumple el resto."""
        p = propuesta(titulo="Arreglar el paso clave del proceso", archivos=["src/lib/algo.ts"])
        valor, motivo = D.utilidad(p, existe)
        self.assertGreater(valor, 0.0, f"Debería ser accionable: {motivo}")
        self.assertIn("accionable", motivo)


if __name__ == "__main__":
    unittest.main()