# -*- coding: utf-8 -*-
"""Pruebas del líder de dirección (IND1029B): toma, renovación, caducidad, empate y sin puerta.
HTTP falso detrás del cliente real, con el arriendo en memoria y un gancho por GET para carreras.
"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import puerta_datos_cliente as pdc  # noqa: E402
import lider_direccion as LD  # noqa: E402

T0 = 1_900_000_000.0


def arriendo(dueno, version, caduca, tomado):
    return {"dueno": dueno, "version": version, "caduca": caduca, "tomado": tomado}


class HttpFalso:
    """Lo justo de `/salud` + `/v1/latidos` en memoria; `al_leer` se inyecta tras cada GET."""

    def __init__(self, al_leer=None):
        self.sana = True
        self.latidos = {}
        self.lecturas = self.escrituras = 0
        self.al_leer = al_leer

    def __call__(self, metodo, url, cab, cuerpo=None, timeout=8):
        if not self.sana:
            raise OSError("conexión rechazada a https://datos… con ficha pd_" + "x" * 31)
        if url.endswith("/salud"):
            return 200, {"ok": True}
        if metodo == "GET" and url.split("?")[0].endswith("/v1/latidos"):
            self.lecturas += 1
            self.al_leer and self.al_leer(self.lecturas)
            return 200, {"latidos": list(self.latidos.values())}
        if metodo == "POST" and url.endswith("/v1/latidos"):
            c = cuerpo if isinstance(cuerpo, dict) else {}
            self.escrituras += 1
            self.latidos[c.get("id")] = dict(id=c.get("id"), clase=c.get("clase"), t=0, datos=c.get("datos"))
            return 200, {"ok": True, "n": 1}
        return 404, {"error": "ruta desconocida"}


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="lider-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.reconstruir()

    def reconstruir(self):
        self.f = HttpFalso(getattr(self, "_al_leer", None))
        self.p = pdc.Puerta(url="https://puerta.prueba", ficha="pd_" + "f" * 43, http=self.f,
                            ahora=lambda: T0, cola=os.path.join(self.dir, "cola.jsonl"))


class ConPuerta(Base):
    def poner(self, dueno, version, caduca, tomado):
        lat = arriendo(dueno, version, caduca, tomado)
        self.f.latidos[LD.ID] = {"id": LD.ID, "clase": LD.CLASE, "t": 0, "datos": lat}

    def test_toma_y_nada_de_dos_lideres(self):
        r = LD.renovar("mac-1", T0, self.p)
        self.assertTrue(r["soy"] and r["escrito"] and r["arriendo"]["version"] == 1)
        self.assertEqual(LD.soy_lider("mac-1", T0 + 30, self.p)["motivo"], "líder vigente")
        ajena = LD.renovar("mac-2", T0 + 30, self.p)  # la «neurona siguiente» la respeta si está vigente
        self.assertFalse(ajena["soy"] or ajena["escrito"])
        self.assertEqual(ajena["motivo"], "dueño: mac-1")

    def test_renovacion_cada_60_s_alarga_y_avanza_la_version(self):
        LD.renovar("mac-1", T0, self.p)
        r = LD.renovar("mac-1", T0 + LD.RENOVA_S, self.p)
        self.assertTrue(r["soy"] and r["escrito"])
        self.assertEqual((r["arriendo"]["version"], r["arriendo"]["caduca"]), (2, T0 + LD.RENOVA_S + LD.CADUCA_S))

    def test_caducidad_lo_toma_la_neurona_siguiente(self):
        LD.renovar("mac-1", T0, self.p)
        self.assertFalse(LD.soy_lider("mac-1", T0 + 200, self.p)["soy"])  # caducó: no se cree líder
        r = LD.renovar("neurona-9", T0 + 200, self.p)  # la fila del rango «otras» ya está cumplida
        self.assertTrue(r["soy"] and r["escrito"])
        self.assertEqual((r["arriendo"]["dueno"], r["arriendo"]["version"]), ("neurona-9", 2))

    def test_prioridad_a1_reclama_en_puerta(self):
        self.poner("neurona-9", 1, T0 + 170, T0 - 10)
        r = LD.renovar("a1", T0, self.p)
        self.assertTrue(r["soy"] and r["escrito"] and "peor prioridad" in r["motivo"])

    def test_sin_puerta_o_sin_red_sigue_lider_local_y_no_encola(self):
        vacia = pdc.Puerta(url="", ficha="", http=self.f, cola=os.path.join(self.dir, "otra.jsonl"))
        self.assertTrue(LD.soy_lider("mac-1", T0, vacia)["soy"] and LD.renovar("mac-1", T0, vacia)["soy"])
        self.f.sana = False
        caida = LD.soy_lider("mac-1", T0, self.p)
        self.assertTrue(caida["soy"] and "sin puerta o sin red" in caida["motivo"])
        self.assertTrue(LD.renovar("mac-1", T0, self.p)["soy"])
        self.assertFalse(os.path.exists(self.p.cola))  # el arriendo NO se encola para reenviarlo luego

    def test_empate_otro_aterriza_despues_y_lo_descubre_al_releer(self):
        self._al_leer = lambda n: self.poner("mac-2", 2, T0 + 150, T0) if n == 3 else None
        self.reconstruir()
        r = LD.renovar("mac-1", T0, self.p)
        self.assertFalse(r["soy"] or r["escrito"])
        self.assertEqual(r["motivo"], "dueño: mac-2")
        self.assertFalse(LD.soy_lider("mac-1", T0, self.p)["soy"])  # y luego ya se sabe

    def test_el_arriendo_cambio_al_leerlo_y_no_escribe(self):
        self._al_leer = lambda n: self.poner("mac-2", 1, T0 + 150, T0) if n > 1 else None
        self.reconstruir()
        r = LD.renovar("mac-1", T0, self.p)
        self.assertFalse(r["soy"] or r["escrito"])
        self.assertEqual(r["motivo"], "dueño: mac-2")
        self.assertEqual(self.f.escrituras, 0)  # escritura condicional: solo escribe si la versión coincide


if __name__ == "__main__":
    unittest.main()
