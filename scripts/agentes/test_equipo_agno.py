# -*- coding: utf-8 -*-
"""equipo_agno: equipo de dos con memoria SQLite local; modelo falso, sin red.

Las partes puras se prueban siempre. La parte de biblioteca se prueba con un
módulo agno FALSO (nada se construye de verdad) y, si el agno real está
instalado, se aterriza con el módulo real y UN modelo falso. Si la dependencia
falta, la prueba se salta con motivo franquito.
"""
import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import equipo_agno as E  # noqa: E402
import modelos_propios as M  # noqa: E402

try:  # ¿está el agno real? decides con esto el salto con motivo
    import agno  # noqa: F401, E402

    agno_presente = True
except ImportError:  # pragma: no cover
    agno_presente = False

CLIENTE = M.ClienteOpenAI("http://127.0.0.1:4480/v1", "ollama/bitnet-b1.58",
                          "", "servidor-propio")


def agno_falso(tiza: list) -> SimpleNamespace:
    """Módulo agno de mentira: registra (marca, kwargs) y devuelve la entidad."""
    class Facturo:
        def __init__(self, marca: str):
            self.marca = marca

        def __call__(self, **kwargs):
            tiza.append((self.marca, kwargs))
            self.kwargs = kwargs
            return self

    return SimpleNamespace(Agent=Facturo("Agent"), Team=Facturo("Team"),
                           SqliteDb=Facturo("SqliteDb"),
                           OpenAIChat=Facturo("OpenAIChat"))


def _spec(cinco: str = "/tmp/opencode/memorias") -> E.EspecEquipo:
    return E.especificar_equipo(
        "Equipo Prohibido, los: dos",
        E.Miembro("Escritor", "redacta", ("Antes de mirar, escribe.", )),
        E.Miembro("Verificador", "revisa", ("Nada en verde sin prueba.", )),
        CLIENTE, cinco)


class Puras(unittest.TestCase):
    def test_ruta_memoria_queda_local_y_con_slug(self):
        self.assertEqual(E.ruta_memoria("/tmp/x", "Equipo, los dos"),
                         os.path.join("/tmp/x", "memoria-equipo-los-dos.sqlite"))
        self.assertEqual(E.ruta_memoria("/tmp/x", "///"), os.path.join("/tmp/x", "memoria-equipo.sqlite"))
        self.assertTrue(E.ruta_memoria("/tmp/x", "").endswith(".sqlite"))

    def test_especifica_dos_y_comparte_ruta(self):
        s = _spec()
        self.assertEqual([m.nombre for m in s.miembros], ["Escritor", "Verificador"])
        self.assertTrue(s.ruta_memoria.startswith("/tmp/opencode/memorias"))
        self.assertIs(s.cliente, CLIENTE)

    def test_telemetria_apagada_por_defecto(self):
        mundo: dict[str, str] = {}
        E.apagar_telemetria(mundo)
        self.assertEqual(mundo[E.TELEMETRIA], "False")

    def test_kwargs_piden_la_misma_memoria(self):
        s = _spec()
        memoria = object()
        k = E.kwargs_equipo(s, "modelo", memoria, ["a", "b"])
        self.assertEqual(k["members"], ["a", "b"])
        self.assertIs(k["db"], memoria)
        self.assertEqual(len(E.kwargs_miembro(s.miembros[0], "m", memoria)), 5)


class ConAgnoFalso(unittest.TestCase):
    def test_todo_va_a_la_misma_memoria_y_al_modelo_falso(self):
        tiza: list = []
        agno = agno_falso(tiza)
        modelo = object()  # el modelo falso de la prueba
        equipo = E.montar_equipo(_spec(), modulo_agno=agno, modelo=modelo)
        marcas = [m for m, _ in tiza]
        self.assertEqual(marcas, ["SqliteDb", "Agent", "Agent", "Team"])
        memoria = agno.SqliteDb  # la misma instancia: una sola llamada
        self.assertEqual(memoria.kwargs["db_file"], _spec().ruta_memoria)
        self.assertIs(agno.Team.kwargs["model"], modelo)
        self.assertEqual(len(agno.Team.kwargs["members"]), 2)
        self.assertIs(agno.Team.kwargs["db"], memoria)
        self.assertIs(agno.Team.kwargs["members"][0], agno.Agent)
        self.assertEqual(os.environ[E.TELEMETRIA], "False")

    def test_modelo_del_cliente_nunca_inventa_clave_ni_nube(self):
        tiza: list = []
        agno = agno_falso(tiza)
        E.modelo_del_cliente(agno, CLIENTE)
        k = agno.OpenAIChat.kwargs
        self.assertEqual(k["id"], "ollama/bitnet-b1.58")
        self.assertEqual(k["base_url"], "http://127.0.0.1:4480/v1")
        self.assertIsNone(k["api_key"])
        self.assertNotIn("agno.com", str(k))

    def test_cliente_con_clave_si_se_la_dan_el_rutador(self):
        tiza: list = []
        agno = agno_falso(tiza)
        conclave = M.ClienteOpenAI(M.OPENROUTER, "meta/llama:free", "secreta",
                                   "openrouter:free")
        E.modelo_del_cliente(agno, conclave)
        self.assertEqual(agno.OpenAIChat.kwargs["api_key"], "secreta")
        self.assertNotIn("agno.com", str(agno.OpenAIChat.kwargs))


class SinDependencia(unittest.TestCase):
    @unittest.skipIf(agno_presente, "agno sí está instalado: este aviso no aplica")
    def test_sin_agno_avisa_de_donde_sacarla(self):
        importe = agno_presente
        with self.assertRaises(ImportError) as ruido:
            E._agno_real()
        self.assertIn("pip install agno", str(ruido.exception))
        self.assertFalse(importe)

    def test_montar_el_reloj_importa_tambien_deriva_al_import_error(self):
        if agno_presente:
            self.skipTest("agno presente: sin import error esperable")
        with self.assertRaises(ImportError):
            E.montar_equipo(_spec())


@unittest.skipUnless(agno_presente,
                     "agno no está instalado (pip install agno): prueba real en salto")
class ConAgnoReal(unittest.TestCase):
    def test_el_equipo_real_se_monta_con_modelo_falso_cadena(self):
        equipo = E.montar_equipo(_spec(), modelo="openai:bitnet-b1.58")
        self.assertEqual([m.name for m in equipo.members], ["Escritor", "Verificador"])
        self.assertTrue(all(m.db is equipo.db for m in equipo.members))
        self.assertEqual(os.path.basename(equipo.db.db_file),
                         "memoria-equipo-prohibido-los-dos.sqlite")

    def test_el_modelo_sale_del_puente_propio_y_nunca_de_agno_com(self):
        equipo = E.montar_equipo(_spec())
        self.assertEqual(type(equipo.model).__name__, "OpenAIChat")
        self.assertEqual(equipo.model.id, "ollama/bitnet-b1.58")
        self.assertEqual(equipo.model.base_url, "http://127.0.0.1:4480/v1")
        self.assertIsNone(equipo.model.api_key)


if __name__ == "__main__":
    unittest.main()
