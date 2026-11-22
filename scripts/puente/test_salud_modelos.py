#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de salud_modelos: cuarentena, ordenación por éxito y sondas (AUT1121D)."""

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import salud_modelos as SM


def evento(tipo: str, tarea: str = "T1", modelo: str = "nim/kimi-k3",
           datos: dict | None = None, ts: str | None = None, area: str = "interfaz") -> dict:
    """Helper para crear eventos tipo orquestador."""
    d = {"modelo": modelo, "area": area}
    if datos:
        d.update(datos)
    return {
        "t": ts or "2026-11-22 12:00:00",
        "quien": "enjambre",
        "tipo": tipo,
        "tarea": tarea,
        "texto": f"{tipo} · {modelo}",
        "datos": d,
    }


class EstadisticasModeloTest(unittest.TestCase):
    def test_tasa_exito_inicial_es_prior_neutro(self):
        stats = SM.EstadisticasModelo()
        self.assertEqual(stats.tasa_exito, 0.5)

    def test_registrar_exito_actualiza_tasa(self):
        stats = SM.EstadisticasModelo()
        stats.registrar_exito(10.0)
        self.assertEqual(stats.exitos, 1)
        self.assertEqual(stats.tasa_exito, 1.0)
        stats.registrar_fallo()
        self.assertAlmostEqual(stats.tasa_exito, 0.5)

    def test_registrar_fallo_puerta_tsc_vitest(self):
        stats = SM.EstadisticasModelo()
        stats.registrar_fallo("tsc")
        self.assertEqual(stats.fallos_tsc, 1)
        stats.registrar_fallo("vitest")
        self.assertEqual(stats.fallos_vitest, 1)
        stats.registrar_fallo("otro")
        self.assertEqual(stats.fallos_tsc + stats.fallos_vitest, 2)

    def test_eventos_cuarentena_ventana_1h(self):
        stats = SM.EstadisticasModelo()
        ahora = 1000000.0
        stats.registrar_evento_cuarentena(ahora)
        stats.registrar_evento_cuarentena(ahora + 100)
        stats.registrar_evento_cuarentena(ahora + 200)
        self.assertEqual(len(stats.eventos_cuarentena), 3)

    def test_eventos_fuera_ventana_se_limpián(self):
        stats = SM.EstadisticasModelo()
        ahora = 1000000.0
        stats.registrar_evento_cuarentena(ahora - 4000)  # > 1h
        stats.registrar_evento_cuarentena(ahora)
        # _limpiar_ventana se llama en registrar_evento_cuarentena
        self.assertEqual(len(stats.eventos_cuarentena), 1)

    def test_debe_entrar_cuarentena_tres_eventos(self):
        stats = SM.EstadisticasModelo()
        ahora = 1000000.0
        stats.registrar_evento_cuarentena(ahora)
        stats.registrar_evento_cuarentena(ahora + 100)
        self.assertFalse(stats.debe_entrar_cuarentena(ahora + 200))
        stats.registrar_evento_cuarentena(ahora + 200)
        self.assertTrue(stats.debe_entrar_cuarentena(ahora + 300))

    def test_cuarentena_duracion_2h(self):
        stats = SM.EstadisticasModelo()
        ahora = 1000000.0
        stats.entrar_cuarentena(ahora)
        self.assertTrue(stats.en_cuarentena)
        self.assertFalse(stats.puede_salir_cuarentena(ahora + 3600))  # 1h
        self.assertTrue(stats.puede_salir_cuarentena(ahora + 7200))   # 2h

    def test_salir_cuarentena_limpia_eventos(self):
        stats = SM.EstadisticasModelo()
        ahora = 1000000.0
        stats.registrar_evento_cuarentena(ahora)
        stats.entrar_cuarentena(ahora)
        stats.salir_cuarentena(ahora + 7200)
        self.assertFalse(stats.en_cuarentena)
        self.assertEqual(len(stats.eventos_cuarentena), 0)


class ProcesarEventosTest(unittest.TestCase):
    def setUp(self):
        self.ahora_base = datetime(2026, 11, 22, 12, 0, 0).timestamp()

    def _estado_con_eventos(self, eventos):
        return SM.procesar_eventos(eventos)

    def test_commit_registra_exito(self):
        ev = [evento("commit", modelo="nim/kimi-k3", ts="2026-11-22 12:00:00",
                     datos={"modelo": "nim/kimi-k3", "duracion_s": 45})]
        estado = self._estado_con_eventos(ev)
        stats = estado.get_modelo("interfaz", "nim/kimi-k3")
        self.assertEqual(stats.exitos, 1)
        self.assertEqual(stats.segundos_promedio, 45.0)

    def test_verificacion_fallida_registra_fallo_puerta(self):
        ev = [evento("verificacion_fallida", modelo="nim/kimi-k3",
                     datos={"modelo": "nim/kimi-k3", "puerta": "tsc"})]
        estado = self._estado_con_eventos(ev)
        stats = estado.get_modelo("interfaz", "nim/kimi-k3")
        self.assertEqual(stats.fallos, 1)
        self.assertEqual(stats.fallos_tsc, 1)

    def test_estancado_cuenta_para_cuarentena(self):
        ev = [
            evento("estancado", modelo="nim/kimi-k3", ts="2026-11-22 12:00:00"),
            evento("estancado", modelo="nim/kimi-k3", ts="2026-11-22 12:05:00"),
            evento("estancado", modelo="nim/kimi-k3", ts="2026-11-22 12:10:00"),
        ]
        estado = self._estado_con_eventos(ev)
        stats = estado.get_modelo("interfaz", "nim/kimi-k3")
        self.assertTrue(stats.debe_entrar_cuarentena(self.ahora_base + 600))

    def test_proveedor_caido_cuenta_para_cuarentena(self):
        ev = [evento("proveedor_caido", modelo="openrouter/nemotron",
                     ts="2026-11-22 12:00:00", area="general") for _ in range(3)]
        estado = self._estado_con_eventos(ev)
        stats = estado.get_modelo("general", "openrouter/nemotron")
        self.assertTrue(stats.debe_entrar_cuarentena(self.ahora_base))

    def test_latido_sale_de_cuarentena_tras_2h(self):
        ev_cuarentena = [evento("estancado", modelo="nim/kimi-k3",
                                ts=f"2026-11-22 12:{i:02d}:00") for i in range(3)]
        estado = self._estado_con_eventos(ev_cuarentena)
        stats = estado.get_modelo("interfaz", "nim/kimi-k3")
        stats.entrar_cuarentena(self.ahora_base)

        # Latido a los 90 min: sigue en cuarentena
        ev_latido = [evento("latido", modelo="nim/kimi-k3",
                            ts="2026-11-22 13:30:00")]
        estado = SM.procesar_eventos(ev_latido, estado)
        self.assertTrue(stats.en_cuarentena)

        # Latido a los 2h 1min: sale
        ev_latido2 = [evento("latido", modelo="nim/kimi-k3",
                             ts="2026-11-22 14:01:00")]
        estado = SM.procesar_eventos(ev_latido2, estado)
        self.assertFalse(stats.en_cuarentena)


class OrdenacionTest(unittest.TestCase):
    def setUp(self):
        self.estado = SM.EstadoSaludModelos()
        self.ahora = 1000000.0

    def _configurar_modelos(self):
        # Modelo A: 90% éxito, rápido, sin fallos de puerta
        stats_a = self.estado.get_modelo("interfaz", "modelo-a")
        for _ in range(9):
            stats_a.registrar_exito(30.0)
        stats_a.registrar_fallo()

        # Modelo B: 70% éxito, algunos fallos tsc
        stats_b = self.estado.get_modelo("interfaz", "modelo-b")
        for _ in range(7):
            stats_b.registrar_exito(60.0)
        for _ in range(3):
            stats_b.registrar_fallo()
            stats_b.fallos_tsc += 1

        # Modelo C: 50% éxito, sin historial de puertas
        stats_c = self.estado.get_modelo("interfaz", "modelo-c")
        for _ in range(5):
            stats_c.registrar_exito(120.0)
        for _ in range(5):
            stats_c.registrar_fallo()

        self.estado.ultima_vez_usado = {
            "modelo-a": self.ahora,
            "modelo-b": self.ahora - 100,
            "modelo-c": self.ahora - 200,
        }

    def test_ordenar_por_tasa_exito(self):
        self._configurar_modelos()
        ordenados = SM.ordenar_modelos_por_tarea("interfaz", self.estado, ahora=self.ahora)
        # modelo-a debería ir primero por mayor tasa de éxito y menos fallos tsc
        self.assertEqual(ordenados[0], "modelo-a")

    def test_modelos_en_cuarentena_se_excluyen(self):
        self._configurar_modelos()
        stats_b = self.estado.get_modelo("interfaz", "modelo-b")
        stats_b.entrar_cuarentena(self.ahora)
        ordenados = SM.ordenar_modelos_por_tarea("interfaz", self.estado, ahora=self.ahora)
        self.assertNotIn("modelo-b", ordenados)

    def test_modelo_sale_cuarentena_vuelve_a_orden(self):
        self._configurar_modelos()
        stats_b = self.estado.get_modelo("interfaz", "modelo-b")
        stats_b.entrar_cuarentena(self.ahora - 8000)  # hace > 2h
        ordenados = SM.ordenar_modelos_por_tarea("interfaz", self.estado, ahora=self.ahora)
        self.assertIn("modelo-b", ordenados)

    def test_tipo_desconocido_usa_general(self):
        self._configurar_modelos()
        ordenados = SM.ordenar_modelos_por_tarea("desconocido", self.estado, ahora=self.ahora)
        # Debe usar "general" que está vacío, así que lista vacía
        self.assertEqual(ordenados, [])


class CuarentenaGlobalTest(unittest.TestCase):
    def setUp(self):
        self.estado = SM.EstadoSaludModelos()
        self.ahora = 1000000.0

    def test_modelos_en_cuarentena_global(self):
        for tipo in ("interfaz", "puente", "pruebas"):
            stats = self.estado.get_modelo(tipo, "modelo-x")
            stats.entrar_cuarentena(self.ahora)
        cuare = SM.modelos_en_cuarentena(self.estado, self.ahora)
        self.assertIn("modelo-x", cuare)
        self.assertEqual(len(cuare), 1)  # un solo modelo global

    def test_modelo_disponible_si_no_en_cuarentena(self):
        self.assertTrue(SM.modelo_disponible("modelo-y", self.estado, self.ahora))
        stats = self.estado.get_modelo("interfaz", "modelo-y")
        stats.entrar_cuarentena(self.ahora)
        self.assertFalse(SM.modelo_disponible("modelo-y", self.estado, self.ahora))

    def test_siguiente_sonda_cuarentena(self):
        stats = self.estado.get_modelo("interfaz", "modelo-z")
        stats.entrar_cuarentena(self.ahora - 8000)  # listo para sonda
        sondas = SM.siguiente_sonda_cuarentena(self.estado, self.ahora)
        self.assertIn(("modelo-z", "interfaz"), sondas)

    def test_registrar_sonda_exitosa_sale_cuarentena(self):
        stats = self.estado.get_modelo("interfaz", "modelo-z")
        stats.entrar_cuarentena(self.ahora - 8000)
        SM.registrar_sonda_exitosa(self.estado, "modelo-z", "interfaz", self.ahora)
        self.assertFalse(stats.en_cuarentena)
        self.assertEqual(stats.ultima_sonda, self.ahora)

    def test_registrar_sonda_fallida_vuelve_cuarentena(self):
        stats = self.estado.get_modelo("interfaz", "modelo-z")
        stats.entrar_cuarentena(self.ahora - 8000)
        stats.salir_cuarentena(self.ahora)  # simulamos que salió
        SM.registrar_sonda_fallida(self.estado, "modelo-z", "interfaz", self.ahora + 100)
        self.assertTrue(stats.en_cuarentena)


class ResumenTest(unittest.TestCase):
    def test_resumen_incluye_cuarentena_y_por_tipo(self):
        estado = SM.EstadoSaludModelos()
        ahora = 1000000.0
        stats = estado.get_modelo("interfaz", "modelo-ok")
        for _ in range(8):
            stats.registrar_exito(30.0)
        stats.registrar_fallo()
        stats2 = estado.get_modelo("interfaz", "modelo-cuare")
        stats2.entrar_cuarentena(ahora)
        # Darle al menos 1 evento para que aparezca en resumen
        stats2.registrar_fallo()

        resumen = SM.resumen_salud(estado, ahora)
        self.assertIn("modelo-cuare", resumen["modelos_en_cuarentena"])
        self.assertIn("interfaz", resumen["por_tipo"])
        interfaz = resumen["por_tipo"]["interfaz"]
        self.assertEqual(len(interfaz), 2)
        # modelo-ok debe ir primero por tasa de éxito
        self.assertEqual(interfaz[0]["modelo"], "modelo-ok")


class CLITest(unittest.TestCase):
    def test_ordenar_comando(self):
        import subprocess
        # Crear estado temporal
        with tempfile.TemporaryDirectory() as d:
            estado_file = os.path.join(d, "estado.json")
            estado = SM.EstadoSaludModelos()
            stats = estado.get_modelo("interfaz", "m1")
            stats.registrar_exito(10.0)
            SM._guardar_estado(estado, estado_file)

            result = subprocess.run([
                sys.executable, "-m", "salud_modelos",
                "ordenar", "interfaz", "--estado", estado_file
            ], capture_output=True, text=True, cwd=os.path.dirname(__file__))
            self.assertEqual(result.returncode, 0)
            salida = json.loads(result.stdout)
            self.assertIn("m1", salida)


if __name__ == "__main__":
    unittest.main()