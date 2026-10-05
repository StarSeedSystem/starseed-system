#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de produccion_candidatos.py: repo git temporal, archivos falsos, cero red."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import produccion_candidatos as pc


def _git(cwd, *args, input=None):
    p = subprocess.run(
        ["git"] + list(args), cwd=cwd, capture_output=True, text=True, input=input
    )
    if p.returncode != 0:
        raise RuntimeError("git %s: %s" % (" ".join(args), p.stderr.strip()))
    return p.stdout


class RepoTemporal(unittest.TestCase):
    """Repo git real en una carpeta temporal, con main y origin/main."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="pc-repo-")
        _git(self.dir, "init", "-q", "-b", "main")
        _git(self.dir, "config", "user.email", "pruebas@starseed.local")
        _git(self.dir, "config", "user.name", "Pruebas")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def commit(self, asunto, archivos=None):
        for ruta, contenido in (archivos or {}).items():
            destino = os.path.join(self.dir, ruta)
            os.makedirs(os.path.dirname(destino) or self.dir, exist_ok=True)
            with open(destino, "w", encoding="utf-8") as f:
                f.write(contenido)
            _git(self.dir, "add", ruta)
        if not archivos:
            _git(self.dir, "commit", "-q", "--allow-empty", "-F", "-", input=asunto)
        else:
            _git(self.dir, "commit", "-q", "-F", "-", input=asunto)
        return _git(self.dir, "rev-parse", "HEAD").strip()

    def marcar_origin_main(self):
        """Deja refs/remotes/origin/main en el HEAD actual (crea uno si falta)."""
        p = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=self.dir, capture_output=True, text=True
        )
        if p.returncode != 0:
            _git(self.dir, "commit", "-q", "--allow-empty", "-m", "semilla")
        sha = _git(self.dir, "rev-parse", "HEAD").strip()
        _git(self.dir, "update-ref", "refs/remotes/origin/main", sha)
        return sha


class TestMediosDe(unittest.TestCase):
    def test_clasifica_por_medio(self):
        self.assertEqual(pc.medios_de(["src/app/page.tsx"]), ["web"])
        self.assertEqual(
            pc.medios_de(["src/app/api/mando/estado/route.ts"]), ["mando", "web"]
        )
        self.assertEqual(pc.medios_de(["scripts/puente/x.py"]), ["servicios"])
        self.assertEqual(pc.medios_de(["supabase/migrations/01.sql"]), ["supabase"])
        self.assertEqual(pc.medios_de(["scripts/hermes/skills/a/SKILL.md"]), ["hermes", "repo"])
        self.assertEqual(pc.medios_de(["native/src-tauri/tauri.conf.json"]), ["nativo"])

    def test_lo_que_no_casa_va_a_repo(self):
        self.assertEqual(pc.medios_de(["que/rarito.bin"]), ["repo"])
        self.assertEqual(pc.medios_de([]), [])
        self.assertEqual(pc.medios_de(None), [])

    def test_un_lote_puede_tocar_varios_medios(self):
        self.assertEqual(
            pc.medios_de(["src/app/page.tsx", "scripts/puente/x.py", "CLAUDE.md"]),
            ["repo", "servicios", "web"],
        )


class TestCandidatos(RepoTemporal):
    def test_commits_de_origin_main_a_main_con_id_de_tarea(self):
        self.marcar_origin_main()
        s1 = self.commit("Ola 1005 · PRD1005A: candidatos", {"scripts/puente/pc.py": "x"})
        s2 = self.commit("Ola 1005 · zN4: contrato de salas", {"src/lib/salas.ts": "y"})
        cands = pc.candidatos(self.dir)
        self.assertEqual([c["tarea"] for c in cands], ["PRD1005A", "zN4"])
        self.assertEqual(cands[0]["sha"], s1)
        self.assertEqual(cands[1]["sha"], s2)
        self.assertEqual(cands[1]["ola"], "1005")

    def test_sin_origin_main_no_hay_candidatos(self):
        self.commit("Ola 1005 · PRD1005A: algo", {"a.py": "1"})
        self.assertEqual(pc.candidatos(self.dir), [])

    def test_desde_un_sha_base(self):
        base = self.commit("Ola 1005 · PRD1004Z: ya publicado", {"a.py": "1"})
        s2 = self.commit("Ola 1005 · PRD1005A: a publicar", {"b.py": "2"})
        cands = pc.candidatos(self.dir, desde=base)
        self.assertEqual([c["sha"] for c in cands], [s2])

    def test_salvavidas_se_agrupan_con_su_tarea(self):
        self.marcar_origin_main()
        s1 = self.commit("Ola 1005 · PRD1005A: candidatos", {"a.py": "1"})
        s2 = self.commit("reparación: ajuste del salvavidas", {"b.py": "2"})
        s3 = self.commit("Ola 1005 · zN4: salas", {"c.py": "3"})
        cands = pc.candidatos(self.dir)
        self.assertEqual(len(cands), 2)
        self.assertEqual(cands[0]["sha"], s1)
        self.assertEqual(cands[0]["salvavidas"], [{"sha": s2, "asunto": "reparación: ajuste del salvavidas"}])
        self.assertEqual(sorted(cands[0]["archivos"]), ["a.py", "b.py"])
        self.assertEqual(cands[1]["sha"], s3)
        self.assertEqual(cands[1]["salvavidas"], [])

    def test_salvavidas_huerfano_no_es_candidato(self):
        self.marcar_origin_main()
        self.commit("reparación sin tarea", {"a.py": "1"})
        self.assertEqual(pc.candidatos(self.dir), [])

    def test_filtro_esta_integrada(self):
        self.marcar_origin_main()
        self.commit("Ola 1005 · PRD1005A: candidatos", {"a.py": "1"})
        self.commit("Ola 1005 · zN4: salas", {"b.py": "2"})
        tareas = {"zN4": {"ola": "Ola 1005", "id": "zN4"}}
        cands = pc.candidatos(self.dir, tareas=tareas)
        self.assertEqual([c["tarea"] for c in cands], ["zN4"])

    def test_git_inyectable(self):
        llamadas = []

        def git_falso(raiz, args):
            llamadas.append(args)
            if args[0] == "log":
                return 0, "aaa\x1fOla 1005 · PRD1005A: candidatos\n"
            return 0, "src/x.ts\n"

        cands = pc.candidatos("/nada", git=git_falso)
        self.assertEqual(cands[0]["tarea"], "PRD1005A")
        self.assertEqual(cands[0]["medios"], ["web"])
        self.assertEqual(llamadas[0][0], "log")


class TestVeredictos(unittest.TestCase):
    def test_revision_no_bloqueante_por_evento(self):
        v = pc.veredictos(
            "zN4",
            progreso={"zN4": {"verificado": True}},
            eventos=[{"tipo": "revision", "tarea": "zN4", "veredicto": "con notas"}],
        )
        self.assertTrue(v["revision"]["ok"])
        self.assertTrue(v["verificacion"]["ok"])

    def test_revision_bloqueante(self):
        v = pc.veredictos(
            "zN4",
            progreso={"zN4": {"verificado": True}},
            eventos=[{"tipo": "revision", "tarea": "zN4", "veredicto": "bloqueante"}],
        )
        self.assertFalse(v["revision"]["ok"])

    def test_aprobada_por_alex(self):
        v = pc.veredictos(
            "zN4",
            progreso={"zN4": {"verificado": True}},
            eventos=[{"tipo": "aprobada", "tarea": "zN4", "de": "alex"}],
        )
        self.assertTrue(v["revision"]["ok"])

    def test_verificacion_de_la_tanda(self):
        v = pc.veredictos(
            "zN4",
            progreso={},
            eventos=[
                {"tipo": "revision", "tarea": "zN4", "veredicto": "ok"},
                {"tipo": "verificacion", "veredicto": "verde"},
            ],
        )
        self.assertTrue(v["verificacion"]["ok"])
        self.assertEqual(v["verificacion"]["detalle"], "verificado de la tanda")

    def test_sin_veredictos(self):
        v = pc.veredictos("zN4", progreso={}, eventos=[])
        self.assertFalse(v["revision"]["ok"])
        self.assertFalse(v["verificacion"]["ok"])

    def test_diseno_sin_carpeta_no_bloquea(self):
        v = pc.veredictos("zN4", dir_diseno="/no/existe", toca_interfaz=True)
        self.assertEqual(v["diseno"]["nota"], None)
        self.assertEqual(v["diseno"]["detalle"], "sin nota")

    def test_diseno_lee_nota_json(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "nota-zN4.json"), "w", encoding="utf-8") as f:
                json.dump({"nota": 88, "tarea": "zN4"}, f)
            v = pc.veredictos("zN4", dir_diseno=d, toca_interfaz=True)
            self.assertEqual(v["diseno"]["nota"], 88)

    def test_diseno_no_toca_interfaz(self):
        v = pc.veredictos("zN4", toca_interfaz=False)
        self.assertEqual(v["diseno"]["detalle"], "no toca interfaz")


class TestVetos(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="pc-vetos-")
        self.ruta = os.path.join(self.dir, "vetos.json")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_vetar_y_cargar(self):
        self.assertTrue(pc.vetar("abc123", "jev", "riesgo alto", ruta=self.ruta))
        vetos = pc.cargar_vetos(self.ruta)
        self.assertEqual(vetos["abc123"]["quien"], "jev")
        self.assertEqual(vetos["abc123"]["motivo"], "riesgo alto")
        veto = pc.veto_de(vetos, sha="abc123")
        self.assertEqual(veto["quien"], "jev")

    def test_escritura_atomica_sin_tmp_residual(self):
        pc.vetar("t1", "alex", "motivo", ruta=self.ruta)
        pc.vetar("t2", "alex", "otro", ruta=self.ruta)
        self.assertEqual(os.listdir(self.dir), ["vetos.json"])
        self.assertEqual(sorted(pc.cargar_vetos(self.ruta)), ["t1", "t2"])

    def test_cargar_vetos_inexistente_devuelve_vacio(self):
        self.assertEqual(pc.cargar_vetos(self.ruta), {})

    def test_veto_por_tid(self):
        pc.vetar("zN4", "director-diseno", "interfaz rota", ruta=self.ruta)
        vetos = pc.cargar_vetos(self.ruta)
        self.assertIsNone(pc.veto_de(vetos, sha="otro"))
        self.assertEqual(pc.veto_de(vetos, tid="zN4")["motivo"], "interfaz rota")


class TestElegible(unittest.TestCase):
    def _candidata(self, **veredictos):
        base = {
            "revision": {"ok": True, "detalle": "revisión no bloqueante (ok)"},
            "verificacion": {"ok": True, "detalle": "verificado de la tarea"},
            "diseno": {"nota": None, "detalle": "sin nota", "toca_interfaz": False},
        }
        base.update(veredictos)
        return {"sha": "abc", "tarea": "zN4", "veredictos": base}

    def test_elegible(self):
        ok, motivos = pc.elegible(self._candidata())
        self.assertTrue(ok)
        self.assertEqual(motivos, [])

    def test_no_elegible_por_veto_revision_y_diseno(self):
        c = self._candidata(
            revision={"ok": False, "detalle": "revisión bloqueante"},
            diseno={"nota": 40, "detalle": "nota 40", "toca_interfaz": True},
        )
        ok, motivos = pc.elegible(c, vetos={"abc": {"quien": "alex", "motivo": "no"}})
        self.assertFalse(ok)
        self.assertEqual(len(motivos), 3)
        self.assertIn("vetada por alex", motivos[0])

    def test_sin_nota_de_diseno_no_bloquea(self):
        c = self._candidata(diseno={"nota": None, "detalle": "sin nota", "toca_interfaz": True})
        ok, _ = pc.elegible(c)
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
