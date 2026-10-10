#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red ni Oracle real del medidor de consumo de Oracle (medidor_oracle.py).

Los datos de ejemplo copian la FORMA real de las respuestas de la CLI `oci` 3.94.1 medidas en
la Mac el 2026-10-10 (presupuesto, API de uso diaria por SKU, suscripción de prueba, instancias,
volúmenes, cubos y métricas de 7 días), sin ningún identificador.
"""
from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medidor_oracle as M  # noqa: E402

AHORA = datetime(2026, 10, 10, 1, 0, tzinfo=timezone.utc)
CUENTA_FALSA = "cuenta-de-ejemplo"
ID_FALSO = "ocid1." + "instance.oc1..ejemplo"

PRESUPUESTO = {"data": [{"actual-spend": 0.0, "amount": 1.0, "display-name": "starseed-alerta-1usd",
                         "forecasted-spend": 0.0, "reset-period": "MONTHLY", "lifecycle-state": "ACTIVE",
                         "time-spend-computed": "2026-10-09T23:30:08.727000+00:00"}]}


def uso(coste_salida=0.0):
    filas = []
    for dia in range(1, 10):
        t = "2026-10-%02dT00:00:00+00:00" % dia
        filas += [
            {"time-usage-started": t, "computed-amount": 0.0, "computed-quantity": 10.5, "currency": "MXN",
             "is-forecast": False, "service": "Compute", "sku-name": "Standard - A1", "unit": "OCPU Per Hour"},
            {"time-usage-started": t, "computed-amount": 0.0, "computed-quantity": 63.0, "currency": "MXN",
             "is-forecast": False, "service": "Compute", "sku-name": "Standard - A1 - Memory",
             "unit": "Gigabyte Per Hour"},
            {"time-usage-started": t, "computed-amount": coste_salida, "computed-quantity": 0.5, "currency": "MXN",
             "is-forecast": False, "service": "Virtual Cloud Network",
             "sku-name": "Outbound Data Transfer Zone 1", "unit": "GB Months"},
        ]
    # Un día de septiembre (antes del mes) que solo cuenta para el crédito de la prueba.
    filas.append({"time-usage-started": "2026-09-30T00:00:00+00:00", "computed-amount": 5.0,
                  "computed-quantity": 1, "currency": "MXN", "is-forecast": False,
                  "sku-name": "Standard - A1", "unit": "OCPU Per Hour"})
    return {"data": {"group-by": ["service", "skuName", "unit"], "items": filas}}


SUSCRIPCIONES = {"data": {"items": [{"id": "sub-de-ejemplo", "payment-model": "FREE_TRIAL"}]}}
SUSCRIPCION = {"data": {"cloud-amount-currency": "MXN", "payment-model": "FREE_TRIAL",
                        "end-date": "2026-11-05T23:59:59.999000+00:00",
                        "promotion": [{"amount": 6150.0, "currency-unit": "MXN", "duration": 30,
                                       "duration-unit": "DAY", "status": "ACTIVE",
                                       "time-started": "2026-09-29T00:00:00+00:00"}]}}
INSTANCIAS = {"data": [{"id": ID_FALSO, "display-name": "starseed-a1", "shape": "VM.Standard.A1.Flex",
                        "shape-config": {"ocpus": 2.0, "memory-in-gbs": 12.0}, "lifecycle-state": "RUNNING"}]}
ARRANQUE = {"data": [{"display-name": "starseed-a1 (Boot Volume)", "size-in-gbs": 100,
                      "lifecycle-state": "AVAILABLE"}]}


def serie(valor, horas=51, inicio="2026-10-07T23:00:00+00:00"):
    t0 = datetime.fromisoformat(inicio)
    puntos = [{"timestamp": (t0 + timedelta(hours=h)).isoformat(), "value": valor} for h in range(horas)]
    return {"data": [{"aggregated-datapoints": puntos, "name": "x",
                      "dimensions": {"resourceDisplayName": "starseed-a1", "shape": "VM.Standard.A1.Flex"}}]}


def corredor(respuestas: dict, llamadas: list, fallos: dict | None = None):
    """Runner falso: elige la respuesta por las palabras de la orden."""
    def correr(orden, timeout=0):
        texto = " ".join(orden)
        llamadas.append(texto)
        for clave, (codigo, error) in (fallos or {}).items():
            if clave in texto:
                return subprocess.CompletedProcess(orden, codigo, "", error)
        for clave, dato in respuestas.items():
            if clave in texto:
                return subprocess.CompletedProcess(orden, 0, dato if isinstance(dato, str) else json.dumps(dato), "")
        return subprocess.CompletedProcess(orden, 0, "", "")
    return correr


def respuestas_base(cpu=0.5, mem=5.2):
    return {
        "budget list": PRESUPUESTO,
        "request-summarized-usages": uso(),
        "subscription list": SUSCRIPCIONES,
        "subscription get": SUSCRIPCION,
        "instance list": INSTANCIAS,
        "boot-volume list": ARRANQUE,
        "bv volume list": "",
        "bucket list": "",
        "CpuUtilization": serie(cpu),
        "MemoryUtilization": serie(mem),
        "NetworksBytesIn": serie(900.0),
        "NetworksBytesOut": serie(1100.0),
    }


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        (self.home / ".oci").mkdir()
        (self.home / ".oci" / "config").write_text(
            "[DEFAULT]\ntenancy=%s\nregion=mx-queretaro-1\n" % CUENTA_FALSA, encoding="utf-8")
        (self.home / ".starseed").mkdir()
        (self.home / ".starseed" / "oracle.json").write_text('{"perfil":"DEFAULT"}', encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def medir(self, respuestas=None, fallos=None, previo=None):
        llamadas: list = []
        doc = M.medir(corredor(respuestas or respuestas_base(), llamadas, fallos), AHORA, previo,
                      home=str(self.home))
        return doc, llamadas


class Medicion(Base):
    def test_lectura_completa_con_numeros_reales(self):
        doc, llamadas = self.medir()
        self.assertTrue(doc["ok"], doc["errores"])
        self.assertEqual(doc["region"], "mx-queretaro-1")
        self.assertEqual(doc["consola"], "https://cloud.oracle.com/?region=mx-queretaro-1")
        g = doc["gasto"]
        self.assertEqual((g["mes"], g["previsto"], g["presupuesto"], g["moneda"]), (0.0, 0.0, 1.0, "MXN"))
        self.assertEqual(doc["uso"]["salida_gb"], 4.5)
        self.assertEqual(doc["uso"]["a1_ocpu_h"], 94.5)
        self.assertEqual(doc["disco"], {"gb": 100.0, "arranque_gb": 100.0, "bloques_gb": 0.0,
                                        "leido": doc["leido"]})
        self.assertEqual(doc["objetos"]["gb"], 0.0)
        self.assertEqual(doc["computo"]["a1_ocpus"], 2.0)
        self.assertEqual(doc["computo"]["a1_estado"], "RUNNING")
        # el crédito de la prueba cuenta el gasto desde su inicio (incluido el 30 de septiembre)
        self.assertEqual(doc["prueba"]["credito"], 6150.0)
        self.assertEqual(doc["prueba"]["usado"], 5.0)
        self.assertEqual(doc["prueba"]["restante"], 6145.0)
        self.assertEqual(doc["prueba"]["dias_restantes"], 26)
        self.assertTrue(all("--profile DEFAULT" in l for l in llamadas))

    def test_reclamacion_a1_ocioso_es_riesgo_con_fecha(self):
        doc, _ = self.medir()
        r = doc["reclamacion"]
        self.assertTrue(r["riesgo"])
        m = r["maquinas"][0]
        self.assertEqual((m["nivel"], m["cpu_p95"], m["mem_p95"]), ("aviso", 0.5, 5.2))
        self.assertLess(m["red_p95_pct"], 0.01)
        self.assertEqual(m["reclamable_desde"], "2026-10-14T23:00:00Z")
        self.assertTrue(doc["margen"]["apto"])
        self.assertEqual(doc["margen"]["mem_libre_gb"], 11.4)

    def test_con_memoria_alta_no_hay_riesgo(self):
        doc, _ = self.medir(respuestas_base(mem=35.0))
        self.assertFalse(doc["reclamacion"]["riesgo"])
        self.assertEqual(doc["reclamacion"]["maquinas"][0]["nivel"], "no")

    def test_siete_dias_bajos_es_riesgo_alto(self):
        r = respuestas_base()
        r["CpuUtilization"] = serie(0.5, horas=24 * 7 + 1, inicio="2026-10-03T00:00:00+00:00")
        r["MemoryUtilization"] = serie(5.0, horas=24 * 7 + 1, inicio="2026-10-03T00:00:00+00:00")
        doc, _ = self.medir(r)
        self.assertEqual(doc["reclamacion"]["maquinas"][0]["nivel"], "alto")

    def test_gasto_mayor_que_cero_activa_el_freno_y_quita_el_margen(self):
        r = respuestas_base()
        r["budget list"] = {"data": [dict(PRESUPUESTO["data"][0], **{"actual-spend": 0.42})]}
        doc, _ = self.medir(r)
        self.assertTrue(doc["freno"]["activo"])
        self.assertFalse(doc["margen"]["apto"])
        self.assertIn("0.42", doc["freno"]["motivo"])

    def test_fallo_de_una_parte_se_dice_y_conserva_lo_previo(self):
        previo, _ = self.medir()
        doc, _ = self.medir(fallos={"budget list": (1, "ServiceError: NotAuthorizedOrNotFound 404")},
                            respuestas=dict(respuestas_base(), **{"request-summarized-usages": "nojson"}),
                            previo=previo)
        self.assertFalse(doc["ok"])
        partes = {e["parte"] for e in doc["errores"]}
        self.assertEqual(partes, {"presupuesto", "uso"})
        self.assertTrue(all("ocid1" not in e["error"] for e in doc["errores"]))
        self.assertIn("permiso", next(e["error"] for e in doc["errores"] if e["parte"] == "presupuesto"))
        self.assertTrue(doc["gasto"]["obsoleto"])
        self.assertIn("gasto", doc["obsoletas"])
        self.assertEqual(doc["gasto"]["mes"], 0.0)

    def test_sin_cuenta_lo_dice_sin_inventar(self):
        (self.home / ".oci" / "config").write_text("[DEFAULT]\nregion=mx-queretaro-1\n", encoding="utf-8")
        doc, llamadas = self.medir()
        self.assertFalse(doc["ok"])
        self.assertEqual(llamadas, [])
        self.assertNotIn("gasto", doc)
        self.assertEqual(doc["errores"][0]["parte"], "cuenta")

    def test_suscripcion_reciente_no_se_vuelve_a_pedir(self):
        previo, _ = self.medir()
        _, llamadas = self.medir(previo=previo)
        self.assertFalse(any("subscription" in l for l in llamadas))

    def test_nunca_sale_un_id(self):
        doc, _ = self.medir()
        self.assertNotIn("ocid1", json.dumps(doc))
        self.assertNotIn(CUENTA_FALSA, json.dumps(doc))
        self.assertNotIn("sub-de-ejemplo", json.dumps(doc))


class Disco(Base):
    def test_guardar_0600_y_toca_cada_30_min(self):
        ruta = str(self.home / ".starseed" / "oracle-consumo.json")
        doc, _ = self.medir()
        M.guardar(dict(doc, extra=ID_FALSO), ruta)
        self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600)
        self.assertNotIn("ocid1", Path(ruta).read_text(encoding="utf-8"))
        leido = M.leer_archivo(ruta)
        self.assertFalse(M.toca(leido, AHORA + timedelta(minutes=10)))
        self.assertTrue(M.toca(leido, AHORA + timedelta(minutes=31)))
        self.assertFalse(M.toca(leido, AHORA + timedelta(minutes=10), cada_min=1))  # nunca < 15 min

    def test_medir_si_toca_respeta_la_cadencia_y_el_forzado(self):
        ruta = str(self.home / ".starseed" / "oracle-consumo.json")
        llamadas: list = []
        correr = corredor(respuestas_base(), llamadas)
        original = M.perfil_y_cuenta
        M.perfil_y_cuenta = lambda home=None: original(str(self.home))
        try:
            M.medir_si_toca(ruta=ruta, correr=correr, ahora=AHORA)
            n = len(llamadas)
            M.medir_si_toca(ruta=ruta, correr=correr, ahora=AHORA + timedelta(minutes=5))
            self.assertEqual(len(llamadas), n)
            M.medir_si_toca(ruta=ruta, correr=correr, ahora=AHORA + timedelta(minutes=5), forzar=True)
            self.assertGreater(len(llamadas), n)
        finally:
            M.perfil_y_cuenta = original


class Avisos(Base):
    def test_un_aviso_por_cambio_no_en_cada_pasada(self):
        doc, _ = self.medir()
        avisos = M.avisos_de_cambio({}, doc)
        self.assertEqual([t for t, _ in avisos], ["aviso"])
        self.assertIn("2026-10-14", avisos[0][1])
        self.assertEqual(M.avisos_de_cambio(doc, doc), [])

    def test_freno_y_vuelta_a_cero(self):
        sano, _ = self.medir()
        r = respuestas_base()
        r["budget list"] = {"data": [dict(PRESUPUESTO["data"][0], **{"actual-spend": 0.42})]}
        caro, _ = self.medir(r)
        tipos = M.avisos_de_cambio(sano, caro)
        self.assertEqual(tipos[0][0], "aviso")
        self.assertIn("cloud.oracle.com", tipos[0][1])
        self.assertEqual(M.avisos_de_cambio(caro, sano)[0], ("hecho", "Oracle: el gasto del mes vuelve a 0; se levanta el freno."))

    def test_medir_si_toca_publica_solo_lo_que_cambia(self):
        ruta = str(self.home / ".starseed" / "oracle-consumo.json")
        mensajes: list = []
        correr = corredor(respuestas_base(), [])
        original = M.perfil_y_cuenta
        M.perfil_y_cuenta = lambda home=None: original(str(self.home))
        try:
            publicar = lambda texto, **kw: mensajes.append((kw.get("tipo"), texto))  # noqa: E731
            M.medir_si_toca(ruta=ruta, correr=correr, ahora=AHORA, publicar=publicar)
            M.medir_si_toca(ruta=ruta, correr=correr, ahora=AHORA + timedelta(minutes=31), publicar=publicar)
        finally:
            M.perfil_y_cuenta = original
        self.assertEqual(len(mensajes), 1)


class Medidor(Base):
    def test_forma_de_medidor_de_credito(self):
        doc, _ = self.medir()
        med = M.a_medidor(doc)
        self.assertEqual((med["id"], med["proveedor"], med["ok"]), ("oracle", "oracle", True))
        ids = [v["id"] for v in med["ventanas"]]
        self.assertEqual(ids, ["gasto", "salida", "objetos"])
        self.assertEqual(med["ventanas"][0]["usado_pct"], 0.0)
        self.assertEqual(med["ventanas"][0]["reinicia"], "2026-11-01T00:00:00Z")
        self.assertEqual(med["saldo"], {"valor": 6145.0, "unidad": "MXN de prueba"})
        self.assertTrue(med["extras"]["riesgo_reclamacion"])
        self.assertTrue(med["plan"].startswith("prueba gratuita hasta 2026-"))
        self.assertEqual(med["enlace"], "https://cloud.oracle.com/?region=mx-queretaro-1")

    def test_sin_lectura(self):
        self.assertFalse(M.a_medidor({})["ok"])

    def test_resumen_para_agentes(self):
        doc, _ = self.medir()
        t = M.resumen_agentes(doc, AHORA + timedelta(minutes=7))
        self.assertIn("medido hace 7 min", t)
        self.assertIn("hay margen gratis", t)
        self.assertIn("Riesgo de reclamación", t)
        self.assertIn("2026-10-14", t)
        self.assertNotIn("FRENO", t)
        r = respuestas_base()
        r["budget list"] = {"data": [dict(PRESUPUESTO["data"][0], **{"actual-spend": 1.5})]}
        frenado, _ = self.medir(r)
        self.assertIn("FRENO", M.resumen_agentes(frenado, AHORA))


class Puras(unittest.TestCase):
    def test_detalle_error_legible(self):
        self.assertIn("no respondió", M.detalle_error("timeout", "uso"))
        self.assertIn("autenticó", M.detalle_error("NotAuthenticated", "x"))
        self.assertIn("orden usada", M.detalle_error("Error: No such command 'list'.", "x"))

    def test_p95(self):
        self.assertEqual(M._p95(list(range(101))), 95)
        self.assertIsNone(M._p95([]))

    def test_ancho_de_banda(self):
        self.assertEqual(M.ancho_banda_bps("VM.Standard.A1.Flex", 2), 2e9)
        self.assertEqual(M.ancho_banda_bps("VM.Standard.E2.1.Micro", 0.125), 0.48e9)


if __name__ == "__main__":
    unittest.main()
