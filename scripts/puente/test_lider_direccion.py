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
VIGORA = {"presion": None, "swap_pct": 0.0, "genesis_tarda": 0.0}  # medidas sanas, inyectadas


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

    def ruta_prueba(self):
        """La marca del A1 apuntada a un archivo de la prueba (el entorno manda y se restaura al salir)."""
        ruta = os.path.join(self.dir, "visto-a1.json")
        os.environ["STARSEED_LIDER_VISTO"] = ruta
        self.addCleanup(os.environ.pop, "STARSEED_LIDER_VISTO", None)
        return ruta


class Ahogadas(Base):
    """Neurona ahogada (LID1101A): pureza de `ahogada`/`cede_local` y la marca local del A1."""

    def test_la_ahogada_es_presion_swap_o_genesis_callada(self):
        self.assertTrue(LD.ahogada(presion=2))
        self.assertTrue(LD.ahogada(swap_pct=90.5))
        self.assertTrue(LD.ahogada(genesis_tarda=11.0))
        self.assertFalse(LD.ahogada(presion=1.9, swap_pct=90.0, genesis_tarda=10.0))
        self.assertFalse(LD.ahogada())  # sin medidas no se declara ahogada

    def test_cede_local_solo_con_el_a1_reciente(self):
        self.assertTrue(LD.cede_local(T0 - 599, T0))
        self.assertFalse(LD.cede_local(T0 - 600, T0))  # justo 10 min no alcanza
        self.assertFalse(LD.cede_local(0, T0))  # sin marca: líder en local, como hoy
        self.assertFalse(LD.cede_local(None, T0))
        self.assertFalse(LD.cede_local(T0 + 10, T0))  # una marca futura no vale

    def test_marca_local_del_a1(self):
        self.ruta_prueba()
        LD._anotar_visto({"dueno": "a1", "caduca": T0 + 180}, T0 - 60)
        self.assertEqual(LD._visto_a1(), T0 - 60)
        LD._anotar_visto({"dueno": "mac-1", "caduca": T0 + 180}, T0 - 30)
        self.assertEqual(LD._visto_a1(), T0 - 60)  # solo un dueño de rango `a1` se anota
        LD._anotar_visto({"dueno": "a1", "caduca": T0 - 10}, T0)
        self.assertEqual(LD._visto_a1(), T0 - 60)  # ni el A1 con el arriendo ya caducado
        LD._anotar_visto(None, T0)
        self.assertEqual(LD._visto_a1(), T0 - 60)


class ConPuerta(Base):
    def poner(self, dueno, version, caduca, tomado):
        lat = arriendo(dueno, version, caduca, tomado)
        self.f.latidos[LD.ID] = {"id": LD.ID, "clase": LD.CLASE, "t": 0, "datos": lat}

    def test_toma_y_nada_de_dos_lideres(self):
        r = LD.renovar("mac-1", T0, self.p, VIGORA)
        self.assertTrue(r["soy"] and r["escrito"] and r["arriendo"]["version"] == 1)
        self.assertEqual(LD.soy_lider("mac-1", T0 + 30, self.p, VIGORA)["motivo"], "líder vigente")
        ajena = LD.renovar("mac-2", T0 + 30, self.p, VIGORA)  # la «neurona siguiente» la respeta si está vigente
        self.assertFalse(ajena["soy"] or ajena["escrito"])
        self.assertEqual(ajena["motivo"], "dueño: mac-1")

    def test_renovacion_cada_60_s_alarga_y_avanza_la_version(self):
        LD.renovar("mac-1", T0, self.p, VIGORA)
        r = LD.renovar("mac-1", T0 + LD.RENOVA_S, self.p, VIGORA)
        self.assertTrue(r["soy"] and r["escrito"])
        self.assertEqual((r["arriendo"]["version"], r["arriendo"]["caduca"]), (2, T0 + LD.RENOVA_S + LD.CADUCA_S))

    def test_caducidad_lo_toma_la_neurona_siguiente(self):
        LD.renovar("mac-1", T0, self.p, VIGORA)
        self.assertFalse(LD.soy_lider("mac-1", T0 + 200, self.p, VIGORA)["soy"])  # caducó: no se cree líder
        r = LD.renovar("neurona-9", T0 + 200, self.p, VIGORA)  # la fila del rango «otras» ya está cumplida
        self.assertTrue(r["soy"] and r["escrito"])
        self.assertEqual((r["arriendo"]["dueno"], r["arriendo"]["version"]), ("neurona-9", 2))

    def test_prioridad_a1_reclama_en_puerta(self):
        self.poner("neurona-9", 1, T0 + 170, T0 - 10)
        r = LD.renovar("a1", T0, self.p, VIGORA)
        self.assertTrue(r["soy"] and r["escrito"] and "peor prioridad" in r["motivo"])

    def test_sin_puerta_o_sin_red_sigue_lider_local_y_no_encola(self):
        self.ruta_prueba()  # sin marca del A1, como hoy
        vigora = {"presion": None, "swap_pct": 0.0, "genesis_tarda": 0.0}
        vacia = pdc.Puerta(url="", ficha="", http=self.f, cola=os.path.join(self.dir, "otra.jsonl"))
        self.assertTrue(LD.soy_lider("mac-1", T0, vacia, vigora)["soy"] and LD.renovar("mac-1", T0, vacia, vigora)["soy"])
        self.f.sana = False
        caida = LD.soy_lider("mac-1", T0, self.p, vigora)
        self.assertTrue(caida["soy"] and "sin puerta o sin red" in caida["motivo"])
        self.assertTrue(LD.renovar("mac-1", T0, self.p, vigora)["soy"])
        self.assertFalse(os.path.exists(self.p.cola))  # el arriendo NO se encola para reenviarlo luego

    def test_la_ahogada_no_toma_ni_renueva_y_ni_mira(self):
        rana = {"presion": 2.0, "swap_pct": 0.0, "genesis_tarda": 0.0}
        ahogo = LD.renovar("mac-1", T0, self.p, rana)
        self.assertFalse(ahogo["soy"] or ahogo["escrito"])
        self.assertIn("ahogada", ahogo["motivo"])
        self.assertEqual((self.f.lecturas, self.f.escrituras), (0, 0))  # ni siquiera mira la puerta
        self.assertFalse(LD.soy_lider("mac-1", T0, self.p, rana)["soy"])

    def test_sin_puerta_con_el_a1_reciente_no_se_declara_lider_local(self):
        self.ruta_prueba()
        LD._anotar_visto({"dueno": "a1", "caduca": T0 + 300}, T0 - 60)
        vigora = {"presion": None, "swap_pct": 0.0, "genesis_tarda": 0.0}
        vacia = pdc.Puerta(url="", ficha="", http=self.f, cola=os.path.join(self.dir, "otra.jsonl"))
        self.assertFalse(LD.soy_lider("mac-1", T0, vacia, vigora)["soy"])
        self.assertIn("el A1 latía", LD.soy_lider("mac-1", T0, vacia, vigora)["motivo"])
        Ahogado = LD.renovar("mac-1", T0, vacia, vigora)
        self.assertFalse(Ahogado["soy"] or Ahogado["escrito"])
        self.assertIn("el A1 latía", Ahogado["motivo"])

    def test_empate_otro_aterriza_despues_y_lo_descubre_al_releer(self):
        self._al_leer = lambda n: self.poner("mac-2", 2, T0 + 150, T0) if n == 3 else None
        self.reconstruir()
        r = LD.renovar("mac-1", T0, self.p, VIGORA)
        self.assertFalse(r["soy"] or r["escrito"])
        self.assertEqual(r["motivo"], "dueño: mac-2")
        self.assertFalse(LD.soy_lider("mac-1", T0, self.p, VIGORA)["soy"])  # y luego ya se sabe

    def test_el_arriendo_cambio_al_leerlo_y_no_escribe(self):
        self._al_leer = lambda n: self.poner("mac-2", 1, T0 + 150, T0) if n > 1 else None
        self.reconstruir()
        r = LD.renovar("mac-1", T0, self.p, VIGORA)
        self.assertFalse(r["soy"] or r["escrito"])
        self.assertEqual(r["motivo"], "dueño: mac-2")
        self.assertEqual(self.f.escrituras, 0)  # escritura condicional: solo escribe si la versión coincide


if __name__ == "__main__":
    unittest.main()
