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
        # las claves nuevas también pueden faltar; solo verificamos las originales
        for clave in om.CLAVES:
            self.assertIn(clave, m["faltan"])


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


class TestProduccionHistorial(unittest.TestCase):
    def setUp(self):
        # historial falso: 7 días, varios lotes
        def hist(t, modelos, revertido=False, latencia=None):
            return {"_t": BASE + t, "modelos": modelos, "revertido": revertido, "latencia_peticion_publicacion": latencia}
        self.fuentes = {
            "produccion_historial": [
                hist(-1*86400, ["kimi"], revertido=False, latencia=120),
                hist(-2*86400, ["kimi"], revertido=True, latencia=200),
                hist(-3*86400, ["kimi"], revertido=False, latencia=180),
                hist(-4*86400, ["kimi"], revertido=True, latencia=150),
                hist(-1*86400, ["glm"], revertido=False, latencia=90),
                hist(-2*86400, ["glm"], revertido=False, latencia=110),
                # glm solo 2 lotes → no debe aparecer en tasa (mínimo 3)
            ]
        }
        self.m = om.medir(self.fuentes, BASE + 600)

    def test_tasa_reversion(self):
        tr = self.m["tasa_reversion_por_modelo"]
        self.assertIn("kimi", tr)
        self.assertEqual(tr["kimi"]["total"], 4)
        self.assertEqual(tr["kimi"]["reversiones"], 2)
        self.assertAlmostEqual(tr["kimi"]["tasa"], round(2/4,3))
        self.assertNotIn("glm", tr)  # menos de 3 lotes

    def test_latencia(self):
        lat = self.m["latencia_peticion_publicacion"]
        self.assertIsNotNone(lat)
        # valores: 120,200,180,150,90,110 → mediana 135? sorted 90,110,120,150,180,200 → mediana (120+150)/2=135
        self.assertAlmostEqual(lat["mediana"], 135.0)
        # p90 aproximado
        self.assertIsNotNone(lat["p90"])


if __name__ == "__main__":
    unittest.main()
