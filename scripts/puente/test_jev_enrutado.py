"""Pruebas sin red para el envoltorio de enrutado de Jev."""

from __future__ import annotations

import subprocess
import unittest
from collections.abc import Sequence

from jev_enrutado import enrutar, texto_de_tarea


MODELO_ACTUAL = "openrouter/google/gemini-3.6-flash"
TAREA = {
    "titulo": "Corregir el enrutador",
    "archivos": ["scripts/puente/jev_enrutado.py", "src/panel.tsx"],
    "pruebas": True,
}


def resultado(stdout: str, retorno: int = 0) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([], retorno, stdout=stdout, stderr="")


class JevEnrutadoTests(unittest.TestCase):
    def test_texto_de_tarea_resume_sin_incluir_rutas(self) -> None:
        texto = texto_de_tarea(TAREA)

        self.assertEqual(
            texto,
            "Corregir el enrutador. Archivos: 2 (.py, .tsx). Pruebas: sí.",
        )
        self.assertNotIn("scripts/", texto)

    def test_respuesta_buena_traduce_el_modelo(self) -> None:
        comando_recibido: list[str] = []

        def correr(comando: Sequence[str], **_: object) -> subprocess.CompletedProcess[str]:
            comando_recibido.extend(comando)
            return resultado(
                '{"routed": true, "model": '
                '"openrouter:kwaipilot/kat-coder-pro-v2.5", "reason": "medium coding"}'
            )

        modelo, motivo = enrutar(TAREA, MODELO_ACTUAL, correr)

        self.assertEqual(modelo, "openrouter/kwaipilot/kat-coder-pro-v2.5")
        self.assertEqual(motivo, "medium coding")
        self.assertIn("openrouter:google/gemini-3.6-flash", comando_recibido)

    def test_routed_false_conserva_el_modelo(self) -> None:
        def correr(_: Sequence[str], **__: object) -> subprocess.CompletedProcess[str]:
            return resultado('{"routed": false, "reason": "keep current"}')

        modelo, _ = enrutar(TAREA, MODELO_ACTUAL, correr)

        self.assertEqual(modelo, MODELO_ACTUAL)

    def test_json_roto_conserva_el_modelo(self) -> None:
        def correr(_: Sequence[str], **__: object) -> subprocess.CompletedProcess[str]:
            return resultado("esto no es JSON")

        modelo, _ = enrutar(TAREA, MODELO_ACTUAL, correr)

        self.assertEqual(modelo, MODELO_ACTUAL)

    def test_tiempo_agotado_conserva_el_modelo(self) -> None:
        def correr(_: Sequence[str], **__: object) -> subprocess.CompletedProcess[str]:
            raise subprocess.TimeoutExpired("jevkit", 10)

        modelo, _ = enrutar(TAREA, MODELO_ACTUAL, correr)

        self.assertEqual(modelo, MODELO_ACTUAL)

    def test_proveedor_desconocido_conserva_el_modelo(self) -> None:
        def correr(_: Sequence[str], **__: object) -> subprocess.CompletedProcess[str]:
            return resultado(
                '{"routed": true, "model": "ajeno:modelo", "reason": "hard coding"}'
            )

        modelo, motivo = enrutar(TAREA, MODELO_ACTUAL, correr)

        self.assertEqual(modelo, MODELO_ACTUAL)
        self.assertIn("no admitido", motivo)


if __name__ == "__main__":
    unittest.main(verbosity=2)
