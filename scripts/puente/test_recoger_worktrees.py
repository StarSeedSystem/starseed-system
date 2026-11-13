# -*- coding: utf-8 -*-
"""TMP1113B · recogida de worktrees terminados: repos temporales de verdad (git), sin tocar nada real."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
import recoger_worktrees as RW  # noqa: E402

ENV = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t",
           GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_SYSTEM="/dev/null")
DIAS = 86400


def git(cwd, *args):
    r = subprocess.run(["git", "-C", cwd, *args], env=ENV, capture_output=True, text=True)
    assert r.returncode == 0, (args, r.stderr)
    return r.stdout.strip()


def envejecer(ruta, segundos):
    """Hace que todo lo que mira `ultimo_cambio` tenga `segundos` de edad."""
    t = time.time() - segundos
    gitdir = git(ruta, "rev-parse", "--absolute-git-dir")
    for destino in (os.path.join(gitdir, "HEAD"), os.path.join(gitdir, "index"), os.path.join(gitdir, "logs", "HEAD"),
                    ruta):
        if os.path.exists(destino):
            os.utime(destino, (t, t))
    for nombre in os.listdir(ruta):
        if nombre != ".git":
            os.utime(os.path.join(ruta, nombre), (t, t), follow_symlinks=False)


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="recoger-wt-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.repo = os.path.join(self.dir, "starseed-os-main")
        self.wt = os.path.join(self.dir, "starseed-wt")
        self.opus = os.path.join(self.dir, "starseed-opus")
        for d in (self.repo, self.wt, self.opus):
            os.makedirs(d)
        git(self.repo, "init", "-q", "-b", "main")
        self.escribir(self.repo, "a.txt", "uno\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "base")
        self.progreso = {}

    def escribir(self, carpeta, nombre, texto):
        with open(os.path.join(carpeta, nombre), "w") as f:
            f.write(texto)

    def nuevo(self, tid, raiz=None, rama=None, commit=False, edad_h=48):
        """Worktree `tid` con su rama; con `commit` la rama lleva un commit que main NO tiene."""
        raiz = raiz or self.wt
        rama = rama or "ola/" + tid
        ruta = os.path.join(raiz, tid)
        git(self.repo, "worktree", "add", "-q", "-b", rama, ruta, "main")
        if commit:
            self.escribir(ruta, tid + ".txt", "trabajo\n")
            git(ruta, "add", "-A")
            git(ruta, "commit", "-qm", "trabajo de " + tid)
        envejecer(ruta, edad_h * 3600)
        return ruta

    def plan(self, **kw):
        kw.setdefault("progreso", self.progreso)
        kw.setdefault("vivas", set())
        kw.setdefault("raices", [self.wt, self.opus])
        return {os.path.basename(p["ruta"]): p for p in RW.planificar(self.repo, **kw)}


class Reglas(Base):
    def test_tarea_integrada_limpia_y_quieta_se_quita(self):
        self.nuevo("T1", commit=True)
        self.progreso["T1"] = {"estado": "commit"}
        p = self.plan()["T1"]
        self.assertEqual(p["accion"], "quitar", p["motivo"])
        self.assertIn("commit", p["motivo"])

    def test_cada_estado_final_cuenta_y_los_demas_no(self):
        for i, est in enumerate(["integrada", "rechazada", "sustituida", "descartada", "no_aplica"]):
            self.nuevo("F%d" % i, commit=True)
            self.progreso["F%d" % i] = {"estado": est}
        for i, est in enumerate(["bloqueante", "conflicto", "fallo_tsc", "pendiente_aprobacion"]):
            self.nuevo("N%d" % i, commit=True)
            self.progreso["N%d" % i] = {"estado": est}
        p = self.plan()
        for i in range(5):
            self.assertEqual(p["F%d" % i]["accion"], "quitar", p["F%d" % i]["motivo"])
        for i in range(4):
            self.assertEqual(p["N%d" % i]["accion"], "conservar", p["N%d" % i]["motivo"])

    def test_tarea_no_final_con_rama_sin_fusionar_se_conserva(self):
        self.nuevo("T2", commit=True)
        self.progreso["T2"] = {"estado": "fallo_tests"}
        p = self.plan()["T2"]
        self.assertEqual(p["accion"], "conservar")
        self.assertIn("no está cerrada", p["motivo"])

    def test_rama_fusionada_en_main_se_quita_aunque_no_conste_en_progreso(self):
        ruta = self.nuevo("OPUS1106-X1", raiz=self.opus, rama="opus1106/X1", commit=True)
        git(self.repo, "merge", "-q", "--no-ff", "-m", "merge", "opus1106/X1")
        envejecer(ruta, 48 * 3600)
        self.progreso["otra"] = {"estado": "commit"}
        p = self.plan()["OPUS1106-X1"]
        self.assertEqual(p["accion"], "quitar", p["motivo"])
        self.assertIn("entera en main", p["motivo"])

    def test_rama_integrada_por_cherry_pick_tambien_cuenta_como_fusionada(self):
        ruta = self.nuevo("OPUS1106-X2", raiz=self.opus, rama="opus1106/X2", commit=True)
        sha = git(ruta, "rev-parse", "HEAD")
        git(self.repo, "cherry-pick", sha)          # otro sha, mismo parche (como hace la puerta de integración)
        envejecer(ruta, 48 * 3600)
        self.progreso["otra"] = {"estado": "commit"}
        self.assertEqual(self.plan()["OPUS1106-X2"]["accion"], "quitar")

    def test_rama_sin_fusionar_y_sin_registro_se_conserva(self):
        self.nuevo("OPUS1106-X3", raiz=self.opus, rama="opus1106/X3", commit=True)
        self.progreso["otra"] = {"estado": "commit"}
        p = self.plan()["OPUS1106-X3"]
        self.assertEqual(p["accion"], "conservar")
        self.assertIn("sin registro", p["motivo"])

    def test_la_tarea_del_opus_se_busca_por_su_id_sin_prefijo(self):
        self.nuevo("OPUS1106-GUA9", raiz=self.opus, rama="opus1106/GUA9", commit=True)
        self.progreso["GUA9"] = {"estado": "rechazada"}
        self.assertEqual(self.plan()["OPUS1106-GUA9"]["accion"], "quitar")

    def test_worktree_sucio_se_conserva(self):
        ruta = self.nuevo("T3", commit=True)
        self.progreso["T3"] = {"estado": "commit"}
        self.escribir(ruta, "a.txt", "cambiado\n")
        envejecer(ruta, 48 * 3600)
        p = self.plan()["T3"]
        self.assertEqual((p["accion"], "sin guardar" in p["motivo"]), ("conservar", True), p["motivo"])

    def test_archivo_sin_seguimiento_tambien_cuenta_como_trabajo(self):
        ruta = self.nuevo("T4", commit=True)
        self.progreso["T4"] = {"estado": "commit"}
        self.escribir(ruta, "nuevo.txt", "sin añadir\n")
        envejecer(ruta, 48 * 3600)
        self.assertEqual(self.plan()["T4"]["accion"], "conservar")

    def test_worktree_reciente_se_conserva_y_el_plazo_se_configura(self):
        self.nuevo("T5", commit=True, edad_h=2)
        self.progreso["T5"] = {"estado": "commit"}
        p = self.plan()["T5"]
        self.assertEqual(p["accion"], "conservar")
        self.assertIn("plazo 24 h", p["motivo"])
        self.assertEqual(self.plan(horas=1)["T5"]["accion"], "quitar")

    def test_el_worktree_principal_nunca_se_toca(self):
        self.progreso["starseed-os-main"] = {"estado": "commit"}
        plan = RW.planificar(self.repo, raices=[self.dir], progreso=self.progreso, vivas=set())
        principal = [p for p in plan if os.path.realpath(p["ruta"]) == os.path.realpath(self.repo)][0]   # macOS: /var → /private/var
        self.assertEqual(principal["accion"], "conservar")
        self.assertIn("principal", principal["motivo"])

    def test_tarea_viva_no_se_quita_ni_con_la_rama_fusionada(self):
        self.nuevo("T6")                      # rama recién creada: su punta es antepasada de main
        self.progreso["T6"] = {"estado": "en_curso"}
        self.assertEqual(self.plan()["T6"]["accion"], "conservar")
        self.nuevo("T7")
        self.progreso["T7"] = {"estado": "fallo"}
        self.assertEqual(self.plan(vivas={"T7"})["T7"]["accion"], "conservar")   # con latido de hoy

    def test_bloqueado_o_fuera_de_las_raices_o_reservado_se_conserva(self):
        r1 = self.nuevo("B1", commit=True)
        git(self.repo, "worktree", "lock", r1)
        self.nuevo("_traer", commit=True)
        fuera = os.path.join(self.dir, "otra-carpeta")
        os.makedirs(fuera)
        self.nuevo("O1", raiz=fuera, commit=True)
        for t in ("B1", "_traer", "O1"):
            self.progreso[t] = {"estado": "commit"}
        p = self.plan()
        self.assertIn("bloqueado", p["B1"]["motivo"])
        self.assertIn("reservada", p["_traer"]["motivo"])
        self.assertIn("raíz vigilada", p["O1"]["motivo"])
        self.assertTrue(all(p[t]["accion"] == "conservar" for t in ("B1", "_traer", "O1")))

    def test_head_suelto_con_commits_fuera_de_main_se_conserva(self):
        ruta = os.path.join(self.wt, "D1")
        git(self.repo, "worktree", "add", "-q", "--detach", ruta, "main")
        self.escribir(ruta, "d.txt", "x\n")
        git(ruta, "add", "-A")
        git(ruta, "commit", "-qm", "suelto")
        envejecer(ruta, 48 * 3600)
        self.progreso["D1"] = {"estado": "commit"}
        p = self.plan()["D1"]
        self.assertEqual(p["accion"], "conservar")
        self.assertIn("HEAD suelto", p["motivo"])

    def test_sin_progreso_legible_no_se_toca_nada(self):
        self.nuevo("T8", commit=True)
        plan = RW.planificar(self.repo, raices=[self.wt], progreso={}, vivas=set())
        self.assertTrue(plan and all(p["accion"] == "conservar" for p in plan))
        self.assertIn("progreso.json", plan[0]["motivo"])

    def test_mirar_no_cambia_la_fecha_del_indice(self):
        ruta = self.nuevo("T9", commit=True)
        self.progreso["T9"] = {"estado": "commit"}
        gitdir = git(ruta, "rev-parse", "--absolute-git-dir")
        antes = os.path.getmtime(os.path.join(gitdir, "index"))
        self.plan()
        self.assertEqual(os.path.getmtime(os.path.join(gitdir, "index")), antes)


class Aplicar(Base):
    def prepara(self):
        a = self.nuevo("A1", commit=True)          # integrada, limpia, quieta: se quita
        b = self.nuevo("B1", commit=True)          # sucia: se queda
        self.escribir(b, "a.txt", "sucio\n")
        envejecer(b, 48 * 3600)
        c = self.nuevo("C1", commit=True)          # no cerrada: se queda
        for t, e in (("A1", "commit"), ("B1", "commit"), ("C1", "fallo")):
            self.progreso[t] = {"estado": e}
        return a, b, c

    def test_simulacro_no_toca_nada(self):
        a, b, c = self.prepara()
        antes = git(self.repo, "worktree", "list")
        olas = os.path.join(self.dir, "olas")
        os.makedirs(olas)
        with open(os.path.join(olas, "progreso.json"), "w") as f:
            json.dump(self.progreso, f)
        r = RW.recoger(self.repo, [self.wt], "main", 24, aplicar_ya=False, olas=olas)
        self.assertFalse(r["aplicado"])
        self.assertEqual((r["resumen"]["quitaria"], r["resumen"]["conservaria"]), (1, 3))   # 3 = B1, C1 y el principal
        self.assertEqual(git(self.repo, "worktree", "list"), antes)
        self.assertTrue(all(os.path.isdir(x) for x in (a, b, c)))

    def test_aplicar_quita_con_git_deja_la_rama_y_escribe_el_registro(self):
        a, b, c = self.prepara()
        plan = self.plan()
        registro = os.path.join(self.dir, "registro", "r.jsonl")
        r = RW.aplicar(self.repo, list(plan.values()), registro=registro)
        self.assertEqual([os.path.basename(x["ruta"]) for x in r["quitados"]], ["A1"])
        self.assertFalse(os.path.exists(a))
        self.assertTrue(os.path.isdir(b) and os.path.isdir(c))
        self.assertIn("ola/A1", git(self.repo, "branch", "--list", "ola/A1"))      # la RAMA se queda
        self.assertNotIn(a, git(self.repo, "worktree", "list"))                  # y git ya no lo registra
        with open(registro, encoding="utf-8") as f:
            lineas = [json.loads(x) for x in f]
        self.assertEqual([x["accion"] for x in lineas if x["accion"] == "quitado"], ["quitado"])
        self.assertTrue(any(x["accion"] == "conservado" and "sin guardar" in x["motivo"] for x in lineas))
        self.assertEqual(lineas[-1]["accion"], "resumen")

    def test_si_git_se_niega_se_conserva_y_se_dice(self):
        a, _b, _c = self.prepara()
        plan = self.plan()
        self.escribir(a, "tarde.txt", "trabajo que llegó entre el plan y el borrado\n")   # git lo detecta y no quita
        r = RW.aplicar(self.repo, list(plan.values()))
        self.assertEqual(r["quitados"], [])
        self.assertTrue(r["errores"])
        self.assertTrue(os.path.isfile(os.path.join(a, "tarde.txt")))

    def test_prunar_quita_solo_el_registro_de_una_carpeta_que_ya_no_existe(self):
        a = self.nuevo("P1", commit=True)
        self.progreso["P1"] = {"estado": "commit"}
        shutil.rmtree(a)                               # alguien borró la carpeta a mano; el registro quedó
        plan = self.plan()
        self.assertEqual(plan["P1"]["accion"], "prunar")
        r = RW.aplicar(self.repo, list(plan.values()))
        self.assertEqual(r["prunados"], 1)
        self.assertNotIn("P1", git(self.repo, "worktree", "list"))
        self.assertIn("ola/P1", git(self.repo, "branch", "--list", "ola/P1"))

    def test_la_linea_de_ordenes_es_simulacro_por_defecto(self):
        a, _b, _c = self.prepara()
        olas = os.path.join(self.dir, "olas")
        os.makedirs(olas)
        with open(os.path.join(olas, "progreso.json"), "w") as f:
            json.dump(self.progreso, f)
        base = [sys.executable, os.path.join(DIRECTORIO, "recoger_worktrees.py"), "--raiz", self.repo, "--raices",
                self.wt, "--olas", olas]
        env = dict(ENV, STARSEED_REGISTRO_WORKTREES=os.path.join(self.dir, "reg.jsonl"))
        r = subprocess.run(base, env=env, capture_output=True, text=True)
        self.assertIn("SIMULACRO", r.stdout)
        self.assertIn("quitaría A1", r.stdout)
        self.assertTrue(os.path.isdir(a))
        self.assertFalse(os.path.exists(os.path.join(self.dir, "reg.jsonl")))          # el simulacro no escribe
        r = subprocess.run(base + ["--aplicar"], env=env, capture_output=True, text=True)
        self.assertIn("APLICADO", r.stdout)
        self.assertFalse(os.path.exists(a))
        self.assertTrue(os.path.isfile(os.path.join(self.dir, "reg.jsonl")))


class LlamadaDesdeLaAutocuracion(Base):
    def test_la_pasada_diaria_recoge_tambien_starseed_opus(self):
        from unittest import mock
        import autocuracion_mando as A

        vieja = self.nuevo("OPUS1106-V1", raiz=self.opus, rama="opus1106/V1", commit=True)
        reciente = self.nuevo("OPUS1106-V2", raiz=self.opus, rama="opus1106/V2", commit=True, edad_h=1)
        olas = os.path.join(self.dir, "olas")
        os.makedirs(olas)
        with open(os.path.join(olas, "progreso.json"), "w") as f:
            json.dump({"V1": {"estado": "commit"}, "V2": {"estado": "commit"}}, f)
        reg = os.path.join(self.dir, "reg.jsonl")
        with mock.patch.multiple(A, RAIZ=self.repo, OLAS=olas, RAIZ_WT=os.path.join(self.dir, "no-existe")), \
                mock.patch.object(RW, "REGISTRO", reg):
            r = A.limpiar_worktrees()
        self.assertEqual([os.path.basename(x) for x in r["quitados"]], ["OPUS1106-V1"], r)
        self.assertFalse(os.path.exists(vieja))
        self.assertTrue(os.path.isdir(reciente))          # dentro del plazo de reposo
        self.assertTrue(os.path.isfile(reg))


if __name__ == "__main__":
    unittest.main()
