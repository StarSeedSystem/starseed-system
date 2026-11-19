# -*- coding: utf-8 -*-
"""Pruebas del vigía de respaldos de claves (SEG1119B).

Herméticas: no leen claves, no abren archivos `.gpg`, no tocan la red ni el disco real.
Todo entra como texto de registro y se comprueba con `evaluar`, que es pura.
"""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_respaldos as V  # noqa: E402

HOY = dt.date(2026, 11, 19)
AYER = dt.date(2026, 11, 18)
ARCHIVO = "claves-mac-2026-11-18.gpg"
H1 = "sha256:" + "a" * 64
H2 = "sha256:" + "b" * 64


def log(*lineas):
    return "\n".join(lineas)


def linea(copia, huella=H1, archivo=ARCHIVO, fecha="2026-11-18T03:10:00Z", orden=None):
    extra = ' orden="%s"' % orden if orden else ""
    return ("%s copia=%s archivo=%s huella=%s bytes=4096%s"
            % (fecha, copia, archivo, huella, extra))


class ParsearLog(unittest.TestCase):
    def test_lineas_clave_valor(self):
        regs = V.parsear_log(log(linea("maggabox"), linea("a1"), linea("gdrive")))
        self.assertEqual(3, len(regs))
        self.assertEqual({"maggabox", "a1", "gdrive"}, {r["copia"] for r in regs})
        self.assertEqual(ARCHIVO, regs[0]["archivo"])
        self.assertEqual(H1, regs[0]["huella"])
        self.assertEqual(dt.datetime(2026, 11, 18, 3, 10, tzinfo=dt.timezone.utc),
                         regs[0]["fecha"])

    def test_json_y_alias_de_copia(self):
        regs = V.parsear_log('{"fecha":"2026-11-18T03:10:00","copia":"Google Drive",'
                             '"archivo":"%s","huella":"%s"}' % (ARCHIVO, H1))
        self.assertEqual(1, len(regs))
        self.assertEqual("gdrive", regs[0]["copia"])

    def test_ignora_rotas_y_archivos_ajenos(self):
        regs = V.parsear_log(log(
            "esto no es una línea de respaldo",
            linea("a1", archivo="otras-claves-2026-11-18.gpg"),
            linea("a1", archivo="claves-mac-2026-13-99.gpg"),
            "# comentario",
        ))
        self.assertEqual([], regs)

    def test_huella_sin_prefijo_se_normaliza(self):
        regs = V.parsear_log(linea("a1", huella="A" * 64))
        self.assertEqual("sha256:" + "a" * 64, regs[0]["huella"])


def tres(huella_maggabox=H1, huella_a1=H1, huella_gdrive=H1, fecha=AYER):
    fecha_iso = fecha.isoformat() + "T03:10:00Z"
    return V.parsear_log(log(
        linea("maggabox", huella_maggabox, fecha=fecha_iso),
        linea("a1", huella_a1, fecha=fecha_iso),
        linea("gdrive", huella_gdrive, fecha=fecha_iso),
    ))


class EvaluarCopias(unittest.TestCase):
    def test_tres_copias_iguales_es_sano(self):
        r = V.evaluar(tres(), {}, HOY)
        self.assertTrue(r["sano"])
        self.assertEqual([], r["alertas"])
        self.assertEqual([], r["problemas"])

    def test_una_falta_un_dia_no_avisa(self):
        regs = V.parsear_log(log(linea("maggabox"), linea("a1")))
        r = V.evaluar(regs, {}, HOY)
        falta = [p for p in r["problemas"] if p["copia"] == "gdrive"][0]
        self.assertEqual("falta", falta["tipo"])
        self.assertEqual(1, falta["dias"])
        self.assertEqual([], r["alertas"])

    def test_una_falta_dos_dias_seguidos_avisa(self):
        regs = V.parsear_log(log(linea("maggabox"), linea("a1")))
        primera = V.evaluar(regs, {}, HOY)
        segunda = V.evaluar(regs, primera["estado"], HOY + dt.timedelta(days=1))
        self.assertEqual(["gdrive"], [a["copia"] for a in segunda["alertas"]])
        self.assertEqual(2, segunda["alertas"][0]["dias"])

    def test_huella_distinta_dos_dias_avisa(self):
        regs = tres(huella_gdrive=H2)
        primera = V.evaluar(regs, {}, HOY)
        segunda = V.evaluar(regs, primera["estado"], HOY + dt.timedelta(days=1))
        self.assertEqual(["gdrive"], [a["copia"] for a in segunda["alertas"]])
        self.assertEqual("difiere", segunda["alertas"][0]["tipo"])

    def test_huella_distinta_un_dia_no_avisa(self):
        r = V.evaluar(tres(huella_gdrive=H2), {}, HOY)
        self.assertEqual([], r["alertas"])
        self.assertIn("gdrive", [p["copia"] for p in r["problemas"]])

    def test_mayoria_decide_cual_difiere(self):
        r = V.evaluar(tres(huella_a1=H2), {}, HOY)
        self.assertEqual(["a1"], [p["copia"] for p in r["problemas"]])

    def test_todas_distintas_todas_difieren(self):
        regs = V.parsear_log(log(
            linea("maggabox", "sha256:" + "a" * 64),
            linea("a1", "sha256:" + "b" * 64),
            linea("gdrive", "sha256:" + "c" * 64),
        ))
        r = V.evaluar(regs, {}, HOY)
        self.assertEqual(["maggabox", "a1", "gdrive"], [p["copia"] for p in r["problemas"]])
        self.assertTrue(all(p["tipo"] == "difiere" for p in r["problemas"]))

    def test_fecha_distinta_cuenta_como_difiere(self):
        regs = V.parsear_log(log(
            linea("maggabox", fecha="2026-11-18T03:10:00Z"),
            linea("a1", fecha="2026-11-18T03:10:00Z"),
            linea("gdrive", fecha="2026-11-17T03:10:00Z"),
        ))
        r = V.evaluar(regs, {}, HOY)
        self.assertEqual(["gdrive"], [p["copia"] for p in r["problemas"]])

    def test_sin_registros_marca_las_tres_copias(self):
        r = V.evaluar([], {}, HOY)
        self.assertEqual(["maggabox", "a1", "gdrive"], [p["copia"] for p in r["problemas"]])
        self.assertTrue(all(p["tipo"] == "falta" for p in r["problemas"]))
        self.assertEqual([], r["alertas"])


class EstadoYAlertas(unittest.TestCase):
    def test_mismo_dia_no_cuenta_dos_veces(self):
        regs = V.parsear_log(log(linea("maggabox")))
        primera = V.evaluar(regs, {}, HOY)
        segunda = V.evaluar(regs, primera["estado"], HOY)
        dias = {p["copia"]: p["dias"] for p in segunda["problemas"]}
        self.assertEqual(1, dias["gdrive"])
        self.assertEqual(1, dias["a1"])

    def test_un_hueco_de_dias_reinicia_la_racha(self):
        regs = V.parsear_log(log(linea("maggabox")))
        primera = V.evaluar(regs, {}, HOY)
        tercera = V.evaluar(regs, primera["estado"], HOY + dt.timedelta(days=3))
        dias = {p["copia"]: p["dias"] for p in tercera["problemas"]}
        self.assertEqual(1, dias["gdrive"])

    def test_al_recuperarse_limpia_el_estado(self):
        regs = V.parsear_log(log(linea("maggabox")))
        primera = V.evaluar(regs, {}, HOY)
        segunda = V.evaluar(tres(), primera["estado"], HOY + dt.timedelta(days=1))
        self.assertEqual({}, segunda["estado"]["copias"])
        self.assertTrue(segunda["sano"])

    def test_ultimo_dia_manda_sobre_registros_viejos(self):
        regs = V.parsear_log(log(
            linea("maggabox", fecha="2026-11-17T03:10:00Z"),
            linea("a1", fecha="2026-11-17T03:10:00Z"),
            linea("gdrive", fecha="2026-11-17T03:10:00Z"),
            linea("maggabox", fecha="2026-11-18T03:10:00Z"),
            linea("a1", fecha="2026-11-18T03:10:00Z"),
        ))
        r = V.evaluar(regs, {}, HOY)
        self.assertEqual(ARCHIVO, r["archivo"])
        self.assertEqual(["gdrive"], [p["copia"] for p in r["problemas"]])

    def test_huella_ausente_cuenta_como_difiere(self):
        regs = V.parsear_log(log(
            linea("maggabox", huella=""),
            linea("a1"),
            linea("gdrive"),
        ))
        r = V.evaluar(regs, {}, HOY)
        self.assertEqual(["maggabox"], [p["copia"] for p in r["problemas"]])

    def test_texto_alerta_trae_la_orden_exacta(self):
        regs = V.parsear_log(log(linea("maggabox"), linea("a1")))
        primera = V.evaluar(regs, {}, HOY)
        segunda = V.evaluar(regs, primera["estado"], HOY + dt.timedelta(days=1))
        texto = V.texto_alerta(segunda["alertas"][0])
        self.assertIn("gdrive", texto)
        self.assertIn("2 días", texto)
        self.assertIn("copiar-claves.sh gdrive", texto)
        self.assertIn("nunca", texto.lower())

    def test_orden_documentada_cuando_no_hay_registro(self):
        regs = V.parsear_log(log(linea("maggabox"), linea("a1")))
        primera = V.evaluar(regs, {}, HOY)
        segunda = V.evaluar(regs, primera["estado"], HOY + dt.timedelta(days=1))
        self.assertEqual(V.ORDENES["gdrive"], segunda["alertas"][0]["orden"])

    def test_orden_del_registro_manda_si_esta(self):
        regs = V.parsear_log(log(linea("maggabox"), linea("a1"),
                                 linea("gdrive", huella=H2, orden="mi orden exacta")))
        primera = V.evaluar(regs, {}, HOY)
        segunda = V.evaluar(regs, primera["estado"], HOY + dt.timedelta(days=1))
        self.assertEqual("mi orden exacta", segunda["alertas"][0]["orden"])


class Acciones(unittest.TestCase):
    def test_accion_lleva_orden_y_urgencia(self):
        alerta = {"copia": "gdrive", "tipo": "difiere", "dias": 2,
                  "archivo": ARCHIVO, "orden": "copiar gdrive"}
        a = V.accion_de_alerta(alerta)
        self.assertEqual("respaldo-claves-gdrive", a["id"])
        self.assertEqual("alta", a["urgencia"])
        self.assertEqual("copiar gdrive", a["comando"])
        self.assertIn("días", a["por_que"])


class AccionesEnDisco(unittest.TestCase):
    def test_conserva_las_demas_y_quita_las_suyas_al_sanar(self):
        import json
        import tempfile
        ruta = os.path.join(tempfile.mkdtemp(), "acciones-de-alex.json")
        with open(ruta, "w", encoding="utf-8") as fichero:
            json.dump({"acciones": [{"id": "otra", "titulo": "Otra"}]}, fichero)
        alerta = {"copia": "gdrive", "tipo": "falta", "dias": 2,
                  "archivo": ARCHIVO, "orden": "copiar gdrive"}
        self.assertTrue(V.anotar_acciones([alerta], ruta))
        with open(ruta, encoding="utf-8") as fichero:
            ids = [a["id"] for a in json.load(fichero)["acciones"]]
        self.assertEqual(["otra", "respaldo-claves-gdrive"], ids)
        V.anotar_acciones([], ruta)
        with open(ruta, encoding="utf-8") as fichero:
            self.assertEqual(["otra"], [a["id"] for a in json.load(fichero)["acciones"]])


if __name__ == "__main__":
    unittest.main()
