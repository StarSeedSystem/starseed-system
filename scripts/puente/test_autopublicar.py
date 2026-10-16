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
        if c == "cherry":
            return 0, self.o.get("cherry", ""), ""
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

    def jev_opina(self, resumen):
        self.resumen_jev = resumen
        j = self.o["jev"]
        if isinstance(j, dict):
            return j
        return {"respuesta": "no", "confianza": 0.97} if j else {"respuesta": "sí", "confianza": 0.9}

    def peticion(self):
        p, self.o["peticion"] = self.o.get("peticion"), None
        return p

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
        self.assertEqual((e["fase"], e["detalle"]), ("bloqueado", "Jev frenó el lote (seguro al 0,97)"))
        self.assertEqual(e["jev"]["decision"], "frena")

    def test_una_duda_de_jev_no_frena_y_se_dice(self):
        # (2026-10-08) Jev frenó 8 de 8 lotes con p 0,84–0,85: eso ya no basta para frenar.
        m = Falso(jev={"respuesta": "no", "confianza": 0.85})
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(e["jev"]["decision"], "duda")
        self.assertIn("Jev dudaba (0,85)", m.avisos[-1])

    def test_jev_ve_tareas_no_salvavidas(self):
        r = A.resumen_para_jev(["salvavidas · X1: trabajo del agente", "chore(memoria): algo",
                                "Ola 1007C · capas · CPA1007A: Capas · catálogo", "Arreglo de la dirección"], 4)
        self.assertEqual(r["tareas_integradas"], ["CPA1007A: Capas · catálogo"])
        self.assertEqual(r["commits_de_respaldo_omitidos"], 2)
        self.assertEqual(r["commits_de_la_direccion"], ["Arreglo de la dirección"])

    def test_publicar_sin_jev_levanta_solo_un_veto_de_jev(self):
        m = Falso(jev=True, peticion={"accion": "saltar-jev", "sha": SHA})
        e = A.pasada(m, {"vetados": {SHA: "Jev frenó el lote (seguro al 0,97)"}, "fase": "bloqueado"}, T0)
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(e["jev"]["decision"], "saltado")
        m = Falso(peticion={"accion": "saltar-jev", "sha": SHA})
        e = A.pasada(m, {"vetados": {SHA: "CI en rojo"}}, T0)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertIn("commit nuevo", e["detalle"])

    def test_revisar_ahora_vuelve_a_preguntar_a_jev(self):
        m = Falso(jev={"respuesta": "no", "confianza": 0.85}, peticion={"accion": "revisar", "sha": SHA})
        e = A.pasada(m, {"vetados": {SHA: "Jev frenó el lote"}, "fase": "bloqueado"}, T0)
        self.assertEqual(e["fase"], "ci")

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
        # dice cuándo sale el lote: «… hacia las HH:MM», 20 min después de la última
        sale = A.time.strftime("%H:%M", A.time.localtime(T0 - 60 + A.VENTANA_S))
        self.assertIn("hacia las %s" % sale, e["detalle"])


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
        self.assertIn("aviso_flujos", e)
        self.assertIn("motivo", e)

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


class ConUnion(Falso):
    """Falso con `unir_origen` (el de verdad hace un merge «ours» bajo el cerrojo integrar)."""
    def __init__(self, union=(True, "abc1234"), **o):
        Falso.__init__(self, **o)
        self.union, self.uniones = union, []

    def unir_origen(self, head):
        self.uniones.append(head)
        return self.union


class OrigenNoAntecesor(unittest.TestCase):
    """(2026-10-12) 47 h sin publicar: main perdió dos commits ya publicados cuyo contenido volvió por
    otra vía; el CI pasaba y el push se negaba (no era avance rápido), lote tras lote."""

    def test_si_lo_de_origin_ya_esta_dentro_se_une_sin_gastar_ci(self):
        m = ConUnion(ancestro=False, cherry="- 0ee8171a salvavidas\n- ee6826bd Ola 1010S")
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "al-dia")
        self.assertEqual(m.uniones, [SHA])
        self.assertEqual(m.pushes, [])                     # ni candidato ni main
        self.assertFalse(hasattr(m, "resumen_jev"))         # ni Jev
        self.assertIn("sin cambiar el árbol", m.avisos[-1])

    def test_si_origin_trae_algo_nuevo_se_frena_sin_unir_ni_forzar(self):
        m = ConUnion(ancestro=False, cherry="- 0ee8171a ya está\n+ 1234abcd nuevo")
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertIn("1 commit(s) que main no tiene", e["detalle"])
        self.assertEqual((m.uniones, m.pushes), ([], []))
        avisos = len(m.avisos)
        e = A.pasada(m, e, T0 + 300)                         # la pasada siguiente no repite el aviso
        self.assertEqual((e["fase"], len(m.avisos), m.pushes), ("bloqueado", avisos, []))

    def test_si_no_se_puede_unir_se_dice_y_se_reintenta(self):
        m = ConUnion(ancestro=False, cherry="- 0ee8171a ya está", union=(False, "main se movió mientras esperaba"))
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertIn("main se movió", e["detalle"])
        self.assertEqual(m.pushes, [])

    def test_sin_unir_origen_en_los_medios_solo_se_frena(self):
        m = Falso(ancestro=False, cherry="- 0ee8171a ya está")
        self.assertEqual(A.pasada(m, {}, T0)["fase"], "bloqueado")
        self.assertEqual(m.pushes, [])

    def test_solo_ya_incluidos(self):
        self.assertTrue(A.solo_ya_incluidos("- a x\n- b y\n"))
        self.assertFalse(A.solo_ya_incluidos("- a x\n+ b y"))
        self.assertFalse(A.solo_ya_incluidos(""))


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



class EvidenciaYArbolLimpio(unittest.TestCase):
    """(OPA1011b) La salida de la puerta queda para MetaGenesis, y las pruebas corren sobre ESE commit."""

    def test_pruebas_en_rojo_guardan_su_salida(self):
        e = A.pasada(Falso(pruebas=(False, "FAIL: test_x (test_oracle_nodo.C.test_x)")), {}, T0)
        self.assertEqual(e["evidencia"], {"sha": SHA, "motivo": "pruebas del puente en rojo",
                                          "texto": "FAIL: test_x (test_oracle_nodo.C.test_x)"})

    def test_ci_en_rojo_guarda_el_registro(self):
        m = Falso(runs=[run("completed", "failure")])
        e = A.pasada(m, {"fase": "ci", "sha": SHA, "desde": T0}, T0 + 600)
        self.assertIn("heap out of memory", e["evidencia"]["texto"])
        self.assertEqual(e["evidencia"]["motivo"], "CI en rojo")

    def test_sin_evidencia_no_se_inventa(self):
        self.assertNotIn("evidencia", A.vetar({}, SHA, "Jev frenó el lote", T0))

    def test_arbol_limpio_es_el_commit_y_no_el_arbol_vivo(self):
        import subprocess
        import tempfile

        def g(cwd, *a):
            return subprocess.run(["git", "-C", cwd] + list(a), capture_output=True, text=True)

        with tempfile.TemporaryDirectory() as raiz:
            g(raiz, "init", "-q", "-b", "main")
            g(raiz, "config", "user.email", "p@p")
            g(raiz, "config", "user.name", "p")
            os.makedirs(os.path.join(raiz, "scripts", "puente"))
            os.makedirs(os.path.join(raiz, "node_modules"))
            ruta = os.path.join(raiz, "scripts", "puente", "modulo.py")
            with open(ruta, "w") as f:
                f.write("BIEN = True\n")
            g(raiz, "add", "scripts")
            g(raiz, "commit", "-q", "-m", "c1")
            sha = g(raiz, "rev-parse", "HEAD").stdout.strip()
            with open(ruta, "w") as f:  # otro agente a medias, sin commit
                f.write("BIEN = (\n")

            def git(args, timeout=180):
                r = subprocess.run(["git"] + args, cwd=raiz, capture_output=True, text=True, timeout=timeout)
                return r.returncode, r.stdout.strip(), r.stderr.strip()

            destino = os.path.join(os.path.dirname(raiz), "arbol-pruebas-%d" % os.getpid())
            arbol = A.arbol_limpio(raiz, sha, git, destino)
            try:
                self.assertEqual(arbol, destino)
                with open(os.path.join(arbol, "scripts", "puente", "modulo.py")) as f:
                    self.assertEqual(f.read(), "BIEN = True\n")
                self.assertTrue(os.path.islink(os.path.join(arbol, "node_modules")))
            finally:
                A.quitar_arbol(raiz, destino, git)
            self.assertFalse(os.path.exists(destino))
            with open(ruta) as f:
                self.assertEqual(f.read(), "BIEN = (\n", "el trabajo a medias del otro agente sigue intacto")
            self.assertNotIn(destino, git(["worktree", "list"])[1])
            self.assertIsNone(A.arbol_limpio(raiz, "0" * 40, git, destino), "un sha que no existe no da árbol")


if __name__ == "__main__":
    unittest.main()
