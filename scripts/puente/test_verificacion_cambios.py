# -*- coding: utf-8 -*-
"""Pruebas del verificador por cambio: integrado no es lo mismo que aplicado."""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import verificacion_cambios as V


def archivo(ruta, presente=True, borrado=False, importadores=None, ejecutable=False):
    return {
        "ruta": ruta,
        "presente": presente,
        "borrado": borrado,
        "importadores": importadores or [],
        "ejecutable": ejecutable,
    }


def cambio(**kw):
    base = {
        "sha": "abc1234",
        "titulo": "un cambio",
        "ts": 1000,
        "en_origin": True,
        "archivos": [],
        "pruebas_verdes": True,
    }
    base.update(kw)
    return base


class PruebaCableado(unittest.TestCase):
    def test_una_ruta_no_necesita_que_nadie_la_importe(self):
        ok, motivo = V.cableado_de("src/app/api/mando/medidores/route.ts", [])
        self.assertTrue(ok)
        self.assertIn("ruta", motivo)

    def test_una_prueba_tampoco(self):
        self.assertTrue(V.cableado_de("src/lib/__tests__/x.test.ts", [])[0])
        self.assertTrue(V.cableado_de("scripts/puente/test_x.py", [])[0])

    def test_un_ejecutable_no_necesita_que_nadie_lo_importe(self):
        ok, motivo = V.cableado_de("scripts/puente/publicar.py", [], ejecutable=True)
        self.assertTrue(ok)
        self.assertIn("ejecutable", motivo)

    def test_un_modulo_que_nadie_importa_es_huerfano(self):
        ok, motivo = V.cableado_de("src/lib/mando/reportes.ts", [])
        self.assertFalse(ok)
        self.assertIn("HUÉRFANO", motivo)

    def test_no_cuenta_que_se_mencione_a_si_mismo(self):
        ok, _ = V.cableado_de("src/lib/mando/reportes.ts", ["src/lib/mando/reportes.ts"])
        self.assertFalse(ok)

    def test_con_quien_lo_importa_queda_cableado_y_se_dice_quien(self):
        ok, motivo = V.cableado_de(
            "src/lib/mando/reportes.ts", ["src/components/mando/panel-reportes.tsx"]
        )
        self.assertTrue(ok)
        self.assertIn("panel-reportes.tsx", motivo)

    def test_un_markdown_no_necesita_cableado(self):
        self.assertTrue(V.cableado_de("memory/roadmap.md", [])[0])


class PruebaVeredicto(unittest.TestCase):
    def test_todo_en_orden(self):
        v = V.verificar_cambio(
            cambio(archivos=[archivo("src/app/api/x/route.ts")]), build_ts=2000
        )
        self.assertTrue(v["integrado"])
        self.assertTrue(v["aplicado"])
        self.assertIn("servido", v["porque"])

    def test_sin_llegar_a_origin_no_esta_ni_integrado(self):
        v = V.verificar_cambio(cambio(en_origin=False), build_ts=2000)
        self.assertFalse(v["integrado"])
        self.assertFalse(v["aplicado"])
        self.assertIn("origin/main", v["porque"])

    def test_integrado_pero_huerfano_no_es_aplicado(self):
        v = V.verificar_cambio(
            cambio(archivos=[archivo("src/lib/mando/reportes.ts")]), build_ts=2000
        )
        self.assertTrue(v["integrado"])
        self.assertFalse(v["aplicado"])
        self.assertIn("nadie lo usa", v["porque"])

    def test_la_build_anterior_al_commit_significa_que_no_se_ve(self):
        v = V.verificar_cambio(
            cambio(ts=3000, archivos=[archivo("src/app/api/x/route.ts")]), build_ts=2000
        )
        self.assertTrue(v["integrado"])
        self.assertFalse(v["aplicado"])
        self.assertIn("build viva es anterior", v["porque"])
        self.assertFalse(v["servido"])

    def test_un_archivo_que_no_esta_en_el_arbol_se_nombra(self):
        v = V.verificar_cambio(
            cambio(archivos=[archivo("src/lib/x.ts", presente=False)]), build_ts=2000
        )
        self.assertFalse(v["aplicado"])
        self.assertIn("src/lib/x.ts", v["porque"])

    def test_un_borrado_a_proposito_no_cuenta_como_falta(self):
        v = V.verificar_cambio(
            cambio(archivos=[archivo("src/lib/viejo.ts", presente=False, borrado=True)]),
            build_ts=2000,
        )
        self.assertTrue(v["aplicado"])

    def test_pruebas_en_rojo_tumban_el_veredicto(self):
        v = V.verificar_cambio(
            cambio(pruebas_verdes=False, archivos=[archivo("src/app/api/x/route.ts")]),
            build_ts=2000,
        )
        self.assertFalse(v["aplicado"])
        self.assertIn("pruebas", v["porque"])

    def test_sin_saber_la_build_no_se_castiga_el_cambio(self):
        v = V.verificar_cambio(
            cambio(archivos=[archivo("src/app/api/x/route.ts")]), build_ts=None
        )
        self.assertTrue(v["aplicado"])
        self.assertIsNone(v["servido"])


class PruebaResumen(unittest.TestCase):
    def test_sin_nada(self):
        self.assertIn("nada que publicar", V.resumen([]))

    def test_todo_aplicado_se_dice_en_singular_y_plural(self):
        uno = V.verificar_cambio(
            cambio(archivos=[archivo("src/app/api/x/route.ts")]), build_ts=2000
        )
        self.assertIn("1 cambio publicado", V.resumen([uno]))
        self.assertIn("2 cambios publicados", V.resumen([uno, dict(uno)]))

    def test_se_nombra_lo_que_no_cuajo(self):
        bueno = V.verificar_cambio(
            cambio(sha="aaa", archivos=[archivo("src/app/api/x/route.ts")]), build_ts=2000
        )
        malo = V.verificar_cambio(
            cambio(sha="bbb", archivos=[archivo("src/lib/huerfano.ts")]), build_ts=2000
        )
        texto = V.resumen([bueno, malo])
        self.assertIn("bbb", texto)
        self.assertIn("nadie lo usa", texto)


class PruebaFechaDelContenido(unittest.TestCase):
    """La build se compara con el CONTENIDO en disco, no con la fecha del commit.

    Construir → verificar → commitear es el orden normal, y deja el commit más
    nuevo que la build aunque la build se hiciera con ese mismo código. Mirando
    la fecha del commit, un cambio que SÍ se estaba viendo en pantalla salía
    como «aún no se ve»."""

    def test_el_contenido_manda_sobre_la_fecha_del_commit(self):
        v = V.verificar_cambio(
            cambio(ts=5000, ts_contenido=1000, archivos=[archivo("src/app/api/x/route.ts")]),
            build_ts=2000,
        )
        self.assertTrue(v["servido"])
        self.assertTrue(v["aplicado"])

    def test_sin_fecha_de_contenido_se_cae_a_la_del_commit(self):
        v = V.verificar_cambio(
            cambio(ts=5000, ts_contenido=None, archivos=[archivo("src/app/api/x/route.ts")]),
            build_ts=2000,
        )
        self.assertFalse(v["servido"])

    def test_contenido_mas_nuevo_que_la_build_si_avisa(self):
        v = V.verificar_cambio(
            cambio(ts=1000, ts_contenido=9000, archivos=[archivo("src/app/api/x/route.ts")]),
            build_ts=2000,
        )
        self.assertFalse(v["servido"])
        self.assertIn("build viva es anterior", v["porque"])


class PruebaQueEmpaquetaLaBuild(unittest.TestCase):
    def test_reconoce_lo_que_la_build_sirve(self):
        self.assertTrue(V.sirve_la_build("src/lib/x.ts"))
        self.assertTrue(V.sirve_la_build("public/logo.png"))
        self.assertTrue(V.sirve_la_build("next.config.ts"))
        self.assertFalse(V.sirve_la_build("scripts/puente/publicar.py"))
        self.assertFalse(V.sirve_la_build("memory/roadmap.md"))

    def test_un_cambio_solo_de_scripts_no_espera_a_ninguna_build(self):
        # Un script del puente corre directo del repo: preguntarle a la build si
        # ya lo sirve no significa nada, y antes hacía que saliera «aún no se ve».
        v = V.verificar_cambio(
            cambio(ts=9000, archivos=[archivo("scripts/puente/publicar.py", ejecutable=True)]),
            build_ts=2000,
        )
        self.assertTrue(v["aplicado"])
        self.assertIsNone(v["servido"])
        self.assertIn("corren directo del repo", v["motivo_servido"])


if __name__ == "__main__":
    unittest.main()
