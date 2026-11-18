# -*- coding: utf-8 -*-
"""Pruebas herméticas de Maggabit: manifiesto, plan de verificación y avisos (MAG09).

Solo tocan funciones puras y ejecutores falsos: nunca /Volumes, la red,
~/.starseed ni el disco real (contrato MAG1117, principio 0).
"""

import os
import subprocess
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import maggabit_verificar as MV

AHORA = 1_900_000_000.0


def fuente(**cambios):
    datos = {
        "ultimo_bueno": AHORA - 100.0,
        "ritmo": 3600.0,
        "tamano_bytes": 4096,
        "recuentos": {"archivos": 3},
        "ultimo_error": None,
        "casas": ["nube"],
    }
    datos.update(cambios)
    return datos


class PruebaManifiesto(unittest.TestCase):
    def test_al_dia_con_datos_pasados(self):
        m = MV.manifiesto("MAG09", {"cerebros": fuente()}, AHORA)
        f = m["fuentes"]["cerebros"]
        self.assertEqual(f["estado"], "al-dia")
        self.assertAlmostEqual(f["retraso_segundos"], 100.0)
        self.assertEqual(f["tamano_bytes"], 4096)
        self.assertEqual(f["recuentos"], {"archivos": 3})
        self.assertIsNone(f["ultimo_error"])
        self.assertEqual(m["medio"], "MAG09")
        self.assertEqual(m["generado"], AHORA)

    def test_atrasado_frente_al_ritmo(self):
        m = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_bueno=AHORA - 7200.0)}, AHORA)
        f = m["fuentes"]["fotos"]
        self.assertEqual(f["estado"], "atrasado")
        self.assertAlmostEqual(f["retraso_segundos"], 7200.0)

    def test_sin_respaldo_alguno(self):
        m = MV.manifiesto("MAG09", {"notas": fuente(ultimo_bueno=None)}, AHORA)
        f = m["fuentes"]["notas"]
        self.assertEqual(f["estado"], "sin-respaldo")
        self.assertIsNone(f["retraso_segundos"])
        self.assertIsNone(f["ultimo_bueno"])

    def test_reloj_por_delante_da_retraso_cero(self):
        m = MV.manifiesto("MAG09", {"raro": fuente(ultimo_bueno=AHORA + 500.0)}, AHORA)
        f = m["fuentes"]["raro"]
        self.assertEqual(f["retraso_segundos"], 0.0)
        self.assertEqual(f["estado"], "al-dia")

    def test_sin_ritmo_no_atrasa(self):
        m = MV.manifiesto("MAG09", {"x": fuente(ritmo=None)}, AHORA)
        self.assertEqual(m["fuentes"]["x"]["estado"], "al-dia")

    def test_solo_en_maggabit_sin_otra_casa(self):
        m = MV.manifiesto(
            "MAG09",
            {
                "con_otra_casa": fuente(casas=["nube"]),
                "huerfana": fuente(casas=[]),
                "sin_casas": fuente(casas=None),
            },
            AHORA,
        )
        self.assertEqual(m["solo_en_maggabit"], ["huerfana", "sin_casas"])

    def test_ultimo_error_se_pasa_al_manifiesto(self):
        m = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_error="disco lleno")}, AHORA)
        self.assertEqual(m["fuentes"]["fotos"]["ultimo_error"], "disco lleno")


class PruebaPlanVerificacion(unittest.TestCase):
    def test_bundle_verify_en_cada_pasada(self):
        plan = MV.plan_verificacion(
            AHORA,
            {"paquete": "respaldo.bundle", "fsck": AHORA, "restauracion": AHORA, "espejos": ["a"]},
        )
        self.assertEqual(plan, ["git bundle verify respaldo.bundle"])

    def test_sin_paquete_no_hay_bundle_ni_restauracion(self):
        plan = MV.plan_verificacion(AHORA, {"fsck": AHORA})
        self.assertEqual(plan, [])

    def test_fsck_semanal_primera_vez_corre_por_cada_espejo(self):
        plan = MV.plan_verificacion(AHORA, {"paquete": "p.bundle", "espejos": ["a", "b"]})
        self.assertIn("git fsck --connectivity-only a", plan)
        self.assertIn("git fsck --connectivity-only b", plan)

    def test_fsck_semanal_vencido_vuelve_a_correr(self):
        plan = MV.plan_verificacion(
            AHORA,
            {"paquete": "p.bundle", "fsck": AHORA - MV.SEMANA_SEGUNDOS, "espejos": ["a"]},
        )
        self.assertIn("git fsck --connectivity-only a", plan)

    def test_fsck_reciente_no_repite(self):
        plan = MV.plan_verificacion(
            AHORA,
            {
                "paquete": "p.bundle",
                "fsck": AHORA - 3600.0,
                "restauracion": AHORA - 3600.0,
                "espejos": ["a"],
            },
        )
        self.assertEqual(plan, ["git bundle verify p.bundle"])

    def test_restauracion_mensual_primera_vez(self):
        plan = MV.plan_verificacion(AHORA, {"paquete": "p.bundle", "fsck": AHORA})
        self.assertEqual(plan[-1], "restauracion-prueba p.bundle")

    def test_restauracion_mensual_vencida(self):
        plan = MV.plan_verificacion(
            AHORA,
            {"paquete": "p.bundle", "fsck": AHORA, "restauracion": AHORA - MV.MES_SEGUNDOS},
        )
        self.assertIn("restauracion-prueba p.bundle", plan)

    def test_restauracion_reciente_no_repite(self):
        plan = MV.plan_verificacion(
            AHORA,
            {"paquete": "p.bundle", "fsck": AHORA, "restauracion": AHORA - 3600.0},
        )
        self.assertEqual(plan, ["git bundle verify p.bundle"])


class PruebaAvisos(unittest.TestCase):
    def test_fallo_nuevo_se_dice_una_vez(self):
        antes = MV.manifiesto("MAG09", {"fotos": fuente()}, AHORA)
        despues = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_bueno=AHORA - 7200.0)}, AHORA + 1)
        self.assertEqual(MV.avisos(antes, despues), ["fotos: atrasado"])
        self.assertEqual(MV.avisos(despues, despues), [])

    def test_sin_respaldo_nuevo_avisa(self):
        antes = MV.manifiesto("MAG09", {"fotos": fuente()}, AHORA)
        despues = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_bueno=None)}, AHORA + 1)
        self.assertEqual(MV.avisos(antes, despues), ["fotos: sin-respaldo"])

    def test_ultimo_error_nuevo_avisa_con_el_texto(self):
        antes = MV.manifiesto("MAG09", {"fotos": fuente()}, AHORA)
        despues = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_error="disco lleno")}, AHORA + 1)
        self.assertEqual(MV.avisos(antes, despues), ["fotos: disco lleno"])

    def test_fallo_conocido_no_repite(self):
        antes = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_bueno=AHORA - 7200.0)}, AHORA)
        despues = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_bueno=AHORA - 9000.0)}, AHORA + 1)
        self.assertEqual(MV.avisos(antes, despues), [])

    def test_fallo_que_cambia_de_texto_no_repite(self):
        antes = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_error="disco lleno")}, AHORA)
        despues = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_error="otro fallo")}, AHORA + 1)
        self.assertEqual(MV.avisos(antes, despues), [])

    def test_recuperado_no_avisa(self):
        antes = MV.manifiesto("MAG09", {"fotos": fuente(ultimo_bueno=AHORA - 7200.0)}, AHORA)
        despues = MV.manifiesto("MAG09", {"fotos": fuente()}, AHORA + 1)
        self.assertEqual(MV.avisos(antes, despues), [])

    def test_manifiestos_vacios_o_incompletos(self):
        self.assertEqual(MV.avisos({}, {}), [])
        self.assertEqual(MV.avisos({"fuentes": {}}, {"medio": "MAG09"}), [])


class PruebaCapaFina(unittest.TestCase):
    """La E/S solo se prueba con falsos: jamás subprocess ni disco reales."""

    def test_timeout_da_sin_respuesta_y_no_cuelga(self):
        def lanzar(comando, **opciones):
            raise subprocess.TimeoutExpired(comando, float(opciones.get("timeout") or 0.0))

        r = MV.ejecutar_subproceso("algo", timeout=5.0, lanzar=lanzar)
        self.assertEqual(r["estado"], MV.SIN_RESPUESTA)
        self.assertEqual(r["salida"], "")
        self.assertIsNone(r["codigo"])

    def test_comando_bien_y_comando_mal(self):
        class ProcesoBien:
            returncode = 0
            stdout = "bien"
            stderr = ""

        r = MV.ejecutar_subproceso("algo", lanzar=lambda c, **o: ProcesoBien())
        self.assertEqual(r["estado"], "ok")
        self.assertEqual(r["salida"], "bien")

        class ProcesoMal:
            returncode = 1
            stdout = ""
            stderr = "fatal"

        r = MV.ejecutar_subproceso("algo", lanzar=lambda c, **o: ProcesoMal())
        self.assertEqual(r["estado"], "error")
        self.assertEqual(r["error"], "fatal")

    def test_medio_ausente_no_ejecuta_nada_ni_espera(self):
        llamadas = []

        def ejecutar(item, timeout):
            llamadas.append(item)
            return {"estado": "ok"}

        r = MV.verificar_medio(
            "/Volumes/no-esta",
            ["git bundle verify p.bundle"],
            existe=lambda ruta: False,
            ejecutar=ejecutar,
        )
        self.assertEqual(r, {"estado": "ausente", "resultados": []})
        self.assertEqual(llamadas, [])

    def test_raiz_vacia_cuenta_como_ausente(self):
        r = MV.verificar_medio("", [], existe=lambda ruta: True, ejecutar=lambda i, t: {})
        self.assertEqual(r["estado"], "ausente")

    def test_medio_presente_corre_el_plan_con_timeout(self):
        tiempos = []
        respuestas = iter([{"estado": "ok", "codigo": 0}, {"estado": MV.SIN_RESPUESTA}])

        def ejecutar(item, timeout):
            tiempos.append(timeout)
            return next(respuestas)

        r = MV.verificar_medio(
            "/Volumes/va", ["a", "b"], existe=lambda ruta: True, ejecutar=ejecutar, timeout=7.0
        )
        self.assertEqual(r["estado"], "presente")
        self.assertEqual([x["comando"] for x in r["resultados"]], ["a", "b"])
        self.assertEqual(r["resultados"][1]["estado"], MV.SIN_RESPUESTA)
        self.assertEqual(tiempos, [7.0, 7.0])

    def test_guardar_manifiesto_con_escritor_inyectado_no_toca_disco(self):
        escritos = []

        def escritor(ruta, contenido):
            escritos.append((ruta, contenido))

        escritas = MV.guardar_manifiesto(
            {"medio": "MAG09"},
            rutas=["MetaGenesis/estado/manifiesto.json", "~/.starseed/maggabit/estado.json"],
            escritor=escritor,
        )
        self.assertEqual(len(escritas), 2)
        self.assertTrue(escritas[1].endswith(".starseed/maggabit/estado.json"))
        self.assertEqual(len(escritos), 2)
        self.assertIn('"medio"', escritos[0][1])

    def test_guardar_manifiesto_sin_rutas_usa_las_destino(self):
        escritas = MV.guardar_manifiesto({}, escritor=lambda ruta, contenido: None)
        self.assertTrue(escritas[0].endswith("MetaGenesis/estado/manifiesto.json"))
        self.assertTrue(escritas[1].endswith(".starseed/maggabit/estado.json"))


if __name__ == "__main__":
    unittest.main()
