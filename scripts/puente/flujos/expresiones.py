"""Expresiones seguras de los Flujos de Genesis.

Plantillas ``{{ ... }}`` y rutas ``$json.campo``, ``$nodo["X"].json.y`` y
``$ahora``, con operadores ``==``, ``!=``, ``<``, ``>``, ``y``, ``o``,
``no`` y ``+``. Intérprete propio: NUNCA usa ``eval`` ni ``exec``.
"""

from __future__ import annotations

import re
from typing import Any

Contexto = dict[str, Any]

_PLANTILLA = re.compile(r"\{\{\s*(.*?)\s*\}\}", re.DOTALL)
_TOKEN = re.compile(
    r"\s*(?:"
    r"(?P<numero>\d+(?:\.\d+)?)"
    r"|(?P<texto>'[^']*'|\"[^\"]*\")"
    r"|(?P<op>==|!=|<|>|\+|\(|\)|\[|\]|\.)"
    r"|(?P<nombre>[A-Za-z_$][\w$]*)"
    r")"
)


class ErrorExpresion(ValueError):
    """Expresión mal formada o con un identificador no permitido."""


def _tokens(fuente: str) -> list[tuple[str, str]]:
    piezas: list[tuple[str, str]] = []
    pos = 0
    while pos < len(fuente):
        if fuente[pos].isspace():
            pos += 1
            continue
        m = _TOKEN.match(fuente, pos)
        if not m:
            raise ErrorExpresion(f"Carácter no permitido en la expresión: {fuente[pos]!r}")
        pos = m.end()
        piezas.append((m.lastgroup or "", m.group(m.lastgroup or "nombre")))
    return piezas


class _Parser:
    def __init__(self, tokens: list[tuple[str, str]], contexto: Contexto):
        self.tokens = tokens
        self.pos = 0
        self.contexto = contexto

    def _mira(self) -> tuple[str, str] | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def _come(self) -> tuple[str, str]:
        token = self._mira()
        if token is None:
            raise ErrorExpresion("Expresión incompleta")
        self.pos += 1
        return token

    def _acepta(self, valor: str) -> bool:
        token = self._mira()
        if token and (token[1] == valor or token[0] == valor):
            self.pos += 1
            return True
        return False

    def expresion(self) -> Any:
        return self._o()

    def _o(self) -> Any:
        valor = self._y()
        while self._acepta("o"):
            derecha = self._y()
            valor = bool(valor) or bool(derecha)
        return valor

    def _y(self) -> Any:
        valor = self._comparacion()
        while self._acepta("y"):
            derecha = self._comparacion()
            valor = bool(valor) and bool(derecha)
        return valor

    def _comparacion(self) -> Any:
        if self._acepta("no"):
            return not self._comparacion()
        izquierda = self._suma()
        token = self._mira()
        if token and token[1] in ("==", "!=", "<", ">"):
            self._come()
            derecha = self._suma()
            if token[1] == "==":
                return izquierda == derecha
            if token[1] == "!=":
                return izquierda != derecha
            if not isinstance(izquierda, (int, float, str)) or type(izquierda) is not type(derecha):
                if not (isinstance(izquierda, (int, float)) and isinstance(derecha, (int, float))):
                    raise ErrorExpresion(f"No se puede comparar con {token[1]}: "
                                         f"{type(izquierda).__name__} y {type(derecha).__name__}")
            return izquierda < derecha if token[1] == "<" else izquierda > derecha
        return izquierda

    def _suma(self) -> Any:
        valor = self._primario()
        while self._acepta("+"):
            otro = self._primario()
            if isinstance(valor, bool) or isinstance(otro, bool):
                raise ErrorExpresion("No se puede sumar un booleano")
            if isinstance(valor, (int, float)) and isinstance(otro, (int, float)):
                valor = valor + otro
            elif isinstance(valor, str) and isinstance(otro, str):
                valor = valor + otro
            elif isinstance(valor, list) and isinstance(otro, list):
                valor = valor + otro
            else:
                raise ErrorExpresion("Operando no válido para +")
        return valor

    def _primario(self) -> Any:
        token = self._come()
        if token[0] == "numero":
            return float(token[1]) if "." in token[1] else int(token[1])
        if token[0] == "texto":
            return token[1][1:-1]
        if token[1] == "(":
            valor = self.expresion()
            if not self._acepta(")"):
                raise ErrorExpresion("Falta cerrar el paréntesis")
            return valor
        if token[0] == "nombre":
            if token[1] == "cierto":
                return True
            if token[1] == "falso":
                return False
            if token[1] == "nulo":
                return None
            if not token[1].startswith("$"):
                raise ErrorExpresion(f"Identificador no permitido: {token[1]}")
            return self._ruta(token[1])
        raise ErrorExpresion(f"Token inesperado: {token[1]}")

    def _ruta(self, raiz: str) -> Any:
        valor: Any = self.contexto.get(raiz)
        while True:
            token = self._mira()
            if token and token[1] == ".":
                self._come()
                _, nombre = self._come()
                valor = valor.get(nombre) if isinstance(valor, dict) else None
            elif token and token[1] == "[":
                self._come()
                tipo, clave = self._come()
                if tipo != "texto":
                    raise ErrorExpresion("Entre corchetes solo va un texto: $nodo[\"Nombre\"]")
                if not self._acepta("]"):
                    raise ErrorExpresion("Falta cerrar el corchete")
                valor = valor.get(clave[1:-1]) if isinstance(valor, dict) else None
            else:
                return valor


def evaluar(fuente: str, contexto: Contexto) -> Any:
    """Evalúa una expresión; el contexto expone $json, $nodo y $ahora."""
    parser = _Parser(_tokens(fuente), contexto)
    valor = parser.expresion()
    if parser.pos != len(parser.tokens):
        raise ErrorExpresion("Sobra texto al final de la expresión")
    return valor


def resolver(valor: Any, contexto: Contexto) -> Any:
    """Sustituye las plantillas ``{{ ... }}`` en textos, listas y dicts.

    Un texto que es una sola plantilla conserva el tipo del resultado
    (número, lista, dict…); con texto alrededor se intercala como cadena.
    """
    if isinstance(valor, str):
        coincidencias = list(_PLANTILLA.finditer(valor))
        if not coincidencias:
            return valor
        if len(coincidencias) == 1 and coincidencias[0].span() == (0, len(valor)):
            return evaluar(coincidencias[0].group(1), contexto)
        partes: list[str] = []
        fin = 0
        for m in coincidencias:
            partes.append(valor[fin:m.start()])
            partes.append(str(evaluar(m.group(1), contexto)))
            fin = m.end()
        partes.append(valor[fin:])
        return "".join(partes)
    if isinstance(valor, dict):
        return {k: resolver(v, contexto) for k, v in valor.items()}
    if isinstance(valor, list):
        return [resolver(v, contexto) for v in valor]
    return valor
