#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests de higiene_worktrees."""

import json, os, shutil, subprocess, sys, tempfile, unittest, unittest.mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import higiene_worktrees as hw  # noqa: E402


def _git(repo, *args):
    return subprocess.run(
        ["git"] + list(args), cwd=repo, capture_output=True, text=True
    )


class TestCandidatos(unittest.TestCase):
    def test_estados(self):
        prog = {
            "A": {"estado": "commit"},
            "B": {"estado": "sustituida"},
            "C": {"estado": "en_curso"},
            "D": {"estado": "rechazada"},
        }
        nombres = ["A", "B", "C", "D", "E", "_to_delete", ".oculto"]
        self.assertEqual(hw.candidatos(prog, nombres, []), ["A", "B"])

    def test_confusion_de_prefijo(self):
        # SP09291 es candidato aunque haya un proceso en starseed-wt/SP092910/
        ps = ["python3 x.py --wt /home/starseed-wt/SP092910 "]
        self.assertEqual(
            hw.candidatos({"SP09291": {"estado": "commit"}}, ["SP09291"], ps),
            ["SP09291"],
        )

    def test_proceso_vivo_lo_excluye(self):
        ps = ["node scripts/x en starseed-wt/CDK1004 y nada mas"]
        self.assertEqual(
            hw.candidatos({"CDK1004": {"estado": "commit"}}, ["CDK1004"], ps), []
        )

    def test_sin_progreso_no_es_candidato(self):
        self.assertEqual(hw.candidatos({}, ["ZZZ"], []), [])


class TestPodar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="hw-test-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.repo = os.path.join(self.tmp, "repo")
        os.makedirs(self.repo)
        _git(self.repo, "init", "-b", "main")
        _git(self.repo, "config", "user.email", "t@t.t")
        _git(self.repo, "config", "user.name", "t")
        with open(os.path.join(self.repo, "a.txt"), "w") as f:
            f.write("a")
        _git(self.repo, "add", ".")
        _git(self.repo, "commit", "-m", "init")
        olas = os.path.join(self.repo, "starseed_memory_root", "olas")
        os.makedirs(olas)
        with open(os.path.join(olas, "progreso.json"), "w") as f:
            json.dump(
                {
                    "WT1": {"estado": "commit"},
                    "WT2": {"estado": "sustituida"},
                    "WT3": {"estado": "en_curso"},
                },
                f,
            )
        self.wt_base = os.path.join(self.tmp, "starseed-wt")
        os.makedirs(self.wt_base)
        for n in ("WT1", "WT2", "WT3"):
            _git(
                self.repo,
                "worktree",
                "add",
                "-b",
                "rama-" + n,
                os.path.join(self.wt_base, n),
            )
        cerrojo = os.path.join(self.tmp, "integrar.lock")
        self.parcher = unittest.mock.patch.object(hw, "CERROJO", cerrojo)
        self.parcher.start()
        self.addCleanup(self.parcher.stop)

    def test_simular_no_quita_nada(self):
        self.assertEqual(
            hw.podar(self.repo, self.wt_base, simular=True, decir=False), ["WT1", "WT2"]
        )
        for n in ("WT1", "WT2", "WT3"):
            self.assertTrue(os.path.isdir(os.path.join(self.wt_base, n)))

    def test_podar_real(self):
        # WT2 con un archivo sin seguimiento: git se niega y se conserva.
        with open(os.path.join(self.wt_base, "WT2", "suelto.txt"), "w") as f:
            f.write("sin seguimiento")
        quitados = hw.podar(self.repo, self.wt_base, decir=False)
        self.assertEqual(quitados, ["WT1"])
        self.assertFalse(os.path.exists(os.path.join(self.wt_base, "WT1")))
        self.assertTrue(os.path.isdir(os.path.join(self.wt_base, "WT2")))
        self.assertTrue(os.path.isdir(os.path.join(self.wt_base, "WT3")))
        # La rama del worktree quitado sigue existiendo.
        ramas = _git(self.repo, "branch", "--list").stdout
        self.assertIn("rama-WT1", ramas)
        self.assertIn("rama-WT2", ramas)

    # ── SUP0511B (05-11): worktrees que desaparecían bajo el orquestador ──
    def _latidos(self, tareas, nombre="latidos-cola-auto-prueba.json"):
        ruta = os.path.join(self.repo, "starseed_memory_root", "olas", nombre)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({"t": "ahora", "cola": "cola-auto-prueba.json", "tareas": tareas}, f)
        return ruta

    def test_una_tarea_que_late_no_se_poda_aunque_progreso_la_de_por_cerrada(self):
        import time

        # WT1 salió «commit» por otra vía (la nube), pero el orquestador local sigue en sus puertas.
        self._latidos({"WT1": {"fase": "tsc", "desde": time.time() - 120, "avance": time.time() - 60}})
        quitados = hw.podar(self.repo, self.wt_base, decir=False)
        self.assertNotIn("WT1", quitados)
        self.assertTrue(os.path.isdir(os.path.join(self.wt_base, "WT1")), "quitó el worktree de una tarea que late")
        self.assertEqual(quitados, ["WT2"])

    def test_un_latido_hecho_o_viejo_no_protege(self):
        import time

        viejo = time.time() - hw.LATIDO_VIVO_S - 600 if hasattr(hw, "LATIDO_VIVO_S") else 0
        self._latidos({"WT1": {"fase": "hecho", "avance": time.time()},
                       "WT2": {"fase": "escribiendo", "desde": viejo, "avance": viejo}})
        self.assertEqual(hw.podar(self.repo, self.wt_base, decir=False), ["WT1", "WT2"])

    def test_relee_el_estado_justo_antes_de_quitar(self):
        # Entre la elección y el `git worktree remove`, WT1 volvió a «en_curso» (lo reabrió su orquestador).
        ruta_p = os.path.join(self.repo, "starseed_memory_root", "olas", "progreso.json")
        llamadas = []

        def procesos_que_reabren():
            llamadas.append(1)
            if len(llamadas) == 1:
                with open(ruta_p, "w") as f:
                    json.dump({"WT1": {"estado": "en_curso"}, "WT2": {"estado": "sustituida"},
                               "WT3": {"estado": "en_curso"}}, f)
            return []

        with unittest.mock.patch.object(hw, "_procesos", procesos_que_reabren):
            quitados = hw.podar(self.repo, self.wt_base, decir=False)
        self.assertTrue(os.path.isdir(os.path.join(self.wt_base, "WT1")), "quitó WT1 con una lectura vieja")
        self.assertEqual(quitados, ["WT2"])

    def test_sin_progreso_legible_no_quita_nada(self):
        ruta_p = os.path.join(self.repo, "starseed_memory_root", "olas", "progreso.json")
        with open(ruta_p, "w") as f:
            f.write('{"WT1": {"estado": "com')  # a medio escribir
        self.assertEqual(hw.podar(self.repo, self.wt_base, decir=False), [])


class TestTareasQueLaten(unittest.TestCase):
    def test_lee_fases_abiertas_recientes_y_tolera_basura(self):
        import time

        tmp = tempfile.mkdtemp(prefix="hw-latidos-")
        self.addCleanup(shutil.rmtree, tmp, True)
        ahora = time.time()
        with open(os.path.join(tmp, "latidos-a.json"), "w") as f:
            json.dump({"tareas": {"A": {"fase": "escribiendo", "avance": ahora},
                                  "B": {"fase": "hecho", "avance": ahora},
                                  "C": {"fase": "vitest", "avance": ahora - hw.LATIDO_VIVO_S - 1},
                                  "D": {"fase": "tsc"},
                                  "E": "no es un dict"}}, f)
        with open(os.path.join(tmp, "latidos-roto.json"), "w") as f:
            f.write("{no es json")
        viejo = os.path.join(tmp, "latidos-viejo.json")
        with open(viejo, "w") as f:
            json.dump({"tareas": {"F": {"fase": "tsc", "avance": ahora}}}, f)
        os.utime(viejo, (ahora - hw.LATIDO_VIVO_S - 60, ahora - hw.LATIDO_VIVO_S - 60))
        self.assertEqual(hw.tareas_que_laten(tmp, ahora=ahora), {"A", "D"})
        self.assertEqual(hw.tareas_que_laten(os.path.join(tmp, "no-existe")), set())


if __name__ == "__main__":
    unittest.main()
