# -*- coding: utf-8 -*-
"""Pruebas del líder de dirección: toma, renovación, caducidad, empate, ahogo y sin puerta."""
import os, shutil, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import puerta_datos_cliente as pdc
import lider_direccion as LD
import lider_direccion_salud as S

T0 = 1_900_000_000.0
SANA = {"presion": 1, "swap_pct": 10.0, "genesis": True}
AHOGADA = {"presion": 2, "swap_pct": 10.0, "genesis": True}


def arriendo(dueno, version, caduca, tomado):
    return {"dueno": dueno, "version": version, "caduca": caduca, "tomado": tomado}


class HttpFalso:
    def __init__(self, al_leer=None):
        self.sana, self.latidos, self.lecturas, self.escrituras = True, {}, 0, 0
        self.al_leer = al_leer

    def __call__(self, metodo, url, cab, cuerpo=None, timeout=8):
        if not self.sana:
            raise OSError("conexión rechazada a https://datos… con ficha pd_" + "x" * 31)
        if url.endswith("/salud"):
            return 200, {"ok": True}
        c = cuerpo if isinstance(cuerpo, dict) else {}
        if metodo == "GET" and url.split("?")[0].endswith("/v1/latidos"):
            self.lecturas += 1
            self.al_leer and self.al_leer(self.lecturas)
            return 200, {"latidos": list(self.latidos.values())}
        if metodo == "POST" and url.endswith("/v1/latidos"):
            self.escrituras += 1
            self.latidos[c.get("id")] = dict(id=c.get("id"), clase=c.get("clase"), t=0, datos=c.get("datos"))
            return 200, {"ok": True, "n": 1}
        return 404, {"error": "ruta desconocida"}


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="lider-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self._orig = LD.medir_salud, LD.leer_oracle
        self.addCleanup(lambda: (setattr(LD, "medir_salud", self._orig[0]), setattr(LD, "leer_oracle", self._orig[1])))
        LD.medir_salud, LD.leer_oracle = lambda **_: dict(SANA), lambda: {}
        self.reconstruir()

    def reconstruir(self):
        self.f = HttpFalso(getattr(self, "_al_leer", None))
        self.p = pdc.Puerta(url="https://puerta.prueba", ficha="pd_" + "f" * 43, http=self.f, ahora=lambda: T0,
                            cola=os.path.join(self.dir, "cola.jsonl"))


class ConPuerta(Base):
    def poner(self, dueno, version, caduca, tomado):
        self.f.latidos[LD.ID] = {"id": LD.ID, "clase": LD.CLASE, "t": 0,
                                 "datos": arriendo(dueno, version, caduca, tomado)}

    def test_toma_y_nada_de_dos_lideres(self):
        r = LD.renovar("mac-1", T0, self.p)
        self.assertTrue(r["soy"] and r["escrito"] and r["arriendo"]["version"] == 1)
        self.assertEqual(LD.soy_lider("mac-1", T0 + 30, self.p)["motivo"], "líder vigente")
        ajena = LD.renovar("mac-2", T0 + 30, self.p)
        self.assertFalse(ajena["soy"] or ajena["escrito"])
        self.assertEqual(ajena["motivo"], "dueño: mac-1")

    def test_renovacion_cada_60_s_alarga_y_avanza_la_version(self):
        LD.renovar("mac-1", T0, self.p)
        r = LD.renovar("mac-1", T0 + LD.RENOVA_S, self.p)
        self.assertTrue(r["soy"] and r["escrito"])
        self.assertEqual((r["arriendo"]["version"], r["arriendo"]["caduca"]), (2, T0 + LD.RENOVA_S + LD.CADUCA_S))

    def test_caducidad_lo_toma_la_neurona_siguiente(self):
        LD.renovar("mac-1", T0, self.p)
        self.assertFalse(LD.soy_lider("mac-1", T0 + 200, self.p)["soy"])
        r = LD.renovar("neurona-9", T0 + 200, self.p)
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
        self.assertFalse(os.path.exists(self.p.cola))

    def test_empate_otro_aterriza_despues_y_lo_descubre_al_releer(self):
        self._al_leer = lambda n: self.poner("mac-2", 2, T0 + 150, T0) if n == 3 else None
        self.reconstruir()
        r = LD.renovar("mac-1", T0, self.p)
        self.assertFalse(r["soy"] or r["escrito"])
        self.assertEqual(r["motivo"], "dueño: mac-2")
        self.assertFalse(LD.soy_lider("mac-1", T0, self.p)["soy"])

    def test_el_arriendo_cambio_al_leerlo_y_no_escribe(self):
        self._al_leer = lambda n: self.poner("mac-2", 1, T0 + 150, T0) if n > 1 else None
        self.reconstruir()
        r = LD.renovar("mac-1", T0, self.p)
        self.assertFalse(r["soy"] or r["escrito"])
        self.assertEqual(r["motivo"], "dueño: mac-2")
        self.assertEqual(self.f.escrituras, 0)

    def test_ahogada_no_toma_ni_renueva_y_no_escribe(self):
        self.poner("mac-1", 1, T0 + 100, T0)
        LD.medir_salud = lambda **_: dict(AHOGADA)
        r = LD.renovar("mac-1", T0, self.p)
        self.assertFalse(r["soy"] or r["escrito"])
        self.assertIn("ahogada", r["motivo"])
        self.assertEqual(self.f.escrituras, 0)
        self.assertFalse(LD.soy_lider("mac-1", T0, self.p)["soy"])

    def test_sin_puerta_con_el_a1_latiendo_no_dirige_en_local(self):
        LD.leer_oracle = lambda: {"nodo": {"latido": T0 - 120}}
        self.f.sana = False
        self.assertFalse(LD.soy_lider("mac-1", T0, self.p)["soy"])
        self.assertFalse(LD.renovar("mac-1", T0, self.p)["soy"])
        self.assertFalse(os.path.exists(self.p.cola))

    def test_sin_puerta_con_el_a1_callado_sigue_lider_local(self):
        LD.leer_oracle = lambda: {"nodo": {"latido": T0 - 1200}}
        self.f.sana = False
        self.assertTrue(LD.soy_lider("mac-1", T0, self.p)["soy"])
        self.assertTrue(LD.renovar("mac-1", T0, self.p)["soy"])

    def test_la_a1_no_se_frena_por_su_propio_latido(self):
        LD.leer_oracle = lambda: {"nodo": {"latido": T0 - 60}}
        self.f.sana = False
        self.assertTrue(LD.renovar("oracle-a1-abc", T0, self.p)["soy"])


class Reglas(unittest.TestCase):
    def test_ahogada_por_presion_swap_o_genesis(self):
        self.assertTrue(S.ahogada(2, 10))
        self.assertTrue(S.ahogada(1, 91))
        self.assertTrue(S.ahogada(1, 10, False))
        self.assertFalse(S.ahogada(1, 90, True))
        self.assertFalse(S.ahogada(None, None, True))

    def test_a1_late_solo_dentro_de_la_ventana(self):
        self.assertTrue(S.a1_late({"nodo": {"latido": T0 - 599}}, T0))
        self.assertFalse(S.a1_late({"nodo": {"latido": T0 - 601}}, T0))
        self.assertFalse(S.a1_late({}, T0))
        self.assertFalse(S.a1_late(None, T0))

    def test_lider_local_cede_ante_ahogo_o_a1_vivo(self):
        self.assertFalse(LD.lider_local(True, False)[0])
        self.assertFalse(LD.lider_local(False, True)[0])
        self.assertTrue(LD.lider_local(False, False)[0])


if __name__ == "__main__":
    unittest.main()
