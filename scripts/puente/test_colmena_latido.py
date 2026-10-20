# -*- coding: utf-8 -*-
"""Pruebas del latido del nodo de MetaGenesis (COL1012C): lo que publica de verdad sobre su trabajo y su capacidad.

Antes estas pruebas afirmaban `en_curso == []` «porque estamos usando TODOs» y escondían que el latido real
publicaba SIEMPRE lo mismo (un `M.` sin definir que tragaba un `except`). Ahora se prueba con una raíz de
verdad en una carpeta temporal: la cola viva, sus `latidos-*.json`, los puntos de control y el contenedor.
"""
import contextlib
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as NM
import nodo_metagenesis_medio as M
import nodo_metagenesis_logica as L
import colmena_logica as C

COLA = "cola-1012C.json"


def escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)


@contextlib.contextmanager
def medio_falso(raiz, carpeta, cola=COLA, ram_mb=8192, nucleos=8, disco=100.0, herramientas=True, medio="mac", colas=None):
    """Todo lo que `medir` toca del sistema, falso; lo que se quiere probar (leer latidos, puntos, contenedor), real.
    `colas` son las colas de los orquestadores vivos (por defecto la única `cola`; [] = ninguno vivo)."""
    vivas = list(colas) if colas is not None else ([cola] if cola else [])
    with patch.object(M, "raiz_repo", return_value=raiz), \
         patch.object(M, "CARPETA", carpeta), \
         patch.object(M, "colas_vivas", return_value=vivas), \
         patch.object(M, "detectar_medio", return_value=medio), \
         patch.object(M, "lineas_ps", return_value=[]), \
         patch.object(M, "orquestadores", return_value=[]), \
         patch.object(M, "sabe_orquestar", return_value=False), \
         patch.object(M, "ram_libre_mb", return_value=4000), \
         patch.object(M, "ram_total_mb", return_value=ram_mb), \
         patch.object(M, "disco_libre_gb", return_value=disco), \
         patch.object(M, "tiene_herramienta", return_value=herramientas), \
         patch.object(M, "bateria", return_value={}), \
         patch.object(M.os, "cpu_count", return_value=nucleos), \
         patch.object(M.os, "getloadavg", return_value=(1.0, 0.5, 0.2)), \
         patch.object(M, "servicios_mac", return_value=([], [])), \
         patch.object(M, "servicios_linux", return_value=[]), \
         patch.object(M, "medidores_mac", return_value=({}, None)), \
         patch.object(M, "resultados_mac", return_value={}), \
         patch.object(M, "nube_pausada", return_value=False), \
         patch.object(M, "estado_a1", return_value={}):
        yield


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="latido-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.raiz = os.path.join(self.tmp, "repo")
        self.carpeta = os.path.join(self.tmp, "nodo")
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        os.makedirs(self.carpeta)
        env = patch.dict(os.environ, {"STARSEED_NODO_AUTORITATIVO": "0"})
        env.start()
        self.addCleanup(env.stop)

    def latidos(self, tareas, cola=COLA):
        escribir(os.path.join(self.olas, "latidos-" + cola), {"t": time.time(), "cola": cola, "medio": "mac", "tareas": tareas})

    def medir(self, **kw):
        with medio_falso(self.raiz, self.carpeta, **kw):
            return M.medir("real")["salud"]


class TestColmenaLatido(Base):
    def test_latido_tiene_campos_nuevos(self):
        """El latido incluye periodo_s, en_curso, contenedor, ram_total_mb, desconectando y relevo en la salud."""
        salud = self.medir()
        for campo in ("periodo_s", "en_curso", "contenedor", "ram_total_mb", "desconectando", "relevo", "nucleos", "carga"):
            self.assertIn(campo, salud)
        self.assertIsInstance(salud["periodo_s"], float)
        self.assertEqual(salud["periodo_s"], float(L.LATIDO_S))
        self.assertEqual(salud["en_curso"], [])  # no hay latidos- de la cola: nadie escribe
        self.assertEqual(sorted(salud["contenedor"]), ["activo", "agentes", "apto", "motivo"])
        self.assertIs(salud["desconectando"], False)
        self.assertIs(salud["relevo"], False)  # honesto: nadie sigue aún las tareas de otro (COL1012E/G/H)

    def test_latido_periodo_s_desde_variable_de_entorno(self):
        """El periodo_s puede ser sobrescrito por la variable de entorno STARSEED_NODO_LATIDO_S."""
        with patch.dict(os.environ, {"STARSEED_NODO_LATIDO_S": "123.45"}):
            self.assertEqual(self.medir()["periodo_s"], 123.45)

    # ── en_curso: de la fase REAL que escribe el orquestador ─────────────────────────────────
    def test_en_curso_sale_de_los_latidos_de_la_cola_viva_con_sus_puntos(self):
        """Fases REALES del orquestador: escribiendo y completando (escritura) y también tsc, tests, revision,
        integrando y las esperas. Solo «hecho» (el `finally` de cada tarea) deja de contar."""
        self.latidos({
            "T1": {"fase": "escribiendo", "t": 1},
            "T2": {"fase": "completando", "t": 1},
            "T3": {"fase": "tsc", "t": 1},
            "T4": {"fase": "hecho", "t": 1},
        })
        escribir(os.path.join(self.olas, "puntos-control.json"), {
            "T1": {"rama": "ola/T1", "sha": "abc123", "t": 1_800_000_000.5},
            "T2": {"rama": "ola/T2", "sha": None, "t": 1_800_000_100.0},   # anotado sin commit: no es punto
        })
        en_curso = self.medir()["en_curso"]
        self.assertEqual([e["id"] for e in en_curso], ["T1", "T2", "T3"])
        self.assertEqual(en_curso[0], {"id": "T1", "fase": "escribiendo", "punto": {"rama": "ola/T1", "sha": "abc123", "t": 1_800_000_000.5}})
        self.assertEqual(en_curso[1]["fase"], "completando")
        self.assertIsNone(en_curso[1]["punto"])
        self.assertEqual(en_curso[2], {"id": "T3", "fase": "tsc", "punto": None})

    def test_una_tarea_pasando_una_puerta_o_esperando_sigue_siendo_trabajo_del_aparato(self):
        """Regresión: una Mac con tareas en tsc, revision, integrando o 40 min «esperando proveedor» publicaba
        `en_curso: []` y la tarjeta decía «puedes apagarlo sin más» en mitad de una integración."""
        fases = ["tsc", "tests", "revision", "integrando", "esperando proveedor", "esperando cupo",
                 "esperando-memoria", "esperando aprobación"]
        self.latidos({"T%d" % i: {"fase": f} for i, f in enumerate(fases)})
        en_curso = self.medir()["en_curso"]
        self.assertEqual(sorted(e["fase"] for e in en_curso), sorted(fases))
        self.latidos({"T1": {"fase": "hecho"}, "T2": {"fase": None}, "T3": {}, "T4": {"fase": ""}})
        self.assertEqual(self.medir()["en_curso"], [])  # lo cerrado o sin fase no es trabajo

    def test_dos_orquestadores_vivos_juntan_sus_tareas_sin_repetir(self):
        self.latidos({"A1": {"fase": "escribiendo"}, "A2": {"fase": "tsc"}, "REP": {"fase": "tests"}}, cola="cola-a.json")
        self.latidos({"B1": {"fase": "integrando"}, "REP": {"fase": "escribiendo"}}, cola="cola-b.json")
        en_curso = self.medir(colas=["cola-a.json", "cola-b.json"])["en_curso"]
        self.assertEqual([e["id"] for e in en_curso], ["A1", "A2", "B1", "REP"])
        self.assertEqual(next(e["fase"] for e in en_curso if e["id"] == "REP"), "tests")  # la primera cola manda
        # Con una sola cola viva, las tareas de la otra (de un orquestador caído) no cuentan.
        self.assertEqual([e["id"] for e in self.medir(colas=["cola-b.json"])["en_curso"]], ["B1", "REP"])

    def test_una_cola_viva_sin_latidos_aun_no_impide_leer_las_otras(self):
        self.latidos({"B1": {"fase": "tsc"}}, cola="cola-b.json")
        en_curso = self.medir(colas=["cola-sin-latidos.json", "cola-b.json"])["en_curso"]
        self.assertEqual([e["id"] for e in en_curso], ["B1"])

    def test_si_un_latidos_de_los_vivos_esta_roto_no_se_afirma_nada(self):
        self.latidos({"B1": {"fase": "tsc"}}, cola="cola-b.json")
        with open(os.path.join(self.olas, "latidos-cola-a.json"), "w") as f:
            f.write("{no es json")
        self.assertIsNone(self.medir(colas=["cola-a.json", "cola-b.json"])["en_curso"])

    def test_el_estado_de_progreso_no_cuenta_como_trabajo(self):
        """progreso.json guarda commit/integrada/fallida…, nunca la fase de escritura: no es la fuente."""
        escribir(os.path.join(self.olas, "progreso.json"), {"T1": {"estado": "escribiendo"}})
        escribir(os.path.join(self.olas, COLA), [{"id": "T1"}])
        self.assertEqual(self.medir()["en_curso"], [])

    def test_sin_orquestador_vivo_un_latidos_viejo_no_es_trabajo(self):
        self.latidos({"T1": {"fase": "escribiendo"}})
        self.assertEqual(self.medir(cola=None)["en_curso"], [])
        self.assertEqual(self.medir(colas=[])["en_curso"], [])

    def test_en_curso_no_pasa_de_8_y_no_publica_nada_privado(self):
        self.latidos({"T%02d" % i: {"fase": "escribiendo", "modelo": "x/y", "worktree": "/Users/alex/secreto"} for i in range(12)})
        en_curso = self.medir()["en_curso"]
        self.assertEqual(len(en_curso), 8)
        self.assertEqual([e["id"] for e in en_curso], ["T%02d" % i for i in range(8)])
        self.assertNotIn("/Users", json.dumps(en_curso))
        self.assertNotIn("modelo", json.dumps(en_curso))

    def test_latidos_roto_no_afirma_nada(self):
        with open(os.path.join(self.olas, "latidos-" + COLA), "w") as f:
            f.write("{no es json")
        self.assertIsNone(self.medir()["en_curso"])

    def test_si_medir_falla_se_publica_none_y_no_un_valor_por_defecto(self):
        with patch.object(M, "en_curso_de", side_effect=RuntimeError("boom")):
            self.assertIsNone(self.medir()["en_curso"])
        salud = self.medir(ram_mb=None)
        self.assertIsNone(salud["ram_total_mb"])
        self.assertIsNone(salud["contenedor"])  # sin RAM no se sabe si es apto: no se dice «no apto»
        self.assertIsNone(self.medir(disco=None)["contenedor"])

    # ── contenedor: con la RAM y los núcleos REALES ───────────────────────────────────────────
    def test_mac_de_8gb_y_8_nucleos_ofrece_3_agentes(self):
        salud = self.medir()
        self.assertEqual(salud["ram_total_mb"], 8192)
        self.assertEqual(salud["nucleos"], 8)
        self.assertEqual(salud["contenedor"], {"activo": False, "agentes": 3, "apto": True, "motivo": "3 agente(s) por la memoria y los núcleos."})

    def test_menos_de_6gb_no_es_apto_y_dice_por_que(self):
        c = self.medir(ram_mb=4096)["contenedor"]
        self.assertFalse(c["apto"])
        self.assertEqual(c["agentes"], 0)
        self.assertIn("6 GB", c["motivo"])

    def test_faltan_herramientas_no_es_apto(self):
        c = self.medir(herramientas=False)["contenedor"]
        self.assertFalse(c["apto"])
        self.assertIn("Faltan herramientas", c["motivo"])

    def test_contenedor_activo_publica_el_minimo_entre_capacidad_y_lo_elegido(self):
        escribir(os.path.join(self.carpeta, "contenedor.json"), {"activo": True, "trabajadores": 2, "t": 1})
        c = self.medir()["contenedor"]
        self.assertTrue(c["activo"])
        self.assertEqual(c["agentes"], 2)
        escribir(os.path.join(self.carpeta, "contenedor.json"), {"activo": True, "trabajadores": 4, "t": 1})
        self.assertEqual(self.medir()["contenedor"]["agentes"], 3)  # la Mac de 8 GB no da más de 3

    def test_contenedor_apagado_aunque_quede_un_numero_de_antes(self):
        escribir(os.path.join(self.carpeta, "contenedor.json"), {"activo": False, "trabajadores": 2, "t": 1})
        c = self.medir()["contenedor"]
        self.assertFalse(c["activo"])
        self.assertEqual(c["agentes"], 3)  # lo que PODRÍA aportar, que es lo que enseña el botón

    # ── desconectando: una marca con plazo, no un estado eterno ───────────────────────────────
    def test_desconectando_dura_la_gracia_y_se_apaga(self):
        escribir(os.path.join(self.carpeta, "desconectando.json"), {"desconectando": True, "t": time.time() - 30})
        self.assertIs(self.medir()["desconectando"], True)
        escribir(os.path.join(self.carpeta, "desconectando.json"), {"desconectando": True, "t": time.time() - C.GRACIA_DESCONECTAR_S - 5})
        self.assertIs(self.medir()["desconectando"], False)

    # ── lo que viaja ──────────────────────────────────────────────────────────────────────────
    def test_el_latido_publico_conserva_los_campos_de_la_colmena(self):
        self.latidos({"T1": {"fase": "escribiendo"}})
        pub = NM.Nodo._salud_publica(self.medir())
        self.assertEqual([e["id"] for e in pub["en_curso"]], ["T1"])
        self.assertTrue(pub["contenedor"]["apto"])
        self.assertEqual(pub["ram_total_mb"], 8192)
        self.assertIs(pub["relevo"], False)


class TestMedidas(unittest.TestCase):
    def test_ram_total_en_mac_sale_de_sysctl(self):
        with patch("builtins.open", side_effect=OSError), patch.object(M.sys, "platform", "darwin"), \
             patch.object(M, "_sh", return_value=(0, "8589934592\n")) as sh:
            self.assertEqual(M.ram_total_mb(), 8192)
        self.assertEqual(sh.call_args[0][0], ["/usr/sbin/sysctl", "-n", "hw.memsize"])  # ruta absoluta: launchd no tiene PATH

    def test_ram_total_desconocida_es_none_no_cero(self):
        with patch("builtins.open", side_effect=OSError), patch.object(M.sys, "platform", "freebsd"):
            self.assertIsNone(M.ram_total_mb())
        with patch("builtins.open", side_effect=OSError), patch.object(M.sys, "platform", "darwin"), \
             patch.object(M, "_sh", return_value=(1, "")):
            self.assertIsNone(M.ram_total_mb())

    def test_bateria_de_pmset(self):
        con_cargador = " Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t87%; charging; 0:40 remaining present: true"
        self.assertEqual(M.bateria_de(con_cargador), {"cargando": True, "nivel": 0.87})
        sin_cargador = " Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t15%; discharging; 1:02 remaining present: true"
        self.assertEqual(M.bateria_de(sin_cargador), {"cargando": False, "nivel": 0.15})
        self.assertEqual(M.bateria_de(" Now drawing from 'AC Power'\n"), {})  # sobremesa: sin batería
        self.assertEqual(M.bateria_de(""), {})

    def test_con_bateria_sin_cargador_la_capacidad_baja(self):
        with patch.object(M, "bateria", return_value={"cargando": False, "nivel": 0.5}), \
             patch.object(M, "tiene_herramienta", return_value=True), patch.object(M.os, "cpu_count", return_value=8), \
             patch.object(M, "leer_json", return_value={}):
            c = M.contenedor_de(100.0, 8192)
        self.assertEqual((c["apto"], c["agentes"]), (True, 1))

    def _node_en_nvm(self, home, version, nombre="herramienta-solo-en-nvm"):
        carpeta = os.path.join(home, ".nvm", "versions", "node", version, "bin")
        os.makedirs(carpeta)
        ruta = os.path.join(carpeta, nombre)
        with open(ruta, "w") as f:
            f.write("#!/bin/sh\n")
        os.chmod(ruta, 0o755)
        return carpeta

    def test_una_herramienta_que_solo_esta_en_nvm_se_encuentra(self):
        """Bajo systemd/launchd nvm no está en el PATH, pero el aparato SÍ tiene Node (y el enjambre lo usa)."""
        with tempfile.TemporaryDirectory(prefix="nvm-test-") as home:
            self.assertFalse(M.tiene_herramienta("herramienta-solo-en-nvm", home=home))
            self._node_en_nvm(home, "v22.3.0")
            self.assertTrue(M.tiene_herramienta("herramienta-solo-en-nvm", home=home))
            self.assertFalse(M.tiene_herramienta("otra-que-no-existe-en-nvm", home=home))

    def test_las_carpetas_de_nvm_van_con_la_version_mas_alta_primero(self):
        with tempfile.TemporaryDirectory(prefix="nvm-test-") as home:
            for v in ("v20.17.0", "v22.3.0", "v22.12.1", "v9.0.0"):
                self._node_en_nvm(home, v)
            carpetas = M.carpetas_nvm(home)
            self.assertEqual([os.path.basename(os.path.dirname(c)) for c in carpetas], ["v22.12.1", "v22.3.0", "v20.17.0", "v9.0.0"])
            self.assertEqual(M.carpetas_nvm(os.path.join(home, "no-existe")), [])  # sin nvm: nada, y no falla

    def test_so_de_este_aparato(self):
        with patch.dict(os.environ, {}, clear=False), patch.object(M.sys, "platform", "darwin"):
            os.environ.pop("TERMUX_VERSION", None)
            self.assertEqual(M.so_de_este_aparato(), "macos")
        with patch.object(M.sys, "platform", "linux"), patch.dict(os.environ, {"TERMUX_VERSION": "0.118"}):
            self.assertEqual(M.so_de_este_aparato(), "android")
        with patch.object(M.sys, "platform", "win32"):
            os.environ.pop("TERMUX_VERSION", None)
            self.assertEqual(M.so_de_este_aparato(), "windows")


if __name__ == '__main__':
    unittest.main()
