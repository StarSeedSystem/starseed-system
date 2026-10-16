"""Pruebas de los disparadores: cron puro, chat puro, bus puro y pendientes()."""

import json
import sys
from pathlib import Path
import tempfile
import unittest
from datetime import datetime

# Añadir el directorio raíz al path para poder importar los módulos de scripts
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from scripts.puente.flujos import Flujo, Nodo, guardar_flujo, cargar_flujo
from scripts.puente.flujos.disparadores import (coincide_cron, disparador_de,
                                                 disparadores_de,
                                                 filtrar_eventos,
                                                 parsear_orden_chat, pendientes,
                                                 _estado, ARCHIVO_ESTADO, escribir_json)


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
        flujo, items = primero[0]
        self.assertEqual(1, len(items))
        self.assertEqual("cron", items[0]["disparador"])
        self.assertEqual("cada", items[0]["_disparador"])
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
        flujo, items = primero[0]
        self.assertEqual(2, len(items))
        self.assertEqual(["commit", "publicada"],
                         [e["tipo"] for e in items])
        self.assertEqual("bus", items[0]["disparador"])
        self.assertEqual("bus", items[1]["disparador"])
        self.assertEqual("bus", items[0]["_disparador"])
        self.assertEqual("bus", items[1]["_disparador"])
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
        flujo, items = primero[0]
        self.assertEqual("saludar", flujo.id)
        self.assertEqual(1, len(items))
        self.assertEqual("buenas", items[0]["texto"])
        self.assertEqual("chat", items[0]["disparador"])
        self.assertEqual("chat", items[0]["_disparador"])
        self.assertEqual([], pendientes(self.raiz))


class PendientesMultiplesDisparadoresTest(PendientesTest):
    def test_dos_disparadores_webhook_y_cron(self):
        # Flujo con dos disparadores: webhook y cron
        self._flujo("multi", Nodo(id="webhook", tipo="webhook",
                                    configuracion={"ruta": "ruta1"}))
        # Añadimos un segundo disparador cron manualmente al flujo
        flujo = cargar_flujo("multi", self.raiz)
        flujo.nodos.insert(1, Nodo(id="cron", tipo="cron",
                                   configuracion={"expresion": "* * * * *"}))
        guardar_flujo(flujo, self.raiz)

        # Creamos un archivo de entrada para el webhook
        entrada_dir = self.raiz / "entrada"
        entrada_dir.mkdir()
        (entrada_dir / "111-ruta1.json").write_text(
            json.dumps({"cuerpo": {"test": 1}}), encoding="utf-8")

        # Momento que coincide con el cron (cualquier minuto)
        momento = datetime(2026, 10, 5, 9, 30)
        resultado = pendientes(self.raiz, ahora=momento)

        # Debemos obtener dos entradas: una para el webhook y una para el cron
        self.assertEqual(2, len(resultado))

        # Identificamos cada entrada por su disparador
        entradas_por_tipo = {item[1][0]["disparador"]: item[1][0] for item in resultado}
        self.assertIn("webhook", entradas_por_tipo)
        self.assertIn("cron", entradas_por_tipo)

        webhook_item = entradas_por_tipo["webhook"]
        cron_item = entradas_por_tipo["cron"]

        self.assertEqual("webhook", webhook_item["disparador"])
        self.assertEqual("webhook", webhook_item["_disparador"])
        self.assertEqual(1, webhook_item["test"])

        self.assertEqual("cron", cron_item["disparador"])
        self.assertEqual("cron", cron_item["_disparador"])
        self.assertEqual(momento.strftime("%Y-%m-%dT%H:%M"), cron_item["marca"])
        self.assertEqual("* * * * *", cron_item["expresion"])

        # Verificamos que el estado se haya almacenado con la clave flujo:nodo
        estado = _estado(self.raiz)
        self.assertEqual(momento.strftime("%Y-%m-%dT%H:%M"),
                         estado.get("cron", {}).get("multi:cron"))
        # El webhook no deja estado

        # Llamamos nuevamente y no debe haber nada (idempotente)
        self.assertEqual([], pendientes(self.raiz, ahora=momento))

    def test_estado_antiguo_del_primer_disparador_cron(self):
        # Flujo con dos disparadores: el primero es cron, el segundo es webhook
        self._flujo("multi2", Nodo(id="cron", tipo="cron",
                                   configuracion={"expresion": "* * * * *"}))
        flujo = cargar_flujo("multi2", self.raiz)
        flujo.nodos.append(Nodo(id="webhook", tipo="webhook",
                                configuracion={"ruta": "ruta2"}))
        guardar_flujo(flujo, self.raiz)

        # Simulamos un estado antiguo bajo la clave flujo.id (para el primer disparador, que es cron)
        # Esto sería el estado que tendría el flujo bajo el sistema antiguo
        estado_antiguo = {"cron": {"multi2": "2026-10-05T09:29"}}
        escribir_json(self.raiz / ARCHIVO_ESTADO, estado_antiguo)

        # En el minuto 9:30, el cron debería disparar porque el estado antiguo (09:29) es diferente
        momento = datetime(2026, 10, 5, 9, 30)
        resultado = pendientes(self.raiz, ahora=momento)

        # Debemos obtener dos entradas: cron (una entrada) y webhook (sin archivo, así que nada)
        # Pero note: no hemos creado ningún archivo de entrada para el webhook, así que el webhook no producirá entrada
        # Sólo el cron debería producir una entrada
        self.assertEqual(1, len(resultado))
        flujo_resultado, items = resultado[0]
        self.assertEqual("cron", items[0]["disparador"])
        self.assertEqual("cron", items[0]["_disparador"])
        self.assertEqual("2026-10-05T09:30", items[0]["marca"])

        # Después de la ejecución, el estado bajo la clave multi2:cron debería ser 09:30
        estado_nuevo = _estado(self.raiz)
        self.assertEqual("2026-10-05T09:30",
                         estado_nuevo.get("cron", {}).get("multi2:cron"))
        # La clave antigua multi2 bajo cron debería seguir estando (no la borramos) pero no se usa para el cron ahora
        # Aunque en nuestra implementación, para el primer disparador (que es el cron) usamos el estado antiguo si es más reciente.

        # Ahora, volvemos a llamar en el mismo minuto y no debe haber nada
        self.assertEqual([], pendientes(self.raiz, ahora=momento))

        # En el minuto siguiente, el cron debería disparar nuevamente
        momento_siguiente = datetime(2026, 10, 5, 9, 31)
        resultado_siguiente = pendientes(self.raiz, ahora=momento_siguiente)
        # Esperamos una entrada para el cron (porque el minuto cambió) y posiblemente nada para el webhook
        self.assertEqual(1, len(resultado_siguiente))
        flujo_sig, items_sig = resultado_siguiente[0]
        self.assertEqual("cron", items_sig[0]["disparador"])
        self.assertEqual("cron", items_sig[0]["_disparador"])
        self.assertEqual("2026-10-05T09:31", items_sig[0]["marca"])


class DisparadorDeTest(unittest.TestCase):
    def test_encuentra_el_disparador(self):
        flujo = Flujo(id="f", nombre="f", nodos=[
            Nodo(id="a", tipo="log"), Nodo(id="b", tipo="webhook")])
        self.assertEqual("b", disparador_de(flujo).id)
        self.assertIsNone(disparador_de(Flujo(id="g", nombre="g",
                                              nodos=[Nodo(id="a", tipo="log")])))


class DisparadoresDeTest(unittest.TestCase):
    def test_lista_todos_los_disparadores(self):
        flujo = Flujo(id="f", nombre="f", nodos=[
            Nodo(id="a", tipo="log"),
            Nodo(id="b", tipo="webhook"),
            Nodo(id="c", tipo="cron", configuracion={"expresion": "* * * * *"}),
            Nodo(id="d", tipo="log")])
        disparadores = disparadores_de(flujo)
        self.assertEqual(2, len(disparadores))
        self.assertEqual("b", disparadores[0].id)
        self.assertEqual("c", disparadores[1].id)

    def test_flujo_sin_disparadores(self):
        flujo = Flujo(id="f", nombre="f", nodos=[
            Nodo(id="a", tipo="log"), Nodo(id="b", tipo="log")])
        self.assertEqual([], disparadores_de(flujo))


if __name__ == "__main__":
    unittest.main()