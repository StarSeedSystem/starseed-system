# -*- coding: utf-8 -*-
"""La puerta tsc de la Mac viaja al A1 cuando puede (TRA1012Bc-d1).

Pruebas con la función remota FALSA (sin red): verde remoto no lanza tsc local, rojo remoto
devuelve los errores en el mismo formato de «error TS» para la reparación automática y, si el
A1 no puede (del medio), se cae al tsc local de siempre.
"""
import contextlib
import importlib.util
import os
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

GIT_FALSO = ((0, "sha-main-del-worktree"), (0, "sha1\nsha2\n"), (0, "a.ts\n"))


def _tsc(remoto, salidas_sh=GIT_FALSO + ((0, ""),), tid="TRA1012Bc-d1"):
    """Corre `enjambre.tsc` con el medio remoto falso y sin red: `remoto` es la función falsa
    de `comprobar_en_a1.comprobar` (o un callable que revienta); `salidas_sh` es el orden de
    las respuestas del `sh` falso (3 git del pedido + lo que la Mac ejecute de más)."""
    llamadas = []

    def falso_sh(cmd, cwd=None, timeout=None, env=None, log=None):
        llamadas.append(" ".join(cmd) if isinstance(cmd, list) else cmd)
        respuestas = list(salidas_sh)
        return respuestas[len(llamadas) - 1 if len(llamadas) <= len(respuestas) else -1]

    with mock.patch.dict(os.environ, {"STARSEED_MEDIO": "mac"}), \
            mock.patch("os.path.isfile", return_value=True), \
            mock.patch.object(enjambre, "repo_es_python", return_value=False), \
            mock.patch.object(enjambre, "_COMPROBAR_A1", remoto), \
            mock.patch.object(enjambre, "sh", side_effect=falso_sh), \
            mock.patch.object(
                enjambre, "cerrojo",
                side_effect=lambda *_a, **_k: contextlib.nullcontext(),
            ), \
            mock.patch.object(enjambre, "evento"):
        resultado = enjambre.tsc("/tmp/wt/" + tid, None, tid=tid or None)
    return resultado, llamadas


def _comprobar_falso(ok, detalle, del_medio, visto=None):
    def falso(base, shas, cambiados, timeout=900, cwd=None):
        if visto is not None:
            visto.update(base=base, shas=shas, cambiados=cambiados, cwd=cwd)
        return ok, detalle, del_medio

    return falso


class PuertaRemota(unittest.TestCase):
    def test_verde_remoto_no_lanza_tsc_local(self):
        """El A1 contesta verde: la Mac no paga ningún tsc."""
        (rc, errs), llamadas = _tsc(_comprobar_falso(True, "tsc en verde en el A1 (43 s)", False))
        self.assertEqual((rc, errs), (0, []))
        self.assertFalse(any("npx tsc" in l for l in llamadas))
        self.assertEqual(enjambre.nota_tsc(), ("A1", 0.0))

    def test_rojo_remoto_devuelve_los_errores_en_formato_reparacion(self):
        """Rojo del A1: líneas «error TS» igual que las que devolvería el tsc de la Mac."""
        detalle = (
            "en el A1: tsc: src/x.ts(1,1): error TS2304: el nombre no existe\n(por el medio)"
        )
        (rc, errs), llamadas = _tsc(_comprobar_falso(False, detalle, False))
        self.assertEqual(rc, 1)
        self.assertEqual(errs, ["src/x.ts(1,1): error TS2304: el nombre no existe"])
        self.assertFalse(any("npx tsc" in l for l in llamadas))
        self.assertEqual(enjambre.nota_tsc()[0], "A1")

    def test_medio_remoto_cae_al_local(self):
        """A1 ocupado o sin respuesta («del medio»): el tsc local se paga en la Mac como hoy."""
        (rc, errs), llamadas = _tsc(
            _comprobar_falso(False, "A1: A1 no responde", True), GIT_FALSO + ((0, ""),)
        )
        self.assertEqual((rc, errs), (0, []))
        self.assertTrue(any("npx tsc" in l for l in llamadas))
        self.assertEqual(enjambre.nota_tsc()[0], "Mac")

    def test_medio_remoto_reventando_tambien_cae_al_local(self):
        """Si pedir al A1 revienta (SSH, git), la puerta local sigue en pie."""
        def remoto_que_revienta(*_a, **_k):
            raise RuntimeError("ssh: Connection refused 10.0.0.5")

        (rc, errs), llamadas = _tsc(remoto_que_revienta, GIT_FALSO + ((0, ""),))
        self.assertEqual((rc, errs), (0, []))
        self.assertTrue(any("npx tsc" in l for l in llamadas))
        self.assertEqual(enjambre.nota_tsc()[0], "Mac")

    def test_peticion_lleva_base_shas_cambiados_y_worktree(self):
        """El pedido: base = main del worktree, shas = commits de la tarea, el worktree como cwd."""
        visto = {}
        _tsc(_comprobar_falso(True, "verde", False, visto))
        self.assertEqual(visto["base"], "sha-main-del-worktree")
        self.assertEqual(visto["shas"], ["sha1", "sha2"])
        self.assertEqual(visto["cambiados"], ["a.ts"])
        self.assertEqual(visto["cwd"], "/tmp/wt/TRA1012Bc-d1")

    def test_sin_tid_la_verificacion_de_main_no_viaja(self):
        """La verificación final sobre main no es una puerta de tarea: nada se pide al A1."""
        falso = mock.Mock(side_effect=(True, "verde", False))
        salidas = [(0, "")]

        def falso_sh(cmd, cwd=None, timeout=None, env=None, log=None):
            return salidas[-1]

        enjambre._nota_tsc("Mac")
        with mock.patch.dict(os.environ, {"STARSEED_MEDIO": "mac"}), \
                mock.patch("os.path.isfile", return_value=True), \
                mock.patch.object(enjambre, "repo_es_python", return_value=False), \
                mock.patch.object(enjambre, "_COMPROBAR_A1", falso), \
                mock.patch.object(enjambre, "sh", side_effect=falso_sh), \
                mock.patch.object(
                    enjambre, "cerrojo",
                    side_effect=lambda *_a, **_k: contextlib.nullcontext(),
                ):
            rc, errs = enjambre.tsc("/tmp/main-de-verificacion", None)
        self.assertEqual((rc, errs), (0, []))
        falso.assert_not_called()
        self.assertEqual(enjambre.nota_tsc()[0], "Mac")


if __name__ == "__main__":
    unittest.main()
