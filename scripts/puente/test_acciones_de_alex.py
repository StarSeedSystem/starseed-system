# -*- coding: utf-8 -*-
"""Qué entra —y qué NO— en la lista de acciones que solo puede hacer Alex."""
import importlib.util
import os
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "acciones-de-alex.py")
_spec = importlib.util.spec_from_file_location("acciones_de_alex", _ruta)
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)

CATALOGO = {
    "apinex": {"nombre": "apinex", "enlace": "https://apinex.bond/airdrop?tab=quests",
               "nota": "Sus modelos gratis exigen un fichaje diario."},
    "groq": {"nombre": "Groq", "enlace": "https://console.groq.com/keys", "nota": "Cuota por minuto."},
}
TODOS = sorted(A.CLAVES_DEL_ENJAMBRE)


class QueEntraEnLaLista(unittest.TestCase):
    def test_sin_nada_pendiente_la_lista_esta_vacia(self):
        self.assertEqual([], A.construir_acciones([], TODOS, CATALOGO))

    def test_un_fichaje_diario_entra_con_su_enlace(self):
        pas = [{"clave": "apinex", "estado": "fichaje", "http": 402, "modelo": "x"}]
        a = A.construir_acciones(pas, TODOS, CATALOGO)
        self.assertEqual(1, len(a))
        self.assertIn("apinex.bond", a[0]["enlace"])
        self.assertIn("fichaje", a[0]["titulo"])

    def test_una_cuota_agotada_NO_entra(self):
        # Se repone sola: mandarle a hacer algo por esto es hacerle perder el tiempo.
        pas = [{"clave": "groq", "estado": "sin_cupo", "http": 429, "modelo": "x"}]
        self.assertEqual([], A.construir_acciones(pas, TODOS, CATALOGO))

    def test_una_clave_caducada_entra_con_la_orden_lista(self):
        pas = [{"clave": "groq", "estado": "sin_clave", "http": 401, "modelo": "x",
                "variable": "GROQ_API_KEY"}]
        a = A.construir_acciones(pas, TODOS, CATALOGO)
        self.assertIn("guardar-clave.sh GROQ_API_KEY --ambos", a[0]["comando"])

    def test_faltan_secretos_en_el_repo(self):
        a = A.construir_acciones([], ["OPENROUTER_API_KEY"], CATALOGO)
        self.assertEqual("github-secretos", a[0]["id"])
        self.assertIn("nube-gh.py secretos", a[0]["comando"])
        self.assertIn("github.com", a[0]["enlace"])
        self.assertNotIn("OPENROUTER_API_KEY", a[0]["detalle"])

    def test_toda_accion_trae_enlace_o_comando_nunca_solo_una_descripcion(self):
        pas = [{"clave": "apinex", "estado": "fichaje", "http": 402, "modelo": "x"},
               {"clave": "groq", "estado": "sin_clave", "http": 401, "modelo": "x",
                "variable": "GROQ_API_KEY"}]
        for accion in A.construir_acciones(pas, [], CATALOGO):
            self.assertTrue(accion["enlace"] or accion["comando"], accion["id"])
            self.assertTrue(accion["por_que_no_lo_hago_yo"], accion["id"])

    def test_lo_urgente_va_primero(self):
        pas = [{"clave": "apinex", "estado": "fichaje", "http": 402, "modelo": "x"}]
        a = A.construir_acciones(pas, [], CATALOGO)
        self.assertTrue(all(x["urgencia"] == "alta" for x in a))


if __name__ == "__main__":
    unittest.main()
