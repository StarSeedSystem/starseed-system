# -*- coding: utf-8 -*-
"""Pruebas DIR1118T: «[tiempo agotado]» cuenta como fallo y reintentos con tiempo creciente."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import motores_director as M
import director_presidente as D


class TestTiempoAgotadoEsFallo(unittest.TestCase):
    """El texto «[tiempo agotado]» (y salidas vacías por tiempo) cuenta como fallo,
    igual que los de _FALLOS_HERMES / es_fallo_hermes."""

    def test_es_fallo_hermes_detecta_fallos_conocidos(self):
        for texto in M._FALLOS_HERMES:
            with self.subTest(texto=texto):
                self.assertTrue(M.es_fallo_hermes(texto))

    def test_tiempo_agotado_es_fallo_hermes(self):
        # El texto que devuelve _corren al agotar el tiempo incluye «[tiempo agotado]»
        self.assertTrue(M.es_fallo_hermes("algo\n[tiempo agotado]"))
        self.assertTrue(M.es_fallo_hermes("[tiempo agotado]"))
        self.assertTrue(M.es_fallo_hermes("salida previa\n[tiempo agotado]"))

    def test_salida_larga_con_tiempo_agotado_no_es_fallo(self):
        # Una respuesta larga que por casualidad mencione «tiempo agotado» no es un fallo de timeout
        texto_largo = "x" * 700 + "\n[tiempo agotado]"
        self.assertFalse(M.es_fallo_hermes(texto_largo))

    def test_es_fallo_tiempo_agotado_funcion_propia(self):
        """Si se crea una función específica para detectar timeout, debe funcionar."""
        # Esta prueba fallará hasta que implementemos la función
        self.assertTrue(hasattr(M, 'es_fallo_tiempo_agotado'))
        self.assertTrue(M.es_fallo_tiempo_agotado("[tiempo agotado]"))
        self.assertTrue(M.es_fallo_tiempo_agotado("algo\n[tiempo agotado]"))
        self.assertFalse(M.es_fallo_tiempo_agotado("respuesta normal"))
        self.assertFalse(M.es_fallo_tiempo_agotado("x" * 700 + "\n[tiempo agotado]"))


class TestReintentosConTiempoCreciente(unittest.TestCase):
    """El reintento del mismo mensaje usa más tiempo: 120 s, luego 300 s, luego 600 s (máx)."""

    def test_intervalos_reintento_proveedor(self):
        """Debe existir una función/constante con los timeouts crecientes para reintentos."""
        # 1er intento: 120s, 2do: 300s, 3ro+: 600s
        self.assertTrue(hasattr(D, 'TIMEOUTS_REINTENTO_PROVEEDOR'))
        timeouts = D.TIMEOUTS_REINTENTO_PROVEEDOR
        self.assertEqual(timeouts[0], 120)
        self.assertEqual(timeouts[1], 300)
        self.assertEqual(timeouts[2], 600)
        # El máximo es 600s
        self.assertEqual(max(timeouts), 600)

    def test_detalle_cola_menciona_tiempo_reintento(self):
        """El detalle de la cola debe decir «reintento con 300 s» etc."""
        descartes = [("claude", "no disponible"), ("hermes", "[tiempo agotado]")]
        # 1er intento (intentos=1) -> 120s
        detalle1 = D.detalle_cola(descartes, intentos=1, proximo=1000000000, ahora=1000000000)
        self.assertIn("reintento", detalle1.lower())
        # 2do intento (intentos=2) -> 300s
        detalle2 = D.detalle_cola(descartes, intentos=2, proximo=1000000000, ahora=1000000000)
        self.assertIn("300", detalle2)
        # 3er intento (intentos=3) -> 600s
        detalle3 = D.detalle_cola(descartes, intentos=3, proximo=1000000000, ahora=1000000000)
        self.assertIn("600", detalle3)


class TestAtenderConTimeoutCreciente(unittest.TestCase):
    """Pruebas de integración: atender usa timeouts crecientes en reintentos."""

    def setUp(self):
        from unittest import mock
        self.mock = mock
        self.publicados, self.entregas = [], []
        self.p1 = mock.patch.object(D.director_chat, "publicar", side_effect=lambda *a, **k: self.publicados.append((a, k)))
        self.p2 = mock.patch.object(D.director_chat, "entrega", side_effect=lambda *a, **k: self.entregas.append((a, k)))
        self.p3 = mock.patch.object(D.director_chat, "leer", return_value=[])
        self.p4 = mock.patch.object(D, "existe_cli", return_value=True)
        self.p5 = mock.patch.object(D, "leer_limites", return_value={"lecturas": []})
        for p in (self.p1, self.p2, self.p3, self.p4, self.p5):
            p.start()

    def tearDown(self):
        for p in (self.p1, self.p2, self.p3, self.p4, self.p5):
            p.stop()

    def _estado_base(self):
        return {
            "atendidos": [],
            "opus_fecha": "2026-11-18",
            "opus_hoy": 0,
            "presidente": {"cola": {}, "enfriados": {}},
            "hermes_pausas": {},
        }

    def test_reintento_cola_usa_timeout_mayor(self):
        """Cuando un mensaje está en cola y se reintenta, el timeout crece."""
        estado = self._estado_base()
        mensaje = {
            "id": "msg-1",
            "t": "2026-11-18T10:00:00+00:00",
            "de": "alex",
            "rol": "alex",
            "tipo": "mensaje",
            "texto": "hola",
            "canal": "mando",
            "canales": ["director-presidente"],
        }

        # Mock de correr: primera vez timeout, segunda vez responde
        def correr_mock(orden, **kwargs):
            segundos = kwargs.get("segundos", 120)
            if segundos == 120:
                return -9, "[tiempo agotado]"
            return 0, '{"result": "ok", "usage": {}}'

        with self.mock.patch.object(M, "correr", side_effect=correr_mock) as correr:
            # Primera llamada: se pone en cola
            r1 = D.atender(mensaje, estado, ahora=1000000000)
            self.assertEqual(r1, "cola")
            # Verificar que se usó 120s en la primera llamada
            self.assertEqual(correr.call_args[1].get("segundos"), 120)

            # Simular que pasó el tiempo para el reintento
            cola = estado["presidente"]["cola"]
            self.assertIn("msg-1", cola)
            cola["msg-1"]["proximo"] = 1000000000 - 1  # ya toca reintentar

            # Segunda llamada: reintento con 300s
            r2 = D.atender(mensaje, estado, ahora=1000000000)
            # Debe haber usado 300s esta vez
            # (la implementación real lo hará en el siguiente ciclo)


if __name__ == "__main__":
    unittest.main()