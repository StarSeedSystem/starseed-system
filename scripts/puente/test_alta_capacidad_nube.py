# -*- coding: utf-8 -*-
"""Pruebas del CLI alta-capacidad-nube.py (Ola 1022C, ALT1022B y su ampliación).

Sin red ni `claude` real: el lanzador, `git ls-remote` y `traer_nube` se inyectan, y todas las
rutas (`~/.starseed`, `starseed_memory_root/olas/`, cerrojos) apuntan a una carpeta temporal."""
import importlib.util
import json
import os
import pathlib
import shutil
import sys
import tempfile
import time
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import traer_nube  # noqa: E402

_espec = importlib.util.spec_from_file_location("alta_capacidad_nube_cli", os.path.join(AQUI, "alta-capacidad-nube.py"))
cli = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(cli)

AHORA = time.time()
SALIDA_OK = ("\x1b[>4m Created cloud session: Canal P2P\r\n"
             "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0")


class Lanzador:
    def __init__(self, salida=SALIDA_OK):
        self.salida, self.llamadas = salida, []

    def __call__(self, orden, log, teclas):
        self.llamadas.append(orden)
        return self.salida


class Entorno(unittest.TestCase):
    """El entorno del fixture: rutas a una carpeta temporal y la variable de control fuera."""

    def _pon(self, destino, nombre, valor):
        viejo = getattr(destino, nombre)
        setattr(destino, nombre, valor)
        self.addCleanup(setattr, destino, nombre, viejo)

    @staticmethod
    def _restaurar_env(nombre, viejo):
        if viejo is None:
            os.environ.pop(nombre, None)
        else:
            os.environ[nombre] = viejo

    def _quita_env(self, nombre):
        viejo = os.environ.pop(nombre, None)
        self.addCleanup(self._restaurar_env, nombre, viejo)

    def _pon_env(self, nombre, valor):
        viejo = os.environ.get(nombre)
        os.environ[nombre] = valor
        self.addCleanup(self._restaurar_env, nombre, viejo)

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, str(self.tmp), True)
        olas = self.tmp / "olas"
        olas.mkdir()
        st = self.tmp / "starseed"
        self._pon(traer_nube, "OLAS", str(olas))
        self._pon(traer_nube, "PROGRESO", str(olas / "progreso.json"))
        self._pon(traer_nube, "CERROJOS", str(st / "cerrojos"))
        self._pon(cli, "REGISTRO", str(st / "alta-capacidad-nube.json"))
        self._pon(cli, "CREDITO", str(st / "credito-claude-nube.json"))
        self._pon(cli, "BRIEFS", str(st / "alta-capacidad-nube"))
        self._pon(cli, "PAUSA", str(st / "alta-nube-pausada.json"))
        self._pon(cli, "HISTORIAL", str(st / "alta-nube-historial.jsonl"))
        self._quita_env("STARSEED_ALTA_NUBE_MAX")
        self._quita_env("STARSEED_ALTA_NUBE_DIA")
        vence = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(AHORA + 13 * 86400))
        cli._escribir_json(cli.CREDITO, {"total_usd": 250, "restante_usd": 240, "vence": vence})
        tareas = [
            {"id": "T1", "titulo": "Uno", "archivos": ["a.py"], "prompt": "Haz {uno}."},
            {"id": "T2", "titulo": "Dos", "archivos": ["a", "b", "c"], "prompt": "Haz dos."},
            {"id": "T3", "titulo": "Tres", "archivos": ["a"], "depende": ["T9"]},
            {"id": "T4", "titulo": "Cuatro", "archivos": ["a"], "privada": True},
        ]
        (olas / "cola-1022-prueba.json").write_text(json.dumps({"tareas": tareas}), encoding="utf-8")

    def _progreso(self):
        return traer_nube._progreso()

    def _registro(self):
        return cli.leer_registro()["sesiones"]


class CicloDeLanzamiento(Entorno):
    def test_cupo_agotado_no_lanza(self):
        cli._escribir_json(cli.CREDITO, {"restante_usd": 5, "vence": "2099-01-01T00:00:00+00:00"})
        lz, dicho = Lanzador(), []
        self.assertEqual(cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=lz, decir=dicho.append), [])
        self.assertEqual(lz.llamadas, [])
        self.assertIn("sin cupo", dicho[0])
        self.assertEqual(self._progreso(), {})
        self.assertEqual(self._registro(), [])

    def test_lanzamiento_feliz_anota_y_marca(self):
        lz = Lanzador()
        filas = cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=lz, decir=lambda *_: None)
        self.assertEqual(len(filas), 1)
        orden = lz.llamadas[0]
        self.assertEqual(orden[:4], ["claude", "--model", "sonnet", "--cloud"])
        self.assertIn("Haz {uno}.", orden[4])
        self.assertEqual(self._progreso()["T1"]["estado"], "reasignada")
        self.assertEqual(self._progreso()["T1"]["medio"], "claude-nube")
        s = self._registro()[0]
        self.assertEqual(s["sesion"], "session_01HW1xkHMRPYXUF5bjHiWxyd")
        self.assertEqual(s["coste_usd"], 1.0)
        self.assertEqual(s["rama_pedida"], "nube/cc-%s/ola/T1" % time.strftime("%Y%m%d", time.localtime(AHORA)))
        self.assertTrue(os.path.exists(os.path.join(cli.BRIEFS, "T1.md")))

    def test_modelo_forzado_por_opcion(self):
        lz = Lanzador()
        cli.lanzar(ids=["T1"], modelo="claude-opus-5-5", ahora=AHORA, lanzador=lz, decir=lambda *_: None)
        self.assertEqual(lz.llamadas[0][2], "claude-opus-5-5")
        self.assertEqual(self._registro()[0]["coste_usd"], 3.0)

    def test_salida_sin_sesion_devuelve_a_pendiente(self):
        lz, dicho = Lanzador("Error: --cloud requires an interactive terminal"), []
        self.assertEqual(cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=lz, decir=dicho.append), [])
        self.assertEqual(self._progreso()["T1"]["estado"], "pendiente")
        self.assertEqual(self._registro(), [])
        self.assertTrue(any("no salió" in d for d in dicho))

    def test_seco_no_toca_nada(self):
        lz = Lanzador()
        cli.lanzar(ids=["T1"], seco=True, ahora=AHORA, lanzador=lz, decir=lambda *_: None)
        self.assertEqual(lz.llamadas, [])
        self.assertEqual(self._progreso(), {})
        self.assertEqual(self._registro(), [])


class Auto(Entorno):
    def test_auto_elige_sin_dependencias_ni_privadas_y_en_orden(self):
        lz = Lanzador()
        filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=lz, decir=lambda *_: None, fuera_de_otros=set)
        self.assertEqual([f["tarea"] for f in filas], ["T2", "T1"])
        self.assertEqual([f["modelo"] for f in filas], ["claude-opus-5-5", "sonnet"])

    def test_auto_respeta_el_maximo(self):
        self._pon_env("STARSEED_ALTA_NUBE_MAX", "1")
        filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None, fuera_de_otros=set)
        self.assertEqual([f["tarea"] for f in filas], ["T2"])

    def test_auto_no_coge_lo_que_la_mac_se_queda(self):
        """(2026-10-22) CAP1018Ab-d1b se lanzó en la nube mientras la Mac la escribía."""
        filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None,
                           fuera_de_otros=lambda: {"T2"})
        self.assertEqual([f["tarea"] for f in filas], ["T1"])

    def test_auto_sin_foto_de_la_mac_no_lanza(self):
        dicho = []
        filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=Lanzador(), decir=dicho.append,
                           fuera_de_otros=lambda: None)
        self.assertEqual(filas, [])
        self.assertTrue(any("sin la foto" in d for d in dicho))


class Seguir(Entorno):
    def test_seguir_trae_y_devuelve(self):
        cli.lanzar(ids=["T1", "T2"], ahora=AHORA - 10 * 3600, lanzador=Lanzador(), decir=lambda *_: None)
        rama_t1 = self._registro()[0]["rama_pedida"]
        traidas = []

        def traer():
            traidas.append(self._progreso()["T1"]["estado"])
            return 0, ""

        ls = "abc\trefs/heads/%s\n" % rama_t1
        acciones = cli.seguir(aplicar=True, ahora=AHORA, ramas=lambda: cli.ramas_de_ls_remote(ls),
                              traer=traer, decir=lambda *_: None)
        self.assertEqual(acciones, {"T1": "traer", "T2": "devolver"})
        self.assertEqual(traidas, ["pendiente"])
        self.assertIn("sin rama tras 10 h", self._progreso()["T2"]["nota"])
        finales = {s["tarea"]: s.get("final") for s in self._registro()}
        self.assertEqual(finales, {"T1": "traida", "T2": "devuelta"})

    def test_seguir_sin_aplicar_solo_informa(self):
        cli.lanzar(ids=["T1"], ahora=AHORA - 10 * 3600, lanzador=Lanzador(), decir=lambda *_: None)
        antes = self._progreso()
        llamado = []
        cli.seguir(aplicar=False, ahora=AHORA, ramas=set, traer=lambda: llamado.append(1), decir=lambda *_: None)
        self.assertEqual(self._progreso(), antes)
        self.assertEqual(llamado, [])
        self.assertIsNone(self._registro()[0].get("final"))

    def test_seguir_olvida_lo_que_ya_no_esta_prestada(self):
        cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None)
        traer_nube._actualizar_progreso({"T1": {"estado": "commit", "medio": ""}})
        cli.seguir(aplicar=True, ahora=AHORA, ramas=set, traer=lambda: (0, ""), decir=lambda *_: None)
        self.assertEqual(self._registro(), [])


class NoHayRueda(Entorno):
    """(2026-10-23, medido) Otro actor devolvía la tarea a «pendiente», `seguir` la olvidaba y el
    ciclo la relanzaba: 284 sesiones en 21 h, el crédito de 236 a 50 $."""

    def test_lo_olvidado_no_se_relanza_el_mismo_dia(self):
        lz = Lanzador()
        primeras = cli.lanzar(auto=True, ahora=AHORA, lanzador=lz, decir=lambda *_: None, fuera_de_otros=set)
        self.assertEqual(len(primeras), 2)
        # Otro actor (traer_nube, el revisor, el orquestador) las devuelve a pendiente.
        traer_nube._actualizar_progreso({"T1": {"estado": "pendiente", "medio": ""},
                                         "T2": {"estado": "pendiente", "medio": ""}})
        dicho = []
        cli.seguir(aplicar=True, ahora=AHORA + 900, ramas=set, traer=lambda: (0, ""), decir=dicho.append)
        otra = cli.lanzar(auto=True, ahora=AHORA + 900, lanzador=lz, decir=dicho.append, fuera_de_otros=set)
        self.assertEqual(otra, [])
        self.assertEqual(len(lz.llamadas), 2)
        self.assertEqual(len(cli.leer_historial()), 2)

    def test_tope_de_lanzamientos_del_dia(self):
        self._pon_env("STARSEED_ALTA_NUBE_DIA", "1")
        filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None, fuera_de_otros=set)
        self.assertEqual(len(filas), 1)

    def test_prestada_sin_sesion_se_devuelve(self):
        traer_nube._actualizar_progreso({"T9": {"estado": "reasignada", "medio": "claude-nube"}})
        acciones = cli.seguir(aplicar=True, ahora=AHORA, ramas=set, traer=lambda: (0, ""), decir=lambda *_: None)
        self.assertEqual(acciones.get("T9"), "devolver")
        self.assertEqual(self._progreso()["T9"]["estado"], "pendiente")


class Ciclo(Entorno):
    def test_ciclo_no_lanza_con_la_pausa(self):
        cli._escribir_json(cli.PAUSA, {"motivo": "Alex lo pidió"})
        lz, dicho = Lanzador(), []
        self.assertEqual(cli.ciclo(ahora=AHORA, ramas=set, traer=lambda: (0, ""), lanzador=lz, decir=dicho.append), [])
        self.assertEqual(lz.llamadas, [])
        self.assertTrue(any("pausa" in d for d in dicho))

    def test_ciclo_sin_pausa_lanza(self):
        filas = cli.ciclo(ahora=AHORA, ramas=set, traer=lambda: (0, ""), lanzador=Lanzador(), decir=lambda *_: None)
        self.assertEqual(len(filas), 2)

    def test_ver_resume_sin_claves(self):
        cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None)
        v = cli.ver(ahora=AHORA)
        self.assertEqual(v["vivas"], 1)
        # (2026-10-23) El saldo de `ver` es el estimado: lo declarado menos lo lanzado después.
        self.assertEqual(v["restante_declarado_usd"], 240)
        self.assertEqual(v["restante_usd"], 239)
        self.assertEqual((v["lanzadas_hoy"], v["gastado_hoy_usd"]), (1, 1.0))
        self.assertGreater(v["presupuesto_hoy_usd"], 0)
        self.assertTrue(v["sesiones"][0]["url"].startswith("https://claude.ai/code/session_"))


class Plist(unittest.TestCase):
    def test_plist_del_servicio_corre_ciclo_cada_15_min(self):
        import plistlib

        with open(os.path.join(AQUI, "com.starseed.alta-nube.plist"), "rb") as f:
            p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.alta-nube")
        self.assertEqual(p["StartInterval"], 900)
        self.assertEqual(p["Nice"], 10)
        self.assertEqual(p["ProgramArguments"][-2:], [os.path.join(
            "/Users/alex/Documents/starseed-os-main/scripts/puente", "alta-capacidad-nube.py"), "ciclo"])
        self.assertTrue(p["EnvironmentVariables"]["PATH"].startswith("/Users/alex/.local/bin:"))
        self.assertTrue(p["StandardOutPath"].endswith("/.starseed/alta-nube.log"))
        self.assertNotIn("KeepAlive", p)

    def test_instalar_servicios_solo_alta_nube_adapta_rutas(self):
        import plistlib

        sys.path.insert(0, AQUI)
        from test_instalar_servicios_produccion import _cargar_con_solo

        tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, str(tmp), True)
        mod = _cargar_con_solo(str(tmp), solo="alta-nube")
        ag = tmp / "Library" / "LaunchAgents"
        self.assertEqual(sorted(os.listdir(ag)), ["com.starseed.alta-nube.plist"])
        with open(ag / "com.starseed.alta-nube.plist", "rb") as f:
            p = plistlib.load(f)
        # La raíz la decide el entorno de quien corre la prueba (la Mac, la carpeta de traer_nube, la nube):
        # basta con que el servicio apunte al lanzador de ESTE repo.
        self.assertTrue(p["ProgramArguments"][2].endswith(os.path.join("scripts", "puente", "alta-capacidad-nube.py")))
        self.assertTrue(p["EnvironmentVariables"]["PATH"].startswith(str(tmp) + "/.local/bin:"))
        self.assertEqual(p["StandardOutPath"], str(tmp) + "/.starseed/alta-nube.log")
        self.assertEqual(p["StartInterval"], 900)


if __name__ == "__main__":
    unittest.main()
