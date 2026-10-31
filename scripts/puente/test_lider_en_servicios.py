# -*- coding: utf-8 -*-
"""Pruebas del líder en los servicios (rescate RTGUI1021K2-d3).

En main el arriendo de dirección se comprueba al LANZAR las piezas del A1
(`oracle_nodo.guion_direccion`), no dentro de cada servicio. De la rama se rescata
el caso que comprueba que una pasada completa hace todos sus trabajos: curar el
enjambre, buscar y traer capacidad, reparar medidores, relevar a Claude y cuidar el A1.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autocuracion_mando as A  # noqa: E402


class PasadaCompleta(unittest.TestCase):
    """La pasada de autocuración no se salta ningún trabajo cuando toca hacerlo."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="lider-servicios-")
        self.addCleanup(self.tmp.cleanup)
        self._estado, self._publicacion = A.ESTADO, A.PUBLICACION
        A.ESTADO = os.path.join(self.tmp.name, "autocuracion.json")
        A.PUBLICACION = os.path.join(self.tmp.name, "publicacion.json")
        self.hecho = {}

    def tearDown(self):
        A.ESTADO, A.PUBLICACION = self._estado, self._publicacion

    def _apunta(self, clave, valor):
        def fn(*_args, **_kwargs):
            self.hecho[clave] = self.hecho.get(clave, 0) + 1
            return valor
        return fn

    def test_una_pasada_completa_hace_cada_trabajo(self):
        estado = A.revisar(
            ahora=100_000,
            sondear_fn=lambda: True,
            reiniciar_fn=self._apunta("reiniciar", None),
            limpiar_fn=lambda ids: (self._apunta("limpiar", {"ok": True, "limpiados": list(ids)})()),
            libre_fn=lambda: 20.0,
            avisar_fn=lambda _texto: None,
            dormir=lambda _s: None,
            asignar_fn=lambda: ({"puede": False}, lambda: []),
            buscar_fn=self._apunta("buscar", {}),
            traer_fn=self._apunta("traer", True),
            curar_fn=self._apunta("curar", ""),
            medidores_fn=self._apunta("medidores", []),
            worktrees_fn=self._apunta("worktrees", {}),
            reparar_fn=self._apunta("reparar", None),
            explabs_fn=self._apunta("explabs", None),
            relevo_fn=self._apunta("relevo", {}),
            a1_fn=self._apunta("a1", None),
            forzar=True,
        )
        for clave in ("curar", "buscar", "traer", "a1", "reparar", "relevo", "explabs"):
            self.assertEqual(self.hecho.get(clave), 1, clave)
        self.assertIn("hechos", estado)


if __name__ == "__main__":
    unittest.main()
