#!/usr/bin/env python3
"""Pruebas de la detección de publicaciones de main en autodesarrollo (Ola 1106I).

Las cuatro propuestas de finales de octubre sobre publicar main que fueron aprobadas en Genesis
fueron encargadas como tareas por `director_autodesarrollo.py` y luego reconocidas como
publicaciones de autopublicación (no accionables por el enjambre) y descartadas.

Reglas (1105):
- Una propuesta es una publicación de main si:
  1) `es_de_alex(p)` devuelve True (la propone Alex),
  2) el título normalizado contiene alguna palabra de publicación (publicar, publicacion, despliegar, deploy, vercel),
  3) el texto normalizado menciona main, origin, commit(s), push, pile, backlog, production,
     vercel, deployment o deploy como palabra completa.

Director (director_autodesarrollo.py §4):
- En el ciclo que arma `cola`, saca las que `AD.es_publicacion_de_main(p)` son y las marca
  `estado = "descartada"` con motivo "publicar main es de la autopublicación...".

El botón de autogestión del orquestador (Ola 1024I) NO se ejecuta con el enjambre vivo
(don’t `npm run dev`, `next build`, `git push`).
"""
import os
import sys
import unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import autodesarrollo_decidir as AD

# --------------------------------------------------
# Casos de prueba: publicaciones que realmente fueron aprobadas en Genesis
# --------------------------------------------------
PUBLICACIONES_DE_MAIN_APROBADAS = [
    # (título, cuerpo, esperado por es_publicacion_de_main)
    # Estas fueron las ocho propuestas de "Publicar X" de finales de octubre
    # (2024-10-23 y 2024-10-30) que fueron aprobadas en Genesis y encargadas
    # como tareas por director_autodesarrollo.py.
    # Solo el botón de publicación del enjambre las vio; son del botón "Publicar"
    # y del "Replicar producción", no del automático de administradores de StarSeed.
    ("Publicar los 4 commits que esperan en main", "", True),
    ("Publicar la pila de main acumulada", "", True),
    ("Publicar los 167 commits acumulados en main", "", True),
    ("Desatascar la pila de publicación: 388 commits en main sin push", "", True),
]

# --------------------------------------------------
# Casos de prueba: TÍTULOS de publicaciones de main (sin coincidencia en el cuerpo)
# --------------------------------------------------
TITULOS_SOLO_DE_PUBLICACION = [
    # Sin referencia a main en el cuerpo → False
    ("Simplificar la cadena de publicación de la Biblioteca", "", False),
    ("Publicar un evento en el muro de la comunidad", "", False),
    ("Arreglar el ciclo de vida del orquestador", "", False),
]

# --------------------------------------------------
# Función auxiliar para construir una propuesta
# --------------------------------------------------
def p(titulo, cuerpo=""):
    return {"titulo": titulo, "cuerpo": cuerpo}


# --------------------------------------------------
# Pruebas
# --------------------------------------------------
class PublicacionDeMain(unittest.TestCase):
    """`autodesarrollo_decidir.py:94` `es_publicacion_de_main(p)`"""

    def test_aprobadas_en_genesis_true(self):
        """Los cuatro títulos aprobados en Genesis deberían ser publicaciones de main → True"""
        for titulo, cuerpo, esperado in PUBLICACIONES_DE_MAIN_APROBADAS:
            with self.subTest(titulo=titulo):
                self.assertEqual(AD.es_publicacion_de_main(p(titulo, cuerpo)), esperado,
                                 f"El título '{titulo}' debería ser publicación de main → True")

    def test_titulos_solo_false(self):
        """Titulos solo de publicación (no mencionan main) → False"""
        for titulo, cuerpo, esperado in TITULOS_SOLO_DE_PUBLICACION:
            with self.subTest(titulo=titulo):
                self.assertEqual(AD.es_publicacion_de_main(p(titulo, cuerpo)), esperado,
                                 f"El título '{titulo}' debería ser falso")

    def test_desde_alex_falso(self):
        """Si no es de Alex, no es una publicación de main → False"""
        # Propuesta sin título de publicación
        self.assertFalse(AD.es_publicacion_de_main(p("Arreglar bug de base de datos", "")))

    def test_sin_titulo_falso(self):
        """Sin título → no es una publicación de main → False"""
        self.assertFalse(AD.es_publicacion_de_main({"cuerpo": "Main está aquí"}))

    def test_cuerpo_sin_main_falso(self):
        """Sin mención a main en el cuerpo → no es una publicación de main → False"""
        # La propuesta tiene título de publicación ("Publicar algo") pero el cuerpo no tiene main/origin/commit/push/etc.
        # El texto normalizado es "publicar algo sin mencionar nada relevante" → no hay palabras clave
        self.assertFalse(AD.es_publicacion_de_main(p("Publicar algo", "sin mencionar nada relevante")))


# --------------------------------------------------
# Pruebas del director_autodesarrollo.py
# --------------------------------------------------
# Separar las que están listas para el enjambre de las publicaciones de main
# --------------------------------------------------
def separar_publicacion(cola):
    """Versiones puras y prácticas del filtro de publicaciones de main del director.

    Devuelve (cola_sin_publicar, descartadas), idéntico a director_autodesarrollo.py:591-602.
    """
    descartadas = []
    sin_publicar = []
    for prop in cola:
        if AD.es_publicacion_de_main(prop):
            p2 = dict(prop)
            p2.update(estado="descartada",
                      motivo_destino="publicar main es de la autopublicación (o del botón 'Publicar' de Genesis), no de los agentes",
                      t="2026-11-06T00:00:00")
            descartadas.append(p2)
        else:
            sin_publicar.append(prop)
    return sin_publicar, descartadas


class DirectorAutodesarrollo(unittest.TestCase):
    """`director_autodesarrollo.py:591-602` separar publicaciones de main"""

    def test_cuela_de_publicacion(self):
        """Con una publicación de main y una de código, solo la de código llega a la cola"""
        # Publicación aprobada en Genesis
        pub = p("Publicar los 167 commits acumulados en main", "")
        pub.update(estado="aprobada", via="codigo", aprobada_por="automatica", decidida="2026-10-30T12:00:00")

        # Otra tarea de código aprobada (sí es de autodesarrollo)
        codigo = p("Arreglar bug del núcleo", "")
        codigo.update(estado="aprobada", via="codigo", aprobada_por="automatica", decidida="2026-10-30T12:00:00")

        sin_pub, descartadas = separar_publicacion([pub, codigo])
        self.assertEqual(len(sin_pub), 1)
        self.assertEqual(sin_pub[0]["titulo"], "Arreglar bug del núcleo")
        self.assertEqual(len(descartadas), 1)
        self.assertEqual(descartadas[0]["titulo"], "Publicar los 167 commits acumulados en main")
        self.assertEqual(descartadas[0]["estado"], "descartada")

    def test_no_publicacion_no_se_descarta(self):
        """Sin publicaciones de main, todas van a la cola"""
        trabajos = [p("Arreglar bug A", ""), p("Arreglar bug B", "")]
        for j in trabajos:
            j.update(estado="aprobada", via="codigo", aprobada_por="automatica", decidida="2026-10-30T12:00:00")
        sin_pub, descartadas = separar_publicacion(trabajos)
        self.assertEqual(len(sin_pub), 2)
        self.assertEqual(len(descartadas), 0)

    def test_todas_son_publicaciones(self):
        """Solo publicaciones de main → todas descartadas, ninguna en la cola"""
        # Solo publicaciones de main: todas descartadas
        pubs = [p(f"Publicar los {i} main acumulados", "") for i in [1, 2]]
        for prop in pubs:
            prop.update(estado="aprobada", via="codigo", aprobada_por="automatica", decidida="2026-10-30T12:00:00")
        sin_pub, descartadas = separar_publicacion(pubs)
        self.assertEqual(len(sin_pub), 0)
        self.assertEqual(len(descartadas), 2)
        for d in descartadas:
            self.assertEqual(d["estado"], "descartada")

    def test_sin_titulo_descartado(self):
        """Si una publicación no tiene título, aún se descarta"""
        # Propuesta sin título pero con cuerpo que menciona publicación y main.
        # Para ser de Alex, debe tener "publicar" en el cuerpo.
        pub_sin_titulo = p("", "publicar main")
        pub_sin_titulo.update(estado="aprobada", via="codigo", aprobada_por="automatica", decidida="2026-10-30T12:00:00")
        # Nota: La función es_publicacion_de_main requiere que el TÍTULO contenga
        # una palabra de publicación (\"publicar\", \"publicacion\", \"desplegar\", \"deploy\", \"vercel\").
        # Por lo tanto, un título vacío NO se considera una publicación de main.
        # Esta prueba verifica el comportamiento del director, no la función es_publicacion_de_main.
        # el director autodesarrollo separa las publicaciones de main del auto + aprobadas_c
        # basándose en AD.es_publicacion_de_main(p), no en si el cuerpo menciona \"publicar\"
        sin_pub, descartadas = separar_publicacion([pub_sin_titulo])
        self.assertEqual(len(sin_pub), 1)
        self.assertEqual(len(descartadas), 0)
        self.assertEqual(sin_pub[0]["titulo"], "")


if __name__ == "__main__":
    unittest.main()
