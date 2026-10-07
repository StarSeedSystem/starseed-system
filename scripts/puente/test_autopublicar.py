#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la autopublicación (director de producción y publicación). Sin red, sin git real,
sin procesos ni ~/.starseed: todo pasa por un `Medios` falso."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as A  # noqa: E402

SHA = "a" * 40
T0 = 1_800_000_000.0
CLAVE_FALSA = "sk-" + "x" * 30  # se monta en tiempo de ejecución (protección de secretos de GitHub)


class Falso(object):
    def __init__(self, **o):
        self.o = dict(dict(encendido=True, manual=False, pendientes=3, diff="+hola\n", archivos="src/a.ts",
                           pruebas=(True, "ok"), jev=False, runs=[], deploys=[], estados=[], http=200,
                           ancestro=True, push_rc=0), **o)
        self.pushes, self.avisos = [], []

    def interruptor(self):
        return self.o["encendido"]

    def publicando_a_mano(self):
        return self.o["manual"]

    def git(self, args, timeout=None):
        c = args[0]
        if c == "rev-parse":
            return 0, SHA, ""
        if c == "rev-list":
            return 0, str(self.o["pendientes"]), ""
        if c == "diff":
            return 0, (self.o["archivos"] if "--name-only" in args else self.o["diff"]), ""
        if c == "show":
            return 0, self.o.get("sql", ""), ""
        if c == "log":
            return 0, "Ola X · tarea\nOla Y · otra", ""
        if c == "merge-base":
            return (0 if self.o["ancestro"] else 1), "", ""
        if c == "push":
            self.pushes.append(args)
            return self.o["push_rc"], "", "rechazado" if self.o["push_rc"] else ""
        return 0, "", ""

    def gh(self, ruta):
        if "actions/workflows" in ruta:
            return {"workflow_runs": self.o["runs"]}
        if ruta.endswith("statuses?per_page=3"):
            return self.o["estados"]
        if "deployments?sha=" in ruta:
            return self.o["deploys"]
        return None

    def log_fallido(self, _id):
        return "Build de producción (next build): heap out of memory"

    def http(self, _url):
        return self.o["http"]

    def pruebas_python(self, _sha):
        return self.o["pruebas"]

    def jev_frena(self, _r):
        return self.o["jev"]

    def vetos_externos(self):
        return set(self.o.get("vetos", ()))

    def avisar(self, texto, tipo="informe"):
        self.avisos.append(texto)


def run(estado, conclusion="success"):
    return {"head_sha": SHA, "status": estado, "conclusion": conclusion, "html_url": "https://ci/1", "id": 1,
            "created_at": "2026-10-07T15:00:00Z"}


class Puertas(unittest.TestCase):
    def test_apagado_no_toca_nada(self):
        m = Falso(encendido=False)
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "apagado")
        self.assertEqual(m.pushes, [])

    def test_publicacion_manual_en_curso_espera(self):
        self.assertEqual(A.pasada(Falso(manual=True), {}, T0)["fase"], "esperando")

    def test_sin_commits_esta_al_dia(self):
        self.assertEqual(A.pasada(Falso(pendientes=0), {}, T0)["fase"], "al-dia")

    def test_un_secreto_veta_el_lote_sin_publicar_ni_decir_el_valor(self):
        m = Falso(diff="+++ b/src/x.ts\n@@ -0,0 +1 @@\n+const k = '%s'\n" % CLAVE_FALSA)
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertIn(SHA, e["vetados"])
        self.assertEqual(m.pushes, [])
        self.assertNotIn(CLAVE_FALSA, " ".join(m.avisos) + str(e))

    def test_el_mismo_bloqueo_no_se_repite_en_el_chat_con_cada_commit(self):
        diff = "+++ b/src/x.ts\n@@ -0,0 +1 @@\n+const k = '%s'\n" % CLAVE_FALSA
        m = Falso(diff=diff)
        e = A.pasada(m, {}, T0)
        self.assertEqual(len(m.avisos), 1)
        e = dict(e, vetados={})  # llega un commit nuevo con el mismo problema
        e = A.pasada(m, e, T0 + 300)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertEqual(len(m.avisos), 1)

    def test_jev_puede_frenar(self):
        e = A.pasada(Falso(jev=True), {}, T0)
        self.assertEqual((e["fase"], e["detalle"]), ("bloqueado", "Jev frenó el lote"))

    def test_pruebas_en_rojo_vetan_y_si_main_se_movio_se_reintenta(self):
        self.assertEqual(A.pasada(Falso(pruebas=(False, "1 failed")), {}, T0)["fase"], "bloqueado")
        self.assertEqual(A.pasada(Falso(pruebas=(None, "main cambió")), {}, T0)["fase"], "esperando")

    def test_un_sha_vetado_espera_un_commit_nuevo(self):
        e = A.pasada(Falso(), {"vetados": {SHA: "CI en rojo"}}, T0)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertIn("commit nuevo", e["detalle"])

    def test_un_veto_de_genesis_frena(self):
        m = Falso(vetos={SHA[:8]})
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertEqual(m.pushes, [])

    def test_ventana_entre_publicaciones(self):
        e = A.pasada(Falso(), {"ultima_publicacion": T0 - 60}, T0)
        self.assertEqual(e["fase"], "esperando")


class CicloCompleto(unittest.TestCase):
    def test_del_lote_a_produccion_verificada(self):
        m = Falso()
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(m.pushes[-1], ["push", "--force", "origin", "%s:refs/heads/produccion/candidato" % SHA])

        m.o["runs"] = [run("in_progress", None)]
        e = A.pasada(m, e, T0 + 300)
        self.assertEqual(e["fase"], "ci")

        m.o["runs"] = [run("completed", "success")]
        e = A.pasada(m, e, T0 + 900)
        self.assertEqual(e["fase"], "verificando")
        self.assertEqual(m.pushes[-1], ["push", "origin", "%s:main" % SHA])  # sin force
        self.assertEqual(e["ultima_publicacion"], T0 + 900)

        m.o["deploys"] = [{"id": 7}]
        m.o["estados"] = [{"state": "in_progress"}]
        self.assertEqual(A.pasada(m, e, T0 + 1000)["fase"], "verificando")
        m.o["estados"] = [{"state": "success", "environment_url": "https://starseed-os.vercel.app"}]
        e = A.pasada(m, e, T0 + 1200)
        self.assertEqual(e["fase"], "publicado")
        self.assertEqual(e["historial"][-1]["resultado"], "publicado")
        self.assertIn("Autopublicación completa", m.avisos[-1])

    def test_ci_en_rojo_veta_y_trae_el_motivo(self):
        m = Falso(runs=[run("completed", "failure")])
        e = A.pasada(m, {"fase": "ci", "sha": SHA, "desde": T0}, T0 + 600)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertIn("heap out of memory", m.avisos[-1])
        self.assertEqual([p for p in m.pushes if p[-1].endswith(":main")], [])

    def test_ci_que_no_termina_se_corta(self):
        m = Falso(runs=[run("in_progress", None)])
        e = A.pasada(m, {"fase": "ci", "sha": SHA, "desde": T0}, T0 + A.CI_TOPE_S + 1)
        self.assertEqual(e["fase"], "bloqueado")

    def test_si_origin_avanzo_no_se_fuerza_nada(self):
        m = Falso(runs=[run("completed", "success")], ancestro=False)
        e = A.pasada(m, {"fase": "ci", "sha": SHA, "desde": T0}, T0 + 600)
        self.assertEqual(e["fase"], "al-dia")
        self.assertEqual(m.pushes, [])

    def test_vercel_en_rojo_y_humo_fallido(self):
        base = {"fase": "verificando", "sha": SHA, "desde": T0}
        m = Falso(deploys=[{"id": 7}], estados=[{"state": "failure", "target_url": "https://vercel/x"}])
        self.assertEqual(A.pasada(m, base, T0 + 60)["fase"], "bloqueado")
        m = Falso(deploys=[{"id": 7}], estados=[{"state": "success"}], http=500)
        e = A.pasada(m, base, T0 + 60)
        self.assertEqual((e["fase"], e["historial"][-1]["resultado"]), ("bloqueado", "humo-fallido"))


class Puro(unittest.TestCase):
    def test_nuestras_migraciones_aditivas_no_son_destructivas(self):
        sql = ("create table if not exists public.t (id uuid, o uuid references auth.users(id) on delete cascade);\n"
               "drop policy if exists p on public.t;\ncreate policy p on public.t for delete using (true);\n"
               "revoke all on public.t from anon;\n"
               "create function f() returns trigger language plpgsql as $$ begin delete from public.t; end $$;")
        self.assertEqual(A.analizar_lote("", {"supabase/migrations/1_t.sql": sql}), [])

    def test_un_drop_table_si_lo_es(self):
        b = A.analizar_lote("", {"supabase/migrations/1_t.sql": "drop table public.t;"})
        self.assertEqual(len(b), 1)
        self.assertIn("la decide Alex", b[0])

    def test_estado_ci_y_vercel(self):
        self.assertEqual(A.estado_ci([], SHA)[0], "sin-run")
        self.assertEqual(A.estado_ci([run("completed", "success"), {"head_sha": "otro"}], SHA)[0], "verde")
        self.assertEqual(A.estado_vercel([])[0], "esperando")
        self.assertEqual(A.estado_vercel([{"state": "error"}])[0], "fallo")

    def test_interruptor(self):
        self.assertTrue(A.encendido({"activo": True}))
        self.assertFalse(A.encendido({"activo": "si"}))
        self.assertFalse(A.encendido(None))


if __name__ == "__main__":
    unittest.main()
