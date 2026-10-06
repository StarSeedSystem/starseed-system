# -*- coding: utf-8 -*-
<<<<<<< HEAD
"""Pruebas sin red del registro de límites del plan de Claude."""
=======
"""Límites del plan de Claude: lecturas, coste por revisión y proyección.
Solo en seco, sin red y sin secreto: solo NOMBRES de variables de entorno."""
import contextlib
import io
>>>>>>> 7a7c5cdd (salvavidas · LC1004A: trabajo del agente antes de las puertas (tsc / vitest))
import json
import os
import sys
import tempfile
import unittest
<<<<<<< HEAD
from datetime import datetime, timedelta, timezone
=======
import datetime as dt
>>>>>>> 7a7c5cdd (salvavidas · LC1004A: trabajo del agente antes de las puertas (tsc / vitest))

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import limites_claude as L


<<<<<<< HEAD
class LimitesClaude(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.archivo_anterior = L.ARCHIVO
        L.ARCHIVO = os.path.join(self.temporal.name, "limites.json")
        self.ahora = datetime(2026, 10, 4, 18, tzinfo=timezone.utc)

    def tearDown(self):
        L.ARCHIVO = self.archivo_anterior
        self.temporal.cleanup()

    def lectura(self, pct=10, minutos=-10, reinicio_horas=4):
        reinicio = (self.ahora + timedelta(hours=reinicio_horas)).isoformat()
        return {
            "t": (self.ahora + timedelta(minutes=minutos)).isoformat(),
            "sesion_pct": pct,
            "sesion_reinicio": reinicio,
            "semana_pct": pct,
            "semana_reinicio": (self.ahora + timedelta(days=3)).isoformat(),
            "modelo_nombre": None,
            "modelo_pct": None,
            "modelo_reinicio": None,
            "fuente": "prueba",
        }

    def test_coste_y_cambio_de_ventana(self):
        lecturas = []
        for pct in (10, 14, 20):
            lecturas.append(self.lectura(pct))
        otra = self.lectura(40)
        otra["sesion_reinicio"] = (self.ahora + timedelta(hours=9)).isoformat()
        lecturas.append(otra)
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 5)

    def test_disparos_periodicos(self):
        lista = [{"nombre": "revisión", "proxima": (self.ahora + timedelta(minutes=30)).isoformat(),
                  "cada_min": 60}]
        self.assertEqual(L.disparos_antes(lista, self.ahora, self.ahora + timedelta(minutes=150)), 3)

    def test_reinicio_pasado(self):
        resultado = L.estado({"lecturas": [self.lectura(72, reinicio_horas=-1)]}, self.ahora)
        self.assertEqual(resultado["sesion"]["pct"], 0)
        self.assertEqual(resultado["sesion"]["queda"], 100)
        self.assertTrue(resultado["sesion"]["reiniciada"])

    def test_proyeccion_tono_y_recomendacion(self):
        lecturas = []
        for sesion, semana in ((75, 82), (80, 83), (85, 84)):
            lectura = self.lectura(sesion)
            lectura["semana_pct"] = semana
            lecturas.append(lectura)
        lista = [{"nombre": str(i), "proxima": (self.ahora + timedelta(minutes=30 + i)).isoformat(),
                  "cada_min": None} for i in range(4)]
        resultado = L.estado({"lecturas": lecturas, "programadas": {"lista": lista}}, self.ahora)
        self.assertEqual(resultado["sesion"]["proyeccion"], 105)
        self.assertEqual(resultado["sesion"]["tono"], "peligro")
        self.assertEqual(resultado["recomendacion"],
                         "Espacia las revisiones: caben 1 hasta el reinicio de sesión")
        aviso = L.estado({"lecturas": lecturas, "programadas": {"lista": lista[:1]}}, self.ahora)
        self.assertEqual(aviso["sesion"]["tono"], "aviso")

    def test_desactualizada_y_porcentaje_invalido(self):
        vieja = self.lectura(20, minutos=-121)
        resultado = L.estado({"lecturas": [vieja]}, self.ahora)
        self.assertTrue(resultado["desactualizada"])
        self.assertEqual(resultado["sesion"]["tono"], "aviso")
        for valor in (-1, 101):
            with self.assertRaises(ValueError):
                L.anadir_lectura({}, self.lectura(valor))

    def test_cli_declara_programadas_y_recorta(self):
        reinicio = (self.ahora + timedelta(hours=5)).isoformat()
        self.assertEqual(L.main(["declarar", "--sesion", "12", "--sesion-reinicio", reinicio,
                                 "--semana", "23", "--semana-reinicio", reinicio]), 0)
        self.assertEqual(L.leer()["lecturas"][0]["sesion_pct"], 12)
        lista = [{"nombre": "salud", "proxima": reinicio, "cada_min": 60}]
        self.assertEqual(L.main(["programadas", "--json", json.dumps(lista)]), 0)
        self.assertEqual(L.leer()["programadas"]["lista"], lista)
        datos = {}
        for indice in range(205):
            lectura = self.lectura(indice % 100)
            lectura["t"] = (self.ahora + timedelta(seconds=indice)).isoformat()
            datos = L.anadir_lectura(datos, lectura)
        self.assertEqual(len(datos["lecturas"]), 200)


if __name__ == "__main__":
    unittest.main()
=======
class FalsoEstado:
    """Permite forzar lecturas para pruebas."""

    def __init__(self, lecturas=None):
        self.lecturas = lecturas or []

    def ahora(self):
        return self.lecturas[-1][0] if self.lecturas else None

    def __iter__(self):
        return iter(self.lecturas)


def _arch(conte):
    """Devuelve (datos, fd) para un archivo temporal."""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    try:
        json.dump(conte, tmp)
        tmp.close()
        return tmp.name
    except Exception:
        os.unlink(tmp.name)
        raise


def _test_env():
    """Establece STARSEED_LIMITES_CLAUDE a un archivo temporal con datos."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump({
            "lecturas": [],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }, f)
        path = f.name
    os.environ["STARSEED_LIMITES_CLAUDE"] = path
    return path


def _rest_env():
    if "STARSEED_LIMITES_CLAUDE" in os.environ:
        os.unlink(os.environ["STARSEED_LIMITES_CLAUDE"])
        del os.environ["STARSEED_LIMITES_CLAUDE"]


class AnadirLectura(unittest.TestCase):
    """anadir_lectura: valida e inserta, recorta a 200."""

    def setUp(self):
        self._path = _test_env()

    def tearDown(self):
        _rest_env()

    def test_validacion_pct_fuera_de_rango(self):
        datos = {"lecturas": [], "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []}, "umbral_pct": 90}
        with self.assertRaises(ValueError) as cm:
            L.anadir_lectura(datos, {"t": "2026-01-01T00:00:00Z", "sesion_pct": 150})
        self.assertIn("pct debe estar entre 0 y 100", str(cm.exception))

    def test_fecha_no_iso(self):
        datos = {"lecturas": [], "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []}, "umbral_pct": 90}
        with self.assertRaises(ValueError) as cm:
            L.anadir_lectura(datos, {"t": "2026-01-01", "sesion_pct": 50})
        self.assertIn("fecha inválida", str(cm.exception))

    def test_inserta_lectura(self):
        datos = {"lecturas": [], "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []}, "umbral_pct": 90}
        L.anadir_lectura(datos, {"t": "2026-01-01T00:00:00Z", "sesion_pct": 50, "sesion_reinicio": "2026-01-01T06:00:00Z"})
        self.assertEqual(len(datos["lecturas"]), 1)
        self.assertEqual(datos["lecturas"][0]["t"], "2026-01-01T00:00:00Z")
        self.assertEqual(datos["lecturas"][0]["sesion_pct"], 50)

    def test_recorta_a_200_lecturas(self):
        datos = {"lecturas": [], "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []}, "umbral_pct": 90}
        for i in range(205):
            L.anadir_lectura(datos, {"t": f"2026-01-01T00:{i:02d}Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"})
        self.assertEqual(len(datos["lecturas"]), 200)

    def test_ultima_lectura_el_final(self):
        datos = {"lecturas": [], "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []}, "umbral_pct": 90}
        L.anadir_lectura(datos, {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"})
        L.anadir_lectura(datos, {"t": "2026-01-01T01:00:00Z", "sesion_pct": 20})
        self.assertEqual(datos["lecturas"][-1]["t"], "2026-01-01T01:00:00Z")


class CostePorRevision(unittest.TestCase):
    """coste_por_revision: mediana de aumentos positivos de pct entre lecturas consecutivas con la misma ventana."""

    def test_lecturas_solas_no_cuentan(self):
        lecturas = [
            {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T01:00:00Z", "semana_pct": 20, "semana_reinicio": "2026-01-01T06:00:00Z"},
        ]
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 4)
        self.assertIsNone(L.coste_por_revision(lecturas, "semana"))
        self.assertIsNone(L.coste_por_revision(lecturas, "modelo"))

    def test_un_incremento_positivo(self):
        lecturas = [
            {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T01:00:00Z", "sesion_pct": 14, "sesion_reinicio": "2026-01-01T06:00:00Z"},
        ]
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 5)

    def test_medio_dos_aumentos(self):
        lecturas = [
            {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T01:00:00Z", "sesion_pct": 14, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T02:00:00Z", "sesion_pct": 20, "sesion_reinicio": "2026-01-01T06:00:00Z"},
        ]
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 5)

    def test_mediana_tres_aumentos(self):
        lecturas = [
            {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T01:00:00Z", "sesion_pct": 14, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T02:00:00Z", "sesion_pct": 25, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T03:00:00Z", "sesion_pct": 28, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T04:00:00Z", "sesion_pct": 30, "sesion_reinicio": "2026-01-01T06:00:00Z"},
        ]
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 3)

    def test_ignorar_disminuciones(self):
        lecturas = [
            {"t": "2026-01-01T00:00:00Z", "sesion_pct": 20, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T01:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T02:00:00Z", "sesion_pct": 15, "sesion_reinicio": "2026-01-01T06:00:00Z"},
        ]
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 5)

    def test_dos_ventanas_diferentes(self):
        lecturas = [
            {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T01:00:00Z", "sesion_pct": 14, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T02:00:00Z", "sesion_pct": 20, "sesion_reinicio": "2026-01-02T06:00:00Z"},
        ]
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 4)

    def test_sin_incrementos_positivos(self):
        lecturas = [
            {"t": "2026-01-01T00:00:00Z", "sesion_pct": 20, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T01:00:00Z", "sesion_pct": 15, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            {"t": "2026-01-01T02:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
        ]
        self.assertEqual(L.coste_por_revision(lecturas, "sesion"), 4)


class DisparosAntes(unittest.TestCase):
    """disparos_antes: cuenta triggers antes de cada reinicio."""

    def test_cada_min_0_se_ignora(self):
        ahora = "2026-01-01T06:00:00Z"
        hasta = "2026-01-01T09:00:00Z"
        lista = [
            {"proxima": "2026-01-01T06:30:00Z", "cada_min": 0},
        ]
        self.assertEqual(L.disparos_antes(lista, ahora, hasta), 0)

    def test_proxima_fuera_de_rango(self):
        ahora = "2026-01-01T06:00:00Z"
        hasta = "2026-01-01T09:00:00Z"
        lista = [
            {"proxima": "2026-01-01T10:00:00Z", "cada_min": 60},
        ]
        self.assertEqual(L.disparos_antes(lista, ahora, hasta), 0)

    def test_dentro_del_rango_sin_intervalo(self):
        ahora = "2026-01-01T06:00:00Z"
        hasta = "2026-01-01T09:00:00Z"
        lista = [
            {"proxima": "2026-01-01T06:30:00Z", "cada_min": 60},
        ]
        self.assertEqual(L.disparos_antes(lista, ahora, hasta), 1)

    def test_multiples_en_rango(self):
        ahora = "2026-01-01T06:00:00Z"
        hasta = "2026-01-01T09:00:00Z"
        lista = [
            {"proxima": "2026-01-01T06:30:00Z", "cada_min": 60},
            {"proxima": "2026-01-01T07:30:00Z", "cada_min": 60},
            {"proxima": "2026-01-01T08:30:00Z", "cada_min": 60},
        ]
        self.assertEqual(L.disparos_antes(lista, ahora, hasta), 3)

    def test_intervalo_variable(self):
        ahora = "2026-01-01T06:00:00Z"
        hasta = "2026-01-01T10:00:00Z"
        lista = [
            {"proxima": "2026-01-01T07:00:00Z", "cada_min": 60},
            {"proxima": "2026-01-01T09:00:00Z", "cada_min": 120},
        ]
        self.assertEqual(L.disparos_antes(lista, ahora, hasta), 3)

    def test_vacio(self):
        self.assertEqual(L.disparos_antes([], "2026-01-01T06:00:00Z", "2026-01-01T09:00:00Z"), 0)


class Estado(unittest.TestCase):
    """estado: calcula ventanas, proyección y tono."""

    def test_pct_fuera_de_rango(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 120, "sesion_reinicio": "2026-01-01T06:00:00Z"},
                {"t": "2026-01-01T01:00:00Z", "sesion_pct": 110, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        with self.assertRaises(ValueError) as cm:
            L.estado(datos, "2026-01-01T01:30:00Z")
        self.assertIn("pct debe estar entre 0 y 100", str(cm.exception))

    def test_no_hay_lectura(self):
        datos = {
            "lecturas": [],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T01:30:00Z")
        self.assertEqual(est["sesion"]["pct"], 0)
        self.assertEqual(est["sesion"]["minutos_para_reinicio"], 0)
        self.assertIsNone(est["sesion"]["coste"])
        self.assertIsNone(est["sesion"]["proyeccion"])

    def test_sesion_sin_reinicio_pasado(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 50, "sesion_reinicio": "2025-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T01:30:00Z")
        self.assertEqual(est["sesion"]["pct"], 0)
        self.assertTrue(est["sesion"]["reiniciada"])
        self.assertEqual(est["sesion"]["minutos_para_reinicio"], 0)

    def test_sesion_normal(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
                {"t": "2026-01-01T01:00:00Z", "sesion_pct": 14, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T02:30:00Z")
        self.assertEqual(est["sesion"]["pct"], 14)
        self.assertEqual(est["sesion"]["minutos_para_reinicio"], 210)
        self.assertEqual(est["sesion"]["coste"], 4)
        self.assertEqual(est["sesion"]["proyeccion"], 18)
        self.assertEqual(est["sesion"]["tono"], "ok")
        self.assertIsNone(est["sesion"]["recomendacion"])

    def test_semana_con_lecturas(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "semana_pct": 30, "semana_reinicio": "2026-01-01T06:00:00Z"},
                {"t": "2026-01-01T01:00:00Z", "semana_pct": 45, "semana_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T02:30:00Z")
        self.assertEqual(est["semana"]["pct"], 45)
        self.assertEqual(est["semana"]["minutos_para_reinicio"], 210)
        self.assertEqual(est["semana"]["coste"], 15)
        self.assertEqual(est["semana"]["proyeccion"], 60)

    def test_modelo_con_lecturas(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "modelo_pct": 20, "modelo_reinicio": "2026-01-01T06:00:00Z", "modelo_nombre": "Claude"},
                {"t": "2026-01-01T01:00:00Z", "modelo_pct": 35, "modelo_reinicio": "2026-01-01T06:00:00Z", "modelo_nombre": "Claude"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T02:30:00Z")
        self.assertEqual(est["modelo"]["pct"], 35)
        self.assertEqual(est["modelo"]["minutos_para_reinicio"], 210)
        self.assertEqual(est["modelo"]["coste"], 15)
        self.assertEqual(est["modelo"]["proyeccion"], 50)

    def test_peligro_tono(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 85, "sesion_reinicio": "2026-01-01T06:00:00Z"},
                {"t": "2026-01-01T01:00:00Z", "sesion_pct": 91, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T02:30:00Z")
        self.assertEqual(est["sesion"]["pct"], 91)
        self.assertEqual(est["sesion"]["tono"], "peligro")

    def test_aviso_tono(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 70, "sesion_reinicio": "2026-01-01T06:00:00Z"},
                {"t": "2026-01-01T01:00:00Z", "sesion_pct": 80, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T02:30:00Z")
        self.assertEqual(est["sesion"]["tono"], "aviso")

    def test_reinicio_pasado(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 50, "sesion_reinicio": "2025-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T02:30:00Z")
        self.assertEqual(est["sesion"]["pct"], 0)
        self.assertEqual(est["sesion"]["minutos_para_reinicio"], 0)
        self.assertEqual(est["sesion"]["tono"], "ok")

    def test_lectura_antigua_desactualizada(self):
        datos = {
            "lecturas": [
                {"t": "2025-12-31T23:59:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T01:30:00Z")
        self.assertTrue(est["lectura_hace_min"] is not None and est["lectura_hace_min"] > 120)
        self.assertTrue(est["desactualizada"])

    def test_proyeccion_supera_el_umbral(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 80, "sesion_reinicio": "2026-01-01T06:00:00Z"},
                {"t": "2026-01-01T01:00:00Z", "sesion_pct": 85, "sesion_reinicio": "2026-01-01T06:00:00Z"},
                {"t": "2026-01-01T02:00:00Z", "sesion_pct": 90, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, dt.datetime(2026, 1, 1, 3, 0, 0))
        self.assertEqual(est["sesion"]["proyeccion"], 95)
        self.assertEqual(est["sesion"]["tono"], "aviso")
        self.assertIn("caben 1", est["sesion"]["recomendacion"])

    def test_recomendacion_null_sin_problema(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T02:30:00Z")
        self.assertIsNone(est["sesion"]["recomendacion"])

    def test_lecturas(self):
        datos = {
            "lecturas": [
                {"t": "2026-01-01T00:00:00Z", "sesion_pct": 10, "sesion_reinicio": "2026-01-01T06:00:00Z"},
                {"t": "2026-01-01T01:00:00Z", "sesion_pct": 15, "sesion_reinicio": "2026-01-01T06:00:00Z"},
            ],
            "programadas": {"t": "2026-10-05T12:00:00Z", "lista": []},
            "umbral_pct": 90
        }
        est = L.estado(datos, "2026-01-01T02:30:00Z")
        self.assertEqual(est["lectura_hace_min"], 90)
        self.assertFalse(est["desactualizada"])


class Cli(unittest.TestCase):
    """CLI: argparse con declarar, programadas y estado/leer."""

    def test_declarar_minimo(self):
        """Declarar con solo sesión."""
        argv = ["declarar", "--sesion", "70", "--sesion-reinicio", "2026-01-01T06:00:00Z"]
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = L.main(argv)
        self.assertEqual(codigo, 0)
        self.assertIn("lectura", salida.getvalue())

    def test_declarar_completo(self):
        """Declarar con todos los campos."""
        argv = [
            "declarar",
            "--sesion", "50", "--sesion-reinicio", "2026-01-01T06:00:00Z",
            "--semana", "30", "--semana-reinicio", "2026-01-01T06:00:00Z",
            "--modelo-nombre", "Claude", "--modelo", "40", "--modelo-reinicio", "2026-01-01T06:00:00Z",
            "--fuente", "test"
        ]
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = L.main(argv)
        self.assertEqual(codigo, 0)
        self.assertIn("lectura", salida.getvalue())

    def test_programadas(self):
        """Reemplazar la lista programada."""
        argv = ["programadas", "--json", '[{"nombre": "t1", "proxima": "2026-01-01T06:00:00Z", "cada_min": 60}]']
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = L.main(argv)
        self.assertEqual(codigo, 0)

    def test_estado(self):
        """Imprimir el estado."""
        argv = ["estado"]
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = L.main(argv)
        self.assertEqual(codigo, 0)
        salida_str = salida.getvalue()
        self.assertIn("sesion", salida_str)
        self.assertIn("semana", salida_str)
        self.assertIn("modelo", salida_str)

    def test_leer(self):
        """Leer el archivo de límites."""
        argv = ["leer"]
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = L.main(argv)
        self.assertEqual(codigo, 0)
        salida_str = salida.getvalue()
        self.assertIn("lecturas", salida_str)
        self.assertIn("programadas", salida_str)


if __name__ == "__main__":
    unittest.main()
>>>>>>> 7a7c5cdd (salvavidas · LC1004A: trabajo del agente antes de las puertas (tsc / vitest))
