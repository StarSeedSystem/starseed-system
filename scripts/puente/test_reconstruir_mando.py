# -*- coding: utf-8 -*-
"""El reconstructor del Mando: cuándo compilar y, sobre todo, cuándo NO insistir."""
import os
import shutil
import tempfile
import unittest
from unittest import mock

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

    def test_si_la_paro_el_disco_se_reintenta_a_los_10_min_y_no_a_la_hora(self):
        # 25-09: la build del arreglo del Exocortex la paró el vigilante de disco; con las
        # fuentes bien, esperar 1 h dejaba la pantalla vieja. Vale también el estado antiguo,
        # que solo trae el texto del error.
        viejo = {"huella_construida": "aaa", "ok": False, "huella_intentada": "bbb", "t": 0,
                 "error": "PARADA: el disco bajó de 1.5 GB libres en plena build"}
        hazlo, motivo = R.decidir("bbb", viejo, ahora=300, espera_tras_fallo_s=3600, mas_nuevas=2)
        self.assertFalse(hazlo)
        self.assertIn("disco", motivo)
        hazlo, _ = R.decidir("bbb", viejo, ahora=R.ESPERA_TRAS_DISCO_S + 1,
                             espera_tras_fallo_s=3600, mas_nuevas=2)
        self.assertTrue(hazlo)
        nuevo = {"huella_construida": "aaa", "ok": False, "huella_intentada": "bbb", "t": 0,
                 "por_disco": True, "error": "otra cosa"}
        hazlo, _ = R.decidir("bbb", nuevo, ahora=R.ESPERA_TRAS_DISCO_S + 1, espera_tras_fallo_s=3600)
        self.assertTrue(hazlo)

    def test_un_error_de_codigo_sigue_esperando_la_hora(self):
        estado = {"huella_construida": "aaa", "ok": False, "huella_intentada": "bbb", "t": 0,
                  "error": "Type error: algo"}
        hazlo, _ = R.decidir("bbb", estado, ahora=R.ESPERA_TRAS_DISCO_S + 1, espera_tras_fallo_s=3600)
        self.assertFalse(hazlo)
        self.assertFalse(R.fallo_por_disco(estado))

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

    def test_las_pruebas_no_rehacen_la_build(self):
        # (2026-09-25) Arreglar un test rehacía una build de 10-40 min.
        self.assertTrue(R.es_prueba("src/lib/network/culture-discovery.test.ts"))
        self.assertTrue(R.es_prueba("src/lib/mando/__tests__/memorias.ts"))
        self.assertTrue(R.es_prueba("src/components/boton.stories.tsx"))
        self.assertFalse(R.es_prueba("src/lib/test-utils.ts"))
        self.assertFalse(R.es_prueba("src/components/mando/panel-memorias.tsx"))
        raiz = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(raiz, "src", "lib", "__tests__"))
            for rel in ("src/lib/a.ts", "src/lib/a.test.ts", "src/lib/__tests__/b.ts"):
                open(os.path.join(raiz, rel), "w").close()
            self.assertEqual([e[0] for e in R._entradas(raiz)], [os.path.join("src", "lib", "a.ts")])
        finally:
            shutil.rmtree(raiz)


class LoEditadoDuranteLaBuildNoSePierde(unittest.TestCase):
    """(2026-09-23) Un archivo editado mientras compilaba debe contar como más nuevo."""

    def test_las_marcas_se_fechan_al_empezar(self):
        import tempfile, time as _t
        raiz = tempfile.mkdtemp()
        dist = os.path.join(raiz, R.DIST_BUILD)
        os.makedirs(dist)
        for nombre in ("BUILD_ID", "build-manifest.json"):
            with open(os.path.join(dist, nombre), "w") as f:
                f.write("x")
        inicio = _t.time() - 540  # la build empezó hace 9 min
        R.marcar_listo(raiz=raiz, dist=R.DIST_BUILD, inicio=inicio)
        for nombre in (R.MARCA_LISTO, "BUILD_ID", "build-manifest.json"):
            self.assertAlmostEqual(os.stat(os.path.join(dist, nombre)).st_mtime, inicio, delta=1)
        editado_durante = int((inicio + 240) * 1e9)  # 4 min después de empezar
        ref = os.stat(os.path.join(dist, R.MARCA_LISTO)).st_mtime_ns
        self.assertEqual(R.cuantas_mas_nuevas(ref, [("src/lib/aurora/engine.ts", editado_durante, 1)]), 1)

    def test_sin_inicio_se_comporta_como_antes(self):
        import tempfile
        raiz = tempfile.mkdtemp()
        os.makedirs(os.path.join(raiz, R.DIST_BUILD))
        R.marcar_listo(raiz=raiz, dist=R.DIST_BUILD)
        self.assertTrue(os.path.exists(os.path.join(raiz, R.DIST_BUILD, R.MARCA_LISTO)))


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


class NoCompilarSinSitio(unittest.TestCase):
    """(2026-09-22, medido) El disco de Alex al 99 % y la build muerta a mitad:

        [Error: ENOSPC: no space left on device, open '.next-build/diagnostics/…']

    Compilar aparte cuesta un directorio más. Vale más decirlo antes que fallar después.
    """

    def test_con_sitio_de_sobra_se_compila(self):
        self.assertTrue(R.hay_sitio_para_compilar(40.0))

    def test_justo_en_el_minimo_se_compila(self):
        self.assertTrue(R.hay_sitio_para_compilar(R.MINIMO_LIBRE_GB))

    def test_por_debajo_del_minimo_no_se_compila(self):
        self.assertFalse(R.hay_sitio_para_compilar(3.6))

    def test_sin_medida_no_se_bloquea_el_trabajo(self):
        """No poder medir el disco no puede ser motivo para dejar la pantalla vieja."""
        self.assertTrue(R.hay_sitio_para_compilar(None))


class ServirLoQueHayEnElDisco(unittest.TestCase):
    """(2026-09-22, MEDIDO) Un 200 impecable sirviendo un build que ya no existe.

    El plist del Mando tiene `KeepAlive`: `launchctl kill SIGTERM` no para nada, launchd
    relanza el servidor antes del cambio de directorio y levanta el build VIEJO. Un
    segundo después ese build se va del disco y la pantalla se queda en «Midiendo el pulso
    del trabajo…» para siempre, con la consola diciendo:

        Refused to execute script … MIME type ('text/html') is not executable
    """

    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, True)
        self.chunks = os.path.join(self.raiz, R.DIST_SERVIDO, "static", "chunks")
        os.makedirs(self.chunks, exist_ok=True)

    def _hay(self, nombre):
        with open(os.path.join(self.chunks, nombre), "w", encoding="utf-8") as f:
            f.write("//")

    def test_saca_el_chunk_del_html(self):
        html = '<script src="/_next/static/chunks/webpack-d2bbf8601d41ad89.js" async></script>'
        self.assertEqual(R.chunk_del_html(html), "webpack-d2bbf8601d41ad89.js")

    def test_sin_chunk_no_hay_pista(self):
        self.assertIsNone(R.chunk_del_html("<html></html>"))
        self.assertIsNone(R.chunk_del_html(""))
        self.assertIsNone(R.chunk_del_html(None))

    def test_el_que_sirve_existe_en_el_disco(self):
        self._hay("webpack-d2bbf8601d41ad89.js")
        html = '<script src="/_next/static/chunks/webpack-d2bbf8601d41ad89.js"></script>'
        self.assertTrue(R.sirve_lo_que_hay_en_disco(html, self.raiz))

    def test_el_caso_real_del_22_de_septiembre(self):
        self._hay("webpack-d2bbf8601d41ad89.js")          # lo que había en el disco
        html = '<script src="/_next/static/chunks/webpack-68ad2f16eee5d4c9.js"></script>'
        self.assertFalse(R.sirve_lo_que_hay_en_disco(html, self.raiz))

    def test_sin_pista_no_se_acusa_a_nadie(self):
        """Un HTML del que no se saca nada no puede declarar roto al Mando."""
        self.assertTrue(R.sirve_lo_que_hay_en_disco("", self.raiz))
        self.assertTrue(R.sirve_lo_que_hay_en_disco("<html></html>", self.raiz))


class RecogerLoPropioAntesDeRendirse(unittest.TestCase):
    """(2026-09-22) «no compilo: quedan 4,0 GB» con 532 MB de `.next-anterior` en el disco.

    Negarse a compilar sin sitio es correcto. Negarse sin haber recogido primero lo que la
    compilación anterior dejó tirado, no.
    """

    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, True)

    def _crear(self, nombre):
        os.makedirs(os.path.join(self.raiz, nombre), exist_ok=True)
        with open(os.path.join(self.raiz, nombre, "x"), "w", encoding="utf-8") as f:
            f.write("x")

    def test_tira_el_build_anterior_y_el_de_trabajo(self):
        self._crear(".next-anterior")
        self._crear(R.DIST_BUILD)
        quitados = R.liberar_lo_propio(self.raiz)
        self.assertEqual(sorted(quitados), sorted([".next-anterior", R.DIST_BUILD]))
        self.assertFalse(os.path.exists(os.path.join(self.raiz, ".next-anterior")))

    def test_no_toca_el_build_que_se_esta_sirviendo(self):
        self._crear(R.DIST_SERVIDO)
        R.liberar_lo_propio(self.raiz)
        self.assertTrue(os.path.exists(os.path.join(self.raiz, R.DIST_SERVIDO)))

    def test_sin_nada_que_tirar_no_dice_que_tiro_algo(self):
        self.assertEqual(R.liberar_lo_propio(self.raiz), [])


class UnSoloReinicioALaVez(unittest.TestCase):
    """(2026-09-22, MEDIDO) El Mando se quedó apagado DOS veces, las dos igual.

    `publicar.py` y el reconstructor reinician los dos por aquí. Uno hacía `bootout` justo
    entre el `bootstrap` y la comprobación del otro: el segundo veía el servicio cargado,
    escribía «Mando reiniciado: la pantalla ya sirve el código nuevo» y se iba, mientras el
    primero lo acababa de tirar. Resultado en pantalla: nada, ni en `launchctl list`, ni
    proceso, ni nada escuchando en el 9002.
    """

    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, True)
        self.cerrojo = os.path.join(self.raiz, "reinicio.lock")

    def test_el_primero_se_lo_lleva(self):
        self.assertTrue(R._tomar_cerrojo(self.cerrojo, espera_s=1))

    def test_el_segundo_no_entra_mientras_el_primero_lo_tenga(self):
        R._tomar_cerrojo(self.cerrojo, espera_s=1)
        self.assertFalse(R._tomar_cerrojo(self.cerrojo, espera_s=1))

    def test_al_soltarlo_vuelve_a_estar_libre(self):
        R._tomar_cerrojo(self.cerrojo, espera_s=1)
        R._soltar_cerrojo(self.cerrojo)
        self.assertTrue(R._tomar_cerrojo(self.cerrojo, espera_s=1))

    def test_un_cerrojo_viejo_no_bloquea_para_siempre(self):
        """Si el dueño murió sin soltarlo, nadie podría reiniciar el Mando nunca más."""
        os.makedirs(self.cerrojo)
        os.utime(self.cerrojo, (0, 0))
        self.assertTrue(R._tomar_cerrojo(self.cerrojo, espera_s=1, caduca_s=5))

    def test_esperar_poco_no_convierte_en_basura_un_cerrojo_reciente(self):
        """Esperar poco y dar por muerto a otro son dos cosas distintas."""
        R._tomar_cerrojo(self.cerrojo, espera_s=1)
        self.assertFalse(R._tomar_cerrojo(self.cerrojo, espera_s=1, caduca_s=600))



class LaCacheSeMueveNoSeDuplica(unittest.TestCase):
    """(2026-09-23) El clon APFS dejó el disco en 124 MB: webpack reescribe casi todos sus
    paquetes y cada uno reescrito ocupaba dos veces. La caché se mueve, no se copia."""

    def setUp(self):
        import tempfile
        self.raiz = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.raiz, ".next", "cache", "webpack"))
        os.makedirs(os.path.join(self.raiz, ".next", "cache", "images"))
        with open(os.path.join(self.raiz, ".next", "cache", "webpack", "0.pack"), "w") as f:
            f.write("x")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.raiz, ignore_errors=True)

    def _hay(self, *partes):
        return os.path.exists(os.path.join(self.raiz, *partes))

    def test_preparar_mueve_la_cache_de_webpack_y_deja_la_de_imagenes(self):
        R.preparar_dist_de_build(self.raiz)
        self.assertTrue(self._hay(".next-build", "cache", "webpack", "0.pack"))
        self.assertFalse(self._hay(".next", "cache", "webpack"))
        self.assertTrue(self._hay(".next", "cache", "images"))

    def test_una_build_fallida_devuelve_la_cache_antes_de_limpiar(self):
        R.preparar_dist_de_build(self.raiz)
        quitados = R.liberar_lo_propio(self.raiz)
        self.assertTrue(self._hay(".next", "cache", "webpack", "0.pack"))
        self.assertFalse(self._hay(".next-build"))
        self.assertIn(".next-build", quitados)

    def test_preparar_dos_veces_seguidas_no_pierde_la_cache(self):
        R.preparar_dist_de_build(self.raiz)
        R.preparar_dist_de_build(self.raiz)
        self.assertTrue(self._hay(".next-build", "cache", "webpack", "0.pack"))

    def test_devolver_no_pisa_una_cache_servida(self):
        R.preparar_dist_de_build(self.raiz)
        os.makedirs(os.path.join(self.raiz, ".next", "cache", "webpack"))
        self.assertFalse(R.devolver_cache(self.raiz))
        self.assertTrue(self._hay(".next-build", "cache", "webpack", "0.pack"))

    def test_sin_cache_no_falla(self):
        import shutil
        shutil.rmtree(os.path.join(self.raiz, ".next", "cache", "webpack"))
        R.preparar_dist_de_build(self.raiz)
        self.assertFalse(self._hay(".next-build", "cache", "webpack"))



class LaBuildSeParaAntesDeLlenarElDisco(unittest.TestCase):
    """(2026-09-23) Dos veces hoy hubo que parar la build a mano con 124 MB libres."""

    def test_si_el_disco_baja_del_minimo_se_para_y_lo_dice(self):
        t0 = __import__("time").time()
        rc, salida, por_disco = R.compilar_vigilando_disco(
            ["sleep", "30"], minimo_gb=1.5, cada_s=0.05, medir=lambda: 0.4)
        self.assertTrue(por_disco)
        self.assertNotEqual(rc, 0)
        self.assertIn("PARADA", salida)
        self.assertLess(__import__("time").time() - t0, 5)

    def test_con_disco_de_sobra_termina_normal(self):
        rc, salida, por_disco = R.compilar_vigilando_disco(
            ["sh", "-c", "echo hecho"], minimo_gb=1.5, cada_s=0.05, medir=lambda: 50.0)
        self.assertEqual((rc, por_disco), (0, False))
        self.assertIn("hecho", salida)

    def test_mata_al_grupo_entero_no_solo_al_padre(self):
        import os, tempfile, time
        marca = tempfile.mktemp()
        rc, _, por_disco = R.compilar_vigilando_disco(
            ["sh", "-c", "(sleep 1; touch %s) & wait" % marca],
            minimo_gb=1.5, cada_s=0.05, medir=lambda: 0.1)
        time.sleep(1.5)
        self.assertTrue(por_disco)
        self.assertFalse(os.path.exists(marca), "el nieto siguió vivo y escribió")

    def test_si_no_se_puede_medir_no_se_para(self):
        rc, _, por_disco = R.compilar_vigilando_disco(
            ["true"], minimo_gb=1.5, cada_s=0.05, medir=lambda: None)
        self.assertEqual((rc, por_disco), (0, False))

    def test_el_umbral_de_entrada_ya_no_es_el_de_la_cache_duplicada(self):
        self.assertLessEqual(R.MINIMO_LIBRE_GB, 5.0)
        self.assertGreater(R.MINIMO_LIBRE_GB, R.MINIMO_DURANTE_GB)


class NoSeCompilaEnPlenaConversacion(unittest.TestCase):
    def test_lee_la_concesion(self):
        import json, tempfile, time
        ruta = tempfile.mktemp()
        with open(ruta, "w") as f:
            json.dump({"hasta": time.time() + 60}, f)
        self.assertTrue(R.conversando(ruta))
        with open(ruta, "w") as f:
            json.dump({"hasta": time.time() - 1}, f)
        self.assertFalse(R.conversando(ruta))
        self.assertFalse(R.conversando(ruta + ".no-existe"))


class UnFalloNoBorraLoQueSeSirve(unittest.TestCase):
    """25-09: tras una build parada por el disco, el estado perdía `build_servido` y la pasada
    siguiente reiniciaba el Mando sin motivo (y el reinicio anotaba ok=True)."""

    def test_el_fallo_conserva_build_servido_y_anota_el_disco(self):
        guardados = []
        previo = {"build_servido": "SERVIDO123", "huella_construida": "aaa", "ok": True}
        with mock.patch.object(R, "_leer_estado", return_value=dict(previo)), \
                mock.patch.object(R, "_guardar", side_effect=lambda d, *a, **k: guardados.append(dict(d))), \
                mock.patch.object(R, "preparar_dist_de_build"), \
                mock.patch.object(R, "liberar_lo_propio", return_value=[]), \
                mock.patch.object(R, "marcar_listo") as listo, \
                mock.patch.object(R, "reiniciar_mando") as reinicio, \
                mock.patch.object(R, "compilar_vigilando_disco",
                                  return_value=(1, "PARADA: el disco bajó de 1.5 GB libres", True)):
            datos = R.reconstruir("bbb")
        final = guardados[-1]
        self.assertEqual(final["build_servido"], "SERVIDO123")
        self.assertIs(final["ok"], False)
        self.assertIs(final["por_disco"], True)
        self.assertEqual(final["huella_intentada"], "bbb")
        self.assertIs(datos["ok"], False)
        listo.assert_not_called()
        reinicio.assert_not_called()
        hazlo, _ = R.decidir_reinicio("SERVIDO123", final["build_servido"])
        self.assertFalse(hazlo)


class NoSeCompilaConAstrauraEnUso(unittest.TestCase):
    """25-09: una build dejó el BitNet a 0,07 tok/s y Astraura no respondía en ningún medio."""

    def test_uso_reciente_del_usuario_bloquea(self):
        self.assertTrue(R.astraura_en_uso_por({"ultimo_uso_interactivo_hace_s": 8, "dormido": False}))

    def test_sin_uso_reciente_o_dormida_no_bloquea(self):
        self.assertFalse(R.astraura_en_uso_por({"ultimo_uso_interactivo_hace_s": 5000}))
        self.assertFalse(R.astraura_en_uso_por({"ultimo_uso_interactivo_hace_s": 8, "dormido": True}))
        self.assertFalse(R.astraura_en_uso_por({"ultimo_uso_interactivo_hace_s": None}))
        self.assertFalse(R.astraura_en_uso_por("roto"))

    def test_backend_apagado_no_bloquea(self):
        self.assertFalse(R.astraura_en_uso("http://127.0.0.1:9", timeout=1))

    def test_la_pasada_espera_y_no_compila(self):
        with mock.patch.object(R, "_entradas", return_value=[]), \
                mock.patch.object(R, "huella_de", return_value="bbb"), \
                mock.patch.object(R, "_leer_estado", return_value={"huella_construida": "aaa", "ok": True}), \
                mock.patch.object(R, "cuantas_mas_nuevas", return_value=3), \
                mock.patch.object(R, "mtime_del_build", return_value=0), \
                mock.patch.object(R, "conversando", return_value=False), \
                mock.patch.object(R, "astraura_en_uso", return_value=True), \
                mock.patch.object(R, "reconstruir") as rec:
            self.assertFalse(R.una_pasada())
        rec.assert_not_called()

