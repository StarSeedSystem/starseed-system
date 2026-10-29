"""DIR1029B: reescribir solo cambia el bloque de fallback_providers y deja lo de detrás."""
import importlib.util, os, unittest

_r = os.path.join(os.path.dirname(os.path.abspath(__file__)), "enrutar-hermes.py")
_s = importlib.util.spec_from_file_location("enrutar_hermes", _r)
E = importlib.util.module_from_spec(_s); _s.loader.exec_module(E)

TEXTO = ("model:\n  default: auto\n  provider: freellmapi\nfallback_providers:\n  - provider: viejo\n    model: x\n"
         "_left_core_installed: true\ndisplay:\n  tema: oscuro\nmcp_servers:\n  starseed-director:\n    command: py\n"
         "toolsets:\n  - hermes-cli\n")


class Bloque(unittest.TestCase):
    def test_lo_de_detras_sigue(self):
        t = E.reescribir(TEXTO, ("freellmapi", "auto"), [("freellmapi", "auto", "escribe"), ("nim", "kimi", "escribe")])
        for clave in ("_left_core_installed: true", "display:", "mcp_servers:", "starseed-director:", "toolsets:"):
            self.assertIn(clave, t)
        self.assertNotIn("viejo", t)
        self.assertIn("  - provider: nim", t)

    def test_bloque_al_final_tambien(self):
        t = E.reescribir("model:\n  default: a\n  provider: b\nfallback_providers:\n  - provider: viejo\n    model: x\n",
                         ("b", "a"), [("b", "a", "escribe")])
        self.assertNotIn("viejo", t)
        self.assertTrue(t.endswith("    model: a\n"))


if __name__ == "__main__":
    unittest.main()
