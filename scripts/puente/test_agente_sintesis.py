# -*- coding: utf-8 -*-
"""Pruebas del agente de síntesis (SDP1111D): tres fases, zona CDMX, cola con
prefijo `cola-suenos-`, puntuación con Jev, entrega a Telegram, escritura
atómica, una entrega al día, cerrojo. Puras: sin red, sin orquestador."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import agente_sintesis as A
import sintesis_fuentes as SF
import sintesis_tareas as ST


AHORA_CDMX_00 = datetime(2026, 11, 11, 7, 0, tzinfo=timezone.utc)  # 01:00 CDMX
AHORA_CDMX_06 = datetime(2026, 11, 11, 12, 30, tzinfo=timezone.utc)  # 06:30 CDMX
AHORA_CDMX_07 = datetime(2026, 11, 11, 13, 54, tzinfo=timezone.utc)  # 07:54 CDMX
FECHA = "2026-11-11"


def ctx_base():
    return {"fecha": FECHA, "sintesis_previas": [], "mananas": [],
            "rotacion": {"videos": ["Vídeo 4", "Vídeo 5"], "contactos": ["Cole Hastings"],
                         "categorias": ["solarpunk"]},
            "imaginacion": [], "informes": [], "resumen_actividad": None}


class TestFaseActual(unittest.TestCase):
    def test_fase_recolectar_antes_de_0030(self):
        # 00:00 CDMX = 06:00 UTC
        ahora = datetime(2026, 11, 11, 6, 0, tzinfo=timezone.utc)
        self.assertEqual(A._fase_actual(ahora), "recolectar")

    def test_fase_redactar_entre_0030_y_0630(self):
        self.assertEqual(A._fase_actual(AHORA_CDMX_00), "redactar")
        self.assertEqual(A._fase_actual(AHORA_CDMX_06), "redactar")

    def test_fase_entregar_despues_de_0630(self):
        self.assertEqual(A._fase_actual(AHORA_CDMX_07), "entregar")


class TestFechaCDMX(unittest.TestCase):
    def test_fecha_cdmx_correcta(self):
        self.assertEqual(A._fecha_cdmx(AHORA_CDMX_00), FECHA)
        self.assertEqual(A._fecha_cdmx(AHORA_CDMX_06), FECHA)
        self.assertEqual(A._fecha_cdmx(AHORA_CDMX_07), FECHA)


class TestGenerarTareasAnalisis(unittest.TestCase):
    def test_seis_ramas_con_ids_sin_formato(self):
        ctx = ctx_base()
        tareas = ST.generar_tareas_analisis(ctx, "/tmp", ahora=A._iso(AHORA_CDMX_00))
        self.assertEqual(len(tareas), 6)
        ramas = [t["rama"] for t in tareas]
        self.assertEqual(ramas, ["contactos", "noticias", "referencias", "actividad", "ideas", "guiones"])
        for t in tareas:
            self.assertTrue(t["id"].startswith("SIN"))
            self.assertEqual(t["tipo"], "analisis")
            self.assertEqual(t["modo"], "libre")
            self.assertEqual(t["capacidad"], "alta")
            self.assertEqual(t["agente"], "sintesis-produccion")
            self.assertEqual(t["salida"], f"starseed_memory_root/imaginacion/agentes/sintesis-{FECHA}-{t['rama']}.json")
            self.assertTrue(t["privado"] == (t["rama"] == "actividad"))


class TestCiclo(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(self.raiz)
        self.home = os.path.join(self.tmp, "home")

    def tearDown(self):
        self._tmp.cleanup()

    def test_cola_con_prefijo_de_suenos(self):
        self.assertTrue(A.NOMBRE_COLA.startswith("cola-suenos-"))

    def test_ciclo_recolectar_encola_tareas(self):
        # Usa 00:00 CDMX para fase recolectar
        ahora_recolectar = datetime(2026, 11, 11, 6, 0, tzinfo=timezone.utc)
        r = A.ciclo(self.raiz, ahora_recolectar, encargar=False, jev=False, home=self.home, seco=True)
        self.assertTrue(r["toca"])
        self.assertEqual(r["fase"], "recolectar")
        self.assertEqual(r["resultado"]["accion"], "seco")
        self.assertEqual(len(r["resultado"]["tareas"]), 0)

    def test_ciclo_redactar_espera_salidas(self):
        r = A.ciclo(self.raiz, AHORA_CDMX_06, encargar=False, jev=False, home=self.home, seco=True)
        self.assertEqual(r["fase"], "redactar")
        self.assertEqual(r["resultado"]["accion"], "esperando_salidas")

    def test_ciclo_entregar_sin_sintesis_falla(self):
        r = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False, home=self.home, seco=True)
        self.assertEqual(r["fase"], "entregar")
        self.assertEqual(r["resultado"]["accion"], "sin_sintesis")

    def test_entregar_con_sintesis_envia_resumen_y_completa(self):
        # Crea síntesis en disco
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        texto = "Síntesis completa con fuentes y fechas. " * 100
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)
        enviados = []

        def enviar_falso(texto, **kw):
            enviados.append(texto)
            return {"ok": True, "trozos": 1}

        r = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                    enviar=enviar_falso, home=self.home, seco=False)
        self.assertTrue(r["ok"])
        self.assertEqual(r["resultado"]["accion"], "entregada")
        self.assertEqual(len(enviados), 2)
        self.assertTrue(len(enviados[0]) >= A.RESUMEN_MIN and len(enviados[0]) <= A.RESUMEN_MAX)
        self.assertEqual(enviados[1], texto)
        estado = A.cargar_estado(self.raiz)
        self.assertTrue(estado["entregada"])
        self.assertEqual(estado["sintesis_path"], ruta)

    def test_solo_una_entrega_al_dia(self):
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("Síntesis de prueba.")
        def enviar_falso(texto, **kw):
            return {"ok": True, "trozos": 1}
        # Primera entrega
        r1 = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                     enviar=enviar_falso, home=self.home, seco=False)
        self.assertTrue(r1["ok"])
        # Segunda entrega en mismo día (forzar para saltar la puerta de 15 min)
        r2 = A.ciclo(self.raiz, AHORA_CDMX_07, encargar=False, jev=False,
                     enviar=enviar_falso, home=self.home, seco=False, forzar=True)
        self.assertEqual(r2["resultado"]["accion"], "ya_entregada")

    def test_puerta_cada_15_min(self):
        r1 = A.ciclo(self.raiz, AHORA_CDMX_00, encargar=False, jev=False, home=self.home, seco=False)
        self.assertTrue(r1["toca"])
        # Simula que pasó menos de 15 min
        estado = A.cargar_estado(self.raiz)
        estado["ultimo_ciclo"] = A._iso(AHORA_CDMX_00 - timedelta(minutes=10))
        A.guardar_estado(self.raiz, estado)
        r2 = A.ciclo(self.raiz, AHORA_CDMX_00, encargar=False, jev=False, home=self.home, seco=True)
        self.assertFalse(r2["toca"])
        self.assertIn("0.25 h", r2["motivo"])

    def test_forzar_ignora_puerta(self):
        estado = A.cargar_estado(self.raiz)
        estado["ultimo_ciclo"] = A._iso(AHORA_CDMX_00 - timedelta(minutes=10))
        A.guardar_estado(self.raiz, estado)
        r = A.ciclo(self.raiz, AHORA_CDMX_00, encargar=False, jev=False,
                    home=self.home, seco=True, forzar=True)
        self.assertTrue(r["toca"])


class TestPlan(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(self.raiz)

    def tearDown(self):
        self._tmp.cleanup()

    def test_plan_devuelve_seis_tareas(self):
        d = A._plan(self.raiz, AHORA_CDMX_00, self.home)
        self.assertTrue(d["ok"])
        self.assertEqual(d["fase"], "redactar")
        self.assertEqual(d["tareas"], 6)
        self.assertEqual(len(d["detalle"]), 6)


class TestEstado(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(self.raiz)

    def tearDown(self):
        self._tmp.cleanup()

    def test_estado_vacio_inicial(self):
        d = A._estado(self.raiz)
        self.assertTrue(d["ok"])
        self.assertIsNone(d["fecha"])
        self.assertEqual(d["fase"], "recolectar")
        self.assertFalse(d["entregada"])


class TestEscrituraAtomica(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.raiz = os.path.join(self.tmp, "repo")
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(self.raiz)

    def tearDown(self):
        self._tmp.cleanup()

    def test_estado_json_atomico(self):
        A.ciclo(self.raiz, AHORA_CDMX_00, encargar=False, jev=False, home=self.home, seco=False)
        ruta = os.path.join(self.raiz, A.REL_ESTADO)
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, encoding="utf-8") as f:
            json.load(f)  # no debe fallar

    def test_sintesis_md_atomico(self):
        os.makedirs(os.path.join(self.raiz, A.REL_SINTESIS), exist_ok=True)
        ruta = os.path.join(self.raiz, A.REL_SINTESIS, f"{FECHA}.md")
        A._escribir_texto(ruta, "Contenido de prueba")
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, encoding="utf-8") as f:
            self.assertEqual(f.read(), "Contenido de prueba")


class TestPuntuacionJev(unittest.TestCase):
    def test_jev_callado_manda_regla(self):
        res = A._puntuar({"texto": "x"}, jev=False)
        self.assertEqual(res["respuesta"], "medio")
        self.assertEqual(res["medio"], "regla")


if __name__ == "__main__":
    unittest.main()