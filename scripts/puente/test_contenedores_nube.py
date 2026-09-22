# -*- coding: utf-8 -*-
"""El inventario de contenedores: la capacidad se MIDE y la lee todo el mundo.

Antes la capacidad de la nube vivía en dos sitios que no se hablaban: el sondeo que se
pinta en el Puente y unas constantes del director (`TOPE_AGENTES = 12`). Lo que la
pantalla enseñaba y lo que el director decidía no tenían por qué coincidir.
"""
import unittest

import contenedores_nube as C


class SitioLibre(unittest.TestCase):
    def test_medio_vacio_tiene_todos_sus_huecos(self):
        cat = {"jobs_simultaneos": 3, "agentes_por_job": 4}
        self.assertEqual(C.libres_de(cat, agentes_ahora=0, runs_ahora=0), 12)

    def test_un_job_vivo_quita_un_job_de_sitio(self):
        cat = {"jobs_simultaneos": 3, "agentes_por_job": 4}
        self.assertEqual(C.libres_de(cat, agentes_ahora=4, runs_ahora=1), 8)

    def test_lleno_no_tiene_sitio(self):
        cat = {"jobs_simultaneos": 3, "agentes_por_job": 4}
        self.assertEqual(C.libres_de(cat, agentes_ahora=12, runs_ahora=3), 0)

    def test_se_cuenta_por_jobs_no_por_agentes_sueltos(self):
        # Medio job no existe: la unidad que se lanza es el job.
        cat = {"jobs_simultaneos": 2, "agentes_por_job": 4}
        self.assertEqual(C.libres_de(cat, agentes_ahora=1, runs_ahora=1), 4)

    def test_un_medio_sin_jobs_no_tiene_sitio_aunque_este_vacio(self):
        # Colab y Cloud Run: capacidad de catálogo pero sin forma de lanzar todavía.
        self.assertEqual(C.libres_de({"jobs_simultaneos": 0, "agentes_por_job": 0}, 0, 0), 0)

    def test_mas_agentes_de_los_que_caben_no_inventa_sitio(self):
        cat = {"jobs_simultaneos": 2, "agentes_por_job": 3}
        self.assertEqual(C.libres_de(cat, agentes_ahora=99, runs_ahora=1), 0)


class FichaDelContenedor(unittest.TestCase):
    def _gh(self, estado):
        return {"id": "nube-gh", "nombre": "GitHub Actions", "estado": estado,
                "detalle": "9 clave(s) de proveedor", "siguiente_paso": "lanzar"}

    def test_usable_es_desplegable_y_dice_su_maquina(self):
        c = C.contenedor(self._gh("usable"), C.CATALOGO["nube-gh"], {})
        self.assertTrue(c["desplegable"])
        self.assertEqual(c["agentes_libres"], 12)
        self.assertIn("4 vCPU", c["maquina"])
        self.assertIn("GitHub", c["proveedor"])
        self.assertEqual(c["falta"], "")

    def test_lo_que_requiere_a_alex_no_es_desplegable_y_dice_que_falta(self):
        c = C.contenedor(self._gh("requiere_alex"), C.CATALOGO["nube-gh"], {})
        self.assertFalse(c["desplegable"])
        self.assertEqual(c["agentes_libres"], 0)
        self.assertIn("clave", c["falta"])

    def test_los_agentes_vivos_bajan_el_sitio_libre(self):
        vivos = {"nube-gh": {"agentes": 8, "runs": 2}}
        c = C.contenedor(self._gh("listo"), C.CATALOGO["nube-gh"], vivos)
        self.assertEqual(c["agentes_ahora"], 8)
        self.assertEqual(c["agentes_libres"], 4)

    def test_un_medio_sin_catalogo_no_rompe_la_ficha(self):
        c = C.contenedor({"id": "raro", "estado": "usable"}, {}, {})
        self.assertEqual(c["agentes_libres"], 0)
        self.assertFalse(c["desplegable"])


class Totales(unittest.TestCase):
    def test_suma_lo_de_ahora_lo_libre_y_el_tope(self):
        conts = [
            {"id": "a", "estado": "usable", "agentes_ahora": 4, "agentes_libres": 8,
             "jobs_simultaneos": 3, "agentes_por_job": 4},
            {"id": "b", "estado": "requiere_alex", "agentes_ahora": 0, "agentes_libres": 0,
             "jobs_simultaneos": 0, "agentes_por_job": 0},
        ]
        r = C.resumir(conts)
        self.assertEqual(r["agentes_ahora"], 4)
        self.assertEqual(r["agentes_libres"], 8)
        self.assertEqual(r["agentes_tope"], 12)
        self.assertEqual(r["usables"], 1)
        self.assertEqual(r["por_hacer"], 1)

    def test_el_tope_solo_cuenta_los_usables(self):
        # Un medio por abrir no es capacidad: prometerla es exactamente lo que no queremos.
        conts = [{"id": "colab", "estado": "requiere_alex", "agentes_ahora": 0,
                  "agentes_libres": 0, "jobs_simultaneos": 4, "agentes_por_job": 4}]
        self.assertEqual(C.resumir(conts)["agentes_tope"], 0)


class LaMacNoEsUnContenedorDeNube(unittest.TestCase):
    def test_la_mac_y_claude_quedan_fuera(self):
        self.assertIn("mac", C.NO_SON_CONTENEDORES)
        self.assertIn("claude", C.NO_SON_CONTENEDORES)


if __name__ == "__main__":
    unittest.main()
