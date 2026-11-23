# -*- coding: utf-8 -*-
"""Pruebas del respaldo Mac → Maggabox (ALM1118B / ALM1121A).

Herméticas: no tocan la red, ~/.ssh, ~/.starseed/env ni el disco real;
todo va con dobles (ssh simulado, rsync/scp simulado, sistema de archivos en
memoria o en un tmpdir). Se prueba el comportamiento por la interfaz pública:
`plan`, `respaldar`, `aliviar`, `estado` y el plist de launchd.
"""
import json
import os
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import respaldo_maggabox as R  # noqa: E402

MAC_ROOT = "/Users/alex/Documents/starseed-os-main"
STARSEED_MEMORY_ROOT = os.path.join(MAC_ROOT, "starseed_memory_root")
WT_ROOT = os.path.expanduser("~/Documents/starseed-wt")
DEST_HOST = "maggasukha@starseed-nodo-1.local"
DEST_BASE = "~/StarSeed-almacen"
HASH = "b" * 64


class SSHSimulado:
    """Simula SSH/rsync/scp y guarda qué se le pidió. Nunca sale de la máquina."""

    def __init__(self) -> None:
        self.llamadas: List[List[str]] = []
        self.remotos: Dict[str, Dict[str, Any]] = {}
        self.existe_rsync = True
        self.hash_remoto = HASH

    def _r(self, codigo: int = 0, salida: str = "", error: str = "") -> MagicMock:
        return MagicMock(returncode=codigo, stdout=salida, stderr=error)

    def __call__(self, argv: List[str], **kw: Any) -> Any:
        self.llamadas.append(list(argv))
        cmd = " ".join(argv)
        if argv[0] == "ssh":
            if "rsync --version" in cmd:
                return self._r(0, "rsync  version 3.2.7") if self.existe_rsync else self._r(127, "", "no rsync")
            if "mkdir -p" in cmd:
                return self._r()
            if "ls -1t" in cmd and "repo-" in cmd and ".bundle" in cmd:
                nombres = sorted((k.rsplit("/", 1)[-1] for k in self.remotos if k.endswith(".bundle")), reverse=True)
                return self._r(0, "\n".join(nombres))
            if "sha256sum" in cmd:
                return self._r(0, "%s  %s" % (self.hash_remoto, argv[-1]))
            if "du -sk" in cmd:
                ruta = argv[-1]
                if ruta in self.remotos:
                    return self._r(0, "%s\t%s" % (self.remotos[ruta].get("size_kb", 0), ruta))
                return self._r(1, "", "No such file")
            if "test -e" in cmd or "test -d" in cmd or "test -f" in cmd:
                return self._r(0 if argv[-1] in self.remotos else 1)
            if "find" in cmd and "-printf" in cmd:
                ruta = argv[argv.index("find") + 1] if "find" in argv else ""
                entradas = self.remotos.get(ruta, {}).get("entradas", 0)
                return self._r(0, "." * entradas)
            if "rm -f" in cmd:
                return self._r()
            return self._r()
        if argv[0] == "rsync":
            destino = argv[-1]
            origen = next((a for a in reversed(argv[:-1]) if not a.startswith("-")), "")
            if origen.rstrip("/") in self.remotos:
                self.remotos[destino.rstrip("/")] = dict(self.remotos[origen.rstrip("/")])
            return self._r()
        if argv[0] == "scp":
            return self._r()
        if argv[0] == "tar":
            return self._r()
        if argv[0] == "git":
            return self._r()
        return self._r()


class FSReal:
    """Ayudas para montar árboles de prueba en un tmpdir (nada del disco de Alex)."""

    def __init__(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = self._tmp.name

    def limpiar(self) -> None:
        self._tmp.cleanup()

    def dir(self, *partes: str) -> str:
        ruta = os.path.join(self.base, *partes)
        os.makedirs(ruta, exist_ok=True)
        return ruta

    def archivo(self, *partes: str, contenido: str = "x", edad_s: float = 0.0) -> str:
        ruta = os.path.join(self.base, *partes)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(contenido)
        if edad_s:
            t = time.time() - edad_s
            os.utime(ruta, (t, t))
        return ruta


class TestExclusiones(unittest.TestCase):
    """Lo secreto y los temporales de Drive nunca salen de la Mac."""

    def test_excluye_env_y_ssh(self):
        excluidas = R.excluir_secretos()
        self.assertIn("~/.starseed/env", excluidas)
        self.assertIn("~/.ssh", excluidas)
        self.assertIn("*.pem", excluidas)
        self.assertIn("*key*", excluidas)
        self.assertIn(".env*", excluidas)

    def test_respaldo_anade_tmp_drive(self):
        excluidas = R.excluir_respaldo()
        self.assertIn(".tmp.drive*", excluidas)
        self.assertIn(".tmp.driveupload", excluidas)
        self.assertIn(".tmp.drivedownload", excluidas)
        self.assertIn("*.bundle", excluidas)

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
        plan = R.plan(ssh_fn=self.ssh, mac_root=MAC_ROOT,
                      memory_root=STARSEED_MEMORY_ROOT, destino_base=DEST_BASE, seco=True)
        self.assertTrue(any("starseed_memory_root" in p["origen"] for p in plan["respaldar"]))
        self.assertTrue(any("git_bundle" == p["accion"] for p in plan["respaldar"]))
        self.assertTrue(any(".tmp.drive*" in p.get("exclusiones", []) for p in plan["respaldar"]))

    def test_plan_excluye_secretos(self):
        plan = R.plan(ssh_fn=self.ssh, mac_root=MAC_ROOT,
                      memory_root=STARSEED_MEMORY_ROOT, destino_base=DEST_BASE, seco=True)
        for item in plan["respaldar"]:
            for excl in R.excluir_secretos():
                self.assertNotIn(excl.replace("*", ""), item.get("origen", ""))

    def test_plan_rotacion_bundles_7(self):
        for i in range(10):
            self.ssh.remotos["/home/magga/StarSeed-almacen/respaldos/mac/repo-2026-01-%02d.bundle" % (i + 1)] = {}
        plan = R.plan(ssh_fn=self.ssh, mac_root=MAC_ROOT,
                      memory_root=STARSEED_MEMORY_ROOT, destino_base=DEST_BASE, seco=True)
        borrar = [p for p in plan["respaldar"] if p["accion"] == "borrar_bundle_antiguo"]
        self.assertEqual(len(borrar), 3)


class TestRespaldar(unittest.TestCase):
    """`respaldar` copia sin secretos, crea el bundle en local si hay espacio y verifica."""

    def setUp(self):
        self.ssh = SSHSimulado()
        self.fs = FSReal()
        self.guardados: List[Dict[str, Any]] = []
        self.memory = self.fs.dir("repo", "starseed_memory_root")
        self.fs.archivo("repo", "starseed_memory_root", "index.md", contenido="hola")
        self.fs.dir("repo", "starseed_memory_root", ".tmp.driveupload")
        self.fs.archivo("repo", "starseed_memory_root", ".tmp.driveupload", "trozo", contenido="basura")

    def tearDown(self):
        self.fs.limpiar()

    def _respaldar(self, **extra: Any) -> Dict[str, Any]:
        datos = dict(ssh_fn=self.ssh, mac_root=os.path.join(self.fs.base, "repo"),
                     memory_root=self.memory, destino_base=DEST_BASE, seco=False,
                     guardar_log=self.guardados.append, auto_aliviar=False,
                     notificar_fn=lambda *a, **k: None)
        datos.update(extra)
        return R.respaldar(**datos)

    def test_seco_no_ejecuta(self):
        resultado = self._respaldar(seco=True)
        self.assertEqual(resultado["estado"], "seco")
        self.assertEqual(len(self.ssh.llamadas), 0)

    def test_rsync_usa_host_remoto_y_excluye_tmp_drive(self):
        resultado = self._respaldar(libre_fn=lambda: 0.0)
        self.assertIn(resultado["estado"], ("hecho", "parcial"))
        rsync = [c for c in self.ssh.llamadas if c[0] == "rsync"]
        self.assertTrue(rsync)
        args = " ".join(rsync[0])
        self.assertIn(DEST_HOST + ":", args)
        self.assertIn(".tmp.drive*", args)
        self.assertIn("~/.starseed/env", args)

    def test_sin_6gb_omite_bundle_y_lo_dice(self):
        llamadas_bundle: List[str] = []

        def bundle(_repo: str, destino: str) -> Dict[str, Any]:
            llamadas_bundle.append(destino)
            return {"codigo": 0, "salida": "", "error": ""}

        resultado = self._respaldar(libre_fn=lambda: 5.9, bundle_fn=bundle)
        self.assertEqual(llamadas_bundle, [])
        fase = [d for d in resultado["detalles"] if d.get("fase") == "git_bundle"][0]
        self.assertEqual(fase["estado"], "omitido")
        self.assertIn("GitHub", fase["motivo"])

    def test_bundle_temporal_se_envia_verifica_y_se_borra(self):
        temporales: List[str] = []

        def bundle(_repo: str, destino: str) -> Dict[str, Any]:
            temporales.append(os.path.dirname(destino))
            with open(destino, "wb") as f:
                f.write(b"bundle")
            return {"codigo": 0, "salida": "", "error": ""}

        resultado = self._respaldar(libre_fn=lambda: 10.0, bundle_fn=bundle,
                                    sha_local_fn=lambda _r: HASH)
        fase = [d for d in resultado["detalles"] if d.get("fase") == "git_bundle"][0]
        self.assertEqual(fase["estado"], "hecho")
        self.assertTrue(any(c[0] == "scp" for c in self.ssh.llamadas))
        self.assertTrue(any("sha256sum" in " ".join(c) for c in self.ssh.llamadas))
        self.assertTrue(temporales and all(not os.path.exists(t) for t in temporales))

    def test_rotacion_conserva_siete(self):
        for i in range(8):
            self.ssh.remotos["/home/magga/StarSeed-almacen/respaldos/mac/repo-2026-01-%02d.bundle" % (i + 1)] = {}
        resultado = self._respaldar(libre_fn=lambda: 0.0)
        fase = [d for d in resultado["detalles"] if d.get("fase") == "rotar_bundles"][0]
        self.assertEqual(len(fase["borrados"]), 1)


class TestAliviar(unittest.TestCase):
    """`aliviar` mide candidatos reales, dice por qué y nunca borra sin copia."""

    def setUp(self):
        self.ssh = SSHSimulado()
        self.fs = FSReal()
        self.home = self.fs.dir("home")
        self.temp = self.fs.dir("temp")
        self.repo = self.fs.dir("repo")
        self.memory = self.fs.dir("repo", "starseed_memory_root")
        self.logs = self.fs.dir("repo", "starseed_memory_root", "olas", "logs")
        self.wt = self.fs.dir("worktrees")
        self.indice = os.path.join(self.memory, "nodo", "indice-pesados-maggabox.md")
        # candidatos
        self.go_viejo = self.fs.dir("temp", "go-build-viejo")
        self.fs.archivo("temp", "go-build-viejo", "x", edad_s=2 * 3600)
        self.go_nuevo = self.fs.dir("temp", "go-build-nuevo")
        self.fs.archivo("temp", "go-build-nuevo", "x", edad_s=10 * 60)
        self.go_cache = self.fs.dir("home", "Library", "Caches", "go-build")
        self.fs.archivo("home", "Library", "Caches", "go-build", "x")
        self.shipit = self.fs.dir("home", "Library", "Caches", "ShipIt-viejo")
        self.fs.archivo("home", "Library", "Caches", "ShipIt-viejo", "x", edad_s=2 * 86400)
        self.drive_tmp = self.fs.dir("home", "Library", "Application Support", "Google", "DriveFS", ".tmp.driveupload", "trozo")
        self.fs.archivo("home", "Library", "Application Support", "Google", "DriveFS", ".tmp.driveupload", "trozo", "x", edad_s=2 * 86400)
        self.fs.dir("repo", ".next")
        self.fs.archivo("repo", ".next", "BUILD_ID", contenido="abc", edad_s=2 * 3600)
        self.fs.archivo("repo", ".next", "build-manifest.json", contenido="{}", edad_s=2 * 3600)
        self.fs.dir("repo", ".next-anterior")
        self.fs.archivo("repo", ".next-anterior", "BUILD_ID", contenido="old")
        self.log_viejo = self.fs.archivo("repo", "starseed_memory_root", "olas", "logs", "ola-vieja.log", contenido="x" * 100, edad_s=8 * 86400)
        self.fs.archivo("repo", "starseed_memory_root", "olas", "logs", "ola-nueva.log", contenido="x", edad_s=3600)
        self.wt_vieja = self.fs.dir("worktrees", "starseed-wt-vieja")
        self.fs.archivo("worktrees", "starseed-wt-vieja", "x")
        self.fs.archivo("home", "Downloads", "StarSeed-prueba-4.dmg", contenido="x", edad_s=2 * 86400)
        self.fs.archivo("repo", "MetaGenesis", "instaladores", "canal-pruebas", "prueba-4", "_publicacion.json",
                        contenido='{"prueba": 4}')

    def tearDown(self):
        self.fs.limpiar()

    def _aliviar(self, **extra: Any) -> Dict[str, Any]:
        datos = dict(ssh_fn=self.ssh, mac_root=self.repo, wt_root=self.wt,
                     destino_base=DEST_BASE, objetivo_gb=12.0, seco=False,
                     guardar_log=lambda _r: None, cola_activa_ids=set(),
                     home=self.home, temp_dirs=[self.temp], ahora=time.time(),
                     indice_path=self.indice, archivar_fn=lambda *a, **k: {"ok": True, "detalle": "archivados"},
                     notificar_fn=lambda *a, **k: None,
                     worktrees_terminados_fn=lambda _raiz, _wt: ["starseed-wt-vieja"])
        datos.update(extra)
        return R.aliviar(**datos)

    def test_seco_lista_candidatos_con_mb_y_motivo(self):
        resultado = self._aliviar(seco=True, objetivo_gb=999.0)
        self.assertEqual(resultado["estado"], "seco")
        tipos = {c["tipo"] for c in resultado["candidatos"]}
        for esperado in ("go-build", "go-cache", "shipit", "tmp-drive", "next-anterior", "olas-logs", "worktrees", "instalador-prueba"):
            self.assertIn(esperado, tipos)
        for c in resultado["candidatos"]:
            self.assertGreaterEqual(c["mb"], 0)
            self.assertTrue(c["motivo"])
        nombres = {os.path.basename(c["ruta"]) for c in resultado["candidatos"]}
        self.assertIn("go-build-viejo", nombres)
        self.assertNotIn("go-build-nuevo", nombres)

    def test_no_toca_secretos_ni_worktree_en_cola(self):
        self.fs.archivo("home", ".starseed", "env", contenido="CLAVE=1")
        resultado = self._aliviar(seco=True, objetivo_gb=999.0,
                                  cola_activa_ids={"starseed-wt-vieja"})
        for c in resultado["candidatos"]:
            self.assertNotIn(".starseed/env", c["ruta"])
        self.assertNotIn("worktrees", {c["tipo"] for c in resultado["candidatos"]})

    def test_mueve_logs_con_remove_source_files(self):
        self.ssh.remotos[self.logs] = {"size_kb": 1, "entradas": 2}
        resultado = self._aliviar(libre_fn=lambda: 5.0)
        self.assertIn(resultado["estado"], ("hecho", "parcial"))
        logs = [c for c in self.ssh.llamadas if c[0] == "rsync" and "--remove-source-files" in c]
        self.assertTrue(logs, "no se usó rsync --remove-source-files para los registros de olas")
        self.assertTrue(any("olas-logs" in " ".join(c) for c in logs))

    def test_cada_movimiento_queda_en_el_indice(self):
        self.ssh.remotos[self.logs] = {"size_kb": 1, "entradas": 2}
        self._aliviar(libre_fn=lambda: 5.0)
        self.assertTrue(os.path.isfile(self.indice))
        with open(self.indice, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("ola-vieja.log", texto)
        self.assertIn("olas-logs", texto)

    def test_si_hay_espacio_no_mueve_nada(self):
        resultado = self._aliviar(libre_fn=lambda: 30.0)
        self.assertEqual(resultado["estado"], "suficiente_espacio")
        self.assertFalse([c for c in self.ssh.llamadas if c[0] == "rsync"])


class TestEstado(unittest.TestCase):
    """`estado` enseña lo medido y lo movido, sin inventar."""

    def test_estado_incluye_movido_e_indice(self):
        ssh = SSHSimulado()
        ssh.remotos["/home/magga/StarSeed-almacen/respaldos/mac/repo-2026-01-01.bundle"] = {"size_kb": 1024}
        ssh.remotos["/home/magga/StarSeed-almacen/respaldos/mac/starseed_memory_root"] = {"size_kb": 2048}
        ssh.remotos["/home/magga/StarSeed-almacen/respaldos/mac/respaldos.log"] = {"size_kb": 1}
        estado = R.estado(ssh_fn=ssh, mac_root=MAC_ROOT, destino_base=DEST_BASE,
                          movido_gb=3.5, indice="/x/indice.md")
        self.assertEqual(estado["destino"]["log_existe"], True)
        self.assertEqual(estado["movido_gb"], 3.5)
        self.assertEqual(estado["indice"], "/x/indice.md")
        self.assertEqual(len(estado["ultimos_bundles"]), 1)


class TestPlistLaunchd(unittest.TestCase):
    """El plist real existe, corre cada 6 h y no lleva claves."""

    def setUp(self):
        self.ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                                 "deploy", "launchd", "com.starseed.respaldo-maggabox.plist")

    def test_plist_cada_6h(self):
        self.assertTrue(os.path.isfile(self.ruta), "falta deploy/launchd/com.starseed.respaldo-maggabox.plist")
        with open(self.ruta, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("com.starseed.respaldo-maggabox", texto)
        self.assertIn("respaldar", texto)
        self.assertIn("<integer>21600</integer>", texto)
        self.assertIn("RunAtLoad", texto)

    def test_docstring_tiene_plist(self):
        self.assertIn("launchd", R.__doc__ or "")
        self.assertIn("StartInterval", R.__doc__ or "")
        self.assertIn("21600", R.__doc__ or "")


if __name__ == "__main__":
    unittest.main()
