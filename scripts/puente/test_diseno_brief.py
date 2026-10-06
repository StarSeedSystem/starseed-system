"""
Pruebas unitarias para diseno_brief.py (contrato §3 de architecture/director-diseno.md).
"""

import os
import shutil
import tempfile
import unittest

from scripts.puente.diseno_brief import (
    LINEA_E_RISE,
    TOPE_PROMPT_ADN,
    brief,
    cargar_memoria,
    es_de_interfaz,
    es_de_movimiento,
    identidad_de,
    identidades_de,
    parsear_identidades,
    slug_de,
)

IDENTIDADES_PRUEBA = {
    "Mando": "Cristal, oscuro, tokens mando-cristal.css.",
    "Café": "Pergamino y terracota #C05C3B, Fraunces + Space Mono.",
    "StarSeed OS/Nexus": "Trinity: Zenith, Creation, Logic, Anchor.",
}

PROMPT_CAFE = (
    "Referencia (mirala primero): referencia/cafe.png\n\n"
    "Pergamino calido, editorial, pausado.\n\n"
    "La jugada rara: un numero cortado por el borde.\n\n"
    "Autocomprobacion:\n- p1: el acento cubre menos del 8 %.\n\n"
    "Antes de devolver nada, ejecuta cada prueba de la autocomprobacion."
)
IMAGEN_CAFE = "memory/diseno/adn/cafe/referencia/cafe.png"

MEMORIA_PRUEBA = {
    "identidades": "\n".join("## " + n + "\n" + f for n, f in IDENTIDADES_PRUEBA.items()),
    "armonia": "# Armonía\n- Escala tipográfica φ (1.618).\n- Espaciado Fibonacci.",
    "referencias": "# Referencias\n- 21st.dev\n- DESIGN.md\n- Awwwards",
    "adn": {"cafe": {"prompt": PROMPT_CAFE, "imagen": IMAGEN_CAFE}},
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
            self.assertEqual(memoria["identidades"], "")
            self.assertEqual(memoria["armonia"], "")
            self.assertEqual(memoria["referencias"], "")
            self.assertEqual(memoria["adn"], {})
            os.makedirs(os.path.join(raiz, "memory", "diseno"))
            with open(os.path.join(raiz, "memory", "diseno", "armonia.md"), "w") as fp:
                fp.write("φ 1.618")
            memoria = cargar_memoria(raiz)
            self.assertEqual(memoria["armonia"], "φ 1.618")
            self.assertEqual(memoria["identidades"], "")
        finally:
            shutil.rmtree(raiz)

    def test_cargar_memoria_lee_adn_sin_dna_json(self):
        raiz = tempfile.mkdtemp()
        try:
            carpeta = os.path.join(raiz, "memory", "diseno", "adn", "cafe", "referencia")
            os.makedirs(carpeta)
            with open(os.path.join(carpeta, "cafe.png"), "wb") as fp:
                fp.write(b"\x89PNG")
            with open(os.path.join(raiz, "memory", "diseno", "adn", "cafe", "PROMPT.md"), "w") as fp:
                fp.write(PROMPT_CAFE)
            with open(os.path.join(raiz, "memory", "diseno", "adn", "cafe", "dna.json"), "w") as fp:
                fp.write('{"secreto": "nunca"}')
            memoria = cargar_memoria(raiz)
            self.assertEqual(memoria["adn"]["cafe"]["prompt"], PROMPT_CAFE)
            self.assertEqual(memoria["adn"]["cafe"]["imagen"], IMAGEN_CAFE)
            self.assertNotIn("secreto", str(memoria))
        finally:
            shutil.rmtree(raiz)


class TestBriefAdn(unittest.TestCase):
    """§9: el brief inyecta PROMPT.md con su imagen, nunca dna.json."""

    def test_brief_incluye_adn_imagen_primero(self):
        tarea = {"titulo": "Vista del Café", "archivos": ["src/app/cafe/page.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA, max_chars=9000)
        self.assertIn("## ADN — Café", texto)
        pos_imagen = texto.index(IMAGEN_CAFE)
        pos_prompt = texto.index("Pergamino calido")
        self.assertLess(pos_imagen, pos_prompt)
        self.assertLess(texto.index("Imagen de referencia"), pos_prompt)

    def test_brief_adn_autocomprobacion_ultima(self):
        tarea = {"titulo": "Vista del Café", "archivos": ["src/app/cafe/page.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA, max_chars=9000)
        bloque = texto.split("## ADN — Café", 1)[1].split("\n## ", 1)[0]
        ultima = [l for l in bloque.splitlines() if l.strip()][-1]
        self.assertIn("autocomprobacion", ultima)

    def test_brief_adn_respeta_tope_2kb(self):
        memoria = dict(MEMORIA_PRUEBA)
        memoria["adn"] = {"cafe": {"prompt": "x" * (TOPE_PROMPT_ADN + 10), "imagen": IMAGEN_CAFE}}
        tarea = {"titulo": "Vista del Café", "archivos": ["src/app/cafe/page.tsx"]}
        texto = brief(tarea, memoria, max_chars=9000)
        self.assertIn("tope de 2 KB", texto)
        self.assertNotIn("x" * (TOPE_PROMPT_ADN + 10), texto)

    def test_brief_sin_adn_usa_ficha(self):
        memoria = dict(MEMORIA_PRUEBA)
        memoria["adn"] = {}
        tarea = {"titulo": "Vista del Café", "archivos": ["src/app/cafe/page.tsx"]}
        texto = brief(tarea, memoria, max_chars=9000)
        self.assertNotIn("## ADN", texto)
        self.assertIn("terracota", texto)

    def test_dos_identidades_dos_bloques(self):
        memoria = dict(MEMORIA_PRUEBA)
        memoria["adn"] = dict(MEMORIA_PRUEBA["adn"])
        memoria["adn"]["mando"] = {"prompt": "Cristal del Mando.", "imagen": IMAGEN_CAFE.replace("cafe", "mando")}
        tarea = {"titulo": "Panel del Mando con vista del Café",
                 "archivos": ["src/components/mando/panel.tsx"]}
        texto = brief(tarea, memoria, max_chars=9000)
        self.assertIn("## ADN — Mando", texto)
        self.assertIn("## ADN — Café", texto)
        nombres = [n for n, _ in identidades_de(tarea, parsear_identidades(memoria["identidades"]))]
        self.assertEqual(set(nombres), {"Mando", "Café"})

    def test_slug_de_normaliza(self):
        self.assertEqual(slug_de("Café"), "cafe")
        self.assertEqual(slug_de("Mando"), "mando")
        self.assertEqual(slug_de("StarSeed OS/Nexus"), "starseed-os-nexus")
        self.assertEqual(slug_de("Materia Viva"), "materia-viva")

    def test_parsear_no_fragmenta_subencabezados(self):
        texto = "## Materia Viva\nFicha.\n### Synthwave Horizon\nPreset uno.\n## Café\nOtra."
        fichas = parsear_identidades(texto)
        self.assertIn("Materia Viva", fichas)
        self.assertIn("Synthwave Horizon", fichas["Materia Viva"])
        self.assertNotIn("Synthwave Horizon", fichas)


class TestBriefRise(unittest.TestCase):
    """§10: sección RISE solo si la tarea toca movimiento."""

    def test_detecta_movimiento_por_texto(self):
        self.assertTrue(es_de_movimiento({"titulo": "Carrusel de la semana"}))
        self.assertTrue(es_de_movimiento({"titulo": "Fondo en canvas"}))
        self.assertTrue(es_de_movimiento({"titulo": "Hero con framer-motion"}))
        self.assertTrue(es_de_movimiento({"titulo": "Vídeo de redes"}))

    def test_detecta_movimiento_por_archivo(self):
        tarea = {"titulo": "Panel", "archivos": ["src/lib/audiomorphic/scene.tsx"]}
        self.assertTrue(es_de_movimiento(tarea))

    def test_no_detecta_movimiento_en_pantalla_fija(self):
        tarea = {"titulo": "Formulario de ajustes", "archivos": ["src/app/ajustes/page.tsx"]}
        self.assertFalse(es_de_movimiento(tarea))

    def test_brief_con_movimiento_tiene_rise(self):
        tarea = {"titulo": "Carrusel del Café", "archivos": ["src/app/cafe/carrusel.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA, max_chars=9000)
        self.assertIn("## 8. Movimiento — método RISE", texto)
        self.assertIn(LINEA_E_RISE, texto)
        self.assertIn("window.__render(t)", texto)
        self.assertIn("prefers-reduced-motion", texto)
        self.assertIn("16:9, 9:16 y 1:1", texto)

    def test_brief_sin_movimiento_no_tiene_rise(self):
        tarea = {"titulo": "Vista del Café", "archivos": ["src/app/cafe/page.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA, max_chars=9000)
        self.assertNotIn("RISE", texto)


if __name__ == "__main__":
    unittest.main()
