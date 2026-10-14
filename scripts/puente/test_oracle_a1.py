# -*- coding: utf-8 -*-
"""Pruebas de las decisiones puras del nodo A1 (oracle_a1.py, OPO1011)."""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_a1 as A  # noqa: E402


class ColasPendientes(unittest.TestCase):
    def test_solo_las_de_oracle_y_la_mas_vieja_primero(self):
        refs = {
            "colas/oracle-20261010-120000": ("b" * 40, 200.0),
            "colas/oracle-20261010-110000": ("a" * 40, 100.0),
            "colas/nube-20261010-110000": ("c" * 40, 50.0),
            "main": ("d" * 40, 10.0),
        }
        self.assertEqual(A.colas_pendientes(refs, {}),
                         ["colas/oracle-20261010-110000", "colas/oracle-20261010-120000"])

    def test_una_procesada_no_vuelve_salvo_que_cambie_su_sha(self):
        refs = {"colas/oracle-x": ("a" * 40, 1.0)}
        self.assertEqual(A.colas_pendientes(refs, {"colas/oracle-x": "a" * 40}), [])
        self.assertEqual(A.colas_pendientes(refs, {"colas/oracle-x": "b" * 40}), ["colas/oracle-x"])


class ColaDeCommit(unittest.TestCase):
    def test_encuentra_la_cola_y_no_el_estado(self):
        nombres = ["enjambre/colas/estado-cola-nube-20261010-1200/salud.json",
                   "enjambre/colas/cola-nube-20261010-1200.json"]
        self.assertEqual(A.cola_de_commit(nombres), "enjambre/colas/cola-nube-20261010-1200.json")

    def test_sin_cola(self):
        self.assertIsNone(A.cola_de_commit(["src/x.ts", "enjambre/colas/README.md"]))


class Guardian(unittest.TestCase):
    def test_objetivo_es_el_mas_reciente(self):
        sha, origen = A.objetivo_guardian([("a", 100, "origin/main"), ("b", 300, "main de la Mac"), ("c", 200, "x")])
        self.assertEqual((sha, origen), ("b", "main de la Mac"))
        self.assertEqual(A.objetivo_guardian([]), (None, ""))

    def test_nunca_con_cola_en_marcha(self):
        self.assertFalse(A.guardian_toca(None, 1000, "abc", ocupado=True))

    def test_primera_vez_si(self):
        self.assertTrue(A.guardian_toca(None, 1000, "abc"))

    def test_mismo_main_espera_a_su_hora(self):
        ultimo = {"t": 1000, "sha": "abc"}
        self.assertFalse(A.guardian_toca(ultimo, 1000 + 3600, "abc", cada_s=3 * 3600, min_s=2700))
        self.assertTrue(A.guardian_toca(ultimo, 1000 + 3 * 3600, "abc", cada_s=3 * 3600, min_s=2700))

    def test_main_nuevo_adelanta_pero_no_antes_del_minimo(self):
        ultimo = {"t": 1000, "sha": "abc"}
        self.assertFalse(A.guardian_toca(ultimo, 1000 + 600, "def", cada_s=3 * 3600, min_s=2700))
        self.assertTrue(A.guardian_toca(ultimo, 1000 + 2700, "def", cada_s=3 * 3600, min_s=2700))

    def test_resumenes(self):
        self.assertEqual(A.resumen_paso("tsc", 0, ""), "0 errores")
        self.assertEqual(A.resumen_paso("tsc", 2, "a.ts(1,1): error TS2322: x\nb.ts(2,2): error TS2345: y"),
                         "2 error(es) de tipos")
        self.assertIn("2332 passed", A.resumen_paso("vitest", 0, " Test Files  300 passed\n      Tests  2332 passed (2332)\n"))
        self.assertEqual(A.resumen_paso("mesh", 0, "algo\n  12/12 ok  \n"), "12/12 ok")
        self.assertEqual(A.resumen_paso("build", 0, "x\n ✓ Compiled successfully in 3.2min\n"), "compila (3.2min)")
        self.assertIn("UnhandledSchemeError", A.resumen_paso(
            "build", 1, "Failed to compile.\n\nnode:crypto\nModule build failed: UnhandledSchemeError: Reading from node:crypto"))
        self.assertTrue(A.resumen_paso("build", 1, "Failed to compile.\n./src/x.tsx\n").startswith("NO compila"))
        # Un paso cortado no se confunde con «0 errores» ni con un fallo de tipos.
        self.assertIn("cortado", A.resumen_paso("tsc", 124, ""))


class Entregas(unittest.TestCase):
    def test_hermanas_no_hijas(self):
        principal, olas = A.nombres_entrega("20261010-120000", ["ola/RM7", "ola/X b", "otra"])
        self.assertEqual(principal, "nube/a1-20261010-120000")
        self.assertEqual(olas, {"ola/RM7": "nube/a1-20261010-120000-RM7"})
        # traer_nube solo trae nube/*: todo lo que se entrega empieza así.
        self.assertTrue(all(v.startswith("nube/") for v in olas.values()))

    def test_poda_por_fecha_del_nombre(self):
        ahora = time.mktime(time.strptime("20261020120000", "%Y%m%d%H%M%S"))
        ramas = ["nube/a1-20261010-120000", "nube/a1-20261019-120000-RM7", "nube/123", "nube/a1-sinfecha"]
        self.assertEqual(A.entregas_viejas(ramas, ahora, dias=7), ["nube/a1-20261010-120000"])


class Carga(unittest.TestCase):
    def test_medias_por_hora_y_p95(self):
        base = 1_800_000_000 - (1_800_000_000 % 3600)
        muestras = [(base + 60 * i, 10.0, 30.0) for i in range(30)] + \
                   [(base + 3600 + 60 * i, 50.0, 40.0) for i in range(30)]
        filas, p95 = A.carga_por_hora(muestras, base + 2 * 3600, horas=24)
        self.assertEqual([f["cpu"] for f in filas], [10.0, 50.0])
        self.assertEqual([f["mem"] for f in filas], [30.0, 40.0])
        self.assertEqual(p95, 50.0)

    def test_sin_datos(self):
        self.assertEqual(A.carga_por_hora([], 1000), ([], None))


class Calidad(unittest.TestCase):
    def test_paris_si_basura_no(self):
        self.assertTrue(A.calidad_respuesta(" Paris, the city of light"))
        self.assertTrue(A.calidad_respuesta("París"))
        self.assertFalse(A.calidad_respuesta("ingsmissive quota condu/ag aloneocrin Prof"))
        self.assertFalse(A.calidad_respuesta(None))


class SinSecretos(unittest.TestCase):
    def test_tacha_ip_host_ocid_y_claves(self):
        clave = "-".join(["sk", "proj", "abcdefghijklmnop1234"])
        texto = "ip 129.1.2.3 host bitnet.129-1-2-3.sslip.io ocid1.instance.oc1.mx.aaaa %s" % clave
        limpio = A.sin_secretos(texto)
        for prohibido in ("129.1.2.3", "129-1-2-3", "ocid1.", clave):
            self.assertNotIn(prohibido, limpio)


class Bandeja(unittest.TestCase):
    """Colas que deja el nodo de MetaGenesis (OPA1011) en la bandeja del A1."""

    def test_solo_colas_y_la_mas_vieja_primero(self):
        archivos = [("cola-b.json", 200.0), ("cola-a.json", 100.0), ("cola-c.json.tmp", 50.0),
                    ("notas.txt", 10.0), ("hechas", 1.0)]
        self.assertEqual(A.entrantes_pendientes(archivos), ["cola-a.json", "cola-b.json"])
        self.assertEqual(A.entrantes_pendientes(None), [])

    def test_tareas_validas_sin_repetir(self):
        datos = {"tareas": [{"id": "T1", "titulo": "a"}, {"id": "T1"}, {"id": "../mal"}, "texto", {"id": "T2"}]}
        self.assertEqual([t["id"] for t in A.tareas_de_entrante(datos)], ["T1", "T2"])
        self.assertEqual([t["id"] for t in A.tareas_de_entrante([{"id": "X"}])], ["X"])
        self.assertEqual(A.tareas_de_entrante({"otra": 1}), [])
        self.assertEqual(A.tareas_de_entrante(None), [])


class MainVivoDeLaMac(unittest.TestCase):
    """El paquete git que deja la neurona (`oracle_nodo.py enviar-main`) llega al guardián."""

    def test_solo_un_paquete_nuevo_se_importa(self):
        self.assertFalse(A.bundle_por_importar(0, 0))
        self.assertFalse(A.bundle_por_importar(None, 5))
        self.assertTrue(A.bundle_por_importar(100.0, 0))
        self.assertFalse(A.bundle_por_importar(100.0, 100.0))
        self.assertTrue(A.bundle_por_importar(101.0, 100.0))

    def test_el_guardian_elige_el_main_vivo_si_es_el_mas_nuevo(self):
        import shutil
        import subprocess
        import tempfile

        tmp = tempfile.mkdtemp(prefix="a1-bundle-")
        self.addCleanup(shutil.rmtree, tmp, True)
        mac, a1 = os.path.join(tmp, "mac"), os.path.join(tmp, "a1")

        def git(cwd, *args, fecha=None):
            env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t",
                       GIT_COMMITTER_EMAIL="t@t")
            if fecha:
                env.update(GIT_AUTHOR_DATE=fecha, GIT_COMMITTER_DATE=fecha)
            return subprocess.run(["git", *args], cwd=cwd, env=env, check=True, capture_output=True, text=True).stdout

        os.makedirs(mac)
        git(mac, "init", "-q", "-b", "main")
        with open(os.path.join(mac, "a.txt"), "w") as f:
            f.write("1")
        git(mac, "add", "a.txt")
        git(mac, "commit", "-q", "-m", "publicado", fecha="2026-10-10T10:00:00Z")
        git(tmp, "clone", "-q", mac, a1)  # el A1 ya tiene lo publicado (origin/main)
        with open(os.path.join(mac, "a.txt"), "w") as f:
            f.write("2")
        git(mac, "commit", "-q", "-am", "sin publicar", fecha="2026-10-10T12:00:00Z")
        nuevo = git(mac, "rev-parse", "HEAD").strip()
        paquete = os.path.join(tmp, "entrada", "main-mac.bundle")
        os.makedirs(os.path.dirname(paquete))
        git(mac, "bundle", "create", paquete, "main", "^" + git(a1, "rev-parse", "origin/main").strip())

        viejos = (A.RAIZ, A.ENTRADA_MAIN, A.ESTADO_DIR)
        A.RAIZ, A.ENTRADA_MAIN, A.ESTADO_DIR = a1, paquete, os.path.join(tmp, "estado")

        def restaurar():
            A.RAIZ, A.ENTRADA_MAIN, A.ESTADO_DIR = viejos
        self.addCleanup(restaurar)

        nodo = A.Nodo()
        refs = {"main": (git(a1, "rev-parse", "origin/main").strip(), 1791626400.0)}
        sha, origen = A.objetivo_guardian(nodo.candidatos_main(refs))
        self.assertEqual((sha, origen), (nuevo, "main vivo de la Mac"))
        self.assertEqual(nodo._resumen_main_mac()["sha"], nuevo)
        # El mismo paquete no se vuelve a importar; uno roto deja el error y no cambia la ref.
        with open(paquete, "wb") as f:
            f.write(b"no es un paquete")
        os.utime(paquete, (2e9, 2e9))
        self.assertEqual(nodo.importar_main_mac()[0], nuevo)
        self.assertTrue(nodo._resumen_main_mac()["error"])



class OrquestadorDeLaCola(unittest.TestCase):
    """(2026-10-14) El A1 corría un orquestador de cuatro días antes que el main de la cola."""

    def test_el_de_la_cola_si_lo_trae_y_si_no_el_instalado(self):
        import tempfile
        d = tempfile.mkdtemp()
        self.assertEqual(A.orquestador_para(d, explicito=None, defecto="/instalado"), "/instalado")
        os.makedirs(os.path.join(d, "scripts", "enjambre"))
        propio = os.path.join(d, "scripts", "enjambre", "starseed-enjambre.py")
        open(propio, "w").close()
        self.assertEqual(A.orquestador_para(d, explicito=None, defecto="/instalado"), propio)
        self.assertEqual(A.orquestador_para(d, explicito="/a-mano", defecto="/instalado"), "/a-mano")


if __name__ == "__main__":
    unittest.main()
