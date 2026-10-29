# Pruebas del comprobador de contenido vivo (CVV1028 · tarea L).
# Ejecutar: python3 scripts/contenido_vivo/test_comprobar.py
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comprobar import comprobar

VIVO = """<!doctype html><html><head><link rel="stylesheet" href="vivo.css"></head>
<body>
<div data-vivo-escudo><iframe src="escena.html"></iframe></div>
<button data-vivo-interruptor>Movimiento: Apagado, Encendido</button>
<p>Una pieza viva con su módulo de escena.</p>
<script>
window.addEventListener("scroll", paso, { passive: true });
requestAnimationFrame(paso);
window.__ready = true;
</script>
</body></html>"""

SIN_NIVELES = VIVO.replace('<div data-vivo-escudo><iframe src="escena.html"></iframe></div>', "")
SIN_ESCUDO = VIVO.replace("<div data-vivo-escudo><iframe", "<div><iframe")
TRES_ESCENAS = VIVO.replace(
    "<div data-vivo-escudo>",
    '<div data-vivo-escudo><iframe src="escena.html"></iframe>'
    '<iframe src="escena.html"></iframe>')
FRASE = VIVO.replace("Una pieza viva", "haz clic para jugar")
SIN_MOVIMIENTO = VIVO.replace("<button data-vivo-interruptor>Movimiento: Apagado, Encendido</button>", "")
SCROLL_MALO = VIVO.replace(
    'window.addEventListener("scroll", paso, { passive: true });\nrequestAnimationFrame(paso);',
    'window.addEventListener("scroll", paso);')
FALTANTE = VIVO.replace("vivo.css", "no_existe.css")
CON_RELLENO = VIVO.replace("Una pieza viva con su módulo de escena.", "Lorem ipsum dolor sit amet")
CON_RAYA = VIVO.replace("Una pieza viva", "Una pieza — partida — viva")
SIN_READY = VIVO.replace("window.__ready = true;", "")


class TestComprobar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        (base / "escena.html").write_text("<html></html>", encoding="utf-8")
        (base / "vivo.css").write_text("", encoding="utf-8")
        (base / "vivo.html").write_text(VIVO, encoding="utf-8")

    def escribir(self, texto, nombre="prueba.html"):
        ruta = Path(self.tmp.name) / nombre
        ruta.write_text(texto, encoding="utf-8")
        return str(ruta)

    def veredictos(self, texto):
        return {n: ok for n, ok, _ in comprobar(self.escribir(texto))}

    def test_pagina_sana_pasa_todo(self):
        resultados = comprobar(str(Path(self.tmp.name) / "vivo.html"))
        self.assertTrue(all(ok for _, ok, _ in resultados), resultados)

    def test_sin_niveles_falla(self):
        self.assertFalse(self.veredictos(SIN_NIVELES)[
            "Niveles presentes (iframe 3D o data-vivo-herramienta)"])

    def test_sin_escudo_falla(self):
        self.assertFalse(self.veredictos(SIN_ESCUDO)["Escudo sobre cada iframe 3D"])

    def test_tres_escenas_fallan(self):
        self.assertFalse(self.veredictos(TRES_ESCENAS)["Como mucho dos escenas 3D"])

    def test_frase_prohibida_falla(self):
        self.assertFalse(self.veredictos(FRASE)["Sin frases de clic y cursor obligado"])

    def test_sin_movimiento_falla(self):
        self.assertFalse(self.veredictos(SIN_MOVIMIENTO)["Movimiento reducido o interruptor"])

    def test_scroll_sin_raf_falla(self):
        self.assertFalse(self.veredictos(SCROLL_MALO)["Oyentes de scroll con rAF o passive"])

    def test_recurso_faltante_falla(self):
        self.assertFalse(self.veredictos(FALTANTE)["Recursos locales existentes"])

    def test_relleno_falla(self):
        self.assertFalse(self.veredictos(CON_RELLENO)["Sin cajas de relleno ni lorem ipsum"])

    def test_raya_larga_falla(self):
        self.assertFalse(self.veredictos(CON_RAYA)["Sin rayas largas en el texto visible"])

    def test_sin_window_ready_falla(self):
        self.assertFalse(self.veredictos(SIN_READY)["window.__ready"])


if __name__ == "__main__":
    unittest.main()
