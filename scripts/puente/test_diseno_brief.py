"""
Pruebas unitarias para diseno_brief.py (contrato §3 de architecture/director-diseno.md).
"""

import os
import shutil
import tempfile
import unittest

from scripts.puente.diseno_brief import (
    brief,
    cargar_memoria,
    es_de_interfaz,
    identidad_de,
    parsear_identidades,
)

IDENTIDADES_PRUEBA = {
    "Mando": "Cristal, oscuro, tokens mando-cristal.css.",
    "Café": "Pergamino y terracota #C05C3B, Fraunces + Space Mono.",
    "StarSeed OS/Nexus": "Trinity: Zenith, Creation, Logic, Anchor.",
}

MEMORIA_PRUEBA = {
    "identidades": "\n".join("## " + n + "\n" + f for n, f in IDENTIDADES_PRUEBA.items()),
    "armonia": "# Armonía\n- Escala tipográfica φ (1.618).\n- Espaciado Fibonacci.",
    "referencias": "# Referencias\n- 21st.dev\n- DESIGN.md\n- Awwwards",
}


class TestDisenoBrief(unittest.TestCase):
    """Batería de pruebas del brief de diseño."""

    def test_tsx_es_de_interfaz(self):
        tarea = {"titulo": "Botón", "archivos": ["src/components/ui/boton.tsx"]}
        self.assertTrue(es_de_interfaz(tarea))

    def test_py_no_es_de_interfaz(self):
        tarea = {"titulo": "Script", "archivos": ["scripts/puente/foo.py"]}
        self.assertFalse(es_de_interfaz(tarea))

    def test_identidad_mando(self):
        tarea = {"titulo": "Panel del Mando", "archivos": ["src/components/mando/panel.tsx"]}
        nombre, ficha = identidad_de(tarea, parsear_identidades(MEMORIA_PRUEBA["identidades"]))
        self.assertEqual(nombre, "Mando")
        self.assertIn("mando-cristal", ficha)

    def test_identidad_cafe(self):
        tarea = {"titulo": "Vista del Café", "archivos": ["src/app/cafe/page.tsx"]}
        nombre, ficha = identidad_de(tarea, parsear_identidades(MEMORIA_PRUEBA["identidades"]))
        self.assertEqual(nombre, "Café")
        self.assertIn("terracota", ficha)

    def test_brief_incluye_matriz_y_apartados(self):
        tarea = {"titulo": "Chat del Café", "archivos": ["src/app/cafe/page.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA)
        self.assertIn("Matriz de pantallas", texto)
        self.assertIn("360×780", texto)
        for apartado in ("Propósito", "Identidad", "Armonía", "Referencias", "Herramientas", "Verificación"):
            self.assertIn(apartado, texto)

    def test_brief_respeta_max_chars(self):
        tarea = {"titulo": "Vista del Café", "archivos": ["src/app/cafe/page.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA, max_chars=900)
        self.assertLessEqual(len(texto), 900)

    def test_brief_sin_memoria_no_falla(self):
        tarea = {"titulo": "Vista", "archivos": ["src/app/x/page.tsx"]}
        texto = brief(tarea, {"identidades": "", "armonia": "", "referencias": ""})
        self.assertIn("sin memoria", texto.lower())
        self.assertIn("Matriz de pantallas", texto)

    def test_cargar_memoria_tolerante(self):
        raiz = tempfile.mkdtemp()
        try:
            memoria = cargar_memoria(raiz)
            self.assertEqual(memoria, {"identidades": "", "armonia": "", "referencias": ""})
            os.makedirs(os.path.join(raiz, "memory", "diseno"))
            with open(os.path.join(raiz, "memory", "diseno", "armonia.md"), "w") as fp:
                fp.write("φ 1.618")
            memoria = cargar_memoria(raiz)
            self.assertEqual(memoria["armonia"], "φ 1.618")
            self.assertEqual(memoria["identidades"], "")
        finally:
            shutil.rmtree(raiz)


if __name__ == "__main__":
    unittest.main()
