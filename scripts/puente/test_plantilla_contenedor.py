#!/usr/bin/env python3
"""Pruebas de la plantilla de contenedor del OS (GCA1019Ob): puro archivo, sin GitHub ni red.

Valida deploy/genesis-contenedor/github-actions.yml y su README:
· disparadores (workflow_dispatch y schedule) y permisos mínimos (solo contents: read)
· que el trabajo pide trabajo por la RPC del motor y reporta el resultado
· que solo van NOMBRES de variables de entorno: ningún token ni secreto en claro
"""
import os, re, unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
PLANTILLA = os.path.join(RAIZ, "deploy", "genesis-contenedor", "github-actions.yml")
LEEME = os.path.join(RAIZ, "deploy", "genesis-contenedor", "README.md")
try:
    import yaml
except ImportError:
    yaml = None


def carga_yaml(ruta=PLANTILLA):
    """El YAML de GitHub Actions (PyYAML 1.1 lee `on:` como clave booleana; son lo mismo)."""
    if yaml is None:
        return None
    with open(ruta, encoding="utf-8") as f:
        d = yaml.safe_load(f)
    if isinstance(d, dict) and True in d and "on" not in d:
        d["on"] = d.pop(True)
    return d


def texto(ruta):
    with open(ruta, encoding="utf-8") as f:
        return f.read()


SOSPECHOSOS = (r"\bssm_[A-Za-z0-9]{4,}", r"ghp_[A-Za-z0-9]{10,}", r"github_pat_[A-Za-z0-9]{10,}",
               r"\bsk-[A-Za-z0-9]{16,}", r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
               r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
SECRETS_ESPERADOS = {"STARSEED_MOTOR_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"}


class TestPlantillaContenedor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = carga_yaml()
        cls.t = texto(PLANTILLA)

    def test_disparadores_y_permisos_minimos(self):
        if self.d is None:
            self.skipTest("sin PyYAML instalado")
        self.assertEqual(list(self.d["on"].keys()), ["workflow_dispatch", "schedule"])
        self.assertEqual([c["cron"] for c in self.d["on"]["schedule"]], ["23 * * * *"])
        self.assertEqual(len(str(self.d["on"]["schedule"][0]["cron"]).split()), 5)
        self.assertEqual(self.d["permissions"], {"contents": "read"})
        j = self.d["jobs"]["tarea"]
        self.assertNotIn("permissions", j)  # hereda el mínimo del workflow: no lo amplía
        self.assertEqual(j["runs-on"], "ubuntu-latest")
        self.assertLessEqual(j.get("timeout-minutes", 999), 60)

    def test_pide_trabajo_y_reporta_por_las_rpc_del_motor(self):
        if self.d is None:
            self.skipTest("sin PyYAML instalado")
        escenarios = "\n".join(p["run"] for p in self.d["jobs"]["tarea"]["steps"] if "run" in p)
        self.assertIn("mando_motor_pendiente", escenarios)
        self.assertIn("mando_motor_reportar", escenarios)
        self.assertIn("workflow_dispatch", self.t)  # también se puede correr a mano
        nombres = set(re.findall(r"secrets\.([A-Z0-9_]+)", self.t))
        self.assertEqual(nombres, SECRETS_ESPERADOS)

    def test_el_token_viaja_solo_al_secreto_del_repo(self):
        self.assertNotRegex(self.t, "|".join(SOSPECHOSOS))
        for linea in self.t.splitlines():
            for nombre in sorted(SECRETS_ESPERADOS):
                if nombre in linea:
                    # la única forma de dar valor a un secreto en la plantilla es ${{ secrets.X }}
                    self.assertTrue(
                        re.search(r"\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}", linea) or "for s in" in linea
                        or linea.strip().startswith("#"),
                        "línea con posible valor en claro: %s" % linea.strip())
        self.assertNotRegex(self.t, r"STARSEED_MOTOR_TOKEN\s*=\s*[\"'][^$]")  # jamás un valor literal

    def test_sin_secretos_ni_valores_en_el_readme(self):
        leeme = texto(LEEME)
        self.assertNotRegex(leeme, "|".join(SOSPECHOSOS))
        for palabra in ("STARSEED_MOTOR_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"):
            self.assertIn(palabra, leeme)  # solo NOMBRES con dónde se crea cada uno
        self.assertIn("docs.github.com/actions/learn-github-actions/usage-limits-billing-and-administration", leeme)
        self.assertIn("facturación", leeme)  # límites del plan gratuito: enlaza la doc oficial, sin cifras

    def test_un_solo_enjambre_y_despedir_a_la_telemetria(self):
        if self.d is None:
            self.skipTest("sin PyYAML instalado")
        self.assertEqual(list(self.d["concurrency"].keys()), ["group", "cancel-in-progress"])
        self.assertEqual(self.d["concurrency"]["cancel-in-progress"], False)
        lote = re.search(r'"eventos":\s*\[\]', self.t)
        self.assertIsNotNone(lote)  # el reporte final no lleva eventos: telemetría apagada
        self.assertNotIn("medidores", self.t)


if __name__ == "__main__":
    unittest.main()

