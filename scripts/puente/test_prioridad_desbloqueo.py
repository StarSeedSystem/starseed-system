import unittest
from scripts.puente.prioridad_desbloqueo import (
    motivo_de_bloqueo,
    tarea_de_arreglo,
    ya_pedida
)


class TestPrioridadDesbloqueo(unittest.TestCase):

    def test_compilacion_fallida(self):
        prueba = {"numero": 1, "estado": "fallo", "sha": "abc123def456", "evidencia": "Error de sintaxis"}
        publicacion = {"fase": "en_progreso"}
        motivo = motivo_de_bloqueo(prueba, publicacion)
        
        self.assertIsNotNone(motivo)
        self.assertEqual(motivo["clase"], "compilacion")
        self.assertEqual(motivo["clave"], "compilacionabc123def")
        self.assertIn("Compilación fallida", motivo["resumen"])
        self.assertEqual(motivo["evidencia"], "Error de sintaxis")

    def test_publicacion_bloqueada(self):
        prueba = {"numero": 2, "estado": "exito"}
        publicacion = {"fase": "bloqueado", "sha": "xyz789uvw012", "evidencia": "Freno manual"}
        motivo = motivo_de_bloqueo(prueba, publicacion)
        
        self.assertIsNotNone(motivo)
        self.assertEqual(motivo["clase"], "publicacion")
        self.assertEqual(motivo["clave"], "publicacionxyz789uvw")
        self.assertIn("Publicación bloqueada", motivo["resumen"])
        self.assertEqual(motivo["evidencia"], "Freno manual")

    def test_las_dos_a_la_vez_compilacion_gana(self):
        prueba = {"numero": 3, "estado": "fallo", "sha": "abc123def456", "evidencia": "Error de sintaxis"}
        publicacion = {"fase": "bloqueado", "sha": "xyz789uvw012", "evidencia": "Freno manual"}
        motivo = motivo_de_bloqueo(prueba, publicacion)
        
        self.assertIsNotNone(motivo)
        self.assertEqual(motivo["clase"], "compilacion")

    def test_nada_bloqueado(self):
        prueba = {"numero": 4, "estado": "exito"}
        publicacion = {"fase": "en_progreso"}
        motivo = motivo_de_bloqueo(prueba, publicacion)
        
        self.assertIsNone(motivo)

    def test_mismo_motivo_mismo_id(self):
        prueba1 = {"numero": 5, "estado": "fallo", "sha": "abc123def456", "evidencia": "Error"}
        publicacion1 = {"fase": "en_progreso"}
        motivo1 = motivo_de_bloqueo(prueba1, publicacion1)
        tarea1 = tarea_de_arreglo(motivo1)
        
        prueba2 = {"numero": 6, "estado": "fallo", "sha": "abc123def456", "evidencia": "Error"}
        publicacion2 = {"fase": "en_progreso"}
        motivo2 = motivo_de_bloqueo(prueba2, publicacion2)
        tarea2 = tarea_de_arreglo(motivo2)
        
        self.assertEqual(tarea1["tareas"][0]["id"], tarea2["tareas"][0]["id"])

    def test_evidencia_larga_recortada(self):
        evidencia_larga = "Evidencia larga " * 200
        prueba = {"numero": 7, "estado": "fallo", "sha": "abc123def456", "evidencia": evidencia_larga}
        publicacion = {"fase": "en_progreso"}
        motivo = motivo_de_bloqueo(prueba, publicacion)
        
        self.assertLessEqual(len(motivo["evidencia"]), 1203)
        self.assertTrue(motivo["evidencia"].endswith("..."))

    def test_colores_ansi_fuera(self):
        evidencia_con_colores = "\u001b[31mError rojo\u001b[0m \u001b[32mÉxito verde\u001b[0m"
        prueba = {"numero": 8, "estado": "fallo", "sha": "abc123def456", "evidencia": evidencia_con_colores}
        publicacion = {"fase": "en_progreso"}
        motivo = motivo_de_bloqueo(prueba, publicacion)
        
        self.assertNotIn("\033[", motivo["evidencia"])
        self.assertEqual(motivo["evidencia"], "Error rojo Éxito verde")

    def test_clave_en_evidencia_tachada(self):
        evidencia_con_clave = "Error con sk-test-secret"
        prueba = {"numero": 9, "estado": "fallo", "sha": "abc123def456", "evidencia": evidencia_con_clave}
        publicacion = {"fase": "en_progreso"}
        motivo = motivo_de_bloqueo(prueba, publicacion)
        
        self.assertIn("<<clave>>", motivo["evidencia"])

    def test_ya_pedida(self):
        clave = "compilacionabc"
        nombres_de_colas = ["cola-1", "cola-2", "cola-compilacionabc-3"]
        self.assertTrue(ya_pedida(clave, nombres_de_colas))

        nombres_sin_clave = ["cola-1", "cola-2", "cola-xyz-3"]
        self.assertFalse(ya_pedida(clave, nombres_sin_clave))


if __name__ == "__main__":
    unittest.main()