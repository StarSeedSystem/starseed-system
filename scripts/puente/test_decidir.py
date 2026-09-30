# -*- coding: utf-8 -*-
"""Pruebas de la puerta común de decisión (decidir.py): Jev de consejero con la regla de
respaldo, experiencias anotadas, lotes, recorte del estado y el uso del día. Sin red: Jev es
un doble y las experiencias van a una carpeta temporal."""
import io
import json
import os
import shutil
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)

import decidir as D  # noqa: E402
import experiencias as E  # noqa: E402
import jev as J  # noqa: E402


class JevDoble(object):
    """Contesta lo que se le programe; None = Jev en silencio."""

    def __init__(self, respuesta=None, lanza=False):
        self.respuesta = respuesta
        self.lanza = lanza
        self.llamadas = []

    def decidir(self, estado, preguntas, quien=None):
        self.llamadas.append({"estado": estado, "preguntas": preguntas, "quien": quien})
        if self.lanza:
            raise RuntimeError("sin red")
        if callable(self.respuesta):
            return self.respuesta(estado, preguntas)
        return self.respuesta


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="decidir-")
        self.viejos = {}
        self.parchear(E, "RUTA", os.path.join(self.dir, "experiencias.jsonl"))
        self.parchear(E, "COPIA_DIR", os.path.join(self.dir, "copia"))
        self.parchear(D, "EXP", E)
        self.viejo_env = os.environ.pop("STARSEED_JEV", None)

    def tearDown(self):
        for (obj, attr), valor in self.viejos.items():
            setattr(obj, attr, valor)
        if self.viejo_env is not None:
            os.environ["STARSEED_JEV"] = self.viejo_env
        else:
            os.environ.pop("STARSEED_JEV", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def parchear(self, obj, attr, valor):
        self.viejos.setdefault((obj, attr), getattr(obj, attr))
        setattr(obj, attr, valor)

    def experiencias(self):
        try:
            with open(E.RUTA, encoding="utf-8") as f:
                return [json.loads(l) for l in f if l.strip()]
        except OSError:
            return []


class SiNo(Base):
    def test_jev_contesta_con_probabilidad_medio_y_experiencia(self):
        doble = JevDoble({"q": {"type": "noul", "noul": 0.83}, "medio": "openrouter", "ms": 410})
        self.parchear(D, "JEV", doble)
        d = D.consultar("si-no", {"tarea": "SA1"}, "¿Relanzo?", quien="supervisor-claude", dominio="suenos")
        self.assertEqual((d["respuesta"], d["p"], d["medio"], d["quien"]), ("sí", 0.83, "openrouter", "supervisor-claude"))
        self.assertEqual(doble.llamadas[0]["quien"], "supervisor-claude")
        self.assertEqual(doble.llamadas[0]["preguntas"]["q"]["type"], "noul")
        exps = self.experiencias()
        self.assertEqual(len(exps), 1)
        self.assertEqual((exps[0]["capa"], exps[0]["tipo"], exps[0]["quien"], exps[0]["id"]),
                         ("jev", "si_no", "supervisor-claude", d["experiencia"]))

    def test_jev_en_silencio_manda_la_regla_y_se_anota_como_regla(self):
        self.parchear(D, "JEV", JevDoble(None))
        d = D.consultar("si-no", {}, "¿Paro?")
        self.assertEqual((d["respuesta"], d["p"], d["medio"]), ("no", None, "regla"))
        d = D.consultar("si-no", {}, "¿Sigo?", regla="si")
        self.assertEqual(d["respuesta"], "sí")
        self.assertEqual([e["capa"] for e in self.experiencias()], ["regla", "regla"])

    def test_jev_que_lanza_no_rompe_nada(self):
        self.parchear(D, "JEV", JevDoble(lanza=True))
        self.assertEqual(D.consultar("si-no", {}, "¿?", regla="sí")["medio"], "regla")

    def test_apagado_no_pregunta(self):
        doble = JevDoble({"q": {"noul": 0.9}})
        self.parchear(D, "JEV", doble)
        os.environ["STARSEED_JEV"] = "0"
        d = D.consultar("si-no", {}, "¿?")
        self.assertEqual((d["medio"], doble.llamadas), ("regla", []))

    def test_de_la_cache_se_dice(self):
        self.parchear(D, "JEV", JevDoble({"q": {"noul": 0.2}, "medio": "local", "cache": True}))
        d = D.consultar("si-no", {}, "¿?")
        self.assertEqual((d["respuesta"], d["medio"]), ("no", "cache"))


class ElegirYPuntuar(Base):
    def test_elegir_devuelve_una_de_las_opciones(self):
        self.parchear(D, "JEV", JevDoble({"q": {"choice": "nim", "probabilities": {"groq": 0.2, "nim": 0.8},
                                                "confidence": 0.8}, "medio": "local"}))
        d = D.consultar("elegir", {}, "¿Quién sintetiza?", opciones="groq,nim,gemini")
        self.assertEqual((d["respuesta"], d["p"], d["confianza"], d["medio"]), ("nim", 0.8, 0.8, "local"))

    def test_una_eleccion_fuera_de_las_opciones_es_silencio(self):
        self.parchear(D, "JEV", JevDoble({"q": {"choice": "otra", "confidence": 0.9}, "medio": "local"}))
        d = D.consultar("elegir", {}, "¿?", opciones=["a", "b"], regla="b")
        self.assertEqual((d["respuesta"], d["medio"]), ("b", "regla"))
        d = D.consultar("elegir", {}, "¿?", opciones=["a", "b"])
        self.assertEqual(d["respuesta"], "a")  # sin regla: el primero del orden determinista

    def test_puntuar_redondea_al_nivel_y_nombra_las_probabilidades(self):
        self.parchear(D, "JEV", JevDoble({"q": {"score": 2.6, "probabilities": {"2": 0.3, "3": 0.6},
                                                "confidence": 0.6}, "medio": "openrouter"}))
        d = D.consultar("puntuar", {}, "¿Prioridad?", niveles="nula,baja,media,alta")
        self.assertEqual((d["respuesta"], d["valor"], d["probs"]), ("alta", 2.6, {"media": 0.3, "alta": 0.6}))

    def test_puntuar_sin_jev_toma_el_nivel_del_medio(self):
        self.parchear(D, "JEV", JevDoble(None))
        self.assertEqual(D.consultar("puntuar", {}, "¿?", niveles=["baja", "media", "alta"])["respuesta"], "media")

    def test_errores_de_uso(self):
        with self.assertRaises(ValueError):
            D.consultar("elegir", {}, "¿?", opciones=["solo"])
        with self.assertRaises(ValueError):
            D.consultar("adivinar", {}, "¿?")


class Lote(Base):
    def test_un_lote_es_una_sola_llamada_y_lo_no_contestado_no_aparece(self):
        doble = JevDoble({"a0": {"noul": 0.9}, "v0": {"score": 3, "confidence": 0.7}, "medio": "openrouter"})
        self.parchear(D, "JEV", doble)
        r = D.consultar_lote({"obs": ["x", "y"]}, {
            "a0": {"tipo": "si-no", "pregunta": "¿0 accionable?"},
            "v0": {"tipo": "puntuar", "pregunta": "valor 0", "niveles": ["nulo", "bajo", "medio", "alto"]},
            "a1": {"tipo": "si-no", "pregunta": "¿1 accionable?"},
        }, quien="analista")
        self.assertEqual(len(doble.llamadas), 1)
        self.assertEqual(set(r["respuestas"]), {"a0", "v0"})
        self.assertEqual(r["respuestas"]["v0"]["respuesta"], "alto")
        self.assertEqual((r["medio"], r["preguntas"]), ("openrouter", 3))
        self.assertEqual(self.experiencias()[-1]["tipo"], "lote")

    def test_lote_en_silencio(self):
        self.parchear(D, "JEV", JevDoble(None))
        r = D.consultar_lote({}, {"a": {"tipo": "si-no", "pregunta": "¿?"}})
        self.assertEqual((r["respuestas"], r["medio"]), ({}, "regla"))


class Estado(Base):
    def test_recorta_y_tacha_claves(self):
        estado = {"clave": "sk-" + "a" * 30, "texto": "x" * 20000, "lista": list(range(500))}
        e = D.recortar_estado(estado, 2000)
        s = json.dumps(e, ensure_ascii=False)
        self.assertLessEqual(len(s), 2000)
        self.assertNotIn("sk-aaaa", s)
        self.assertIn("[REDACTADO]", s)

    def test_leer_estado_json_archivo_y_texto(self):
        self.assertEqual(D.leer_estado('{"a": 1}'), {"a": 1})
        self.assertEqual(D.leer_estado("[1, 2]"), {"estado": [1, 2]})
        self.assertEqual(D.leer_estado("hola"), {"texto": "hola"})
        ruta = os.path.join(self.dir, "e.json")
        with open(ruta, "w") as f:
            f.write('{"b": 2}')
        self.assertEqual(D.leer_estado("@" + ruta), {"b": 2})
        self.assertEqual(D.leer_estado("@-", io.StringIO('{"c": 3}')), {"c": 3})


class Confirmar(Base):
    def test_cierra_el_ciclo(self):
        self.parchear(D, "JEV", JevDoble({"q": {"noul": 0.7}, "medio": "local"}))
        d = D.consultar("si-no", {}, "¿?")
        D.confirmar(d["experiencia"], False, "no era para tanto")
        vistas = E.leer(E.RUTA)
        self.assertIs(vistas[-1]["resultado"], False)


class Uso(Base):
    def test_uso_del_dia_frente_al_techo(self):
        self.parchear(J, "USO", os.path.join(self.dir, "uso.json"))
        with open(J.USO, "w") as f:
            json.dump({"dias": {"2026-09-30": {"llamadas": 12, "coste_usd": 0.0004, "cache": 5,
                                               "por_medio": {"local": {"llamadas": 8}, "openrouter": {"llamadas": 4}},
                                               "por_quien": {"analista": 9, "supervisor": 3}}}}, f)
        self.parchear(D, "JEV", J)
        u = D.uso("2026-09-30")
        self.assertEqual((u["llamadas"], u["cache"], u["por_medio"]), (12, 5, {"local": 8, "openrouter": 4}))
        self.assertAlmostEqual(u["restante_dia_usd"], J.PRESUPUESTO_DIA_USD - 0.0004, places=6)
        self.assertIn("12 decisiones", D.texto_uso(u))


class Cli(Base):
    def correr(self, *argv):
        out = io.StringIO()
        codigo = D.main(list(argv), salida=out)
        return codigo, out.getvalue()

    def test_si_no_json_y_codigo_de_salida(self):
        self.parchear(D, "JEV", JevDoble({"q": {"noul": 0.2}, "medio": "local"}))
        codigo, texto = self.correr("si-no", "--estado", '{"a": 1}', "--pregunta", "¿Lanzo?", "--json", "--codigo")
        self.assertEqual(codigo, 1)
        self.assertEqual(json.loads(texto)["respuesta"], "no")
        codigo, texto = self.correr("si-no", "--pregunta", "¿Lanzo?", "--regla", "si")
        self.assertEqual(codigo, 0)
        self.assertIn("no · local", texto)

    def test_elegir_por_terminal(self):
        self.parchear(D, "JEV", JevDoble(None))
        codigo, texto = self.correr("elegir", "--pregunta", "¿?", "--opciones", "a,b", "--regla", "b", "--quien", "subagente")
        self.assertEqual(codigo, 0)
        self.assertTrue(texto.startswith("b · regla"))
        self.assertEqual(self.experiencias()[-1]["quien"], "subagente")

    def test_uso_por_terminal(self):
        self.parchear(J, "USO", os.path.join(self.dir, "uso.json"))
        self.parchear(D, "JEV", J)
        codigo, texto = self.correr("uso", "--json")
        self.assertEqual(codigo, 0)
        self.assertIn("tope_dia_usd", json.loads(texto))


class JevConQuien(Base):
    """El cambio mínimo en jev.py: `quien` explícito y la marca de caché."""

    def test_quien_y_cache(self):
        self.parchear(J, "CACHE", os.path.join(self.dir, "cache.json"))
        self.parchear(J, "USO", os.path.join(self.dir, "uso.json"))
        self.parchear(J, "_local", lambda: None)
        self.parchear(J, "decidir_con_laya", lambda *a, **k: None)
        self.parchear(J, "TRANSPORTE", lambda cuerpo: {"answers": {"q": {"noul": 0.6}}, "usage": {}})
        r1 = J.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}}, quien="analista")
        r2 = J.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}}, quien="analista")
        self.assertNotIn("cache", r1)
        self.assertTrue(r2["cache"])
        with open(J.USO) as f:
            self.assertEqual(json.load(f)["dias"][__import__("time").strftime("%Y-%m-%d")]["por_quien_cache"], {"analista": 1})


if __name__ == "__main__":
    unittest.main()
