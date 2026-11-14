#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Token maestro de NotebookLM, con aprobación (SES1113D · §3.5).

`arrancar notebooklm` no hace nada mientras `salud/aprobaciones.json` no tenga
`notebooklm_master_token: true`. Con la aprobación, en la Mac abre el inicio de
sesión en un perfil dedicado y, cuando Maggasukha termina, lleva al A1 SOLO los
archivos del perfil (token maestro, android_id y storage_state) por el canal de
claves, con 600 y dueño starseed, y verifica con `auth refresh --verify`.

El inicio de sesión lo hace una persona: ningún agente teclea contraseñas.
Nunca se imprime ni se registra el token; nunca va al repo, a Drive, a Supabase
ni a Telegram. Toda la E/S es inyectable para probar sin red.
"""
from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tarfile
from pathlib import Path
from typing import Any, Callable

CUENTA = "alexbordongarrigos@gmail.com"
PERFIL = "starseed-master"
APROBACION = "notebooklm_master_token"
DESTINO_A1 = "/home/starseed/.notebooklm/profiles/default"
VENV_A1 = "/home/starseed/.starseed/venvs/notebooklm"
CLI_MAC = "/Users/alex/bin/notebooklm"
RAIZ_DEF = Path(__file__).resolve().parents[2]
#: Solo estos artefactos del perfil viajan: ni cookies de Chrome ni caché del navegador.
PREFIJOS = ("master_token", "android_id", "storage_state")

Ejecutar = Callable[[list[str], int], tuple[int, str]]


def ruta_aprobaciones(raiz: Path | None = None) -> Path:
    """La marca que pone Maggasukha: starseed_memory_root/salud/aprobaciones.json."""
    return (Path(raiz) if raiz else RAIZ_DEF) / "starseed_memory_root" / "salud" / "aprobaciones.json"


def _leer_json(ruta: Path, defecto: Any) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def tiene_aprobacion(ruta: Path) -> bool:
    """PURA. Solo el booleano JSON `true` aprueba; cualquier otra cosa no es aprobación."""
    datos = _leer_json(Path(ruta), {})
    return isinstance(datos, dict) and datos.get(APROBACION) is True


def perfil_dir(perfil: str = PERFIL, home: Path | None = None) -> Path:
    """El perfil DEDICADO del inicio de sesión maestro: no se mezcla con `default`."""
    return (Path(home) if home else Path.home()) / ".notebooklm" / "profiles" / perfil


def _es_del_perfil(nombre: str) -> bool:
    if nombre.startswith(".") or nombre.endswith(".tmp"):
        return False
    if ".buena-" in nombre or ".rota-" in nombre:
        return False
    return any(nombre == p or nombre.startswith(p + ".") for p in PREFIJOS)


def archivos_del_perfil(dir_perfil: Path) -> list[Path]:
    """PURA. Token maestro + android_id + storage_state; nada más, y nada de enlaces."""
    try:
        entradas = sorted(Path(dir_perfil).iterdir())
    except OSError:
        return []
    return [p for p in entradas if _es_del_perfil(p.name) and p.is_file() and not p.is_symlink()]


def buscar_cli() -> str | None:
    """El CLI con el extra headless: primero el venv, luego el de la Mac y luego el PATH."""
    import shutil

    venv = Path.home() / ".starseed" / "venvs" / "notebooklm" / "bin" / "notebooklm"
    if venv.is_file() and os.access(venv, os.X_OK):
        return str(venv)
    if Path(CLI_MAC).is_file() and os.access(CLI_MAC, os.X_OK):
        return CLI_MAC
    return shutil.which("notebooklm")


def comando_login(binario: str, perfil: str = PERFIL) -> list[str]:
    """PURA. El comando de §3.5 en el perfil dedicado (`-p` es una opción global del CLI)."""
    return [binario, "-p", perfil, "login", "--master-token",
            "--account", CUENTA, "--browser", "chrome"]


def comando_verificar(venv: str = VENV_A1) -> str:
    """PURA. La orden que corre en el A1: el perfil de destino es `default`."""
    return "%s/bin/notebooklm auth refresh --verify" % venv


def _restringir(dir_perfil: Path) -> list[Path]:
    """El perfil local queda 700 y sus artefactos 600, también si el CLI los creó flojos."""
    try:
        dir_perfil.chmod(0o700)
    except OSError:
        pass
    archivos = archivos_del_perfil(dir_perfil)
    for archivo in archivos:
        try:
            archivo.chmod(0o600)
        except OSError:
            pass
    return archivos


def _ejecutar(argv: list[str], timeout: int = 600) -> tuple[int, str]:
    """Una llamada al CLI; con umask 077 para que lo que escriba nazca privado."""
    anterior = os.umask(0o077)
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)
    finally:
        os.umask(anterior)


def empaquetar(archivos: list[Path]) -> bytes:
    """PURA. Un tgz en memoria con solo esos archivos, cada uno a 600 y dueño starseed."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for archivo in archivos:
            info = tar.gettarinfo(str(archivo), arcname=archivo.name)
            info.mode = 0o600
            info.uname, info.gname = "starseed", "starseed"
            with open(archivo, "rb") as f:
                tar.addfile(info, f)
    return buffer.getvalue()


def guion_despliegue(destino: str = DESTINO_A1) -> str:
    """PURA. Deja el perfil en el A1: carpeta 700, archivos 600, dueño starseed."""
    return ("set -e; trap 'rm -f /tmp/starseed-notebooklm-master.tgz' EXIT; "
            "sudo install -d -o starseed -g starseed -m 700 %(d)s; "
            "sudo tar xzf /tmp/starseed-notebooklm-master.tgz -C %(d)s 2>/dev/null; "
            "sudo chown -R starseed:starseed %(d)s 2>/dev/null; "
            "sudo find %(d)s -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null; "
            "sudo chmod 700 %(d)s; echo notebooklm-master-ok" % {"d": destino})


def _ssh(orden: str, datos: bytes | None = None, timeout: int = 300) -> tuple[int, str]:
    """El canal de claves: el mismo túnel SSH de `oracle_nodo`, sin imprimir IP ni salida."""
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        import oracle_nodo as on

        ip = on._ip()
        if not ip:
            return 2, ""
        r = subprocess.run(on._ssh_base() + ["%s@%s" % (on.USUARIO_SSH, ip), orden],
                           input=datos, capture_output=True, timeout=timeout)
        return r.returncode, (r.stdout or b"").decode(errors="replace")
    except Exception:  # noqa: BLE001
        return 1, ""


def _enviar_a1(dir_perfil: Path, destino: str = DESTINO_A1) -> dict[str, Any]:
    """Copia al A1 solo los archivos del perfil, por el canal de claves."""
    archivos = _restringir(dir_perfil)
    if not archivos:
        return {"ok": False, "archivos": 0,
                "motivo": "el perfil no tiene token maestro, android_id ni storage_state"}
    rc, _ = _ssh("umask 077; cat > /tmp/starseed-notebooklm-master.tgz", empaquetar(archivos))
    salida = ""
    if rc == 0:
        rc, salida = _ssh(guion_despliegue(destino), timeout=120)
    ok = rc == 0 and "notebooklm-master-ok" in salida
    return {"ok": ok, "archivos": len(archivos),
            "motivo": "" if ok else "el canal de claves no dejó el perfil en el A1"}


def _verificar_a1() -> dict[str, Any]:
    rc, _ = _ssh(comando_verificar(), timeout=120)
    return {"ok": rc == 0, "motivo": "" if rc == 0 else "auth refresh --verify falló en el A1"}


def arrancar(
    sesion: str = "notebooklm",
    *,
    raiz: Path | None = None,
    aprobaciones: Path | None = None,
    ejecutar: Ejecutar | None = None,
    enviar: Callable[[Path], dict[str, Any]] | None = None,
    verificar: Callable[[], dict[str, Any]] | None = None,
    buscar: Callable[[], str | None] | None = None,
    home: Path | None = None,
    log: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Abre el login maestro en la Mac y lleva el perfil al A1, solo con aprobación."""
    if sesion != "notebooklm":
        return {"ok": False, "aprobado": False, "motivo": "sesión no soportada: %s" % sesion}
    ruta = Path(aprobaciones) if aprobaciones else ruta_aprobaciones(raiz)
    if not tiene_aprobacion(ruta):
        return {"ok": False, "aprobado": False,
                "motivo": "sin aprobación notebooklm_master_token=true: no se hace nada"}
    binario = (buscar or buscar_cli)()
    if not binario:
        return {"ok": False, "aprobado": True, "motivo": "no hay CLI de notebooklm con el extra headless"}
    dir_perfil = perfil_dir(PERFIL, home)
    try:
        dir_perfil.mkdir(parents=True, exist_ok=True)
        dir_perfil.chmod(0o700)
    except OSError:
        return {"ok": False, "aprobado": True, "motivo": "no se pudo preparar el perfil dedicado"}
    codigo, _ = (ejecutar or _ejecutar)(comando_login(binario, PERFIL), 600)
    if codigo != 0:  # nunca se devuelve la salida: podría nombrar secretos
        return {"ok": False, "aprobado": True,
                "motivo": "el inicio de sesión maestro falló (código %d)" % codigo}
    if not _restringir(dir_perfil):
        return {"ok": False, "aprobado": True,
                "motivo": "el perfil dedicado no tiene token maestro, android_id ni storage_state"}
    envio = (enviar or _enviar_a1)(dir_perfil)
    if not envio.get("ok"):
        return {"ok": False, "aprobado": True, "motivo": "el canal de claves falló"}
    ver = (verificar or _verificar_a1)()
    if not ver.get("ok"):
        return {"ok": False, "aprobado": True,
                "motivo": "auth refresh --verify falló en el A1"}
    archivos = int(envio.get("archivos") or 0)
    if log:
        log({"evento": "arrancar", "sesion": sesion, "ok": True, "archivos": archivos})
    return {"ok": True, "aprobado": True,
            "detalle": "token maestro en el A1 (%d archivos del perfil)" % archivos}


def main(argv: list[str] | None = None, salida=None, **deps) -> int:
    argv = list(argv) if argv is not None else sys.argv[1:]
    salida = salida or sys.stdout
    if not argv or argv[0] in ("-h", "--help"):
        salida.write("Uso: python3 sanador_token.py arrancar notebooklm\n")
        return 0
    if argv[0] != "arrancar":
        salida.write("Comando desconocido: %s\n" % argv[0])
        return 2
    r = arrancar(argv[1] if len(argv) > 1 else "notebooklm", **deps)
    if r.get("ok"):
        salida.write("✓ %s\n" % r.get("detalle", "ok"))
        return 0
    if r.get("aprobado") is False:
        salida.write("· sin aprobación: no se hace nada\n")
        return 0
    salida.write("✗ %s\n" % r.get("motivo", "error"))
    return 1


if __name__ == "__main__":
    sys.exit(main())
