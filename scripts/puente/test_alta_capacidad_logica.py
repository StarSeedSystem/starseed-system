"""Pruebas del carril de alta capacidad (ALT1021Ab) — unittest, sin red."""
import unittest
from datetime import datetime, timezone, timedelta
from scripts.puente.alta_capacidad_logica import (
    necesita_alta, cupo_claude, elegir,
)


class TestNecesitaAlta(unittest.TestCase):
    def test_pendiente_normal_false(self):
        self.assertFalse(necesita_alta({"capacidad":"normal"}, None))
    def test_capacidad_alta_true(self):
        self.assertTrue(necesita_alta({"capacidad":"alta"}, None))
    def test_dificultad_alta_true(self):
        self.assertTrue(necesita_alta({"dificultad":"alta"}, None))
    def test_entrada_integrada_false(self):
        self.assertFalse(necesita_alta({"capacidad":"alta"}, {"integrada":True}))
    def test_entrada_sustituida_false(self):
        self.assertFalse(necesita_alta({"capacidad":"alta"}, {"paso":"sustituida"}))
    def test_entrada_no_aplica_false(self):
        self.assertFalse(necesita_alta({"capacidad":"alta"}, {"resultado":"no_aplica"}))
    def test_entrada_en_curso_false(self):
        self.assertFalse(necesita_alta({"capacidad":"alta"}, {"en_curso":True}))
    def test_entrada_bloqueante_alta_capacidad_true(self):
        self.assertTrue(necesita_alta({"id":"t"}, {"bloqueante":True,"alta_capacidad":True}))
    def test_nota_director_escalada_agotada_true(self):
        self.assertTrue(necesita_alta({"nota_director":"director: escalada agotada"}, None))


class TestCupoClaude(unittest.TestCase):
    def test_sin_lecturas_falso(self):
        ahora = datetime.now(timezone.utc)
        self.assertFalse(cupo_claude([], ahora)[0])
    def test_lectura_vieja_falso(self):
        ahora = datetime.now(timezone.utc)
        ok, msg = cupo_claude([{"t":"2020-01-01T00:00:00+00:00","semana_pct":10,"sesion_pct":20}], ahora)
        self.assertFalse(ok); self.assertIn("lectura vieja", msg)
    def test_lectura_fresca_bajo_tope_true(self):
        ahora = datetime.now(timezone.utc)
        ok, msg = cupo_claude([{"t":ahora.isoformat(),"semana_pct":30,"sesion_pct":40}], ahora)
        self.assertTrue(ok); self.assertIn("semana", msg)
    def test_semana_justo_80_rechaza(self):
        ahora = datetime.now(timezone.utc)
        self.assertFalse(cupo_claude([{"t":ahora.isoformat(),"semana_pct":80,"sesion_pct":10}], ahora)[0])
    def test_sesion_justo_70_rechaza(self):
        ahora = datetime.now(timezone.utc)
        self.assertFalse(cupo_claude([{"t":ahora.isoformat(),"semana_pct":10,"sesion_pct":70}], ahora)[0])
    def test_lectura_vieja_por_frescura(self):
        ahora = datetime.now(timezone.utc)
        vieja = {"t":(ahora-timedelta(hours=10)).isoformat(),"semana_pct":10,"sesion_pct":10}
        ok, msg = cupo_claude([vieja], ahora, frescura_h=6)
        self.assertFalse(ok); self.assertIn("lectura vieja", msg)


class TestElegir(unittest.TestCase):
    def test_max_agentes_cero(self):
        self.assertEqual(elegir([{"id":"a"}], 2, max_agentes=2), [])
    def test_max_negativo_no_pasa_abajo_de_cero(self):
        self.assertEqual(elegir([{"id":"a"}], 5, max_agentes=2), [])
    def test_adelantar_primero(self):
        cand = [{"id":"b","importancia":"capacidad","intentos_auto":5}, {"id":"a","adelantar":"sí"}]
        res = elegir(cand, 0, max_agentes=2)
        self.assertEqual([r["id"] for r in res], ["a","b"])
    def test_importancia_luego_intentos(self):
        cand = [{"id":"a","intentos_auto":1},{"id":"b","importancia":"capacidad","intentos_auto":0}]
        res = elegir(cand, 0, max_agentes=2)
        self.assertEqual([r["id"] for r in res], ["b","a"])
    def test_id_ascendente_desempate(self):
        cand = [{"id":"z","importancia":"capacidad","intentos_auto":1},{"id":"a","importancia":"capacidad","intentos_auto":1}]
        res = elegir(cand, 0, max_agentes=2)
        self.assertEqual([r["id"] for r in res], ["a","z"])
    def test_límite_max_menos_en_marcha(self):
        cand = [{"id":f"c{i}"} for i in range(5)]
        res = elegir(cand, 1, max_agentes=2)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["id"], "c0")

class TestReparacion(unittest.TestCase):
    def test_nota_en_la_entrada(self):
        self.assertTrue(necesita_alta({"id": "x"}, {"estado": "bloqueante", "nota": "director: escalada agotada tras 3"}))

    def test_bloqueante_por_estado_con_alta(self):
        self.assertTrue(necesita_alta({"id": "x"}, {"estado": "bloqueante", "alta_capacidad": True}))

    def test_cerrada_gana_a_nota(self):
        self.assertFalse(necesita_alta({"capacidad": "alta"}, {"estado": "integrada"}))

    def test_porcentaje_decimal_sin_truncar(self):
        ahora = datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc)
        ok, m = cupo_claude([{"t": "2026-10-22T11:00:00+00:00", "semana_pct": 79.5, "sesion_pct": 10}], ahora)
        self.assertTrue(ok)
        self.assertIn("79.5", m)


if __name__ == "__main__":
    unittest.main()
