# -*- coding: utf-8 -*-
"""Pruebas de freno por mismo motivo (freno_mismo_motivo.py)."""
import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import freno_mismo_motivo as F  # noqa: E402


class MotivoDe(unittest.TestCase):
    """Pruebas de la función `motivo_de`."""

    def test_minusculas_y_recorte(self):
        self.assertEqual(F.motivo_de("FALLO EN EL CÓDIGO"), "fallo en el código")
        larga = "a" * 100
        self.assertEqual(len(F.motivo_de(larga)), 80)

    def test_elimina_numeros_e_ids(self):
        self.assertEqual(F.motivo_de("Tarea TG1 falló con error 404"), "tarea  falló con error ")
        self.assertEqual(F.motivo_de("ID: zN4-123 fallo"), "id:  fallo")

    def test_elimina_rutas(self):
        self.assertEqual(F.motivo_de("Error en src/lib/algo.ts línea 42"), "error en  línea ")
        self.assertEqual(F.motivo_de("/home/user/proyecto/archivo.py"), "  ")

    def test_normaliza_la_nube_dijo(self):
        self.assertEqual(F.motivo_de('la nube dijo «sin_cambios»'), "sin_cambios")
        self.assertEqual(F.motivo_de('LA NUBE DIJO «FALLO_TSC»'), "fallo_tsc")
        self.assertEqual(F.motivo_de('la nube dijo "rechazada"'), "rechazada")

    def test_nota_vacia(self):
        self.assertEqual(F.motivo_de(""), "")
        self.assertEqual(F.motivo_de(None), "")

    def test_solo_texto_relevante(self):
        self.assertEqual(F.motivo_de("fallo tsc en el archivo principal"), "fallo tsc en el archivo principal")


class FrenarPorMismoMotivo(unittest.TestCase):
    """Pruebas de la función `frenar_por_mismo_motivo`."""

    def _entrada(self, estado, nota, fin=None):
        e = {"estado": estado, "nota": nota}
        if fin is not None:
            e["fin"] = fin
        return e

    def test_siete_de_diez_mismo_motivo_frena(self):
        """7 de 10 iguales → frena y la frase contiene el motivo y '7 de las últimas 10'."""
        entradas = [
            self._entrada("fallo", "la nube dijo «sin_cambios» por timeout", 100),
            self._entrada("fallo", "la nube dijo «sin_cambios» por timeout", 101),
            self._entrada("fallo", "la nube dijo «sin_cambios» por timeout", 102),
            self._entrada("fallo", "la nube dijo «sin_cambios» por timeout", 103),
            self._entrada("fallo", "la nube dijo «sin_cambios» por timeout", 104),
            self._entrada("fallo", "la nube dijo «sin_cambios» por timeout", 105),
            self._entrada("fallo", "la nube dijo «sin_cambios» por timeout", 106),
            self._entrada("hecho", "integrada correctamente", 107),
            self._entrada("hecho", "integrada correctamente", 108),
            self._entrada("hecho", "integrada correctamente", 109),
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertTrue(frena)
        self.assertIn("7 de las últimas 10", frase)
        self.assertIn("sin_cambios", frase)
        self.assertIn("timeout", frase)

    def test_siete_de_diez_motivos_distintos_no_frena(self):
        """7 de 10 pero con motivos distintos → no frena."""
        entradas = [
            self._entrada("fallo", "la nube dijo «sin_cambios» por timeout", 100),
            self._entrada("fallo", "la nube dijo «fallo_tsc» por tipos", 101),
            self._entrada("fallo", "la nube dijo «fallo_tests» por test roto", 102),
            self._entrada("fallo", "la nube dijo «rechazada» por revisor", 103),
            self._entrada("fallo", "la nube dijo «fallo» por error genérico", 104),
            self._entrada("fallo", "la nube dijo «sin_cambios» por memoria", 105),
            self._entrada("fallo", "la nube dijo «sin_cambios» por red", 106),
            self._entrada("hecho", "ok", 107),
            self._entrada("hecho", "ok", 108),
            self._entrada("hecho", "ok", 109),
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertFalse(frena)
        self.assertEqual(frase, "")

    def test_menos_de_minimo_terminadas_no_frena(self):
        """Menos de `minimo` terminadas → no frena."""
        entradas = [
            self._entrada("fallo", "la nube dijo «sin_cambios»", 100),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 101),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 102),
            self._entrada("hecho", "ok", 103),
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertFalse(frena)
        self.assertEqual(frase, "")

    def test_todas_bien_no_frena(self):
        """Todas bien → no frena."""
        entradas = [
            self._entrada("hecho", "integrada", 100),
            self._entrada("integrada", "ok", 101),
            self._entrada("ok", "hecho", 102),
            self._entrada("hecho", "lista", 103),
            self._entrada("hecho", "lista", 104),
            self._entrada("hecho", "lista", 105),
            self._entrada("hecho", "lista", 106),
            self._entrada("hecho", "lista", 107),
            self._entrada("hecho", "lista", 108),
            self._entrada("hecho", "lista", 109),
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertFalse(frena)
        self.assertEqual(frase, "")

    def test_ordenacion_por_fin(self):
        """Ordenación por `fin`: toma las más recientes según `fin`, no por orden recibido."""
        entradas = [
            self._entrada("fallo", "la nube dijo «sin_cambios» antiguo", 50),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 200),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 201),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 202),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 203),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 204),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 205),
            self._entrada("hecho", "ok", 206),
            self._entrada("hecho", "ok", 207),
            self._entrada("hecho", "ok", 208),
        ]
        # Las 10 entradas, pero las 5 antiguas no deberían contar si solo miramos las 10 más recientes por fin
        # Aquí todas tienen fin, así que se ordenan por fin y toman las 10 más recientes (que son todas)
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertTrue(frena)
        self.assertIn("reciente", frase)

    def test_sin_fin_usa_orden_recibido(self):
        """Sin `fin`, usa el orden recibido."""
        entradas = [
            {"estado": "fallo", "nota": "la nube dijo «sin_cambios» primero"},
            {"estado": "fallo", "nota": "la nube dijo «sin_cambios» segundo"},
            {"estado": "fallo", "nota": "la nube dijo «sin_cambios» tercero"},
            {"estado": "fallo", "nota": "la nube dijo «sin_cambios» cuarto"},
            {"estado": "fallo", "nota": "la nube dijo «sin_cambios» quinto"},
            {"estado": "hecho", "nota": "ok"},
            {"estado": "hecho", "nota": "ok"},
            {"estado": "hecho", "nota": "ok"},
            {"estado": "hecho", "nota": "ok"},
            {"estado": "hecho", "nota": "ok"},
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertTrue(frena)
        self.assertIn("5 de las últimas 10", frase)

    def test_nota_vacia_no_rompe(self):
        """Nota vacía no rompe y no cuenta como motivo."""
        entradas = [
            self._entrada("fallo", "", 100),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 101),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 102),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 103),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 104),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 105),
            self._entrada("hecho", "ok", 106),
            self._entrada("hecho", "ok", 107),
            self._entrada("hecho", "ok", 108),
            self._entrada("hecho", "ok", 109),
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        # 6 fallos con motivo, 1 fallo sin motivo, 4 hechas = 7 terminadas con motivo de 10
        self.assertTrue(frena)

    def test_entradas_raras_none_numeros_no_rompen(self):
        """Entradas raras (None, números) no lanzan excepción."""
        entradas = [
            None,
            123,
            "no es dict",
            self._entrada("fallo", "la nube dijo «sin_cambios»", 100),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 101),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 102),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 103),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 104),
            self._entrada("hecho", "ok", 105),
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertTrue(frena)
        self.assertIn("5 de las últimas", frase)

    def test_estados_buenos_se_ignoran(self):
        """Estados en hecho/integrada/ok se ignoran para el conteo de fallos."""
        entradas = [
            self._entrada("fallo", "la nube dijo «sin_cambios»", 100),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 101),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 102),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 103),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 104),
            self._entrada("hecho", "ok", 105),
            self._entrada("integrada", "ok", 106),
            self._entrada("ok", "hecho", 107),
            self._entrada("pendiente", "esperando", 108),  # no es estado bueno
            self._entrada("en_progreso", "escribiendo", 109),  # no es estado bueno
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        # 5 fallos con mismo motivo de 8 terminadas (excluye hechas/integradas/ok) = 5/8 = 0.625 >= 0.6
        self.assertTrue(frena)

    def test_umbral_no_alcanzado_no_frena(self):
        """Si la fracción no alcanza el umbral, no frena."""
        entradas = [
            self._entrada("fallo", "la nube dijo «sin_cambios»", 100),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 101),
            self._entrada("fallo", "la nube dijo «fallo_tsc»", 102),
            self._entrada("fallo", "la nube dijo «fallo_tests»", 103),
            self._entrada("fallo", "la nube dijo «rechazada»", 104),
            self._entrada("hecho", "ok", 105),
            self._entrada("hecho", "ok", 106),
            self._entrada("hecho", "ok", 107),
            self._entrada("hecho", "ok", 108),
            self._entrada("hecho", "ok", 109),
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        # 5 terminadas con fallos, pero motivos distintos: 1/5 cada uno < 0.6
        self.assertFalse(frena)

    def test_ventana_mas_pequena_que_entradas(self):
        """Si hay más entradas que la ventana, solo se miran las `ventana` más recientes."""
        entradas = [
            self._entrada("fallo", "la nube dijo «sin_cambios» antiguo", 50),
            self._entrada("fallo", "la nube dijo «sin_cambios» antiguo", 51),
            self._entrada("fallo", "la nube dijo «sin_cambios» antiguo", 52),
            self._entrada("fallo", "la nube dijo «otro_motivo»", 53),
            self._entrada("fallo", "la nube dijo «otro_motivo»", 54),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 200),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 201),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 202),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 203),
            self._entrada("fallo", "la nube dijo «sin_cambios» reciente", 204),
            self._entrada("hecho", "ok", 205),
            self._entrada("hecho", "ok", 206),
        ]
        # Ventana=10, toma las 10 más recientes (fin 205..196 aprox)
        # De esas 10: 5 con sin_cambios reciente, 1 ok, 1 ok, 2 otro_motivo, 1 sin_cambios antiguo
        # Terminadas (excluyendo ok/hecho/integrada): 8
        # Con mismo motivo (sin_cambios): 6/8 = 0.75 >= 0.6
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        self.assertTrue(frena)

    def test_solo_fallo_fallo_tsc_fallo_tests_rechazada_sin_cambios_cuentan(self):
        """Solo esos 5 estados cuentan como fallos para el freno."""
        entradas = [
            self._entrada("sin_cambios", "la nube dijo «sin_cambios»", 100),
            self._entrada("fallo", "la nube dijo «sin_cambios»", 101),
            self._entrada("fallo_tsc", "la nube dijo «sin_cambios»", 102),
            self._entrada("fallo_tests", "la nube dijo «sin_cambios»", 103),
            self._entrada("rechazada", "la nube dijo «sin_cambios»", 104),
            self._entrada("error", "la nube dijo «sin_cambios»", 105),  # no cuenta
            self._entrada("bloqueada", "la nube dijo «sin_cambios»", 106),  # no cuenta
            self._entrada("hecho", "ok", 107),
            self._entrada("hecho", "ok", 108),
            self._entrada("hecho", "ok", 109),
        ]
        frena, frase = F.frenar_por_mismo_motivo(entradas, ventana=10, minimo=5, umbral=0.6)
        # 5 fallos válidos con mismo motivo de 7 terminadas válidas = 5/7 ≈ 0.71 >= 0.6
        self.assertTrue(frena)


if __name__ == "__main__":
    unittest.main()