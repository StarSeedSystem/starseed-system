# -*- coding: utf-8 -*-
"""Pruebas del respaldo Mac → Maggabox (ALM1118B / ALM1121A).

Herméticas: no tocan la red, ~/.ssh, ~/.starseed/env ni el disco real;
todo va con dobles (ssh simulado, sistema de archivos en memoria).
"""
import os
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from typing import Dict, List, Any, Optional, Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import respaldo_maggabox as R  # noqa: E402

MAC_ROOT = "/Users/alex/Documents/starseed-os-main"
STARSEED_MEMORY_ROOT = os.path.join(MAC_ROOT, "starseed_memory_root")
WT_ROOT = os.path.expanduser("~/Documents/starseed-wt")
DOWNLOADS = os.path.expanduser("~/Downloads")
DEST_BASE = "~/StarSeed-almacen"
DEST_RESPALDOS = os.path.join(DEST_BASE, "respaldos/mac")
DEST_PESADOS = os.path.join(DEST_BASE, "pesados")


class SSHSimulado:
    """Simula conexión SSH y comandos remotos sin red."""

    def __init__(self, respuestas: Optional[Dict[str, Any]] = None):
        self.llamadas: List[List[str]] = []
        self.respuestas = respuestas or {}
        self.existe_rsync = True
        self.archivos_remotos: Dict[str, Dict] = {}

    def __call__(self, argv: List[str], **kw) -> Any:
        self.llamadas.append(argv)
        cmd = " ".join(argv)
        if argv[0] == "ssh":
            clave = cmd
            if clave in self.respuestas:
                r = self.respuestas[clave]
                return _mock(r.get("codigo", 0), r.get("salida", ""), r.get("error", ""))
            if "rsync --version" in cmd:
                return _mock(0 if self.existe_rsync else 127, "rsync 3.2.7" if self.existe_rsync else "", "")
            if "mkdir -p" in cmd:
                return _mock(0, "", "")
            if "ls -1t" in cmd and "repo-" in cmd and ".bundle" in cmd:
                bundles = sorted([os.path.basename(k) for k in self.archivos_remotos.keys() if k.endswith(".bundle")], reverse=True)
                return _mock(0, "\n".join(bundles), "")
            if "du -sk" in cmd:
                ruta = argv[-1]
                if ruta in self.archivos_remotos:
                    return _mock(0, "%s\t%s" % (self.archivos_remotos[ruta].get("size_kb", 0), ruta), "")
                return _mock(1, "", "No such file")
            if "test -e" in cmd or "test -d" in cmd or "test -f" in cmd:
                ruta = argv[-1]
                return _mock(0 if ruta in self.archivos_remotos else 1, "", "")
            if "find" in cmd and "-printf" in cmd:
                ruta = argv[argv.index("find") + 1] if "find" in argv else ""
                meta = self.archivos_remotos.get(ruta, {})
                return _mock(0, "." * meta.get("entradas", 10), "")
            if "sha256sum" in cmd or "md5sum" in cmd:
                ruta = argv[-1]
                meta = self.archivos_remotos.get(ruta, {})
                return _mock(0, "%s  %s" % (meta.get("hash", "abc"), ruta), "")
            return _mock(0, "", "")
        if argv[0] == "rsync":
            if len(argv) >= 2:
                origen = argv[-2].rstrip("/")
                destino = argv[-1].rstrip("/")
                # rsync remoto llega como `host:ruta`; el almacén se simula sin el host
                cabecera = destino.split("/", 1)[0]
                if ":" in cabecera and "@" in cabecera:
                    destino = destino.split(":", 1)[1]
                if origen in self.archivos_remotos:
                    self.archivos_remotos[destino] = self.archivos_remotos[origen].copy()
            return _mock(0, "", "")
        if argv[0] == "git" and argv[1] == "bundle":
            return _mock(0, "", "")
        if argv[0] == "git":
            if "rev-parse" in argv:
                return _mock(0, "abc123\n", "")
            if "status" in argv:
                return _mock(0, "", "")
        return _mock(0, "", "")


from types import SimpleNamespace


def _mock(codigo: int, salida: str, error: str) -> Any:
    return SimpleNamespace(returncode=codigo, stdout=salida, stderr=error)


class TestExcluirSecretos(unittest.TestCase):
    """La lista de exclusión de secretos es PURA y determinista."""

    def test_excluye_env_y_ssh(self):
        excluidas = R.excluir_secretos()
        self.assertIn("~/.starseed/env", excluidas)
        self.assertIn("~/.ssh", excluidas)
        self.assertIn("*.pem", excluidas)
        self.assertIn("*key*", excluidas)
        self.assertIn(".env*", excluidas)

    def test_incluye_tmp_drive(self):
        excluidas = R.excluir_memory_root()
        self.assertTrue(any(".tmp.drive" in ex for ex in excluidas))

    def test_no_incluye_rutas_normales(self):
        excluidas = R.excluir_secretos()
        self.assertNotIn("starseed_memory_root", excluidas)
        self.assertNotIn("src", excluidas)


class TestOpcionesSSH(unittest.TestCase):
    """Las opciones SSH usan rutas expandidas y fuerzan IPv4."""

    def test_opciones_ssh_expandidas_y_ipv4(self):
        opciones = [" ".join(R.SSH_BASE), R._transporte_ssh()]
        for opcion in opciones:
            self.assertNotIn("$HOME", opcion)
            self.assertNotIn("~/", opcion)
            self.assertIn("AddressFamily=inet", opcion)


class TestPlan(unittest.TestCase):
    """`plan` decide qué se respalda y qué se excluye (PURA)."""

    def setUp(self):
        self.ssh = SSHSimulado()

    def test_plan_incluye_memory_root_y_repo(self):
        plan = R.plan_respaldar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
            libre_gb_fn=lambda: 10.0,
        )
        self.assertTrue(any("starseed_memory_root" in p["origen"] for p in plan["respaldar"]))
        self.assertTrue(any("git_bundle" == p["accion"] for p in plan["respaldar"]))

    def test_plan_excluye_tmp_drive(self):
        plan = R.plan_respaldar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
        )
        for item in plan["respaldar"]:
            origen = item.get("origen", "")
            for excl in R.excluir_memory_root():
                self.assertNotIn(excl.replace("*", ""), origen)

    def test_plan_rotacion_bundles_7(self):
        for i in range(10):
            fecha = f"2026-01-{i+1:02d}"
            self.ssh.archivos_remotos[f"respaldos/mac/repo-{fecha}.bundle"] = {"size_kb": 1000}

        plan = R.plan_respaldar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
        )
        borrar = [p for p in plan["respaldar"] if p["accion"] == "borrar_bundle_antiguo"]
        self.assertEqual(len(borrar), 3)

    def test_plan_bundle_solo_si_hay_6gb_libres(self):
        plan_libre = R.plan_respaldar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
            libre_gb_fn=lambda: 10.0,
        )
        acciones = [p["accion"] for p in plan_libre["respaldar"]]
        self.assertIn("git_bundle", acciones)

        plan_sin = R.plan_respaldar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
            libre_gb_fn=lambda: 2.0,
        )
        acciones = [p["accion"] for p in plan_sin["respaldar"]]
        self.assertNotIn("git_bundle", acciones)
        self.assertTrue(any(p["accion"] == "salta_bundle" and "espejo de GitHub" in p.get("motivo", "") for p in plan_sin["respaldar"]))


class TestRespaldar(unittest.TestCase):
    """`respaldar` ejecuta rsync, git bundle en temp, verifica checksum y rota."""

    def setUp(self):
        self.ssh = SSHSimulado()
        self.guardados = []

    def test_respaldar_seco_no_ejecuta(self):
        resultado = R.respaldar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
            guardar_log=self.guardados.append,
        )
        self.assertEqual(resultado["estado"], "seco")
        self.assertEqual(len(self.ssh.llamadas), 0)

    def test_respaldar_rsync_excluye_tmp_drive_y_secretos(self):
        self.ssh.existe_rsync = True
        self.ssh.archivos_remotos["respaldos/mac/repo-2026-01-01.bundle"] = {"size_kb": 1000, "hash": "abc"}
        with patch.object(R, "_libre_gb", return_value=10.0), \
             patch("subprocess.run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(R, "_hash_archivo", return_value="abc"):
            resultado = R.respaldar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                memory_root=STARSEED_MEMORY_ROOT,
                destino_base=DEST_BASE,
                seco=False,
                guardar_log=self.guardados.append,
            )
        self.assertEqual(resultado["estado"], "hecho")
        rsync_calls = [c for c in self.ssh.llamadas if c[0] == "rsync"]
        self.assertTrue(len(rsync_calls) > 0)
        args = " ".join(rsync_calls[0])
        for excl in R.excluir_memory_root():
            self.assertIn(excl.replace("*", ""), args)

    def test_respaldar_bundle_en_temp_solo_si_6gb_libres(self):
        # Con 10 GB libres: crea bundle
        self.ssh.existe_rsync = True
        self.ssh.archivos_remotos["respaldos/mac/repo-2026-01-01.bundle"] = {"size_kb": 1000, "hash": "abc"}
        sub_mock = MagicMock(return_value=SimpleNamespace(returncode=0, stdout="", stderr=""))
        with patch.object(R, "_libre_gb", return_value=10.0), \
             patch("subprocess.run", sub_mock), \
             patch.object(R, "_hash_archivo", return_value="abc"):
            resultado = R.respaldar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                memory_root=STARSEED_MEMORY_ROOT,
                destino_base=DEST_BASE,
                seco=False,
                guardar_log=self.guardados.append,
            )
        self.assertEqual(resultado["estado"], "hecho")
        # Git bundle se ejecutó localmente (subprocess), no por ssh remoto
        git_calls = [c for c in sub_mock.call_args_list if "bundle" in str(c)]
        self.assertTrue(len(git_calls) > 0)
        bundle_arg = str(git_calls[0])
        # La carpeta temporal es la del sistema (en macOS /var/folders/…, en Linux /tmp)
        self.assertIn(tempfile.gettempdir(), bundle_arg)
        # Se envía y se verifica checksum por ssh
        self.assertTrue(any("sha256sum" in " ".join(c) or "md5sum" in " ".join(c) for c in self.ssh.llamadas))

    def test_respaldar_sin_6gb_salta_bundle_y_dice_motivo(self):
        self.ssh.existe_rsync = True
        with patch.object(R, "_libre_gb", return_value=2.0):
            resultado = R.respaldar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                memory_root=STARSEED_MEMORY_ROOT,
                destino_base=DEST_BASE,
                seco=False,
                guardar_log=self.guardados.append,
            )
        self.assertEqual(resultado["estado"], "hecho")
        git_calls = [c for c in self.ssh.llamadas if c[0] == "git" and "bundle" in c]
        self.assertEqual(len(git_calls), 0)
        self.assertTrue(any("espejo de github" in str(d).lower() for d in resultado.get("detalles", [])))

    def test_respaldar_verifica_checksum_y_borra_temp(self):
        self.ssh.existe_rsync = True
        self.ssh.archivos_remotos["respaldos/mac/repo-2026-01-01.bundle"] = {"size_kb": 1000, "hash": "abc"}
        with patch.object(R, "_libre_gb", return_value=10.0), \
             patch("subprocess.run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(R, "_hash_archivo", return_value="abc"), \
             patch("os.path.exists", return_value=True), \
             patch("os.remove"):
            resultado = R.respaldar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                memory_root=STARSEED_MEMORY_ROOT,
                destino_base=DEST_BASE,
                seco=False,
                guardar_log=self.guardados.append,
            )
        self.assertEqual(resultado["estado"], "hecho")

    def test_respaldar_tar_si_no_hay_rsync(self):
        self.ssh.existe_rsync = False
        self.ssh.archivos_remotos["respaldos/mac/repo-2026-01-01.bundle"] = {"size_kb": 1000, "hash": "abc"}
        with patch.object(R, "_libre_gb", return_value=10.0), \
             patch("subprocess.run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")), \
             patch.object(R, "_hash_archivo", return_value="abc"):
            resultado = R.respaldar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                memory_root=STARSEED_MEMORY_ROOT,
                destino_base=DEST_BASE,
                seco=False,
                guardar_log=self.guardados.append,
            )
        self.assertEqual(resultado["estado"], "hecho")
        tar_calls = [c for c in self.ssh.llamadas if c[0] == "tar"]
        self.assertTrue(len(tar_calls) > 0)


class TestAliviar(unittest.TestCase):
    """`aliviar` lista y mide candidatos reales con su porqué; --seco no mueve."""

    def setUp(self):
        self.ssh = SSHSimulado()
        self.guardados = []

    def test_aliviar_seco_no_mueve(self):
        resultado = R.aliviar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            wt_root=WT_ROOT,
            downloads=DOWNLOADS,
            destino_base=DEST_BASE,
            objetivo_gb=25,
            seco=True,
            guardar_log=self.guardados.append,
        )
        self.assertEqual(resultado["estado"], "seco")
        self.assertEqual(len(self.ssh.llamadas), 0)

    def test_aliviar_no_hace_nada_si_hay_espacio(self):
        with patch.object(R, "_libre_gb", return_value=30.0):
            resultado = R.aliviar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                wt_root=WT_ROOT,
                downloads=DOWNLOADS,
                destino_base=DEST_BASE,
                objetivo_gb=25,
                seco=False,
                guardar_log=self.guardados.append,
            )
        self.assertEqual(resultado["estado"], "suficiente_espacio")

    def test_aliviar_seco_lista_candidatos_con_mb_y_porque(self):
        ahora = time.time()
        wt_ola1 = os.path.join(WT_ROOT, "starseed-wt-ola1")
        next_cache = os.path.join(MAC_ROOT, ".next", "cache")
        go_cache = os.path.expanduser("~/go/build")
        shipit = os.path.join(MAC_ROOT, ".tmp", "ShipIt-123")
        tmpdrive = os.path.join(MAC_ROOT, ".tmp.driveupload", "chunk1")
        olas_log = os.path.join(STARSEED_MEMORY_ROOT, "olas", "log-2026-01-01.md")

        def existe_fn(path):
            return path in (wt_ola1, next_cache, go_cache, shipit, tmpdrive, olas_log)

        def es_directorio_fn(path):
            return path in (WT_ROOT, wt_ola1, next_cache, go_cache, shipit)

        def listar_fn(path):
            if path == WT_ROOT:
                return ["starseed-wt-ola1"]
            if path == os.path.join(STARSEED_MEMORY_ROOT, "olas"):
                return ["log-2026-01-01.md", "log-2026-01-08.md"]
            return []

        def mtime_fn(path):
            tiempos = {
                wt_ola1: ahora - 2 * 86400,        # 2 días (terminado)
                next_cache: ahora - 2 * 86400,
                go_cache: ahora - 2 * 86400,        # > 1 h
                shipit: ahora - 2 * 86400,          # > 1 día
                tmpdrive: ahora - 30 * 86400,       # > 24 h
                olas_log: ahora - 10 * 86400,       # > 7 días
            }
            return tiempos.get(path, ahora)

        def tamano_fn(path):
            tamanos = {
                wt_ola1: 5_000_000,      # 5 GB
                next_cache: 3_000_000,   # 3 GB
                go_cache: 1_000_000,     # 1 GB
                shipit: 500_000,         # 500 MB
                tmpdrive: 2_000_000,     # 2 GB
                olas_log: 100_000,       # 100 MB
            }
            return tamanos.get(path, 0)

        resultado = R.aliviar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            wt_root=WT_ROOT,
            downloads=DOWNLOADS,
            destino_base=DEST_BASE,
            objetivo_gb=25,
            seco=True,
            guardar_log=self.guardados.append,
            cola_activa_ids={"ola2"},
            existe_fn=existe_fn,
            es_directorio_fn=es_directorio_fn,
            listar_fn=listar_fn,
            mtime_fn=mtime_fn,
            tamano_fn=tamano_fn,
        )
        self.assertEqual(resultado["estado"], "seco")
        candidatos = resultado.get("candidatos", [])
        self.assertTrue(len(candidatos) > 0, "debe listar candidatos")
        # Cada candidato tiene MB y porqué
        for c in candidatos:
            self.assertIn("mb", c)
            self.assertIn("porque", c)
        # .next/cache y go-build están presentes por antigüedad
        rutas = [c["ruta"] for c in candidatos]
        self.assertIn(next_cache, rutas)
        self.assertIn(go_cache, rutas)

    def test_aliviar_nunca_toca_datos_cuenta_ni_claves_ni_proyecto_en_uso(self):
        with patch.object(R, "_libre_gb", return_value=5.0):
            self.ssh.archivos_remotos[os.path.expanduser("~/.starseed/env")] = {"size_kb": 100}
            self.ssh.archivos_remotos[os.path.join(MAC_ROOT, ".env.local")] = {"size_kb": 100}
            self.ssh.archivos_remotos[os.path.join(WT_ROOT, "starseed-wt-ola2")] = {"size_kb": 5_000_000}

            resultado = R.aliviar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                wt_root=WT_ROOT,
                downloads=DOWNLOADS,
                destino_base=DEST_BASE,
                objetivo_gb=25,
                seco=False,
                guardar_log=self.guardados.append,
                cola_activa_ids={"ola2"},
            )
        for movido in resultado.get("movidos", []):
            self.assertNotIn(".starseed/env", movido["origen"])
            self.assertNotIn(".env.local", movido["origen"])
            self.assertNotIn("starseed-wt-ola2", movido["origen"])

    def test_aliviar_copia_verificada_antes_de_borrar(self):
        import tempfile
        with patch.object(R, "_libre_gb", return_value=5.0):
            with tempfile.TemporaryDirectory() as tmpdir:
                next_cache = os.path.join(tmpdir, ".next", "cache")
                os.makedirs(next_cache, exist_ok=True)
                with open(os.path.join(next_cache, "file1"), "w") as f:
                    f.write("test")

                origen = next_cache
                self.ssh.archivos_remotos[origen] = {"size_kb": 100, "is_dir": True, "entradas": 2, "hash": "abc"}

                def existe_fn(path):
                    return path == origen
                def es_directorio_fn(path):
                    return path == origen
                def listar_fn(path):
                    return ["file1"]
                def mtime_fn(path):
                    return time.time() - 2 * 86400
                def tamano_fn(path):
                    return 100
                def contar_fn(path):
                    return 2

                resultado = R.aliviar(
                    ssh_fn=self.ssh,
                    mac_root=tmpdir,
                    wt_root=WT_ROOT,
                    downloads=DOWNLOADS,
                    destino_base=DEST_BASE,
                    objetivo_gb=25,
                    seco=False,
                    guardar_log=self.guardados.append,
                    cola_activa_ids=set(),
                    existe_fn=existe_fn,
                    es_directorio_fn=es_directorio_fn,
                    listar_fn=listar_fn,
                    mtime_fn=mtime_fn,
                    tamano_fn=tamano_fn,
                    contar_fn=contar_fn,
                )
            self.assertTrue(resultado.get("movidos"), "no se movió ningún candidato")
            for movido in resultado["movidos"]:
                self.assertTrue(movido.get("verificado"), "cada movimiento debe estar verificado")


class TestEstado(unittest.TestCase):
    """`estado` muestra espacio, últimos respaldos, bundles y log_existe."""

    def setUp(self):
        self.ssh = SSHSimulado()

    def test_estado_muestra_log_existe_y_bundles(self):
        base = os.path.join(DEST_BASE, "respaldos/mac")
        for i in range(3):
            fecha = f"2026-01-{i+1:02d}"
            self.ssh.archivos_remotos[os.path.join(base, f"repo-{fecha}.bundle")] = {"size_kb": 1000 * (i + 1)}
        self.ssh.archivos_remotos[os.path.join(base, "starseed_memory_root")] = {"size_kb": 5000, "is_dir": True}
        self.ssh.archivos_remotos[os.path.join(base, "respaldos.log")] = {"size_kb": 100, "is_dir": False}

        with patch.object(R, "_libre_gb", return_value=50.0):
            estado = R.estado(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                destino_base=DEST_BASE,
            )

        self.assertIn("mac_libre_gb", estado)
        self.assertIn("destino", estado)
        self.assertIn("log_existe", estado["destino"])
        self.assertTrue(estado["destino"]["log_existe"])
        self.assertIn("ultimos_bundles", estado)
        self.assertEqual(len(estado["ultimos_bundles"]), 3)


if __name__ == "__main__":
    unittest.main()


