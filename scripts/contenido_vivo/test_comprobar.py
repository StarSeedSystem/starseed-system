"""Pruebas del comprobador de páginas vivas (CVV1028, tarea L).

Solo biblioteca estándar: unittest y páginas de ejemplo en un directorio temporal.
Cada regla del comprobador tiene una página que pasa y una que falla.
Ejecutar: python3 scripts/contenido_vivo/test_comprobar.py
"""
import os
import subprocess
import sys
import tempfile
import unittest

_Aqui = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _Aqui)
from comprobar import comprobar  # noqa: E402

_TMP = tempfile.mkdtemp()
_BASE = """<html><head><title>Gamario</title>
<style>@media (prefers-reduced-motion: reduce) { .vivo { display: none; } }</style>
</head><body><h1>Gamario</h1><p>Un universo peque\u00f1o en tu navegador.</p>{cuerpo}</body></html>"""
_SIN_MOVIMIENTO = "<html><head><title>Gamario</title></head><body>{cuerpo}</body></html>"
_IFRAME = '<iframe src="escena.html" data-vivo-escudo></iframe>'
_LISTO = "<script>window.__ready = true;</script>"


def _escribir(nombre, cuerpo, recursos=("escena.html",), base=_BASE):
    ruta = os.path.join(_TMP, nombre)
    with open(ruta, "w", encoding="utf-8") as flujo:
        flujo.write(base.replace("{cuerpo}", cuerpo))
    for recurso in recursos:
        with open(os.path.join(_TMP, recurso), "a", encoding="utf-8") as flujo:
            flujo.write("")
    return ruta


def _verde(ruta, nombre):
    """Veredicto de una prueba puntual por nombre, o None si no existe."""
    return dict((n, ok) for n, ok, _d in comprobar(ruta)).get(nombre)


class PruebaComprobador(unittest.TestCase):
    def _afirmar(self, prueba, esperado, cuerpo=_IFRAME + _LISTO, recursos=("escena.html",), base=_BASE):
        ruta = _escribir(prueba.replace(" ", "-") + ".html", cuerpo, recursos, base)
        veredictos = {n: ok for n, ok, _d in comprobar(ruta)}
        self.assertEqual(veredictos.get(prueba), esperado, msg=veredictos)

    def test_pagina_que_pasa(self):
        ruta = _escribir("viva.html", _IFRAME + _LISTO)
        for nombre, ok, _detalle in comprobar(ruta):
            self.assertTrue(ok, msg=nombre)

    def test_sin_niveles(self):
        self._afirmar("Niveles presentes", False, cuerpo="<p>Solo texto plano</p>")

    def test_iframe_sin_escudo(self):
        self._afirmar("Escudo sobre cada escena 3D", False, cuerpo='<iframe src="escena.html"></iframe>' + _LISTO)

    def test_tres_escenas(self):
        self._afirmar("Como mucho dos escenas 3D", False, cuerpo=_IFRAME * 3 + _LISTO)

    def test_frase_prohibida(self):
        self._afirmar("Sin llamadas a jugar", False, cuerpo=_IFRAME + _LISTO + "<p>Mueve el cursor para explorar</p>")

    def test_scroll_bruto(self):
        cuerpo = _IFRAME + _LISTO + "<script>addEventListener('scroll', pintarPagina);</script>"
        self._afirmar("Scroll con rAF o passive", False, cuerpo=cuerpo)

    def test_scroll_con_pasivo(self):
        cuerpo = _IFRAME + _LISTO + "<script>addEventListener('scroll', pintarPagina, {passive: true});</script>"
        self._afirmar("Scroll con rAF o passive", True, cuerpo=cuerpo)

    def test_recurso_ausente(self):
        cuerpo = '<iframe src="fantasma.html" data-vivo-escudo></iframe>' + _LISTO
        self._afirmar("Recursos locales existen", False, cuerpo=cuerpo, recursos=())

    def test_caja_de_relleno(self):
        self._afirmar("Sin cajas de relleno", False, cuerpo=_IFRAME + _LISTO + "<p>Lorem ipsum dolor sit</p>")

    def test_rayas_largas(self):
        self._afirmar("Sin rayas largas", False, cuerpo=_IFRAME + _LISTO + "<p>Secci\u00f3n uno \u2014 dos</p>")

    def test_movimiento_sin_control(self):
        cuerpo = _IFRAME + _LISTO
        self._afirmar("Movimiento contenido", False, cuerpo=cuerpo, base=_SIN_MOVIMIENTO)

    def test_interruptor_de_movimiento(self):
        cuerpo = _IFRAME + _LISTO + '<button data-vivo-interruptor-movimiento>Movimiento</button>'
        self._afirmar("Movimiento contenido", True, cuerpo=cuerpo, base=_SIN_MOVIMIENTO)

    def test_sin_ready(self):
        self._afirmar("Listo para medir", False, cuerpo=_IFRAME)

    def test_codigo_de_salida(self):
        guion = os.path.join(_Aqui, "comprobar.py")
        viva = _escribir("cli-viva.html", _IFRAME + _LISTO)
        rota = _escribir("cli-rota.html", "<p>nada vivo todavia</p>")
        orden_viva = subprocess.run([sys.executable, guion, viva], capture_output=True, text=True)
        orden_rota = subprocess.run([sys.executable, guion, rota], capture_output=True, text=True)
        self.assertEqual((orden_viva.returncode, orden_rota.returncode), (0, 1))
        self.assertIn("PASA Niveles presentes", orden_viva.stdout)
        self.assertIn("FALLA Niveles presentes", orden_rota.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
