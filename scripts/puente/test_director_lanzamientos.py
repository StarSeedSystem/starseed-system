#!/usr/bin/env python3
"""Pruebas del director de lanzamientos con medios simulados (nada de red, git real ni gh)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_lanzamientos as D  # noqa: E402
import lanzamientos_logica as L  # noqa: E402


class Falsos(object):
    def __init__(self, archivos=None):
        self.raiz = tempfile.mkdtemp()
        self.archivos = archivos or {}
        self.ordenes = []
        self.avisos = []
        self.run = {"status": "completed", "conclusion": "success", "jobs": []}
        self.release = {"assets": [], "url": "https://x/rel"}
        self.canales = {}
        self.codigo_http = 200
        self.logs = ""

    def git(self, args, timeout=180):
        self.ordenes.append(["git"] + args)
        if args[:2] == ["log", "--format=%s"]:
            return 0, self.archivos.get("_log", ""), ""
        if args[0] == "rev-parse":
            return 0, "f" * 40, ""
        if args[0] == "merge-base":
            return 0, "", ""
        if args[0] == "ls-remote":
            return 0, "", ""
        return 0, "", ""

    def sh(self, args, timeout=180):
        self.ordenes.append(args)
        if args[:3] == ["gh", "release", "download"]:
            return 0, json.dumps(self.canales.get(args[5], {})), ""
        if args[:3] == ["gh", "run", "view"]:
            return 0, self.logs, ""
        return 0, "", ""

    def gh_json(self, args, timeout=120):
        self.ordenes.append(["gh"] + args)
        if args[:2] == ["run", "list"]:
            return [{"databaseId": 7, "status": "queued", "url": "https://x/run/7"}]
        if args[:2] == ["run", "view"]:
            return self.run
        if args[:2] == ["release", "view"]:
            return self.release
        return None

    def leer(self, ruta, defecto):
        return self.archivos.get(ruta, defecto)

    def escribir(self, ruta, datos):
        self.archivos[ruta] = datos

    def http(self, url):
        return self.codigo_http

    def lider(self, ahora=None):
        return True, ""

    def avisar(self, texto, tipo="informe"):
        self.avisos.append((tipo, texto))


CFG = {"colas": ["cola-x.json"], "tipo": "menor", "tope_dia": 1, "reintentos_job": 2, "ci_tope_min": 75,
       "auto_por_defecto": True}


def _release_buena(version):
    assets = []
    for medio, nombres in L.archivos_esperados(version).items():
        for n in nombres:
            assets.append({"name": n, "size": 440 if n.endswith(".sig") else 90_000_000})
    return {"assets": assets, "url": "https://x/rel"}


def _canal(version):
    url = "https://x/v%s/" % version
    return {"version": version, "platforms": {
        "darwin-aarch64": {"signature": "s", "url": url + "StarSeed.OS_universal.app.tar.gz"},
        "darwin-x86_64": {"signature": "s", "url": url + "StarSeed.OS_universal.app.tar.gz"},
        "linux-x86_64": {"signature": "s", "url": url + "StarSeed.OS_%s_amd64.AppImage" % version},
        "windows-x86_64": {"signature": "s", "url": url + "StarSeed.OS_%s_x64-setup.exe" % version}}}


class Pasadas(unittest.TestCase):
    def test_apagado_no_hace_nada(self):
        m = Falsos({D.INTERRUPTOR: {"auto": False}})
        est = D.pasada(m, {"fase": "esperando-lista"}, CFG, 1000.0)
        self.assertEqual(est["fase"], "esperando-lista")
        self.assertIn("apagado", est["detalle"])

    def test_lista_sin_terminar_dice_cuantas(self):
        m = Falsos({os.path.join(D.OLAS, "cola-x.json"): [{"id": "VER1105A"}, {"id": "VER1105B"}],
                    "_log": "1105V · VER1105A: algo"})
        est = D.pasada(m, {"fase": "esperando-lista"}, CFG, 1000.0)
        self.assertEqual(est["pendientes"], ["VER1105B"])

    def test_lista_movida_a_colas_fuente_se_sigue_leyendo(self):
        m = Falsos({os.path.join(D.COLAS_FUENTE, "cola-x.json"): [{"id": "VER1105A"}, {"id": "VER1105B"}],
                    "_log": "1105V · VER1105A: algo"})
        est = D.pasada(m, {"fase": "esperando-lista"}, CFG, 1000.0)
        self.assertEqual(est["pendientes"], ["VER1105B"])

    def test_lista_terminada_espera_a_lo_publicado(self):
        m = Falsos({os.path.join(D.OLAS, "cola-x.json"): [{"id": "VER1105A"}], "_log": "x · VER1105A: hecho"})
        est = D.pasada(m, {"fase": "esperando-lista"}, CFG, 1000.0)
        self.assertEqual(est["fase"], "esperando-publicacion")
        self.assertIn("aún no ha publicado", est["detalle"])

    def test_pausa_desde_el_panel(self):
        m = Falsos({D.PETICION: {"accion": "pausar"}})
        est = D.pasada(m, {"fase": "compilando", "run": 7}, CFG, 1000.0)
        self.assertTrue(est["pausado"])
        self.assertIn("pausa", est["detalle"])

    def test_compilado_en_verde_pasa_a_verificar(self):
        m = Falsos()
        m.run = {"status": "completed", "conclusion": "success",
                 "jobs": [{"name": "os · android", "status": "completed", "conclusion": "success"},
                          {"name": "os · ios", "status": "completed", "conclusion": "failure"}]}
        est = D.pasada(m, {"fase": "compilando", "run": 7, "version": "0.4.0", "compilando_desde": 999.0},
                       CFG, 1000.0)
        self.assertEqual(est["fase"], "verificando-archivos")

    def test_fallo_de_red_se_reintenta(self):
        m = Falsos()
        m.run = {"status": "completed", "jobs": [{"name": "os · android", "status": "completed",
                                                  "conclusion": "failure", "databaseId": 3}]}
        m.logs = "error: failed to download crate: Operation timed out"
        est = D.pasada(m, {"fase": "compilando", "run": 7, "version": "0.4.0", "compilando_desde": 999.0},
                       CFG, 1000.0)
        self.assertEqual(est["fase"], "compilando")
        self.assertEqual(est["reintentos"], 1)
        self.assertIn(["gh", "run", "rerun", "7", "--failed", "--repo", L.REPO], m.ordenes)

    def test_arreglo_integrado_prepara_parche_con_las_notas_sin_lanzar(self):
        m = Falsos({"_log": "Lanzamiento v0.4.0 · LZ040A: Linux nativo en ubuntu-24.04 (PipeWire de 22.04)"})
        est = D.pasada(m, {"fase": "atascado", "version": "0.4.0", "arreglo": "LZ040A",
                           "notas": "StarSeed OS 0.4.0: Centro de Versiones."}, CFG, 1000.0)
        self.assertEqual(est["fase"], "esperando-publicacion")
        self.assertEqual(est["tipo_siguiente"], "parche")
        self.assertEqual(est["version_sin_lanzar"], "0.4.0")
        self.assertEqual(est["arreglo_titulo"], "Linux nativo en ubuntu-24.04 (PipeWire de 22.04)")

    def test_error_de_codigo_crea_tarea_y_se_atasca(self):
        m = Falsos()
        m.run = {"status": "completed", "jobs": [{"name": "os · macos-latest", "status": "completed",
                                                  "conclusion": "failure", "databaseId": 3}]}
        m.logs = "error[E0425]: cannot find value `x` in this scope"
        est = D.pasada(m, {"fase": "compilando", "run": 7, "version": "0.4.0", "compilando_desde": 999.0},
                       CFG, 1000.0)
        self.assertEqual(est["fase"], "atascado")
        self.assertEqual(est["arreglo"], "LZ040A")
        self.assertEqual(est["volver_a"], "compilando")
        cola = m.archivos[os.path.join(D.OLAS, "cola-lanzamiento-0.4.0.json")]
        self.assertIn("E0425", cola[0]["prompt"])

    def test_archivos_buenos_publica_y_verifica(self):
        m = Falsos()
        m.release = _release_buena("0.4.0")
        m.canales = {n: _canal("0.4.0") for n in ("latest.json", "latest-nexus.json", "latest-cafe.json")}
        est = D.pasada(m, {"fase": "verificando-archivos", "version": "0.4.0"}, CFG, 1000.0)
        self.assertEqual(est["fase"], "publicando", est.get("detalle"))
        est = D.pasada(m, est, CFG, 1001.0)
        self.assertEqual(est["fase"], "verificando-medios")
        self.assertIn(["gh", "release", "edit", "v0.4.0", "--draft=false", "--latest", "--repo", L.REPO], m.ordenes)
        est = D.pasada(m, est, CFG, 1002.0)
        self.assertEqual(est["fase"], "lanzado")
        self.assertEqual(est["historial"][-1]["version"], "0.4.0")
        self.assertTrue(any("lanzada" in t for _, t in m.avisos))

    def test_falta_un_archivo_regenera_ese_medio(self):
        m = Falsos()
        rel = _release_buena("0.4.0")
        rel["assets"] = [a for a in rel["assets"] if not a["name"].endswith(".apk")]
        m.release = rel
        m.canales = {n: _canal("0.4.0") for n in ("latest.json", "latest-nexus.json", "latest-cafe.json")}
        est = D.pasada(m, {"fase": "verificando-archivos", "version": "0.4.0", "run": 7}, CFG, 1000.0)
        self.assertEqual(est["fase"], "etiquetando")
        self.assertEqual(est["run_previo"], 7)
        orden = [o for o in m.ordenes if o[:3] == ["gh", "workflow", "run"]][0]
        self.assertIn("plataformas=android", orden)
        self.assertIn("v0.4.0", orden)


if __name__ == "__main__":
    unittest.main()
