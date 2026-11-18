#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del plan y de las órdenes de maggabit_repos (MAG1117).

Herméticas: no tocan /Volumes, la red, ~/.starseed ni el disco real, y ninguna
ejecuta git: solo comparan los comandos que `ordenes` produce.
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import maggabit_repos as M  # noqa: E402

REPOS = [
    {"full_name": "StarSeedSystem/starseed-system", "default_branch": "main"},
    {"full_name": "StarSeedSystem/otro", "default_branch": "master"},
    {"full_name": "alexbordongarrigos/personal", "default_branch": "main"},
    {"full_name": "OtraCuenta/ajena", "default_branch": "main"},
]
ESPEJOS = {"StarSeedSystem/otro": {"huella": "h2"}}
PAQUETES = {"StarSeedSystem/otro": "h2"}
ABIERTOS = {"StarSeedSystem/otro": {"rama": "master", "avanza": True}}


class Plan(unittest.TestCase):
    def test_solo_las_cuentas_del_contrato(self):
        ids = [a["id"] for a in M.plan(REPOS, {}, {}, {})]
        self.assertIn("StarSeedSystem/starseed-system", ids)
        self.assertIn("alexbordongarrigos/personal", ids)
        self.assertNotIn("OtraCuenta/ajena", ids)

    def test_una_accion_por_repo_y_paso_en_orden(self):
        acciones = M.plan(REPOS, {}, {}, {})
        pasos = [a["paso"] for a in acciones]
        esperado = ["clonar", "clonar", "clonar",
                    "abrir", "abrir", "abrir"]
        self.assertEqual(pasos, esperado)
        pares = [(a["id"], a["paso"]) for a in acciones]
        self.assertEqual(len(pares), len(set(pares)))

    def test_sin_espejo_se_clona_y_con_espejo_se_actualiza(self):
        paquetes = {"StarSeedSystem/otro": "h2"}
        acciones = M.plan(REPOS, ESPEJOS, paquetes, {})
        otro = [a for a in acciones if a["id"] == "StarSeedSystem/otro"]
        self.assertEqual([a["paso"] for a in otro],
                         ["actualizar", "abrir"])

    def test_huella_cambiada_se_empaqueta(self):
        espejos = {"StarSeedSystem/otro": {"huella": "h3"}}
        acciones = M.plan(REPOS, espejos, PAQUETES, {})
        pasos = [a["paso"] for a in acciones
                 if a["id"] == "StarSeedSystem/otro"]
        self.assertEqual(pasos, ["actualizar", "empaquetar", "abrir"])

    def test_huella_igual_no_se_empaqueta(self):
        acciones = M.plan(REPOS, ESPEJOS, PAQUETES, ABIERTOS)
        pasos = [a["paso"] for a in acciones
                 if a["id"] == "StarSeedSystem/otro"]
        self.assertEqual(pasos, ["actualizar", "avanzar"])

    def test_sin_referencias_no_se_empaqueta_y_se_anota_vacio(self):
        espejos = {"StarSeedSystem/otro": {"huella": None}}
        acciones = M.plan(REPOS, espejos, PAQUETES, {})
        accion = [a for a in acciones
                  if a["id"] == "StarSeedSystem/otro" and a["paso"] == "empaquetar"]
        self.assertEqual(len(accion), 1)
        self.assertEqual(accion[0]["nota"], "vacío")

    def test_sin_clon_abierto_se_abre_y_con_clon_se_avanza(self):
        acciones = M.plan(REPOS, ESPEJOS, PAQUETES, ABIERTOS)
        pasos = [a["paso"] for a in acciones
                 if a["id"] == "StarSeedSystem/otro"]
        self.assertEqual(pasos, ["actualizar", "avanzar"])
        personal = [a for a in acciones
                    if a["id"] == "alexbordongarrigos/personal"]
        self.assertEqual([a["paso"] for a in personal], ["clonar", "abrir"])

    def test_avance_no_rapido_se_anota_y_no_se_fuerza(self):
        abiertos = {"StarSeedSystem/otro": {"rama": "master", "avanza": False}}
        acciones = M.plan(REPOS, ESPEJOS, PAQUETES, abiertos)
        accion = [a for a in acciones
                  if a["id"] == "StarSeedSystem/otro" and a["paso"] == "avanzar"]
        self.assertEqual(len(accion), 1)
        self.assertEqual(accion[0]["nota"], "NO-AVANZA")

    def test_volumen_sin_respuesta_no_se_cuelga_ni_clona_encima(self):
        espejos = {"StarSeedSystem/otro": {"sin_respuesta": True}}
        acciones = M.plan(REPOS, espejos, PAQUETES, {})
        accion = [a for a in acciones
                  if a["id"] == "StarSeedSystem/otro" and a["paso"] == "actualizar"]
        self.assertEqual(len(accion), 1)
        self.assertEqual(accion[0]["nota"], "sin-respuesta")

    def test_rutas_de_espejo_paquete_y_codigo_abierto(self):
        accion = M.plan(REPOS, {}, {}, {})[0]
        self.assertEqual(accion["espejo"],
                         "TRABAJO/respaldo/repos/StarSeedSystem/starseed-system.git")
        self.assertEqual(accion["paquete"],
                         "RAIZ/MetaGenesis/repos-paquetes/"
                         "StarSeedSystem__starseed-system.bundle")
        self.assertEqual(accion["paquete"], accion["paquete_tmp"][:-4])
        self.assertEqual(accion["destino"],
                         "RAIZ/MetaGenesis/codigo/StarSeedSystem/starseed-system")


class Ordenes(unittest.TestCase):
    def accion(self, full="StarSeedSystem/otro", paso="clonar"):
        cuenta, _, nombre = full.partition("/")
        base = f"TRABAJO/respaldo/repos/{cuenta}/{nombre}.git"
        paquete = f"RAIZ/MetaGenesis/repos-paquetes/{cuenta}__{nombre}.bundle"
        return {"id": full, "paso": paso, "rama": "master",
                "url": f"https://github.com/{full}.git",
                "espejo": base, "paquete": paquete,
                "paquete_tmp": paquete + ".tmp",
                "destino": f"RAIZ/MetaGenesis/codigo/{cuenta}/{nombre}"}

    def test_clonar_es_mirror(self):
        self.assertEqual(
            M.ordenes(self.accion()),
            [["git", "clone", "--mirror",
              "https://github.com/StarSeedSystem/otro.git",
              "TRABAJO/respaldo/repos/StarSeedSystem/otro.git"]])

    def test_la_semilla_se_siembra_con_referencia_y_repack(self):
        orden = M.ordenes(self.accion("StarSeedSystem/starseed-system"))
        self.assertIn("--reference-if-able", orden[0])
        self.assertIn(M.SEMILLA_REFERENCIA, orden[0])
        self.assertIn(["git", "-C", orden[0][-1], "repack", "-a", "-d"], orden[1:])
        self.assertIn(["rm", "-f",
                       "TRABAJO/respaldo/repos/StarSeedSystem/starseed-system.git"
                       "/objects/info/alternates"], orden[1:])

    def test_actualizar_y_empaquetar_con_su_renombre(self):
        accion = self.accion(paso="actualizar")
        self.assertEqual(
            M.ordenes(accion),
            [["git", "-C", accion["espejo"], "remote", "update", "--prune"]])
        accion = self.accion(paso="empaquetar")
        self.assertEqual(
            M.ordenes(accion),
            [["git", "-C", accion["espejo"], "bundle", "create",
              accion["paquete_tmp"], "--all"],
             ["mv", accion["paquete_tmp"], accion["paquete"]]])

    def test_abrir_es_clon_sin_enlaces_duros_y_cambia_el_remote(self):
        accion = self.accion(paso="abrir")
        self.assertEqual(
            M.ordenes(accion),
            [["git", "clone", "--no-hardlinks", accion["espejo"],
              accion["destino"]],
             ["git", "-C", accion["destino"], "remote", "set-url", "origin",
              accion["url"]]])

    def test_avanzar_es_fetch_y_fusion_solo_rapida(self):
        accion = self.accion(paso="avanzar")
        self.assertEqual(
            M.ordenes(accion),
            [["git", "-C", accion["destino"], "fetch", "--prune", "origin"],
             ["git", "-C", accion["destino"], "merge", "--ff-only",
              "origin/master"]])

    def test_las_acciones_anotadas_no_generan_comandos(self):
        for nota in ("vacío", "NO-AVANZA", "sin-respuesta"):
            accion = {"id": "StarSeedSystem/otro", "paso": "avanzar",
                      "url": "u", "espejo": "e", "destino": "d",
                      "rama": "main", "nota": nota}
            self.assertEqual(M.ordenes(accion), [])


if __name__ == "__main__":
    unittest.main()
