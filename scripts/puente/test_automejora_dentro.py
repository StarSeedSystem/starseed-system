# -*- coding: utf-8 -*-
"""Pruebas de dentro.py (MTN1027F): la caja de la automejora Meta^n.
Sin Docker y sin meta-n: la orden de meta-n como texto, el reenviador
contra una pasarela falsa en socket UNIX y la cadena del archive."""
import importlib.util
import json
import socket
import sys
import tempfile
import threading
import unittest
from pathlib import Path

RUTA = Path(__file__).resolve().parents[2] / "deploy/oracle/nodo/automejora/dentro.py"
_especie = importlib.util.spec_from_file_location("dentro", RUTA)
assert _especie is not None and _especie.loader is not None, "no se pudo cargar dentro.py"
dentro = importlib.util.module_from_spec(_especie)
sys.modules["dentro"] = dentro
_especie.loader.exec_module(dentro)

PEDIDO = b"POST /v1/chat/completions HTTP/1.1\r\n\r\nhola, pasarela"
RESPUESTA = b"HTTP/1.1 200 OK\r\n\r\nhola, dentro de la caja"
RECIBIDO: list[bytes] = []


def pasarela_falsa(ruta: str, lista: threading.Event) -> None:
    """Una pasarela tonta: recibe una conexión, la lee y contesta una vez."""
    servidor = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    servidor.bind(ruta)
    servidor.listen(4)
    lista.set()
    con, _ = servidor.accept()
    RECIBIDO.append(con.recv(65536))
    con.sendall(RESPUESTA)
    con.close()
    servidor.close()


class TestConstruirOrden(unittest.TestCase):
    def test_la_orden_de_la_noche(self):
        orden = dentro.construir_orden(
            {"modelo": "colibri-razon", "iteraciones": 6, "paciencia": 2})
        self.assertEqual(orden, [
            "meta-n", "--tasks", "/work/tareas.json", "--use-archive",
            "--base-url", "http://127.0.0.1:8080/v1", "--api-key", "caja",
            "--model", "colibri-razon",
            "--max-iterations", "6", "--patience", "2",
            "--parallel", "1", "--daily-budget-usd", "0",
            "--output-dir", "/work/salida", "--exp-name", "noche",
        ])

    def test_sin_dinero_ni_paralelismo_con_otros_valores(self):
        orden = dentro.construir_orden(
            {"modelo": "gpt-99", "iteraciones": 33, "paciencia": 7})
        self.assertEqual(orden[orden.index("--daily-budget-usd") + 1], "0")
        self.assertEqual(orden[orden.index("--parallel") + 1], "1")
        self.assertEqual(orden[orden.index("--max-iterations") + 1], "33")
        self.assertEqual(orden[orden.index("--patience") + 1], "7")


class TestReenviador(unittest.TestCase):
    def test_pasa_el_pedido_y_devuelve_la_respuesta_con_socket_falso(self):
        RECIBIDO.clear()
        with tempfile.TemporaryDirectory() as temp:
            ruta = str(Path(temp) / "pasarela-falsa.sock")
            lista = threading.Event()
            pasarela = threading.Thread(target=pasarela_falsa, args=(ruta, lista), daemon=True)
            pasarela.start()
            self.assertTrue(lista.wait(5.0))
            servidor = dentro.abrir_reenvio(0)
            self.assertEqual(servidor.getsockname()[0], "127.0.0.1")
            escucha = threading.Thread(target=dentro.reenviar, args=(servidor, ruta), daemon=True)
            escucha.start()
            cliente = socket.create_connection(("127.0.0.1", servidor.getsockname()[1]), timeout=5)
            cliente.sendall(PEDIDO)
            cliente.shutdown(socket.SHUT_WR)
            trozos = []
            while trozo := cliente.recv(65536):
                trozos.append(trozo)
            cliente.close()
            servidor.close()
            pasarela.join(5.0)
        self.assertTrue(RECIBIDO, "la pasarela falsa no recibió ningún pedido")
        self.assertEqual(RECIBIDO[0], PEDIDO)
        self.assertEqual(b"".join(trozos), RESPUESTA)


class TestCadenaDelArchive(unittest.TestCase):
    def test_orden_por_profundidad_y_salida_sin_prompts(self):
        # Cambia ARCHIVE del módulo a un archive de mentira y lo devuelve al salir.
        self.addCleanup(setattr, dentro, "ARCHIVE", dentro.ARCHIVE)
        with tempfile.TemporaryDirectory() as temp:
            setattr(dentro, "ARCHIVE", Path(temp) / "archive")
            caja = dentro.ARCHIVE / "cand-1"
            caja.mkdir(parents=True)
            capa_d2 = {"pre_process": "add = 'pauta de la d2'",
                       "code_library": {"f": "def f():\n    return 1"},
                       "raw_omega_prompt": "EL PROMPT DE OMEGA"}
            capa_d10 = {"pre_process": None, "code_library_bash": {"g": "g() { :; }"},
                        "raw_omega_prompt": "EL PROMPT DE OMEGA D10",
                        "raw_omega_response": "SU RESPUESTA"}
            for d, capa in (("2", capa_d2), ("10", capa_d10)):
                (caja / f"injected_code_d{d}.json").write_text(json.dumps(capa), encoding="utf-8")
            cadena = dentro.leer_cadena("cand-1")
            self.assertEqual([c.get("pre_process") for c in cadena],
                             ["add = 'pauta de la d2'", None])  # d2 antes que d10
            limpios = [dentro._sin_prompts(capa) for capa in cadena]
            for limpio in limpios:
                self.assertNotIn("raw_omega_prompt", limpio)
                self.assertNotIn("raw_omega_response", limpio)
            self.assertEqual(limpios[0].get("code_library"), {"f": "def f():\n    return 1"})
            self.assertEqual(limpios[1].get("code_library_bash"), {"g": "g() { :; }"})
            self.assertIn("raw_omega_prompt", cadena[1])  # la original sí lo llevaba
        self.assertEqual(dentro.leer_cadena("no-existe"), [])


if __name__ == "__main__":
    unittest.main()
