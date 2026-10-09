#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de prioridad_logica: el orden del enjambre ha de ser explicable y estable."""

import unittest
from datetime import datetime, timedelta

import prioridad_logica as P
from prioridad_logica import dependientes_transitivos, ordenar, puntuar

AHORA = datetime(2026, 9, 13, 12, 0, 0)


def tarea(tid, depende=None, archivos=None, t=None):
    return {
        "id": tid,
        "depende": depende or [],
        "archivos": archivos or [],
        "t": t or (AHORA - timedelta(hours=1)).isoformat(),
    }


class DependientesTransitosTest(unittest.TestCase):
    def test_ciclo_no_cuelga(self):
        ts = [tarea("A", ["B"]), tarea("B", ["A"])]
        out = dependientes_transitivos(ts)
        self.assertIn("A", out["B"])
        self.assertIn("B", out["A"])

    def test_dependencia_inexistente_se_ignora(self):
        ts = [tarea("A", ["FANTASMA"])]
        out = dependientes_transitivos(ts)
        self.assertEqual(out["A"], set())

    def test_transitivo(self):
        ts = [tarea("A"), tarea("B", ["A"]), tarea("C", ["B"])]
        out = dependientes_transitivos(ts)
        self.assertEqual(out["A"], {"B", "C"})
        self.assertEqual(out["C"], set())


class PuntuarTest(unittest.TestCase):
    def test_cinco_dependientes_ganan_a_corta(self):
        pesada = tarea("A", archivos=["a", "b", "c", "d", "e"])
        corta_sin = tarea("B", archivos=["x"])
        p_pesada, _ = puntuar(pesada, {}, 5, AHORA)
        p_corta, _ = puntuar(corta_sin, {}, 0, AHORA)
        self.assertGreater(p_pesada, p_corta)

    def test_fallo_tsc_gana_a_pendiente(self):
        t = tarea("A", archivos=["a"])
        con, _ = puntuar(t, {"estado": "fallo_tsc"}, 0, AHORA)
        sin, _ = puntuar(t, {"estado": "pendiente"}, 0, AHORA)
        self.assertGreater(con, sin)

    def test_tope_de_cinco_dependientes(self):
        cinco, r5 = puntuar(tarea("A"), {}, 5, AHORA)
        seis, r6 = puntuar(tarea("A"), {}, 6, AHORA)
        self.assertEqual(cinco, seis)
        self.assertIn("desbloquea 5 tareas", r6)

    def test_antiguedad_topa_en_24(self):
        t_vieja = tarea("A", t=(AHORA - timedelta(hours=100)).isoformat())
        p, razones = puntuar(t_vieja, {}, 0, AHORA)
        self.assertEqual(p, 24.0)
        self.assertIn("lleva 100 h esperando", razones)

    def test_intentos_auto_hunden(self):
        t = tarea("A", archivos=["a"])
        p0, _ = puntuar(t, {"intentos_auto": 0}, 0, AHORA)
        p3, razones = puntuar(t, {"intentos_auto": 3}, 0, AHORA)
        self.assertEqual(p0 - p3, 24.0)
        self.assertIn("ha fallado 3 veces: no acapara trabajadores", razones)

    def test_castigo_por_tocar_directores(self):
        riesgo, razones = puntuar(
            tarea("A", archivos=["scripts/puente/puente.py"]), {}, 0, AHORA
        )
        normal, _ = puntuar(tarea("B", archivos=["src/x.ts"]), {}, 0, AHORA)
        self.assertEqual(normal - riesgo, 10.0)
        self.assertIn("toca a los directores: mejor con el enjambre en calma", razones)

    def test_sin_t_no_suma_antiguedad(self):
        p, razones = puntuar({"id": "A", "archivos": []}, {}, 0, AHORA)
        self.assertEqual(p, 0.0)
        self.assertEqual(razones, [])

    def test_duracion_corta_por_archivos(self):
        uno, _ = puntuar(tarea("A", archivos=["a"]), {}, 0, AHORA)
        dos, _ = puntuar(tarea("B", archivos=["a", "b"]), {}, 0, AHORA)
        tres, _ = puntuar(tarea("C", archivos=["a", "b", "c"]), {}, 0, AHORA)
        self.assertEqual(
            (uno, dos, tres), (13.0, 9.0, 5.0)
        )  # corta + 1 h de antigüedad


class OrdenarTest(unittest.TestCase):
    def test_vacia_devuelve_listas_vacias(self):
        self.assertEqual(ordenar([], {}, AHORA), ([], []))

    def test_desempate_por_id_ascendente(self):
        ts = [tarea("zz9"), tarea("aa1")]
        ts[0]["archivos"] = ts[1]["archivos"] = ["a"]
        listas, _ = ordenar(ts, {}, AHORA)
        self.assertEqual([t_["id"] for t_, _, _ in listas], ["aa1", "zz9"])

    def test_dependencia_abierta_va_a_bloqueadas(self):
        ts = [tarea("A"), tarea("B", ["A"])]
        # A ni siquiera está en progreso: nada cerrado.
        listas, bloqueadas = ordenar(ts, {}, AHORA)
        self.assertEqual([t_["id"] for t_, _, _ in listas], ["A"])
        self.assertEqual(len(bloqueadas), 1)
        self.assertEqual(bloqueadas[0][0]["id"], "B")
        self.assertIn("A", bloqueadas[0][1])

    def test_dependencia_en_commit_va_a_listas(self):
        ts = [tarea("A"), tarea("B", ["A"])]
        listas, bloqueadas = ordenar(ts, {"A": {"estado": "commit"}}, AHORA)
        self.assertEqual(bloqueadas, [])
        self.assertEqual([t_["id"] for t_, _, _ in listas], ["A", "B"])

    def test_dependencia_en_hecho_va_a_listas(self):
        ts = [tarea("B", ["A"])]
        listas, bloqueadas = ordenar(ts, {"A": {"estado": "hecho"}}, AHORA)
        self.assertEqual(bloqueadas, [])
        self.assertEqual(len(listas), 1)

    def test_dependencia_fallida_bloquea(self):
        ts = [tarea("B", ["A"])]
        _, bloqueadas = ordenar(ts, {"A": {"estado": "fallo_tsc"}}, AHORA)
        self.assertEqual(len(bloqueadas), 1)

    def test_orden_primero_la_que_desbloquea(self):
        ts = [
            tarea("centro", archivos=["a", "b", "c"]),
            tarea("h1", ["centro"], archivos=["x"]),
            tarea("h2", ["centro"], archivos=["x"]),
            tarea("h3", ["centro"], archivos=["x"]),
            tarea("suelta", archivos=["x"]),
        ]
        listas, bloqueadas = ordenar(ts, {}, AHORA)
        self.assertEqual(listas[0][0]["id"], "centro")
        self.assertEqual(len(bloqueadas), 3)

    def test_razones_viajan_con_la_tarea(self):
        ts = [tarea("A")]
        listas, _ = ordenar(ts, {}, AHORA)
        _, puntos, rz = listas[0]
        self.assertTrue(rz)


if __name__ == "__main__":
    unittest.main()


class CapacidadPrimero(unittest.TestCase):
    """Alex (2026-09-20): «activar la mayor cantidad de agentes simultaneos y seleccionar
    sus modelos debe ser PRIORIDAD». Una tarea que sube el techo del sistema no vale por
    si misma: vale por todo lo que vendra despues."""

    def test_una_tarea_de_capacidad_gana_a_una_normal_mas_antigua(self):
        capacidad = {"id": "CAP", "archivos": ["scripts/puente/gobernador-recursos.py"]}
        normal = {"id": "NOR", "archivos": ["src/components/x.tsx"],
                  "t": "2026-09-19T00:00:00+00:00"}
        ahora = P._a_datetime("2026-09-20T00:00:00+00:00")
        listas, _ = ordenar([normal, capacidad], {}, ahora)
        self.assertEqual("CAP", listas[0][0]["id"])

    def test_el_castigo_por_tocar_directores_no_la_hunde(self):
        # gobernador-recursos.py esta en scripts/puente/: castigo de riesgo -10 y
        # capacidad +30. Debe quedar en positivo.
        puntos, razones = puntuar(
            {"id": "CAP", "archivos": ["scripts/puente/gobernador-recursos.py"]}, {}, 0, None)
        self.assertGreater(puntos, 0)
        self.assertTrue(any("techo del sistema" in r for r in razones))

    def test_se_puede_marcar_a_mano_con_importancia(self):
        puntos, razones = puntuar(
            {"id": "X", "archivos": ["src/lib/x.ts"], "importancia": "capacidad"}, {}, 0, None)
        self.assertTrue(any("techo del sistema" in r for r in razones))
        self.assertGreaterEqual(puntos, P.PESOS["capacidad"])

    def test_una_tarea_normal_no_se_cuela_por_parecerse(self):
        _, razones = puntuar({"id": "Y", "archivos": ["src/lib/mando/medidores.ts"]}, {}, 0, None)
        self.assertFalse(any("techo del sistema" in r for r in razones))


class DependenciasDeCadena(unittest.TestCase):
    """(2026-10-09) PRD1005U esperaba a PRD1005S, que integró su sucesora PRD1005Sc: la
    dependencia está cumplida y U no puede quedarse «bloqueada» para siempre."""

    def test_una_sucesora_integrada_cierra_la_dependencia(self):
        progreso = {
            "PRD1005I": {"estado": "commit"},
            "PRD1005S": {"estado": "sustituida"},
            "PRD1005Sb": {"estado": "sustituida"},
            "PRD1005Sc": {"estado": "commit"},
            "PRD1005U": {"estado": "fallo_tsc"},
        }
        listas, bloqueadas = ordenar([tarea("PRD1005U", ["PRD1005I", "PRD1005S"])], progreso, AHORA)
        self.assertEqual(["PRD1005U"], [t["id"] for t, _p, _r in listas])
        self.assertEqual([], bloqueadas)

    def test_una_sucesora_viva_no_basta(self):
        progreso = {"A1": {"estado": "fallo_tsc"}, "A1b": {"estado": "pendiente"}}
        _listas, bloqueadas = ordenar([tarea("B1", ["A1"])], progreso, AHORA)
        self.assertEqual(["B1"], [t["id"] for t, _m in bloqueadas])

    def test_una_anterior_integrada_no_cierra_a_la_posterior(self):
        # Depender de A1c no se cumple porque A1 entrara: la regla mira hacia delante.
        progreso = {"A1": {"estado": "commit"}, "A1c": {"estado": "pendiente"}}
        _listas, bloqueadas = ordenar([tarea("B1", ["A1c"])], progreso, AHORA)
        self.assertEqual(1, len(bloqueadas))
