# -*- coding: utf-8 -*-
"""OPS1031A · El vigilante no relanza el orquestador si dirige otra neurona.

Misma regla que la autocuración y la autopublicación (IND1029Cb): `decidir_lider` sobre el
arriendo de dirección solo leído. El líder va siempre inyectado o con dobles: nada pregunta a la
puerta real, nada lanza procesos y el bucle de `main()` se corta en su primer `sleep`."""

import contextlib, importlib.util, io, os, sys, time, unittest
from unittest import mock

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import autocuracion_mando  # noqa: E402
import lider_direccion  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "vigilante_enjambre_lider", os.path.join(DIRECTORIO, "vigilante-enjambre.py")
)
vig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vig)

T0 = 1_800_000_000.0
OTRA = "neurona-a1"


def otra_dirige(ahora=T0):
    return {"soy": False, "motivo": "dueño: %s" % OTRA, "arriendo": {"dueno": OTRA, "caduca": ahora + 120}}


class _Fin(BaseException):
    """Corta el `while True` de main() en su primer sleep (main solo atrapa Exception)."""


class DirijoTest(unittest.TestCase):
    def _dirijo(self, lider_fn):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            return vig._dirijo(lider_fn, T0), salida.getvalue()

    def test_otra_neurona_con_arriendo_vigente_no_relanza_y_lo_dice(self):
        dirijo, log = self._dirijo(otra_dirige)
        self.assertFalse(dirijo)
        self.assertIn("vigilante: espera: dirige %s: no relanzo el orquestador" % OTRA, log)

    def test_soy_lider_sin_puerta_o_con_arriendo_caducado_como_hoy(self):
        caducado = {"soy": False, "motivo": "libre", "arriendo": {"dueno": OTRA, "caduca": T0 - 1}}
        for lider in ({"soy": True, "motivo": "líder en local"}, caducado, {"soy": False}, None):
            dirijo, log = self._dirijo(lambda lider=lider: lider)
            self.assertTrue(dirijo, lider)
            self.assertEqual(log, "")

    def test_si_algo_falla_devuelve_true(self):
        def rota():
            raise OSError("sin red")

        self.assertTrue(self._dirijo(rota)[0])
        with mock.patch.object(autocuracion_mando, "decidir_lider", side_effect=ValueError("x")):
            self.assertTrue(self._dirijo(otra_dirige)[0])

    def test_por_defecto_lee_el_arriendo_de_lider_direccion(self):
        with mock.patch.object(lider_direccion, "soy_lider", side_effect=otra_dirige) as soy:
            self.assertFalse(vig._dirijo(ahora=T0))
        soy.assert_called_once_with()


class MainTest(unittest.TestCase):
    """main() con todo lo que toca disco, red o procesos sustituido por dobles."""

    def _una_pasada(self, **parches):
        lanzar, decir = mock.Mock(return_value="cola-auto-prueba"), mock.Mock()
        with contextlib.ExitStack() as pila:
            for nombre, valor in {
                "orquestador_vivo": lambda: False, "barrer_cerrojos": lambda: None,
                "pendientes": lambda: [{"id": "T1"}, {"id": "T2"}], "lanzar": lanzar,
                "comprobar_arranque": lambda: None, **parches,
            }.items():
                pila.enter_context(mock.patch.object(vig, nombre, valor))
            pila.enter_context(mock.patch.object(vig.higiene_colas, "higiene", return_value=[]))
            pila.enter_context(mock.patch.object(vig.higiene_worktrees, "podar", return_value=[]))
            pila.enter_context(mock.patch.object(
                vig.config_director, "cargar", return_value=({"trabajadores": 3, "tope_por_relanzamiento": 20}, [])))
            pila.enter_context(mock.patch.object(vig._p, "decir", decir))
            pila.enter_context(mock.patch.object(vig.time, "sleep", side_effect=_Fin))
            pila.enter_context(contextlib.redirect_stdout(io.StringIO()))
            with self.assertRaises(_Fin):
                vig.main()
        return lanzar, " | ".join(str(c.args[0]) for c in decir.call_args_list)

    def test_si_dirijo_relanza_como_hoy(self):
        lanzar, dicho = self._una_pasada(_dirijo=lambda: True)
        lanzar.assert_called_once_with([{"id": "T1"}, {"id": "T2"}], 3)
        self.assertIn("relanzo con 2", dicho)

    def test_si_dirige_otra_neurona_no_relanza_ni_dice_que_no_hay_trabajo(self):
        # La regla real de punta a punta; el arriendo caduca respecto al reloj real de main().
        with mock.patch.object(lider_direccion, "soy_lider", side_effect=lambda: otra_dirige(time.time())):
            lanzar, dicho = self._una_pasada()
        lanzar.assert_not_called()
        self.assertNotIn("NO queda trabajo", dicho)
        self.assertNotIn("relanzo con", dicho)

    def test_con_el_orquestador_vivo_ni_pregunta_por_el_lider(self):
        dirijo, atasco = mock.Mock(return_value=True), mock.Mock(curar=lambda: {"accion": "nada"})
        with mock.patch.dict(sys.modules, {"atasco_orquestador": atasco}):
            lanzar, _ = self._una_pasada(
                orquestador_vivo=lambda: True, _dirijo=dirijo, matar_colgados=lambda: None,
                alimentar_tanda_viva=lambda: None)
        dirijo.assert_not_called()
        lanzar.assert_not_called()


if __name__ == "__main__":
    unittest.main()
