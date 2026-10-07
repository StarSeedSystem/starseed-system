"""Pruebas de scripts/puente/optimizador_metricas.py (§2 del contrato).

unittest puro, dobles en memoria y rutas temporales; sin red ni disco real.
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import optimizador_metricas as om

BASE = datetime(2026, 10, 4, 12, 0, 0).timestamp()


def e(segundos):
    return datetime.fromtimestamp(BASE + segundos).strftime("%Y-%m-%d %H:%M:%S")


def paso(t, paso, **datos):
    return {"t": e(t), "paso": paso, "_t": BASE + t, **datos}


def evento(t, tipo, tarea, texto=""):
    return {"t": e(t), "tipo": tipo, "tarea": tarea, "texto": texto, "_t": BASE + t}


class TestVacio(unittest.TestCase):
    def test_fuentes_vacias_todo_null(self):
        m = om.medir({}, BASE)
        for clave in om.CLAVES:
            self.assertIsNone(m[clave], clave)
        self.assertEqual(sorted(m["faltan"].keys()), sorted(om.CLAVES))


class TestTresTareas(unittest.TestCase):
    """T1 integrada con kimi, T2 sin cambios con kimi, T3 colgada con glm."""

    def setUp(self):
        self.fuentes = {
            "pasos": {
                "T1": [paso(0, "escritura", modelo="kimi", segundos=100),
                       paso(100, "tsc", errores_antes=0, errores_despues=0),
                       paso(200, "tests", resultado="ok", segundos=50),
                       paso(400, "integracion", segundos_total=20)],
                "T2": [paso(0, "escritura", modelo="kimi", segundos=80),
                       paso(90, "tsc", errores_antes=3, errores_despues=2)],
                "T3": [paso(0, "escritura", modelo="glm", segundos=300)],
            },
            "eventos": [
                evento(400, "commit", "T1", "abc integrado en main"),
                evento(150, "sin_cambios", "T2", "sin cambios reales"),
                evento(500, "estancado", "T3", "300 s sin crecer: medio COLGADO"),
            ],
        }
        self.m = om.medir(self.fuentes, BASE + 600, ventana_h=6)

    def test_modelos(self):
        mo = self.m["modelos"]
        self.assertEqual(mo["kimi"],
                         {"intentos": 2, "con_cambios": 1, "integradas": 1,
                          "sin_cambios": 1, "colgados": 0, "segundos_mediana": 90.0,
                          "tasa": 0.5})
        self.assertEqual(mo["glm"],
                         {"intentos": 1, "con_cambios": 0, "integradas": 0,
                          "sin_cambios": 0, "colgados": 1, "segundos_mediana": 300.0,
                          "tasa": 0.0})

    def test_fases(self):
        f = self.m["fases"]
        self.assertEqual(f["escritura"]["n"], 3)
        self.assertEqual(f["escritura"]["segundos_mediana"], 100.0)
        self.assertEqual(f["tests"]["fallos"], 0)
        self.assertEqual(f["tsc"]["fallos"], 1)

    def test_fraccion_escribiendo(self):
        # total = 400 (T1) + 90 (T2) + 0 (T3, un solo paso) = 490; escritura = 100+80 = 180 → cap por tarea ya incluido en suma
        self.assertAlmostEqual(self.m["fracción_escribiendo"], round(180 / 490, 4))

    def test_integradas_h(self):
        self.assertAlmostEqual(self.m["integradas_h"], round(1 / 6, 2))

    def test_sin_usar(self):
        fuentes = dict(self.fuentes)
        fuentes["pasarelas"] = {"pasarelas": [
            {"clave": "openrouter", "modelo": "kimi-k3", "estado": "escribe",
             "modelos_extra": ["nuevo-free:free"]},
            {"clave": "niebla", "modelo": "roto", "estado": "modelo_fuera"},
        ]}
        # rotación visible = modelos que escribieron en la ventana → hay "kimi" y "glm"
        sin = om.medir(fuentes, BASE + 600)["sin_usar"]
        self.assertIn("openrouter/nuevo-free:free", sin)
        self.assertIn("openrouter/kimi-k3", sin)
        self.assertNotIn("niebla/roto", sin)


class TestCargarFuentes(unittest.TestCase):
    def test_raiz_vacia_no_revienta(self):
        with tempfile.TemporaryDirectory() as raiz, tempfile.TemporaryDirectory() as home:
            f = om.cargar_fuentes(raiz, home, ahora=BASE)
        self.assertEqual(f, {})

    def test_eventos_solo_24h_y_rotos_no_rompen(self):
        with tempfile.TemporaryDirectory() as raiz, tempfile.TemporaryDirectory() as home:
            olas = os.path.join(raiz, "starseed_memory_root", "olas")
            os.makedirs(os.path.join(olas, "pasos"))
            viejo = evento(-30 * 3600, "commit", "TV", "viejo")
            reciente = evento(-600, "commit", "TR", "reciente")
            with open(os.path.join(olas, "eventos.jsonl"), "w", encoding="utf-8") as fh:
                fh.write("línea rota sin json\n")
                fh.write(json.dumps(viejo, ensure_ascii=False) + "\n")
                fh.write(json.dumps(reciente, ensure_ascii=False) + "\n")
            with open(os.path.join(olas, "pasos", "TR.jsonl"), "w", encoding="utf-8") as fh:
                fh.write(json.dumps(paso(-300, "escritura", modelo="kimi", segundos=10)) + "\n")
            with open(os.path.join(olas, "pasos", "VIEJO.jsonl"), "w", encoding="utf-8") as fh:
                fh.write(json.dumps(paso(-900000, "escritura", modelo="x", segundos=1)) + "\n")
            os.utime(os.path.join(olas, "pasos", "VIEJO.jsonl"), (BASE - 900000, BASE - 900000))
            with open(os.path.join(olas, "progreso.json"), "w", encoding="utf-8") as fh:
                fh.write("{roto")
            f = om.cargar_fuentes(raiz, home, ahora=BASE)
        self.assertEqual([e["tarea"] for e in f["eventos"]], ["TR"])
        self.assertIn("TR", f["pasos"])
        self.assertNotIn("progreso", f)


class TestProduccion(unittest.TestCase):
    """§5 del director de producción leído de un historial falso en memoria."""

    @staticmethod
    def lote(t, modelos, revertido=False, latencia=None):
        d = {"t": e(t), "_t": BASE + t, "modelos": modelos, "revertido": revertido}
        if latencia is not None:
            d["latencia_peticion_publicacion"] = latencia
        return d

    def setUp(self):
        dia = 86400
        self.historial = [
            self.lote(-1 * dia, ["kimi"], latencia=600.0),
            self.lote(-2 * dia, ["kimi", "glm"], revertido=True, latencia=1800.0),
            self.lote(-3 * dia, ["kimi"], latencia=1200.0),
            self.lote(-1 * dia, ["glm"], revertido=True, latencia=900.0),
            self.lote(-10 * dia, ["kimi"], revertido=True),  # fuera de los 7 días
        ]

    def test_tasa_reversion_minimo_3_lotes(self):
        m = om.medir({"produccion_historial": self.historial}, BASE)
        p = m["produccion"]
        self.assertEqual(m["faltan"].get("produccion"), None)
        self.assertEqual(p["lotes_ventana"], 4)
        # kimi: 3 lotes en la ventana, 1 revertido → opina; glm: 2 lotes → calla
        self.assertEqual(p["tasa_reversion_modelo"],
                         {"kimi": {"lotes": 3, "revertidos": 1,
                                   "tasa_reversion": round(1 / 3, 3)}})

    def test_latencia_mediana_y_p90(self):
        m = om.medir({"produccion_historial": self.historial}, BASE)
        lat = m["produccion"]["latencia_peticion_publicacion"]
        self.assertEqual(lat["n"], 4)
        self.assertEqual(lat["mediana_s"], 1050.0)  # mediana de 600/900/1200/1800
        self.assertEqual(lat["p90_s"], 1800.0)

    def test_sin_historial_es_null_con_motivo(self):
        m = om.medir({}, BASE)
        self.assertIsNone(m["produccion"])
        self.assertIn("produccion", m["faltan"])

    def test_historial_sin_lotes_recientes(self):
        m = om.medir({"produccion_historial": [self.lote(-30 * 86400, ["kimi"])]}, BASE)
        self.assertIsNone(m["produccion"])
        self.assertIn("7 días", m["faltan"]["produccion"])

    def test_cargar_fuentes_lee_historial_produccion(self):
        with tempfile.TemporaryDirectory() as raiz, tempfile.TemporaryDirectory() as home:
            prod = os.path.join(home, ".starseed", "produccion")
            os.makedirs(prod)
            reciente = {"t": e(-3600), "modelos": ["kimi"], "revertido": False}
            viejo = {"t": e(-30 * 86400), "modelos": ["glm"], "revertido": True}
            with open(os.path.join(prod, "historial.jsonl"), "w", encoding="utf-8") as fh:
                fh.write(json.dumps(viejo, ensure_ascii=False) + "\n")
                fh.write(json.dumps(reciente, ensure_ascii=False) + "\n")
            fh = om.cargar_fuentes(raiz, home, ahora=BASE)
        self.assertEqual([l["modelos"] for l in fh["produccion_historial"]], [["kimi"]])
        m = om.medir(fh, BASE)
        self.assertEqual(m["produccion"]["lotes_ventana"], 1)


if __name__ == "__main__":
    unittest.main()
