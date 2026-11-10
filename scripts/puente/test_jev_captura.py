"""Captura de Jev (MGM1110B): nunca lanza, nunca espera, tacha secretos, acota, rota y resume.

Todo en directorios temporales (`STARSEED_JEV_CAPTURA_DIR`); nunca red ni ~/.starseed real.
"""
import errno
import json
import os
import shutil
import socket
import stat
import sys
import tempfile
import time
import unittest
from datetime import date, timedelta
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jev  # noqa: E402
import jev_captura as cap  # noqa: E402

PREG = {"q": {"type": "noul", "instructions": "¿Se puede aprobar esta rama?"}}
RESP = {"q": {"noul": 0.82, "confidence": 0.8}}


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = os.path.join(tempfile.mkdtemp(prefix="captura-"), "jev-captura")
        self._env = dict(os.environ)
        os.environ["STARSEED_JEV_CAPTURA_DIR"] = self.dir
        os.environ.pop("STARSEED_JEV_CAPTURA", None)
        cap.FALLOS = 0
        cap._rotado_dia = None
        cap._escrituras = 0
        cap._fallos_log = 0
        self.addCleanup(self._limpiar)

    def _limpiar(self):
        os.environ.clear()
        os.environ.update(self._env)
        try:
            os.chmod(os.path.dirname(self.dir), 0o700)
            os.chmod(self.dir, 0o700)
        except OSError:
            pass
        shutil.rmtree(os.path.dirname(self.dir), ignore_errors=True)

    def lineas(self):
        fuera = []
        for dia, e in cap.leer(self.dir):
            fuera.append(e)
        return fuera


class TestRegistro(Base):
    def test_guarda_el_prompt_completo_y_los_permisos(self):
        estado = {"texto": "x" * 3000}  # mucho más que los 401 caracteres de experiencias.jsonl
        i = cap.registrar(estado, PREG, "revisor-bloqueadas", "explabs", "jev-latest", RESP, 812.4, dominio="bloqueadas")
        self.assertTrue(i)
        (e,) = self.lineas()
        self.assertEqual(e["estado"]["texto"], "x" * 3000)
        self.assertEqual(e["preguntas"]["q"]["instructions"], "¿Se puede aprobar esta rama?")
        self.assertEqual((e["quien"], e["medio"], e["modelo"], e["ms"]), ("revisor-bloqueadas", "explabs", "jev-latest", 812.4))
        self.assertEqual(e["respuestas"]["q"]["noul"], 0.82)
        self.assertEqual(e["confianza"], 0.8)
        self.assertEqual(e["estratos"], ["noul:bloqueadas"])
        self.assertFalse(e["truncado"])
        self.assertEqual(stat.S_IMODE(os.stat(self.dir).st_mode), 0o700)
        (f,) = [f for f in os.listdir(self.dir) if f.endswith(".jsonl")]
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(self.dir, f)).st_mode), 0o600)

    def test_id_estable_y_distinto_por_llamada(self):
        a = cap.registrar({}, PREG, "x", "m", None, RESP, 1)
        b = cap.registrar({}, PREG, "x", "m", None, RESP, 1)
        self.assertNotEqual(a, b)
        self.assertEqual(len(a), 16)

    def test_el_interruptor_la_apaga(self):
        os.environ["STARSEED_JEV_CAPTURA"] = "0"
        self.assertIsNone(cap.registrar({}, PREG, "x", "m", None, RESP, 1))
        self.assertFalse(os.path.exists(self.dir))

    def test_en_pruebas_sin_directorio_propio_no_escribe(self):
        os.environ.pop("STARSEED_JEV_CAPTURA_DIR")
        self.assertFalse(cap.activa())  # esta misma prueba corre bajo unittest/pytest


class TestNuncaRompe(Base):
    def test_directorio_de_solo_lectura(self):
        os.makedirs(self.dir, mode=0o700)
        os.chmod(self.dir, 0o500)
        self.assertIsNone(cap.registrar({}, PREG, "x", "m", None, RESP, 1))
        self.assertEqual(cap.FALLOS, 1)

    def test_no_se_puede_crear_el_directorio(self):
        padre = os.path.dirname(self.dir)
        os.chmod(padre, 0o500)
        self.assertIsNone(cap.registrar({}, PREG, "x", "m", None, RESP, 1))
        self.assertGreaterEqual(cap.FALLOS, 1)

    def test_disco_lleno(self):
        def lleno(fd, datos):
            raise OSError(errno.ENOSPC, "No space left on device")

        with mock.patch("os.write", lleno):
            self.assertIsNone(cap.registrar({}, PREG, "x", "m", None, RESP, 1))
        self.assertEqual(cap.FALLOS, 1)

    def test_entrada_rara_no_lanza(self):
        class Raro:
            def __str__(self):
                raise RuntimeError("no se deja convertir")

        self.assertIsNone(cap.registrar(Raro(), PREG, "x", "m", None, RESP, 1))
        self.assertIsNone(cap.registrar({}, None, "x", "m", None, RESP, 1))
        self.assertIsNone(cap.registrar({}, PREG, "x", "m", None, "no es dict", 1))

    def test_sin_red_ni_cerrojos(self):
        def prohibido(*a, **k):
            raise AssertionError("la captura no puede abrir sockets")

        with mock.patch.object(socket, "socket", prohibido), mock.patch("fcntl.flock", prohibido):
            self.assertTrue(cap.registrar({"a": 1}, PREG, "x", "m", None, RESP, 1))

    def test_no_frena_una_decision(self):
        t0 = time.time()
        for _ in range(300):
            cap.registrar({"texto": "hola " * 200}, PREG, "x", "m", None, RESP, 1)
        por_llamada_ms = (time.time() - t0) / 300 * 1000
        self.assertLess(por_llamada_ms, 20)  # medido: ~0,1 ms en la Mac; 20 ms es muy holgado

    def test_un_fallo_no_cambia_la_decision_de_jev(self):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        for nombre, ruta in (("USO", "uso.json"), ("CACHE", "cache.json"), ("CONCESION", "conv.json")):
            self.addCleanup(setattr, jev, nombre, getattr(jev, nombre))
            setattr(jev, nombre, os.path.join(d, ruta))
        self.addCleanup(setattr, jev, "TRANSPORTE", jev.TRANSPORTE)
        self.addCleanup(setattr, jev, "TRANSPORTE_LOCALES", jev.TRANSPORTE_LOCALES)
        sys.modules["jev_local"] = None
        self.addCleanup(sys.modules.pop, "jev_local", None)

        def sin_laya(*a, **k):
            raise OSError("sin laya")

        jev.TRANSPORTE_LOCALES = sin_laya
        jev.TRANSPORTE = lambda cuerpo: {"answers": {"q": {"noul": 0.9}}, "model": "m-prueba", "usage": {}}
        os.makedirs(self.dir, mode=0o700)
        os.chmod(self.dir, 0o500)  # la captura va a fallar
        r = jev.decidir({"t": "a"}, PREG, usar_cache=False)
        self.assertEqual(r["q"]["noul"], 0.9)
        self.assertEqual(r["medio"], "openrouter")
        self.assertGreaterEqual(cap.FALLOS, 1)


class TestIntegracionConJev(Base):
    def setUp(self):
        super().setUp()
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        for nombre, ruta in (("USO", "uso.json"), ("CACHE", "cache.json"), ("CONCESION", "conv.json")):
            self.addCleanup(setattr, jev, nombre, getattr(jev, nombre))
            setattr(jev, nombre, os.path.join(d, ruta))
        self.addCleanup(setattr, jev, "TRANSPORTE", jev.TRANSPORTE)
        self.addCleanup(setattr, jev, "TRANSPORTE_LOCALES", jev.TRANSPORTE_LOCALES)
        sys.modules["jev_local"] = None
        self.addCleanup(sys.modules.pop, "jev_local", None)

        def sin_laya(*a, **k):
            raise OSError("sin laya")

        jev.TRANSPORTE_LOCALES = sin_laya
        jev.TRANSPORTE = lambda cuerpo: {"answers": {"q": {"noul": 0.7, "confidence": 0.6}}, "model": "m-prueba", "usage": {}}

    def test_una_decision_deja_una_linea_y_la_cache_no_otra(self):
        r = jev.decidir({"t": "a"}, PREG, quien="telegram-puente")
        self.assertEqual(r["q"]["noul"], 0.7)
        (e,) = self.lineas()
        self.assertEqual((e["medio"], e["modelo"], e["quien"]), ("openrouter", "m-prueba", "telegram-puente"))
        self.assertEqual(e["estratos"], ["noul:telegram-puente"])
        r2 = jev.decidir({"t": "a"}, PREG, quien="telegram-puente")
        self.assertTrue(r2.get("cache"))
        self.assertEqual(len(self.lineas()), 1)

    def test_decidir_py_fija_el_dominio_y_enlaza_con_la_experiencia(self):
        import decidir

        class Exp:
            def nueva(self, *a, **k):
                return {"id": "exp123"}

            def anotar(self, e):
                return e["id"]

        self.addCleanup(setattr, decidir, "EXP", decidir.EXP)
        self.addCleanup(setattr, decidir, "JEV", decidir.JEV)
        decidir.EXP, decidir.JEV = Exp(), jev
        r = decidir.consultar("si-no", {"t": "b"}, "¿se aprueba?", quien="revisor-bloqueadas", regla="si", dominio="bloqueadas")
        self.assertEqual(r["experiencia"], "exp123")
        (e,) = self.lineas()
        self.assertEqual(e["dominio"], "bloqueadas")
        self.assertEqual(e["estratos"], ["noul:bloqueadas"])
        self.assertEqual(list(cap.enlaces(self.dir).values()), ["exp123"])
        self.assertEqual(list(cap.enlaces(self.dir).keys()), [e["id"]])


class TestTachado(Base):
    def test_claves_y_tokens_no_llegan_al_archivo(self):
        secretos = [
            "sk-abcdefghijklmnopqrstuvwx",
            "ghp_" + "a" * 30,
            "hf_" + "b" * 30,
            "AIza" + "c" * 35,
            "nvapi-" + "d" * 30,
            "123456789:" + "e" * 35,
            "sk-ant-api03-" + "f" * 20,
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk",
        ]
        estado = {"mensaje": "usa " + " y ".join(secretos), "api_key": "valor-secreto-123456", "anidado": {"Authorization": "Bearer zzzzzzzzzzzzzzzzzzzzzzzz"}}
        pregunta = {"q": {"type": "noul", "instructions": "mi password: hunter2hunter2 ¿vale?"}}
        cap.registrar(estado, pregunta, "x", "m", None, RESP, 1)
        with open(os.path.join(self.dir, os.listdir(self.dir)[0]), encoding="utf-8") as f:
            crudo = f.read()
        for s in secretos + ["valor-secreto-123456", "zzzzzzzzzzzzzzzzzzzzzzzz", "hunter2hunter2"]:
            self.assertNotIn(s, crudo)
        self.assertIn("[REDACTADO]", crudo)

    def test_el_texto_normal_se_conserva(self):
        cap.registrar({"texto": "Hola Alex, ¿cenamos mañana?"}, PREG, "x", "m", None, RESP, 1)
        (e,) = self.lineas()
        self.assertEqual(e["estado"]["texto"], "Hola Alex, ¿cenamos mañana?")


class TestTope(Base):
    def test_la_linea_no_pasa_de_16kb_y_lo_dice(self):
        cap.registrar({"texto": "palabra " * 40000, "otro": ["z" * 5000] * 20}, PREG, "x", "m", None, RESP, 1)
        archivo = os.path.join(self.dir, os.listdir(self.dir)[0])
        with open(archivo, "rb") as f:
            linea = f.read()
        self.assertLessEqual(len(linea), cap.MAX_LINEA_B + 1)
        (e,) = self.lineas()
        self.assertTrue(e["truncado"])
        self.assertGreater(e["bytes_originales"], cap.MAX_LINEA_B)
        self.assertEqual(e["preguntas"]["q"]["type"], "noul")  # lo importante sobrevive

    def test_una_linea_pequena_no_se_marca(self):
        cap.registrar({"a": 1}, PREG, "x", "m", None, RESP, 1)
        self.assertFalse(self.lineas()[0]["truncado"])


class TestRotacion(Base):
    def _archivo(self, dia, bytes_=10):
        os.makedirs(self.dir, mode=0o700, exist_ok=True)
        with open(os.path.join(self.dir, dia + ".jsonl"), "w") as f:
            f.write("x" * bytes_)

    def test_borra_lo_de_mas_de_14_dias(self):
        hoy = date(2026, 11, 10)
        for n in (0, 5, 14, 15, 30):
            self._archivo((hoy - timedelta(days=n)).isoformat())
        borrados = cap.rotar(self.dir, hoy=hoy)
        self.assertEqual(borrados, 2)
        self.assertEqual(cap.archivos(self.dir), [(hoy - timedelta(days=n)).isoformat() + ".jsonl" for n in (14, 5, 0)])

    def test_tope_de_tamano_lo_mas_viejo_primero(self):
        hoy = date(2026, 11, 10)
        for n in (3, 2, 1, 0):
            self._archivo((hoy - timedelta(days=n)).isoformat(), 100)
        cap.rotar(self.dir, hoy=hoy, bytes_max=250)
        self.assertEqual(cap.archivos(self.dir), [(hoy - timedelta(days=n)).isoformat() + ".jsonl" for n in (1, 0)])

    def test_nunca_borra_el_unico_archivo_aunque_pase_del_tope(self):
        hoy = date(2026, 11, 10)
        self._archivo(hoy.isoformat(), 1000)
        cap.rotar(self.dir, hoy=hoy, bytes_max=10)
        self.assertEqual(len(cap.archivos(self.dir)), 1)

    def test_no_toca_archivos_ajenos(self):
        self._archivo("2020-01-01")
        with open(os.path.join(self.dir, "notas.txt"), "w") as f:
            f.write("a")
        cap.rotar(self.dir, hoy=date(2026, 11, 10))
        self.assertTrue(os.path.exists(os.path.join(self.dir, "notas.txt")))

    def test_registrar_rota_una_vez_por_dia(self):
        self._archivo("2020-01-01")
        cap.registrar({}, PREG, "x", "m", None, RESP, 1)
        self.assertNotIn("2020-01-01.jsonl", cap.archivos(self.dir))


class TestResumen(Base):
    def test_estratos_totales_y_meta(self):
        def poner(tipo, dominio, n):
            preg = {"q": {"type": tipo, "instructions": "?"}}
            resp = {"q": {"noul": 0.9} if tipo == "noul" else {"choice": "a", "confidence": 0.9}}
            for _ in range(n):
                cap.registrar({}, preg, "quien", "m", None, resp, 1, dominio=dominio)

        poner("noul", "bloqueadas", 3)
        poner("noul", "aprobacion", 2)
        poner("choice", "enjambre:escritor", 1)
        r = cap.resumen(self.dir, objetivo=5)
        self.assertEqual(r["llamadas"], 6)
        self.assertEqual(r["por_tipo"], {"noul": 5, "choice": 1})
        self.assertEqual(r["por_estrato"]["noul:bloqueadas"], 3)
        self.assertEqual(r["estratos_presentes"], 3)
        self.assertEqual(sorted(r["estratos_faltan"]), ["choice:ramas-nube", "noul:produccion"])
        self.assertFalse(r["objetivo_alcanzado"])  # hay llamadas de sobra, pero faltan estratos
        poner("noul", "produccion", 1)
        poner("choice", "ramas-nube", 1)
        r = cap.resumen(self.dir, objetivo=5)
        self.assertTrue(r["objetivo_alcanzado"])
        self.assertEqual(sum(r["por_dia"].values()), 8)
        self.assertEqual(r["estratos_presentes"], 5)

    def test_con_menos_llamadas_que_la_meta_no_se_alcanza(self):
        r = cap.resumen(self.dir)
        self.assertEqual((r["llamadas"], r["objetivo_alcanzado"]), (0, False))

    def test_el_texto_del_resumen_no_lleva_prompts(self):
        cap.registrar({"texto": "mensaje privado muy secreto"}, {"q": {"type": "noul", "instructions": "pregunta privada"}}, "x", "m", None, RESP, 1)
        salida = cap.texto(cap.resumen(self.dir))
        self.assertNotIn("privado", salida)
        self.assertIn("1 de 1000 llamadas", salida)

    def test_linea_rota_se_salta(self):
        cap.registrar({}, PREG, "x", "m", None, RESP, 1)
        with open(os.path.join(self.dir, os.listdir(self.dir)[0]), "a") as f:
            f.write("{esto no es json\n\n")
        self.assertEqual(cap.resumen(self.dir)["llamadas"], 1)


if __name__ == "__main__":
    unittest.main()
