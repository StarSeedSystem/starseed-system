# -*- coding: utf-8 -*-
"""Pruebas de automejora_mac (MTN1027H2): sin ssh, con transporte falso y carpetas temporales."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import automejora_mac as M  # noqa: E402

RAIZ = tempfile.mkdtemp(prefix="automejora-mac-")


def cuando(dia=30, hora=3):
    return datetime(2026, 10, dia, hora, 0, tzinfo=timezone.utc).timestamp()


class Ssh:
    """Transporte falso: guarda órdenes y datos, y devuelve las respuestas dadas."""

    def __init__(self, salidas=None):
        self.llamadas = []
        self.salidas = list(salidas or [])

    def __call__(self, orden, datos):
        self.llamadas.append((orden, datos))
        return self.salidas.pop(0) if self.salidas else (0, "")


class Experiencias(unittest.TestCase):
    def test_fusiona_cierres_y_descarta_abiertas(self):
        lineas = [
            json.dumps({"id": "a", "capa": "juicio", "resultado": True}),
            json.dumps({"id": "b", "capa": "juicio", "resultado": None}),
            json.dumps({"ref": "b", "resultado": False}),
            json.dumps({"id": "c", "capa": "juicio", "resultado": None}),
            "no es json",
        ]
        cerradas = M.fusionar(lineas)
        self.assertEqual([e["id"] for e in cerradas], ["a", "b"])
        self.assertIs(cerradas[1]["resultado"], False)
        self.assertEqual([e["id"] for e in M.fusionar([" "])], [])

    def test_aporta_por_defecto_todas_y_respeta_las_que_no(self):
        propias = json.dumps({"id": "p", "resultado": True}) + "\n"
        copias = {"uno": json.dumps({"id": "u", "resultado": True}) + "\n",
                  "dos": json.dumps({"id": "d", "resultado": True}) + "\n"}
        todos = [json.loads(l)["id"] for l in M.reunir_experiencias(propias, copias).splitlines()]
        self.assertEqual(todos, ["p", "u", "d"])
        solo = [json.loads(l)["id"] for l in M.reunir_experiencias(propias, copias, {"dos"}).splitlines()]
        self.assertEqual(solo, ["p", "d"])
        self.assertIsNone(M.neuronas_que_aportan({}))
        self.assertEqual(M.neuronas_que_aportan({"aportar": False}), set())
        self.assertEqual(M.neuronas_que_aportan({"neuronas": {"a": True, "b": {"aportar": False}}}), {"a"})


class Config(unittest.TestCase):
    def test_sin_nombres_de_neuronas_y_con_juicio_por_defecto(self):
        c = M.config_para_a1({"capas": {"needle": True}, "neuronas": {"mac": {"aportar": True}},
                              "preguntar": True, "ruta_privada": "/x"})
        self.assertEqual(set(c), {"capas", "preguntar"})
        self.assertEqual(M.config_para_a1({})["capas"], {"juicio": True})


class Horario(unittest.TestCase):
    def test_una_vez_al_dia_tras_su_hora_utc(self):
        self.assertFalse(M.toca("enviar", cuando(hora=1), {}))
        self.assertTrue(M.toca("enviar", cuando(hora=2), {}))
        self.assertFalse(M.toca("enviar", cuando(hora=5), {"enviado": "2026-10-30"}))
        self.assertTrue(M.toca("enviar", cuando(dia=31, hora=2), {"enviado": "2026-10-30"}))
        self.assertFalse(M.toca("traer", cuando(hora=5), {}))
        self.assertTrue(M.toca("traer", cuando(hora=6), {}))
        self.assertEqual(M.fecha_utc(cuando()), "2026-10-30")


class Reparto(unittest.TestCase):
    INFORME = {"directivas": [{"capa": "juicio", "texto": "Antes de responder, comprueba el dato.",
                               "acierto": 0.8, "base": 0.5, "n": 40}],
               "propuestas": [{"titulo": "ayuda"}]}

    def test_directiva_nueva_activa_y_sin_repetir_la_misma(self):
        r = M.repartir(self.INFORME, {}, "2026-10-30")
        archivo = r["directivas"]["juicio"]
        self.assertEqual(archivo["historial"][-1]["estado"], "activa")
        self.assertEqual(archivo["activa"], 1)
        self.assertEqual(len(r["propuestas"]), 1)
        otra = M.repartir(self.INFORME, {"juicio": archivo}, "2026-10-31")
        self.assertEqual(otra["directivas"], {})
        self.assertEqual(otra["aplicadas"], [])

    def test_pauta_que_no_pasa_el_saneo_se_descarta(self):
        informe = {"directivas": [{"capa": "juicio", "texto": "Visita https://ejemplo.com",
                                   "acierto": 0.9, "base": 0.1, "n": 40}]}
        self.assertEqual(M.repartir(informe, {}, "2026-10-30")["directivas"], {})


class Enviar(unittest.TestCase):
    def test_manda_solo_cerradas_y_config_sin_neuronas(self):
        root = tempfile.mkdtemp()
        copias = os.path.join(root, "starseed_memory_root", "aprendizaje", "experiencias")
        os.makedirs(copias)
        for host, id_ in (("uno", "u"), ("dos", "d")):
            with open(os.path.join(copias, host + ".jsonl"), "w", encoding="utf-8") as f:
                f.write(json.dumps({"id": id_, "resultado": True}) + "\n")
        propias = os.path.join(root, "experiencias.jsonl")
        with open(propias, "w", encoding="utf-8") as f:
            f.write(json.dumps({"id": "p", "resultado": True}) + "\n")
            f.write(json.dumps({"id": "x", "resultado": None}) + "\n")
        config = os.path.join(root, "automejora.json")
        with open(config, "w", encoding="utf-8") as f:
            json.dump({"capas": {"juicio": True}, "neuronas": {"uno": {"aportar": True},
                                                               "dos": {"aportar": False}}}, f)
        ssh = Ssh()
        r = M.enviar(ssh=ssh, raiz=root, experiencias=propias, config_ruta=config)
        self.assertTrue(r["ok"])
        self.assertEqual(len(ssh.llamadas), 2)
        ids = [json.loads(l)["id"] for l in ssh.llamadas[0][1].decode().splitlines()]
        self.assertEqual(ids, ["p", "u"])
        self.assertNotIn("neuronas", json.loads(ssh.llamadas[1][1].decode()))

    def test_sin_experiencias_cerradas_no_abre_ssh(self):
        root = tempfile.mkdtemp()
        propias = os.path.join(root, "vacio.jsonl")
        open(propias, "w", encoding="utf-8").close()
        ssh = Ssh()
        r = M.enviar(ssh=ssh, raiz=root, experiencias=propias)
        self.assertTrue(r["ok"])
        self.assertIn("no", r)
        self.assertEqual(ssh.llamadas, [])


class Traer(unittest.TestCase):
    INFORME = {"ultima_noche": "2026-10-30",
               "directivas": [{"capa": "juicio", "texto": "Antes de responder, comprueba el dato.",
                               "acierto": 0.8, "base": 0.5, "n": 40}],
               "propuestas": [{"titulo": "ayuda"}]}

    def test_deja_directivas_propuestas_y_resumen_sin_repetir(self):
        root = tempfile.mkdtemp()
        config = os.path.join(root, "automejora.json")
        with open(config, "w", encoding="utf-8") as f:
            json.dump({"preguntar": False}, f)
        salida = json.dumps(self.INFORME)
        for _ in range(2):
            r = M.traer(ssh=Ssh([(0, salida)]), raiz=root, config_ruta=config, ahora=cuando())
            self.assertTrue(r["ok"])
        base = os.path.join(root, "starseed_memory_root")
        with open(os.path.join(base, "aprendizaje", "directivas", "juicio.json"), encoding="utf-8") as f:
            directivas = json.load(f)
        self.assertEqual(len(directivas["historial"]), 1)
        self.assertEqual(directivas["historial"][0]["estado"], "activa")
        with open(os.path.join(base, "olas", "propuestas-automejora", "2026-10-30.json"), encoding="utf-8") as f:
            self.assertEqual(len(json.load(f)["propuestas"]), 1)
        with open(os.path.join(base, "aprendizaje", "automejora", "ultima-noche.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["fecha"], "2026-10-30")
        self.assertFalse(os.path.exists(os.path.join(base, "olas", "2026-10-30.json")))

    def test_sin_salida_no_escribe_nada(self):
        root = tempfile.mkdtemp()
        r = M.traer(ssh=Ssh([(0, "  ")]), raiz=root)
        self.assertTrue(r["ok"])
        self.assertIn("no", r)
        self.assertFalse(os.path.exists(os.path.join(root, "starseed_memory_root")))


class DelDia(unittest.TestCase):
    def test_solo_marca_lo_que_termina_y_una_vez(self):
        import oracle_nodo as N

        estado = os.path.join(tempfile.mkdtemp(), "automejora-estado.json")
        llamadas = []

        def falso(orden, ahora=None):
            llamadas.append(orden)
            return {"ok": True} if orden == "traer" else {"ok": True, "no": "sin experiencias"}

        with mock.patch.object(N, "AUTOMEJORA_ESTADO", estado), mock.patch.object(N, "automejora", falso):
            self.assertEqual(set(N.automejora_del_dia(cuando(hora=3))), {"enviar"})
            self.assertEqual(set(N.automejora_del_dia(cuando(hora=7))), {"enviar", "traer"})
            self.assertEqual(set(N.automejora_del_dia(cuando(hora=8))), {"enviar"})
        with open(estado, encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"traido": "2026-10-30"})
        self.assertEqual(llamadas, ["enviar", "enviar", "traer", "enviar"])


if __name__ == "__main__":
    unittest.main()
