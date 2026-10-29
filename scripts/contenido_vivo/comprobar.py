# Comprobador de contenido vivo (CVV1028 · tarea L). Solo biblioteca estándar.
# Contrato: architecture/contenido-vivo.md §5 · uso:
#   python3 scripts/contenido_vivo/comprobar.py <index.html> · sale 1 si algo FALLA.
import os
import re
import sys

COMENTARIO_RE = re.compile(r"<!--.*?-->", re.S)
SCRIPT_RE = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)
STYLE_RE = re.compile(r"<style\b[^>]*>.*?</style>", re.S | re.I)
ETIQUETA_RE = re.compile(r"""<(/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>""")
VACIAS = {"iframe", "img", "br", "hr", "meta", "link", "input", "source", "embed"}
FRASES_PROHIBIDAS = ("haz clic para jugar", "mueve el cursor", "click to play", "move your cursor")
RELLENO = ("lorem ipsum", "dolor sit amet", "caja de relleno", "contenido de ejemplo")
SCROLL_RE = re.compile(r"""addEventListener\(\s*['"]scroll['"]""")
RAYA_RE = re.compile(r"—|──|━{2,}|-{3,}")
EXTERNO = ("http://", "https://", "//", "data:", "javascript:", "mailto:", "#")


def texto_visible(html):
    """Quita comentarios, guiones, estilos y etiquetas: queda el texto que ve la gente."""
    limpio = COMENTARIO_RE.sub(" ", html)
    limpio = SCRIPT_RE.sub(" ", limpio)
    limpio = STYLE_RE.sub(" ", limpio)
    return re.sub(r"<[^>]+>", " ", limpio)


def escenas_con_escudo(html):
    """Para cada iframe 3D dice si tiene escudo: data-vivo-escudo encima o en el propio iframe."""
    lista, pila = [], []
    for cierre, nombre, aro in ETIQUETA_RE.findall(html):
        n = nombre.lower()
        aro = aro.lower()
        if cierre:
            for i in range(len(pila) - 1, -1, -1):
                if pila[i][0] == n:
                    del pila[i:]
                    break
        elif n == "iframe":
            lista.append("data-vivo-escudo" in aro or any("data-vivo-escudo" in b for _, b in pila))
        elif n not in VACIAS:
            pila.append((n, aro))
    return lista


def guiones(html):
    return [m.group(1) for m in SCRIPT_RE.finditer(html)]


def recursos_locales(html):
    """Rutas de src y href locales (sin http, data:, #...), listas para comprobar en disco."""
    salidas = []
    for m in re.finditer(r"""\b(?:src|href)\s*=\s*["']([^"']+)["']""", html):
        ruta = m.group(1).split("?")[0].split("#")[0].strip()
        if ruta and not ruta.lower().startswith(EXTERNO):
            salidas.append(ruta)
    return salidas


def comprobar(ruta):
    """Devuelve la lista de pruebas (nombre, pasa, causa) de una página viva."""
    with open(ruta, encoding="utf-8") as f:
        html = f.read()
    base = os.path.dirname(os.path.abspath(ruta))
    lista_de_guiones = guiones(html)
    texto = texto_visible(html)
    cuerpo = texto.lower()
    escenas = escenas_con_escudo(html)
    lista_de_guiones = guiones(html)
    pruebas = []

    def prueba(nombre, ok, causa=""):
        pruebas.append((nombre, bool(ok), "" if ok else causa))

    prueba("Niveles presentes (iframe 3D o data-vivo-herramienta)", escenas or
           "data-vivo-herramienta" in html, "ni un iframe 3D ni data-vivo-herramienta")
    prueba("Como mucho dos escenas 3D", len(escenas) <= 2, f"hay {len(escenas)} iframes")
    sin_escudo = [str(i) for i, e in enumerate(escenas, 1) if not e]
    prueba("Escudo sobre cada iframe 3D", not sin_escudo, "iframe sin escudo: " + ", ".join(sin_escudo))
    prueba("Movimiento reducido o interruptor", "prefers-reduced-motion" in html or
           "data-vivo-interruptor" in html, "ni prefers-reduced-motion ni data-vivo-interruptor")
    malas = [f for f in FRASES_PROHIBIDAS if f in cuerpo]
    prueba("Sin frases de clic y cursor obligado", not malas, "aparece: " + ", ".join(malas))
    malos = [str(i) for i, g in enumerate(lista_de_guiones, 1)
             if SCROLL_RE.search(g) and "requestAnimationFrame" not in g and "passive" not in g]
    prueba("Oyentes de scroll con rAF o passive", not malos, "guion sin rAF ni passive: " + ", ".join(malos))
    faltan = [r for r in recursos_locales(html) if not os.path.exists(os.path.join(base, r.lstrip("/")))]
    prueba("Recursos locales existentes", not faltan, "faltan: " + ", ".join(faltan))
    relleno = [c for c in RELLENO if c in html.lower()]
    prueba("Sin cajas de relleno ni lorem ipsum", not relleno, "aparece: " + ", ".join(relleno))
    raya = RAYA_RE.search(texto)
    prueba("Sin rayas largas en el texto visible", not raya,
           f"raya larga: «{raya.group(0)}»" if raya else "")
    prueba("window.__ready", "window.__ready" in " ".join(lista_de_guiones),
           "ningún guion declara window.__ready")
    return pruebas


def main(argv):
    if len(argv) != 2:
        print("uso: python3 scripts/contenido_vivo/comprobar.py <index.html>")
        return 2
    try:
        pruebas = comprobar(argv[1])
    except OSError as e:
        print(f"Error al leer {argv[1]}: {e}")
        return 2
    fallas = 0
    for nombre, ok, causa in pruebas:
        linea = f"{'PASA' if ok else 'FALLA'} · {nombre}"
        if causa:
            linea += f" · {causa}"
        print(linea)
        fallas += not ok
    print(f"Resumen: {len(pruebas) - fallas} PASA, {fallas} FALLA de {len(pruebas)} pruebas")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
