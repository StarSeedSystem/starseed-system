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
    "Genesis": "Cristal, oscuro, tokens mando-cristal.css.",
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
        tarea = {"titulo": "Panel de Genesis", "archivos": ["src/components/mando/panel.tsx"]}
        nombre, ficha = identidad_de(tarea, parsear_identidades(MEMORIA_PRUEBA["identidades"]))
        self.assertEqual(nombre, "Genesis")
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
        memoria["adn"]["genesis"] = {"prompt": "Cristal de Genesis.", "imagen": IMAGEN_CAFE.replace("cafe", "genesis")}
        tarea = {"titulo": "Panel de Genesis con vista del Café",
                 "archivos": ["src/components/mando/panel.tsx"]}
        texto = brief(tarea, memoria, max_chars=9000)
        self.assertIn("## ADN — Genesis", texto)
        self.assertIn("## ADN — Café", texto)
        nombres = [n for n, _ in identidades_de(tarea, parsear_identidades(memoria["identidades"]))]
        self.assertEqual(set(nombres), {"Genesis", "Café"})

    def test_slug_de_normaliza(self):
        self.assertEqual(slug_de("Café"), "cafe")
        self.assertEqual(slug_de("Genesis"), "genesis")
        self.assertEqual(slug_de("StarSeed OS/Nexus"), "starseed-os-nexus")
        self.assertEqual(slug_de("Materia Viva"), "materia-viva")

    def test_parsear_no_fragmenta_subencabezados(self):
        texto = "## Materia Viva\nFicha.\n### Synthwave Horizon\nPreset uno.\n## Café\nOtra."
        fichas = parsear_identidades(texto)
        self.assertIn("Materia Viva", fichas)
        self.assertIn("Synthwave Horizon", fichas["Materia Viva"])
        self.assertNotIn("Synthwave Horizon", fichas)


def _lineas_de_herramientas(texto: str, subcadena: str) -> list:
    """Líneas del apartado 6 (Herramientas y skills) que contienen la subcadena."""
    en_herramientas = False
    salida = []
    for linea in texto.splitlines():
        if linea.strip() == "## 6. Herramientas y skills":
            en_herramientas = True
            continue
        if en_herramientas and linea.strip().startswith("## "):
            break
        if en_herramientas and subcadena in linea:
            salida.append(linea)
    return salida


class TestBriefHerramientas(unittest.TestCase):
    """§6-§7: deduplicación por línea y herramientas de base en toda tarea de interfaz."""

    def test_taste_skill_y_ui_tars_en_toda_tarea(self):
        """taste-skill (HERRAMIENTAS_BASE) y UI-TARS salen en toda tarea de interfaz."""
        for titulo in ["Presentación de resultados", "Vista simple", "Panel de Genesis"]:
            tarea = {"titulo": titulo, "archivos": ["src/app/x/page.tsx"]}
            texto = brief(tarea, MEMORIA_PRUEBA, max_chars=9000)
            self.assertIn("taste-skill", texto, "Falta taste-skill en: " + titulo)
            self.assertIn("Leonxlnx/taste-skill", texto, "Falta repo taste-skill en: " + titulo)
            self.assertIn("UI-TARS", texto, "Falta UI-TARS en: " + titulo)

    def test_sin_lineas_duplicadas_con_dos_claves(self):
        """Dos claves cuyo destino es la misma línea no la duplican en el apartado 6."""
        # «chat» y «mensaj» casan ambas con la línea de assistant-ui
        tarea = {"titulo": "Chat de mensajería", "archivos": ["src/app/x/page.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA, max_chars=9000)
        self.assertEqual(len(_lineas_de_herramientas(texto, "assistant-ui")), 1,
                         "assistant-ui aparece duplicado")
        # HERRAMIENTAS_BASE tampoco se repite ni a medias
        self.assertEqual(len(_lineas_de_herramientas(texto, "taste-skill")), 1,
                         "taste-skill aparece duplicado")

    def test_apartados_6_y_7_con_varias_claves(self):
        """Los apartados 6 (Herramientas) y 7 (Verificación) se conservan con varias claves."""
        tarea = {"titulo": "Chat de agente con grafo", "archivos": ["src/app/x/page.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA, max_chars=9000)
        self.assertIn("## 6. Herramientas y skills", texto)
        self.assertIn("## 7. Verificación", texto)
        self.assertIn("assistant-ui", texto)
        self.assertIn("Mastra", texto)
        self.assertIn("LangGraph.js", texto)
        self.assertIn("taste-skill", texto)
        self.assertIn("UI-TARS", texto)


class TestBriefHerramientasDiseno1025(unittest.TestCase):
    """DSN1025B: brief con las líneas nuevas de slides, DESIGN.md, Docusaurus y Refine."""

    def _texto_brief(self, titulo: str) -> str:
        tarea = {"titulo": titulo, "archivos": ["src/app/x/page.tsx"]}
        return brief(tarea, MEMORIA_PRUEBA)

    def test_presentacion_trae_frontend_slides(self):
        texto = self._texto_brief("Presentación de resultados de la ola")
        lineas = _lineas_de_herramientas(texto, "frontend-slides")
        self.assertEqual(len(lineas), 1)
        self.assertIn("zarazhangrui/frontend-slides", lineas[0])
        self.assertIn("16:9", lineas[0])

    def test_diapositiva_y_conferencia_casan_igual(self):
        for titulo in ["Diapositiva de cierre del Café", "Conferencia de la red"]:
            texto = self._texto_brief(titulo)
            self.assertEqual(len(_lineas_de_herramientas(texto, "frontend-slides")), 1,
                             "Sin línea de frontend-slides en: " + titulo)

    def test_design_md_trae_awesome_design_md(self):
        texto = self._texto_brief("DESIGN.md del Café")
        lineas = _lineas_de_herramientas(texto, "awesome-design-md")
        self.assertEqual(len(lineas), 1)
        self.assertIn("VoltAgent/awesome-design-md", lineas[0])
        self.assertIn("nunca la identidad", lineas[0])

    def test_sistema_de_diseno_trae_awesome_design_md(self):
        texto = self._texto_brief("Sistema de diseño de Nexus")
        self.assertEqual(len(_lineas_de_herramientas(texto, "awesome-design-md")), 1)

    def test_documentacion_trae_docusaurus(self):
        texto = self._texto_brief("Documentación de la guía de introducción")
        lineas = _lineas_de_herramientas(texto, "Docusaurus")
        self.assertEqual(len(lineas), 1)
        self.assertIn("facebook/docusaurus", lineas[0])
        self.assertIn("exporta e importa", lineas[0])

    def test_educacion_trae_docusaurus(self):
        texto = self._texto_brief("Sección de educación con temas de guía")
        self.assertEqual(len(_lineas_de_herramientas(texto, "Docusaurus")), 1)

    def test_panel_de_datos_trae_refine(self):
        for titulo in ["Panel de datos del Estudio de Apps", "Panel de administración de widgets"]:
            texto = self._texto_brief(titulo)
            lineas = _lineas_de_herramientas(texto, "Refine")
            self.assertEqual(len(lineas), 1, "Sin línea de Refine en: " + titulo)
            self.assertIn("refinedev/refine", lineas[0])
            self.assertIn("telemetría apagada", lineas[0])

    def test_dos_claves_nuevas_no_duplican_linea(self):
        for titulo, subcadena in [
            ("Diapositiva de presentación para la conferencia", "frontend-slides"),
            ("Panel de datos en el panel de administración", "Refine"),
            ("Educación y documentación juntas", "Docusaurus"),
            ("design.md del sistema de diseño", "awesome-design-md"),
        ]:
            texto = self._texto_brief(titulo)
            self.assertEqual(len(_lineas_de_herramientas(texto, subcadena)), 1,
                             subcadena + " sale dos veces: " + titulo)

    def test_apartados_6_y_7_con_tres_claves_y_tope_2500(self):
        """Con el tope por defecto de 2500 y tres claves nuevas, siguen los apartados 6 y 7."""
        tarea = {"titulo": "Presentación para el panel de administración de la documentación",
                 "archivos": ["src/app/x/page.tsx"]}
        texto = brief(tarea, MEMORIA_PRUEBA)
        self.assertLessEqual(len(texto), 2500)
        self.assertIn("## 6. Herramientas y skills", texto)
        self.assertIn("## 7. Verificación", texto)

    def test_taste_skill_con_metodo_en_toda_tarea(self):
        """La línea nueva de taste-skill (con el método) sale en toda tarea de interfaz."""
        for titulo in ["Simple vista", "Panel de Genesis", "Presentación con panel de datos"]:
            texto = self._texto_brief(titulo)
            lineas = _lineas_de_herramientas(texto, "taste-skill")
            self.assertEqual(len(lineas), 1, "taste-skill en: " + titulo)
            self.assertIn("inventario, argumento, capturas a 3 anchos", lineas[0])
            self.assertIn("el ADN manda", lineas[0])


class TestBriefRise(unittest.TestCase):
    """§10: sección RISE solo si la tarea toca movimiento."""

    def test_detecta_movimiento_por_texto(self):
        self.assertTrue(es_de_movimiento({"titulo": "Carrusel de la semana"}))
        self.assertTrue(es_de_movimiento({"titulo": "Fondo en canvas"}))
        self.assertTrue(es_de_movimiento({"titulo": "Hero con framer-motion"}))
        self.assertTrue(es_de_movimiento({"titulo": "Vídeo de redes"}))

    def test_movimiento_rescatado_DIS1005L(self):
        self.assertTrue(es_de_movimiento({"titulo": "Hero animado", "archivos": ["src/app/hero.tsx"]}))
        self.assertTrue(es_de_movimiento({"titulo": "Canvas interactivo", "archivos": []}))
        self.assertFalse(es_de_movimiento({"titulo": "Hero estático", "archivos": []}))

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
