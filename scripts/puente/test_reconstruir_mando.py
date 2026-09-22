# -*- coding: utf-8 -*-
"""El reconstructor del Mando: cuándo compilar y, sobre todo, cuándo NO insistir."""
import os
import shutil
import tempfile
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


class CompilarSinTirarLoServido(unittest.TestCase):
    """(2026-09-22) «Internal Server Error» durante toda la compilación.

    `next start` lee `.next` EN CALIENTE. Compilar encima del directorio servido lo borra
    y lo reescribe, y mientras tanto el Mando contesta:

        ⨯ Error: ENOENT: no such file or directory, open '.next/required-server-files.json'

    Desde hoy se compila en `.next-build` y el cambio se hace con el servidor parado.
    """

    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, True)

    def _build(self, dist, build_id, listo=True, cuando=None):
        os.makedirs(os.path.join(self.raiz, dist), exist_ok=True)
        rutas = [os.path.join(self.raiz, dist, "BUILD_ID")]
        with open(rutas[0], "w", encoding="utf-8") as f:
            f.write(build_id)
        if listo:
            rutas.append(os.path.join(self.raiz, dist, R.MARCA_LISTO))
            with open(rutas[-1], "w", encoding="utf-8") as f:
                f.write("ya")
        if cuando is not None:  # relojes explícitos: el test no depende del disco
            for r in rutas:
                os.utime(r, (cuando, cuando))

    # ── la marca ────────────────────────────────────────────────────────────
    def test_build_a_medias_no_esta_terminado(self):
        """Un `next build` interrumpido también deja BUILD_ID: no basta con mirar eso."""
        self._build(R.DIST_BUILD, "aaa", listo=False)
        self.assertFalse(R.build_terminado(self.raiz))

    def test_build_con_marca_esta_terminado(self):
        self._build(R.DIST_BUILD, "aaa")
        self.assertTrue(R.build_terminado(self.raiz))

    def test_sin_directorio_no_esta_terminado(self):
        self.assertFalse(R.build_terminado(self.raiz))

    def test_marcar_listo_escribe_la_marca(self):
        self._build(R.DIST_BUILD, "aaa", listo=False)
        R.marcar_listo(self.raiz)
        self.assertTrue(R.build_terminado(self.raiz))

    # ── de dónde se lee el identificador ────────────────────────────────────
    def test_id_lee_el_servido_por_defecto(self):
        self._build(R.DIST_SERVIDO, "servido")
        self._build(R.DIST_BUILD, "recien")
        self.assertEqual(R.id_del_build(self.raiz), "servido")

    def test_id_puede_leer_el_recien_compilado(self):
        self._build(R.DIST_SERVIDO, "servido")
        self._build(R.DIST_BUILD, "recien")
        self.assertEqual(R.id_del_build(self.raiz, dist=R.DIST_BUILD), "recien")

    # ── qué build cuenta como «lo más nuevo que hay» ────────────────────────
    def test_mtime_cuenta_el_build_que_espera_el_cambio(self):
        """Si no, se recompilaría una y otra vez lo que ya está hecho esperando turno."""
        self._build(R.DIST_SERVIDO, "viejo", cuando=1000)
        viejo = os.stat(os.path.join(self.raiz, R.DIST_SERVIDO, "BUILD_ID")).st_mtime_ns
        self._build(R.DIST_BUILD, "nuevo", cuando=2000)
        self.assertGreater(R.mtime_del_build(self.raiz), viejo)

    def test_mtime_ignora_un_build_a_medias(self):
        self._build(R.DIST_SERVIDO, "viejo", cuando=1000)
        viejo = os.stat(os.path.join(self.raiz, R.DIST_SERVIDO, "BUILD_ID")).st_mtime_ns
        self._build(R.DIST_BUILD, "nuevo", listo=False, cuando=2000)
        self.assertEqual(R.mtime_del_build(self.raiz), viejo)

    def test_mtime_sin_ningun_build_es_none(self):
        self.assertIsNone(R.mtime_del_build(self.raiz))

    # ── el manifiesto no puede quedar mintiendo ─────────────────────────────
    def test_normalizar_dist_arregla_el_directorio_del_manifiesto(self):
        texto = '{"config":{"distDir":".next-build"},"files":[".next-build/routes.json"]}'
        self.assertEqual(
            R.normalizar_dist(texto),
            '{"config":{"distDir":".next"},"files":[".next/routes.json"]}')

    def test_normalizar_dist_no_toca_un_manifiesto_ya_correcto(self):
        texto = '{"config":{"distDir":".next"},"files":[".next/routes.json"]}'
        self.assertEqual(R.normalizar_dist(texto), texto)

    def test_normalizar_dist_no_estropea_nombres_parecidos(self):
        texto = '{"x":".next-buildero/a"}'
        self.assertEqual(R.normalizar_dist(texto), texto)
