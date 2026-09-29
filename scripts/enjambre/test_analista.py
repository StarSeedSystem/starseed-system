# -*- coding: utf-8 -*-
"""Pruebas del analista de los sueños profundos, con un `llamar_llm` FALSO.

Ninguna llama a la red. Lo que vigilan es conducta: qué estado queda en progreso, qué
eventos salen al bus (pocos), qué pasa con un 429, con un aviso de cuota y sin proveedores,
que la lectura se comparte entre lentes y que el informe se deja leer con dream_a_cola.
"""
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
import time
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
sys.path.insert(0, os.path.join(os.path.dirname(DIRECTORIO), "puente"))

import analista as A  # noqa: E402
import dream_a_cola as D  # noqa: E402

CODIGO = "\n".join(
    ["export function sondear() {"]
    + ["  // línea %d" % i for i in range(2, 40)]
    + ["  setInterval(() => fetch('/rest/v1/os_mesh_relay'), 1000);", "}"]
)


def tarea(lente="rendimiento-consumo", tid="SA09293", **extra):
    t = {
        "id": tid, "ola": "Sueños profundos 2026-09-29", "titulo": "Sueño · Voz × Rendimiento",
        "tipo": "analisis", "area": "voz", "area_nombre": "Voz", "area_descripcion": "Voces",
        "lente": lente, "sesion": "2026-09-29", "archivos": ["src/lib/voz/motor.ts", "src/lib/voz/no-existe.ts"],
        "depende": [], "prompt": "x" * 30, "pausa_s": 0,
    }
    t.update(extra)
    return t


class Flota(object):
    """Un llamar_llm falso que contesta según la fase que reconoce en el prompt."""

    def __init__(self, fallos=None, refutar=True):
        self.llamadas = []
        self.fallos = dict(fallos or {})  # prov -> [excepción o texto, …] en orden
        self.refutar = refutar

    def __call__(self, prov, modelo, prompt, timeout=120, max_tokens=2500):
        self.llamadas.append((prov, modelo, self.fase(prompt)))
        cola = self.fallos.get(prov)
        if cola:
            r = cola.pop(0)
            if isinstance(r, Exception):
                raise r
            return r
        return self.respuesta(prompt)

    @staticmethod
    def fase(prompt):
        if "VERIFICADOR" in prompt:
            return "contraste"
        if "sintetizador" in prompt:
            return "reduce"
        return "map"

    def respuesta(self, prompt):
        f = self.fase(prompt)
        if f == "map":
            rutas = re.findall(r"=== archivo: (\S+) ", prompt)
            obs = []
            for lente in A.IDS_LENTES:
                obs.append({"lente": lente, "archivo": rutas[0], "linea": 40, "tipo": "riesgo",
                            "texto": "sondeo cada segundo sin freno (%s)" % lente, "impacto": 5,
                            "esfuerzo": 1, "confianza": 0.9})
            return "Aquí va:\n```json\n%s\n```" % json.dumps({"observaciones": obs})
        if f == "reduce":
            return json.dumps({"resumen": "Un sondeo sin freno.", "hallazgos": [
                {"titulo": "Limitar el sondeo de os_mesh_relay", "seccion": "riesgo",
                 "archivo": "src/lib/voz/motor.ts", "linea": 40, "impacto": 5, "esfuerzo": 1,
                 "confianza": 0.8, "detalle": "setInterval de 1 s contra Supabase.",
                 "propuesta": {"titulo": "Frenar el sondeo", "archivos": ["src/lib/voz/motor.ts", "a", "b", "c"],
                               "cambio": "esLider() y visibilidad"}},
                {"titulo": "Unificar el cliente de fetch", "seccion": "mejora",
                 "archivo": "motor.ts", "linea": 2, "impacto": 2, "esfuerzo": 2, "confianza": 0.6,
                 "detalle": "d", "propuesta": {"titulo": "p", "archivos": [], "cambio": "c"}},
                {"titulo": "Inventar un archivo", "seccion": "idea", "archivo": "src/fantasma.ts",
                 "linea": 999, "impacto": 3, "esfuerzo": 3, "confianza": 0.8, "detalle": "d"},
            ]})
        vered = [{"i": 0, "veredicto": "confirmado", "nota": "se ve el setInterval"},
                 {"i": 1, "veredicto": "refutado" if self.refutar else "dudoso", "nota": "no hay fetch duplicado"},
                 {"i": 2, "veredicto": "dudoso", "nota": "la cita no existe"}]
        return json.dumps({"veredictos": vered})


class Entorno(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="suenos-")
        os.makedirs(os.path.join(self.dir, "src", "lib", "voz"))
        with open(os.path.join(self.dir, "src", "lib", "voz", "motor.ts"), "w", encoding="utf-8") as f:
            f.write(CODIGO + "\nconst k = 'sk-abcdefghijklmnopqrstuvwxyz0123';\n")
        self.estados, self.eventos, self.latidos, self.dormidas, self.log = [], [], [], [], []
        self.reloj = [1000.0]

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def dormir(self, s):
        self.dormidas.append(s)
        self.reloj[0] += s

    def correr(self, t, flota, **kw):
        return A.ejecutar(
            t, flota,
            evento=lambda tipo, tid, texto, datos=None: self.eventos.append((tipo, tid, texto, datos or {})),
            set_estado=lambda tid, **k: self.estados.append(dict(k, tid=tid)),
            latir=lambda tid, fase, **k: self.latidos.append((fase, k)),
            raiz=self.dir, log=self.log.append, dormir=self.dormir, reloj=lambda: self.reloj[0],
            rotar=False, **kw
        )


class CaminoFeliz(Entorno):
    def test_informe_con_mapa_sintesis_y_contraste(self):
        flota = Flota()
        inf = self.correr(tarea(), flota)
        self.assertIsNotNone(inf)
        self.assertEqual(self.estados[0]["estado"], "en_curso")
        self.assertEqual(self.estados[-1]["estado"], "informe")
        self.assertEqual(self.estados[-1]["hallazgos"], 2)
        # Al bus, pocos y gruesos: un inicio y un informe.
        self.assertEqual([e[0] for e in self.eventos], ["inicio", "informe"])
        # Lo refutado sale del informe pero queda dicho.
        titulos = [h["titulo"] for h in inf["hallazgos"]]
        self.assertIn("Limitar el sondeo de os_mesh_relay", titulos)
        self.assertEqual([h["titulo"] for h in inf["descartados"]], ["Unificar el cliente de fetch"])
        # La cita inventada no se tira: baja de confianza y se marca.
        fantasma = [h for h in inf["hallazgos"] if h["archivo"] == "src/fantasma.ts"][0]
        self.assertFalse(fantasma["cita_valida"])
        self.assertLess(fantasma["confianza"], 0.4)
        # Propuesta ≤ 3 archivos.
        self.assertLessEqual(len(inf["hallazgos"][0]["propuesta"]["archivos"]), 3)
        # El contraste lo hace OTRO proveedor que la síntesis.
        sint = inf["modelos"]["sintesis"].split("/")[0]
        cont = inf["modelos"]["contraste"].split("/")[0]
        self.assertNotEqual(sint, cont)
        # Archivos en disco, con el formato del Dream que dream_a_cola sabe leer.
        base = os.path.join(self.dir, "starseed_memory_root", "dream", "profundo", "2026-09-29", "voz--rendimiento-consumo")
        md = open(base + ".md", encoding="utf-8").read()
        s = D.secciones(md)
        self.assertIn("top 3 accionables", s)
        self.assertIn("riesgos", s)
        self.assertTrue(D.puntos(s["top 3 accionables"]))
        self.assertIn("`src/lib/voz/motor.ts:40`", md)
        self.assertEqual(json.load(open(base + ".json", encoding="utf-8"))["id"], "SA09293")
        # Latidos con fase «analizando», tokens y avance fresco.
        fases = {f for f, _ in self.latidos}
        self.assertEqual(fases, {"analizando"})
        ultimo = self.latidos[-1][1]
        self.assertGreater(ultimo["tokens"]["llamadas"], 0)
        self.assertEqual(ultimo["tipo"], "analisis")
        self.assertIn("avance", ultimo)

    def test_nunca_manda_una_clave_a_un_modelo(self):
        flota = Flota()
        prompts = []
        def espia(prov, modelo, prompt, timeout=120, max_tokens=2500):
            prompts.append(prompt)
            return flota(prov, modelo, prompt, timeout, max_tokens)
        self.correr(tarea(), espia)
        self.assertTrue(prompts)
        self.assertFalse(any("sk-abcdefghijklmnopqrstuvwxyz0123" in p for p in prompts))
        self.assertTrue(any("[REDACTADO]" in p for p in prompts))

    def test_la_lectura_se_comparte_entre_lentes_de_la_misma_area(self):
        flota = Flota()
        self.correr(tarea("rendimiento-consumo", "SA09293"), flota)
        mapas_primera = sum(1 for c in flota.llamadas if c[2] == "map")
        self.assertGreaterEqual(mapas_primera, 1)
        flota2 = Flota()
        inf = self.correr(tarea("arquitectura-deuda", "SA09291"), flota2)
        self.assertEqual(sum(1 for c in flota2.llamadas if c[2] == "map"), 0)
        self.assertEqual(inf["trozos_propios"], 0)
        self.assertEqual(self.estados[-1]["estado"], "informe")

    def test_un_informe_existente_no_se_repite(self):
        self.correr(tarea(), Flota())
        flota = Flota()
        self.estados.clear()
        self.eventos.clear()
        inf = self.correr(tarea(), flota)
        self.assertEqual(flota.llamadas, [])
        self.assertEqual(self.estados[-1]["estado"], "informe")
        self.assertEqual(self.eventos, [])
        self.assertEqual(inf["id"], "SA09293")

    def test_privado_no_cuenta_titulos_al_bus(self):
        self.correr(tarea("seguridad-privacidad", "SA09294"), Flota())
        tipo, _, texto, datos = self.eventos[-1]
        self.assertEqual(tipo, "informe")
        self.assertTrue(datos["privado"])
        self.assertNotIn("sondeo", texto)
        md = open(os.path.join(self.dir, "starseed_memory_root", "dream", "profundo", "2026-09-29",
                               "voz--seguridad-privacidad.md"), encoding="utf-8").read()
        self.assertIn("PRIVADO", md)


class Cuotas(Entorno):
    def test_un_429_enfria_y_prueba_otro_sin_esperar(self):
        flota = Flota(fallos={"llm7": [RuntimeError("HTTP Error 429: Too Many Requests")]})
        inf = self.correr(tarea(), flota)
        self.assertIsNotNone(inf)
        self.assertEqual(flota.llamadas[0][0], "llm7")
        self.assertNotEqual(flota.llamadas[1][0], "llm7")
        self.assertNotIn(75, self.dormidas)

    def test_con_un_solo_proveedor_el_429_se_espera(self):
        solo = lambda p: p == "llm7"  # noqa: E731
        flota = Flota(fallos={"llm7": [RuntimeError("HTTP Error 429")]})
        inf = self.correr(tarea(), flota, disponible=solo)
        # Espera (en tramos con latido) y reintenta el mismo; el contraste no tiene a nadie
        # distinto de la síntesis y el informe sale igual, con menos confianza.
        self.assertTrue(self.dormidas)
        self.assertGreaterEqual(sum(self.dormidas), 60)
        self.assertIsNotNone(inf)
        self.assertEqual(inf["modelos"]["contraste"], "")
        self.assertTrue(all(h["contraste"] == "sin_veredicto" for h in inf["hallazgos"]))
        self.assertTrue(any("esperando proveedor" in (k.get("subfase") or "") for _, k in self.latidos))

    def test_aviso_de_cuota_como_respuesta_aparta_al_proveedor(self):
        marcados = []
        flota = Flota(fallos={"llm7": ["Sorry, to prevent abuse of free resources, accounts that have not been recharged"]})
        inf = self.correr(tarea(), flota, es_aviso_de_cuota=lambda s: "have not been recharged" in s,
                          marcar_sin_cupo=lambda p, m: marcados.append(p))
        self.assertIsNotNone(inf)
        self.assertEqual(marcados, ["llm7"])
        self.assertEqual(sum(1 for c in flota.llamadas if c[0] == "llm7"), 1)

    def test_sin_proveedores_es_fallo_y_suelta_el_reclamo(self):
        def sin_clave(prov, modelo, prompt, timeout=120, max_tokens=2500):
            raise RuntimeError("sin clave " + prov)
        inf = self.correr(tarea(), sin_clave)
        self.assertIsNone(inf)
        self.assertEqual(self.estados[-1]["estado"], "fallo")
        self.assertEqual(self.eventos[-1][0], "fallo")
        reclamos = os.path.join(self.dir, "starseed_memory_root", "dream", "profundo", "2026-09-29", ".reclamos")
        self.assertEqual(os.listdir(reclamos), [])

    def test_todo_caido_espera_hasta_el_plazo_y_falla(self):
        inf = self.correr(tarea(), Flota(), disponible=lambda p: False, espera_proveedor_s=300)
        self.assertIsNone(inf)
        self.assertGreaterEqual(sum(self.dormidas), 300)
        self.assertIn("sin proveedores", self.estados[-1]["nota"])

    def test_openrouter_solo_free_y_nada_de_pago(self):
        self.assertTrue(A.es_gratuito("openrouter", "x/y:free"))
        self.assertFalse(A.es_gratuito("openrouter", "x/y"))
        self.assertFalse(A.es_gratuito("anthropic", "claude"))
        for lista in (A.MAP_RAPIDOS, A.REDUCE_CAPACES, A.CONTRASTE):
            self.assertTrue(all(A.es_gratuito(p, m) for p, m in lista))


class Reclamos(Entorno):
    def test_otro_orquestador_vivo_lo_tiene(self):
        dir_rec = os.path.join(self.dir, "starseed_memory_root", "dream", "profundo", "2026-09-29", ".reclamos")
        os.makedirs(dir_rec)
        with open(os.path.join(dir_rec, "sa09293.json"), "w") as f:
            json.dump({"pid": os.getpid(), "host": A.socket.gethostname(), "t": self.reloj[0]}, f)
        flota = Flota()
        self.assertIsNone(self.correr(tarea(), flota))
        self.assertEqual(flota.llamadas, [])
        self.assertEqual(self.estados, [])


class Piezas(unittest.TestCase):
    def test_trozos_deterministas_y_numerados(self):
        lineas = {"a.ts": ["x" * 100] * 400, "b.ts": ["y"] * 3}
        t1 = A.trozos_de(lineas, ["a.ts", "b.ts"])
        t2 = A.trozos_de(lineas, ["a.ts", "b.ts"])
        self.assertEqual([t["hash"] for t in t1], [t["hash"] for t in t2])
        self.assertGreater(len(t1), 1)
        self.assertTrue(all(len(t["texto"]) <= A.TROZO_CARACTERES + 200 for t in t1))
        self.assertIn("=== archivo: a.ts (líneas 1-", t1[0]["texto"])
        self.assertIn("\n1| ", t1[0]["texto"])
        cubiertas = sum(p["hasta"] - p["desde"] + 1 for t in t1 for p in t["partes"] if p["archivo"] == "a.ts")
        self.assertEqual(cubiertas, 400)

    def test_sanear_no_mueve_lineas(self):
        texto = "a\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz\nghp_%s\nfin" % ("Z" * 30)
        limpio = A.sanear(texto)
        self.assertEqual(len(limpio.splitlines()), 4)
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz", limpio)
        self.assertNotIn("Z" * 30, limpio)

    def test_extraer_json_tolera_vallas_y_comas(self):
        self.assertEqual(A.extraer_json('bla ```json\n{"a": [1,2,],}\n``` fin'), {"a": [1, 2]})
        self.assertIsNone(A.extraer_json("nada"))

    def test_clave_igual_que_dream_a_cola(self):
        for t in ("Governor de troncos (CPU contention)", "¡Unificar 3 motores!", ""):
            self.assertEqual(A.clave(t), D.clave(t))

    def test_tope_de_analisis(self):
        self.assertEqual(A.tope_analisis([], None, None), 5)
        self.assertEqual(A.tope_analisis([{"tope_analisis": 7}], None, None), 7)
        self.assertEqual(A.tope_analisis([{"tope_analisis": 7}], "3", None), 3)
        self.assertEqual(A.tope_analisis([], None, 350), 2)
        self.assertEqual(A.tope_analisis([], None, 150), 1)
        self.assertEqual(A.tope_analisis([], "99", 9000), 12)
        self.assertTrue(A.es_analisis({"tipo": "analisis"}))
        self.assertFalse(A.es_analisis({"tipo": "codigo"}))


class Orquestador(unittest.TestCase):
    """La rama temprana del orquestador: una tarea de análisis no crea worktree ni puertas,
    y `informe` es un estado terminal distinto de `sin_cambios`."""

    @classmethod
    def setUpClass(cls):
        ruta = os.path.join(DIRECTORIO, "starseed-enjambre.py")
        espec = importlib.util.spec_from_file_location("enjambre_suenos", ruta)
        cls.E = importlib.util.module_from_spec(espec)
        espec.loader.exec_module(cls.E)

    def test_informe_es_terminal_y_no_es_sin_cambios(self):
        self.assertIn("informe", self.E.ESTADOS_TERMINADOS)
        self.assertIn("sin_cambios", self.E.ESTADOS_TERMINADOS)

    def test_la_rama_de_analisis_no_toca_git(self):
        E = self.E
        llamado = {}
        viejo_wt, viejo_ej = E.worktree, E._analista.ejecutar
        try:
            E.worktree = lambda tid: (_ for _ in ()).throw(AssertionError("no debe crear worktree"))
            E._analista.ejecutar = lambda t, llamar, **kw: llamado.update(t=t, kw=kw) or {"id": t["id"]}
            E.ejecutar({"id": "SA09299", "tipo": "analisis", "area": "voz", "lente": "coherencia-triada"})
        finally:
            E.worktree, E._analista.ejecutar = viejo_wt, viejo_ej
        self.assertEqual(llamado["t"]["id"], "SA09299")
        for k in ("evento", "set_estado", "latir", "disponible", "raiz", "log", "paso_local"):
            self.assertIn(k, llamado["kw"])


if __name__ == "__main__":
    unittest.main()
