"""(SUP0511E, 05-11) Las pruebas de la autocuración no tocan la Mac de verdad, y la limpieza de worktrees
no quita nada sin un progreso.json legible.

Medido el 05-11 con un vigía cada 2 s sobre ~/Documents/starseed-wt: a las 12:17:53 y a las 15:06:17, un
`python -m unittest discover -s scripts/puente` lanzado por el orquestador (la puerta de pruebas de una tarea)
corrió `git -C <main> worktree remove …/VER1105Fc` (y VER1105D, RPO1104T-d2, RTCOL1012Ie-d2; luego
VER1105Fb-d2) con sus agentes escribiendo. Venía de `test_autocuracion_solo_con_la_limpieza_real…`
(test_limpieza_caches): parcheaba `A.limpiar` para que `revisar` creyera correr de verdad y, con
`_leer_json` en {}, la limpieza real daba por «integrada» toda rama recién creada (su punta es antepasada
de main). Esa misma pasada lanzaba también el orquestador y los servicios al día, los medidores, el relevo
de Claude y la autocuración del A1.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autocuracion_mando as A  # noqa: E402

#: Lo real que `revisar` lanza cuando `limpiar_fn is limpiar` (y nada lo inyecta).
EFECTOS = ("limpiar_worktrees", "_lider", "_orquestador_al_dia", "_servicios_al_dia",
           "_reparar_medidores_en_fondo", "_explabs_en_fondo", "_relevo_claude", "_a1_en_fondo")


def _git(cwd, *args):
    return subprocess.run(["git", "-C", cwd, "-c", "user.email=p@p", "-c", "user.name=p", *args],
                          check=True, capture_output=True, text=True, timeout=120)


class LimpiezaDeWorktreesSinProgreso(unittest.TestCase):
    """Un repo de mentira con dos worktrees recién creados (limpios, rama antepasada de main) y un
    node_modules propio en cada uno: lo mismo que VER1105Fc a las 12:17, con su agente escribiendo."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="sup0511e-")
        self.repo = os.path.join(self.tmp, "repo")
        self.wt = os.path.join(self.tmp, "starseed-wt")
        self.olas = os.path.join(self.tmp, "olas")
        for d in (self.repo, self.wt, self.olas):
            os.makedirs(d)
        _git(self.repo, "init", "-q")
        _git(self.repo, "checkout", "-q", "-b", "main")
        with open(os.path.join(self.repo, ".gitignore"), "w", encoding="utf-8") as f:
            f.write("node_modules/\n")
        _git(self.repo, "add", ".gitignore")
        _git(self.repo, "commit", "-q", "-m", "base")
        for t in ("VIVA1", "CERRADA1"):
            _git(self.repo, "worktree", "add", "-q", "-b", "ola/" + t, os.path.join(self.wt, t), "main")
            os.makedirs(os.path.join(self.wt, t, "node_modules", "paquete"))
        self._p = mock.patch.multiple(A, RAIZ=self.repo, RAIZ_WT=self.wt, OLAS=self.olas)
        self._p.start()
        # TMP1113B: la recogida de worktrees nunca toca el ~/.starseed real (registro y marca de permiso).
        import recoger_worktrees as RW
        self._rw = mock.patch.multiple(RW, REGISTRO=os.path.join(self.tmp, "reg.jsonl"),
                                       PERMISO=os.path.join(self.tmp, "permiso"))
        self._rw.start()

    def tearDown(self):
        self._rw.stop()
        self._p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _hay(self, t, dentro=""):
        return os.path.isdir(os.path.join(self.wt, t, dentro))

    def test_sin_progreso_legible_no_quita_ningun_worktree_ni_node_modules(self):
        r = A.limpiar_worktrees()
        self.assertTrue(self._hay("VIVA1") and self._hay("CERRADA1"), r)
        self.assertTrue(self._hay("VIVA1", "node_modules") and self._hay("CERRADA1", "node_modules"), r)
        self.assertEqual((r.get("quitados"), r.get("nm_borrados")), ([], []))
        self.assertIn("progreso", " ".join(r.get("errores") or []))

    def test_un_progreso_a_medias_tampoco_cuenta(self):
        with open(os.path.join(self.olas, "progreso.json"), "w", encoding="utf-8") as f:
            f.write('{"VIVA1": {"estado": "en_cu')  # cortado: _leer_json da {}
        r = A.limpiar_worktrees()
        self.assertTrue(self._hay("VIVA1") and self._hay("CERRADA1"), r)
        self.assertEqual(r.get("quitados"), [])

    def test_con_progreso_quita_la_cerrada_y_deja_la_viva(self):
        with open(os.path.join(self.olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({"VIVA1": {"estado": "en_curso"}, "CERRADA1": {"estado": "commit"}}, f)
        r = A.limpiar_worktrees()
        self.assertTrue(self._hay("VIVA1") and self._hay("VIVA1", "node_modules"), r)
        self.assertFalse(self._hay("CERRADA1"), r)
        self.assertEqual([os.path.basename(x) for x in r.get("quitados") or []], ["CERRADA1"])


class LaPruebaDeLasCachesNoTocaNadaReal(unittest.TestCase):
    def test_la_prueba_de_las_caches_no_llega_a_ningun_efecto_real(self):
        import test_limpieza_caches as T

        llamadas = []
        espias = {n: (lambda n: (lambda *a, **k: llamadas.append(n) or {}))(n) for n in EFECTOS}
        resultado = unittest.TestResult()
        with mock.patch.multiple(A, **espias):
            unittest.defaultTestLoader.loadTestsFromName(
                "LimpiezaCaches.test_autocuracion_solo_con_la_limpieza_real_libera_lo_que_no_ve_y_lo_dice",
                T).run(resultado)
        self.assertTrue(resultado.wasSuccessful(), resultado.failures + resultado.errors)
        self.assertEqual(llamadas, [], "la prueba de las cachés llegó a lo real: %s" % sorted(set(llamadas)))


if __name__ == "__main__":
    unittest.main()
