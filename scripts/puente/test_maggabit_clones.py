# -*- coding: utf-8 -*-
"""Versiones diarias del Maggabit (MAG1117): reglas de retención y copia.

Herméticas: no tocan /Volumes, la red, ~/.starseed ni el disco real. El reloj,
el subprocess, el listado y el borrado se inyectan siempre.
"""
import datetime as dt
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import maggabit_clones as V  # noqa: E402

HOY = dt.date(2026, 11, 18)


def dias(n):
    """Nombres AAAA-MM-DD de los últimos n días, hoy incluido."""
    return sorted(
        ((HOY - dt.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)),
        reverse=True,
    )


def esperado(diarios, semanales):
    """Lo que debe sobrevivir: los días indicados más las fechas semanales."""
    return set(diarios) | set(semanales)


class Calendarios(unittest.TestCase):
    def test_un_solo_dia_crea_el_de_hoy_y_no_poda(self):
        r = V.plan(HOY, [])
        self.assertEqual("2026-11-18", r["crear"])
        self.assertEqual([], r["podar"])

    def test_quince_dias_no_podan_ninguno(self):
        r = V.plan(HOY, dias(15))
        self.assertIsNone(r["crear"])
        self.assertEqual([], r["podar"])

    def test_cuarenta_dias_conserva_los_diarios_y_una_por_semana(self):
        r = V.plan(HOY, dias(40))
        self.assertIsNone(r["crear"])
        self.assertEqual(21, len(r["podar"]))
        semanales = ["2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-10"]
        self.assertEqual(esperado(dias(14), semanales), set(dias(40)) - set(r["podar"]))

    def test_ciento_veinte_dias_topa_en_ocho_semanas(self):
        r = V.plan(HOY, dias(120))
        self.assertEqual(98, len(r["podar"]))
        semanales = [
            "2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12",
            "2026-10-05", "2026-09-28", "2026-09-21", "2026-09-14",
        ]
        self.assertEqual(esperado(dias(14), semanales), set(dias(120)) - set(r["podar"]))

    def test_el_mas_antiguo_de_cada_semana_es_el_que_sobrevive(self):
        r = V.plan(HOY, dias(40))
        supervivientes = set(dias(40)) - set(r["podar"])
        self.assertIn("2026-10-26", supervivientes)
        for hermano in ("2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"):
            self.assertNotIn(hermano, supervivientes)

    def test_hoy_ya_presente_no_se_vuelve_a_crear(self):
        r = V.plan(HOY, ["2026-11-18", "2026-11-17"])
        self.assertIsNone(r["crear"])
        self.assertEqual([], r["podar"])

    def test_hoy_nunca_se_poda_aunque_haya_fechas_futuras(self):
        futuras = [(HOY + dt.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(30)]
        r = V.plan(HOY, futuras + ["2026-11-18"])
        self.assertIsNone(r["crear"])
        self.assertNotIn("2026-11-18", r["podar"])


class CarpetasAjenas(unittest.TestCase):
    def test_nombres_que_no_son_fecha_no_se_tocan_jamas(self):
        ajenas = ["fotos", "respaldo-ayer", "2026-02-30", "2026-13-01", "2026-1-01", "hoy"]
        r = V.plan(HOY, ajenas + dias(15))
        self.assertEqual([], r["podar"])
        for nombre in ajenas:
            self.assertNotIn(nombre, r["podar"])

    def test_una_fecha_invalida_no_cuenta_como_version(self):
        r = V.plan(HOY, ["2026-02-30", "2026-00-10", "sin-fecha"])
        self.assertEqual("2026-11-18", r["crear"])
        self.assertEqual([], r["podar"])


class CapaDeEntradaSalida(unittest.TestCase):
    TRABAJO = "/trabajo-falso"

    def test_volumen_ausente_no_espera_ni_toca_nada(self):
        llamadas = []

        def prohibido(*args, **kwargs):
            llamadas.append(args)
            raise AssertionError("no se debe tocar la E/S con el volumen ausente")

        r = V.ejecutar_dia(
            self.TRABAJO,
            HOY,
            ismount=lambda _ruta: False,
            listar=prohibido,
            ejecutar=prohibido,
            borrar=prohibido,
        )
        self.assertEqual(V.AUSENTE, r["estado"])
        self.assertIsNone(r["crear"])
        self.assertEqual([], r["podar"])
        self.assertEqual([], llamadas)

    def test_volumen_presente_clona_con_cp_apfs_y_timeout(self):
        vistas = []

        def ejecutar(orden, **opciones):
            vistas.append((orden, opciones))
            return subprocess.CompletedProcess(orden, 0, "", "")

        r = V.ejecutar_dia(
            self.TRABAJO,
            HOY,
            ismount=lambda _ruta: True,
            listar=lambda _ruta: [],
            ejecutar=ejecutar,
            crear_carpeta=lambda _ruta: None,
            borrar=lambda _ruta: None,
            es_directorio=lambda _ruta: True,
        )
        self.assertEqual(V.HECHO, r["estado"])
        orden, opciones = vistas[0]
        self.assertEqual("cp", orden[0])
        self.assertIn("-cR", orden)
        self.assertTrue(orden[2].endswith(os.path.join("respaldo", "desarrollo")))
        self.assertTrue(orden[3].endswith(os.path.join("versiones", "2026-11-18")))
        self.assertIsNotNone(opciones.get("timeout"))
        self.assertGreater(opciones["timeout"], 0)

    def test_subproceso_sin_respuesta_no_cuelga_ni_poda(self):
        borrados = []

        def ejecutar(orden, **_opciones):
            raise subprocess.TimeoutExpired(orden, V.TIMEOUT_S)

        r = V.ejecutar_dia(
            self.TRABAJO,
            HOY,
            ismount=lambda _ruta: True,
            listar=lambda _ruta: [],
            ejecutar=ejecutar,
            crear_carpeta=lambda _ruta: None,
            borrar=lambda ruta: borrados.append(ruta),
        )
        self.assertEqual(V.SIN_RESPUESTA, r["estado"])
        self.assertEqual([], r["podar"])
        self.assertEqual([], borrados)

    def test_un_clon_con_error_no_poda(self):
        borrados = []

        def ejecutar(orden, **_opciones):
            return subprocess.CompletedProcess(orden, 1, "", "sin espacio")

        r = V.ejecutar_dia(
            self.TRABAJO,
            HOY,
            ismount=lambda _ruta: True,
            listar=lambda _ruta: [],
            ejecutar=ejecutar,
            crear_carpeta=lambda _ruta: None,
            borrar=lambda ruta: borrados.append(ruta),
        )
        self.assertEqual(V.ERROR, r["estado"])
        self.assertEqual([], r["podar"])
        self.assertEqual([], borrados)

    def test_la_poda_solo_borra_fechas_dentro_de_versiones(self):
        borrados = []

        def borrar(ruta):
            borrados.append(ruta)

        r = V.podar(
            self.TRABAJO,
            ["2026-01-01", "nota", "2026-02-30"],
            borrar=borrar,
            es_directorio=lambda _ruta: True,
        )
        self.assertEqual(["2026-01-01"], r["borrados"])
        self.assertEqual(1, len(borrados))
        self.assertTrue(borrados[0].endswith(os.path.join("versiones", "2026-01-01")))
        self.assertNotIn("respaldo", borrados[0])

    def test_nunca_se_borra_un_nombre_ajeno_aunque_llegue_en_la_lista(self):
        borrados = []
        r = V.podar(
            self.TRABAJO,
            ["fotos", "2026-11-01"],
            borrar=borrados.append,
            es_directorio=lambda _ruta: True,
        )
        self.assertEqual(["2026-11-01"], r["borrados"])
        self.assertFalse(any("fotos" in ruta for ruta in borrados))

    def test_un_directorio_que_no_existe_no_se_borra(self):
        r = V.podar(
            self.TRABAJO,
            ["2026-01-01"],
            borrar=lambda _ruta: (_ for _ in ()).throw(AssertionError("no borrar")),
            es_directorio=lambda _ruta: False,
        )
        self.assertEqual([], r["borrados"])

    def test_leer_versiones_ordena_y_tolera_un_disco_que_falla(self):
        self.assertEqual(
            ["2026-01-01", "2026-01-02"],
            V.leer_versiones(self.TRABAJO, listar=lambda _ruta: ["2026-01-02", "2026-01-01"]),
        )
        self.assertEqual([], V.leer_versiones(self.TRABAJO, listar=_falla))

    def test_si_hoy_ya_existe_no_clona_y_solo_poda(self):
        llamadas = []

        def ejecutar(orden, **_opciones):
            llamadas.append(orden)
            return subprocess.CompletedProcess(orden, 0, "", "")

        r = V.ejecutar_dia(
            self.TRABAJO,
            HOY,
            ismount=lambda _ruta: True,
            listar=lambda _ruta: dias(40),
            ejecutar=ejecutar,
            crear_carpeta=lambda _ruta: None,
            borrar=lambda _ruta: None,
            es_directorio=lambda _ruta: True,
        )
        self.assertEqual(V.HECHO, r["estado"])
        self.assertIsNone(r["crear"])
        self.assertEqual([], llamadas)
        self.assertEqual(21, len(r["podar"]))

    def test_si_no_se_puede_crear_la_carpeta_lo_dice_sin_podar(self):
        r = V.ejecutar_dia(
            self.TRABAJO,
            HOY,
            ismount=lambda _ruta: True,
            listar=lambda _ruta: [],
            ejecutar=lambda *_args, **_opciones: (_ for _ in ()).throw(
                AssertionError("no debe clonar")
            ),
            crear_carpeta=_falla,
            borrar=lambda _ruta: (_ for _ in ()).throw(AssertionError("no debe podar")),
        )
        self.assertEqual(V.ERROR, r["estado"])
        self.assertEqual([], r["podar"])


def _falla(_ruta):
    raise OSError("volumen ausente")


if __name__ == "__main__":
    unittest.main()
