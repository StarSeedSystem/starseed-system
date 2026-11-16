"""desenlaces: qué cuenta como verdad; la opinión de Jev sola nunca lo es (JLA1116A)."""
import unittest

import jev_desenlaces as jd


class Fuentes(unittest.TestCase):
    def test_veredicto_de_bloqueada_con_su_resultado(self):
        self.assertEqual(jd.desenlace_de({"tipo": "veredicto", "resultado": True}),
                         {"verdad": True, "fuente": "veredicto"})
        self.assertEqual(jd.desenlace_de({"tipo": "veredicto", "resultado": False})["verdad"], False)
        self.assertIsNone(jd.desenlace_de({"tipo": "veredicto"})["verdad"])

    def test_tarea_integrada_o_revertida_del_progreso(self):
        self.assertEqual(jd.desenlace_de({"tipo": "tarea", "estado": "integrada"}),
                         {"verdad": True, "fuente": "tarea"})
        self.assertEqual(jd.desenlace_de({"tipo": "tarea", "estado": "revertida"})["verdad"], False)
        self.assertIsNone(jd.desenlace_de({"tipo": "tarea", "estado": "atascada"})["verdad"])
        self.assertEqual(jd.desenlace_de({"estado": "revertida"})["fuente"], "tarea")

    def test_aprobacion_sola_con_su_sha(self):
        self.assertEqual(jd.desenlace_de({"tipo": "aprobacion", "sha": "abc123", "estado": "integrado"}),
                         {"verdad": True, "fuente": "aprobacion"})
        self.assertEqual(jd.desenlace_de({"tipo": "aprobacion", "sha": "abc123", "estado": "revertido"})["verdad"], False)
        self.assertIsNone(jd.desenlace_de({"tipo": "aprobacion", "estado": "integrado"})["verdad"])

    def test_publicacion_con_su_despliegue(self):
        self.assertEqual(jd.desenlace_de({"tipo": "publicacion", "despliegue": "verde"}),
                         {"verdad": True, "fuente": "publicacion"})
        self.assertEqual(jd.desenlace_de({"tipo": "publicacion", "despliegue": "rojo"})["verdad"], False)
        self.assertIsNone(jd.desenlace_de({"tipo": "publicacion", "despliegue": "raro"})["verdad"])

    def test_correccion_explicita_de_alex(self):
        self.assertEqual(jd.desenlace_de({"tipo": "correccion", "corregida_por": "alex"}),
                         {"verdad": False, "fuente": "correccion"})
        self.assertIsNone(jd.desenlace_de({"tipo": "correccion", "corregida_por": "otro"})["verdad"])


class Etiqueta(unittest.TestCase):
    def test_opinion_de_jev_sola_es_debil(self):
        exp = {"opinion_jev": {"veredicto": "descartar", "confianza": 0.65}}
        self.assertEqual(jd.etiqueta_de(exp, jd.desenlace_de(exp)), "debil")
        self.assertEqual(jd.etiqueta_de({}, {"verdad": None, "fuente": "jev"}), "debil")
        self.assertEqual(jd.etiqueta_de({"respuestas": {"si_no": "no"}}, {"verdad": None, "fuente": ""}), "debil")

    def test_fila_vacia_es_sin_dato(self):
        self.assertEqual(jd.desenlace_de({}), {"verdad": None, "fuente": ""})
        self.assertEqual(jd.etiqueta_de({}, jd.desenlace_de({})), "sin_dato")
        self.assertEqual(jd.etiqueta_de({}, {}), "sin_dato")

    def test_el_hecho_manda_sobre_la_opinion(self):
        exp = {"opinion_jev": {"veredicto": "descartar", "confianza": 0.65},
               "tipo": "tarea", "estado": "integrada"}
        self.assertEqual(jd.etiqueta_de(exp, jd.desenlace_de(exp)), "verdad")


if __name__ == "__main__":
    unittest.main()
