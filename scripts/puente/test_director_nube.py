# -*- coding: utf-8 -*-
"""La política del director de la nube, sin tocar gh ni la red.

El 21 de septiembre estos tests defendían lo contrario de lo que hacen hoy: daban por
bueno que «un run en marcha manda sobre el atraso». Esa regla era una creencia y se midió
falsa (dos runs de colas distintas corrieron en paralelo y entregaron 4 ramas `nube/*`),
así que el tope pasó a ser el único que mide algo: agentes simultáneos.
"""
import importlib.util
import os
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "director-nube.py")
_spec = importlib.util.spec_from_file_location("director_nube", _ruta)
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)


class PoliticaDeLanzamiento(unittest.TestCase):
    def test_lanza_con_atraso_y_la_nube_libre(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=4, runs_en_marcha=0, lanzados_hoy=0)
        self.assertTrue(lanzar)
        self.assertIn("4", motivo)

    def test_el_primer_job_se_lanza_aunque_el_atraso_sea_una_sola_tarea(self):
        # Con la nube apagada, una tarea ya justifica encenderla.
        lanzar, _ = D.decidir_lanzamiento(atraso=1, runs_en_marcha=0, lanzados_hoy=0,
                                          agentes_en_marcha=0, trabajadores=4)
        self.assertTrue(lanzar)

    def test_no_lanza_sin_atraso(self):
        # El caso normal: la Mac se basta. Un agente sin tarea no es capacidad, es ruido.
        lanzar, motivo = D.decidir_lanzamiento(atraso=0, runs_en_marcha=0, lanzados_hoy=0)
        self.assertFalse(lanzar)
        self.assertIn("atraso", motivo)

    def test_respeta_el_tope_del_dia(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=5, runs_en_marcha=0, lanzados_hoy=30, tope_dia=30)
        self.assertFalse(lanzar)
        self.assertIn("tope", motivo)


class JobsEnParalelo(unittest.TestCase):
    """Lo que Alex no veía subir: el segundo y el tercer job."""

    def test_lanza_un_segundo_job_si_el_atraso_lo_llena(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=8, runs_en_marcha=1, lanzados_hoy=2,
                                               agentes_en_marcha=4, trabajadores=4,
                                               tope_agentes=12)
        self.assertTrue(lanzar)
        self.assertIn("4/12", motivo)

    def test_lanza_un_tercer_job_hasta_llenar_el_tope(self):
        lanzar, _ = D.decidir_lanzamiento(atraso=9, runs_en_marcha=2, lanzados_hoy=3,
                                          agentes_en_marcha=8, trabajadores=4,
                                          tope_agentes=12)
        self.assertTrue(lanzar)

    def test_no_lanza_un_job_a_medias(self):
        # 2 tareas de atraso no llenan un job de 4: esperar es más barato que malgastar.
        lanzar, motivo = D.decidir_lanzamiento(atraso=2, runs_en_marcha=1, lanzados_hoy=1,
                                               agentes_en_marcha=4, trabajadores=4)
        self.assertFalse(lanzar)
        self.assertIn("no llenan", motivo)

    def test_el_tope_de_agentes_manda_sobre_el_atraso(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=100, runs_en_marcha=3, lanzados_hoy=0,
                                               agentes_en_marcha=12, trabajadores=4,
                                               tope_agentes=12)
        self.assertFalse(lanzar)
        self.assertIn("tope 12", motivo)

    def test_no_entra_un_job_que_no_cabe_entero(self):
        # Quedan 2 huecos y el job pide 4: no se lanza recortado, se espera.
        lanzar, motivo = D.decidir_lanzamiento(atraso=50, runs_en_marcha=2, lanzados_hoy=0,
                                               agentes_en_marcha=10, trabajadores=4,
                                               tope_agentes=12)
        self.assertFalse(lanzar)
        self.assertIn("no caben", motivo)


class SinClavesNoSeInsiste(unittest.TestCase):
    def test_sin_claves_no_se_lanza_aunque_haya_atraso(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=20, runs_en_marcha=0, lanzados_hoy=0,
                                               hay_claves=False)
        self.assertFalse(lanzar)
        self.assertIn("claves", motivo)

    def test_las_claves_se_comprueban_antes_que_nada(self):
        # Sin claves da igual todo lo demás: el job moriría igual en el paso de claves.
        lanzar, _ = D.decidir_lanzamiento(atraso=0, runs_en_marcha=5, lanzados_hoy=99,
                                          hay_claves=False)
        self.assertFalse(lanzar)


class TopesPorDefecto(unittest.TestCase):
    def test_el_tope_de_agentes_deja_sitio_a_mas_de_un_job(self):
        # Si alguien baja TOPE_AGENTES por debajo de TRABAJADORES, la nube no arrancaría
        # nunca y el log diría «no caben» para siempre. Esto lo detecta.
        self.assertGreaterEqual(D.TOPE_AGENTES, 2 * int(D.TRABAJADORES))


if __name__ == "__main__":
    unittest.main()
