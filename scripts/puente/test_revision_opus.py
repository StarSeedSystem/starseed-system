"""Revisión de dirección con Opus: cadencia, huella y dónde deja lo que dice. Sin red ni CLI."""
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import revision_opus as ro

AHORA = 1_790_300_000.0


def leer(clave):
    return {"medidor": clave, "resumen": "resumen de " + clave, "filas": []}


class RevisionOpus(unittest.TestCase):
    def setUp(self):
        d = tempfile.mkdtemp()
        ro.ESTADO = os.path.join(d, "estado.json")
        ro.SALIDA = os.path.join(d, "mando", "revision-opus.json")
        self.dicho, self.latidos, self.preguntas = [], [], []

    def revisar(self, ahora, texto="- desbloquea X · porque Y · mira Z", leer_=leer):
        def consultar(pregunta, contexto):
            self.preguntas.append(contexto)
            return {"texto": texto, "modelo": "claude-opus-5-5"}
        return ro.revisar(ahora, leer=leer_, consultar=consultar, decir=self.dicho.append, latir=self.latidos.append)

    def test_revisa_deja_el_texto_y_late_como_agente(self):
        self.assertIn("desbloquea", self.revisar(AHORA))
        self.assertEqual(self.latidos, ["empezar", "terminar"])
        self.assertEqual(len(self.dicho), 1)
        self.assertEqual(json.load(open(ro.SALIDA))["modelo"], "claude-opus-5-5")

    def test_no_repite_antes_de_su_hora(self):
        self.revisar(AHORA)
        self.assertIsNone(self.revisar(AHORA + 600))
        self.assertEqual(len(self.preguntas), 1)

    def test_si_nada_cambio_no_gasta_otra_consulta(self):
        self.revisar(AHORA)
        self.assertIsNone(self.revisar(AHORA + ro.CADA_S + 1))
        self.assertEqual(len(self.preguntas), 1)

    def test_si_cambia_el_estado_vuelve_a_revisar(self):
        self.revisar(AHORA)
        otro = lambda c: dict(leer(c), resumen="otro " + c)
        self.assertIsNotNone(self.revisar(AHORA + ro.CADA_S + 1, leer_=otro))
        self.assertEqual(len(self.preguntas), 2)

    def test_sin_cambios_no_hace_ruido_en_el_canal(self):
        self.revisar(AHORA, texto="Sin cambios: todo va bien")
        self.assertEqual(self.dicho, [])


if __name__ == "__main__":
    unittest.main()
