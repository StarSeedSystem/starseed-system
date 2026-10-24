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

AHORA = 1_800_000_000.0
DIA = 86400
ESTADO_NUBE = {"authenticated": True, "harnesses": [
    {"id": "codex", "models": [{"model": "gpt-6-luna"}, {"model": "gpt-5.6-terra"}, {"model": "gpt-5.6-luna"}]}]}


def fila(tarea, t, hilo=None, **extra):
    return dict({"tarea": tarea, "hilo": hilo or "h-" + tarea, "t": t}, **extra)


class Ritmo(unittest.TestCase):
    def test_plan_gratis_sin_uso_da_tres_al_dia(self):
        r = C.ritmo([], AHORA)
        self.assertEqual((r["hoy"], r["quedan"]), (3, 100))

    def test_tres_hoy_cumplen_el_ritmo_del_dia(self):
        reg = [fila(x, AHORA - 60, final="traida") for x in "ABC"]
        r = C.ritmo(reg, AHORA)
        self.assertEqual((r["hoy"], r["quedan"]), (0, 97))
        self.assertIn("sin cupo hoy", r["motivo"])

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
        self.assertIn("--new-environment", orden)
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


class Seguir(unittest.TestCase):
    def setUp(self):
        self.p = {"A": {"estado": "reasignada", "medio": "cloudroom"}}

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
                   mock.patch.object(C.traer_nube, "_colas_por_id", lambda: {
                       "A": ("cola-x.json", {"id": "A", "titulo": "uno", "ola": "1024C", "prompt": "haz A"}),
                       "B": ("cola-x.json", {"id": "B", "titulo": "dos", "prompt": "haz B"})})]
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

    def test_seguir_sin_hilos_abiertos_no_llama_a_nadie(self):
        self.assertEqual(C.seguir(ahora=AHORA, run=self.falso([]), traer=None, cli="room-cli"), {"acciones": {}, "errores": []})
        self.assertEqual(self.ordenes, [])


if __name__ == "__main__":
    unittest.main()
