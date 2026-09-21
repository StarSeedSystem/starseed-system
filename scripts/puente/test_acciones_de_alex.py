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



class TestVerificar(unittest.TestCase):
    """El boton «verificar» de la ventana de «te toca a ti» (2026-09-21, pedido por Alex).

    Lo importante no es que devuelva algo, sino que vuelva a MEDIR. Un boton que marcara
    una casilla sin comprobar seria la misma mentira que nos costo el dia: el medidor
    llevaba 20 horas pidiendo unas claves que ya estaban puestas.
    """

    def test_si_ya_no_hace_falta_dice_hecha(self):
        todas = set(A.CLAVES_DEL_ENJAMBRE)
        r = A.verificar("github-secretos", pasarelas=[], secretos_repo=todas)
        self.assertTrue(r["hecha"])
        self.assertEqual(r["quedan"], 0)
        self.assertIn("comprobado", r["detalle"])

    def test_si_sigue_faltando_dice_que_no_y_por_que(self):
        faltan = set(A.CLAVES_DEL_ENJAMBRE) - {"OPENROUTER_API_KEY"}
        r = A.verificar("github-secretos", pasarelas=[], secretos_repo=faltan)
        self.assertFalse(r["hecha"])
        self.assertIn("OPENROUTER_API_KEY", r["detalle"])

    def test_mide_de_nuevo_no_lee_lo_guardado(self):
        """Mismo id, hechos distintos -> veredictos distintos. Eso prueba que remide."""
        todas = set(A.CLAVES_DEL_ENJAMBRE)
        a = A.verificar("github-secretos", pasarelas=[], secretos_repo=todas)
        b = A.verificar("github-secretos", pasarelas=[], secretos_repo=set())
        self.assertTrue(a["hecha"])
        self.assertFalse(b["hecha"])

    def test_sin_id_informa_de_todas(self):
        r = A.verificar(None, pasarelas=[], secretos_repo=set())
        self.assertIn("acciones", r)
        self.assertGreaterEqual(r["quedan"], 1)

    def test_las_ordenes_se_pueden_pegar_desde_cualquier_carpeta(self):
        """El fallo que reporto Alex: «can't open file /Users/alex/scripts/puente/...»."""
        acciones = A.construir_acciones([], set())
        for a in acciones:
            if a.get("comando"):
                self.assertTrue(
                    a["comando"].startswith("cd /"),
                    "la orden %r es relativa: falla si no estas ya en el repo" % a["comando"],
                )

if __name__ == "__main__":
    unittest.main()