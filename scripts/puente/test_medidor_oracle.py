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
import re
import stat
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medidor_oracle as M  # noqa: E402
import oracle_nodo as N  # noqa: E402

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
        self.estado_oracle = self.home / ".starseed" / "oracle.json"
        self.estado_oracle.write_text('{"perfil":"DEFAULT"}', encoding="utf-8")
        # Hermético: el nodo se lee del oracle.json TEMPORAL (el mismo que usa perfil_y_cuenta, como en
        # producción), nunca del ~/.starseed/oracle.json real de quien corre las pruebas.
        parche = mock.patch.object(M, "ESTADO_ORACLE", str(self.estado_oracle))
        parche.start()
        self.addCleanup(parche.stop)

    def tearDown(self):
        self.tmp.cleanup()

    def medir(self, respuestas=None, fallos=None, previo=None):
        llamadas: list = []
        doc = M.medir(corredor(respuestas or respuestas_base(), llamadas, fallos), AHORA, previo,
                      home=str(self.home))
        return doc, llamadas

    def estado_con(self, **partes):
        """Escribe el oracle.json temporal con el perfil y las partes dadas (`nodo`, `servicios`…)."""
        self.estado_oracle.write_text(json.dumps(dict({"perfil": "DEFAULT"}, **partes)), encoding="utf-8")

    def medir_y_guardar(self):
        """`medir_si_toca` de verdad (cerrojo, nodo, disco) sobre la casa temporal: (documento, ruta)."""
        ruta = str(self.home / ".starseed" / "oracle-consumo.json")
        original = M.perfil_y_cuenta
        with mock.patch.object(M, "perfil_y_cuenta", lambda home=None: original(str(self.home))):
            doc = M.medir_si_toca(ruta=ruta, correr=corredor(respuestas_base(), []), ahora=AHORA, forzar=True)
        return doc, ruta


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


class NodoResumen(unittest.TestCase):
    def test_sin_nodo_devuelve_none(self):
        self.assertIsNone(M.nodo_resumen({}))
        self.assertIsNone(M.nodo_resumen(None))

    def test_nodo_completo(self):
        r = M.nodo_resumen({
            "nodo": {"vivo": True, "fase": "guardian", "latido": 1,
                     "guardian": {"t": 1, "ok": False, "sha": "abcdef1234567", "minutos": 12.5,
                                  "pasos": [{"paso": "tsc", "ok": True}, {"paso": "vitest", "ok": False}]},
                     "carga": {"cpu_1h": 40.0, "mem_ahora": 22.0},
                     "horas": [{"cpu": 30.0}, {"cpu": 10.0}, {"cpu": 25.0}]},
            "servicios": [{"nombre": "bitnet", "ok": True}, {"nombre": "caddy", "ok": True},
                          {"nombre": "metageminis", "titulo": "MetaGeminis", "ok": False}]})
        self.assertEqual(r["servicios_ok"], 2)
        self.assertEqual(r["servicios_total"], 3)
        # el caído se nombra por su título cuando lo lleva
        self.assertEqual(r["servicios_caidos"], ["MetaGeminis"])
        self.assertFalse(r["guardian"]["ok"])
        self.assertEqual(r["guardian"]["rojos"], ["vitest"])
        # el sha se recorta a 8 caracteres
        self.assertEqual(r["guardian"]["sha"], "abcdef12")
        self.assertEqual(r["horas_sobre_umbral"], 2)
        self.assertEqual(r["horas_medidas"], 3)
        self.assertEqual(r["cpu_1h"], 40.0)

    def test_no_copia_urls(self):
        r = M.nodo_resumen({"nodo": {"vivo": True, "latido": 1},
                            "servicios": [{"nombre": "caddy", "ok": True,
                                           "detalle": "https://bitnet.1-2-3-4.sslip.io"}]})
        self.assertNotIn("sslip", json.dumps(r))


#: Las claves que `nodo_resumen` entrega y la tarjeta de Consumo (`leerConsumoOracle`, TS) lee.
CLAVES_NODO = {"vivo", "latido", "leido", "fase", "servicios_ok", "servicios_total", "servicios_caidos",
               "guardian", "cpu_1h", "mem_ahora", "cpu_p95_local", "horas_sobre_umbral", "horas_medidas"}
CLAVES_GUARDIAN = {"ok", "t", "minutos", "sha", "rojos"}
TIPOS_TS = Path(__file__).resolve().parents[2] / "src" / "lib" / "mando" / "oracle-consumo-tipos.ts"


def estado_a1_real():
    """Lo que `oracle_nodo.py estado` lee del A1 (con un error crudo que lleva su IP)."""
    return {"latido": 1000, "t": "2026-10-10T10:00:00Z", "fase": "guardian", "error": "ssh: connect to host 140.1.2.3 port 22",
            "servicios": [{"nombre": "caddy", "ok": True, "activo": "active", "ms": 30,
                           "detalle": "https://bitnet.140-1-2-3.sslip.io 200"},
                          {"nombre": "metageminis", "titulo": "MetaGeminis", "ok": False, "activo": "inactive"}],
            "guardian": {"t": 900, "sha": "abcdef1234567", "ok": False, "minutos": 30,
                         "pasos": [{"paso": "tsc", "ok": True}, {"paso": "vitest", "ok": False}]},
            "carga": {"cpu_1h": 40.0, "mem_ahora": 25.0, "cpu_p95_7d": 55.0, "horas": [{"cpu": 30.0}, {"cpu": 10.0}]}}


class NodoResumenContrato(unittest.TestCase):
    """Python (productor + medidor) y TS (tarjeta) tienen que hablar de las mismas claves: si una se
    renombra en un lado, la tarjeta mostraría 0/0 sin que ninguna prueba lo viera."""

    def test_claves_exactas_con_la_salida_real_del_productor(self):
        nodo, servicios = N.resumen_para_oracle_json(estado_a1_real(), {"ok": True, "codigo": "200", "ms": 120}, 1100)
        r = M.nodo_resumen({"nodo": nodo, "servicios": servicios})
        self.assertEqual(set(r), CLAVES_NODO)
        self.assertEqual(set(r["guardian"]), CLAVES_GUARDIAN)
        self.assertTrue(r["vivo"])
        self.assertEqual(r["leido"], nodo["leido"])
        # caddy, metageminis y la sonda pública (bitnet-publico) cuentan como servicios
        self.assertEqual((r["servicios_ok"], r["servicios_total"]), (2, 3))
        self.assertEqual(r["servicios_caidos"], ["MetaGeminis"])
        self.assertEqual(r["guardian"]["rojos"], ["vitest"])
        self.assertEqual(r["cpu_p95_local"], 55.0)

    def test_la_tarjeta_ts_lee_solo_claves_que_el_medidor_entrega(self):
        if not TIPOS_TS.exists():
            self.skipTest("sin src/ junto a scripts/ (copia parcial del repo)")
        fuente = TIPOS_TS.read_text(encoding="utf-8")
        del_nodo = set(re.findall(r"\bnd\??\.(\w+)", fuente))
        del_guardian = set(re.findall(r"\bng\??\.(\w+)", fuente))
        self.assertTrue(del_nodo and del_guardian, "no encuentro cómo lee el nodo la tarjeta: ¿cambió oracle-consumo-tipos.ts?")
        self.assertEqual(del_nodo - CLAVES_NODO, set())
        self.assertEqual(del_guardian - CLAVES_GUARDIAN, set())

    def test_el_error_crudo_del_a1_y_su_ip_no_se_copian(self):
        nodo, servicios = N.resumen_para_oracle_json(estado_a1_real(), None, 1100)
        r = M.nodo_resumen({"nodo": dict(nodo, error="ssh: connect to host 140.1.2.3"), "servicios": servicios})
        for prohibido in ("140.1.2.3", "140-1-2-3", "sslip", "ssh:"):
            self.assertNotIn(prohibido, json.dumps(r))


class NodoResumenBordes(unittest.TestCase):
    def test_umbral_inclusivo_y_solo_horas_con_numero(self):
        r = M.nodo_resumen({"nodo": {"vivo": True, "horas": [
            {"cpu": 20.0}, {"cpu": 19.99}, {"cpu": "50"}, {"cpu": None}, {"cpu": True}, {"otro": 1}, "texto", 7]}})
        # 20,0 cuenta como «sobre el umbral» (la regla de Oracle es < 20 %); lo que no es número no se mide
        self.assertEqual((r["horas_medidas"], r["horas_sobre_umbral"]), (2, 1))

    def test_guardian_sin_pasada_es_none_y_verde_sin_rojos(self):
        self.assertIsNone(M.nodo_resumen({"nodo": {"vivo": True, "guardian": {}}})["guardian"])
        self.assertIsNone(M.nodo_resumen({"nodo": {"vivo": True}})["guardian"])
        g = M.nodo_resumen({"nodo": {"vivo": True, "guardian": {"t": 5, "ok": True, "pasos": []}}})["guardian"]
        self.assertTrue(g["ok"])
        self.assertEqual(g["rojos"], [])

    def test_topes_como_la_tarjeta(self):
        pasos = [{"paso": "paso%d" % i, "ok": False} for i in range(6)]
        r = M.nodo_resumen({
            "nodo": {"vivo": True, "fase": "f" * 50, "guardian": {"t": 1, "sha": "0123456789abcdef", "pasos": pasos}},
            "servicios": [{"nombre": "s%d" % i, "ok": False} for i in range(9)] + [{"nombre": "x" * 100, "ok": False}]})
        self.assertEqual(len(r["servicios_caidos"]), 6)
        self.assertEqual(len(r["guardian"]["rojos"]), 4)
        self.assertEqual(len(r["fase"]), 20)
        self.assertEqual(r["guardian"]["sha"], "01234567")
        self.assertEqual(r["servicios_total"], 10)
        nombre_largo = M.nodo_resumen({"nodo": {"vivo": True}, "servicios": [{"nombre": "x" * 100, "ok": False}]})
        self.assertEqual(len(nombre_largo["servicios_caidos"][0]), 40)

    def test_sin_nombre_y_signo_de_interrogacion_nunca_none(self):
        r = M.nodo_resumen({"nodo": {"vivo": True, "guardian": {"t": 1, "pasos": [{"ok": False}, {"paso": "tsc", "ok": False}]}},
                            "servicios": [{"ok": False}, {"nombre": None, "titulo": "", "ok": False}]})
        self.assertEqual(r["servicios_caidos"], ["sin nombre", "sin nombre"])
        self.assertEqual(r["guardian"]["rojos"], ["?", "tsc"])
        self.assertNotIn("None", json.dumps(r))

    def test_formas_raras_en_el_archivo_no_lo_tumban(self):
        for raro in (5, 1.5, True, "texto", {"a": 1}, None):
            for caso in ({"servicios": raro, "nodo": {"vivo": True}},
                         {"nodo": {"vivo": True, "horas": raro}},
                         {"nodo": {"vivo": True, "guardian": {"t": 1, "pasos": raro}}}):
                r = M.nodo_resumen(caso)
                self.assertIsNotNone(r, caso)
                self.assertEqual(r["servicios_total"], 0, caso)
                self.assertEqual(r["horas_medidas"], 0, caso)

    def test_escalares_raros_no_llegan_al_resumen(self):
        # json.load acepta NaN e Infinity; JSON.parse de la tarjeta (TS) los rechaza y la ruta diría
        # «todavía no se ha medido»: se pierde la tarjeta entera. Un dict con una URL en el latido
        # tampoco puede viajar (el contrato dice «sin URLs ni IPs»).
        nan, inf = float("nan"), float("inf")
        url = {"u": "https://bitnet.1-2-3-4.sslip.io"}
        r = M.nodo_resumen({"nodo": {
            "vivo": True, "latido": url, "leido": url, "fase": "cola",
            "carga": {"cpu_1h": nan, "mem_ahora": inf, "cpu_p95_7d": True},
            "guardian": {"t": url, "ok": True, "minutos": -inf, "pasos": []},
            "horas": [{"cpu": nan}, {"cpu": inf}, {"cpu": 25.0}]}})
        for clave in ("latido", "leido", "cpu_1h", "mem_ahora", "cpu_p95_local"):
            self.assertIsNone(r[clave], clave)
        self.assertIsNone(r["guardian"]["t"])
        self.assertIsNone(r["guardian"]["minutos"])
        # NaN no cuenta como hora medida (empujaría hacia «ocioso»); infinito tampoco
        self.assertEqual((r["horas_medidas"], r["horas_sobre_umbral"]), (1, 1))
        texto = json.dumps(r, allow_nan=False)  # no lanza ValueError
        self.assertNotIn("sslip", texto)

    def test_marcas_de_tiempo_validas_pasan(self):
        # época (número) y fecha ISO se conservan; un texto que no parece fecha, no
        r = M.nodo_resumen({"nodo": {"vivo": True, "latido": 1760000000.5, "leido": "2026-10-10T10:00:00Z",
                                     "guardian": {"t": "2026-10-10 09:00:00+00:00", "ok": True, "minutos": 12}}})
        self.assertEqual((r["latido"], r["leido"]), (1760000000.5, "2026-10-10T10:00:00Z"))
        self.assertEqual((r["guardian"]["t"], r["guardian"]["minutos"]), ("2026-10-10 09:00:00+00:00", 12.0))
        raro = M.nodo_resumen({"nodo": {"vivo": True, "leido": "https://a.b/c", "latido": "ayer\n"}})
        self.assertEqual((raro["leido"], raro["latido"]), (None, None))

    def test_una_ip_no_pasa_por_marca_de_tiempo(self):
        # `_marca` aceptaba cualquier texto con dígitos y signos de fecha: «140.1.2.3» o «10.0.0.5:22» pasaban
        # al resumen tal cual, contra lo que dice el contrato (§3: ninguna URL ni IP). Ahora solo vale lo que
        # `_fecha` entiende como fecha ISO.
        for ip in ("140.1.2.3", "10.0.0.5:22", "140-1-2-3", "2026-10-10T10:00:00Z.140.1.2.3"):
            r = M.nodo_resumen({"nodo": {"vivo": True, "latido": ip, "leido": ip,
                                         "guardian": {"t": ip, "ok": True}}})
            self.assertEqual((r["latido"], r["leido"], r["guardian"]["t"]), (None, None, None), ip)
            self.assertNotIn(ip, json.dumps(r), ip)
        # un texto larguísimo con forma de fecha tampoco viaja (tope de 40 caracteres)
        largo = "2026-10-10T10:00:00." + "1" * 40
        self.assertIsNone(M.nodo_resumen({"nodo": {"vivo": True, "latido": largo}})["latido"])


class NodoEnElConsumo(Base):
    """La integración de `medir_si_toca`: el nodo viaja con el consumo y su fallo no cuesta la medición."""

    def test_el_nodo_viaja_a_disco_sin_urls(self):
        self.estado_con(nodo={"vivo": True, "latido": 1, "fase": "cola"},
                        servicios=[{"nombre": "caddy", "ok": True, "detalle": "https://bitnet.1-2-3-4.sslip.io"},
                                   {"nombre": "bitnet", "ok": False}])
        doc, ruta = self.medir_y_guardar()
        guardado = M.leer_archivo(ruta)
        self.assertEqual((guardado["nodo"]["servicios_ok"], guardado["nodo"]["servicios_total"]), (1, 2))
        self.assertEqual(guardado["nodo"]["servicios_caidos"], ["bitnet"])
        self.assertEqual(guardado["gasto"]["mes"], 0.0)
        self.assertNotIn("sslip", Path(ruta).read_text(encoding="utf-8"))
        self.assertEqual(doc["nodo"], guardado["nodo"])

    def test_sin_estado_del_nodo_se_mide_igual(self):
        doc, ruta = self.medir_y_guardar()
        self.assertIsNone(doc["nodo"])
        self.assertTrue(doc["ok"], doc["errores"])
        self.assertEqual(M.leer_archivo(ruta)["gasto"]["presupuesto"], 1.0)

    def test_un_oracle_json_raro_no_pierde_la_medicion(self):
        # antes: `x or []` dejaba pasar un número y nodo_resumen lanzaba TypeError → no se guardaba nada
        self.estado_con(nodo={"vivo": True, "horas": 5, "guardian": {"t": 1, "pasos": 3}}, servicios=5)
        doc, ruta = self.medir_y_guardar()
        guardado = M.leer_archivo(ruta)
        self.assertEqual(guardado["gasto"]["mes"], 0.0)
        self.assertEqual(guardado["nodo"]["servicios_total"], 0)
        self.assertTrue(doc["ok"], doc["errores"])

    def test_un_nan_en_oracle_json_no_deja_ilegible_el_archivo_de_la_tarjeta(self):
        # oracle_nodo escribe con json.dump (permite NaN) y la tarjeta lee con JSON.parse (no lo permite)
        self.estado_con(nodo={"vivo": True, "latido": {"u": "https://bitnet.1-2-3-4.sslip.io"},
                              "carga": {"cpu_1h": float("nan"), "cpu_p95_7d": float("inf")}})
        _, ruta = self.medir_y_guardar()
        texto = Path(ruta).read_text(encoding="utf-8")

        def sin_constantes(c):
            raise ValueError("constante no JSON: " + c)

        guardado = json.loads(texto, parse_constant=sin_constantes)  # como JSON.parse
        self.assertIsNone(guardado["nodo"]["cpu_1h"])
        self.assertIsNone(guardado["nodo"]["latido"])
        self.assertNotIn("sslip", texto)

    def test_si_el_resumen_falla_se_dice_y_lo_demas_queda(self):
        self.estado_con(nodo={"vivo": True})
        with mock.patch.object(M, "nodo_resumen", side_effect=ValueError("forma imprevista con 140.1.2.3")):
            doc, ruta = self.medir_y_guardar()
        guardado = M.leer_archivo(ruta)
        self.assertEqual(guardado["gasto"]["mes"], 0.0)
        self.assertIsNone(guardado["nodo"])
        self.assertFalse(guardado["ok"])
        self.assertEqual([e["parte"] for e in guardado["errores"]], ["nodo"])
        # el mensaje no copia el contenido del archivo ni de la excepción
        self.assertNotIn("140.1.2.3", json.dumps(guardado))
        # la pastilla es de crédito: el estado del nodo no la apaga ni le pone texto
        med = M.a_medidor(guardado)
        self.assertTrue(med["ok"])
        self.assertIsNone(med["error"])


class NodoParaAgentes(Base):
    """La línea del nodo en `resumen_agentes`: lo que leen los directores y agentes para decidir si
    mandan trabajo al A1."""

    def texto_con(self, nodo):
        doc, _ = self.medir()
        doc["nodo"] = nodo
        return M.resumen_agentes(doc, AHORA + timedelta(minutes=7))

    def test_con_nodo_servicios_guardian_en_rojo_y_cpu(self):
        nodo = M.nodo_resumen({
            "nodo": {"vivo": True, "fase": "guardian", "guardian": {"t": 1, "ok": False, "pasos": [{"paso": "vitest", "ok": False}]},
                     "carga": {"cpu_1h": 40.0}},
            "servicios": [{"nombre": "caddy", "ok": True}, {"nombre": "bitnet", "ok": True}, {"nombre": "mg", "ok": True}]})
        t = self.texto_con(nodo)
        self.assertIn("Nodo de MetaGenesis en el A1: vivo (guardian) · 3/3 servicios", t)
        self.assertIn("guardián de main ROJO en vitest", t)
        self.assertIn("CPU última hora 40 %", t)

    def test_sin_latido_sin_pasada_y_sin_cpu_se_dice_asi(self):
        t = self.texto_con(M.nodo_resumen({"nodo": {"vivo": False, "latido": 1}, "servicios": []}))
        self.assertIn("SIN LATIDO", t)
        self.assertIn("guardián de main sin pasada", t)
        self.assertIn("CPU última hora ? %", t)
        self.assertNotIn("vivo (", t)

    def test_sin_nodo_no_hay_linea(self):
        self.assertNotIn("Nodo de MetaGenesis", self.texto_con(None))


if __name__ == "__main__":
    unittest.main()
