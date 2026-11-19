# -*- coding: utf-8 -*-
"""Pruebas del vigía de respaldos de claves (SEG1119B): registros de ejemplo, sin red ni disco real.
Se prueba la interfaz pública con datos sintéticos: el registro diario de `claves-mac-*.gpg` en la
Maggabox, el A1 y Google Drive. Nunca se abre un `.gpg`."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_respaldos as V

DIA = "2026-11-18"
AYER = "2026-11-17"
ARCHIVO = "claves-mac-2026-11-18.gpg"

def fila(dia=DIA, medio="maggabox", archivo=ARCHIVO, huella="aaa111", fecha=None):
    return {"dia": dia, "medio": medio, "archivo": archivo, "huella": huella,
            "fecha": fecha or dia + "T03:00:00Z"}

def tres(huella="aaa111", **cambios):
    filas = [fila(medio=m, huella=huella) for m in V.MEDIOS]
    for m, h in cambios.items():
        for f in filas:
            if f["medio"] == m:
                f["huella"] = h
    return filas

def texto(filas):
    return "\n".join(json.dumps(f, ensure_ascii=False) for f in filas)

class LecturaDelRegistro(unittest.TestCase):
    def test_lee_jsonl_y_traduce_los_nombres_de_medio(self):
        regs = V.registros(texto(tres()) + "\nno es json\n" + json.dumps(fila(archivo="otra.txt")))
        self.assertEqual(len(regs), 3)
        self.assertEqual({r["medio"] for r in regs}, set(V.MEDIOS))

    def test_acepta_alias_y_normaliza_la_huella(self):
        regs = V.registros(texto([fila(medio="oracle", huella="SHA256:AAA111"),
                                  fila(medio="google-drive", huella="bbb222")]))
        self.assertEqual({r["medio"] for r in regs}, {"a1", "drive"})
        self.assertIn("aaa111", {r["huella"] for r in regs})

class ComparacionDeCopias(unittest.TestCase):
    def test_tres_copias_iguales_no_son_anomalia(self):
        self.assertEqual(V.anomalias(V.registros(texto(tres())), DIA), [])

    def test_una_copia_que_falta_se_detecta(self):
        regs = V.registros(texto([f for f in tres() if f["medio"] != "a1"]))
        fallos = V.anomalias(regs, DIA)
        self.assertEqual([(a["medio"], a["clase"]) for a in fallos], [("a1", "falta")])

    def test_una_copia_que_difiere_se_compara_con_la_mayoria(self):
        fallos = V.anomalias(V.registros(texto(tres(drive="bbb222"))), DIA)
        self.assertEqual([(a["medio"], a["clase"]) for a in fallos], [("drive", "difiere")])
        self.assertTrue(fallos[0]["referencia"].startswith("aaa111"))

    def test_la_fecha_tambien_cuenta(self):
        filas = tres()
        for f in filas:
            if f["medio"] == "drive":
                f["fecha"] = DIA + "T05:00:00Z"
        fallos = V.anomalias(V.registros(texto(filas)), DIA)
        self.assertEqual([(a["medio"], a["clase"]) for a in fallos], [("drive", "difiere")])

class DosDiasSeguidos(unittest.TestCase):
    def _dia(self, dia, medio="a1"):
        filas = [f for f in tres() if f["medio"] != medio]
        for f in filas:
            f["dia"], f["fecha"] = dia, dia + "T03:00:00Z"
            f["archivo"] = "claves-mac-%s.gpg" % dia
        return filas

    def test_un_solo_dia_no_avisa(self):
        hoy = V.anomalias(V.registros(texto(self._dia(DIA))), DIA)
        self.assertTrue(hoy)
        self.assertEqual(V.decidir(hoy, {}, DIA)["alertas"], [])

    def test_dos_dias_seguidos_avisa_una_sola_vez(self):
        regs = V.registros(texto(self._dia(AYER) + self._dia(DIA)))
        ayer = V.decidir(V.anomalias(regs, AYER), {}, AYER)
        self.assertEqual(ayer["alertas"], [])
        hoy = V.decidir(V.anomalias(regs, DIA), ayer["estado"], DIA)
        self.assertEqual([a["medio"] for a in hoy["alertas"]], ["a1"])
        self.assertEqual(V.decidir(V.anomalias(regs, DIA), hoy["estado"], DIA)["alertas"], [])

    def test_dias_no_seguidos_no_avisan(self):
        regs = V.registros(texto(self._dia("2026-11-16") + self._dia(DIA)))
        antes = V.decidir(V.anomalias(regs, "2026-11-16"), {}, "2026-11-16")
        self.assertEqual(V.decidir(V.anomalias(regs, DIA), antes["estado"], DIA)["alertas"], [])

class OrdenYAviso(unittest.TestCase):
    def setUp(self):
        self.fallo = V.anomalias(V.registros(texto([f for f in tres() if f["medio"] != "a1"])), DIA)[0]

    def test_orden_exacta_segun_el_medio(self):
        for medio, herramienta in (("maggabox", "rsync"), ("a1", "scp"), ("drive", "cp -p")):
            self.fallo["medio"] = medio
            self.assertIn(herramienta, V.orden(self.fallo))
            self.assertIn(ARCHIVO, V.orden(self.fallo))

    def test_el_aviso_nombra_la_copia_la_orden_y_no_el_contenido(self):
        texto_aviso = V.aviso([self.fallo])
        self.assertIn("dos días seguidos", texto_aviso)
        self.assertIn(ARCHIVO, texto_aviso)
        self.assertIn("orden:", texto_aviso)
        self.assertNotIn("AAA111", texto_aviso.upper())

    def test_la_accion_entra_en_te_toca_a_ti_con_comando(self):
        accion = V.entradas_accion([self.fallo])[0]
        self.assertTrue(accion["id"].startswith("respaldo-"))
        self.assertTrue(accion["comando"])
        self.assertEqual(accion["urgencia"], "alta")
        self.assertIn("Alex", accion["por_que_no_lo_hago_yo"])

if __name__ == "__main__":
    unittest.main()
