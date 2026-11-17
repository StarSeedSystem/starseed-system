"""Pruebas de prioridad_desbloqueo (DSB1116A · DSB01): módulo puro, todo inyectado, sin claves reales."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prioridad_desbloqueo as P  # noqa: E402

SHA = "0123456789abcdef0123456789abcdef01234567"
SHA2 = "fedcba9876543210fedcba9876543210fedcba98"
HEX32 = "d41d8cd98f00b204e9800998ecf8427e"
SECRETO = "sk-abc123DEF456_789xyz"


def prueba_fallida(sha=SHA, texto="scripts/puente/x.py: línea 3: no compila"):
    """Dict `en_curso` como el que escribe director_pruebas.py al fallar una compilación."""
    return {"numero": 39, "estado": "fallo", "sha": sha, "fallo": {"job": "build", "paso": texto}}


def publicacion_bloqueada(sha=SHA2, texto="pruebas del puente en rojo"):
    """Contenido de autopublicar-estado.json con la publicación frenada."""
    return {"fase": "bloqueado", "detalle": "pruebas del puente en rojo · espero un commit nuevo",
            "sha": sha, "evidencia": {"sha": sha, "motivo": "rojo", "texto": texto}}


def motivo(prueba, publicacion):
    """Igual que motivo_de_bloqueo, pero garantizado no None para los casos con bloqueo."""
    m = P.motivo_de_bloqueo(prueba, publicacion)
    assert m is not None
    return m


class TestMotivoDeBloqueo(unittest.TestCase):
    def test_compilacion_fallida(self):
        m = motivo(prueba_fallida(), {})
        self.assertEqual(m["clase"], "compilacion")
        self.assertEqual(m["clave"], "compilacion-" + SHA[:9])
        self.assertIn("prueba 39", m["resumen"])
        self.assertIn("x.py", m["evidencia"])

    def test_publicacion_bloqueada(self):
        m = motivo({}, publicacion_bloqueada())
        self.assertEqual(m["clase"], "publicacion")
        self.assertEqual(m["clave"], "publicacion-" + SHA2[:9])
        self.assertIn("pruebas del puente", m["evidencia"])

    def test_las_dos_a_la_vez_gana_compilacion(self):
        self.assertEqual(motivo(prueba_fallida(), publicacion_bloqueada())["clase"], "compilacion")

    def test_nada_bloqueado_da_none(self):
        self.assertIsNone(P.motivo_de_bloqueo({"numero": 40, "estado": "publicada", "sha": SHA}, {}))
        self.assertIsNone(P.motivo_de_bloqueo({}, {"fase": "al-dia"}))
        self.assertIsNone(P.motivo_de_bloqueo({}, {}))


class TestTareaDeArreglo(unittest.TestCase):
    def test_mismo_motivo_mismo_id_y_distinto_otro(self):
        a = P.tarea_de_arreglo(P.motivo_de_bloqueo(prueba_fallida(), {}))
        b = P.tarea_de_arreglo(P.motivo_de_bloqueo(prueba_fallida(), {}))
        otro = P.tarea_de_arreglo(P.motivo_de_bloqueo({}, publicacion_bloqueada()))
        self.assertEqual(a["tareas"][0]["id"], b["tareas"][0]["id"])
        self.assertNotEqual(a["tareas"][0]["id"], otro["tareas"][0]["id"])

    def test_forma_de_la_cola(self):
        t = P.tarea_de_arreglo(P.motivo_de_bloqueo(prueba_fallida(), {}))["tareas"][0]
        self.assertRegex(t["id"], r"^DSB[0-9a-f]{5}$")
        self.assertTrue(t["titulo"].startswith("URGENTE · "))
        self.assertTrue(t["urgente"])
        self.assertEqual(t["archivos"], [])
        self.assertEqual(t["depende"], [])
        self.assertIn("La compilación de la prueba 39 falló", t["prompt"])
        self.assertIn("x.py", t["prompt"])


class TestEvidencia(unittest.TestCase):
    def test_evidencia_larga_se_recorta(self):
        m = motivo(prueba_fallida(texto="x" * 5000), {})
        self.assertLessEqual(len(m["evidencia"]), P.TOPE_EVIDENCIA)

    def test_colores_ansi_fuera(self):
        m = motivo(prueba_fallida(texto="\x1b[31mno compila\x1b[0m"), {})
        self.assertNotIn("\x1b", m["evidencia"])
        self.assertIn("no compila", m["evidencia"])

    def test_clave_en_la_evidencia_se_tacha(self):
        m = motivo(prueba_fallida(texto="token %s en el log" % SECRETO), {})
        self.assertNotIn(SECRETO, m["evidencia"])
        self.assertIn(P.TACHON, m["evidencia"])

    def test_hex_largo_en_la_evidencia_se_tacha(self):
        m = motivo(prueba_fallida(texto="huella %s del token" % HEX32), {})
        self.assertNotIn(HEX32, m["evidencia"])


class TestYaPedida(unittest.TestCase):
    def test_ya_pedida_por_el_nombre_de_la_cola(self):
        clave = "compilacion-" + SHA[:9]
        self.assertTrue(P.ya_pedida(clave, ["cola-" + clave + ".json", "cola-otra.json"]))
        self.assertFalse(P.ya_pedida(clave, ["cola-publicacion-" + SHA2[:9] + ".json"]))
        self.assertFalse(P.ya_pedida("", ["cola-" + clave + ".json"]))


if __name__ == "__main__":
    unittest.main()
