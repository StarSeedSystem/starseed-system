"""Pruebas de los disparadores: cron puro, chat puro, bus puro y pendientes()."""

import json
from pathlib import Path
import tempfile
import unittest
from datetime import datetime

from scripts.puente.flujos import Conexion, Flujo, Nodo, guardar_flujo
from scripts.puente.flujos.disparadores import (ARCHIVO_ESTADO, coincide_cron,
                                                disparador_de, disparadores_de,
                                                filtrar_eventos,
                                                parsear_orden_chat, pendientes)


class CronPuroTest(unittest.TestCase):
    def test_campos_simples(self):
        momento = datetime(2026, 10, 5, 9, 30)  # lunes (día 5, semana 1)
        self.assertTrue(coincide_cron("30 9 * * *", momento))
        self.assertTrue(coincide_cron("30 9 5 * *", momento))
        self.assertFalse(coincide_cron("31 9 * * *", momento))
        self.assertFalse(coincide_cron("30 10 * * *", momento))

    def test_listas_rangos_y_pasos(self):
        momento = datetime(2026, 10, 5, 9, 45)
        self.assertTrue(coincide_cron("*/15 * * * *", momento))
        self.assertTrue(coincide_cron("10,20,45 * * * *", momento))
        self.assertTrue(coincide_cron("40-50 * * * *", momento))
        self.assertFalse(coincide_cron("*/20 * * * *", momento))

    def test_dia_y_semana_se_unen_con_or(self):
        dia_5 = datetime(2026, 10, 5, 0, 0)  # lunes
        self.assertTrue(coincide_cron("0 0 5 * 1", dia_5))
        self.assertTrue(coincide_cron("0 0 5 * 1", datetime(2026, 10, 12, 0, 0)))  # lunes
        self.assertFalse(coincide_cron("0 0 5 * 1", datetime(2026, 10, 11, 0, 0)))

    def test_expresion_mala_lanza(self):
        with self.assertRaises(ValueError):
            coincide_cron("0 0 * *", datetime(2026, 1, 1))


class ChatYBusPurosTest(unittest.TestCase):
    def test_parsear_orden_chat(self):
        self.assertEqual(("f1", "hola"), parsear_orden_chat("/flujo f1 hola"))
        self.assertEqual(("f1", ""), parsear_orden_chat("/flujo f1"))
        self.assertIsNone(parsear_orden_chat("/flujo"))
        self.assertIsNone(parsear_orden_chat("hola /flujo f1"))
        self.assertIsNone(parsear_orden_chat(""))

    def test_filtrar_eventos(self):
        filas = [{"tipo": "commit", "epoch": 10}, {"tipo": "mensaje", "epoch": 20},
                 {"tipo": "publicada", "epoch": 30}]
        self.assertEqual([filas[2]], filtrar_eventos(filas, {"publicada"}, 15))
        self.assertEqual([], filtrar_eventos(filas, {"commit"}, 10))
        self.assertEqual([], filtrar_eventos(filas, set()))


class PendientesTest(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.raiz = Path(self.temporal.name)
        (self.raiz.parent / "olas").mkdir(exist_ok=True)
        (self.raiz.parent / "mando").mkdir(exist_ok=True)

    def tearDown(self):
        self.temporal.cleanup()

    def _flujo(self, flujo_id, nodo: Nodo) -> None:
        salida = Nodo(id="salida", tipo="log", configuracion={})
        guardar_flujo(Flujo(id=flujo_id, nombre=flujo_id,
                            nodos=[nodo, salida],
                            conexiones=[]), self.raiz)


class PendientesWebhookTest(PendientesTest):
    def test_consume_entrada_una_sola_vez(self):
        self._flujo("gancho", Nodo(id="entra", tipo="webhook",
                                   configuracion={"ruta": "n8n"}))
        entrada = self.raiz / "entrada"
        entrada.mkdir()
        (entrada / "111-n8n.json").write_text(
            json.dumps({"cuerpo": {"hola": 1}}), encoding="utf-8")
        (entrada / "111-otra.json").write_text(
            json.dumps({"cuerpo": {"no": True}}), encoding="utf-8")
        primero = pendientes(self.raiz)
        self.assertEqual(1, len(primero))
        flujo, items = primero[0]
        self.assertEqual("gancho", flujo.id)
        self.assertEqual(1, len(items))
        self.assertEqual(1, items[0]["hola"])
        self.assertEqual("webhook", items[0]["disparador"])
        self.assertEqual("entra", items[0]["_disparador"])
        self.assertFalse((entrada / "111-n8n.json").exists())
        self.assertTrue((entrada / "111-otra.json").exists())  # otra ruta intacta
        self.assertEqual([], pendientes(self.raiz))  # no se repite

    def test_sin_archivos_no_hay_nada(self):
        self._flujo("gancho", Nodo(id="entra", tipo="webhook",
                                   configuracion={"ruta": "n8n"}))
        self.assertEqual([], pendientes(self.raiz))


class PendientesCronTest(PendientesTest):
    def test_dispara_una_vez_por_minuto(self):
        self._flujo("reloj", Nodo(id="cada", tipo="cron",
                                  configuracion={"expresion": "30 9 * * *"}))
        momento = datetime(2026, 10, 5, 9, 30)
        primero = pendientes(self.raiz, ahora=momento)
        self.assertEqual(1, len(primero))
        self.assertEqual("cron", primero[0][1][0]["disparador"])
        self.assertEqual([], pendientes(self.raiz, ahora=momento))
        siguiente = datetime(2026, 10, 6, 9, 30)
        self.assertEqual(1, len(pendientes(self.raiz, ahora=siguiente)))

    def test_no_dispara_fuera_de_marca(self):
        self._flujo("reloj", Nodo(id="cada", tipo="cron",
                                  configuracion={"expresion": "30 9 * * *"}))
        self.assertEqual([], pendientes(self.raiz, ahora=datetime(2026, 10, 5, 9, 31)))


class PendientesBusTest(PendientesTest):
    def test_eventos_por_tipo_con_cursor(self):
        self._flujo("escucha", Nodo(id="bus", tipo="bus",
                                    configuracion={"tipos": ["commit", "publicada"]}))
        canal = self.raiz.parent / "olas" / "canal.jsonl"
        canal.write_text("\n".join([
            json.dumps({"tipo": "commit", "epoch": 5, "texto": "a"}),
            json.dumps({"tipo": "mensaje", "epoch": 6}),
            json.dumps({"tipo": "publicada", "epoch": 7, "texto": "b"}),
        ]) + "\n", encoding="utf-8")
        primero = pendientes(self.raiz)
        self.assertEqual(1, len(primero))
        self.assertEqual(["commit", "publicada"],
                         [e["tipo"] for e in primero[0][1]])
        self.assertEqual([], pendientes(self.raiz))


class PendientesChatTest(PendientesTest):
    def test_orden_del_chat_director(self):
        self._flujo("saludar", Nodo(id="chat", tipo="chat", configuracion={}))
        mando = self.raiz.parent / "mando" / "canal.jsonl"
        mando.write_text("\n".join([
            json.dumps({"tipo": "mensaje", "epoch": 1, "quien": "alex",
                        "texto": "/flujo saludar buenas"}),
            json.dumps({"tipo": "mensaje", "epoch": 2, "texto": "/flujo otro no"}),
        ]) + "\n", encoding="utf-8")
        primero = pendientes(self.raiz)
        self.assertEqual(1, len(primero))
        self.assertEqual("saludar", primero[0][0].id)
        self.assertEqual("buenas", primero[0][1][0]["texto"])
        self.assertEqual([], pendientes(self.raiz))


class DisparadorDeTest(unittest.TestCase):
    def test_encuentra_el_disparador(self):
        flujo = Flujo(id="f", nombre="f", nodos=[
            Nodo(id="a", tipo="log"), Nodo(id="b", tipo="webhook")])
        self.assertEqual("b", disparador_de(flujo).id)
        self.assertIsNone(disparador_de(Flujo(id="g", nombre="g",
                                              nodos=[Nodo(id="a", tipo="log")])))


class DisparadoresDeTest(unittest.TestCase):
    def test_devuelve_todos_y_el_primero_sigue_igual(self):
        flujo = Flujo(id="f", nombre="f", nodos=[
            Nodo(id="log", tipo="log"),
            Nodo(id="w1", tipo="webhook", configuracion={"ruta": "a"}),
            Nodo(id="reloj", tipo="cron"),
            Nodo(id="w2", tipo="webhook", configuracion={"ruta": "b"})])
        self.assertEqual(["w1", "reloj", "w2"],
                         [n.id for n in disparadores_de(flujo)])
        self.assertEqual("w1", disparador_de(flujo).id)  # compatibilidad
        vacio = Flujo(id="g", nombre="g", nodos=[Nodo(id="a", tipo="log")])
        self.assertEqual([], disparadores_de(vacio))
        self.assertIsNone(disparador_de(vacio))


class PendientesVariosWebhooksTest(PendientesTest):
    """El flujo trasladado de n8n «StarSeed · Producción (puentes)»: 3 webhooks,
    cada uno con su Set. Antes solo escuchaba el primero; ahora, los tres."""

    RUTAS = ("starseed-produccion-publicada",
             "starseed-produccion-pieza-lista",
             "starseed-produccion-revertida")

    def setUp(self):
        super().setUp()
        nodos: list[Nodo] = []
        conexiones: list[Conexion] = []
        for indice, ruta in enumerate(self.RUTAS):
            gancho = f"gancho-{indice}"
            nodos.append(Nodo(id=gancho, tipo="webhook",
                              configuracion={"ruta": ruta}))
            nodos.append(Nodo(id=f"set-{indice}", tipo="set", configuracion={}))
            conexiones.append(Conexion(origen=gancho, destino=f"set-{indice}"))
        guardar_flujo(Flujo(id="produccion", nombre="StarSeed · Producción",
                            nodos=nodos, conexiones=conexiones), self.raiz)

    def _dejar(self, ruta: str, cuerpo: dict) -> None:
        entrada = self.raiz / "entrada"
        entrada.mkdir(exist_ok=True)
        (entrada / f"111-{ruta}.json").write_text(
            json.dumps({"cuerpo": cuerpo}), encoding="utf-8")

    def test_escucha_los_tres_ganchos(self):
        for indice, ruta in enumerate(self.RUTAS):
            self._dejar(ruta, {"pieza": indice})
        primero = pendientes(self.raiz)
        self.assertEqual(3, len(primero))
        por_nodo = {items[0]["_disparador"]: items for _, items in primero}
        self.assertEqual({f"gancho-{i}" for i in range(3)}, set(por_nodo))
        for indice, ruta in enumerate(self.RUTAS):
            items = por_nodo[f"gancho-{indice}"]
            self.assertEqual(1, len(items))
            self.assertEqual("webhook", items[0]["disparador"])
            self.assertEqual(ruta, items[0]["ruta"])
            self.assertEqual(indice, items[0]["pieza"])
        self.assertEqual([], pendientes(self.raiz))  # nada queda sin consumir

    def test_solo_el_gancho_con_archivos_da_pareja(self):
        self._dejar(self.RUTAS[1], {"pieza": "lista"})
        primero = pendientes(self.raiz)
        self.assertEqual(1, len(primero))
        self.assertEqual("gancho-1", primero[0][1][0]["_disparador"])
        self.assertEqual("lista", primero[0][1][0]["pieza"])


class PendientesCursorViejoTest(PendientesTest):
    """El estado previo llevaba la clave «flujo.id»; al pasar a «flujo:nodo»
    no se reentrega lo ya consumido por el primer disparador."""

    def _escribir_estado(self, estado: dict) -> None:
        (self.raiz / ARCHIVO_ESTADO).write_text(
            json.dumps(estado), encoding="utf-8")

    def test_cursor_viejo_del_bus_no_reentrega(self):
        self._flujo("escucha", Nodo(id="bus", tipo="bus",
                                    configuracion={"tipos": ["commit"]}))
        self._escribir_estado({"bus": {"escucha": 7}})
        canal = self.raiz.parent / "olas" / "canal.jsonl"
        canal.write_text("\n".join([
            json.dumps({"tipo": "commit", "epoch": 5, "texto": "viejo"}),
            json.dumps({"tipo": "commit", "epoch": 9, "texto": "nuevo"}),
        ]) + "\n", encoding="utf-8")
        primero = pendientes(self.raiz)
        self.assertEqual(1, len(primero))
        self.assertEqual(["nuevo"], [e["texto"] for e in primero[0][1]])
        self.assertEqual("bus", primero[0][1][0]["_disparador"])
        leido = json.loads((self.raiz / ARCHIVO_ESTADO)
                           .read_text(encoding="utf-8"))
        self.assertEqual({"escucha:bus": 9}, leido["bus"])
        self.assertEqual([], pendientes(self.raiz))

    def test_cursor_viejo_del_chat_no_reentrega(self):
        self._flujo("saludar", Nodo(id="chat", tipo="chat", configuracion={}))
        self._escribir_estado({"chat": {"saludar": 1}})
        mando = self.raiz.parent / "mando" / "canal.jsonl"
        mando.write_text("\n".join([
            json.dumps({"tipo": "mensaje", "epoch": 1,
                        "texto": "/flujo saludar vieja"}),
            json.dumps({"tipo": "mensaje", "epoch": 3,
                        "texto": "/flujo saludar nueva"}),
        ]) + "\n", encoding="utf-8")
        primero = pendientes(self.raiz)
        self.assertEqual(1, len(primero))
        self.assertEqual(["nueva"], [i["texto"] for i in primero[0][1]])
        self.assertEqual("chat", primero[0][1][0]["_disparador"])
        self.assertEqual([], pendientes(self.raiz))


if __name__ == "__main__":
    unittest.main()
