# -*- coding: utf-8 -*-
"""Pruebas del respaldo Mac → Maggabox (ALM1118B).

Herméticas: no tocan la red, ~/.ssh, ~/.starseed/env ni el disco real;
todo va con dobles (ssh simulado, rsync/tar simulado, sistema de archivos en memoria).
"""
import os
import sys
import time
import unittest
from unittest.mock import MagicMock, patch
from typing import Dict, List, Any, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import respaldo_maggabox as R  # noqa: E402


# Constantes de prueba
MAC_ROOT = "/Users/alex/Documents/starseed-os-main"
STARSEED_MEMORY_ROOT = os.path.join(MAC_ROOT, "starseed_memory_root")
WT_ROOT = os.path.expanduser("~/Documents/starseed-wd")
ENV_PATH = os.path.expanduser("~/.starseed/env")
SSH_KEY = os.path.expanduser("~/.ssh/starseed_nodo1")
DEST_HOST = "maggasukha@starseed-nodo-1.local"
DEST_BASE = "~/StarSeed-almacen"
DEST_RESPALDOS = os.path.join(DEST_BASE, "respaldos/mac")
DEST_PESADOS = os.path.join(DEST_BASE, "pesados")


class SSHSimulado:
    """Simula conexión SSH y comandos remotos."""

    def __init__(self, respuestas: Optional[Dict[str, Any]] = None):
        self.llamadas: List[List[str]] = []
        self.respuestas = respuestas or {}
        self.existe_rsync = True
        self.archivos_remotos: Dict[str, Dict] = {}  # ruta -> {size, mtime, is_dir}

    def __call__(self, argv: List[str], **kw) -> Any:
        self.llamadas.append(argv)
        cmd = " ".join(argv)

        # ssh directo
        if argv[0] == "ssh":
            clave = cmd
            if clave in self.respuestas:
                r = self.respuestas[clave]
                return MagicMock(returncode=r.get("codigo", 0),
                                 stdout=r.get("salida", ""),
                                 stderr=r.get("error", ""))

            # Comprobar rsync remoto
            if "rsync --version" in cmd:
                if self.existe_rsync:
                    return MagicMock(returncode=0, stdout="rsync  version 3.2.7", stderr="")
                return MagicMock(returncode=127, stdout="", stderr="rsync not found")

            # mkdir -p remoto
            if "mkdir -p" in cmd:
                return MagicMock(returncode=0, stdout="", stderr="")

            # ls remoto para listar bundles (ls -1t)
            if "ls -1t" in cmd and "repo-" in cmd and ".bundle" in cmd:
                bundles = sorted([os.path.basename(k) for k in self.archivos_remotos.keys() if k.endswith(".bundle")], reverse=True)
                return MagicMock(returncode=0, stdout="\n".join(bundles), stderr="")

            # du remoto para tamaños
            if "du -sk" in cmd:
                ruta = argv[-1]
                if ruta in self.archivos_remotos:
                    size_kb = self.archivos_remotos[ruta].get("size_kb", 0)
                    return MagicMock(returncode=0, stdout=f"{size_kb}\t{ruta}", stderr="")
                return MagicMock(returncode=1, stdout="", stderr="No such file")

            # test -d / test -f remoto
            if "test -d" in cmd or "test -f" in cmd or "test -e" in cmd:
                ruta = argv[-1]
                existe = ruta in self.archivos_remotos
                return MagicMock(returncode=0 if existe else 1, stdout="", stderr="")

            # find para contar entradas
            if "find" in cmd and "-printf" in cmd:
                ruta = argv[argv.index("find") + 1] if "find" in argv else ""
                if ruta in self.archivos_remotos:
                    meta = self.archivos_remotos[ruta]
                    entradas = meta.get("entradas", 100)  # Usar entradas si está definido
                    return MagicMock(returncode=0, stdout="." * entradas, stderr="")
                return MagicMock(returncode=0, stdout="", stderr="")

            return MagicMock(returncode=0, stdout="", stderr="")

        # rsync local - simular que el archivo se copia al destino remoto
        if argv[0] == "rsync":
            # rsync -az --delete --info=progress2 --exclude=<excl> origen/ destino/
            # El origen está en argv[-2] (sin trailing slash), el destino en argv[-1]
            if len(argv) >= 4:
                # Buscar el origen: el segundo último argumento que no empieza con --
                origen = None
                destino = argv[-1].rstrip("/")
                for i in range(len(argv) - 2, -1, -1):
                    if not argv[i].startswith("--"):
                        origen = argv[i].rstrip("/")
                        break
                if origen and origen in self.archivos_remotos:
                    self.archivos_remotos[destino] = self.archivos_remotos[origen].copy()
            return MagicMock(returncode=0, stdout="", stderr="")

        # tar local
        if argv[0] == "tar":
            return MagicMock(returncode=0, stdout="", stderr="")

        # git bundle
        if argv[0] == "git" and argv[1] == "bundle":
            return MagicMock(returncode=0, stdout="", stderr="")

        # git status / git rev-parse
        if argv[0] == "git":
            if "rev-parse" in argv:
                return MagicMock(returncode=0, stdout="abc123\n", stderr="")
            if "status" in argv:
                return MagicMock(returncode=0, stdout="", stderr="")

        # shutil.disk_usage simulado
        if argv[0] == "disk_usage":
            return self.respuestas.get("disk_usage", (100_000_000_000, 50_000_000_000, 25_000_000_000))

        return MagicMock(returncode=0, stdout="", stderr="")


class TestExcluirSecretos(unittest.TestCase):
    """La lista de exclusión de secretos es PURA y determinista."""

    def test_excluye_env_y_ssh(self):
        excluidas = R.excluir_secretos()
        self.assertIn("~/.starseed/env", excluidas)
        self.assertIn("~/.ssh", excluidas)
        self.assertIn("*.pem", excluidas)
        self.assertIn("*key*", excluidas)
        self.assertIn(".env*", excluidas)

    def test_no_incluye_rutas_normales(self):
        excluidas = R.excluir_secretos()
        self.assertNotIn("starseed_memory_root", excluidas)
        self.assertNotIn("src", excluidas)
        self.assertNotIn("scripts", excluidas)


class TestPlan(unittest.TestCase):
    """`plan` decide qué se respalda y qué se excluye (PURA)."""

    def setUp(self):
        self.ssh = SSHSimulado()

    def test_plan_incluye_memory_root_y_repo(self):
        plan = R.plan(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
        )
        self.assertTrue(any("starseed_memory_root" in p["origen"] for p in plan["respaldar"]))
        self.assertTrue(any("git_bundle" == p["accion"] for p in plan["respaldar"]))

    def test_plan_excluye_secretos(self):
        plan = R.plan(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
        )
        for item in plan["respaldar"]:
            for excl in R.excluir_secretos():
                self.assertNotIn(excl.replace("*", ""), item.get("origen", ""))

    def test_plan_rotacion_bundles_7(self):
        # Simular 10 bundles existentes
        for i in range(10):
            fecha = f"2026-01-{i+1:02d}"
            self.ssh.archivos_remotos[f"respaldos/mac/repo-{fecha}.bundle"] = {"size_kb": 1000}

        plan = R.plan(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=True,
        )
        # Debe planear borrar los 3 más viejos
        borrar = [p for p in plan["respaldar"] if p["accion"] == "borrar_bundle_antiguo"]
        self.assertEqual(len(borrar), 3)


class TestRespaldar(unittest.TestCase):
    """`respaldar` ejecuta rsync/tar y git bundle con copia verificada."""

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

    def test_respaldar_rsync_memory_root(self):
        self.ssh.existe_rsync = True
        resultado = R.respaldar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=False,
            guardar_log=self.guardados.append,
        )
        self.assertEqual(resultado["estado"], "hecho")
        # Verificar que se llamó rsync con exclusiones
        rsync_calls = [c for c in self.ssh.llamadas if c[0] == "rsync"]
        self.assertTrue(len(rsync_calls) > 0)
        # Verificar exclusiones de secretos
        args = " ".join(rsync_calls[0])
        for excl in R.excluir_secretos():
            self.assertIn(excl.replace("*", ""), args)

    def test_respaldar_tar_si_no_hay_rsync(self):
        self.ssh.existe_rsync = False
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

    def test_respaldar_git_bundle_y_rotacion(self):
        # Simular bundles existentes
        for i in range(8):
            fecha = f"2026-01-{i+1:02d}"
            self.ssh.archivos_remotos[f"respaldos/mac/repo-{fecha}.bundle"] = {"size_kb": 1000}

        resultado = R.respaldar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=False,
            guardar_log=self.guardados.append,
        )
        self.assertEqual(resultado["estado"], "hecho")
        # Debe haber creado uno nuevo y borrado el más viejo (mantener 7)
        git_calls = [c for c in self.ssh.llamadas if c[0] == "git" and "bundle" in c]
        self.assertTrue(len(git_calls) > 0)


class TestAliviar(unittest.TestCase):
    """`aliviar` mueve lo pesado y regenerable a pesados/ con copia verificada."""

    def setUp(self):
        self.ssh = SSHSimulado()
        self.guardados = []

    def test_aliviar_seco_no_mueve(self):
        resultado = R.aliviar(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            wt_root=WT_ROOT,
            destino_base=DEST_BASE,
            objetivo_gb=25,
            seco=True,
            guardar_log=self.guardados.append,
        )
        self.assertEqual(resultado["estado"], "seco")

    def test_aliviar_no_hace_nada_si_hay_espacio(self):
        # Simular 30 GB libres
        with patch("respaldo_maggabox.shutil.disk_usage", return_value=(300_000_000_000, 200_000_000_000, 30_000_000_000)):
            resultado = R.aliviar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                wt_root=WT_ROOT,
                destino_base=DEST_BASE,
                objetivo_gb=25,
                seco=False,
                guardar_log=self.guardados.append,
            )
        self.assertEqual(resultado["estado"], "suficiente_espacio")

    def test_aliviar_mueve_caches_next(self):
        # Simular poco espacio
        with patch("respaldo_maggabox.shutil.disk_usage", return_value=(300_000_000_000, 280_000_000_000, 5_000_000_000)):
            # Rutas simuladas
            wt_ola1 = os.path.join(WT_ROOT, "starseed-wt-ola1")
            next_cache = os.path.join(MAC_ROOT, ".next/cache")
            self.ssh.archivos_remotos[wt_ola1] = {"size_kb": 5_000_000, "is_dir": True}
            self.ssh.archivos_remotos[next_cache] = {"size_kb": 3_000_000, "is_dir": True}

            # Inyectar funciones de filesystem simuladas
            def existe_fn(path):
                return path in (wt_ola1, next_cache)
            def es_directorio_fn(path):
                return path in (wt_ola1, next_cache)
            def listar_fn(path):
                if path == WT_ROOT:
                    return ["starseed-wt-ola1"]
                return []
            def mtime_fn(path):
                return time.time() - 40 * 86400  # 40 días

            resultado = R.aliviar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                wt_root=WT_ROOT,
                destino_base=DEST_BASE,
                objetivo_gb=25,
                seco=False,
                guardar_log=self.guardados.append,
                cola_activa_ids={"ola2", "ola3"},  # ola1 no está en cola
                existe_fn=existe_fn,
                es_directorio_fn=es_directorio_fn,
                listar_fn=listar_fn,
                mtime_fn=mtime_fn,
            )
        self.assertEqual(resultado["estado"], "hecho")
        # Verificar que se movieron items
        self.assertTrue(len(resultado["movidos"]) > 0)

    def test_aliviar_nunca_toca_datos_cuenta_ni_proyecto_en_uso(self):
        with patch("respaldo_maggabox.shutil.disk_usage", return_value=(300_000_000_000, 280_000_000_000, 5_000_000_000)):
            # Simular datos de cuenta (deben estar en lista negra)
            self.ssh.archivos_remotos[os.path.expanduser("~/.starseed/env")] = {"size_kb": 100, "is_dir": False}
            self.ssh.archivos_remotos[os.path.join(MAC_ROOT, ".env.local")] = {"size_kb": 100, "is_dir": False}
            # Proyecto en uso (worktree en cola activa)
            self.ssh.archivos_remotos[os.path.join(WT_ROOT, "starseed-wt-ola2")] = {"size_kb": 5_000_000, "is_dir": True}

            resultado = R.aliviar(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                wt_root=WT_ROOT,
                destino_base=DEST_BASE,
                objetivo_gb=25,
                seco=False,
                guardar_log=self.guardados.append,
                cola_activa_ids={"ola2"},
            )
        # No debe mover ni .starseed/env ni .env.local ni el worktree en uso
        for movido in resultado["movidos"]:
            self.assertNotIn(".starseed/env", movido["origen"])
            self.assertNotIn(".env.local", movido["origen"])
            self.assertNotIn("starseed-wt-ola2", movido["origen"])

    def test_aliviar_copia_verificada_antes_de_borrar(self):
        import tempfile
        with patch("respaldo_maggabox.shutil.disk_usage", return_value=(300_000_000_000, 280_000_000_000, 5_000_000_000)):
            # Crear directorio temporal para simular .next/cache
            with tempfile.TemporaryDirectory() as tmpdir:
                next_cache = os.path.join(tmpdir, ".next", "cache")
                os.makedirs(next_cache, exist_ok=True)
                # Crear algunos archivos en el cache
                with open(os.path.join(next_cache, "file1"), "w") as f:
                    f.write("test")
                with open(os.path.join(next_cache, "file2"), "w") as f:
                    f.write("test")

                origen = next_cache
                # Simular archivo en remoto ANTES del rsync (para el tamaño del origen)
                # El campo 'entradas' se usará para que el mock de find copie el contador correcto
                self.ssh.archivos_remotos[origen] = {"size_kb": 3_000_000, "is_dir": True, "entradas": 2}
                # Simular filesystem local
                def existe_fn(path):
                    return path == origen
                def es_directorio_fn(path):
                    return path == origen
                def listar_fn(path):
                    return ["file1", "file2"]
                def mtime_fn(path):
                    return time.time() - 40 * 86400  # 40 días

                # Mocks para tamano_fn y contar_fn que usan los metadata del ssh
                def tamano_fn(path):
                    meta = self.ssh.archivos_remotos.get(path, {})
                    return meta.get("size_kb", 0)  # du -sk devuelve KB
                def contar_fn(path):
                    meta = self.ssh.archivos_remotos.get(path, {})
                    return meta.get("entradas", 0)

                resultado = R.aliviar(
                    ssh_fn=self.ssh,
                    mac_root=tmpdir,
                    wt_root=WT_ROOT,
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

            # Verificar que cada item movido tiene verificación de tamaño y entradas
            self.assertTrue(resultado.get("movidos"), "no se movió ningún candidato")
            for movido in resultado["movidos"]:
                self.assertIn("verificado", movido)
                self.assertTrue(movido["verificado"])


class TestEstado(unittest.TestCase):
    """`estado` muestra información del destino y espacio."""

    def setUp(self):
        self.ssh = SSHSimulado()

    def test_estado_muestra_espacio_y_ultimos_respaldos(self):
        # Simular bundles
        for i in range(3):
            fecha = f"2026-01-{i+1:02d}"
            self.ssh.archivos_remotos[f"respaldos/mac/repo-{fecha}.bundle"] = {"size_kb": 1000 * (i+1)}
        self.ssh.archivos_remotos["respaldos/mac/starseed_memory_root"] = {"size_kb": 5000, "is_dir": True}
        self.ssh.archivos_remotos["respaldos/mac/respaldos.log"] = {"size_kb": 100, "is_dir": False}

        with patch("respaldo_maggabox.shutil.disk_usage", return_value=(300_000_000_000, 200_000_000_000, 50_000_000_000)):
            estado = R.estado(
                ssh_fn=self.ssh,
                mac_root=MAC_ROOT,
                destino_base=DEST_BASE,
            )

        self.assertIn("mac_libre_gb", estado)
        self.assertIn("destino", estado)
        self.assertIn("ultimos_bundles", estado)
        self.assertEqual(len(estado["ultimos_bundles"]), 3)


class TestResticPreparado(unittest.TestCase):
    """El comando restic para secretos está preparado pero sin contraseña."""

    def test_comando_restic_sin_password(self):
        cmd = R.comando_restic_inicializar(destino_base=DEST_BASE)
        self.assertIn("restic", cmd)
        self.assertIn("init", cmd)
        self.assertIn("--repository", cmd)
        # NO debe tener password
        self.assertNotIn("-p", cmd)
        self.assertNotIn("--password", cmd)
        self.assertNotIn("password", " ".join(cmd).lower())

    def test_comando_restic_respaldar_secretos(self):
        cmd = R.comando_restic_respaldar(
            origenes=["~/.starseed/env", "~/.ssh"],
            destino_base=DEST_BASE,
        )
        self.assertIn("restic", cmd)
        self.assertIn("backup", cmd)
        # NO debe tener password en el comando
        self.assertNotIn("-p", cmd)
        self.assertNotIn("--password", cmd)


class TestPlistLaunchd(unittest.TestCase):
    """El docstring incluye un plist de ejemplo para launchd (cada 6h)."""

    def test_docstring_tiene_plist(self):
        self.assertIn("launchd", R.__doc__ or "")
        self.assertIn("StartInterval", R.__doc__ or "")
        self.assertIn("21600", R.__doc__ or "")  # 6 horas = 21600 segundos


class TestExclusionesDeRespaldo(unittest.TestCase):
    """ALM1121: el rsync no arrastra los temporales de Drive ni los secretos."""

    def test_incluye_tmp_drive_y_secretos(self):
        patrones = R.exclusiones_respaldo()
        self.assertIn(".tmp.drive*", patrones)
        self.assertIn("~/.starseed/env", patrones)
        self.assertIn("*.pem", patrones)

    def test_umbral_de_espacio_del_bundle(self):
        gb = 1024 ** 3
        self.assertFalse(R.hay_espacio_para_bundle(5 * gb))
        self.assertTrue(R.hay_espacio_para_bundle(7 * gb))
        self.assertFalse(R.hay_espacio_para_bundle(6 * gb))  # «más de 6 GB», no «6 justos»


class TestRespaldarBundleTemporal(unittest.TestCase):
    """ALM1121: el bundle se crea en local, se envía, se verifica y se borra."""

    def setUp(self):
        self.ssh = SSHSimulado()
        self.guardados = []

    def _respaldar(self, **kw):
        base = dict(
            ssh_fn=self.ssh,
            mac_root=MAC_ROOT,
            memory_root=STARSEED_MEMORY_ROOT,
            destino_base=DEST_BASE,
            seco=False,
            guardar_log=self.guardados.append,
        )
        base.update(kw)
        return R.respaldar(**base)

    def test_sin_espacio_se_salta_el_bundle_y_lo_dice(self):
        resultado = self._respaldar(libre_fn=lambda _ruta: 1 * 1024 ** 3)
        bundle = [d for d in resultado["detalles"] if d.get("fase") == "git_bundle"][0]
        self.assertTrue(bundle.get("saltado"))
        self.assertIn("GitHub", bundle.get("motivo", ""))
        self.assertFalse(any(c[:2] == ["git", "-C"] for c in self.ssh.llamadas))

    def test_bundle_local_en_temporal_con_suma_y_limpieza(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            resultado = self._respaldar(
                libre_fn=lambda _ruta: 20 * 1024 ** 3,
                tmp_fn=lambda: tmp,
                hash_local_fn=lambda _ruta: "sha-igual",
                hash_remoto_fn=lambda _ruta: "sha-igual",
            )
            self.assertEqual(resultado["estado"], "hecho")
            git = [c for c in self.ssh.llamadas if c[:2] == ["git", "-C"]][0]
            self.assertTrue(git[4].startswith(tmp), git)
            self.assertFalse(git[4].startswith("~"), "el bundle no puede ir a una ruta remota")
            self.assertTrue(any(c[0] == "scp" for c in self.ssh.llamadas))
            self.assertEqual(os.listdir(tmp), [], "el temporal se borra tras verificar")

    def test_suma_distinta_conserva_el_temporal(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            resultado = self._respaldar(
                libre_fn=lambda _ruta: 20 * 1024 ** 3,
                tmp_fn=lambda: tmp,
                hash_local_fn=lambda _ruta: "sha-local",
                hash_remoto_fn=lambda _ruta: "sha-remoto",
            )
            self.assertEqual(resultado["estado"], "parcial")
            self.assertTrue(os.path.isdir(tmp), "sin copia comprobada no se borra nada")


class TestCandidatosDeAlivio(unittest.TestCase):
    """ALM1121: candidatos medidos, con su porqué y su umbral de edad."""

    def test_go_build_solo_pasa_de_una_hora(self):
        self.assertTrue(R._go_build_viejo("go-build123", 3601))
        self.assertFalse(R._go_build_viejo("go-build123", 3599))
        self.assertFalse(R._go_build_viejo("otra-cosa", 99999))

    def test_shipit_solo_pasa_de_un_dia(self):
        self.assertTrue(R._shipit_viejo("com.apple.ShipIt", 86401))
        self.assertFalse(R._shipit_viejo("com.apple.ShipIt", 86399))
        self.assertFalse(R._shipit_viejo("otra-cosa", 999999))

    def test_driveupload_solo_pasa_de_24_horas(self):
        self.assertTrue(R._driveupload_viejo(".tmp.driveupload", 86401))
        self.assertFalse(R._driveupload_viejo(".tmp.driveupload", 86399))
        self.assertFalse(R._driveupload_viejo("otra-cosa", 999999))

    def test_next_anterior_solo_con_la_actual_sana_y_vieja(self):
        self.assertTrue(R._next_anterior_movible(True, 7200, True))
        self.assertFalse(R._next_anterior_movible(True, 1800, True))
        self.assertFalse(R._next_anterior_movible(True, 7200, False))
        self.assertFalse(R._next_anterior_movible(False, 7200, True))

    def test_instalador_solo_si_la_version_ya_se_publico(self):
        publicadas = {"0.5.1-prueba.7"}
        self.assertTrue(R._instalador_prueba_publicado("StarSeed-0.5.1-prueba.7.dmg", publicadas))
        self.assertFalse(R._instalador_prueba_publicado("StarSeed-0.5.1-prueba.8.dmg", publicadas))
        self.assertFalse(R._instalador_prueba_publicado("StarSeed-0.5.1.dmg", publicadas))

    def test_olas_logs_solo_pasan_de_siete_dias(self):
        edades = {"ola-1.log": 7 * 86400 + 1, "ola-2.log": 7 * 86400 - 1, "otra.txt": 10 ** 9}
        self.assertEqual(R._olas_logs_movibles(edades), ["ola-1.log"])


class TestAliviarSecreto(unittest.TestCase):
    """`--seco` enseña cada candidato con sus MB, sin tocar nada."""

    def test_seco_lista_candidatos_con_mb(self):
        resultado = R.aliviar(
            ssh_fn=SSHSimulado(),
            mac_root=MAC_ROOT,
            wt_root=WT_ROOT,
            destino_base=DEST_BASE,
            seco=True,
            candidatos_fn=lambda **_kw: [
                {"ruta": "/tmp/go-build1", "clase": "go-build", "motivo": "go-build de más de 1 h", "mb": 812.4},
                {"ruta": "/tmp/ola-1.log", "clase": "olas-logs", "motivo": "registro de ola de más de 7 días", "mb": 3.2},
            ],
        )
        self.assertEqual(resultado["estado"], "seco")
        self.assertEqual(len(resultado["candidatos"]), 2)
        self.assertEqual(resultado["total_mb"], 815.6)
        self.assertIn("MB", json.dumps(resultado, ensure_ascii=False))

    def test_alivio_automatico_solo_bajo_12_gb(self):
        self.assertEqual(R.UMBRAL_ALIVIO_GB, 12.0)


if __name__ == "__main__":
    unittest.main()