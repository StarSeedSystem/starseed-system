#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la ronda de aparatos. Sin red, sin git real, sin ~/.starseed: todo pasa por un `Medios` falso."""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ronda as R  # noqa: E402

SHA = "a" * 40
T0 = 1_800_000_000.0


class Falso:
    def __init__(self, **o):
        self.o = dict(
            activa=True, sha=SHA, numero=37, run_id=12345, run_creado_t=T0,
            pedida_por="alex", t_inicio=T0, t_caduca=T0 + 3600,
            fase="esperando-run", detalle="", avisos=[],
            runs=[], run_detalle={}, autopub_estado={}, chats=[]
        )
        self.o.update(o)
        self.guardados = []
        self.chats = []

    def ahora(self):
        return self.o.get("ahora", T0)

    def ruta_estado(self):
        return "/tmp/ronda-estado.json"

    def leer_estado(self):
        return dict(self.o)

    def escribir_estado(self, est):
        self.guardados.append(dict(est))
        self.o.update(est)

    def sh(self, args, timeout=120, env=None):
        if args[0] == "gh" and "release" in args:
            return 0, '{"version": "0.5.1-prueba.37"}', ""
        return 0, "", ""

    def gh_json(self, args):
        if "run" in args and "list" in args:
            return self.o["runs"]
        if "run" in args and "view" in args:
            return self.o["run_detalle"]
        return None

    def runs_pruebas(self):
        return self.o["runs"]

    def run_detalle(self, run_id):
        return self.o["run_detalle"]

    def autopublicar_estado(self):
        return self.o["autopub_estado"]

    def avisar_autopublicar(self, motivo):
        self.o.setdefault("autopub_avisos", []).append(motivo)

    def chat(self, texto, tipo="informe"):
        self.chats.append((texto, tipo))


class Estado(unittest.TestCase):
    def test_estado_vacio(self):
        e = R.estado_vacio()
        self.assertFalse(e["activa"])
        self.assertIsNone(e["sha"])

    def test_normalizar_estado_descarta_basura(self):
        e = R.normalizar_estado({"activa": "sí", "sha": SHA, "numero": "no", "fase": 123})
        self.assertFalse(e["activa"])
        self.assertEqual(e["sha"], SHA)
        self.assertIsNone(e["numero"])
        self.assertEqual(e["fase"], "esperando-run")

    def test_con_fase_actualiza_timestamp(self):
        e = R.con_fase(R.estado_vacio(), "compilando", "en marcha", T0)
        self.assertEqual(e["fase"], "compilando")
        self.assertEqual(e["detalle"], "en marcha")
        # time.gmtime(T0) da 2027-01-15T08:00:00Z en UTC
        self.assertEqual(e["t"], "2027-01-15T08:00:00Z")

    def test_caducada_por_t_caduca(self):
        e = R.estado_vacio()
        e.update(activa=True, t_caduca=T0 - 1)
        self.assertTrue(R.caducada(e, T0))
        e["t_caduca"] = T0 + 1
        self.assertFalse(R.caducada(e, T0))

    def test_caducada_sin_run_tras_10_min(self):
        e = R.estado_vacio()
        e.update(activa=True, t_inicio=T0 - 700)
        self.assertTrue(R.caducada(e, T0))
        e["t_inicio"] = T0 - 100
        self.assertFalse(R.caducada(e, T0))


class PedirRonda(unittest.TestCase):
    def test_sha_invalido(self):
        ok, msg, _ = R.pedir_ronda("corto", "alex", T0)
        self.assertFalse(ok)
        self.assertIn("40 caracteres", msg)

    def test_quien_invalido(self):
        ok, msg, _ = R.pedir_ronda(SHA, "Alex!", T0)
        self.assertFalse(ok)

    def test_valida_crea_estado_con_t_caduca_60_min(self):
        ok, msg, est = R.pedir_ronda(SHA, "alex", T0)
        self.assertTrue(ok)
        self.assertEqual(est["sha"], SHA)
        self.assertEqual(est["pedida_por"], "alex")
        self.assertEqual(est["t_caduca"], T0 + 3600)
        self.assertEqual(est["fase"], "esperando-run")


class Pasada(unittest.TestCase):
    def test_sin_ronda_activa_no_hace_nada(self):
        m = Falso(activa=False)
        e = R.pasada(m)
        self.assertFalse(e["activa"])

    def test_caducada_cierra_ronda_y_avisa_autopublicar(self):
        m = Falso(activa=True, t_caduca=T0 - 1)
        e = R.pasada(m)
        self.assertFalse(e["activa"])
        self.assertEqual(e["fase"], "caducada")
        self.assertIn("ronda terminada", m.o.get("autopub_avisos", [])[0])

    def test_detecta_run_nuevo_para_el_sha(self):
        # createdAt que corresponde a T0 (2027-01-15T08:00:00Z)
        creado_iso = "2027-01-15T08:00:00Z"
        m = Falso(
            activa=True, run_id=None, t_inicio=T0,
            runs=[{"head_sha": SHA, "event": "workflow_dispatch", "headBranch": "main",
                  "databaseId": 12345, "number": 37, "createdAt": creado_iso}]
        )
        e = R.pasada(m)
        self.assertEqual(e["run_id"], 12345)
        self.assertEqual(e["numero"], 37)
        self.assertEqual(e["fase"], "en-cola")

    def test_ignora_runs_de_otro_sha_o_evento(self):
        m = Falso(
            activa=True, run_id=None, t_inicio=T0,
            runs=[{"head_sha": "b" * 40, "event": "workflow_dispatch", "headBranch": "main",
                  "databaseId": 999, "number": 99, "createdAt": "2026-11-12T01:10:00Z"}]
        )
        e = R.pasada(m)
        self.assertIsNone(e["run_id"])

    def test_sigue_run_en_cola(self):
        m = Falso(
            run_id=12345, run_creado_t=T0,
            run_detalle={"status": "queued", "conclusion": "", "jobs": [],
                         "databaseId": 12345, "number": 37, "headSha": SHA}
        )
        e = R.pasada(m)
        self.assertEqual(e["fase"], "en-cola")

    def test_sigue_run_compilando(self):
        m = Falso(
            run_id=12345, run_creado_t=T0,
            run_detalle={"status": "in_progress", "conclusion": "", "jobs": [{"name": "x", "status": "in_progress"}],
                         "databaseId": 12345, "number": 37, "headSha": SHA}
        )
        e = R.pasada(m)
        self.assertEqual(e["fase"], "compilando")

    def test_tope_50_min_desde_creacion_gitHub_no_desde_espera(self):
        # run creado hace 51 min, aún in_progress → fallo
        m = Falso(
            run_id=12345, run_creado_t=T0 - 51 * 60,
            run_detalle={"status": "in_progress", "conclusion": "", "jobs": [],
                         "databaseId": 12345, "number": 37, "headSha": SHA},
            ahora=T0 + 100
        )
        e = R.pasada(m)
        self.assertEqual(e["fase"], "fallo")
        self.assertIn("50 min desde su creación", e["detalle"])

    def test_run_completed_success_con_manifiestos_ok_publicada(self):
        m = Falso(
            run_id=12345, run_creado_t=T0, numero=37, version="0.5.1-prueba.37",
            run_detalle={"status": "completed", "conclusion": "success", "jobs": [],
                         "databaseId": 12345, "number": 37, "headSha": SHA},
        )
        e = R.pasada(m)
        self.assertEqual(e["fase"], "publicada")
        self.assertEqual(e.get("manifiestos"), {"escritorio": "0.5.1-prueba.37", "android": "0.5.1-prueba.37"})

    def test_run_completed_cancelled_cierra_como_cancelada(self):
        m = Falso(
            run_id=12345, run_creado_t=T0,
            run_detalle={"status": "completed", "conclusion": "cancelled", "jobs": [],
                         "databaseId": 12345, "number": 37, "headSha": SHA}
        )
        e = R.pasada(m)
        self.assertEqual(e["fase"], "cancelada")
        self.assertFalse(e["activa"])

    def test_run_completed_failure_cierra_como_fallo(self):
        m = Falso(
            run_id=12345, run_creado_t=T0,
            run_detalle={"status": "completed", "conclusion": "failure", "jobs": [],
                         "databaseId": 12345, "number": 37, "headSha": SHA}
        )
        e = R.pasada(m)
        self.assertEqual(e["fase"], "fallo")
        self.assertFalse(e["activa"])

    def test_run_success_sin_manifiestos_publicando(self):
        m = Falso(
            run_id=12345, run_creado_t=T0, numero=37, version="0.5.1-prueba.37",
            run_detalle={"status": "completed", "conclusion": "success", "jobs": [],
                         "databaseId": 12345, "number": 37, "headSha": SHA}
        )
        # sh para release download devuelve versión distinta
        def sh_falso(args, **_):
            if "latest-prueba.json" in args:
                return 0, '{"version": "0.5.1-prueba.36"}', ""
            if "latest-prueba-android.json" in args:
                return 0, '{"version": "0.5.1-prueba.36"}', ""
            return 0, "", ""
        m.sh = sh_falso
        e = R.pasada(m)
        self.assertEqual(e["fase"], "publicando")


if __name__ == "__main__":
    unittest.main()