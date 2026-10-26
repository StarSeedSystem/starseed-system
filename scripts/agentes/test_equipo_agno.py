# -*- coding: utf-8 -*-
"""test_equipo_agno: contrato, entorno local y equipo de dos con SQLite compartido."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import equipo_agno as E  # noqa: E402

try:
    import agno  # noqa: F401
    from agno.db.base import UserMemory
    from agno.db.sqlite import SqliteDb  # noqa: F401
    from agno.models.base import Model
    from agno.models.response import ModelResponse
except Exception:
    AGNO, MOTIVO = False, "falta la dependencia agno con SqliteDb en esta máquina"
else:
    AGNO, MOTIVO = True, ""

if AGNO:
    from dataclasses import dataclass

    @dataclass
    class ModeloFalso(Model):
        id: str = "falso"
        name: str = "Modelo falso"
        provider: str = "local"
        texto: str = "respuesta falsa"
        def invoke(self, *a, **k): return ModelResponse(role="assistant", content=self.texto)
        async def ainvoke(self, *a, **k): return self.invoke()
        def invoke_stream(self, *a, **k): yield self.invoke()
        async def ainvoke_stream(self, *a, **k): yield self.invoke()
        def _parse_provider_response(self, response, **k):
            return ModelResponse(role="assistant", content=str(response))
        def _parse_provider_response_delta(self, response):
            return ModelResponse(role="assistant", content=str(response))


class Contrato(unittest.TestCase):
    def test_mapea_el_agent_del_os(self):
        a = E.AgenteDelEquipo.desde_contrato({
            "id": "a1", "name": "Aurora", "persona": "Hablas claro.",
            "description": "d", "capabilities": ["research", 7, "taste"],
            "model": {"temperature": 0.4},
        })
        self.assertEqual((a.id, a.name, a.persona), ("a1", "Aurora", "Hablas claro."))
        self.assertEqual(a.capabilities, ("research", "taste"))
        self.assertEqual(a.temperature, 0.4)

    def test_contrato_vacio_y_temperatura(self):
        a = E.AgenteDelEquipo.desde_contrato({"model": {"temperature": 5}})
        self.assertEqual((a.id, a.name, a.persona), ("agente", "Agente", ""))
        self.assertIsNone(a.temperature)
        self.assertEqual(E.AgenteDelEquipo.desde_contrato({"capabilities": "no"}).capabilities, ())

    def test_dos_roles_por_defecto(self):
        a, b = E.equipo_por_defecto()
        self.assertNotEqual(a.id, b.id)
        self.assertEqual({a.role, b.role}, {"lead", "member"})


class Local(unittest.TestCase):
    def test_ruta_sqlite_y_entorno(self):
        self.assertEqual(E.ruta_memoria("/tmp/x"), Path("/tmp/x") / E.NOMBRE_DB)
        entorno: dict[str, str] = {}
        E.aplicar_entorno_local(entorno)
        self.assertEqual(entorno["AGNO_TELEMETRY"], "false")
        self.assertNotIn("AGNO_API_KEY", entorno)
        self.assertFalse(hasattr(E, "AgentOS"))


@unittest.skipUnless(AGNO, MOTIVO)
class Equipo(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.llamadas: list[tuple[str, str]] = []

        def fabrica_cliente(agente):
            return E.ClienteOpenAI("http://127.0.0.1:4480/v1", "local/" + agente.id)

        def fabrica_modelo(cliente, agente):
            self.llamadas.append((cliente.modelo, agente.id))
            return ModeloFalso()

        self.equipo = E.construir_equipo(
            ruta_db=self.dir.name,
            fabrica_cliente=fabrica_cliente,
            fabrica_modelo=fabrica_modelo,
        )

    def test_equipo_de_dos_con_memoria_compartida(self):
        equipo = self.equipo
        self.assertEqual(len(equipo.agentes), 2)
        self.assertTrue(all(a.db is equipo.db for a in equipo.agentes))
        self.assertTrue(all(a.memory_manager is equipo.memoria for a in equipo.agentes))
        self.assertEqual(equipo.ruta, Path(self.dir.name) / E.NOMBRE_DB)

    def test_modelos_del_enrutador_y_trazas_apagadas(self):
        self.assertEqual([m for m, _ in self.llamadas],
                         ["local/agno-planifica", "local/agno-ejecuta"])
        self.assertFalse(self.equipo.team.telemetry)
        self.assertTrue(all(not a.telemetry for a in self.equipo.agentes))

    def test_respuestas_falsas_y_sesiones_en_sqlite(self):
        self.assertEqual(self.equipo.agentes[0].run("hola").content, "respuesta falsa")
        self.assertEqual(self.equipo.responder("equipo"), "respuesta falsa")
        self.assertGreaterEqual(len(self.equipo.db.get_sessions() or []), 2)

    def test_lo_que_escribe_uno_lo_lee_el_otro(self):
        self.equipo.memoria.add_user_memory(
            UserMemory(memory="preferimos SQLite local"), user_id="starseed")
        memorias = self.equipo.agentes[1].memory_manager.get_user_memories(user_id="starseed")
        self.assertEqual([m.memory for m in memorias], ["preferimos SQLite local"])


if __name__ == "__main__":
    unittest.main()
