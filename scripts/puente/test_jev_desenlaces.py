#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de jev_desenlaces (sin red ni disco)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jev_desenlaces as J


class DesenlaceDe(unittest.TestCase):
    """desenlace_de(fila) -> {'verdad': True|False|None, 'fuente': str}"""

    def test_veredicto_bloqueada_integrada(self):
        """Veredicto de bloqueada que luego se integró = verdad True."""
        fila = {
            "tipo": "veredicto_bloqueada",
            "tarea": "TG1",
            "veredicto": "reintentar_con_cambio",
            "resultado_posterior": "integrada",
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], True)
        self.assertEqual(r["fuente"], "veredicto_bloqueada")

    def test_veredicto_bloqueada_revertida(self):
        """Veredicto de bloqueada que luego se revirtió = verdad False."""
        fila = {
            "tipo": "veredicto_bloqueada",
            "tarea": "TG2",
            "veredicto": "reintentar",
            "resultado_posterior": "revertida",
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], False)
        self.assertEqual(r["fuente"], "veredicto_bloqueada")

    def test_veredicto_bloqueada_sin_resultado(self):
        """Veredicto de bloqueada sin resultado posterior = verdad None."""
        fila = {
            "tipo": "veredicto_bloqueada",
            "tarea": "TG3",
            "veredicto": "esperar",
        }
        r = J.desenlace_de(fila)
        self.assertIsNone(r["verdad"])
        self.assertEqual(r["fuente"], "veredicto_bloqueada")

    def test_tarea_integrada(self):
        """Tarea integrada en progreso = verdad True."""
        fila = {
            "tipo": "progreso",
            "tarea": "TG4",
            "estado": "integrada",
            "sha": "abc123",
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], True)
        self.assertEqual(r["fuente"], "progreso")

    def test_tarea_revertida(self):
        """Tarea revertida en progreso = verdad False."""
        fila = {
            "tipo": "progreso",
            "tarea": "TG5",
            "estado": "revertida",
            "sha": "def456",
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], False)
        self.assertEqual(r["fuente"], "progreso")

    def test_tarea_en_progreso_sin_final(self):
        """Tarea en progreso sin estado final = verdad None."""
        fila = {
            "tipo": "progreso",
            "tarea": "TG6",
            "estado": "escribiendo",
        }
        r = J.desenlace_de(fila)
        self.assertIsNone(r["verdad"])
        self.assertEqual(r["fuente"], "progreso")

    def test_aprobacion_con_sha_integrado(self):
        """Aprobación sola con SHA integrado = verdad True."""
        fila = {
            "tipo": "aprobacion",
            "tarea": "TG7",
            "sha": "ghi789",
            "integrado": True,
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], True)
        self.assertEqual(r["fuente"], "aprobacion")

    def test_aprobacion_con_sha_revertido(self):
        """Aprobación sola con SHA revertido = verdad False."""
        fila = {
            "tipo": "aprobacion",
            "tarea": "TG8",
            "sha": "jkl012",
            "integrado": False,
            "revertido": True,
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], False)
        self.assertEqual(r["fuente"], "aprobacion")

    def test_aprobacion_sin_sha(self):
        """Aprobación sin SHA = verdad None."""
        fila = {
            "tipo": "aprobacion",
            "tarea": "TG9",
        }
        r = J.desenlace_de(fila)
        self.assertIsNone(r["verdad"])
        self.assertEqual(r["fuente"], "aprobacion")

    def test_publicacion_despliegue_verde(self):
        """Publicación con despliegue verde = verdad True."""
        fila = {
            "tipo": "publicacion",
            "tarea": "TG10",
            "despliegue": "verde",
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], True)
        self.assertEqual(r["fuente"], "publicacion")

    def test_publicacion_despliegue_rojo(self):
        """Publicación con despliegue rojo = verdad False."""
        fila = {
            "tipo": "publicacion",
            "tarea": "TG11",
            "despliegue": "rojo",
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], False)
        self.assertEqual(r["fuente"], "publicacion")

    def test_publicacion_sin_despliegue(self):
        """Publicación sin info de despliegue = verdad None."""
        fila = {
            "tipo": "publicacion",
            "tarea": "TG12",
        }
        r = J.desenlace_de(fila)
        self.assertIsNone(r["verdad"])
        self.assertEqual(r["fuente"], "publicacion")

    def test_correccion_explicita_alex(self):
        """Corrección explícita de Alex = verdad True."""
        fila = {
            "tipo": "correccion",
            "tarea": "TG13",
            "corregida_por": "alex",
            "correcto": True,
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], True)
        self.assertEqual(r["fuente"], "correccion_alex")

    def test_correccion_explicita_alex_incorrecto(self):
        """Corrección explícita de Alex marcando como incorrecto = verdad False."""
        fila = {
            "tipo": "correccion",
            "tarea": "TG14",
            "corregida_por": "alex",
            "correcto": False,
        }
        r = J.desenlace_de(fila)
        self.assertEqual(r["verdad"], False)
        self.assertEqual(r["fuente"], "correccion_alex")

    def test_correccion_no_alex(self):
        """Corrección de alguien que no es Alex = verdad None."""
        fila = {
            "tipo": "correccion",
            "tarea": "TG15",
            "corregida_por": "otro",
            "correcto": True,
        }
        r = J.desenlace_de(fila)
        self.assertIsNone(r["verdad"])
        self.assertEqual(r["fuente"], "correccion_alex")

    def test_opinion_jev_sola_no_es_desenlace(self):
        """La opinión de Jev NUNCA es desenlace -> verdad None, fuente 'jev_opinion'."""
        fila = {
            "tipo": "jev_opinion",
            "tarea": "TG16",
            "respuesta": "reintentar_con_cambio",
            "confianza": 0.85,
        }
        r = J.desenlace_de(fila)
        self.assertIsNone(r["verdad"])
        self.assertEqual(r["fuente"], "jev_opinion")

    def test_fila_vacia(self):
        """Fila vacía -> verdad None, fuente 'desconocida'."""
        fila = {}
        r = J.desenlace_de(fila)
        self.assertIsNone(r["verdad"])
        self.assertEqual(r["fuente"], "desconocida")

    def test_tipo_desconocido(self):
        """Tipo desconocido -> verdad None, fuente 'desconocida'."""
        fila = {"tipo": "algo_raro", "tarea": "TG17"}
        r = J.desenlace_de(fila)
        self.assertIsNone(r["verdad"])
        self.assertEqual(r["fuente"], "desconocida")


class EtiquetaDe(unittest.TestCase):
    """etiqueta_de(exp, desenlace) -> 'verdad' | 'debil' | 'sin_dato'"""

    def test_con_verdad_true(self):
        """Desenlace con verdad True -> 'verdad'."""
        exp = {"id": "exp-1", "tipo": "si-no"}
        desenlace = {"verdad": True, "fuente": "progreso"}
        self.assertEqual(J.etiqueta_de(exp, desenlace), "verdad")

    def test_con_verdad_false(self):
        """Desenlace con verdad False -> 'verdad'."""
        exp = {"id": "exp-2", "tipo": "si-no"}
        desenlace = {"verdad": False, "fuente": "publicacion"}
        self.assertEqual(J.etiqueta_de(exp, desenlace), "verdad")

    def test_con_verdad_none_fuente_conocida(self):
        """Desenlace con verdad None pero fuente conocida (p.ej. progreso sin final) -> 'sin_dato'."""
        exp = {"id": "exp-3", "tipo": "si-no"}
        desenlace = {"verdad": None, "fuente": "progreso"}
        self.assertEqual(J.etiqueta_de(exp, desenlace), "sin_dato")

    def test_opinion_jev_sola(self):
        """Solo opinión de Jev (fuente 'jev_opinion') -> 'debil'."""
        exp = {"id": "exp-4", "tipo": "si-no"}
        desenlace = {"verdad": None, "fuente": "jev_opinion"}
        self.assertEqual(J.etiqueta_de(exp, desenlace), "debil")

    def test_fila_vacia_sin_dato(self):
        """Fila vacía (fuente 'desconocida') -> 'sin_dato'."""
        exp = {"id": "exp-5", "tipo": "si-no"}
        desenlace = {"verdad": None, "fuente": "desconocida"}
        self.assertEqual(J.etiqueta_de(exp, desenlace), "sin_dato")

    def test_sin_experiencia(self):
        """Experiencia None -> 'sin_dato'."""
        desenlace = {"verdad": True, "fuente": "progreso"}
        self.assertEqual(J.etiqueta_de(None, desenlace), "sin_dato")

    def test_sin_desenlace(self):
        """Desenlace None -> 'sin_dato'."""
        exp = {"id": "exp-6", "tipo": "si-no"}
        self.assertEqual(J.etiqueta_de(exp, None), "sin_dato")


if __name__ == "__main__":
    unittest.main()