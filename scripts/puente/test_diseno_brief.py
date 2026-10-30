"""
Pruebas unitarias para diseno_brief.py (contrato §3 de architecture/director-diseno.md).
"""

import os
import shutil
import tempfile
import unittest

from scripts.puente.diseno_brief import (
    HERRAMIENTAS_BASE,
    LINEA_DESIGN_MD,
    LINEA_DOCUSAURUS,
    LINEA_REFINE,
    LINEA_SLIDES,
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


class TestBriefHerramientas1025(unittest.TestCase):
    """Ola 1025R: slides, DESIGN.md, Docusaurus y Refine entran en el apartado 6."""

    def test_lineas_nuevas_cortas_y_con_titulo(self):
        for linea in (
            LINEA_SLIDES,
            LINEA_DESIGN_MD,
            LINEA_DOCUSAURUS,
            LINEA_REFINE,
            HERRAMIENTAS_BASE[0],
        ):
            self.assertLessEqual(len(linea), 150)
        self.assertIn("UI-TARS", HERRAMIENTAS_BASE[1])

    def _texto_con(self, titulo: str, prompt: str = "", max_chars: int = 9000) -> str:
        return brief(
            {"titulo": titulo, "prompt": prompt, "archivos": []},
            MEMORIA_PRUEBA,
            max_chars=max_chars,
        )

    def test_presentacion_trae_frontend_slides(self):
        texto = self._texto_con("Presentación de resultados", "diapositivas del informe")
        self.assertIn("zarazhangrui/frontend-slides", texto)
        self.assertIn("(presentaciones en un HTML; 16:9)", texto)

    def test_conferencia_trae_frontend_slides(self):
        texto = self._texto_con("Página de conferencia del Café", "charla y material")
        self.assertIn("zarazhangrui/frontend-slides", texto)

    def test_design_md_trae_awesome_design_md(self):
        texto = self._texto_con("Referencias del contexto", "escribe el DESIGN.md del área")
        self.assertIn("VoltAgent/awesome-design-md", texto)
        self.assertIn("(formato DESIGN.md; no la identidad)", texto)

    def test_sistema_de_diseno_trae_awesome_design_md(self):
        texto = self._texto_con("Unificar el sistema de diseño de la red")
        self.assertIn("VoltAgent/awesome-design-md", texto)

    def test_documentacion_trae_docusaurus(self):
        texto = self._texto_con("Guía de introducción", "documentación de los temas")
        self.assertIn("facebook/docusaurus", texto)
        self.assertIn("(documentación Markdown; exporta e importa texto)", texto)

    def test_educacion_trae_docusaurus(self):
        texto = self._texto_con("Arbol de la sección de educación", "cursos del bosque")
        self.assertIn("facebook/docusaurus", texto)

    def test_panel_de_datos_trae_refine(self):
        texto = self._texto_con("Panel de datos del grupo", "tabla del presupuesto")
        self.assertIn("refinedev/refine", texto)
        self.assertIn("(plantilla de panel de datos; telemetría apagada)", texto)

    def test_panel_de_administracion_trae_refine(self):
        texto = self._texto_con("Panel de administración de la campaña")
        self.assertIn("refinedev/refine", texto)

    def test_taste_skill_sigue_en_toda_tarea(self):
        for tarea in (
            {"titulo": "Panel de datos", "archivos": []},
            {"titulo": "Presentación de resultados", "archivos": []},
            {"titulo": "Chat del Café", "archivos": ["src/app/cafe/page.tsx"]},
            {"titulo": "Widget de la red", "archivos": []},
        ):
            texto = brief(tarea, MEMORIA_PRUEBA, max_chars=9000)
            self.assertIn(
                "taste-skill — https://github.com/Leonxlnx/taste-skill (método: inventario, "
                "argumento, capturas a 3 anchos y crítica; el ADN manda; en la Biblioteca)",
                texto,
            )

    def test_ninguna_linea_repite_aun_con_dos_claves(self):
        texto = self._texto_con("Presentación y diapositivas para la conferencia")
        self.assertEqual(texto.count("zarazhangrui/frontend-slides"), 1)
        texto = self._texto_con("Documentación y educación del bosque")
        self.assertEqual(texto.count("facebook/docusaurus"), 1)
        texto = self._texto_con("Panel de datos y panel de administración")
        self.assertEqual(texto.count("refinedev/refine"), 1)
        texto = self._texto_con("DESIGN.md y sistema de diseño del área")
        self.assertEqual(texto.count("VoltAgent/awesome-design-md"), 1)

    def test_cuatro_herramientas_nuevas_cada_url_una_vez(self):
        texto = self._texto_con(
            "Presentación con su documentación, DESIGN.md y panel de datos", max_chars=9000
        )
        self.assertEqual(texto.count("zarazhangrui/frontend-slides"), 1)
        self.assertEqual(texto.count("facebook/docusaurus"), 1)
        self.assertEqual(texto.count("VoltAgent/awesome-design-md"), 1)
        self.assertEqual(texto.count("refinedev/refine"), 1)

    def test_apartados_6_y_7_se_conservan_con_tres_claves(self):
        texto = self._texto_con(
            "Presentación de resultados con su documentación y panel de datos",
            max_chars=2500,
        )
        self.assertIn("## 6. Herramientas y skills", texto)
        self.assertIn("## 7. Verificación", texto)
        self.assertIn("zarazhangrui/frontend-slides", texto)
        self.assertIn("facebook/docusaurus", texto)
        self.assertIn("refinedev/refine", texto)

    def test_tres_claves_del_mismo_grupo_conservan_6_y_7(self):
        texto = brief(
            {"titulo": "Presentación con diapositivas para la conferencia", "archivos": []},
            MEMORIA_PRUEBA,
            max_chars=2500,
        )
        self.assertIn("## 6. Herramientas y skills", texto)
        self.assertIn("## 7. Verificación", texto)
        self.assertEqual(texto.count("zarazhangrui/frontend-slides"), 1)


if __name__ == "__main__":
    unittest.main()
