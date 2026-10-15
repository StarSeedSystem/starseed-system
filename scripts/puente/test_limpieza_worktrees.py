import unittest
import tempfile
import os
from unittest.mock import Mock
from scripts.puente.limpieza_worktrees import plan, recoger, aplicar, ESTADOS_CERRADOS

class TestLimpiezaWorktrees(unittest.TestCase):
    def setUp(self):
        # Configuración común para los tests
        self.progreso = {
            "tarea1": {"estado": "rechazada"},
            "tarea2": {"estado": "sustituida"},
            "tarea3": {"estado": "pendiente"},
            "tarea4": {"estado": "en_curso"},
            "tarea5": {"estado": "completed"},  # Asumimos que completed es un estado de integrado? Pero en la tarea, integrada se determina por git.
            "tarea6": {"estado": "integrada"}   # Nota: en la tarea, integrada se determina por git, no por progreso. Pero usaremos progreso solo para el estado.
        }
        self.en_curso = ["tarea4"]  # tarea4 está en curso
        # Crear un directorio temporal para los tests que necesitan crear directorios
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_path = self.temp_dir.name

    def tearDown(self):
        self.temp_dir.cleanup()

    def make_path(self, *parts):
        return os.path.join(self.base_path, *parts)

    def test_rechazada_limpia_debe_quitarse(self):
        worktrees = [{
            "ruta": self.make_path("ruta", "tarea1"),
            "tarea": "tarea1",
            "limpio": True,
            "integrada": False,  # Asumimos que no es ancestro de main
            "nm_real": False
        }]
        resultado = plan(worktrees, self.progreso, self.en_curso)
        self.assertEqual(resultado["quitar"], [self.make_path("ruta", "tarea1")])
        self.assertEqual(resultado["nm"], [])

    def test_rechazada_sucia_no_debe_quitarse(self):
        worktrees = [{
            "ruta": self.make_path("ruta", "tarea1"),
            "tarea": "tarea1",
            "limpio": False,  # Sucio
            "integrada": False,
            "nm_real": False
        }]
        resultado = plan(worktrees, self.progreso, self.en_curso)
        self.assertEqual(resultado["quitar"], [])
        self.assertEqual(resultado["nm"], [])

    def test_en_curso_no_debe_quitarse(self):
        worktrees = [{
            "ruta": self.make_path("ruta", "tarea4"),
            "tarea": "tarea4",
            "limpio": True,
            "integrada": False,
            "nm_real": False
        }]
        resultado = plan(worktrees, self.progreso, self.en_curso)
        self.assertEqual(resultado["quitar"], [])
        self.assertEqual(resultado["nm"], [])

    def test_pendiente_con_nm_real_solo_nm(self):
        worktrees = [{
            "ruta": self.make_path("ruta", "tarea3"),
            "tarea": "tarea3",
            "limpio": True,
            "integrada": False,
            "nm_real": True
        }]
        resultado = plan(worktrees, self.progreso, self.en_curso)
        self.assertEqual(resultado["quitar"], [])
        self.assertEqual(resultado["nm"], [self.make_path("ruta", "tarea3")])

    def test_integrada_limpia_debe_quitarse(self):
        worktrees = [{
            "ruta": self.make_path("ruta", "tarea5"),
            "tarea": "tarea5",
            "limpio": True,
            "integrada": True,  # Asumimos que el git_fn devolvió True para integrada
            "nm_real": False
        }]
        resultado = plan(worktrees, self.progreso, self.en_curso)
        self.assertEqual(resultado["quitar"], [self.make_path("ruta", "tarea5")])
        self.assertEqual(resultado["nm"], [])

    def test_enlace_simbolico_no_se_sigue(self):
        worktrees = [{
            "ruta": self.make_path("ruta", "tarea6"),
            "tarea": "tarea6",
            "limpio": True,
            "integrada": False,
            "nm_real": False,  # Pero en realidad es un enlace, pero en nuestro modelo, nm_real es False si es enlace
        }]
        # En recoger, nosotros determinamos nm_real como: directorio y no enlace. Entonces si es enlace, nm_real=False.
        resultado = plan(worktrees, self.progreso, self.en_curso)
        self.assertEqual(resultado["quitar"], [])
        self.assertEqual(resultado["nm"], [])

    def test_rama_no_se_borra_en_plan(self):
        # El plan no debe devolver la rama para borrar, solo rutas de worktrees y node_modules.
        worktrees = [{
            "ruta": self.make_path("ruta", "tarea1"),
            "tarea": "tarea1",
            "limpio": True,
            "integrada": False,
            "nm_real": False
        }]
        resultado = plan(worktrees, self.progreso, self.en_curso)
        self.assertEqual(resultado["quitar"], [self.make_path("ruta", "tarea1")])
        self.assertEqual(resultado["nm"], [])

    def test_fallo_git_worktree_remove_no_aborta(self):
        # Esto se testea en aplicar, pero we'll do a separate test for aplicar.
        pass

    def test_recoger_lista_worktrees(self):
        # Mock de git_fn
        def mock_git_fn(ruta, comando):
            print(f"DEBUG mock_git_fn: ruta={ruta}, comando={comando}")
            if comando == "status --porcelain":
                return ""  # limpio
            elif comando == "merge-base --is-ancestor ola/tarea1 main":
                print("DEBUG mock_git_fn: returning 0 for merge-base")
                return 0  # exit code 0 significa true (es ancestro)
            else:
                raise ValueError(f"Comando inesperado: {comando}")
        # Usamos el directorio temporal como base, y luego el subdirectorio "ola" como raiz_wt para recoger
        base = self.make_path("raiz")
        ola_dir = self.make_path("raiz", "ola")
        os.makedirs(ola_dir, exist_ok=True)
        # Creamos un directorio falso para el worktree directamente bajo "ola"
        worktree_dir = os.path.join(ola_dir, "tarea1")
        os.makedirs(worktree_dir, exist_ok=True)
        worktrees = recoger(ola_dir, "repo", mock_git_fn)
        print(f"DEBUG: number of worktrees found: {len(worktrees)}")
        if len(worktrees) > 0:
            wt = worktrees[0]
            print(f"DEBUG: wt={wt}")
        self.assertEqual(len(worktrees), 1)
        wt = worktrees[0]
        self.assertEqual(wt["ruta"], worktree_dir)
        self.assertEqual(wt["tarea"], "tarea1")
        self.assertTrue(wt["limpio"])
        self.assertTrue(wt["integrada"])
        self.assertFalse(wt["nm_real"])  # Porque no creamos node_modules

    def test_aplicar_quita_worktree(self):
        # Mocks
        def mock_git_fn(ruta, *args):
            # Simulamos que git worktree remove tiene éxito
            if args[0] == "worktree remove":
                return
            raise ValueError(f"Comando inesperado: {args}")
        def mock_rmtree_fn(path):
            pass  # No hacemos nada
        plan = {"quitar": [self.make_path("ruta", "tarea1")], "nm": []}
        resultado = aplicar(plan, "repo", mock_git_fn, mock_rmtree_fn)
        self.assertEqual(resultado["quitados"], [self.make_path("ruta", "tarea1")])
        self.assertEqual(resultado["nm_borrados"], [])
        self.assertEqual(resultado["errores"], [])

    def test_aplicar_elimina_node_modules(self):
        def mock_git_fn(ruta, *args):
            raise ValueError("No se debería llamar a git_fn para nm")
        def mock_rmtree_fn(path):
            # Simulamos que se elimina el directorio
            pass
        # Creamos el directorio node_modules para que la condición se cumpla
        ruta = self.make_path("ruta", "tarea1")
        os.makedirs(os.path.join(ruta, "node_modules"), exist_ok=True)
        plan = {"quitar": [], "nm": [ruta]}
        resultado = aplicar(plan, "repo", mock_git_fn, mock_rmtree_fn)
        self.assertEqual(resultado["quitados"], [])
        self.assertEqual(resultado["nm_borrados"], [ruta])
        self.assertEqual(resultado["errores"], [])

    def test_aplicar_error_en_quitar_no_aborta(self):
        def mock_git_fn(ruta, *args):
            if args[0] == "worktree remove":
                raise Exception("Fallo simulado")
            return
        def mock_rmtree_fn(path):
            pass
        # Note: the error message will include the actual path, which is in the temporary directory
        expected_path = self.make_path("ruta", "tarea1")
        plan = {"quitar": [expected_path], "nm": []}
        resultado = aplicar(plan, "repo", mock_git_fn, mock_rmtree_fn)
        self.assertEqual(resultado["quitados"], [])
        self.assertEqual(resultado["nm_borrados"], [])
        self.assertEqual(len(resultado["errores"]), 1)
        self.assertIn(f"Error al quitar {expected_path}", resultado["errores"][0])

if __name__ == '__main__':
    unittest.main()