# -*- coding: utf-8 -*-
"""El reconstructor del Mando: cuándo compilar y, sobre todo, cuándo NO insistir."""
import unittest

import reconstruir_mando as R


class Huella(unittest.TestCase):
    def test_el_orden_del_disco_no_cambia_la_huella(self):
        # Si la huella variase según el orden, el servicio reconstruiría en cada pasada.
        a = R.huella_de([("b.ts", 2, 20), ("a.ts", 1, 10)])
        b = R.huella_de([("a.ts", 1, 10), ("b.ts", 2, 20)])
        self.assertEqual(a, b)

    def test_un_archivo_tocado_cambia_la_huella(self):
        a = R.huella_de([("a.ts", 1, 10)])
        b = R.huella_de([("a.ts", 2, 10)])
        self.assertNotEqual(a, b)

    def test_un_archivo_mas_cambia_la_huella(self):
        a = R.huella_de([("a.ts", 1, 10)])
        b = R.huella_de([("a.ts", 1, 10), ("b.ts", 1, 1)])
        self.assertNotEqual(a, b)


class Decidir(unittest.TestCase):
    def test_sin_build_registrado_se_reconstruye(self):
        hazlo, motivo = R.decidir("aaa", {}, ahora=1000)
        self.assertTrue(hazlo)
        self.assertIn("no hay build", motivo)

    def test_al_dia_no_se_toca(self):
        hazlo, motivo = R.decidir("aaa", {"huella_construida": "aaa", "ok": True}, ahora=1000)
        self.assertFalse(hazlo)
        self.assertIn("al día", motivo)

    def test_fuentes_cambiadas_se_reconstruye(self):
        # Este es el caso de Alex: el arreglo está en el disco y la pantalla es de antes.
        hazlo, motivo = R.decidir("bbb", {"huella_construida": "aaa", "ok": True}, ahora=1000)
        self.assertTrue(hazlo)
        self.assertIn("cambiaron", motivo)

    def test_no_se_insiste_con_un_build_rojo_de_las_mismas_fuentes(self):
        estado = {"huella_construida": "aaa", "ok": False, "huella_intentada": "bbb", "t": 900}
        hazlo, motivo = R.decidir("bbb", estado, ahora=1000, espera_tras_fallo_s=3600)
        self.assertFalse(hazlo)
        self.assertIn("falló", motivo)

    def test_tras_la_espera_se_vuelve_a_intentar(self):
        estado = {"huella_construida": "aaa", "ok": False, "huella_intentada": "bbb", "t": 0}
        hazlo, _ = R.decidir("bbb", estado, ahora=99999, espera_tras_fallo_s=3600)
        self.assertTrue(hazlo)

    def test_un_cambio_nuevo_no_espera_al_fallo_anterior(self):
        # Si Alex arregla el error, su cambio entra ya: la espera era para fuentes idénticas.
        estado = {"huella_construida": "aaa", "ok": False, "huella_intentada": "bbb", "t": 999}
        hazlo, _ = R.decidir("ccc", estado, ahora=1000, espera_tras_fallo_s=3600)
        self.assertTrue(hazlo)

    def test_estado_corrupto_no_rompe_la_decision(self):
        hazlo, _ = R.decidir("aaa", "esto no es un dict", ahora=1000)
        self.assertTrue(hazlo)

    def test_marca_de_tiempo_ilegible_no_bloquea_para_siempre(self):
        estado = {"huella_construida": "aaa", "ok": False, "huella_intentada": "bbb", "t": "ayer"}
        hazlo, _ = R.decidir("bbb", estado, ahora=1000)
        self.assertTrue(hazlo)


class ErrorLegible(unittest.TestCase):
    def test_se_queda_con_la_linea_de_tipo(self):
        salida = "creando build...\n./src/a.tsx\nType error: no existe 'foo'.\nmás ruido\n"
        self.assertIn("Type error", R.primera_linea_de_error(salida))

    def test_sin_linea_clara_devuelve_la_ultima_con_texto(self):
        self.assertEqual(R.primera_linea_de_error("uno\ndos\n\n"), "dos")

    def test_sin_salida_lo_dice(self):
        self.assertEqual(R.primera_linea_de_error(""), "sin salida")


class NoReconstruyePorLoQueNoCompila(unittest.TestCase):
    def test_las_colas_y_los_scripts_no_estan_en_las_fuentes(self):
        # Cambian cada minuto por el propio enjambre: reconstruirían sin motivo.
        self.assertNotIn("scripts", R.FUENTES)
        self.assertNotIn("starseed_memory_root", R.FUENTES)

    def test_el_build_anterior_no_se_cuenta_como_fuente(self):
        self.assertIn(".next", R.IGNORADOS)
        self.assertIn("node_modules", R.IGNORADOS)


if __name__ == "__main__":
    unittest.main()


class MirarElBuildEnVezDeUnCuaderno(unittest.TestCase):
    """La pregunta real: ¿el código es más nuevo que lo que se está sirviendo?

    Con esto da igual quién compiló, y eso importa: `publicar.py` ya pasa `next build`
    como puerta antes de empujar, así que su build deja la pantalla al día y este
    servicio no repite otros diez minutos de build detrás. (2026-09-22)
    """

    def test_sin_build_todo_cuenta_como_mas_nuevo(self):
        entradas = [("a.ts", 5, 1), ("b.ts", 7, 1)]
        self.assertEqual(R.cuantas_mas_nuevas(None, entradas), 2)

    def test_solo_cuentan_las_posteriores_al_build(self):
        entradas = [("viejo.ts", 5, 1), ("nuevo.ts", 50, 1), ("igual.ts", 10, 1)]
        self.assertEqual(R.cuantas_mas_nuevas(10, entradas), 1)

    def test_build_mas_nuevo_que_todo_es_estar_al_dia(self):
        entradas = [("a.ts", 5, 1), ("b.ts", 7, 1)]
        self.assertEqual(R.cuantas_mas_nuevas(100, entradas), 0)

    def test_al_dia_manda_sobre_la_huella_distinta(self):
        # Huella distinta pero build recién hecho por otro (publicar.py): no se repite.
        hazlo, motivo = R.decidir("bbb", {"huella_construida": "aaa", "ok": True},
                                  ahora=1000, mas_nuevas=0)
        self.assertFalse(hazlo)
        self.assertIn("al día", motivo)

    def test_con_fuentes_mas_nuevas_se_reconstruye_y_se_dice_cuantas(self):
        hazlo, motivo = R.decidir("bbb", {"huella_construida": "bbb", "ok": True},
                                  ahora=1000, mas_nuevas=3)
        self.assertTrue(hazlo)
        self.assertIn("3 archivo", motivo)

    def test_el_build_rojo_sigue_sin_repetirse(self):
        estado = {"huella_construida": "aaa", "ok": False, "huella_intentada": "bbb", "t": 900}
        hazlo, motivo = R.decidir("bbb", estado, ahora=1000, espera_tras_fallo_s=3600,
                                  mas_nuevas=2)
        self.assertFalse(hazlo)
        self.assertIn("falló", motivo)


class CompilarNoEsServir(unittest.TestCase):
    """`next start` lee `.next` al arrancar: un build nuevo en el disco no se ve solo."""

    def test_un_build_distinto_del_servido_pide_reinicio(self):
        reinicia, motivo = R.decidir_reinicio("abc123def456", "viejo000")
        self.assertTrue(reinicia)
        self.assertIn("más nuevo", motivo)

    def test_el_mismo_build_no_se_reinicia(self):
        reinicia, motivo = R.decidir_reinicio("abc123", "abc123")
        self.assertFalse(reinicia)
        self.assertIn("ya sirve", motivo)

    def test_sin_build_no_hay_nada_que_servir(self):
        reinicia, _ = R.decidir_reinicio(None, "abc123")
        self.assertFalse(reinicia)

    def test_build_ajeno_nunca_servido_pide_reinicio(self):
        # El caso de publicar.py: compiló como puerta y nadie reinició el Mando.
        reinicia, _ = R.decidir_reinicio("nuevo123", None)
        self.assertTrue(reinicia)


class NoCompilarDosVecesLoMismo(unittest.TestCase):
    """Si la publicación va a compilar, su build sirve: aquí se espera."""

    def _pub(self, estado, build):
        return {"estado": estado, "pasos": [{"clave": "tsc", "estado": "ok"},
                                            {"clave": "build", "estado": build}]}

    def test_publicacion_con_build_pendiente_frena(self):
        self.assertTrue(R.publicacion_va_a_compilar(self._pub("corriendo", "pendiente")))

    def test_publicacion_compilando_frena(self):
        self.assertTrue(R.publicacion_va_a_compilar(self._pub("corriendo", "corriendo")))

    def test_publicacion_que_ya_compilo_no_frena(self):
        # Su build ya está en el disco: si hay cambios posteriores, hay que compilarlos.
        self.assertFalse(R.publicacion_va_a_compilar(self._pub("corriendo", "ok")))

    def test_publicacion_terminada_no_frena(self):
        self.assertFalse(R.publicacion_va_a_compilar(self._pub("hecho", "ok")))

    def test_sin_publicacion_no_frena(self):
        self.assertFalse(R.publicacion_va_a_compilar(None))
        self.assertFalse(R.publicacion_va_a_compilar({}))

    def test_publicacion_sin_paso_de_build_no_frena(self):
        self.assertFalse(R.publicacion_va_a_compilar({"estado": "corriendo", "pasos": []}))
