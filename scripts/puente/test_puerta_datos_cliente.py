# -*- coding: utf-8 -*-
"""Pruebas del cliente Python de la puerta de datos (PDA1010).

1. Elección automática y respaldo con un HTTP de mentira: puerta sana → puerta; caída → respaldo
   (Supabase); los dos caídos → cola en disco que se vacía sola al volver; un «no» de la puerta
   (401/403/400) NO se salta yendo a Supabase; nada de URLs ni fichas en los errores.
2. Contrato de verdad Python ↔ Node: arranca el servicio REAL (`servicios/puerta-datos`) en un
   puerto efímero con una ficha de usar y tirar y habla con él (se salta sin Node ≥ 22.13).
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)
RAIZ = os.path.dirname(os.path.dirname(DIR))
SERVICIO = os.path.join(RAIZ, "servicios", "puerta-datos")

import puerta_datos_cliente as pdc  # noqa: E402


class Reloj:
    def __init__(self):
        self.t = 1_790_000_000.0

    def __call__(self):
        return self.t


class HttpFalso:
    def __init__(self):
        self.sana = True
        self.estado_escritura = 200
        self.llamadas = []

    def __call__(self, metodo, url, cab, cuerpo=None, timeout=8):
        self.llamadas.append((metodo, url, cuerpo))
        if not self.sana:
            raise OSError("conexión rechazada por https://datos.1-2-3-4.sslip.io con pd_" + "x" * 30)
        if url.endswith("/salud"):
            return 200, {"ok": True}
        if metodo == "POST" and url.endswith("/v1/bus/eventos"):
            return self.estado_escritura, ({"id": len(self.llamadas)} if self.estado_escritura == 200 else {"error": "no"})
        return 404, {"error": "ruta desconocida"}


class TestEleccionYRespaldo(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="pd-cli-")
        self.reloj = Reloj()
        self.http = HttpFalso()
        self.p = pdc.Puerta(url="https://puerta.prueba", ficha="pd_" + "f" * 43, http=self.http, ahora=self.reloj,
                            cola=os.path.join(self.dir, "cola.jsonl"))
        self.supabase = []

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def respaldo(self, ev):
        self.supabase.append(ev)
        return {"ok": True}

    def test_puerta_sana(self):
        r = self.p.publicar_evento("enjambre", "integrada", "T1", tarea="T1", respaldo=self.respaldo)
        self.assertEqual(r["via"], "puerta")
        self.assertEqual(self.supabase, [])
        # La salud se reutiliza 30 s: no una sonda por escritura.
        self.p.publicar_evento("enjambre", "integrada", "T2", respaldo=self.respaldo)
        self.assertEqual(sum(1 for m, u, _ in self.http.llamadas if u.endswith("/salud")), 1)

    def test_caida_va_a_supabase_y_espera_antes_de_volver_a_probar(self):
        self.http.sana = False
        r = self.p.publicar_evento("enjambre", "integrada", "T1", respaldo=self.respaldo)
        self.assertEqual(r["via"], "supabase")
        self.assertEqual(len(self.supabase), 1)
        n = len(self.http.llamadas)
        self.p.publicar_evento("enjambre", "integrada", "T2", respaldo=self.respaldo)
        self.assertEqual(len(self.http.llamadas), n, "durante la espera no se insiste a la puerta")
        self.http.sana = True
        self.reloj.t += 61
        self.assertEqual(self.p.publicar_evento("enjambre", "integrada", "T3", respaldo=self.respaldo)["via"], "puerta")

    def test_las_dos_caidas_van_a_la_cola_y_se_vacian_al_volver(self):
        self.http.sana = False

        def roto(_):
            raise RuntimeError("Supabase 402 en https://x.supabase.co")

        r = self.p.publicar_evento("enjambre", "integrada", "T1", respaldo=roto)
        self.assertEqual(r["via"], "cola")
        self.assertNotIn("https://", r["motivo"])
        self.p.publicar_evento("enjambre", "integrada", "T2", respaldo=roto)
        with open(self.p.cola, encoding="utf-8") as f:
            self.assertEqual(len(f.read().splitlines()), 2)
        self.assertEqual(os.stat(self.p.cola).st_mode & 0o777, 0o600)
        self.http.sana = True
        self.reloj.t += 700
        self.assertEqual(self.p.publicar_evento("enjambre", "integrada", "T3", respaldo=roto)["via"], "puerta")
        with open(self.p.cola, encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "")
        textos = [c["texto"] for m, u, c in self.http.llamadas if c and u.endswith("/v1/bus/eventos")]
        self.assertEqual(textos, ["T3", "T1", "T2"])

    def test_un_no_de_la_puerta_no_se_salta_por_supabase(self):
        self.http.estado_escritura = 403
        r = self.p.publicar_evento("enjambre", "integrada", "T1", respaldo=self.respaldo)
        self.assertEqual((r["via"], r["estado"]), ("puerta", 403))
        self.assertEqual(self.supabase, [])

    def test_sin_configurar_va_directo_al_respaldo(self):
        p = pdc.Puerta(url="", ficha="", http=self.http, ahora=self.reloj, cola=os.path.join(self.dir, "c2.jsonl"))
        self.assertEqual(p.publicar_evento("a", "b", respaldo=self.respaldo)["via"], "supabase")
        self.assertEqual(self.http.llamadas, [])

    def test_desde_entorno_solo_https(self):
        viejo = dict(os.environ)
        try:
            os.environ["PUERTA_DATOS_URL"] = "http://inseguro.example"
            os.environ["PUERTA_DATOS_FICHA_ENJAMBRE"] = "pd_" + "a" * 43
            self.assertFalse(pdc.Puerta.desde_entorno("enjambre").configurada())
            os.environ["PUERTA_DATOS_URL"] = "https://datos.ejemplo"
            self.assertTrue(pdc.Puerta.desde_entorno("enjambre").configurada())
        finally:
            os.environ.clear()
            os.environ.update(viejo)

    def test_tachar(self):
        t = pdc.tachar("fallo en https://datos.1-2-3-4.sslip.io/v1 con pd_" + "z" * 40 + " desde 10.0.0.7")
        self.assertNotIn("sslip", t)
        self.assertNotIn("pd_zzz", t)
        self.assertNotIn("10.0.0.7", t)


def _node_valido():
    node = shutil.which("node")
    if not node:
        return None
    try:
        v = subprocess.run([node, "-p", "process.versions.node"], capture_output=True, text=True, timeout=10).stdout.strip()
        a, b = (int(x) for x in v.split(".")[:2])
        return node if (a, b) >= (22, 13) else None
    except Exception:  # noqa: BLE001
        return None


def _puerto_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@unittest.skipUnless(_node_valido(), "sin Node ≥ 22.13")
class TestContratoConElServicioReal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(prefix="pd-real-")
        cls.puerto = _puerto_libre()
        cls.env = dict(os.environ, PUERTA_PUERTO=str(cls.puerto), PUERTA_DIR=os.path.join(cls.dir, "datos"),
                       PUERTA_FICHAS=os.path.join(cls.dir, "tokens.json"), SUPABASE_URL="http://127.0.0.1:9",
                       SUPABASE_ANON_KEY="anon-de-prueba", PUERTA_CADDY="0")
        node = _node_valido()
        bin_ = os.path.join(SERVICIO, "bin", "puerta-datos.mjs")
        cls.ficha = subprocess.run([node, "--disable-warning=ExperimentalWarning", bin_, "ficha", "nueva", "enjambre-prueba", "bus,latidos,freno,metricas", "--imprimir"],
                                   env=cls.env, capture_output=True, text=True, timeout=30, check=True).stdout.strip()
        cls.proc = subprocess.Popen([node, "--disable-warning=ExperimentalWarning", bin_, "servir"], env=cls.env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.url = "http://127.0.0.1:%d" % cls.puerto
        for _ in range(50):
            try:
                estado, _ = pdc._http("GET", cls.url + "/salud", {}, timeout=1)
                if estado == 200:
                    break
            except Exception:  # noqa: BLE001
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try:
            cls.proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            cls.proc.kill()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def test_bus_latidos_freno_y_metricas_de_verdad(self):
        self.assertTrue(self.ficha.startswith("pd_"))
        p = pdc.Puerta(url=self.url, ficha=self.ficha, cola=os.path.join(self.dir, "cola.jsonl"))
        r = p.publicar_evento("enjambre", "integrada", "T1 integrada", tarea="T1", datos={"sha": "abc"})
        self.assertEqual(r["via"], "puerta")
        leidos = p.leer_eventos(desde=0)
        self.assertEqual(leidos["eventos"][-1]["texto"], "T1 integrada")
        # Espera larga de verdad: se publica mientras se espera.
        import threading
        threading.Timer(0.3, lambda: p.publicar_evento("vigia", "aviso", "ya")).start()
        t0 = time.time()
        nuevos = p.leer_eventos(desde=leidos["ultimo"], esperar=5)
        self.assertEqual(nuevos["eventos"][0]["texto"], "ya")
        self.assertLess(time.time() - t0, 4)
        self.assertEqual(p.latido("agente", "T1", {"fase": "escribiendo"})["via"], "puerta")
        self.assertEqual(p.freno_poner(True, "25.022 de 25.000")["via"], "puerta")
        m = p.metricas()
        self.assertGreaterEqual(m["hoy"]["servidas"], 4)
        self.assertEqual(m["replica"]["activa"], False)  # sin llave: no replica, y lo dice
        # Una ficha falsa: «no», sin respaldo silencioso.
        mala = pdc.Puerta(url=self.url, ficha="pd_" + "q" * 43, cola=os.path.join(self.dir, "c.jsonl"))
        r = mala.publicar_evento("x", "y", respaldo=lambda ev: self.fail("no debía ir a Supabase"))
        self.assertEqual(r["estado"], 401)

    def test_nodo_de_metagenesis_con_su_llave(self):
        import hashlib
        import secrets
        node = _node_valido()
        bin_ = os.path.join(SERVICIO, "bin", "puerta-datos.mjs")
        admin = subprocess.run([node, "--disable-warning=ExperimentalWarning", bin_, "ficha", "nueva", "admin-prueba", "admin", "--imprimir"],
                               env=self.env, capture_output=True, text=True, timeout=30, check=True).stdout.strip()
        llave = secrets.token_urlsafe(32)
        adm = pdc.Puerta(url=self.url, ficha=admin, cola=os.path.join(self.dir, "c3.jsonl"))
        time.sleep(0.1)
        estado, _ = adm._pedir("POST", "/v1/admin/nodos", {"nodo": "mac-a1b2c3", "medio": "mac", "huella": hashlib.sha256(llave.encode()).hexdigest()})
        if estado == 401:  # el servicio relee las fichas cada 30 s: se da de alta directo en su base
            subprocess.run([node, "--disable-warning=ExperimentalWarning", bin_, "nodo", "registrar", "mac-a1b2c3", "mac",
                            hashlib.sha256(llave.encode()).hexdigest()], env=self.env, check=True, capture_output=True, timeout=30)
        nodo = pdc.Puerta(url=self.url, ficha="", cola=os.path.join(self.dir, "c4.jsonl"))
        r = nodo.metagenesis_latir("mac-a1b2c3", llave, "mac", 300, {"modo": "real"})
        self.assertEqual(r["arriendo"]["lider"], "mac-a1b2c3")
        self.assertIsNone(nodo.metagenesis_latir("mac-a1b2c3", "z" * 43, "mac", 300))
        self.assertTrue(nodo.metagenesis("ceder", "mac-a1b2c3", llave))
        # Sin ficha, un nodo no puede publicar en el bus por la puerta: va a su respaldo.
        self.assertEqual(nodo.publicar_evento("x", "y", respaldo=lambda ev: "ok")["via"], "supabase")


if __name__ == "__main__":
    unittest.main()
