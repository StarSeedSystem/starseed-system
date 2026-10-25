"""Pruebas del lanzador de Cloudroom: la lógica es pura y las órdenes de room-cli y git se simulan
(nunca se ejecuta room-cli ni se sale a la red; el disco es una carpeta temporal)."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import nullcontext
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import cloudroom_lanzar as C  # noqa: E402
# (2026-10-24) Las pruebas no leen la config real de modelos de Pi.
import cloudroom_modelos as _CMP  # noqa: E402
_CMP.PI_MODELOS = "/nonexistent/cloudroom-pi-modelos.json"


AHORA = 1_800_000_000.0
DIA = 86400
ESTADO_NUBE = {"authenticated": True, "harnesses": [
    {"id": "codex", "models": [{"model": "gpt-6-luna"}, {"model": "gpt-5.6-terra"}, {"model": "gpt-5.6-luna"}]}]}


def fila(tarea, t, hilo=None, **extra):
    return dict({"tarea": tarea, "hilo": hilo or "h-" + tarea, "t": t}, **extra)


class Ritmo(unittest.TestCase):
    def test_plan_gratis_sin_uso_reparte_hacia_arriba(self):
        # (CAP1025C) 100 en 30 días → 4 al día (3,3 hacia arriba); con 3 hilos a la vez, 3 ahora.
        r = C.ritmo([], AHORA)
        self.assertEqual((r["hoy"], r["quedan"], r["por_dia"]), (3, 100, 4.0))
        self.assertIn("caben 3 (quedan 100 para 30 día(s): 4 al día, tope 6)", r["motivo"])

    def test_el_cupo_del_dia_se_cumple(self):
        ahora = C.medianoche(AHORA) + 12 * 3600  # mediodía local: el «hoy» no depende de la zona horaria
        reg = [fila(x, ahora - 60, final="traida") for x in "ABCD"]
        r = C.ritmo(reg, ahora)
        self.assertEqual((r["hoy"], r["quedan"]), (0, 96))
        self.assertIn("sin cupo hoy: ya van 4 hoy (quedan 96 para 30 día(s): 4 al día, tope 6)", r["motivo"])
        self.assertEqual(C.ritmo(reg[:3], ahora)["hoy"], 1)  # con 3 hoy aún cabe el cuarto

    def test_una_rafaga_de_ayer_no_para_el_dia_de_hoy(self):
        """(2026-10-25, medido a las 12:10) 47 hilos el 24-10 entre las 13 y las 19 h y 53 por usar: decía
        «sin cupo hoy: ya van 47 (ritmo 3,4 al día)». Ahora: 53 en 29 días → 2 hoy, y los 53 dentro del ciclo."""
        hoy0 = C.medianoche(AHORA)
        ahora = hoy0 + 12 * 3600 + 600  # hoy a las 12:10
        reg = [fila("B%d" % i, hoy0 - 11 * 3600 + i * 400, final="traida") for i in range(47)]  # ayer 13-19 h
        r = C.ritmo(reg, ahora)
        self.assertEqual((r["hoy"], r["quedan"], r["por_dia"]), (2, 53, 2.0))
        self.assertIn("2 al día, tope 6", r["motivo"])
        t, usados = ahora, 0
        while t < reg[0]["t"] + 30 * DIA - 1800:  # pasadas de 30 min hasta que el primero sale del ciclo
            for _ in range(C.ritmo(reg, t)["hoy"]):
                reg.append(fila("N%d" % usados, t, final="traida"))
                usados += 1
            t += 1800
        self.assertEqual(usados, 53)  # se usan todos…
        self.assertTrue(all(len([x for x in reg if 0 <= u - x["t"] < 30 * DIA]) <= 100
                            for u in [x["t"] for x in reg]))  # …y nunca más de 100 en 30 días

    def test_tope_diario(self):
        # Quedan 80 y el más viejo sale en 2 días: 40 al día → el tope, 6.
        reg = [fila("V%d" % i, AHORA - 28 * DIA, final="traida") for i in range(20)]
        r = C.ritmo(reg, AHORA, tope_dia=6, max_vivos=10)
        self.assertEqual((r["hoy"], r["por_dia"]), (6, 6.0))

    def test_ciclo_agotado_dice_sin_cupo(self):
        r = C.ritmo([], AHORA, total=100, usados_cuenta=100)
        self.assertEqual(r["hoy"], 0)
        self.assertTrue(r["motivo"].startswith("sin cupo:"))

    def test_lo_que_dice_la_cuenta_manda_si_es_mayor(self):
        self.assertEqual(C.ritmo([fila("A", AHORA - 5 * DIA, final="traida")], AHORA, usados_cuenta=40)["quedan"], 60)

    def test_hilos_viejos_salen_del_ciclo(self):
        reg = [fila("V%d" % i, AHORA - 31 * DIA, final="traida") for i in range(100)]
        self.assertEqual(C.ritmo(reg, AHORA)["quedan"], 100)

    def test_tope_de_hilos_abiertos(self):
        reg = [fila(x, AHORA - 2 * DIA) for x in "ABC"]
        r = C.ritmo(reg, AHORA)
        self.assertEqual(r["hoy"], 0)
        self.assertIn("3 hilos abiertos", r["motivo"])

    def test_con_poco_cupo_reparte_uno_cada_pocos_dias(self):
        # 98 usados, el más viejo sale del ciclo en 10 días: quedan 2 → uno cada 5 días.
        reg = [fila("V%d" % i, AHORA - 20 * DIA, final="traida") for i in range(97)]
        reciente = reg + [fila("R", AHORA - 2 * DIA, final="traida")]
        antiguo = reg + [fila("R", AHORA - 6 * DIA, final="traida")]
        self.assertEqual(C.ritmo(reciente, AHORA)["hoy"], 0)
        self.assertEqual(C.ritmo(antiguo, AHORA)["hoy"], 1)


class Seleccion(unittest.TestCase):
    def setUp(self):
        self.tareas = {x: {"id": x, "titulo": x} for x in "ABCDEFG"}

    def test_recorta_al_cupo_y_deduplica(self):
        elegidas = C.seleccionar(["A", "A", "B", "C"], self.tareas, {}, [], AHORA, 2)
        self.assertEqual([t["id"] for t in elegidas], ["A", "B"])

    def test_fuera_privadas_ocupadas_y_con_dependencia_abierta(self):
        self.tareas["A"]["privado"] = True
        self.tareas["B"]["prompt"] = "🔒 PRIVADO: datos de una persona"
        self.tareas["E"]["depende"] = ["Z"]
        self.tareas["F"]["depende"] = ["Y"]
        progreso = {"C": {"estado": "en_curso"}, "D": {"estado": "reasignada", "medio": "nube"},
                    "Y": {"estado": "commit"}, "G": {"estado": "fallo_tsc"}}
        elegidas = C.seleccionar(list("ABCDEFG"), self.tareas, progreso, [], AHORA, 9)
        self.assertEqual([t["id"] for t in elegidas], ["F", "G"])

    def test_no_relanza_abiertas_recientes_ni_dos_veces(self):
        reg = [fila("A", AHORA - 3 * DIA),  # hilo abierto
               fila("B", AHORA - 3600, final="devuelta"),  # hace menos de 24 h
               fila("C", AHORA - 9 * DIA, final="devuelta"), fila("C", AHORA - 5 * DIA, hilo="h2", final="devuelta"),
               fila("D", AHORA - 5 * DIA, final="devuelta")]
        elegidas = C.seleccionar(list("ABCD"), self.tareas, {}, reg, AHORA, 9)
        self.assertEqual([t["id"] for t in elegidas], ["D"])

    def test_prioridad_primero_y_sin_las_que_esperan(self):
        self.tareas["C"]["importancia"] = "capacidad"
        self.tareas["B"]["depende"] = ["Z"]
        self.assertEqual(C.por_prioridad(["A", "B", "C"], self.tareas, {}, AHORA), ["C", "A"])

    def test_marca_es_prestamo_a_cloudroom(self):
        m = C.marca("gpt-6-luna", 123)
        self.assertEqual((m["estado"], m["medio"]), ("reasignada", "cloudroom"))
        self.assertIn("reasignada · cloudroom", m["nota"])
        self.assertEqual(C.marca("nvidia/kimi-k3", 1, "opencode")["nota"], "reasignada · cloudroom (opencode/nvidia/kimi-k3)")

    def test_el_fallo_del_medio_no_gasta_la_tarea(self):
        reg = [fila("A", AHORA - 3600, final="medio"), fila("A", AHORA - 2 * DIA, hilo="h2", final="medio"),
               fila("B", AHORA - 3600, final="devuelta")]
        self.assertEqual([t["id"] for t in C.seleccionar(["A", "B"], self.tareas, {}, reg, AHORA, 9)], ["A"])


class CliReal(unittest.TestCase):
    def test_modelo_de_la_lista_de_la_nube_nunca_uno_fijo(self):
        self.assertEqual(C.elegir_modelo(ESTADO_NUBE), ("codex", "gpt-6-luna"))
        self.assertEqual(C.elegir_modelo(ESTADO_NUBE, "gpt-5.6-terra"), ("codex", "gpt-5.6-terra"))
        self.assertEqual(C.elegir_modelo(ESTADO_NUBE, "claude-opus-9"), ("codex", "gpt-6-luna"))
        self.assertEqual(C.elegir_modelo({"harnesses": [{"id": "codex", "connected": False, "models": ["x"]}]}), ("", ""))
        self.assertEqual(C.elegir_modelo(None), ("", ""))

    def test_spawn_con_los_flags_verificados(self):
        orden = C.orden_spawn("room-cli", {"id": "X1", "titulo": "Algo"}, "brief", "codex", "gpt-6-luna", "starseed-X1-1")
        self.assertEqual(orden[:3], ["room-cli", "thread", "spawn"])
        for par in (["--machine", "cloud"], ["--base-branch", "main"], ["--provider", "codex"], ["--model", "gpt-6-luna"],
                    ["--permission-mode", "full"], ["--request-id", "starseed-X1-1"], ["--prompt", "brief"]):
            i = orden.index(par[0])
            self.assertEqual(orden[i:i + 2], par)
        self.assertNotIn("--new-environment", orden)  # pide un valor; suelto rompía el spawn
        self.assertIn("--json", orden)
        self.assertNotIn("--status", orden)
        self.assertNotIn("--project", orden)
        self.assertIn("--project", C.orden_spawn("r", {"id": "X"}, "b", "codex", "m", "p", proyecto="starseed"))
        with self.assertRaises(ValueError):
            C.orden_spawn("r", {"id": "X"}, "b", "", "", "p")

    def test_brief_pide_la_rama_que_trae_traer_nube(self):
        t = {"id": "CRM1024Z", "titulo": "módulo", "ola": "1024C", "archivos": ["a.py"],
             "prompt": "Haz {esto} con llaves"}
        b = C.brief(t, "20261024")
        self.assertIn("git push origin HEAD:refs/heads/nube/cr-20261024/ola/CRM1024Z", b)
        self.assertIn("`Ola 1024C · Cloudroom · CRM1024Z: módulo`", b)
        self.assertIn("Haz {esto} con llaves", b)
        self.assertIn("tsc --noEmit", b)
        self.assertIn("push a main", b)
        self.assertEqual(C.rama_pedida("CRM1024Z", "20261024"), "nube/cr-20261024/ola/CRM1024Z")

    def test_lee_las_salidas_simuladas_de_room_cli(self):
        self.assertEqual(C.id_hilo({"thread": {"id": "h1"}}), "h1")
        self.assertEqual(C.id_hilo({"data": {"threadId": "h2"}}), "h2")
        self.assertEqual(C.entorno_de({"environment": {"id": "e1"}}), "e1")
        lista = {"threads": [{"id": "h1", "status": "idle", "executionTarget": "cloud"},
                             {"id": "h2", "status": "running", "executionTarget": "cloud"}, {"id": "h3"}]}
        hilos = C.hilos_por_id(lista)
        self.assertEqual(sorted(hilos), ["h1", "h2", "h3"])
        self.assertEqual([C.estado_hilo(hilos[h]) for h in ("h1", "h2", "h3")], ["terminado", "trabajando", "desconocido"])
        self.assertEqual(C.estado_hilo({"status": "Completed"}), "terminado")
        self.assertEqual(C.hilos_por_id([{"id": "h9"}]).keys(), {"h9"})

    def test_parche_texto_json_o_nada(self):
        diff = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n"
        self.assertEqual(C.extraer_parche(diff), diff)
        self.assertEqual(C.extraer_parche(json.dumps({"patch": diff})), diff)
        self.assertEqual(C.extraer_parche(json.dumps([{"patch": diff}, {"patch": diff}])), diff + diff)
        self.assertEqual(C.extraer_parche(""), "")
        self.assertEqual(C.extraer_parche("No changes"), "")

    def test_ramas_de_ls_remote(self):
        salida = "abc\trefs/heads/nube/cr-20261024/ola/A\ndef\trefs/heads/nube/cr-20261025/ola/B\nbasura"
        self.assertEqual(C.ramas_de(salida), {"nube/cr-20261024/ola/A", "nube/cr-20261025/ola/B"})

    def test_motivo_del_medio_en_palabras_del_parte(self):
        self.assertEqual(C.motivo_medio({"estado": "usable"}), "")
        self.assertTrue(C.motivo_medio({"estado": "requiere_alex", "siguiente_paso": "inicia sesión"}).startswith("sin sesión"))
        self.assertEqual(C.motivo_medio({"estado": "no_disponible", "detalle": "app sin instalar"}), "app sin instalar")

    def test_uso_de_la_cuenta(self):
        self.assertEqual(C.uso_cuenta({}, AHORA), (100, 0))
        self.assertEqual(C.uso_cuenta({"plan": "pro", "planUsage": {"agentsUsed": 12, "agentsTotal": 300}}, AHORA), (300, 12))

    def test_acepta_un_id_o_varios(self):
        self.assertEqual(C.ids_argumento(["--ids", "A"]), ["A"])
        self.assertEqual(C.ids_argumento(["--ids=B, C", "--seco"]), ["B", "C"])


class SinRepo(unittest.TestCase):
    def test_frases_del_agente_y_de_git(self):
        for texto in ("PENDIENTE-DE: el sandbox no es un repositorio Git", "No hay una copia del proyecto en /workspace",
                      "fatal: not a git repository (or any of the parent directories): .git",
                      "El entorno no tiene el repositorio de StarSeed", "NO ES UN REPOSITORIO DE GIT"):
            self.assertTrue(C.sin_repo(texto), texto)
        for texto in ("INTEGRABLE · rama nube/cr-1/ola/A · tsc y pruebas en verde (12)", "no pude empujar: sin permiso",
                      "", None, C.PLANTILLA, C.brief({"id": "X", "titulo": "t", "prompt": "haz"}, "20261024")):
            self.assertFalse(C.sin_repo(texto), texto)

    def test_lo_ultimo_que_dijo_el_hilo(self):
        self.assertEqual(C.texto_final({"lastMessage": {"content": [{"text": "uno"}, {"text": "dos"}]}}), "uno\ndos")
        self.assertIn("no es un repositorio", C.texto_final({"messages": [{"content": "hola"}, {"text": "no es un repositorio Git"}]}))
        self.assertEqual(C.texto_final({"preview": "el prompt", "title": "X"}), "")
        self.assertEqual(C.texto_final(None), "")

    def test_dos_fallos_del_medio_seguidos_paran_los_lanzamientos(self):
        dos = [fila("A", AHORA - 7200, final="medio", t_final=AHORA - 3600), fila("B", AHORA - 7200, final="medio", t_final=AHORA - 600)]
        self.assertTrue(C.pausa_por_medio(dos, AHORA).startswith("pausa: los 2 últimos"))
        self.assertEqual(C.pausa_por_medio(dos, AHORA + 13 * 3600), "")
        self.assertEqual(C.pausa_por_medio(dos[:1], AHORA), "")
        bien = dos + [fila("C", AHORA - 7200, final="traida", t_final=AHORA - 60)]
        self.assertEqual(C.pausa_por_medio(bien, AHORA), "")
        self.assertEqual(C.pausa_por_medio(dos + [fila("D", AHORA - 60)], AHORA)[:5], "pausa")  # uno abierto no cuenta


class Seguir(unittest.TestCase):
    def setUp(self):
        self.p = {"A": {"estado": "reasignada", "medio": "cloudroom"}}

    def test_sandbox_sin_repo_va_al_diff_patch_y_luego_es_del_medio(self):
        f = fila("A", AHORA - 60, rama_pedida="nube/cr-1/ola/A")
        hilos = {"h-A": {"status": "idle", "lastMessage": "PENDIENTE-DE: no hay una copia del proyecto"}}
        self.assertEqual(C.decidir(f, set(), hilos, self.p, AHORA), "parche")  # sin esperar los 10 min
        self.assertEqual(C.decidir(dict(f, intentos_parche=3), set(), hilos, self.p, AHORA), "medio")
        self.assertEqual(C.decidir(f, {"nube/cr-1/ola/A"}, hilos, self.p, AHORA), "traer")

    def test_rama_empujada_se_trae(self):
        f = fila("A", AHORA - 3600, rama_pedida="nube/cr-20261024/ola/A")
        self.assertEqual(C.decidir(f, {"nube/cr-20261024/ola/A"}, {}, self.p, AHORA), "traer")
        self.assertEqual(C.decidir(f, {"nube/cr-20261025/ola/A"}, {}, self.p, AHORA), "traer")

    def test_terminado_sin_rama_va_por_diff_patch(self):
        f = fila("A", AHORA - 3600, rama_pedida="nube/cr-1/ola/A")
        hilos = {"h-A": {"status": "idle"}}
        self.assertEqual(C.decidir(f, set(), hilos, self.p, AHORA), "parche")
        self.assertEqual(C.decidir(dict(f, t=AHORA - 60), set(), hilos, self.p, AHORA), "esperar")
        self.assertEqual(C.decidir(dict(f, intentos_parche=3), set(), hilos, self.p, AHORA), "devolver")

    def test_trabajando_espera_hasta_la_gracia(self):
        hilos = {"h-A": {"status": "running"}}
        self.assertEqual(C.decidir(fila("A", AHORA - 3600), set(), hilos, self.p, AHORA), "esperar")
        self.assertEqual(C.decidir(fila("A", AHORA - 13 * 3600), set(), hilos, self.p, AHORA), "devolver")

    def test_sin_ramas_no_se_decide_nada_y_ajena_se_olvida(self):
        self.assertEqual(C.decidir(fila("A", AHORA - 99 * 3600), None, None, self.p, AHORA), "esperar")
        self.assertEqual(C.decidir(fila("A", AHORA), set(), {}, {"A": {"estado": "pendiente"}}, AHORA), "olvidar")

    def test_huerfanas(self):
        p = {"A": {"estado": "reasignada", "medio": "cloudroom", "t": AHORA - 3600},
             "B": {"estado": "reasignada", "medio": "cloudroom", "t": AHORA - 30},
             "C": {"estado": "reasignada", "medio": "cloudroom", "t": AHORA - 3600}}
        self.assertEqual(C.huerfanas(p, [fila("C", AHORA - 3600)], AHORA), ["A"])


LOG_429 = """── Assistant ──────────
Voy a aplicar solo lo aprovechable.
── Ran tool bash { command: git cherry-pick --no-commit c0dfe6784... }
── Error ──────────────
  429 {"status":429,"title":"Too Many Requests"}
── Error ──────────────
  429 {"status":429,"title":"Too Many Requests"}
"""
LOG_404 = """── Provisioned thread ──────
  Starting Pi (1s)
── Error ───────────
  System error
  404 {"status":404,"title":"Not Found","detail":"Function 'x': Not found for account 'y'"}
"""


class Reanudar(unittest.TestCase):
    """CRM1024K: los hilos parados por el proveedor o por su modelo se reanudan (mismo hilo, sin gastar cupo)."""

    def test_corte_segun_como_acaba_el_log(self):
        self.assertEqual(C.corte_de(LOG_429), "cupo")
        self.assertEqual(C.corte_de(LOG_404), "modelo")
        siguio = LOG_429 + "── Assistant ──────\nINTEGRABLE · rama nube/cr-1/ola/A\n"
        self.assertEqual(C.corte_de(siguio), "")  # un 429 a mitad que luego siguió no es un corte
        self.assertEqual(C.corte_de("── Error ──\n  TypeError: x is undefined\n"), "")  # error del agente, no del proveedor
        self.assertEqual(C.corte_de(""), "")
        pie = LOG_429 + "(Showing the newest 1 user-message turns; older history omitted.)\n"
        self.assertEqual(C.corte_de(pie), "cupo")

    def test_reanudable_con_limite_y_dentro_de_la_gracia(self):
        f = fila("A", AHORA - 3600)
        self.assertTrue(C.reanudable("parche", f, "cupo", AHORA))
        self.assertTrue(C.reanudable("devolver", f, "modelo", AHORA))
        self.assertFalse(C.reanudable("traer", f, "cupo", AHORA))
        self.assertFalse(C.reanudable("parche", f, "", AHORA))
        self.assertFalse(C.reanudable("parche", dict(f, reanudaciones=C.MAX_REANUDAR), "cupo", AHORA))
        self.assertFalse(C.reanudable("parche", fila("A", AHORA - 13 * 3600), "cupo", AHORA))

    CANDS = [("pi", "nvidia/z-ai/glm-5.3", ""), ("pi", "xkiro/qwen/qwen3-coder-plus:free", ""), ("codex", "gpt-6-luna", "")]

    def test_plan_cupo_otro_proveedor_y_si_no_espera(self):
        f = fila("A", AHORA - 3600, harness="pi", modelo="nvidia/z-ai/glm-5.3")
        self.assertEqual(C.plan_reanudar(f, "cupo", self.CANDS, {}, {}, AHORA, AHORA - 60), ("pi", "xkiro/qwen/qwen3-coder-plus:free"))
        lleno = {"xkiro": 2}
        self.assertIsNone(C.plan_reanudar(f, "cupo", self.CANDS, lleno, {}, AHORA, AHORA - 60))  # parado hace 1 min: espera
        self.assertEqual(C.plan_reanudar(f, "cupo", self.CANDS, lleno, {}, AHORA, AHORA - C.ESPERA_CUPO_S), ("pi", "nvidia/z-ai/glm-5.3"))
        self.assertIsNone(C.plan_reanudar(f, "cupo", self.CANDS, {"xkiro": 2, "nvidia": 2}, {}, AHORA, AHORA - 9999))
        self.assertIsNone(C.plan_reanudar(f, "cupo", self.CANDS[1:], lleno, {}, AHORA, AHORA - 9999))  # su modelo ya no es candidato

    def test_plan_modelo_otro_del_mismo_harness(self):
        f = fila("A", AHORA - 3600, harness="pi", modelo="nvidia/nvidia/nemotron-3-super-120b-a12b")
        self.assertEqual(C.plan_reanudar(f, "modelo", self.CANDS, {}, {}, AHORA), ("pi", "nvidia/z-ai/glm-5.3"))
        self.assertEqual(C.plan_reanudar(f, "modelo", self.CANDS, {"nvidia": 1}, {"nvidia": 1}, AHORA),
                         ("pi", "xkiro/qwen/qwen3-coder-plus:free"))
        self.assertIsNone(C.plan_reanudar(f, "modelo", [self.CANDS[2]], {}, {}, AHORA))  # nunca cambia de harness

    def test_mensaje_orden_e_instante(self):
        f = fila("A", AHORA, rama_pedida="nube/cr-1/ola/A")
        m = C.mensaje_reanudar(f, "modelo", "nvidia/z-ai/glm-5.3")
        self.assertIn("Continúa la tarea A", m)
        self.assertIn("git push origin HEAD:refs/heads/nube/cr-1/ola/A", m)
        self.assertIn("otro modelo: nvidia/z-ai/glm-5.3", m)
        self.assertEqual(C.orden_tell("rc", "h1", "hola"), ["rc", "thread", "tell", "h1", "hola", "--json"])
        self.assertEqual(C.orden_tell("rc", "h1", "hola", "m")[-2:], ["--model", "m"])
        self.assertEqual(C.instante_hilo({"updatedAt": 1792874699098}), 1792874699.098)
        self.assertEqual(C.instante_hilo({"updatedAt": "2026-10-24T20:00:00Z"}), 1792872000.0)
        self.assertIsNone(C.instante_hilo({}))

    def test_sin_ola_repetida(self):
        self.assertEqual(C.sin_ola("Ola 1019A · ADN de diseño"), "1019A · ADN de diseño")
        self.assertEqual(C.sin_ola("1024C"), "1024C")
        self.assertEqual(C.sin_ola(None), "")
        self.assertIn("`Ola 1019A · ADN · Cloudroom · A: uno`", C.brief({"id": "A", "titulo": "uno", "ola": "Ola 1019A · ADN", "prompt": "x"}, "20261024"))


class Hecho:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class Maquina(unittest.TestCase):
    """`lanzar` y `seguir` de punta a punta con room-cli y git simulados y el disco en una carpeta temporal."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.progreso = os.path.join(self.dir, "progreso.json")
        self.ordenes = []
        parches = [mock.patch.object(C, "REGISTRO", os.path.join(self.dir, "hilos.json")),
                   mock.patch.object(C.traer_nube, "PROGRESO", self.progreso),
                   mock.patch.object(C.traer_nube, "CERROJOS", self.dir),
                   mock.patch.object(C.RN, "CerrojoReparto", lambda *a, **k: nullcontext()),
                   # las lecturas de cuotas, en la carpeta temporal (vacías salvo que la prueba las escriba)
                   mock.patch.object(C.CM, "MEDIDORES", os.path.join(self.dir, "medidores.json")),
                   mock.patch.object(C.CM, "LIMITES", os.path.join(self.dir, "limites.json")),
                   mock.patch.object(C.CM, "SALUD", os.path.join(self.dir, "salud.json")),
                   mock.patch.dict(os.environ, {"STARSEED_CLOUDROOM_MODELO": "", "STARSEED_CLOUDROOM_PROYECTO": "proj"}),
                   mock.patch.object(C.traer_nube, "_colas_por_id", lambda: {
                       "A": ("cola-x.json", {"id": "A", "titulo": "uno", "ola": "1024C", "prompt": "haz A"}),
                       "B": ("cola-x.json", {"id": "B", "titulo": "dos", "prompt": "haz B"}),
                       "C": ("cola-x.json", {"id": "C", "titulo": "tres", "prompt": "haz C"})})]
        for p in parches:
            p.start()
            self.addCleanup(p.stop)

    def falso(self, respuestas):
        def correr(orden, **kw):
            self.ordenes.append((orden, kw.get("input")))
            for clave, salida in respuestas:
                if clave(orden):
                    return salida
            return Hecho()
        return correr

    def test_lanzar_abre_hilos_anota_y_presta(self):
        correr = self.falso([
            (lambda o: o[1:3] == ["cloud", "status"], Hecho(out=json.dumps(ESTADO_NUBE))),
            (lambda o: o[:2] == ["git", "rev-parse"], Hecho(out="base123\n")),
            (lambda o: o[1:3] == ["thread", "spawn"] and "A" in o[o.index("--request-id") + 1],
             Hecho(out=json.dumps({"thread": {"id": "hA"}, "environmentId": "eA"}))),
            (lambda o: o[1:3] == ["thread", "spawn"], Hecho(rc=2, err="error: algo\nerror: a value is required")),
        ])
        r = C.lanzar(["A", "B"], medio={"estado": "usable"}, ahora=AHORA, run=correr, cli="room-cli")
        self.assertEqual(r["lanzadas"], ["A"])
        self.assertEqual(r["quedan"], 99)
        self.assertIn("a value is required", r["errores"][0])
        reg = C.leer_registro()
        self.assertEqual((reg[0]["hilo"], reg[0]["entorno"], reg[0]["base"], reg[0]["modelo"]), ("hA", "eA", "base123", "gpt-6-luna"))
        self.assertTrue(reg[0]["rama_pedida"].endswith("/ola/A"))
        p = json.load(open(self.progreso))
        self.assertEqual((p["A"]["estado"], p["A"]["medio"]), ("reasignada", "cloudroom"))
        self.assertEqual(p["B"]["estado"], "pendiente")  # el hilo no se abrió: vuelve al enjambre

    def test_lanzar_dice_por_que_no(self):
        self.assertEqual(C.lanzar(["A"], medio={"estado": "no_disponible", "detalle": "app sin instalar"}, ahora=AHORA,
                                  run=self.falso([]), cli="")["motivo"], "app sin instalar")
        r = C.lanzar(["A"], medio={"estado": "usable"}, ahora=AHORA, cli="room-cli", run=self.falso([
            (lambda o: o[1:3] == ["cloud", "status"], Hecho(out=json.dumps({"authenticated": True, "harnesses": []})))]))
        self.assertIn("sin modelos en la nube", r["motivo"])
        self.assertEqual(self.ordenes[-1][0][1:3], ["cloud", "status"])  # no se lanzó nada

    NUBE = {"harnesses": [ESTADO_NUBE["harnesses"][0],
                          {"id": "opencode", "models": [{"model": "nvidia/kimi-k3"}, {"model": "xkiro/qwen3-coder-plus"}]}]}

    def spawns(self):
        return [o for o, _ in self.ordenes if o[1:3] == ["thread", "spawn"]]

    @staticmethod
    def campo(orden, flag):
        return orden[orden.index(flag) + 1]

    def abre(self, falla=lambda o: None):
        """room-cli simulado: cloud status con NUBE y cada spawn abre «h-<tarea>-<modelo>» salvo que `falla` diga el error."""
        def spawn(o):
            error = falla(o)
            if error:
                return Hecho(rc=1, err=error)
            return Hecho(out=json.dumps({"thread": {"id": "h-%s-%s" % (self.campo(o, "--title")[0], self.campo(o, "--model"))}}))
        def correr(orden, **kw):
            self.ordenes.append((orden, kw.get("input")))
            if orden[1:3] == ["cloud", "status"]:
                return Hecho(out=json.dumps(self.NUBE))
            return spawn(orden) if orden[1:3] == ["thread", "spawn"] else Hecho()
        return correr

    def test_lanzar_reparte_en_rueda_gratis_primero_y_anota_harness_y_modelo(self):
        json.dump({"medidores": {"codex": {"ventanas": [{"usado_pct": 32}]}}}, open(C.CM.MEDIDORES, "w"))
        r = C.lanzar(["A", "B", "C"], medio={"estado": "usable"}, ahora=AHORA, run=self.abre(), cli="room-cli")
        self.assertEqual(r["lanzadas"], ["A", "B", "C"])
        self.assertEqual(r["modelos"], {"A": "opencode/nvidia/kimi-k3", "B": "opencode/xkiro/qwen3-coder-plus", "C": "codex/gpt-6-luna"})
        self.assertEqual([(self.campo(o, "--provider"), self.campo(o, "--model")) for o in self.spawns()],
                         [("opencode", "nvidia/kimi-k3"), ("opencode", "xkiro/qwen3-coder-plus"), ("codex", "gpt-6-luna")])
        self.assertEqual([(x["harness"], x["modelo"]) for x in C.leer_registro()],
                         [("opencode", "nvidia/kimi-k3"), ("opencode", "xkiro/qwen3-coder-plus"), ("codex", "gpt-6-luna")])
        p = json.load(open(self.progreso))
        self.assertEqual(p["C"]["nota"], "reasignada · cloudroom (codex/gpt-6-luna)")
        # la pasada siguiente sigue la rueda donde quedó (otro día, con las tres ya lanzadas cerradas)
        reg = [dict(x, final="traida") for x in C.leer_registro()]
        json.dump(reg, open(C.REGISTRO, "w"))
        json.dump({}, open(self.progreso, "w"))
        self.ordenes.clear()
        r2 = C.lanzar(["A", "B"], medio={"estado": "usable"}, ahora=AHORA + 2 * DIA, run=self.abre(), cli="room-cli")
        self.assertEqual(list(r2["modelos"].values()), ["codex/gpt-5.6-terra", "codex/gpt-5.6-luna"])

    def test_spawn_que_falla_por_el_modelo_prueba_el_siguiente_sin_gastar_la_tarea(self):
        rechazo = "HTTP 400: Cloud supports new Codex, Pi, … threads"
        r = C.lanzar(["A", "B"], medio={"estado": "usable"}, ahora=AHORA, cli="room-cli",
                     run=self.abre(lambda o: rechazo if self.campo(o, "--model") == "nvidia/kimi-k3" else None))
        self.assertEqual(r["lanzadas"], ["A", "B"])
        self.assertEqual(r["errores"], [])
        hechos = [(self.campo(o, "--request-id"), self.campo(o, "--model")) for o in self.spawns()]
        self.assertEqual(hechos, [("starseed-A-1", "nvidia/kimi-k3"), ("starseed-A-1-2", "xkiro/qwen3-coder-plus"),
                                  ("starseed-B-1", "xkiro/qwen3-coder-plus")])  # B ya no prueba el rechazado
        reg = C.leer_registro()
        self.assertEqual((reg[0]["modelo"], reg[0]["modelos_rechazados"]), ("xkiro/qwen3-coder-plus", ["opencode/nvidia/kimi-k3"]))
        p = json.load(open(self.progreso))
        self.assertEqual((p["A"]["estado"], p["A"]["nota"]), ("reasignada", "reasignada · cloudroom (opencode/xkiro/qwen3-coder-plus)"))

    def test_si_ningun_modelo_abre_el_hilo_la_tarea_vuelve(self):
        r = C.lanzar(["A"], medio={"estado": "usable"}, ahora=AHORA, cli="room-cli",
                     run=self.abre(lambda o: "Select a model with --model for Cloud"))
        self.assertEqual(r["lanzadas"], [])
        self.assertEqual(len(self.spawns()), C.CM.MAX_MODELOS_POR_TAREA)
        self.assertIn("probados:", r["errores"][0])
        self.assertEqual(json.load(open(self.progreso))["A"]["estado"], "pendiente")
        self.assertEqual(C.leer_registro(), [])
        # un tiempo agotado no se reintenta con otro modelo: el hilo quizá se abrió
        self.ordenes.clear()
        C.lanzar(["B"], medio={"estado": "usable"}, ahora=AHORA, cli="room-cli", run=self.abre(lambda o: "TimeoutExpired"))
        self.assertEqual(len(self.spawns()), 1)

    def test_respeta_el_modelo_fijado_por_entorno(self):
        with mock.patch.dict(os.environ, {"STARSEED_CLOUDROOM_MODELO": "gpt-5.6-luna"}):
            r = C.lanzar(["A", "B"], medio={"estado": "usable"}, ahora=AHORA, run=self.abre(), cli="room-cli")
        self.assertEqual(set(r["modelos"].values()), {"codex/gpt-5.6-luna"})

    def test_sin_modelos_que_quepan_dice_por_que_y_no_abre_nada(self):
        json.dump({"medidores": {"codex": {"ventanas": [{"usado_pct": 85}]}}}, open(C.CM.MEDIDORES, "w"))
        json.dump({"nim": {"estado": "caido"}, "xkiro": {"estado": "caído"}}, open(C.CM.SALUD, "w"))
        r = C.lanzar(["A"], medio={"estado": "usable"}, ahora=AHORA, run=self.abre(), cli="room-cli")
        self.assertTrue(r["motivo"].startswith("sin modelos en la nube que quepan ahora"))
        self.assertIn("Codex al 85 %", r["motivo"])
        self.assertEqual(self.spawns(), [])

    def test_en_seco_dice_el_modelo_de_cada_tarea(self):
        r = C.lanzar(["A", "B"], seco=True, medio={"estado": "usable"}, ahora=AHORA, run=self.abre(), cli="room-cli")
        self.assertEqual(r["motivo"], "en seco · A→opencode/nvidia/kimi-k3, B→opencode/xkiro/qwen3-coder-plus")
        self.assertEqual(self.spawns(), [])

    def test_pausa_por_el_medio_no_llama_a_room_cli(self):
        json.dump([fila("A", AHORA - 7200, final="medio", t_final=AHORA - 3600),
                   fila("B", AHORA - 7200, final="medio", t_final=AHORA - 60)], open(C.REGISTRO, "w"))
        r = C.lanzar(["C"], medio={"estado": "usable"}, ahora=AHORA, run=self.abre(), cli="room-cli")
        self.assertTrue(r["motivo"].startswith("pausa:"))
        self.assertEqual(self.ordenes, [])

    def test_seguir_devuelve_por_fallo_del_medio_sin_gastar_la_tarea(self):
        json.dump({x: {"estado": "reasignada", "medio": "cloudroom"} for x in "AB"}, open(self.progreso, "w"))
        json.dump([fila("A", AHORA - 3600, hilo="hA", rama_pedida="nube/cr-1/ola/A"),
                   fila("B", AHORA - 3600, hilo="hB", rama_pedida="nube/cr-1/ola/B")], open(C.REGISTRO, "w"))
        correr = self.falso([
            (lambda o: o[:2] == ["git", "ls-remote"], Hecho(out="")),
            (lambda o: o[1:3] == ["thread", "list"], Hecho(out=json.dumps({"threads": [
                {"id": "hA", "status": "completed", "lastMessage": {"text": "PENDIENTE-DE: el sandbox no es un repositorio Git"}},
                {"id": "hB", "status": "completed", "environmentId": "eB"}]}))),
            (lambda o: o[1:4] == ["environment", "diff-patch", "eB"], Hecho(rc=1, err="fatal: not a git repository")),
            (lambda o: o[1:3] == ["environment", "diff-patch"], Hecho(out="")),
        ])
        r = C.seguir(ahora=AHORA, run=correr, traer=None, cli="room-cli")
        self.assertEqual(r["acciones"], {"A": "medio", "B": "medio"})
        self.assertEqual(r["errores"], [])
        p = json.load(open(self.progreso))
        self.assertEqual((p["A"]["estado"], p["B"]["estado"]), ("pendiente", "pendiente"))
        self.assertIn("fallo del MEDIO", p["A"]["nota"])
        reg = C.leer_registro()
        self.assertEqual([x["final"] for x in reg], ["medio", "medio"])
        tareas = {x: {"id": x} for x in "AB"}
        self.assertEqual([t["id"] for t in C.seleccionar(["A", "B"], tareas, p, reg, AHORA + 60, 9)], ["A", "B"])

    def test_seguir_trae_lo_empujado_y_sube_el_diff_patch(self):
        json.dump({"A": {"estado": "reasignada", "medio": "cloudroom"}, "B": {"estado": "reasignada", "medio": "cloudroom"}},
                  open(self.progreso, "w"))
        json.dump([fila("A", AHORA - 3600, hilo="hA", rama_pedida="nube/cr-20261024/ola/A"),
                   fila("B", AHORA - 3600, hilo="hB", rama_pedida="nube/cr-20261024/ola/B", base="base123", titulo="dos")],
                  open(C.REGISTRO, "w"))
        diff = "diff --git a/x b/x\n"
        correr = self.falso([
            (lambda o: o[:2] == ["git", "ls-remote"], Hecho(out="s\trefs/heads/nube/cr-20261024/ola/A\n")),
            (lambda o: o[1:3] == ["thread", "list"], Hecho(out=json.dumps([{"id": "hA", "status": "idle"},
                                                                           {"id": "hB", "status": "idle", "environmentId": "eB"}]))),
            (lambda o: o[1:3] == ["environment", "diff-patch"], Hecho(out=diff)),
            (lambda o: o[:2] == ["git", "write-tree"], Hecho(out="arbol\n")),
            (lambda o: o[:2] == ["git", "commit-tree"], Hecho(out="sha9\n")),
        ])
        traidas = []
        r = C.seguir(ahora=AHORA, run=correr, traer=lambda: traidas.append(1), cli="room-cli")
        self.assertEqual(r["acciones"], {"A": "traer", "B": "parche"})
        self.assertEqual(traidas, [1])
        hechas = [o for o, _ in self.ordenes]
        self.assertIn(["room-cli", "environment", "diff-patch", "eB"], hechas)
        self.assertIn(["git", "read-tree", "base123"], hechas)
        self.assertIn((["git", "apply", "--cached", "--whitespace=nowarn"], diff), self.ordenes)
        self.assertIn(["git", "push", "-q", "origin", "sha9:refs/heads/nube/cr-20261024/ola/B"], hechas)
        self.assertFalse(any("wait" in o for o in hechas))  # nunca se queda esperando un hilo
        p = json.load(open(self.progreso))
        self.assertEqual((p["A"]["estado"], p["B"]["estado"]), ("pendiente", "pendiente"))
        self.assertEqual([x["final"] for x in C.leer_registro()], ["traida", "parche"])

    PI = {"harnesses": [{"id": "pi", "models": []}, ESTADO_NUBE["harnesses"][0]]}

    def _pi(self, declarados):
        parche = mock.patch.object(C.CM, "pi_declarados", lambda ruta=None: list(declarados))
        parche.start()
        self.addCleanup(parche.stop)

    def _parado(self, modelo, minutos, log=LOG_429, tell=None):
        json.dump({"A": {"estado": "reasignada", "medio": "cloudroom"}}, open(self.progreso, "w"))
        json.dump([fila("A", AHORA - 3600, hilo="hA", rama_pedida="nube/cr-1/ola/A", harness="pi", modelo=modelo, intentos_parche=3)],
                  open(C.REGISTRO, "w"))
        return self.falso([
            (lambda o: o[:2] == ["git", "ls-remote"], Hecho(out="")),
            (lambda o: o[1:3] == ["thread", "list"], Hecho(out=json.dumps([{"id": "hA", "status": "idle",
                                                                            "updatedAt": (AHORA - minutos * 60) * 1000}]))),
            (lambda o: o[1:3] == ["thread", "log"], Hecho(out=log)),
            (lambda o: o[1:3] == ["cloud", "status"], Hecho(out=json.dumps(self.PI))),
            (lambda o: o[1:3] == ["thread", "tell"] and tell is not None, tell),
            (lambda o: o[1:3] == ["thread", "tell"], Hecho(out=json.dumps({"ok": True, "delivery": "sent"}))),
        ])

    def test_seguir_reanuda_el_parado_por_429_con_otro_proveedor_sin_abrir_otro_hilo(self):
        self._pi(["nvidia/z-ai/glm-5.3", "xkiro/qwen/qwen3-coder-plus:free"])
        r = C.seguir(ahora=AHORA, run=self._parado("nvidia/z-ai/glm-5.3", 2), traer=None, cli="room-cli")
        self.assertEqual(r["acciones"], {"A": "reanudar"})
        tells = [o for o, _ in self.ordenes if o[1:3] == ["thread", "tell"]]
        self.assertEqual(len(tells), 1)
        self.assertEqual(tells[0][3], "hA")
        self.assertEqual(tells[0][-2:], ["--model", "xkiro/qwen/qwen3-coder-plus:free"])
        self.assertFalse([o for o, _ in self.ordenes if o[1:3] == ["thread", "spawn"]])  # no gasta otro de los 100
        x = C.leer_registro()[0]
        self.assertNotIn("final", x)
        self.assertEqual((x["reanudaciones"], x["intentos_parche"], x["modelo"]), (1, 0, "xkiro/qwen/qwen3-coder-plus:free"))
        self.assertEqual(x["modelos_previos"], ["nvidia/z-ai/glm-5.3"])
        self.assertEqual(x["visto"]["estado"], "trabajando")
        self.assertEqual(json.load(open(self.progreso))["A"]["estado"], "reasignada")  # sigue prestada

    def test_seguir_reenvia_tras_el_409_del_cambio_de_modelo(self):
        self._pi(["nvidia/z-ai/glm-5.3", "xkiro/qwen/qwen3-coder-plus:free"])
        cambio = Hecho(rc=1, err="Error: HTTP 409: This thread's model just changed. Send your message again.")
        correr = self._parado("nvidia/z-ai/glm-5.3", 2)

        def con_409(orden, **kw):
            if orden[1:3] == ["thread", "tell"] and "--model" in orden:
                self.ordenes.append((orden, None))
                return cambio
            return correr(orden, **kw)
        r = C.seguir(ahora=AHORA, run=con_409, traer=None, cli="room-cli")
        self.assertEqual(r["acciones"], {"A": "reanudar"})
        tells = [o for o, _ in self.ordenes if o[1:3] == ["thread", "tell"]]
        self.assertEqual(["--model" in o for o in tells], [True, False])
        self.assertEqual(C.leer_registro()[0]["reanudaciones"], 1)

    def test_seguir_espera_al_mismo_proveedor_y_el_medidor_lo_sabe(self):
        self._pi(["nvidia/z-ai/glm-5.3"])
        r = C.seguir(ahora=AHORA, run=self._parado("nvidia/z-ai/glm-5.3", 2), traer=None, cli="room-cli")
        self.assertEqual(r["acciones"], {"A": "esperar"})
        self.assertFalse([o for o, _ in self.ordenes if o[1:3] == ["thread", "tell"]])
        x = C.leer_registro()[0]
        self.assertNotIn("final", x)
        self.assertEqual((x["visto"]["estado"], x["visto"]["corte"]), ("terminado", "cupo"))
        # pasados los 20 min, el mismo modelo
        self.ordenes.clear()
        r = C.seguir(ahora=AHORA, run=self._parado("nvidia/z-ai/glm-5.3", 25), traer=None, cli="room-cli")
        self.assertEqual(r["acciones"], {"A": "reanudar"})
        tells = [o for o, _ in self.ordenes if o[1:3] == ["thread", "tell"]]
        self.assertNotIn("--model", tells[0])

    def test_seguir_cambia_de_modelo_si_el_suyo_no_existe(self):
        self._pi(["nvidia/z-ai/glm-5.3"])
        r = C.seguir(ahora=AHORA, run=self._parado("nvidia/nvidia/nemotron-3-super-120b-a12b", 1, log=LOG_404),
                     traer=None, cli="room-cli")
        self.assertEqual(r["acciones"], {"A": "reanudar"})
        self.assertEqual(C.leer_registro()[0]["modelo"], "nvidia/z-ai/glm-5.3")
        self.assertIn("pi/nvidia/z-ai/glm-5.3", json.load(open(self.progreso))["A"]["nota"])

    def test_lanzar_no_pasa_del_tope_de_hilos_a_la_vez_por_proveedor(self):
        json.dump([fila("X", AHORA - 600, harness="opencode", modelo="nvidia/kimi-k3")], open(C.REGISTRO, "w"))
        tope = mock.patch.object(C.CM, "simultaneos_declarados", lambda ruta=None: {"nvidia": 1})
        tope.start()
        self.addCleanup(tope.stop)
        r = C.lanzar(["A", "B"], medio={"estado": "usable"}, ahora=AHORA, run=self.abre(), cli="room-cli")
        self.assertTrue(r["lanzadas"])
        self.assertNotIn("nvidia/kimi-k3", [self.campo(o, "--model") for o in self.spawns()])
        solo_nim = {"harnesses": [{"id": "opencode", "models": [{"model": "nvidia/kimi-k3"}]}]}
        self.NUBE, self.ordenes[:] = solo_nim, []
        json.dump([fila("X", AHORA - 600, harness="opencode", modelo="nvidia/kimi-k3")], open(C.REGISTRO, "w"))
        json.dump({}, open(self.progreso, "w"))
        r = C.lanzar(["B"], medio={"estado": "usable"}, ahora=AHORA, run=self.abre(), cli="room-cli")
        self.assertEqual(r["lanzadas"], [])
        self.assertIn("tope de hilos a la vez", r["motivo"])
        self.assertFalse(self.spawns())
        self.assertNotEqual(json.load(open(self.progreso)).get("B", {}).get("estado"), "reasignada")  # no se marcó

    def test_seguir_sin_hilos_abiertos_no_llama_a_nadie(self):
        self.assertEqual(C.seguir(ahora=AHORA, run=self.falso([]), traer=None, cli="room-cli"), {"acciones": {}, "errores": []})
        self.assertEqual(self.ordenes, [])


if __name__ == "__main__":
    unittest.main()


class ProyectoDelRepo(unittest.TestCase):
    def test_elige_el_proyecto_cuya_fuente_es_el_repo(self):
        lista = [{"id": "proj_a", "sources": [{"path": "/x/otro"}]},
                 {"id": "proj_b", "sources": [{"path": "/x/starseed-os-main"}]}]
        self.assertEqual(C.proyecto_del_repo(lista, "/x/starseed-os-main"), "proj_b")
        self.assertEqual(C.proyecto_del_repo({"projects": lista}, "/x/starseed-os-main"), "proj_b")
        self.assertEqual(C.proyecto_del_repo(lista, "/y"), "")
        self.assertEqual(C.proyecto_del_repo(None, "/y"), "")



class RazonamientoPi(unittest.TestCase):
    def test_los_modelos_propios_de_pi_van_sin_razonamiento(self):
        import cloudroom_modelos as CM
        original = CM.pi_declarados
        CM.pi_declarados = lambda ruta=None: ["nvidia/z-ai/glm-5.3"]
        try:
            orden = C.orden_spawn("r", {"id": "X"}, "b", "pi", "nvidia/z-ai/glm-5.3", "p")
            i = orden.index("--reasoning-level")
            self.assertEqual(orden[i + 1], "none")
            self.assertNotIn("--reasoning-level", C.orden_spawn("r", {"id": "X"}, "b", "codex", "gpt-6-luna", "p"))
        finally:
            CM.pi_declarados = original
