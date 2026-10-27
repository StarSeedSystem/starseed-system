#!/usr/bin/env python3
"""Pruebas de la plantilla de GitHub Actions del Genesis Contenedor (Ola 1019G · tarea O).
Solo lee archivos: sin red, sin secretos reales y sin ejecutar nada."""
import re, unittest
from pathlib import Path
import yaml
RAIZ = Path(__file__).resolve().parents[2]
RUTA = RAIZ / "deploy" / "genesis-contenedor" / "github-actions.yml"

def cargar():
    texto = RUTA.read_text(encoding="utf-8")
    doc = yaml.safe_load(texto)
    # PyYAML lee la clave `on` como el booleano True (YAML 1.1): la normalizamos.
    if "on" not in doc and True in doc: doc["on"] = doc.pop(True)
    return texto, doc

class TestPlantillaContenedor(unittest.TestCase):
    def setUp(self): self.texto, self.doc = cargar()
    def test_estructura_y_disparadores(self):
        self.assertEqual((self.doc["name"], sorted(self.doc["on"])), ("Genesis Contenedor", ["schedule", "workflow_dispatch"]))
        cron = self.doc["on"]["schedule"][0]["cron"]
        self.assertTrue(re.fullmatch(r"[ 0-9*,-]+", cron), "La programación solo admite caracteres de cron")
        self.assertIn("conectar", self.doc["jobs"])
        job = self.doc["jobs"]["conectar"]
        self.assertEqual(job["runs-on"], "ubuntu-latest")
        self.assertEqual(job.get("timeout-minutes"), 50)
    def test_permisos_minimos(self):
        self.assertEqual(self.doc["permissions"], {"contents": "read"})
        texto = self.texto
        self.assertNotIn("contents: write", texto)
        self.assertNotIn("pull-requests: write", texto)
    def test_claves_solo_por_secreto(self):
        for nombre in ("STARSEED_MOTOR_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"):
            patron = r"\$\{\{\s*secrets\.%s\s*\}\}" % nombre
            self.assertTrue(re.search(patron, self.texto), "Falta en secreto la llave %s" % nombre)
            self.assertNotIn("%s=" % nombre, self.texto), "La llave %s no puede ir con valor en claro" % nombre
    def test_sin_secretos_en_claro(self):
        # Huellas de llaves reales que jamás deben aparecer escritas en la plantilla.
        for patron in (r"ssm_[A-Za-z0-9]{10,}", r"sk-[A-Za-z0-9_-]{10,}", r"ghp_[A-Za-z0-9_-]{10,}",
                       r"github_pat_[A-Za-z0-9_-]{10,}", r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
                       r"postgres(ql)?://[^\s\"']+:[^\s\"']@", r"://[^/\s\"']+:[^\s@\"']+(?:@)"):
            self.assertIsNone(re.search(patron, self.texto), "Hay un secreto en claro (%s…)" % patron[:20])
    def test_referencias_vivas_del_repo(self):
        # Cada script del OS que la plantilla llama existe de verdad en el repositorio.
        for rel, en_flujo in (("scripts/enjambre/starseed-enjambre.py", True), ("scripts/enjambre/motor_ambito.py", False)):
            self.assertTrue((RAIZ / rel).is_file(), "La plantilla llama a %s y no existe" % rel)
            self.assertIn("motor_ambito" if not en_flujo else rel, self.texto)
    def test_secreto_del_motor_en_el_resumen_del_trabajo(self):
        entorno = self.doc["jobs"]["conectar"].get("env", {})
        self.assertEqual(entorno.get("STARSEED_MOTOR_TOKEN"), "${{ secrets.STARSEED_MOTOR_TOKEN }}")

if __name__ == "__main__":
    unittest.main()
