# -*- coding: utf-8 -*-
"""Reactivador de todos los directores (botón de arriba del Mando, 2026-10-06)."""
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reactivar_mando as R  # noqa: E402

LAUNCHCTL = """PID\tStatus\tLabel
82229\t0\tcom.starseed.mando
-\t0\tcom.starseed.gobernador
-\t-15\tcom.starseed.vigilante
-\t1\tcom.starseed.needle.renovar
123\t0\tcom.apple.otro
"""


class Puras(unittest.TestCase):
    def test_parsear_launchctl_solo_starseed(self):
        d = R.parsear_launchctl(LAUNCHCTL)
        self.assertEqual(d["com.starseed.mando"], (82229, 0))
        self.assertEqual(d["com.starseed.vigilante"], (None, -15))
        self.assertNotIn("com.apple.otro", d)

    def test_persistente(self):
        self.assertTrue(R.es_persistente({"KeepAlive": True, "RunAtLoad": True}))
        self.assertTrue(R.es_persistente({"KeepAlive": {"SuccessfulExit": False}, "RunAtLoad": True}))
        self.assertFalse(R.es_persistente({"RunAtLoad": True, "StartInterval": 60}))
        self.assertFalse(R.es_persistente({"StartCalendarInterval": {"Hour": 3}}))
        self.assertTrue(R.es_persistente({"RunAtLoad": True}))
        self.assertFalse(R.es_persistente(None))

    def test_decidir_servicio(self):
        siempre = {"KeepAlive": True, "RunAtLoad": True}
        self.assertEqual(R.decidir_servicio("x", True, None, -15, siempre)[0], "relanzar")
        self.assertEqual(R.decidir_servicio("x", True, 10, 0, siempre)[0], "ok")
        self.assertEqual(R.decidir_servicio("x", False, None, None, siempre)[0], "avisar")
        periodico = {"StartInterval": 60, "RunAtLoad": True}
        self.assertEqual(R.decidir_servicio("x", True, None, 0, periodico)[0], "ok")
        self.assertEqual(R.decidir_servicio("x", True, None, 1, periodico)[0], "avisar")
        self.assertEqual(R.decidir_servicio("x", True, None, 0, {"_ilegible": True})[0], "avisar")

    def test_resumen(self):
        pasos = [{"estado": "reparado"}, {"estado": "ok"}, {"estado": "ok"}, {"estado": "aviso"}]
        self.assertEqual(R.resumen(pasos), "1 reparado(s) · 1 aviso(s) · 2 bien")
        self.assertEqual(R.resumen([]), "nada que revisar")

    def test_estado_autocuracion(self):
        self.assertEqual(R.estado_autocuracion({"responde": False, "hechos": []}), "fallo")
        self.assertEqual(R.estado_autocuracion({"responde": True, "hechos": ["traer la nube: pasada lanzada"]}), "ok")
        self.assertEqual(R.estado_autocuracion({"responde": True, "hechos": [
            "enjambre: MC1 esperaba(n) proveedor con google pudiendo escribir → orden de refrescar proveedores"]}),
            "reparado")
        self.assertEqual(R.estado_autocuracion({"responde": True, "hechos": ["no pude llenar los huecos: X"]}), "aviso")
        self.assertEqual(R.estado_autocuracion({"responde": True, "hechos": ["disco con 4.0 GB: limpiado npm-cache"]}),
                         "reparado")


class Hecho:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class Servicios(unittest.TestCase):
    def test_relanza_el_persistente_caido_y_avisa_del_resto(self):
        ordenes = []

        def correr(orden, tope_s=30):
            ordenes.append(orden)
            return Hecho(out=LAUNCHCTL) if orden[:2] == ["launchctl", "list"] else Hecho()

        plists = {"com.starseed.mando": {"KeepAlive": True, "RunAtLoad": True},
                  "com.starseed.vigilante": {"KeepAlive": True, "RunAtLoad": True},
                  "com.starseed.gobernador": {"RunAtLoad": True, "StartInterval": 60},
                  "com.starseed.needle.renovar": {"StartInterval": 21600},
                  "com.starseed.astraura": {"KeepAlive": True, "RunAtLoad": True}}
        r = R.paso_servicios(correr=correr, plists_fn=lambda: plists)
        self.assertEqual(r["estado"], "reparado")
        kick = [o for o in ordenes if o[:2] == ["launchctl", "kickstart"]]
        self.assertEqual(len(kick), 1)
        self.assertTrue(kick[0][-1].endswith("/com.starseed.vigilante"))
        self.assertIn("needle.renovar", r["detalle"])
        self.assertIn("astraura: no está cargado", r["detalle"])


class Reactivar(unittest.TestCase):
    def test_un_paso_que_lanza_no_para_a_los_demas_y_se_publica(self):
        guardados, publicados = [], []

        def bien():
            return {"paso": "A", "estado": "ok", "detalle": "vivo"}

        def roto():
            raise RuntimeError("se cayó")

        def reparado():
            return {"paso": "C", "estado": "reparado", "detalle": "relanzado"}

        inf = R.reactivar("boton", pasos=(bien, roto, reparado),
                          guardar=lambda i: guardados.append(dict(i, pasos=list(i["pasos"]))),
                          publicar=publicados.append)
        self.assertFalse(inf["enMarcha"])
        self.assertEqual([p["estado"] for p in inf["pasos"]], ["ok", "fallo", "reparado"])
        self.assertIn("se cayó", inf["pasos"][1]["detalle"])
        self.assertTrue(guardados[0]["enMarcha"])
        self.assertEqual(len(guardados), 5)  # inicio + 3 pasos + final: el botón ve el avance
        self.assertIn("1 reparado(s)", publicados[0])
        self.assertIn("Reactivador de directores (boton)", publicados[0])


if __name__ == "__main__":
    unittest.main()
