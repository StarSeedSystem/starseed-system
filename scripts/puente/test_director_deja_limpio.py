# -*- coding: utf-8 -*-
"""El director de aprendizaje tiene que dejar el árbol LIMPIO.

EL CASO REAL (2026-09-16, 00:19 → 00:58). Al cerrar la ola 326, el director
escribió `memory/aprendizaje-olas.md` y lo dejó sin commitear. El orquestador se
niega a arrancar con `main` sucio —guardia correcto: nadie quiere agentes
trabajando sobre un árbol a medias— y el vigilante, al verlo, tampoco relanza:

    working tree de main con cambios sin commit: 1 archivos — no arranco
    __EXIT__=2

Ese «1 archivo» era el suyo. Resultado: cero orquestadores, cuatro tareas
pendientes y media hora sin que nadie trabajara. El director que existe para que
el sistema no tropiece dos veces con la misma piedra había puesto una piedra
nueva. Alex lo vio antes que nadie: «¿por qué hay 4 pendientes y no hay agentes
trabajando?».

La lección general, que vale para cualquier director futuro: **un proceso
automático que escribe en el repo tiene que cerrar lo que abre.** Dejar un
archivo suelto en `main` no es un detalle de higiene, es parar el enjambre.
"""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import director_aprendizaje as D


class PruebaDejaElArbolLimpio(unittest.TestCase):
    def test_existe_el_cierre(self):
        self.assertTrue(
            hasattr(D, "commitear_memoria"),
            "sin esto, cada ola cerrada deja el árbol sucio y el enjambre no vuelve a arrancar",
        )

    def test_se_llama_al_terminar(self):
        fuente = open(
            os.path.join(DIRECTORIO, "director_aprendizaje.py"), encoding="utf-8"
        ).read()
        self.assertIn("commitear_memoria(nombre)", fuente)

    def test_commitea_solo_su_archivo_con_ruta_explicita(self):
        # Sin la ruta explícita se llevaría por delante lo que otro estuviera
        # preparando en el índice.
        fuente = open(
            os.path.join(DIRECTORIO, "director_aprendizaje.py"), encoding="utf-8"
        ).read()
        self.assertIn('"add", "--", rel', fuente.replace("\n", "").replace(" ", "").replace('"add","--",rel', '"add", "--", rel'))
        self.assertIn("rel", fuente)

    def test_no_toca_el_indice_si_hay_algo_a_medias(self):
        fuente = open(
            os.path.join(DIRECTORIO, "director_aprendizaje.py"), encoding="utf-8"
        ).read()
        for marca in ("rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD"):
            self.assertIn(marca, fuente)

    def test_nunca_lanza(self):
        # Un fallo aquí no puede tumbar el cierre de una ola: como mucho deja el
        # archivo suelto, que es lo de antes.
        fuente = open(
            os.path.join(DIRECTORIO, "director_aprendizaje.py"), encoding="utf-8"
        ).read()
        i = fuente.find("def commitear_memoria")
        j = fuente.find("\ndef ", i + 10)
        self.assertIn("except Exception", fuente[i:j])


if __name__ == "__main__":
    unittest.main()
