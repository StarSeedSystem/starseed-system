"""Prueba de traslado: el flujo de n8n da lo mismo en el motor propio.

§5 de `architecture/puente-propio-flujos.md`: la exportación del 2026-10-11
tiene tres webhooks y los tres tienen que dar lo mismo en el motor propio de
Flujos que en n8n. La sombra corre en una carpeta temporal: los flujos reales
(`starseed_memory_root/flujos`) no se tocan.
"""

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from scripts.puente.flujos import sombra

RAIZ_REPO = Path(__file__).resolve().parents[3]
EXPORT = RAIZ_REPO / "memory/aprendizaje-externos/n8n-export/2026-10-11"
RUTAS = {"starseed-produccion-publicada", "starseed-produccion-pieza-lista",
         "starseed-produccion-revertida"}


def _huellas(raiz: Path) -> set[tuple[str, int, int]]:
    """Los archivos de una carpeta con su fecha y su tamaño: si la sombra la
    tocara, la huella cambiaría."""
    if not raiz.exists():
        return set()
    return {(str(ruta.relative_to(raiz)), ruta.stat().st_mtime_ns, ruta.stat().st_size)
            for ruta in raiz.rglob("*") if ruta.is_file()}


class TrasladoN8nTest(unittest.TestCase):
    """Los tres eventos de la exportación del 2026-10-11, en sombra."""

    def setUp(self) -> None:
        self.temporal = tempfile.TemporaryDirectory()
        self.informe = Path(self.temporal.name) / "sombra.json"
        self.antes = _huellas(RAIZ_REPO / "starseed_memory_root")
        with contextlib.redirect_stdout(io.StringIO()):
            self.codigo = sombra.main(["--exportacion", str(EXPORT), "--informe", str(self.informe)])
        self.despues = _huellas(RAIZ_REPO / "starseed_memory_root")
        self.datos = json.loads(self.informe.read_text(encoding="utf-8"))

    def tearDown(self) -> None:
        self.temporal.cleanup()

    def test_la_orden_termina_en_verde(self) -> None:
        self.assertEqual(self.codigo, 0)

    def test_los_tres_eventos_coinciden(self) -> None:
        self.assertEqual(self.datos["total"], 3)
        self.assertEqual(self.datos["coinciden"], 3)
        self.assertTrue(self.datos["todos_coinciden"])
        for evento in self.datos["eventos"]:
            self.assertTrue(evento["coincide"], evento)
            self.assertEqual(evento["esperado"], evento["obtenido"])
            self.assertEqual(evento["estado"], "completa")

    def test_las_rutas_son_las_de_produccion(self) -> None:
        self.assertEqual({evento["ruta"] for evento in self.datos["eventos"]}, RUTAS)

    def test_el_cuerpo_es_el_de_produccion(self) -> None:
        for evento in self.datos["eventos"]:
            esperado = evento["esperado"]
            self.assertEqual(esperado["sha"], "sombra")
            self.assertEqual(esperado["medios"], ["web", "mando"])
            self.assertEqual(esperado["tareas"], ["T-SOMBRA"])
            self.assertEqual(esperado["datos"], {"nota": "prueba en sombra"})
            self.assertIn(esperado["evento"], {"publicada", "pieza-lista", "revertida"})
            self.assertTrue(esperado["momento"])

    def test_el_flujo_es_el_de_n8n(self) -> None:
        self.assertEqual([flujo["flujo"] for flujo in self.datos["flujos"]],
                         ["starseed-producci-n-puentes"])
        self.assertEqual(self.datos["exportacion"],
                         "memory/aprendizaje-externos/n8n-export/2026-10-11")

    def test_no_toca_los_flujos_reales(self) -> None:
        self.assertEqual(self.antes, self.despues)
