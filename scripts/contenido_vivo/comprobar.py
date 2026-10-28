"""Comprobador de una página viva (CVV1028, tarea L).

Uso: python3 scripts/contenido_vivo/comprobar.py <index.html>
Imprime cada prueba con PASA o FALLA y termina con código 1 si algo falla.
Solo biblioteca estándar. Contrato: architecture/contenido-vivo.md §5.
"""
import os
import re
import sys
from html.parser import HTMLParser

_FRASES = ("haz clic para jugar", "mueve el cursor", "click to play")
_SCROLL = re.compile(r"addEventListener\(\s*['\"]scroll['\"]")
_EXTERNOS = ("#", "http:", "https:", "//", "data:", "blob:", "mailto:", "javascript:", "tel:")
_CLAVES = {
    "data-vivo-herramienta": "herramienta",
    "data-vivo-interruptor-movimiento": "interruptor",
    "data-vivo-relleno": "relleno",
}


class _Pagina:
    def __init__(self):
        self.iframes: list[dict] = []
        self.recursos: list[str] = []
        self.scripts: list[str] = []
        self.texto: list[str] = []
        self.marcas = {"herramienta": 0, "interruptor": 0, "relleno": 0}


class _Lector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pag = _Pagina()
        self._sorda = ""

    def handle_starttag(self, tag, attrs):
        marcadas = dict(attrs)
        if tag == "iframe":
            self.pag.iframes.append(marcadas)
        self.pag.recursos.extend(v for k, v in attrs if k in ("src", "href") and v)
        for clave in marcadas:
            if clave in _CLAVES:
                self.pag.marcas[_CLAVES[clave]] += 1
        if tag in ("script", "style"):
            self._sorda = tag

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._sorda = ""

    def handle_data(self, data):
        if not self._sorda:
            self.pag.texto.append(data)
        elif self._sorda == "script":
            self.pag.scripts.append(data)


def _es_local(valor):
    """Un recurso local es una ruta relativa, no un enlace externo ni una plantilla."""
    if not valor or valor.startswith(_EXTERNOS) or "${" in valor or "{{" in valor:
        return False
    return bool(valor.split("#")[0].split("?")[0].strip())


def comprobar(ruta):
    """Devuelve la lista de pruebas de la página: (nombre, pasa, detalle)."""
    lector = _Lector()
    with open(ruta, encoding="utf-8") as flujo:
        fuente = flujo.read()
    lector.feed(fuente)
    pag = lector.pag
    texto = " ".join(" ".join(pag.texto).split()).lower()
    base = os.path.dirname(os.path.abspath(ruta))
    sin_escudo = sum(1 for m in pag.iframes if "data-vivo-escudo" not in m)
    brutos = [c for c in pag.scripts
              if _SCROLL.search(c) and "requestAnimationFrame" not in c and "passive" not in c]
    ausentes = [v for v in pag.recursos
                if _es_local(v) and not os.path.exists(os.path.join(base, v.split("#")[0].split("?")[0]))]
    rayas = bool(re.search(r"[—─]", texto) or re.search(r"-{3,}", texto))
    return [
        ("Niveles presentes", bool(pag.iframes or pag.marcas["herramienta"]), "sin iframe 3D ni data-vivo-herramienta"),
        ("Escudo sobre cada escena 3D", sin_escudo == 0, f"{sin_escudo} iframe(s) sin data-vivo-escudo"),
        ("Como mucho dos escenas 3D", len(pag.iframes) <= 2, f"hay {len(pag.iframes)} iframe(s), el tope es 2"),
        ("Sin llamadas a jugar", not any(f in texto for f in _FRASES), "frase prohibida en el texto visible"),
        ("Movimiento contenido", "prefers-reduced-motion" in fuente or pag.marcas["interruptor"] > 0,
         "falta prefers-reduced-motion y el interruptor de movimiento"),
        ("Scroll con rAF o passive", not brutos, f"{len(brutos)} oyente(s) de scroll sin rAF ni passive"),
        ("Recursos locales existen", not ausentes, "faltan: " + ", ".join(ausentes[:3])),
        ("Sin cajas de relleno", "lorem ipsum" not in texto and pag.marcas["relleno"] == 0,
         "hay una caja de relleno o lorem ipsum"),
        ("Sin rayas largas", not rayas, "hay rayas largas en el texto visible"),
        ("Listo para medir", any("window.__ready" in c for c in pag.scripts), "falta window.__ready en un script"),
    ]


def main(argumentos):
    if len(argumentos) != 2:
        print("Uso: python3 scripts/contenido_vivo/comprobar.py <index.html>")
        return 2
    pruebas = comprobar(argumentos[1])
    for nombre, pasa, detalle in pruebas:
        linea = ("PASA " + nombre) if pasa else ("FALLA " + nombre + ": " + detalle)
        print(linea)
    verdes = sum(1 for _n, pasa, _d in pruebas if pasa)
    print(f"{verdes} de {len(pruebas)} pruebas en verde")
    return 0 if verdes == len(pruebas) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
