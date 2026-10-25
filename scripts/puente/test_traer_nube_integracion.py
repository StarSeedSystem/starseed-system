# -*- coding: utf-8 -*-
"""CAP1025A (2026-10-25): la integración de la nube se reconoce por su cuerpo y se rescata lo que una
pasada antigua tomó por «a medias».

Medido el 25-10 en la Mac: 279 integraciones en ramas `nube/*` vivas y 966 archivadas salían «otro»
porque su asunto empezaba por «1020U ·», «Rescate de las ramas de la nube ·» o «MetaGenesis ·»; cada una
acabó en una sucesora que heredaba los envíos de su cadena y 132 de las 292 «agotadas» eran eso."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traer_nube as T  # noqa: E402

CUERPO = "Enjambre libre v2 (opencode · opencode/glm-5.3-flash-free). Archivos: a.py\n\nCo-Authored-By: Enjambre"


def c(tipo, nuevo=True, vacio=False):
    return {"tipo": tipo, "nuevo": nuevo, "vacio": vacio}


class AsuntosReales(unittest.TestCase):
    """Los asuntos tal cual salen de `git log main..origin/nube/<run>` en la Mac el 25-10."""

    def test_ola_con_letra_es_integracion_aun_sin_cuerpo(self):
        a = "1020U · CLF1020Ab: Coolify · cliente puro en solo lectura (equipo y servidores)"
        self.assertEqual(T.tid_de_asunto(a), ("ola", "CLF1020Ab"))
        self.assertEqual(T.tid_de_asunto("1021G · GUI1021Id-d1: Guía sin cuenta (parte 1 de 2)"), ("ola", "GUI1021Id-d1"))

    def test_ola_con_nombre_se_reconoce_por_el_cuerpo(self):
        a = "Rescate de las ramas de la nube · RTSUC1018Ed: Rescate de pruebas · Bots · una sola clave"
        self.assertEqual(T.tid_de_asunto(a), ("otro", "RTSUC1018Ed"))  # así se perdían
        self.assertEqual(T.tid_de_asunto(a, CUERPO), ("ola", "RTSUC1018Ed"))
        b = "MetaGenesis · que lo integrado llegue a producción · MGP1011-1ECCC4: Puerta de publicación en rojo"
        self.assertEqual(T.tid_de_asunto(b, CUERPO), ("ola", "MGP1011-1ECCC4"))
        self.assertEqual(T.tid_de_asunto("repos-libreria-1020 · RLB1020B: Biblioteca · canal releases", CUERPO),
                         ("ola", "RLB1020B"))

    def test_salvavidas_y_reparto_no_cambian_con_cuerpo(self):
        s = "salvavidas · CLF1020Ab: trabajo del agente antes de las puertas (tsc / vitest)"
        self.assertEqual(T.tid_de_asunto(s, CUERPO), ("salvavidas", "CLF1020Ab"))
        self.assertEqual(T.tid_de_asunto("enjambre: reparto a la nube · cola-nube-1.json", CUERPO)[0], "reparto")
        self.assertEqual(T.tid_de_asunto("chore(memoria): aprendizaje de la ola mg-oracle-1010-1605", CUERPO),
                         ("otro", None))
        self.assertEqual(T.tid_de_asunto("Resolve conflict in memory/aprendizaje-olas.md"), ("otro", None))

    def test_decidir_trae_lo_que_antes_reparaba(self):
        commits = [c("salvavidas"), {"tipo": T.tid_de_asunto(
            "1020U · PES1020Ac: Capacidad · servicios pesados", "")[0], "nuevo": True}]
        self.assertEqual(T.decidir("PES1020Ac", commits, False, "pendiente", "")[0], "traer")

    def test_commits_de_log_con_cuerpo_de_varias_lineas(self):
        texto = ("aaa\x1f1020U · X1: uno\x1fEnjambre libre v2 (opencode · m).\n\nCo-Authored-By: E\n\x1e\n"
                 "bbb\x1fsalvavidas · X1: antes\x1f\x1e\n")
        self.assertEqual(T.commits_de_log(texto), [
            ("aaa", "1020U · X1: uno", "Enjambre libre v2 (opencode · m).\n\nCo-Authored-By: E"),
            ("bbb", "salvavidas · X1: antes", "")])
        self.assertEqual(T.commits_de_log(""), [])


def reparada(nuevo, t="2026-10-24 10:00:00"):
    return {"accion": "reparada", "nuevo": nuevo, "t": t}


def sustituida(por, rama):
    return {"estado": "sustituida", "nota": "continúa como %s desde la rama %s (traer_nube)" % (por, rama)}


class DecidirRescate(unittest.TestCase):
    def test_integracion_mal_leida_se_trae_y_cierra_la_sucesora(self):
        prog = {"CLF1020Ab": sustituida("CLF1020Ac", "nube/1"), "CLF1020Ac": {"estado": "pendiente"}}
        accion, _m, cierra = T.decidir_rescate("CLF1020Ab", reparada("CLF1020Ac"), [c("salvavidas"), c("ola")],
                                               False, prog)
        self.assertEqual((accion, cierra), ("traer", ["CLF1020Ac"]))

    def test_cierra_toda_la_cadena_que_sigue_y_no_lo_cerrado(self):
        prog = {"IMN1021K8": sustituida("IMN1021K8b", "nube/1"), "IMN1021K8b": sustituida("IMN1021K8c", "nube/2"),
                "IMN1021K8c": {"estado": "pendiente"}, "IMN1021K8d": {"estado": "fallo_tsc"}}
        accion, _m, cierra = T.decidir_rescate("IMN1021K8", reparada("IMN1021K8b"), [c("ola")], False, prog)
        self.assertEqual(accion, "traer")
        self.assertEqual(cierra, ["IMN1021K8c", "IMN1021K8d"])  # K8b ya está «sustituida»

    def test_trabajo_a_medias_de_verdad_no_se_vuelve_a_mirar(self):
        prog = {"X1": sustituida("X1b", "nube/1"), "X1b": {"estado": "pendiente"}}
        self.assertEqual(T.decidir_rescate("X1", reparada("X1b"), [c("salvavidas")], False, prog)[0], "nunca")

    def test_no_pisa_a_una_sucesora_que_alguien_hace(self):
        prog = {"X1": sustituida("X1b", "nube/1"), "X1b": {"estado": "reasignada", "medio": "nube"}}
        self.assertEqual(T.decidir_rescate("X1", reparada("X1b"), [c("ola")], False, prog)[0], "luego")
        prog["X1b"] = {"estado": "en_curso"}
        self.assertEqual(T.decidir_rescate("X1", reparada("X1b"), [c("ola")], False, prog)[0], "luego")

    def test_si_la_sucesora_ya_llego_a_main_no_hay_nada_que_rescatar(self):
        prog = {"X1": sustituida("X1b", "nube/1"), "X1b": {"estado": "commit"}}
        self.assertEqual(T.decidir_rescate("X1", reparada("X1b"), [c("ola")], False, prog)[0], "nunca")
        prog["X1b"] = {"estado": "pendiente"}
        self.assertEqual(T.decidir_rescate("X1", reparada("X1b"), [c("ola")], False, prog,
                                            en_main_de=lambda k: k == "X1b")[0], "nunca")

    def test_lo_que_decidio_otro_camino_no_se_toca(self):
        for e in ({"estado": "descartada"}, {"estado": "sustituida", "nota": "revisor: fusionada con X2"},
                  {"estado": "commit"}):
            self.assertEqual(T.decidir_rescate("X1", reparada("X1b"), [c("ola")], False, {"X1": e})[0], "nunca")
        self.assertEqual(T.decidir_rescate("X1", reparada("X1b"), [c("ola")], True,
                                            {"X1": sustituida("X1b", "r")})[0], "nunca")
        self.assertEqual(T.decidir_rescate("X1", {"accion": "traida"}, [c("ola")], False, {})[0], "nunca")

    def test_cambios_de_rescate(self):
        cambios = T.cambios_de_rescate("X1", "nube/1", "tsc y pruebas relacionadas en verde", ["X1b"])
        self.assertEqual(cambios["X1"]["estado"], "commit")
        self.assertIn("rescate CAP1025A", cambios["X1"]["nota"])
        self.assertEqual(cambios["X1b"], {"estado": "sustituida", "sustituida_por": "X1",
                                          "nota": "su trabajo llegó a main con X1, traída de nube/1 (rescate CAP1025A)"})


def _sh(cwd, *args, env=None):
    r = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise AssertionError("%s: %s" % (args, r.stderr))
    return r.stdout.strip()


class RescateConGitReal(unittest.TestCase):
    """Un repo de verdad: main, una rama viva `origin/nube/…` y otra archivada `refs/archivo/nube/…`."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.repo = os.path.join(self.dir, "repo")
        os.makedirs(self.repo)
        env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t",
                   GIT_COMMITTER_EMAIL="t@t")
        self.env = env
        g = lambda *a: _sh(self.repo, "git", *a, env=env)  # noqa: E731
        g("init", "-q", "-b", "main")
        open(os.path.join(self.repo, "a.txt"), "w").write("base\n")
        g("add", "-A")
        g("commit", "-q", "-m", "base")
        # Rama viva: salvavidas + integración con asunto «1020U · …»
        g("checkout", "-q", "-b", "ola/CLF1020Ab")
        open(os.path.join(self.repo, "b.txt"), "w").write("nube\n")
        g("add", "-A")
        g("commit", "-q", "-m", "salvavidas · CLF1020Ab: trabajo del agente antes de las puertas (tsc / vitest)")
        open(os.path.join(self.repo, "b.txt"), "a").write("hecho\n")
        g("add", "-A")
        g("commit", "-q", "-m", "1020U · CLF1020Ab: Coolify · cliente puro", "-m", CUERPO)
        g("update-ref", "refs/remotes/origin/nube/40209370479", "HEAD")
        # Rama archivada: integración con nombre de ola sin número.
        g("checkout", "-q", "main")
        g("checkout", "-q", "-b", "ola/RTX1012A")
        open(os.path.join(self.repo, "c.txt"), "w").write("rescate\n")
        g("add", "-A")
        g("commit", "-q", "-m", "Rescate de las ramas de la nube · RTX1012A: Rescate de pruebas", "-m", CUERPO)
        g("update-ref", "refs/archivo/nube/39000000000", "HEAD")
        # Rama a medias de verdad: solo salvavidas.
        g("checkout", "-q", "main")
        g("checkout", "-q", "-b", "ola/MED1")
        open(os.path.join(self.repo, "d.txt"), "w").write("a medias\n")
        g("add", "-A")
        g("commit", "-q", "-m", "salvavidas · MED1: trabajo del agente antes de las puertas (tsc / vitest)")
        g("update-ref", "refs/remotes/origin/nube/40000000001", "HEAD")
        g("checkout", "-q", "main")
        self.progreso = os.path.join(self.dir, "progreso.json")
        json.dump({"CLF1020Ab": sustituida("CLF1020Ac", "nube/40209370479"), "CLF1020Ac": {"estado": "pendiente"},
                   "RTX1012A": sustituida("RTX1012Ab", "nube/39000000000"), "RTX1012Ab": {"estado": "pendiente"},
                   "MED1": sustituida("MED1b", "nube/40000000001"), "MED1b": {"estado": "pendiente"}},
                  open(self.progreso, "w"))
        self.p = [mock.patch.object(T, "RAIZ", self.repo), mock.patch.object(T, "PROGRESO", self.progreso),
                  mock.patch.object(T, "CERROJOS", os.path.join(self.dir, "cerrojos"))]
        for x in self.p:
            x.start()
        self.hechas = {"nube/40209370479|CLF1020Ab": reparada("CLF1020Ac", "2026-10-25 09:00:00"),
                       "nube/39000000000|RTX1012A": reparada("RTX1012Ab", "2026-10-24 09:00:00"),
                       "nube/40000000001|MED1": reparada("MED1b", "2026-10-23 09:00:00"),
                       "nube/1|YA1": {"accion": "traida"}}

    def tearDown(self):
        for x in self.p:
            x.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_filas_de_ref_lee_el_cuerpo(self):
        filas = T.filas_de_ref("refs/remotes/origin/nube/40209370479", "nube/40209370479")
        self.assertEqual([(f["tid"], [x["tipo"] for x in f["commits"]]) for f in filas],
                         [("CLF1020Ab", ["salvavidas", "ola"])])
        self.assertEqual(T.integradas_fuera_de_main(),
                         {"CLF1020Ab": {"refs/remotes/origin/nube/40209370479"},
                          "RTX1012A": {"refs/archivo/nube/39000000000"}})

    def test_seco_dice_que_traeria_sin_tocar_nada(self):
        antes = open(self.progreso).read()
        r = T.rescatar(self.hechas, [], aplicar=False)
        plan = {p["tid"]: (p["accion"], p["cierra"], p["ref"]) for p in r["plan"]}
        self.assertEqual(plan, {"CLF1020Ab": ("traer", ["CLF1020Ac"], "refs/remotes/origin/nube/40209370479"),
                                "RTX1012A": ("traer", ["RTX1012Ab"], "refs/archivo/nube/39000000000")})
        self.assertEqual(self.hechas["nube/40000000001|MED1"]["rescate"], "sin integración: era trabajo a medias")
        self.assertEqual(open(self.progreso).read(), antes)
        self.assertEqual(r["traidas"], [])

    def test_aplicar_trae_con_las_puertas_y_cierra_la_sucesora(self):
        llamadas = []

        def traer(fila, espera):
            llamadas.append((fila["tid"], [x["tipo"] for x in fila["commits"]]))
            return True, "tsc y pruebas relacionadas en verde", False

        with mock.patch.object(T, "_traer", side_effect=traer):
            r = T.rescatar(self.hechas, [], aplicar=True, maximo=1)
        # Primero la más reciente, y solo `maximo` por pasada.
        self.assertEqual(llamadas, [("CLF1020Ab", ["salvavidas", "ola"])])
        prog = json.load(open(self.progreso))
        self.assertEqual(prog["CLF1020Ab"]["estado"], "commit")
        self.assertEqual(prog["CLF1020Ac"]["estado"], "sustituida")
        self.assertEqual(prog["CLF1020Ac"]["sustituida_por"], "CLF1020Ab")
        self.assertEqual(prog["RTX1012Ab"]["estado"], "pendiente")  # la otra, en la próxima pasada
        self.assertEqual(self.hechas["nube/40209370479|CLF1020Ab"]["accion"], "traida")
        self.assertNotIn("rescate", self.hechas["nube/39000000000|RTX1012A"])
        self.assertEqual([x["tid"] for x in r["traidas"]], ["CLF1020Ab"])

    def test_un_fallo_del_medio_no_marca_nada_y_para_la_pasada(self):
        with mock.patch.object(T, "_traer", return_value=(False, "la Mac no tiene memoria", True)) as t:
            r = T.rescatar(self.hechas, [], aplicar=True, maximo=5)
        self.assertEqual(t.call_count, 1)
        self.assertNotIn("rescate", self.hechas["nube/40209370479|CLF1020Ab"])
        self.assertEqual(json.load(open(self.progreso))["CLF1020Ac"]["estado"], "pendiente")
        self.assertEqual(r["traidas"], [])

    def test_lo_que_no_pasa_se_anota_y_no_se_repite(self):
        with mock.patch.object(T, "_traer", return_value=(False, "en la Mac no pasa: tsc: 3 errores", False)):
            r = T.rescatar(self.hechas, [], aplicar=True, maximo=5)
        self.assertEqual(len(r["no_pasan"]), 2)
        self.assertTrue(self.hechas["nube/40209370479|CLF1020Ab"]["rescate"].startswith("no pasa"))
        self.assertEqual(T.rescatar(self.hechas, [], aplicar=True)["plan"], [])  # ya miradas: ni un git log

    def test_si_la_integro_otro_envio_se_trae_esa_rama(self):
        """La reparación nació de una rama a medias, pero OTRO envío de la misma tarea sí la integró."""
        hechas = {"nube/40000000002|CLF1020Ab": reparada("CLF1020Ac", "2026-10-25 10:00:00"),
                  "nube/40209370479|CLF1020Ab": reparada("CLF1020Ac", "2026-10-25 09:00:00")}
        r = T.rescatar(hechas, [], aplicar=False)
        self.assertEqual([(p["tid"], p["rama"], p["ref"]) for p in r["plan"]],
                         [("CLF1020Ab", "nube/40209370479", "refs/remotes/origin/nube/40209370479")])

    def test_cli_seco_no_escribe_el_estado(self):
        estado = os.path.join(self.dir, "traer.json")
        json.dump({"ramas": self.hechas}, open(estado, "w"))
        with mock.patch.object(T, "ESTADO", estado), mock.patch("sys.stdout"):
            self.assertEqual(T.main(["traer_nube.py", "rescatar"]), 0)
        self.assertNotIn("rescate", json.load(open(estado))["ramas"]["nube/40000000001|MED1"])


if __name__ == "__main__":
    unittest.main()
