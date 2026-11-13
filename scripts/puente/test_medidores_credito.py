#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del recolector MC1007D con adaptadores falsos (sin red ni procesos)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidores_credito as mc  # noqa: E402

AHORA = datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City"))
ISO = AHORA.isoformat()


def med_bueno(mid="claude", pct=23):
    return {"id": mid, "proveedor": "x", "nombre": "N " + mid, "tipo": "plan", "plan": "suscripción",
            "ventanas": [{"id": "sesion", "etiqueta": "Sesión (5 h)", "usado_pct": pct,
                          "reinicia": "2026-10-06T18:10:00-06:00"},
                         {"id": "semana", "etiqueta": "Semana", "usado_pct": 41,
                          "reinicia": "2026-10-10T04:00:00-06:00"}],
            "saldo": None, "extras": {}, "fuente": "terminal", "leido": ISO,
            "ok": True, "obsoleto": False, "error": None, "enlace": "https://x"}


class PruebasRecolector(unittest.TestCase):
    def test_aislamiento_uno_lanza_los_otros_siguen(self):
        def explota(cfg, ahora):
            raise RuntimeError("boom")
        fake = {"claude_terminal": explota,
                "otro": lambda cfg, ahora: med_bueno("otro", 5)}
        config = [{"id": "claude", "tipo": "claude_terminal"}, {"id": "otro", "tipo": "otro"}]
        doc = mc.recoger(config, {}, AHORA, adaptadores=fake)
        self.assertFalse(doc["medidores"]["claude"]["ok"])
        self.assertTrue(doc["medidores"]["claude"]["obsoleto"])
        self.assertEqual(doc["medidores"]["claude"]["error"], "RuntimeError")
        self.assertTrue(doc["medidores"]["otro"]["ok"])
        self.assertEqual(doc["version"], 1)

    def test_cada_min_conserva_lectura_reciente(self):
        llamadas = []
        def fake(cfg, ahora):
            llamadas.append(cfg["id"])
            return med_bueno("x", 99)
        prev = {"medidores": {"x": med_bueno("x", 10)}}
        config = [{"id": "x", "tipo": "t", "cada_min": 60}]
        doc = mc.recoger(config, prev, AHORA + timedelta(minutes=5), adaptadores={"t": fake})
        self.assertEqual(llamadas, [])
        self.assertEqual(doc["medidores"]["x"]["ventanas"][0]["usado_pct"], 10)

    def test_obsoleto_conserva_lo_bueno(self):
        fake = {"t": lambda cfg, ahora: {"ok": False, "error": "http 401", "id": "x"}}
        prev = {"medidores": {"x": med_bueno("x", 30)}}
        doc = mc.recoger([{"id": "x", "tipo": "t"}], prev, AHORA, adaptadores=fake)
        m = doc["medidores"]["x"]
        self.assertTrue(m["obsoleto"])
        self.assertEqual(m["error"], "http 401")
        self.assertEqual(m["ventanas"][0]["usado_pct"], 30)
        self.assertEqual(m["nombre"], "N x")  # medidor parcial queda completo (nota dirección)

    def test_historial_acotado_y_solo_cambios(self):
        n = {"t": ISO, "v": {"sesion": 1}}
        prev = {"medidores": {"x": med_bueno("x", 1)}, "historial": {"x": [n] * 310}}
        fake = {"t": lambda cfg, ahora: med_bueno("x", 2)}
        doc = mc.recoger([{"id": "x", "tipo": "t"}], prev, AHORA, adaptadores=fake)
        self.assertEqual(len(doc["historial"]["x"]), 300)
        self.assertEqual(doc["historial"]["x"][-1]["v"], {"sesion": 2, "semana": 41})
        # Igual lectura no añade punto
        # (la dirección: el punto previo debe ser la MISMA lectura, con sus dos ventanas)
        n_igual = {"t": ISO, "v": {"sesion": 1, "semana": 41}}
        prev2 = {"medidores": {"x": med_bueno("x", 1)}, "historial": {"x": [dict(n_igual)]}}
        fake2 = {"t": lambda cfg, ahora: med_bueno("x", 1)}
        doc2 = mc.recoger([{"id": "x", "tipo": "t"}], prev2, AHORA, adaptadores=fake2)
        self.assertEqual(len(doc2["historial"]["x"]), 1)

    def test_statusline_mas_reciente_gana(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "sl.json")
            with open(ruta, "w") as f:
                json.dump({"t": (AHORA + timedelta(minutes=10)).isoformat(),
                           "five_hour": {"usado_pct": 77, "reinicia": "2026-10-06T23:00:00-06:00"},
                           "seven_day": {"usado_pct": 50, "reinicia": "2026-10-10T04:00:00-06:00"}}, f)
            m = mc.fusionar_statusline(med_bueno(), ruta)
            por_id = {w["id"]: w for w in m["ventanas"]}
            self.assertEqual(por_id["sesion"]["usado_pct"], 77)
            self.assertEqual(por_id["semana"]["usado_pct"], 50)
            self.assertIn("línea de estado", m["fuente"])
            # Statusline viejo no se aplica
            with open(ruta, "w") as f:
                json.dump({"t": (AHORA - timedelta(minutes=10)).isoformat(),
                           "five_hour": {"usado_pct": 99}}, f)
            self.assertEqual(mc.fusionar_statusline(med_bueno(), ruta)["ventanas"][0]["usado_pct"], 23)

    def test_puente_limites_y_ventana_30_min(self):
        guardado = []
        datos = {"lecturas": []}
        def leer_fake():
            return {"lecturas": list(datos["lecturas"])}
        def guardar_fake(nuevos, ruta):
            datos["lecturas"] = nuevos["lecturas"]
            guardado.append(ruta)
        med = med_bueno()
        med["ventanas"].append({"id": "semana-fable", "etiqueta": "Semana (Fable)",
                                "usado_pct": 0, "reinicia": "2026-10-10T04:00:00-06:00"})
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "limites.json")
            self.assertTrue(mc.puente_limites_claude(med, AHORA, leer_fake, guardar_fake, ruta))
            lec = datos["lecturas"][-1]
            self.assertEqual(lec["fuente"], "terminal")
            self.assertEqual(lec["sesion_pct"], 23)
            self.assertEqual(lec["modelo_nombre"], "Fable")
            # Otra igual antes de 30 min no añade
            self.assertFalse(mc.puente_limites_claude(med, AHORA + timedelta(minutes=5),
                                                      leer_fake, guardar_fake, ruta))
            self.assertEqual(len(datos["lecturas"]), 1)

    # SUP1113B (13-11): con la ventana de 5 h sin usar, la CLI no da la hora de reinicio de la sesión y el
    # puente lanzaba «porcentaje fuera de rango: sesion» (58 veces en dos días); con eso morían los demás medidores.
    PREVIO = "2026-10-06T17:50:00-06:00"  # la ventana anterior ya terminó (AHORA = 18:05)

    def _puente(self, med, previo=PREVIO):
        datos = {"lecturas": [{"t": "2026-10-06T15:00:00-06:00", "fuente": "terminal", "sesion_pct": 30,
                               "sesion_reinicio": previo, "semana_pct": 41,
                               "semana_reinicio": "2026-10-10T04:00:00-06:00"}]}
        def leer_fake():
            return {"lecturas": list(datos["lecturas"])}
        def guardar_fake(nuevos, ruta):
            datos["lecturas"] = nuevos["lecturas"]
        with tempfile.TemporaryDirectory() as tmp:
            ok = mc.puente_limites_claude(med, AHORA, leer_fake, guardar_fake, os.path.join(tmp, "l.json"))
        return ok, datos["lecturas"]

    def test_puente_sesion_sin_empezar_apunta_0_con_el_reinicio_anterior(self):
        med = med_bueno()
        med["ventanas"][0] = {"id": "sesion", "etiqueta": "Sesión (5 h)", "usado_pct": 0, "reinicia": None}
        ok, lecturas = self._puente(med)
        self.assertTrue(ok)
        lec = lecturas[-1]
        self.assertEqual((lec["sesion_pct"], lec["sesion_reinicio"], lec["semana_pct"]), (0, self.PREVIO, 41))
        # Sin la línea de la sesión y sin ninguna «Current …» por entender, igual.
        med2 = med_bueno()
        del med2["ventanas"][0]
        ok2, lecturas2 = self._puente(med2)
        self.assertTrue(ok2)
        self.assertEqual((lecturas2[-1]["sesion_pct"], lecturas2[-1]["sesion_reinicio"]), (0, self.PREVIO))

    def test_puente_sin_prueba_de_sesion_terminada_no_inventa_ni_lanza(self):
        sin_reinicio = med_bueno()
        sin_reinicio["ventanas"][0] = {"id": "sesion", "etiqueta": "Sesión (5 h)", "usado_pct": 0, "reinicia": None}
        # La ventana anterior aún no ha terminado: no se sabe qué pasa, no se apunta.
        ok, lecturas = self._puente(sin_reinicio, previo="2026-10-06T20:00:00-06:00")
        self.assertFalse(ok)
        self.assertEqual(len(lecturas), 1)
        # Con uso pero sin hora (formato raro), o sin sesión y con líneas sin entender: tampoco.
        con_uso = med_bueno()
        con_uso["ventanas"][0] = {"id": "sesion", "etiqueta": "Sesión (5 h)", "usado_pct": 7, "reinicia": None}
        self.assertFalse(self._puente(con_uso)[0])
        dudosa = med_bueno()
        del dudosa["ventanas"][0]
        dudosa["extras"] = {"lineas_sin_entender": 1}
        self.assertFalse(self._puente(dudosa)[0])

    def test_puente_seguro_no_tumba_la_pasada(self):
        import contextlib
        import io
        def explota(med, ahora):
            raise ValueError("porcentaje fuera de rango: sesion")
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertFalse(mc.puente_seguro(med_bueno(), AHORA, explota))
        self.assertEqual(err.getvalue().strip(),
                         "límites de Claude sin apuntar: ValueError: porcentaje fuera de rango: sesion")


class PruebasSalud(unittest.TestCase):
    def _salud(self, tmp, codex_pct, previa=None):
        ruta_s = os.path.join(tmp, "salud.json")
        ruta_c = os.path.join(tmp, "cerrojos", "salud.lock")
        base = {"codex": previa if previa is not None else {},
                "claude": {"sin_cupo_hasta": "2026-10-06 01:00:00", "motivo": "429"}}
        with open(ruta_s, "w") as f:
            json.dump(base, f)
        med = med_bueno("codex", 10)
        med["ventanas"].append({"id": "semana", "etiqueta": "Semana", "usado_pct": codex_pct,
                                "reinicia": "2026-10-09T22:12:51-06:00"})
        mc.alimentar_salud({"codex": med}, ruta_s, ruta_c, AHORA)
        with open(ruta_s) as f:
            return json.load(f)

    def test_codex_100_marca_y_luego_quita_solo_medidor(self):
        with tempfile.TemporaryDirectory() as tmp:
            salud = self._salud(tmp, 100)
            # Hora local de la máquina (en la Mac, -06:00 → igual; en un contenedor UTC, 04:12 del 10).
            local = datetime.fromisoformat("2026-10-09T22:12:51-06:00").astimezone()
            self.assertEqual(salud["codex"]["sin_cupo_hasta"], local.strftime("%Y-%m-%d %H:%M:%S"))
            self.assertTrue(salud["codex"]["motivo"].startswith("medidor:"))
            self.assertEqual(salud["claude"]["motivo"], "429")  # otros intactos
            salud2 = self._salud(tmp, 40)
            self.assertNotIn("sin_cupo_hasta", salud2["codex"])
            self.assertNotIn("motivo", salud2["codex"])

    def test_marca_ajena_no_se_toca(self):
        with tempfile.TemporaryDirectory() as tmp:
            ajena = {"sin_cupo_hasta": "2026-10-06 20:00:00", "motivo": "429"}
            salud = self._salud(tmp, 40, previa=dict(ajena))
            self.assertEqual(salud["codex"], ajena)

    def test_guardar_atomico_permisos(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "sub", "medidores.json")
            mc.guardar({"version": 1}, ruta)
            self.assertEqual(oct(os.stat(ruta).st_mode & 0o777), "0o600")
            with open(ruta) as f:
                self.assertEqual(json.load(f)["version"], 1)


if __name__ == "__main__":
    unittest.main()


class PruebasRevisionDireccion(unittest.TestCase):
    """Revisión de la dirección (2026-10-07): tope real y salud nunca borrada."""

    def test_un_adaptador_colgado_no_cuelga_el_recolector(self):
        import threading, time as _t
        suelta = threading.Event()
        def colgado(cfg, ahora):
            suelta.wait(10)
            return med_bueno("lento", 1)
        mc.TOPES_S["lento"] = 1
        try:
            t0 = _t.monotonic()
            doc = mc.recoger([{"id": "lento", "tipo": "lento"}], {}, AHORA, adaptadores={"lento": colgado})
            self.assertLess(_t.monotonic() - t0, 5)
            self.assertFalse(doc["medidores"]["lento"]["ok"])
        finally:
            suelta.set()
            mc.TOPES_S.pop("lento", None)

    def test_salud_rota_no_se_reescribe(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta_s = os.path.join(tmp, "salud.json")
            with open(ruta_s, "w") as f:
                f.write('{"claude": {"motivo": "429"')
            med = med_bueno("codex", 100)
            mc.alimentar_salud({"codex": med}, ruta_s, os.path.join(tmp, "c", "salud.lock"), AHORA)
            with open(ruta_s, encoding="utf-8") as f_s:
                self.assertEqual(f_s.read(), '{"claude": {"motivo": "429"')

    def test_sin_cambios_no_toca_el_archivo(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta_s = os.path.join(tmp, "salud.json")
            with open(ruta_s, "w") as f:
                json.dump({"claude": {"motivo": "429"}}, f)
            antes = os.stat(ruta_s).st_mtime_ns
            mc.alimentar_salud({"codex": med_bueno("codex", 40)}, ruta_s, os.path.join(tmp, "c", "salud.lock"), AHORA)
            self.assertEqual(os.stat(ruta_s).st_mtime_ns, antes)
