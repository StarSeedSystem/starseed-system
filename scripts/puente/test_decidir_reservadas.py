# -*- coding: utf-8 -*-
"""Pruebas JLA1116A: decidir.consultar respeta dominios reservados.

Jev solo puede vetar un "sí" de la regla a "no"; nunca lo contrario.
Si dominio no está reservado, nada cambia."""
import io
import json
import os
import shutil
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)

import decidir as D
import experiencias as E
import jev as J


class JevDoble:
    """Contesta lo que se le programe; None = Jev en silencio."""

    def __init__(self, respuesta=None):
        self.respuesta = respuesta
        self.llamadas = []

    def decidir(self, estado, preguntas, quien=None):
        self.llamadas.append({"estado": estado, "preguntas": preguntas, "quien": quien})
        if callable(self.respuesta):
            return self.respuesta(estado, preguntas)
        return self.respuesta


class JevReservadasDoble:
    """Mock del módulo jev_reservadas para pruebas."""

    RESERVADAS = ("integrar-main", "publicar", "push", "desplegar")

    @classmethod
    def exige_humano(cls, dominio):
        return cls._normalizar(dominio) in cls._RESERVADAS_NORMALIZADAS

    @classmethod
    def _normalizar(cls, dominio):
        partes = dominio.strip().casefold().replace("-", " ").split()
        return "-".join(partes)

    _RESERVADAS_NORMALIZADAS = frozenset(RESERVADAS)


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="decidir-reservadas-")
        self.viejos = {}
        self.parchear(E, "RUTA", os.path.join(self.dir, "experiencias.jsonl"))
        self.parchear(E, "COPIA_DIR", os.path.join(self.dir, "copia"))
        self.parchear(D, "EXP", E)
        self.parchear(D, "JEV_RESERVADAS", JevReservadasDoble)
        self.viejo_env = os.environ.pop("STARSEED_JEV", None)

    def tearDown(self):
        for (obj, attr), valor in self.viejos.items():
            setattr(obj, attr, valor)
        if self.viejo_env is not None:
            os.environ["STARSEED_JEV"] = self.viejo_env
        else:
            os.environ.pop("STARSEED_JEV", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def parchear(self, obj, attr, valor):
        self.viejos.setdefault((obj, attr), getattr(obj, attr))
        setattr(obj, attr, valor)

    def experiencias(self):
        try:
            with open(E.RUTA, encoding="utf-8") as f:
                return [json.loads(l) for l in f if l.strip()]
        except OSError:
            return []


class DominioReservadoSiNo(Base):
    def test_regla_veto_cuando_jev_dice_si_alta_conf_reservado(self):
        """Regla: si Jev dice 'sí' con alta conf (p >= 0.8) y dominio está reservado,
        el resultado debe ser 'no' (veto humano) con medio 'regla' y reservada=True."""
        doble = JevDoble({"q": {"noul": 0.95}, "medio": "openrouter"})
        self.parchear(D, "JEV", doble)
        d = D.consultar("si-no", {}, "¿Integrar?", regla="no", dominio="integrar-main")
        self.assertEqual(d["respuesta"], "no")
        self.assertEqual(d["medio"], "regla")
        self.assertEqual(d.get("reservada"), True)

    def test_jev_dice_no_no_cambia_reservado(self):
        """Regla: si Jev dice 'no' (p < 0.5) y dominio está reservado, conservar 'no'
        con su probabilidad original (veto no convierte no en si)."""
        doble = JevDoble({"q": {"noul": 0.3}, "medio": "openrouter"})
        self.parchear(D, "JEV", doble)
        d = D.consultar("si-no", {}, "¿Integrar?", regla="no", dominio="integrar-main")
        self.assertEqual(d["respuesta"], "no")
        self.assertEqual(d["p"], 0.3)
        self.assertEqual(d["medio"], "openrouter")
        self.assertEqual(d.get("reservada"), True)

    def test_jev_dice_si_prob_intermedio_reservado(self):
        """Regla: si Jev dice 'sí' con prob baja (p < 0.8) y dominio está reservado,
        conservar la respuesta de Jev (el veto solo aplica con alta confianza)."""
        doble = JevDoble({"q": {"noul": 0.6}, "medio": "openrouter"})
        self.parchear(D, "JEV", doble)
        d = D.consultar("si-no", {}, "¿Integrar?", regla="no", dominio="integrar-main")
        self.assertEqual(d["respuesta"], "sí")
        self.assertEqual(d["p"], 0.6)
        self.assertEqual(d["medio"], "openrouter")
        self.assertEqual(d.get("reservada"), True)

    def test_sin_reserva_no_cambia_comportamiento_jev(self):
        """Regla: si dominio no está reservado, nada cambia - comportamiento normal de Jev."""
        doble = JevDoble({"q": {"noul": 0.9}, "medio": "openrouter"})
        self.parchear(D, "JEV", doble)
        d = D.consultar("si-no", {}, "¿Alguna otra cosa?", regla="no", dominio="otros-datos")
        self.assertEqual(d["respuesta"], "sí")
        self.assertEqual(d["medio"], "openrouter")
        self.assertNotEqual(d.get("reservada"), True)


if __name__ == "__main__":
    unittest.main()