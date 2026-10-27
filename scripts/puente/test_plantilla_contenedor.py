#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red de la plantilla de contenedor de GitHub Actions (GCA1019O).

Valida el YAML que una persona copia a SU repositorio: disparadores, permisos
mínimos, variables, telemetría apagada y que no haya secretos en claro.
"""
import re
import unittest
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parents[2]
YAML = RAIZ / "deploy" / "genesis-contenedor" / "github-actions.yml"
README = RAIZ / "deploy" / "genesis-contenedor" / "README.md"

PATRONES_SECRETO = (
    re.compile(r"sk-[A-Za-z0-9_-]{15,}"),
    re.compile(r"ghp_[A-Za-z0-9_-]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_-]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"xox[abp]-[A-Za-z0-9_-]{10,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    re.compile(r"-----BEGIN .*?PRIVATE KEY-----"),
    re.compile(r"ssm_[A-Za-z0-9_-]{20,}"),
)


def cargar():
    return yaml.safe_load(YAML.read_text(encoding="utf-8"))


def disparadores(datos):
    # PyYAML lee la clave `on` como el booleano True (YAML 1.1).
    valor = datos.get("on", datos.get(True))
    return valor if isinstance(valor, dict) else {}


def pasos(datos):
    return [paso for trabajo in (datos.get("jobs") or {}).values()
            for paso in (trabajo.get("steps") or [])]


def entornos(datos):
    salida = [datos.get("env") or {}]
    for trabajo in (datos.get("jobs") or {}).values():
        salida.append(trabajo.get("env") or {})
        salida.extend((paso.get("env") or {}) for paso in (trabajo.get("steps") or []))
    return salida


class TestPlantillaContenedor(unittest.TestCase):
    def setUp(self):
        self.texto = YAML.read_text(encoding="utf-8")
        self.datos = cargar()

    def test_disparadores(self):
        d = disparadores(self.datos)
        self.assertIn("workflow_dispatch", d)
        self.assertIn("schedule", d)
        self.assertEqual(len(d["schedule"]), 1)
        self.assertEqual(len(d["schedule"][0]["cron"].split()), 5)

    def test_permisos_minimos(self):
        self.assertEqual(self.datos.get("permissions"), {"contents": "read"})
        for trabajo in (self.datos.get("jobs") or {}).values():
            permisos = trabajo.get("permissions")
            if permisos is not None:
                self.assertEqual(permisos, {"contents": "read"})
                self.assertNotIn("write", permisos.values())

    def test_token_solo_desde_el_secreto(self):
        self.assertIn("secrets.STARSEED_MOTOR_TOKEN", self.texto)
        nombres = set(re.findall(r"secrets\.([A-Za-z0-9_]+)", self.texto))
        self.assertEqual(nombres, {"STARSEED_MOTOR_TOKEN"})
        asignaciones = re.findall(r"(?m)^\s*STARSEED_MOTOR_TOKEN:\s*(.+)$", self.texto)
        self.assertEqual([valor.strip() for valor in asignaciones], ["${{ secrets.STARSEED_MOTOR_TOKEN }}"])

    def test_sin_secretos_en_claro(self):
        for documento in (self.texto, README.read_text(encoding="utf-8")):
            for patron in PATRONES_SECRETO:
                self.assertIsNone(patron.search(documento), patron.pattern)

    def test_telemetria_apagada(self):
        valores = {clave: valor for entorno in entornos(self.datos) for clave, valor in entorno.items()}
        self.assertEqual(str(valores.get("NEEDLE_TELEMETRY")), "0")
        self.assertEqual(str(valores.get("NEXT_TELEMETRY_DISABLED")), "1")
        self.assertEqual(str(valores.get("DO_NOT_TRACK")), "1")

    def test_pide_trabajo_y_devuelve_resultado(self):
        for pieza in ("motor_ambito", "recoger_tareas", "tal_vez_enviar"):
            self.assertIn(pieza, self.texto)
        self.assertIn("os/scripts/enjambre/instalar.sh", self.texto)
        self.assertIn("starseed-enjambre.py", self.texto)

    def test_estructura(self):
        self.assertIn("tarea", self.datos.get("jobs") or {})
        self.assertEqual(self.datos["jobs"]["tarea"]["runs-on"], "ubuntu-latest")
        self.assertGreaterEqual(self.datos["jobs"]["tarea"].get("timeout-minutes", 0), 1)

    def test_checkout_sin_credenciales(self):
        checkouts = [p for p in pasos(self.datos) if str(p.get("uses", "")).startswith("actions/checkout@")]
        self.assertGreaterEqual(len(checkouts), 1)
        for paso in checkouts:
            self.assertIs((paso.get("with") or {}).get("persist-credentials"), False)
        self.assertIn('git clone --depth 1 "https://github.com/', self.texto)
        self.assertIn('"$RUNNER_TEMP/os"', self.texto)

    def test_readme(self):
        texto = README.read_text(encoding="utf-8")
        for pieza in ("STARSEED_MOTOR_TOKEN", "workflow_dispatch", "schedule", "docs.github.com", "no inventa cifras"):
            self.assertIn(pieza, texto)
        self.assertIn("mando_motor_pendiente", texto)
        self.assertIn("mando_motor_reportar", texto)


if __name__ == "__main__":
    unittest.main()
