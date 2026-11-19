#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de las tres copias cifradas de claves (SEG1119B).

Herméticas: solo lógica pura, sin red, sin disco real y sin abrir ningún `.gpg`.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_respaldos as V  # noqa: E402


def linea(copia, huella, fecha="2026-11-18", archivo=None, formato="kv"):
    archivo = archivo or "claves-mac-%s.gpg" % fecha
    if formato == "json":
        return json.dumps({
            "copia": copia,
            "archivo": archivo,
            "huella": "sha256:%s" % huella,
            "fecha": fecha,
        })
    return "%sT03:10:00Z copia=%s archivo=%s huella=sha256:%s fecha=%s" % (
        fecha, copia, archivo, huella, fecha
    )


class Parseo(unittest.TestCase):
    def test_parsea_linea_de_registro(self):
        r = V.parsear_linea(linea("maggabox", "aaaa", fecha="2026-11-18")) or {}
        self.assertEqual(r["copia"], "maggabox")
        self.assertEqual(r["archivo"], "claves-mac-2026-11-18.gpg")
        self.assertEqual(r["huella"], "aaaa")
        self.assertEqual(r["fecha"], "2026-11-18")
        self.assertEqual(r["fecha_archivo"], "2026-11-18")

    def test_parsea_json_por_linea(self):
        r = V.parsear_linea(linea("a1", "bbbb", formato="json")) or {}
        self.assertEqual(r["copia"], "a1")
        self.assertEqual(r["huella"], "bbbb")

    def test_normaliza_alias_de_copias(self):
        self.assertEqual(V.normalizar_copia("Maggabox"), "maggabox")
        self.assertEqual(V.normalizar_copia("oracle-a1"), "a1")
        self.assertEqual(V.normalizar_copia("Google Drive"), "gdrive")
        self.assertEqual(V.normalizar_copia("mac"), "mac")
        self.assertEqual(V.normalizar_copia("otro"), "")

    def test_solo_archivos_de_claves(self):
        self.assertTrue(V.es_archivo_de_claves("claves-mac-2026-11-18.gpg"))
        self.assertTrue(V.es_archivo_de_claves("/tmp/claves-mac-20261118.gpg"))
        self.assertFalse(V.es_archivo_de_claves("claves-mac-2026-11-18.txt"))
        self.assertFalse(V.es_archivo_de_claves("otras-claves.gpg"))
        self.assertFalse(V.es_archivo_de_claves("claves-mac-2026-11-18.gpg.bak"))

    def test_ignora_archivo_ajeno(self):
        self.assertIsNone(V.parsear_linea(
            "copia=maggabox archivo=notas.txt huella=aaaa fecha=2026-11-18"))

    def test_ignora_sin_huella(self):
        self.assertIsNone(V.parsear_linea(
            "copia=maggabox archivo=claves-mac-2026-11-18.gpg fecha=2026-11-18"))

    def test_ignora_vacia_y_comentario(self):
        self.assertIsNone(V.parsear_linea(""))
        self.assertIsNone(V.parsear_linea("   "))
        self.assertIsNone(V.parsear_linea("# copia=maggabox archivo=claves-mac-2026-11-18.gpg"))

    def test_huella_sin_prefijo_y_en_minusculas(self):
        self.assertEqual(V.normalizar_huella("SHA256:ABCD"), "abcd")
        self.assertEqual(V.normalizar_huella("abcd"), "abcd")

    def test_fecha_desde_el_nombre_del_archivo(self):
        r = V.parsear_linea(
            "copia=a1 archivo=claves-mac-20261118.gpg huella=bbbb") or {}
        self.assertEqual(r["fecha"], "2026-11-18")

    def test_lee_varias_lineas_y_descarta_las_rotas(self):
        texto = "\n".join([
            linea("maggabox", "aaaa"),
            "basura sin campos",
            linea("a1", "aaaa"),
            "",
        ])
        registros = V.leer_registro(texto)
        self.assertEqual([r["copia"] for r in registros], ["maggabox", "a1"])


class Evaluacion(unittest.TestCase):
    def test_tres_copias_iguales(self):
        registros = V.leer_registro("\n".join([
            linea("maggabox", "aaaa"), linea("a1", "aaaa"), linea("gdrive", "aaaa"),
        ]))
        e = V.evaluar_dia(registros, "2026-11-18")
        self.assertEqual(e["esperada"], "aaaa")
        self.assertEqual({c: d["estado"] for c, d in e["copias"].items()},
                         {"maggabox": "ok", "a1": "ok", "gdrive": "ok"})

    def test_una_copia_falta(self):
        registros = V.leer_registro("\n".join([
            linea("maggabox", "aaaa"), linea("a1", "aaaa"),
        ]))
        e = V.evaluar_dia(registros, "2026-11-18")
        self.assertEqual(e["copias"]["gdrive"]["estado"], "falta")
        self.assertEqual(e["copias"]["maggabox"]["estado"], "ok")

    def test_una_copia_difiere(self):
        registros = V.leer_registro("\n".join([
            linea("maggabox", "aaaa"), linea("a1", "aaaa"), linea("gdrive", "bbbb"),
        ]))
        e = V.evaluar_dia(registros, "2026-11-18")
        self.assertEqual(e["esperada"], "aaaa")
        self.assertEqual(e["copias"]["gdrive"]["estado"], "difiere")
        self.assertEqual(e["copias"]["gdrive"]["huella"], "bbbb")

    def test_la_mac_manda_como_referencia(self):
        registros = V.leer_registro("\n".join([
            linea("mac", "cccc"), linea("maggabox", "aaaa"), linea("a1", "aaaa"),
        ]))
        e = V.evaluar_dia(registros, "2026-11-18")
        self.assertEqual(e["esperada"], "cccc")
        self.assertEqual(e["copias"]["maggabox"]["estado"], "difiere")
        self.assertEqual(e["copias"]["a1"]["estado"], "difiere")

    def test_empate_gana_el_archivo_mas_nuevo(self):
        registros = V.leer_registro("\n".join([
            linea("maggabox", "aaaa", archivo="claves-mac-2026-11-17.gpg"),
            linea("a1", "bbbb", archivo="claves-mac-2026-11-18.gpg"),
        ]))
        e = V.evaluar_dia(registros, "2026-11-18")
        self.assertEqual(e["esperada"], "bbbb")
        self.assertEqual(e["copias"]["maggabox"]["estado"], "difiere")

    def test_misma_copia_se_queda_con_el_archivo_mas_nuevo(self):
        registros = V.leer_registro("\n".join([
            linea("maggabox", "vieja", archivo="claves-mac-2026-11-17.gpg"),
            linea("maggabox", "nueva", archivo="claves-mac-2026-11-18.gpg"),
            linea("a1", "nueva", archivo="claves-mac-2026-11-18.gpg"),
            linea("gdrive", "nueva", archivo="claves-mac-2026-11-18.gpg"),
        ]))
        e = V.evaluar_dia(registros, "2026-11-18")
        self.assertEqual(e["copias"]["maggabox"]["huella"], "nueva")
        self.assertEqual(e["copias"]["maggabox"]["estado"], "ok")

    def test_sin_registros_del_dia(self):
        e = V.evaluar_dia(V.leer_registro(linea("maggabox", "aaaa")), "2026-11-19")
        self.assertEqual(e, {"esperada": "", "copias": {}})


def evaluacion(estados, dia):
    registros = []
    for copia, estado in estados.items():
        if estado == "falta":
            continue
        registros.append(linea(copia, "aaaa" if estado == "ok" else "bbbb", fecha=dia))
    return V.evaluar_dia(V.leer_registro("\n".join(registros)), dia)


class Rachas(unittest.TestCase):
    def test_dos_dias_seguidos_faltando(self):
        s1 = V.actualizar_estado(
            {}, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-18"), "2026-11-18")
        self.assertEqual(s1["copias"]["gdrive"]["dias"], 1)
        s2 = V.actualizar_estado(
            s1, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-19"), "2026-11-19")
        self.assertEqual(s2["copias"]["gdrive"]["dias"], 2)
        self.assertEqual(s2["copias"]["gdrive"]["estado"], "falta")

    def test_un_solo_dia_no_basta(self):
        s1 = V.actualizar_estado(
            {}, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-18"), "2026-11-18")
        self.assertEqual(V.alertas(s1, "2026-11-18"), [])

    def test_un_hueco_no_cuenta_como_seguido(self):
        s1 = V.actualizar_estado(
            {}, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-18"), "2026-11-18")
        s3 = V.actualizar_estado(
            s1, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-20"), "2026-11-20")
        self.assertEqual(s3["copias"]["gdrive"]["dias"], 1)

    def test_volver_a_ok_rompe_la_racha(self):
        s1 = V.actualizar_estado(
            {}, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-18"), "2026-11-18")
        s2 = V.actualizar_estado(
            s1, evaluacion({"maggabox": "ok", "a1": "ok", "gdrive": "ok"}, "2026-11-19"), "2026-11-19")
        self.assertEqual(s2["copias"]["gdrive"]["dias"], 0)
        s3 = V.actualizar_estado(
            s2, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-20"), "2026-11-20")
        self.assertEqual(s3["copias"]["gdrive"]["dias"], 1)

    def test_el_mismo_dia_no_suma(self):
        s1 = V.actualizar_estado(
            {}, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-18"), "2026-11-18")
        s1b = V.actualizar_estado(
            s1, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-18"), "2026-11-18")
        self.assertEqual(s1b["copias"]["gdrive"]["dias"], 1)

    def test_arranque_sin_estado_detecta_dos_dias(self):
        registros = V.leer_registro("\n".join([
            linea("maggabox", "aaaa", fecha="2026-11-18"),
            linea("a1", "aaaa", fecha="2026-11-18"),
            linea("maggabox", "bbbb", fecha="2026-11-19"),
            linea("a1", "bbbb", fecha="2026-11-19"),
        ]))
        estado, dia, _evaluacion = V.procesar_registros({}, registros)
        self.assertEqual(dia, "2026-11-19")
        self.assertEqual(estado["copias"]["gdrive"]["dias"], 2)
        self.assertEqual([a["copia"] for a in V.alertas(estado, dia)], ["gdrive"])

    def test_no_repite_dias_ya_procesados(self):
        registros = V.leer_registro("\n".join([
            linea("maggabox", "aaaa", fecha="2026-11-18"),
            linea("a1", "aaaa", fecha="2026-11-18"),
            linea("maggabox", "bbbb", fecha="2026-11-19"),
            linea("a1", "bbbb", fecha="2026-11-19"),
        ]))
        estado, dia, _evaluacion = V.procesar_registros({}, registros)
        marcado = V.marcar_avisados(estado, dia, ["gdrive"])
        otra_vez, _dia, _evaluacion = V.procesar_registros(marcado, registros)
        self.assertEqual(otra_vez["copias"]["gdrive"]["dias"], 2)
        self.assertEqual(V.alertas(otra_vez, dia), [])

    def test_difiere_dos_dias_seguidos(self):
        s1 = V.actualizar_estado(
            {}, evaluacion({"maggabox": "ok", "a1": "ok", "gdrive": "difiere"}, "2026-11-18"),
            "2026-11-18")
        self.assertEqual(s1["copias"]["gdrive"]["dias"], 1)
        s2 = V.actualizar_estado(
            s1, evaluacion({"maggabox": "ok", "a1": "ok", "gdrive": "difiere"}, "2026-11-19"),
            "2026-11-19")
        self.assertEqual(s2["copias"]["gdrive"]["dias"], 2)
        self.assertEqual(s2["copias"]["gdrive"]["estado"], "difiere")


class Avisos(unittest.TestCase):
    def _estado_dos_dias(self):
        s1 = V.actualizar_estado(
            {}, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-18"), "2026-11-18")
        return V.actualizar_estado(
            s1, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-19"), "2026-11-19")

    def test_avisa_al_segundo_dia(self):
        lista = V.alertas(self._estado_dos_dias(), "2026-11-19")
        self.assertEqual([a["copia"] for a in lista], ["gdrive"])
        self.assertEqual(lista[0]["dias"], 2)

    def test_el_mensaje_lleva_copia_dias_y_orden(self):
        alerta = V.alertas(self._estado_dos_dias(), "2026-11-19")[0]
        texto = V.mensaje_alerta(alerta)
        self.assertIn("Google Drive", texto)
        self.assertIn("2 días seguidos", texto)
        self.assertIn("rclone copy", texto)
        self.assertIn("claves-mac-*.gpg", texto)

    def test_no_repite_el_mismo_dia(self):
        estado = self._estado_dos_dias()
        alerta = V.alertas(estado, "2026-11-19")[0]
        marcado = V.marcar_avisados(estado, "2026-11-19", [alerta["copia"]])
        self.assertEqual(V.alertas(marcado, "2026-11-19"), [])
        self.assertEqual(estado["copias"]["gdrive"]["avisado_dia"], "")  # no muta

    def test_vuelve_a_avisar_al_dia_siguiente(self):
        estado = self._estado_dos_dias()
        marcado = V.marcar_avisados(estado, "2026-11-19", ["gdrive"])
        estado3 = V.actualizar_estado(
            marcado, evaluacion({"maggabox": "ok", "a1": "ok"}, "2026-11-20"), "2026-11-20")
        self.assertEqual(estado3["copias"]["gdrive"]["dias"], 3)
        self.assertEqual([a["copia"] for a in V.alertas(estado3, "2026-11-20")], ["gdrive"])

    def test_sin_fallo_no_hay_aviso(self):
        estado = V.actualizar_estado(
            {}, evaluacion({"maggabox": "ok", "a1": "ok", "gdrive": "ok"}, "2026-11-18"),
            "2026-11-18")
        self.assertEqual(V.alertas(estado, "2026-11-18"), [])


class Acciones(unittest.TestCase):
    def test_orden_exacta_de_cada_copia(self):
        self.assertIn("starseed-nodo-1.local", V.orden_exacta("maggabox"))
        self.assertIn("rsync", V.orden_exacta("maggabox"))
        self.assertIn("starseed_oracle_ed25519", V.orden_exacta("a1"))
        self.assertIn("ubuntu@$ip", V.orden_exacta("a1"))
        self.assertIn("rclone copy", V.orden_exacta("gdrive"))
        self.assertIn("gdrive:StarSeed/respaldo-claves/", V.orden_exacta("gdrive"))
        self.assertEqual(V.orden_exacta("otro"), "")

    def test_la_accion_lleva_la_orden_y_el_motivo(self):
        alerta = {"copia": "gdrive", "dias": 2, "estado": "difiere",
                  "huella": "abcdef0123456789", "archivo": "claves-mac-2026-11-19.gpg",
                  "dia": "2026-11-19"}
        accion = V.accion_te_toca_a_ti(alerta)
        self.assertEqual(accion["id"], "respaldo-claves-gdrive")
        self.assertEqual(accion["urgencia"], "alta")
        self.assertEqual(accion["comando"], V.orden_exacta("gdrive"))
        self.assertIn("nunca abre el .gpg", accion["detalle"])
        self.assertIn("no coincide", accion["titulo"])
        self.assertIn("abcdef012345", accion["detalle"])

    def test_fusionar_reemplaza_el_mismo_id(self):
        acciones = [
            {"id": "otra", "titulo": "Otra"},
            {"id": "respaldo-claves-gdrive", "titulo": "Vieja"},
        ]
        nueva = {"id": "respaldo-claves-gdrive", "titulo": "Nueva"}
        fusion = V.fusionar_accion(acciones, nueva)
        self.assertEqual([a["id"] for a in fusion], ["otra", "respaldo-claves-gdrive"])
        self.assertEqual(fusion[-1]["titulo"], "Nueva")
        self.assertEqual(acciones[1]["titulo"], "Vieja")  # no muta

    def test_deja_la_accion_en_el_json_sin_duplicar(self):
        alerta = {"copia": "gdrive", "dias": 2, "estado": "falta",
                  "huella": "", "archivo": "", "dia": "2026-11-19"}
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = os.path.join(carpeta, "acciones-de-alex.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({"acciones": [{"id": "otra"}, {"id": "respaldo-claves-gdrive"}]}, f)
            with mock.patch.object(V, "ACCIONES", ruta):
                self.assertTrue(V.publicar_en_te_toca_a_ti(V.accion_te_toca_a_ti(alerta)))
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
        self.assertEqual([a["id"] for a in datos["acciones"]], ["otra", "respaldo-claves-gdrive"])
        self.assertEqual(datos["acciones"][-1]["urgencia"], "alta")

    def test_el_mensaje_no_imprime_la_huella_entera(self):
        alerta = {"copia": "a1", "dias": 2, "estado": "difiere",
                  "huella": "0123456789abcdef0123456789abcdef", "archivo": "", "dia": "2026-11-19"}
        texto = V.mensaje_alerta(alerta)
        self.assertNotIn("0123456789abcdef0123456789abcdef", texto)
        self.assertIn("0123456789ab…", texto)


if __name__ == "__main__":
    unittest.main()
