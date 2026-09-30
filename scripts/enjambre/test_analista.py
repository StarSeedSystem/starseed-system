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
            rotar=False, salud=kw.pop("salud", None) or A.SaludFlota(), **kw
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
        # Espera (en tramos con latido) a que el proveedor se enfríe y reintenta; el contraste
        # no tiene a nadie distinto de la síntesis y el informe sale igual, con menos confianza.
        self.assertTrue(self.dormidas)
        self.assertGreaterEqual(sum(self.dormidas), 30)
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


OBS = ('{"lente": "rendimiento-consumo", "archivo": "src/lib/voz/motor.ts", "linea": 40, "tipo": "riesgo", '
       '"texto": "setInterval de 1 s {sin freno}", "impacto": 5, "esfuerzo": 1, "confianza": 0.9}')


class JsonRobusto(unittest.TestCase):
    """Las tres formas REALES que tumbaron lecturas buenas el 2026-09-29 (logs/SA09293.log)."""

    def test_nemotron_razona_antes_del_json(self):
        texto = ("We need to output JSON only. Let's think: the code at line 40 does {setInterval} and "
                 "the schema is {\"observaciones\": [...]}. Also check {x: 1}. Final answer:\n"
                 '{"observaciones": [%s, %s]}' % (OBS, OBS.replace("40", "41")))
        d = A.extraer_json(texto, "observaciones")
        self.assertEqual(len(d["observaciones"]), 2)
        self.assertEqual(len(A.normalizar_observaciones(d, ["src/lib/voz/motor.ts"])), 2)

    def test_gpt_oss_cortado_por_max_tokens_rescata_lo_completo(self):
        texto = '{ "observaciones": [ %s, %s, { "lente": "pruebas-fiabilidad", "archivo": "src/lib/voz/motor.ts", "linea": 12, "tipo": "ri' % (OBS, OBS)
        d = A.extraer_json(texto, "observaciones")
        self.assertTrue(d["_rescatado"])
        self.assertEqual(len(d["observaciones"]), 2)

    def test_valla_con_prosa_y_eco_del_esquema(self):
        eco = '{"observaciones":[{"lente":"<id de la lente>","archivo":"<ruta>","linea":1}]}'
        texto = "Formato pedido: %s\nClaro, aquí va:\n```json\n{\"observaciones\": [%s, %s]}\n```\nEspero que sirva {nota}." % (eco, OBS, OBS)
        self.assertEqual(len(A.extraer_json(texto, "observaciones")["observaciones"]), 2)
        self.assertEqual(A.extraer_json("<think>{\"observaciones\": [%s]}</think> {\"observaciones\": []}" % OBS,
                                        "observaciones"), {"observaciones": []})

    def test_sintesis_cortada_conserva_el_resumen(self):
        h = '{"titulo": "Limitar el sondeo", "archivo": "src/lib/voz/motor.ts", "linea": 40, "impacto": 5, "esfuerzo": 1, "confianza": 0.8}'
        d = A.extraer_json('{"resumen": "Un sondeo \\"sin\\" freno.", "hallazgos": [%s, {"titulo": "Otro", "archi' % h, "hallazgos")
        self.assertEqual(d["resumen"], 'Un sondeo "sin" freno.')
        self.assertEqual(len(d["hallazgos"]), 1)

    def test_lista_suelta_y_nada(self):
        self.assertEqual(len(A.extraer_json("[%s]" % OBS, "observaciones")["observaciones"]), 1)
        self.assertIsNone(A.extraer_json("We need to output JSON but I will not.", "observaciones"))
        self.assertIsNone(A.extraer_json("", "observaciones"))


class FlotaViva(unittest.TestCase):
    def test_clasificar_fallos(self):
        C = A.clasificar_fallo
        self.assertEqual(C("HTTP Error 403: Forbidden"), A.MUERTO)
        self.assertEqual(C("HTTP Error 404: Not Found"), A.MUERTO)
        self.assertEqual(C("410 Gone"), A.MUERTO)
        self.assertEqual(C("The model `x` does not exist"), A.MUERTO)
        self.assertEqual(C("HTTP Error 429: Too Many Requests"), A.RITMO)
        self.assertEqual(C("HTTP Error 500: Internal Server Error"), A.SERVIDOR)
        self.assertEqual(C("The read operation timed out"), A.SERVIDOR)
        self.assertEqual(C("sin clave groq (sin cupo declarado en esta máquina)"), A.SIN_CLAVE)
        self.assertEqual(C("cuota agotada en aihubmix: free quota"), A.CUOTA)
        self.assertEqual(C("Request too large for model"), A.GRANDE)

    def test_flota_desde_el_informe_y_la_rotacion(self):
        informe = {"pasarelas": [
            {"clave": "google", "modelo": "gemini-3.5-flash-lite", "estado": "escribe"},
            {"clave": "groq", "modelo": "openai/gpt-oss-20b", "estado": "escribe"},
            {"clave": "nvidia", "modelo": "nvidia/nemotron-3-super-120b-a12b", "estado": "escribe"},
            {"clave": "apinex", "modelo": "free/glm-5.3-flash", "estado": "escribe"},
            {"clave": "freellmapi", "modelo": "auto", "estado": "lenta"},
            {"clave": "aihubmix", "modelo": "gpt-4o-mini", "estado": "sin_cupo"},
            {"clave": "openrouter", "modelo": "nex-agi/nex-n2.5-pro:free", "estado": "escribe",
             "modelos_extra": ["qwen/qwen3.8-max:free", "de/pago"]},
            {"clave": "xai", "modelo": "grok-4.6", "estado": "escribe"},
        ]}
        modelos = ["google/gemini-3.6-flash", "nvidia/moonshotai/kimi-k3", "nvidia/z-ai/glm-5.3", "xai/grok-4.6",
                   "apinex/free/gemini-3.8-flash", "openrouter/cohere/north-mini-code:free", "aihubmix/x-free",
                   "tokenrouter/z-ai/glm-5.3-free"]
        revisores = [("llm7", "minimax-m2.7"), ("aihubmix", "coding-glm-5.3-free")]
        llamables = {"gemini", "groq", "nim", "apinex", "freellmapi", "aihubmix", "openrouter", "llm7", "tokenrouter"}
        f = A.flota_desde(modelos, revisores, informe, {"xkiro": ("qwen/qwen3-coder-plus:free", ())}, llamables)
        todos = set(f["mapa"])
        self.assertEqual(todos, set(f["sintesis"]))
        for par in [("gemini", "gemini-3.5-flash-lite"), ("groq", "openai/gpt-oss-20b"),
                    ("nim", "nvidia/nemotron-3-super-120b-a12b"), ("apinex", "free/glm-5.3-flash"),
                    ("freellmapi", "auto"), ("gemini", "gemini-3.6-flash"), ("nim", "moonshotai/kimi-k3"),
                    ("openrouter", "qwen/qwen3.8-max:free"), ("llm7", "minimax-m2.7"), ("tokenrouter", "z-ai/glm-5.3-free")]:
            self.assertIn(par, todos)
        for p, _ in todos:
            self.assertNotIn(p, ("xai", "aihubmix", "xkiro"))  # pago · sin cupo según el informe · no llamable aquí
        self.assertNotIn(("openrouter", "de/pago"), todos)
        self.assertIn(f["sintesis"][0], [("gemini", "gemini-3.6-flash"), ("nim", "moonshotai/kimi-k3"),
                                         ("nim", "z-ai/glm-5.3"), ("apinex", "free/gemini-3.8-flash"),
                                         ("openrouter", "nex-agi/nex-n2.5-pro:free"), ("openrouter", "qwen/qwen3.8-max:free"),
                                         ("openrouter", "cohere/north-mini-code:free")])
        self.assertEqual(A.par_de("nvidia/nemotron-3-super-120b-a12b"), ("nim", "nvidia/nemotron-3-super-120b-a12b"))

    def test_un_modelo_muerto_no_se_vuelve_a_probar_en_toda_la_sesion(self):
        salud = A.SaludFlota()
        llamadas = []

        def llamar(p, m, prompt, timeout=120, max_tokens=2500):
            llamadas.append((p, m))
            if (p, m) == ("gemini", "gemini-2.5-flash-lite"):
                raise RuntimeError("HTTP Error 403: Forbidden")
            return '{"ok": 1}'
        flota = lambda: {"mapa": [("gemini", "gemini-2.5-flash-lite"), ("llm7", "gpt-oss")]}  # noqa: E731
        for tid in ("SA1", "SA2", "SA3"):
            ll = A.Llamador({"id": tid}, llamar, dormir=lambda s: None, rotar=False, flota=flota, salud=salud)
            dato, modelo = ll.llamar("lectura", "mapa", "p", A.extraer_json)
            self.assertEqual(modelo, "llm7/gpt-oss")
        self.assertEqual(llamadas.count(("gemini", "gemini-2.5-flash-lite")), 1)
        self.assertIn("gemini/gemini-2.5-flash-lite", salud.resumen()["muertos"])

    def test_por_turnos_entre_todos_y_el_cupo_lleno_al_final(self):
        salud = A.SaludFlota()
        usados = []
        reloj = [0.0]

        def llamar(p, m, prompt, timeout=120, max_tokens=2500, json_mode=False):
            usados.append((p, json_mode))
            reloj[0] += 1
            return '{"ok": 1}'
        flota = lambda: {"mapa": [("a", "m1"), ("b", "m2"), ("c", "m3")]}  # noqa: E731
        ll = A.Llamador({"id": "SA1"}, llamar, reloj=lambda: reloj[0], flota=flota, salud=salud,
                        cupo_libre=lambda p: p != "b")
        for _ in range(4):
            ll.llamar("lectura", "mapa", "p", A.extraer_json)
        # Por turnos entre los que tienen cupo por minuto libre; «b» (cupo lleno) espera al final.
        self.assertEqual([u[0] for u in usados], ["a", "c", "a", "c"])
        ll2 = A.Llamador({"id": "SA2"}, llamar, reloj=lambda: reloj[0], flota=flota, salud=salud,
                         cupo_libre=lambda p: False)
        ll2.llamar("lectura", "mapa", "p", A.extraer_json)
        self.assertEqual(usados[-1][0], "b")  # con todos llenos, el menos usado aunque tenga que esperar
        self.assertTrue(all(j for _, j in usados))  # pide JSON a quien sabe darlo

    def test_espera_releyendo_la_flota_y_revive(self):
        salud = A.SaludFlota()
        reloj = [0.0]
        estado = {"flota": {"mapa": [("a", "m1")]}, "refrescos": 0}

        def llamar(p, m, prompt, timeout=120, max_tokens=2500):
            if p == "a":
                raise RuntimeError("HTTP Error 500")
            return '{"ok": 1}'

        def refrescar():
            estado["refrescos"] += 1
            estado["flota"] = {"mapa": [("a", "m1"), ("b", "m2")]}

        def dormir(sg):
            reloj[0] += sg
        ll = A.Llamador({"id": "SA1"}, llamar, reloj=lambda: reloj[0], dormir=dormir, rotar=False,
                        flota=lambda: estado["flota"], refrescar=refrescar, salud=salud,
                        disponible=lambda p: reloj[0] > 200 or p != "a")
        dato, modelo = ll.llamar("lectura", "mapa", "p", A.extraer_json)
        self.assertEqual(modelo, "b/m2")
        self.assertGreaterEqual(estado["refrescos"], 1)
        self.assertLess(reloj[0], 45 * 60)


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
        self.assertEqual(A.tope_analisis([], None, None), 8)
        self.assertEqual(A.tope_analisis([{"tope_analisis": 7}], None, None), 7)
        self.assertEqual(A.tope_analisis([{"tope_analisis": 7}], "3", None), 3)
        self.assertEqual(A.tope_analisis([], None, 350), 4)
        self.assertEqual(A.tope_analisis([], None, 150), 1)
        self.assertEqual(A.tope_analisis([], "99", 9000), 12)
        self.assertTrue(A.es_analisis({"tipo": "analisis"}))
        self.assertFalse(A.es_analisis({"tipo": "codigo"}))


class ConsejoFalso(object):
    """Un decidir.py de mentira: lotes y elecciones programados, y las confirmaciones anotadas."""

    def __init__(self, lotes=None, eleccion=None):
        self.lotes = list(lotes or [])
        self.eleccion = eleccion
        self.llamadas_lote, self.llamadas_elegir, self.confirmadas = [], [], []

    def lote(self, estado, preguntas, quien=None, dominio=""):
        self.llamadas_lote.append((estado, preguntas, quien))
        r = self.lotes.pop(0) if self.lotes else None
        return r(estado, preguntas) if callable(r) else r

    def elegir(self, estado, pregunta, opciones, regla=None, quien=None, dominio=""):
        self.llamadas_elegir.append((estado, opciones, regla))
        r = self.eleccion(estado, opciones) if callable(self.eleccion) else self.eleccion
        return r or {"respuesta": regla, "medio": "regla"}

    def confirmar(self, exp, acierto, nota=""):
        self.confirmadas.append((exp, acierto))

    def consejo(self, **kw):
        return A.ConsejoJev(lote=self.lote, elegir=self.elegir, confirmar=self.confirmar,
                            estado=kw.pop("estado", None) or A.EstadoJev(), reloj=kw.pop("reloj", time.time), **kw)


def obs_de(ps):
    return [{"lente": "rendimiento-consumo", "archivo": "src/lib/voz/motor.ts", "linea": 10 + i, "tipo": "mejora",
             "texto": "observación %d" % i, "impacto": 3, "esfuerzo": 2, "confianza": 0.6} for i in range(len(ps))]


def respuestas_lote(ps, valores=None):
    def r(estado, preguntas):
        fuera = {}
        for o in estado["observaciones"]:
            k = o["i"]
            n = int(o["texto"].split()[-1])
            fuera["a%d" % k] = {"respuesta": "sí" if ps[n] >= 0.5 else "no", "p": ps[n]}
            if valores:
                fuera["v%d" % k] = {"respuesta": "alto", "valor": valores[n]}
        return {"respuestas": fuera, "medio": "openrouter", "experiencia": "e1"}
    return r


class JevEnLosSuenos(Entorno):
    """El protocolo común: Jev tría las observaciones y elige modelo en la zona de duda; si
    calla (sin motor, sin crédito), todo sigue igual que antes."""

    def test_el_triaje_cae_el_ruido_y_ordena_por_peso(self):
        ps = [0.9, 0.1, 0.05, 0.8, 0.6, 0.2]
        falso = ConsejoFalso([respuestas_lote(ps, [3, 0, 0, 1, 2, 0])])
        quedan, info = A.triar(tarea(), obs_de(ps), falso.consejo())
        self.assertEqual(sorted(o["texto"] for o in quedan), ["observación 0", "observación 3", "observación 4"])
        self.assertEqual((info["caidas"], info["respondidas"], info["lotes"]), (3, 6, 1))
        self.assertEqual(len(falso.llamadas_lote), 1)                    # un lote = una llamada
        self.assertEqual(len(falso.llamadas_lote[0][1]), 12)             # sí/no + valor por observación
        prompt = A.prompt_reduce(tarea(), quedan, 1)
        self.assertLess(prompt.index("observación 0"), prompt.index("observación 3"))
        self.assertIn('"p_jev": 0.9', prompt)
        self.assertIn("prioriza las altas", prompt)

    def test_nunca_cae_mas_del_sesenta_por_ciento(self):
        ps = [0.01] * 5
        quedan, info = A.triar(tarea(), obs_de(ps), ConsejoFalso([respuestas_lote(ps)]).consejo())
        self.assertEqual((len(quedan), info["caidas"]), (2, 3))

    def test_en_lotes_de_ocho_y_con_presupuesto(self):
        ps = [0.9] * 20
        falso = ConsejoFalso([respuestas_lote(ps)] * 5)
        quedan, info = A.triar(tarea(), obs_de(ps), falso.consejo(tope_triaje=2))
        self.assertEqual(len(falso.llamadas_lote), 2)     # 20 observaciones, tope de 2 llamadas
        self.assertEqual((len(quedan), info["respondidas"]), (20, 16))

    def test_jev_en_silencio_pasa_todo_y_el_circuito_se_abre(self):
        estado = A.EstadoJev()
        falso = ConsejoFalso([{"respuestas": {}, "medio": "regla"}] * 10)
        ps = [0.9] * 4
        for _ in range(3):
            quedan, info = A.triar(tarea(), obs_de(ps), falso.consejo(estado=estado, reloj=lambda: 100.0))
            self.assertEqual((len(quedan), info["caidas"], info["respondidas"]), (4, 0, 0))
        self.assertEqual(len(falso.llamadas_lote), 3)
        A.triar(tarea(), obs_de(ps), falso.consejo(estado=estado, reloj=lambda: 200.0))
        self.assertEqual(len(falso.llamadas_lote), 3)      # circuito abierto: ni se pregunta
        A.triar(tarea(), obs_de(ps), falso.consejo(estado=estado, reloj=lambda: 100.0 + A.JEV_PAUSA_S + 1))
        self.assertEqual(len(falso.llamadas_lote), 4)      # pasada la pausa, vuelve a preguntar

    def test_sobre_el_techo_la_pila_real_calla_y_no_gasta(self):
        """decidir.py + jev.py de verdad, con el gasto de hoy por encima del techo diario."""
        import decidir as DEC
        import experiencias as EXP
        import jev as J
        viejos = {(J, "USO"): J.USO, (J, "CACHE"): J.CACHE, (J, "_local"): J._local,
                  (J, "decidir_con_laya"): J.decidir_con_laya, (J, "activo"): J.activo,
                  (J, "_transporte_real"): J._transporte_real, (J, "TRANSPORTE"): J.TRANSPORTE,
                  (DEC, "JEV"): DEC.JEV, (DEC, "EXP"): DEC.EXP, (EXP, "RUTA"): EXP.RUTA, (EXP, "COPIA_DIR"): EXP.COPIA_DIR}
        red = []
        try:
            J.USO, J.CACHE = os.path.join(self.dir, "uso.json"), os.path.join(self.dir, "cache.json")
            EXP.RUTA, EXP.COPIA_DIR = os.path.join(self.dir, "exp.jsonl"), os.path.join(self.dir, "copia")
            with open(J.USO, "w") as f:
                json.dump({"dias": {time.strftime("%Y-%m-%d"): {"llamadas": 1, "coste_usd": J.PRESUPUESTO_DIA_USD + 0.01}}}, f)
            J._local = lambda: None
            J.decidir_con_laya = lambda *a, **k: None
            J.activo = lambda: True
            J.TRANSPORTE = None
            J._transporte_real = lambda cuerpo: red.append(cuerpo) or {"answers": {}}
            DEC.JEV, DEC.EXP = J, EXP
            ps = [0.9] * 5
            consejo = A.ConsejoJev(lote=DEC.consultar_lote, confirmar=DEC.confirmar, estado=A.EstadoJev())
            quedan, info = A.triar(tarea(), obs_de(ps), consejo)
        finally:
            for (obj, attr), v in viejos.items():
                setattr(obj, attr, v)
        self.assertEqual(red, [])                          # ni una llamada de pago
        self.assertEqual((len(quedan), info["respondidas"], info["caidas"]), (5, 0, 0))

    def test_la_sintesis_elige_con_jev_y_cierra_el_ciclo(self):
        elegido = "xkiro/qwen/qwen3.8-max:free"

        def eleccion(estado, opciones):
            if elegido in opciones and estado["sueño"]["rol"] == "sintesis":
                return {"respuesta": elegido, "confianza": 0.9, "medio": "local", "experiencia": "exp-ruta"}
            return None

        falso = ConsejoFalso(eleccion=eleccion)
        flota = Flota()
        inf = self.correr(tarea(), flota, consejo=falso.consejo())
        reduce = [c for c in flota.llamadas if c[2] == "reduce"]
        self.assertEqual(reduce[0][0], "xkiro")            # la regla por turnos habría ido a nim
        self.assertIn(("exp-ruta", True), falso.confirmadas)
        self.assertIn(["síntesis", elegido, 0.9], inf["jev"]["rutas"])
        self.assertTrue(any("Jev elige" in l for l in self.log))
        estado_visto = [e for e, _, _ in falso.llamadas_elegir if e["sueño"]["rol"] == "sintesis"][0]
        self.assertEqual(set(estado_visto["candidatos"][0]), {"id", "ok", "fallos", "forma"})

    def test_jev_ocupado_no_cuenta_como_silencio(self):
        estado = A.EstadoJev()
        falso = ConsejoFalso(eleccion=lambda e, ops: {"respuesta": ops[0], "medio": "regla", "ocupado": True})
        consejo = falso.consejo(estado=estado)
        for _ in range(5):
            self.assertIsNone(consejo.ruta({}, "¿?", ["a/x", "b/y"], regla="a/x"))
        self.assertEqual((estado.silencios, estado.llamadas, consejo.quedan["ruta"]), (0, 0, A.TOPE_JEV_RUTA))

    def test_con_poca_confianza_manda_el_turno(self):
        falso = ConsejoFalso(eleccion=lambda e, ops: {"respuesta": ops[1], "confianza": 0.3, "medio": "local"})
        flota = Flota()
        self.correr(tarea(), flota, consejo=falso.consejo())
        self.assertEqual([c for c in flota.llamadas if c[2] == "reduce"][0][0], "nim")

    def test_contexto_comun_en_la_sintesis_y_consejo_en_el_informe(self):
        prompts = []

        class Grabadora(Flota):
            def __call__(self, prov, modelo, prompt, timeout=120, max_tokens=2500):
                prompts.append(prompt)
                return Flota.__call__(self, prov, modelo, prompt, timeout, max_tokens)

        vistos = {}
        de_acuerdo = ConsejoFalso(eleccion=lambda e, ops: {"respuesta": ops[0], "confianza": 0.9, "medio": "local"})
        inf = self.correr(tarea(), Grabadora(), consejo=de_acuerdo.consejo(),
                          contexto=lambda **kw: vistos.update(kw) or "REGLA-DE-LA-CASA gsk_" + "x" * 20)
        sintesis = [p for p in prompts if "sintetizador" in p][0]
        self.assertIn("CONTEXTO COMÚN DE LOS AGENTES", sintesis)
        self.assertIn("REGLA-DE-LA-CASA", sintesis)
        self.assertNotIn("gsk_xxxx", sintesis)
        self.assertEqual((vistos["rol"], vistos["area"]), ("analista", "voz"))
        self.assertTrue(inf["jev"]["contexto"])
        md = open(os.path.join(self.dir, "starseed_memory_root", "dream", "profundo", "2026-09-29",
                               "voz--rendimiento-consumo.md"), encoding="utf-8").read()
        self.assertIn("Consejo de Jev", md)

    def test_sin_consejero_todo_como_antes(self):
        inf = self.correr(tarea(), Flota())
        self.assertNotIn("jev", inf)


class Orquestador(unittest.TestCase):
    """La rama temprana del orquestador: una tarea de análisis no crea worktree ni puertas,
    y `informe` es un estado terminal distinto de `sin_cambios`."""

    @classmethod
    def setUpClass(cls):
        ruta = os.path.join(DIRECTORIO, "starseed-enjambre.py")
        espec = importlib.util.spec_from_file_location("enjambre_suenos", ruta)
        cls.E = importlib.util.module_from_spec(espec)
        espec.loader.exec_module(cls.E)

    def test_set_estado_y_latir_a_la_vez_no_rompen(self):
        """SA092910 (2026-09-29): «dictionary changed size during iteration» con cinco sueños
        latiendo y guardando progreso a la vez. Ocho hilos, cientos de escrituras: ni una excepción."""
        import threading
        E = self.E
        d = tempfile.mkdtemp(prefix="carrera-")
        viejos = (E.PROG_JSON, E.PROG_MD, E.LAT_JSON, E.PROG, dict(E.LATIDOS))
        errores = []
        try:
            E.PROG_JSON, E.PROG_MD, E.LAT_JSON = (os.path.join(d, n) for n in ("p.json", "p.md", "l.json"))
            E.PROG = {}
            E.LATIDOS.clear()

            def trabajo(n):
                try:
                    for i in range(30):
                        tid = "C%d_%d" % (n, i)  # una tarea NUEVA cada vez: el dict crece mientras otro lo vuelca
                        E.set_estado(tid, estado="en_curso", nota="vuelta %d" % i, **{"k%d" % (i % 5): i})
                        E.latir(tid, "analizando", subfase="x%d" % i, **{"k%d" % (i % 5): i}, avance=time.time())
                except Exception as e:  # noqa: BLE001
                    errores.append(repr(e))

            hilos = [threading.Thread(target=trabajo, args=(n,)) for n in range(8)]
            for h in hilos:
                h.start()
            for h in hilos:
                h.join()
            self.assertEqual(errores, [])
            self.assertEqual(len(json.load(open(E.PROG_JSON))), 8 * 30)
        finally:
            E.PROG_JSON, E.PROG_MD, E.LAT_JSON, E.PROG = viejos[:4]
            E.LATIDOS.clear()
            E.LATIDOS.update(viejos[4])
            shutil.rmtree(d, ignore_errors=True)

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
        for k in ("evento", "set_estado", "latir", "disponible", "raiz", "log", "paso_local",
                  "flota", "cupo_libre", "refrescar", "consejo", "contexto"):
            self.assertIn(k, llamado["kw"])

    def test_el_orquestador_da_consejero_y_contexto_comun(self):
        E = self.E
        consejo = E._consejo_jev_analisis()
        self.assertIsInstance(consejo, E._analista.ConsejoJev)
        self.assertIs(consejo.estado, E._analista.JEV_SESION)   # circuito de la sesión, compartido
        texto = E._contexto_agente("analista", "mando", max_chars=1400, excluir=("herramientas",))
        self.assertIn("Contexto común · rol analista", texto)
        self.assertLessEqual(len(texto), 1400)

    def test_la_flota_viva_del_orquestador(self):
        E = self.E
        roles = E._flota_analisis(forzar=True)
        for rol in ("mapa", "sintesis", "contraste"):
            self.assertTrue(roles[rol], rol)
            for p, m in roles[rol]:
                self.assertIn(p, E.CUPOS)  # solo lo que llamar_llm sabe llamar
                self.assertNotIn(p, ("xai", "anthropic", "codex"))
                if p == "openrouter":
                    self.assertTrue(m.endswith(":free"))
        self.assertTrue(E._cupo_libre("llm7"))
        self.assertFalse(E._cupo_libre("no-existe"))

    def test_modo_json_se_pide_y_se_aprende_si_lo_rechazan(self):
        import io
        import urllib.error
        E = self.E
        cuerpos = []

        def falso(req, timeout=None):
            cuerpo = json.loads(req.data.decode())
            cuerpos.append(cuerpo)
            if "response_format" in cuerpo:
                raise urllib.error.HTTPError(req.full_url, 400, "Bad Request", {}, io.BytesIO(b"{}"))
            return io.BytesIO(json.dumps({"choices": [{"message": {"content": '{"ok": 1}'}}]}).encode())

        viejos = (E.urllib.request.urlopen, E._clave_para, dict(E.ENV))
        try:
            E.urllib.request.urlopen = falso
            E._clave_para = lambda prov: None
            E.ENV["OPENROUTER_API_KEY"] = "clave-de-prueba"
            E._SIN_MODO_JSON.discard("openrouter")
            txt = E.llamar_llm("openrouter", "x/y:free", "responde en json", timeout=5, max_tokens=4000, json_mode=True)
        finally:
            E.urllib.request.urlopen, E._clave_para = viejos[0], viejos[1]
            E.ENV.clear()
            E.ENV.update(viejos[2])
        self.assertEqual(txt, '{"ok": 1}')
        self.assertEqual(len(cuerpos), 2)
        self.assertEqual(cuerpos[0]["response_format"], {"type": "json_object"})
        self.assertNotIn("response_format", cuerpos[1])
        self.assertEqual(cuerpos[1]["max_tokens"], 4000)
        self.assertIn("openrouter", E._SIN_MODO_JSON)
        E._SIN_MODO_JSON.discard("openrouter")


if __name__ == "__main__":
    unittest.main()
