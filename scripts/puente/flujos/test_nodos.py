"""Pruebas de los nodos de acción y del intérprete de expresiones.

Todo lo externo va inyectado en ``ctx`` falso: ninguna prueba toca la red.
"""

from __future__ import annotations

import unittest

from scripts.puente.flujos.expresiones import ErrorExpresion, evaluar, resolver
from scripts.puente.flujos import nodos


class ExpresionesTest(unittest.TestCase):
    CTX = {"$json": {"a": 3, "nombre": "Alex", "tags": ["x", "y"]},
           "$nodo": {"Buscar": {"json": {"total": 7}}},
           "$ahora": "2026-10-07T10:00:00"}

    def test_rutas(self) -> None:
        self.assertEqual(evaluar("$json.a", self.CTX), 3)
        self.assertEqual(evaluar('$nodo["Buscar"].json.total', self.CTX), 7)
        self.assertEqual(evaluar("$ahora", self.CTX), "2026-10-07T10:00:00")
        self.assertIsNone(evaluar("$json.inexistente.profundo", self.CTX))

    def test_operadores(self) -> None:
        self.assertTrue(evaluar("$json.a == 3", self.CTX))
        self.assertTrue(evaluar("$json.a != 4 y $json.a > 2", self.CTX))
        self.assertTrue(evaluar("no falso o $json.a < 1", self.CTX))
        self.assertEqual(evaluar("'Hola, ' + $json.nombre", self.CTX), "Hola, Alex")
        self.assertEqual(evaluar("1 + 2 + 3", self.CTX), 6)

    def test_plantillas(self) -> None:
        self.assertEqual(resolver("Hola, {{ $json.nombre }}", self.CTX), "Hola, Alex")
        self.assertEqual(resolver("{{ $json.a }}", self.CTX), 3)
        self.assertEqual(resolver({"u": "/x/{{ $json.a }}"}, self.CTX), {"u": "/x/3"})
        self.assertEqual(resolver(["{{ $json.tags }}"], self.CTX), [["x", "y"]])

    def test_rechaza_codigo(self) -> None:
        for fuente in ("__import__('os')", "eval('1')", "open('/etc/passwd')",
                       "$json.a; import os", "globals()", "x = 1"):
            with self.assertRaises(ErrorExpresion, msg=fuente):
                evaluar(fuente, self.CTX)

    def test_errores_de_forma(self) -> None:
        with self.assertRaises(ErrorExpresion):
            evaluar("$json.a ==", self.CTX)
        with self.assertRaises(ErrorExpresion):
            evaluar("($json.a", self.CTX)
        with self.assertRaises(ErrorExpresion):
            evaluar("$nodo[Buscar]", self.CTX)


class NodosTest(unittest.TestCase):
    def ctx(self, **extra):
        base = {"nodos": {}, "ahora": "2026-10-07T10:00:00", "env": {}}
        base.update(extra)
        return base

    def test_http_con_credencial_por_nombre(self) -> None:
        llamadas = []
        ctx = self.ctx(http=lambda m, u, cabeceras=None, cuerpo=None:
                       llamadas.append((m, u, cabeceras, cuerpo)) or {"ok": True},
                       env={"TOKEN_API": "secreto"})
        salida = nodos.nodo_http({"metodo": "post", "url": "https://ejemplo.test/{{ $json.id }}",
                                  "credencial": "TOKEN_API", "cuerpo": {"v": "{{ $json.id }}"}},
                                 [{"id": 5}], ctx)
        self.assertEqual(salida[0]["respuesta"], {"ok": True})
        metodo, url, cabeceras, cuerpo = llamadas[0]
        self.assertEqual((metodo, url, cuerpo), ("POST", "https://ejemplo.test/5", {"v": 5}))
        self.assertEqual(cabeceras["Authorization"], "Bearer secreto")
        self.assertNotIn("secreto", str(salida))

    def test_http_sin_variable_falla_sin_llamar(self) -> None:
        llamadas = []
        ctx = self.ctx(http=lambda *a, **k: llamadas.append(a), env={})
        with self.assertRaises(ValueError):
            nodos.nodo_http({"url": "https://x", "credencial": "NO_EXISTE"}, [{}], ctx)
        self.assertEqual(llamadas, [])

    def test_ntfy(self) -> None:
        llamadas = []
        ctx = self.ctx(http=lambda *a, **k: llamadas.append((a, k)))
        items = nodos.nodo_ntfy({"tema": "avisos", "titulo": "Ola {{ $json.ola }}",
                                 "mensaje": "Hecho"}, [{"ola": "1005F"}], ctx)
        self.assertEqual(items, [{"ola": "1005F"}])
        (metodo, url), kw = llamadas[0]
        self.assertEqual((metodo, url), ("POST", "https://ntfy.sh/avisos"))
        self.assertEqual(kw["cabeceras"]["Title"], "Ola 1005F")

    def test_telegram_y_chat_director(self) -> None:
        enviados, publicados = [], []
        ctx = self.ctx(telegram=lambda chat_id, texto: enviados.append((chat_id, texto)),
                       chat=lambda **kw: publicados.append(kw))
        nodos.nodo_telegram({"chat_id": "42", "texto": "Fin {{ $json.tarea }}"},
                            [{"tarea": "FLU1005B"}], ctx)
        nodos.nodo_chat_director({"texto": "Listo", "de": "prueba"}, [{"x": 1}], ctx)
        self.assertEqual(enviados, [("42", "Fin FLU1005B")])
        self.assertEqual(publicados[0]["texto"], "Listo")
        self.assertEqual(publicados[0]["de"], "prueba")

    def test_ia_libre_y_tipada(self) -> None:
        ctx = self.ctx(llamar_modelo=lambda prompt: f"eco:{prompt}")
        salida = nodos.nodo_ia({"prompt": "Resume {{ $json.t }}", "campo": "r"}, [{"t": "ola"}], ctx)
        self.assertEqual(salida[0]["r"], "eco:Resume ola")
        lote = lambda estado, preguntas, quien=None: {"respuestas": {"sigue": {"valor": True}}}
        salida2 = nodos.nodo_ia({"tipado": {"sigue": {"tipo": "si-no", "pregunta": "¿Sigo {{ $json.t }}?"}},
                                 "estado": {"fase": "{{ $json.t }}"}}, [{"t": "ola"}], self.ctx(consultar_lote=lote))
        self.assertEqual(salida2[0]["sigue"], {"valor": True})

    def test_conocimiento_y_si_y_switch(self) -> None:
        ctx = self.ctx(conocimiento=lambda base, consulta, k: [(base, consulta, k)])
        salida = nodos.nodo_conocimiento({"base": "flujos", "consulta": "{{ $json.q }}", "k": 2},
                                         [{"q": "reintento"}], ctx)
        self.assertEqual(salida[0]["fragmentos"], [("flujos", "reintento", 2)])
        pares = nodos.nodo_si({"condicion": "$json.n > 1"}, [{"n": 1}, {"n": 2}, {"n": 3}], self.ctx())
        self.assertEqual([i["n"] for i in pares], [2, 3])
        casos = nodos.nodo_switch({"expresion": "$json.n", "casos": {"2": "par"}},
                                  [{"n": 2}, {"n": 3}], self.ctx())
        self.assertEqual([i["caso"] for i in casos], ["par", "por_defecto"])

    def test_fusion_set_esperar(self) -> None:
        fusion = nodos.nodo_fusion({"modo": "parear"},
                                   [{"a": 1}, {"b": 2}, {"c": 3}, {"d": 4}], self.ctx())
        self.assertEqual(fusion, [{"a": 1, "b": 2}, {"c": 3, "d": 4}])
        self.assertEqual(len(nodos.nodo_fusion({}, [{"a": 1}], self.ctx())), 1)
        fijado = nodos.nodo_set({"campos": {"doble": "{{ $json.n + $json.n }}"}, "conservar": True},
                                [{"n": 4}], self.ctx())
        self.assertEqual(fijado, [{"n": 4, "doble": 8}])
        dormidas = []
        ctx = self.ctx(dormir=lambda ms: dormidas.append(ms))
        items = nodos.nodo_esperar({"ms": 250}, [{"n": 1}], ctx)
        self.assertEqual((items, dormidas), ([{"n": 1}], [250]))

    def test_registro_cubre_el_contrato(self) -> None:
        for tipo in ("http", "ntfy", "telegram", "chat_director", "ia", "conocimiento",
                     "si", "switch", "fusion", "set", "esperar"):
            self.assertIn(tipo, nodos.NODOS)


if __name__ == "__main__":
    unittest.main()
