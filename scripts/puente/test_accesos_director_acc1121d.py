# -*- coding: utf-8 -*-
"""ACC1121D: los tres canales con la misma puerta, desde cualquier medio.

Comprueba el motor común (lenguaje llano → `metagenesis_orden`), que solo el chat de Alex
puede dar órdenes, que el bot del A1 encola cuando la Mac no responde y la tabla
canal × medio de `verificar_accesos.py`.
"""
import os
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
if str(AQUI) not in sys.path:
    sys.path.insert(0, str(AQUI))

import sincronizador_direccion as S  # noqa: E402
import verificar_accesos as V  # noqa: E402


class PruebasMotorComun(unittest.TestCase):
    def test_estado_y_ordenes_en_lenguaje_llano(self):
        self.assertEqual(S.interpretar_orden_director("¿cómo va todo?")["tipo"], "estado")
        self.assertEqual(S.interpretar_orden_director("estado")["tipo"], "estado")
        plan = S.interpretar_orden_director("busca más capacidad en todos los medios")
        self.assertEqual((plan["tipo"], plan["orden"]), ("orden", "buscar_capacidad"))
        self.assertEqual(S.interpretar_orden_director("pausa el enjambre")["orden"], "pausar_enjambre")
        self.assertEqual(S.interpretar_orden_director("reanuda el enjambre")["orden"], "reanudar_enjambre")

    def test_reservadas_no_se_ejecutan(self):
        plan = S.interpretar_orden_director("quita la pausa de publicación")
        self.assertEqual(plan["tipo"], "reservada")
        llamadas = []
        r = S.atender_orden_director(
            "quita la pausa de publicación", canal="audiovisual", medio="telegram",
            ejecutar_fn=lambda *a, **k: llamadas.append(a) or "NO",
        )
        self.assertIn("esto es de Alex", r)
        self.assertEqual(llamadas, [])

    def test_atender_usa_la_puerta_con_canal_y_medio(self):
        visto = {}

        def puerta(orden, argumentos, quien, motivo, canal, medio):
            visto.update(orden=orden, argumentos=argumentos, quien=quien, canal=canal, medio=medio)
            return "hecho:%s" % orden

        r = S.atender_orden_director("busca más capacidad", canal="general", medio="telegram",
                                     ejecutar_fn=puerta)
        self.assertEqual(r, "hecho:buscar_capacidad")
        self.assertEqual(visto["quien"], "alex")
        self.assertEqual((visto["canal"], visto["medio"]), ("general", "telegram"))
        self.assertFalse(visto["argumentos"]["aplicar"])

    def test_texto_normal_no_es_orden(self):
        self.assertIsNone(S.atender_orden_director("hazme un informe de la síntesis"))


class PruebasSoloChatDeAlex(unittest.TestCase):
    def _upd(self, chat, texto, uid=10):
        return {"update_id": uid, "message": {
            "chat": {"id": chat}, "from": {"is_bot": False}, "text": texto, "date": time.time()}}

    def test_orden_de_otro_chat_no_se_ejecuta_y_la_de_alex_si(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "repo"
            estado = {"maggacortex_tg_offset": 0}
            cfg = {"sincronizar_canales": {"telegram": True}}
            dichos, llamadas = [], []

            def orden_fn(texto, canal="principal", medio="telegram"):
                llamadas.append((texto, canal))
                return "hecho"

            upd = self._upd("999", "busca más capacidad")
            S.recoger_maggacortex_telegram(
                estado, cfg, get_updates_fn=lambda off: [upd], publicar_fn=lambda *a, **k: None,
                raiz=raiz, chat_id_autorizado="123", orden_fn=orden_fn,
                responder_fn=lambda t: dichos.append(t))
            self.assertEqual(llamadas, [])

            upd = self._upd("123", "busca más capacidad", uid=11)
            S.recoger_maggacortex_telegram(
                estado, cfg, get_updates_fn=lambda off: [upd], publicar_fn=lambda *a, **k: None,
                raiz=raiz, chat_id_autorizado="123", orden_fn=orden_fn,
                responder_fn=lambda t: dichos.append(t))
            self.assertEqual(llamadas, [("busca más capacidad", "principal")])
            self.assertEqual(dichos, ["hecho"])


class PruebasBotDelA1(unittest.TestCase):
    def setUp(self):
        import peticiones_telegram as P
        self.P = P
        self.tmp = tempfile.TemporaryDirectory()
        self.original = P.ORDENES_MAC
        P.ORDENES_MAC = os.path.join(self.tmp.name, "ordenes-mac.json")

    def tearDown(self):
        self.P.ORDENES_MAC = self.original
        self.tmp.cleanup()

    def test_sin_mac_encola_y_lo_dice(self):
        r = self.P._atender_orden_director_a1(
            "busca más capacidad", enviar_fn=lambda p: {"ok": False, "motivo": "sin túnel"})
        self.assertIn("cola", r.lower())
        pend = self.P.ordenes_mac_pendientes()
        self.assertEqual(len(pend), 1)
        self.assertEqual(pend[0]["orden"], "buscar_capacidad")
        self.assertEqual(pend[0]["quien"], "alex")

    def test_con_mac_no_encola(self):
        r = self.P._atender_orden_director_a1(
            "busca más capacidad", enviar_fn=lambda p: {"ok": True, "detalle": "pedida a la Mac"})
        self.assertIn("pedida", r.lower())
        self.assertEqual(self.P.ordenes_mac_pendientes(), [])

    def test_drenar_envia_lo_encolado(self):
        self.P.encolar_orden_mac({"orden": "pausar_enjambre", "argumentos": {}, "quien": "alex",
                                  "motivo": "prueba", "canal": "audiovisual", "medio": "a1"})
        self.assertEqual(self.P.drenar_ordenes_mac(enviar_fn=lambda p: {"ok": True}), 1)
        self.assertEqual(self.P.ordenes_mac_pendientes(), [])


class PruebasVerificacion(unittest.TestCase):
    def test_tabla_canal_por_medio_con_motivo(self):
        sondas = {
            ("principal", "mac"): ("puede", "la puerta contestó"),
            ("general", "telegram"): ("no puede", "falta TELEGRAM_BOT_TOKEN"),
        }
        tabla = V.evaluar(sondas)
        self.assertEqual(len(tabla), len(V.CANALES) * len(V.MEDIOS))
        por_clave = {(c["canal"], c["medio"]): c for c in tabla}
        self.assertEqual(por_clave[("principal", "mac")]["estado"], "puede")
        self.assertEqual(por_clave[("general", "telegram")]["estado"], "no puede")
        self.assertEqual(por_clave[("audiovisual", "codex")]["estado"], "no comprobable")
        self.assertTrue(por_clave[("audiovisual", "codex")]["motivo"])
        resumen = V.resumir(tabla)
        self.assertEqual(resumen["puede"], 1)
        self.assertEqual(resumen["no puede"], 1)
        self.assertEqual(sum(resumen.values()), len(tabla))

    def test_la_salida_es_la_del_panel(self):
        self.assertTrue(str(V.ruta_salida()).endswith(
            os.path.join("starseed_memory_root", "mando", "director", "verificacion-accesos.json")))


if __name__ == "__main__":
    unittest.main()
