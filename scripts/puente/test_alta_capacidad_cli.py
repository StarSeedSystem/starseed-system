# -*- coding: utf-8 -*-
"""Rescate de la rama nube/40112116347 (VAR1021Cd): los casos que main no tiene.

El CLI antiguo `alta-capacidad.py` (cupo por los límites del plan de Claude, 2 Opus a la vez) fue
sustituido a propósito por el carril de sesiones en la nube (`alta-capacidad-nube.py`, ola 1022).
Por eso NO se rescatan los casos de la rama sobre `--json` con cupo del plan, salida humana
«Cupo de Claude», límites (`~/.starseed/limites-claude.json`, lectura vieja) ni rutas por entorno:
es un contrato que main cambió a propósito, y hoy lo cubren por otro camino
`test_alta_capacidad_nube.py`, `test_alta_capacidad_nube_logica.py` y `test_alta_capacidad_logica.py`
(`cupo_nube` con el crédito, `cupo_claude` con la lectura fresca).

Lo que quedaba sin nombre en main: **una tarea VIVA en otro medio (`en_curso`, `reasignada`,
`por_traer`) no es candidata del carril** — lo que Genesis movió al A1, la Mac o el carril de la
nube no se coge por aquí mientras su medio la lleve (no se queda prestado para siempre: eso lo
mira `seguir`; aquí solo se comprueba que no se doble el trabajo) — y **lo ya en marcha llena el
tope de sesiones**: las `vivas` reducen las elegidas hasta los huecos que quedan, y con el tope
lleno no se elige ninguna y el motivo lo dice («sesiones vivas (tope N)»).

Todo puro, como `test_alta_capacidad_nube_logica.py`: sin red, sin disco, sin reloj propio.
"""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import alta_capacidad_nube_logica as L  # noqa: E402

AHORA = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc).timestamp()
CREDITO = {"restante_usd": 250.0, "vence": "2026-11-04T12:00:00+00:00"}


def colas():
    """Las tareas de la cola de alta capacidad, con los ids del fixture de la rama."""
    tareas = [
        {"id": "ALTA", "titulo": "Animación fina", "alta_capacidad": True, "archivos": ["a"]},
        {"id": "TRES", "titulo": "Tres archivos", "archivos": ["a", "b", "c"]},
        {"id": "ENCURSO", "titulo": "La Mac ya la escribe", "archivos": ["a"]},
        {"id": "REAS", "titulo": "Prestada al A1", "archivos": ["a"]},
        {"id": "PORTRAER", "titulo": "La nube ya la trae", "archivos": ["a"]},
        {"id": "FACIL", "titulo": "Fácil", "archivos": ["a"]},
        {"id": "HECHA", "titulo": "Ya integrada", "archivos": ["a"]},
        {"id": "BLOQ", "titulo": "Bloqueada", "archivos": ["a"]},
        {"id": "FALLO", "titulo": "Sin cambios dos veces", "archivos": ["a"]},
    ]
    return [("cola-alta-capacidad.json", tareas)]


def progreso_de_la_rama():
    return {
        "ALTA": {"estado": "pendiente"},
        "TRES": {"estado": "reasignada", "medio": "claude-nube"},
        "ENCURSO": {"estado": "en_curso", "medio": "opencode"},
        "REAS": {"estado": "reasignada", "medio": "a1"},
        "PORTRAER": {"estado": "por_traer"},
        "FACIL": {"estado": "pendiente"},
        "HECHA": {"estado": "commit"},
        "BLOQ": {"estado": "bloqueada"},
        "FALLO": {"estado": "sin_cambios", "intentos_auto": 2},
    }


class VivaEnOtroMedioNoEsCandidata(unittest.TestCase):
    """Caso rescatado: los estados vivos (carril nube / cola viva / Mac) no vuelven a elegirse aquí."""

    def test_solo_lo_pendiente_es_candidata_del_carril(self):
        cands = L.candidatas(colas(), progreso_de_la_rama(), {"sesiones": []}, None, AHORA)
        self.assertEqual([t["id"] for t, _ in cands], ["ALTA", "FACIL"])

    def test_el_carril_elige_lo_pendiente_y_al_primero_lo_opus(self):
        cands = L.candidatas(colas(), progreso_de_la_rama(), {"sesiones": []}, None, AHORA)
        elegidas = L.elegir_auto(cands, vivas=0, max_vivas=4, presupuesto_hoy=99.0, gastado=0.0)
        self.assertEqual([(t["id"], m) for t, _, m, _ in elegidas],
                         [("ALTA", "claude-opus-5-5"), ("FACIL", "sonnet")])
        self.assertEqual(elegidas[0][0]["titulo"], "Animación fina")


class EnMarchaLlenaElTope(unittest.TestCase):
    """Caso rescatado («--en-marcha»): lo que ya corre reduce las elegidas hasta los huecos."""

    def cands(self):
        return L.candidatas(colas(), progreso_de_la_rama(), {"sesiones": []}, None, AHORA)

    def test_una_en_marcha_de_dos_deja_un_hueco(self):
        elegidas = L.elegir_auto(self.cands(), vivas=1, max_vivas=2, presupuesto_hoy=99.0, gastado=0.0)
        self.assertEqual([t["id"] for t, _, _, _ in elegidas], ["ALTA"])

    def test_tope_lleno_no_elige_y_el_motivo_lo_dice(self):
        elegidas = L.elegir_auto(self.cands(), vivas=2, max_vivas=2, presupuesto_hoy=99.0, gastado=0.0)
        self.assertEqual(elegidas, [])
        ok, motivo, presupuesto = L.cupo_nube(CREDITO, AHORA, 2, max_vivas=2)
        self.assertFalse(ok)
        self.assertIn("2 sesiones vivas", motivo)
        self.assertIn("tope 2", motivo)
        self.assertGreater(presupuesto, 0.0)


if __name__ == "__main__":
    unittest.main()
