# -*- coding: utf-8 -*-
"""Pruebas de la infraestructura de la puerta 4 del director de producción:

- `.github/workflows/ci.yml` dispara en push a `main` y a `produccion/**`
  (lectura de texto del YAML, sin dependencias de parseo).
- `vercel.json` (JSON puro) mantiene `nube/**`, `colas/**` y `ola/**` sin
  despliegue y deja `produccion/**` CON vista previa activada.

Sin red ni archivos temporales: se leen los dos archivos reales del repo.
"""

import json
import os
import re
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CI_YML = os.path.join(RAIZ, ".github", "workflows", "ci.yml")
VERCEL_JSON = os.path.join(RAIZ, "vercel.json")


def _leer(ruta: str) -> str:
    with open(ruta, "r", encoding="utf-8") as f:
        return f.read()


class PruebaCiYml(unittest.TestCase):
    def setUp(self) -> None:
        self.texto = _leer(CI_YML)

    def test_el_archivo_existe_y_no_esta_vacio(self):
        self.assertGreater(len(self.texto), 100)

    def test_push_acepta_main(self):
        self.assertRegex(_bloque_push(self.texto), r"main")

    def test_push_acepta_ramas_produccion(self):
        self.assertRegex(_bloque_push(self.texto), r"produccion/\*\*")

    def test_los_jobs_siguen_intactos(self):
        # La puerta 4 no recorta el CI: verify y tauri-check siguen definidos.
        self.assertIn("verify:", self.texto)
        self.assertIn("tauri-check:", self.texto)
        self.assertIn("npx tsc --noEmit", self.texto)
        self.assertIn("npm run build", self.texto)

    def test_tauri_check_tiene_tope_y_apt_con_reintentos(self):
        # (SUP1111A) tauri-check es informativo (continue-on-error), pero sin tope un apt colgado en un espejo lo
        # dejaba 46-55 min en «Dependencias de sistema de Tauri v2» (runs 43046445511 y 43055580534, 11-11): el run
        # no terminaba y la autopublicación vetaba el candidato con «CI sin terminar en 50 min» aunque `verify`
        # ya tuviera veredicto. El job y el paso de apt llevan tope, y apt reintenta con su propio plazo.
        bloque = _bloque_job(self.texto, "tauri-check")
        tope = re.search(r"(?m)^    timeout-minutes: (\d+)\s*$", bloque)
        self.assertIsNotNone(tope, "tauri-check necesita timeout-minutes a nivel de job")
        self.assertLess(int(tope.group(1)), 50, "el tope debe quedar por debajo de los 50 min de la autopublicación")
        paso = _bloque_paso(bloque, "Dependencias de sistema de Tauri v2")
        tope_paso = re.search(r"(?m)^        timeout-minutes: (\d+)\s*$", paso)
        self.assertIsNotNone(tope_paso, "el paso de apt necesita timeout-minutes")
        self.assertLess(int(tope_paso.group(1)), int(tope.group(1)))
        self.assertIn("Acquire::Retries", paso)
        self.assertRegex(paso, r"timeout \d+ apt-get \$APT update")
        self.assertRegex(paso, r"timeout \d+ apt-get \$APT install -y")
        # Los paquetes no cambian: siguen los que necesita `cargo check` (tray-icon, PipeWire…).
        for paquete in ("libwebkit2gtk-4.1-dev", "libayatana-appindicator3-dev", "libpipewire-0.3-dev", "libxdo-dev"):
            self.assertIn(paquete, paso)


def _bloque_job(texto: str, nombre: str) -> str:
    """El bloque de un job de `jobs:` (dos espacios de sangría) hasta el siguiente job o el final."""
    m = re.search(r"(?ms)^  %s:\n(?P<cuerpo>.*?)(?=^  \S|\Z)" % re.escape(nombre), texto)
    if not m:
        raise AssertionError("ci.yml no tiene el job `%s`" % nombre)
    return m.group("cuerpo")


def _bloque_paso(bloque: str, nombre: str) -> str:
    """Un paso (`      - name: …`) del job hasta el siguiente paso o el final del job."""
    m = re.search(r"(?ms)^      - name: %s\n(?P<cuerpo>.*?)(?=^      - |\Z)" % re.escape(nombre), bloque)
    if not m:
        raise AssertionError("tauri-check no tiene el paso «%s»" % nombre)
    return m.group("cuerpo")


def _bloque_push(texto: str) -> str:
    """Extrae el bloque `push:` del gatillo `on:` para no confundirlo con pull_request."""
    m = re.search(r"(?ms)^  push:\n(?P<cuerpo>(?:^    .+\n|^ *#.*\n|^ *\n)+)", texto)
    if not m:
        raise AssertionError("ci.yml no tiene bloque `push:` en el gatillo")
    return m.group("cuerpo")


class PruebaVercelJson(unittest.TestCase):
    def setUp(self) -> None:
        with open(VERCEL_JSON, "r", encoding="utf-8") as f:
            self.datos = json.load(f)
        self.ramas = self.datos["git"]["deploymentEnabled"]

    def test_el_json_parsea(self):
        self.assertIsInstance(self.datos, dict)

    def test_ramas_de_trabajo_sin_despliegue(self):
        for patron in ("nube/**", "colas/**", "ola/**"):
            self.assertIs(
                self.ramas.get(patron),
                False,
                f"{patron} debe seguir sin despliegue automático",
            )

    def test_produccion_despliega_vista_previa(self):
        self.assertIs(
            self.ramas.get("produccion/**"),
            True,
            "produccion/** debe desplegar vista previa (deploymentEnabled=true)",
        )


if __name__ == "__main__":
    unittest.main()
