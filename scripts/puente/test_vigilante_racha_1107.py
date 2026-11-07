# -*- coding: utf-8 -*-
"""(2026-11-07) El vigilante no relanza en tormenta un orquestador que muere joven.

Medido el 28-10: una cola nueva cada ~2 min 22 s (`cola-auto-1028-000008.json`, `…-000230.json`)
con las mismas 20 tareas. El orquestador pasaba la comprobación de 45 s y moría antes de la
vuelta siguiente; el vigilante lo veía «parado» con trabajo y lo relanzaba sin freno.

Funciones PURAS (sin red, disco ni procesos) más una pasada de `main()` con dobles.
"""

import contextlib, importlib.util, io, os, sys, unittest
from unittest import mock
DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import vigilante_logica as V  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "vigilante_enjambre_racha", os.path.join(DIRECTORIO, "vigilante-enjambre.py"))
vig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vig)


class RachaDeArranquesTest(unittest.TestCase):
    def test_sin_vidas_o_con_basura_no_hay_racha(self):
        self.assertEqual(V.racha_de_arranques([]), 0)
        self.assertEqual(V.racha_de_arranques(None), 0)
        for basura in (None, "x", True, -1):
            self.assertEqual(V.racha_de_arranques([120, basura]), 0)

    def test_el_umbral_por_defecto_es_el_documentado(self):
        self.assertEqual(V.racha_de_arranques([V.VIDA_MINIMA_S - 1]), 1)
        self.assertEqual(V.racha_de_arranques([V.VIDA_MINIMA_S]), 0)

    def test_cuenta_solo_las_ultimas_vidas_cortas(self):
        self.assertEqual(V.racha_de_arranques([120], minima_s=600), 1)
        self.assertEqual(V.racha_de_arranques([120, 200], minima_s=600), 2)
        # una vida larga corta la racha: lo de antes ya no cuenta
        self.assertEqual(V.racha_de_arranques([120, 900], minima_s=600), 0)
        self.assertEqual(V.racha_de_arranques([120, 200, 900], minima_s=600), 0)
        self.assertEqual(V.racha_de_arranques([900, 120], minima_s=600), 1)


class EsperaPorArranquesTest(unittest.TestCase):
    def test_sin_racha_no_espera_y_con_racha_dobla_hasta_el_techo(self):
        self.assertEqual(V.espera_por_arranques(0), 0)
        self.assertEqual(V.espera_por_arranques(-3), 0)
        self.assertEqual(V.espera_por_arranques(1), V.RACHA_ESPERA_BASE_S)
        self.assertEqual(V.espera_por_arranques(2), V.RACHA_ESPERA_BASE_S * 2)
        self.assertEqual(V.espera_por_arranques(3), V.RACHA_ESPERA_BASE_S * 4)
        self.assertEqual(V.espera_por_arranques(50), V.RACHA_ESPERA_TOPE_S)


class _Fin(BaseException):
    """Corta el `while True` de main() en su sleep (main solo atrapa Exception)."""


class NoRelanzaEnTormentaTest(unittest.TestCase):
    """`main()` con el orquestador muriendo joven en cada vuelta: solo un lanzamiento."""

    def _pasadas(self, vueltas=3, pendientes_fn=None):
        reloj = [1000.0]
        lanzar, decir = mock.Mock(return_value="cola-auto-1107-000000"), mock.Mock()
        restantes = {"n": vueltas}

        def dormir(_s):
            if restantes["n"] <= 0:
                raise _Fin
            restantes["n"] -= 1
            reloj[0] += vig.INTERVALO_S

        with contextlib.ExitStack() as pila:
            parches = {
                "orquestador_vivo": lambda: False,
                "barrer_cerrojos": lambda: None,
                "pendientes": pendientes_fn or (lambda: [{"id": "T1"}]),
                "lanzar": lanzar,
                "comprobar_arranque": lambda: None,  # arrancó: no detecta la muerte posterior
                "matar_colgados": lambda: None,
                "alimentar_tanda_viva": lambda: None,
                "_dirijo": lambda: True,
            }
            for nombre, valor in parches.items():
                pila.enter_context(mock.patch.object(vig, nombre, valor))
            pila.enter_context(mock.patch.object(vig.higiene_colas, "higiene", return_value=[]))
            pila.enter_context(mock.patch.object(vig.higiene_worktrees, "podar", return_value=[]))
            pila.enter_context(mock.patch.object(
                vig.config_director, "cargar",
                return_value=({"trabajadores": 3, "tope_por_relanzamiento": 20}, [])))
            pila.enter_context(mock.patch.object(vig._p, "decir", decir))
            pila.enter_context(mock.patch.object(vig.time, "time", side_effect=lambda: reloj[0]))
            pila.enter_context(mock.patch.object(vig.time, "sleep", side_effect=dormir))
            pila.enter_context(contextlib.redirect_stdout(io.StringIO()))
            with self.assertRaises(_Fin):
                vig.main()
        return lanzar, " | ".join(str(c.args[0]) for c in decir.call_args_list)

    def test_muere_joven_y_no_se_relanza_en_cada_vuelta(self):
        lanzar, dicho = self._pasadas(vueltas=4)
        # 4 vueltas con una vida corta tras la primera: solo el primer lanzamiento
        self.assertEqual(lanzar.call_count, 1)
        self.assertIn("murió", dicho.lower())
        self.assertIn("espero", dicho.lower())

    def test_un_final_corto_sin_trabajo_pendiente_no_avisa_de_muerte(self):
        # Terminó pronto y ya no queda nada: no es una muerte, y no se dice que lo sea.
        llamadas = {"n": 0}

        def pendientes_que_se_acaba():
            llamadas["n"] += 1
            return [{"id": "T1"}] if llamadas["n"] == 1 else []

        lanzar, dicho = self._pasadas(vueltas=4, pendientes_fn=pendientes_que_se_acaba)
        self.assertEqual(lanzar.call_count, 1)  # solo el primero, cuando aún había T1
        self.assertNotIn("murió", dicho.lower())


if __name__ == "__main__":
    unittest.main()
