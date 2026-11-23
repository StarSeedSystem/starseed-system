#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Respaldo y alivio automáticos de la Mac hacia la Maggabox (ALM1121A).

Órdenes: `plan`, `respaldar [--seco]`, `aliviar [--seco] [--objetivo-gb 12]`, `estado`.

Conexión SSH (nunca claves en el repo; solo el nombre del archivo):
    ssh -i ~/.ssh/starseed_nodo1 -o IdentitiesOnly=yes -o BatchMode=yes
    -o ConnectTimeout=8 -o UserKnownHostsFile=$HOME/.ssh/known_hosts_starseed_nodo
    maggasukha@starseed-nodo-1.local

Destino: ~/StarSeed-almacen/

`respaldar`:
  - rsync de starseed_memory_root a respaldos/mac/starseed_memory_root, excluyendo
    `.tmp.drive*` (los 2 GB de restos de Google Drive) y todo lo secreto.
  - git bundle SOLO si quedan más de 6 GB libres: se crea en una carpeta temporal
    LOCAL (git no entiende `~` remoto), se envía por scp, se comprueba su SHA-256 en
    la Maggabox y solo entonces se borra el temporal. Si no hay espacio, se salta y
    se dice: el espejo de GitHub del Maggabox ya cubre el código.
  - rotación de 7 bundles y registro en respaldos/mac/respaldos.log.

`aliviar`: lista REAL y medida de candidatos con su porqué y sus MB:
  - restos `go-build*` de más de 1 h, caché de Go, restos `ShipIt` de más de 1 día,
    trozos `.tmp.driveupload` de más de 24 h, worktrees terminados (vía
    `archivar_worktrees.py`), registros de olas de más de 7 días (se MUEVEN a
    pesados/mac/olas-logs con `rsync --remove-source-files`), `.next-anterior` cuando
    la compilación actual lleva más de 1 h sana, e instaladores de versiones de prueba
    ya publicadas en Descargas. `--seco` enseña cada candidato con sus MB.
  Nunca toca cuentas, claves, bases de datos vivas ni proyectos en uso. Cada
  movimiento queda en el índice `starseed_memory_root/nodo/indice-pesados-maggabox.md`.
  Si el disco libre baja de 12 GB, el respaldo automático también alivia y avisa en
  el canal General de lo ganado.

Plist launchd (cada 6 h = 21600 s): `deploy/launchd/com.starseed.respaldo-maggabox.plist`
corre `respaldar` y `aliviar`; el alivio es inocuo si hay más de 12 GB libres.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

# Rutas base (STARSEED_ROOT permite probar sin tocar la Mac real)
MAC_ROOT = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
STARSEED_MEMORY_ROOT = os.path.join(MAC_ROOT, "starseed_memory_root")
WT_ROOT = os.environ.get("STARSEED_WT") or os.path.expanduser("~/Documents/starseed-wt")
DEST_HOST = "maggasukha@starseed-nodo-1.local"
DEST_BASE = "~/StarSeed-almacen"
RUTA_INDICE = os.path.join(STARSEED_MEMORY_ROOT, "nodo", "indice-pesados-maggabox.md")
RUTA_ESTADO_LOCAL = os.path.expanduser("~/.starseed/respaldo-maggabox.json")

# Umbrales de la tarea (PURA)
UMBRAL_BUNDLE_GB = 6.0
UMBRAL_ALIVIO_GB = 12.0
CONSERVAR_BUNDLES = 7
HORAS_GO = 1
HORAS_SHIPIT = 24
HORAS_DRIVE_TMP = 24
HORAS_NEXT_SANO = 1
DIAS_OLAS = 7

# SSH base command
SSH_BASE = [
    "ssh",
    "-i", os.path.expanduser("~/.ssh/starseed_nodo1"),
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", f"UserKnownHostsFile={os.path.expanduser('~/.ssh/known_hosts_starseed_nodo')}",
    DEST_HOST,
]

# Exclusiones de secretos (PURA)
EXCLUIR_SECRETOS = [
    "~/.starseed/env",
    ".env*",
    "~/.ssh",
    "*.pem",
    "*key*",
    "*secret*",
    "*credential*",
    "*token*",
]

# Exclusiones del memory root: lo secreto y los temporales de Drive (PURA)
EXCLUIR_MEMORIA = [
    ".tmp.drive*",
    ".tmp.drivedownload*",
    ".tmp.driveupload*",
] + EXCLUIR_SECRETOS

# Lista blanca de aliviar: lo que SÍ se puede mover (PURA)
ALIVIAR_BLANCA = [
    ".next/cache",
    ".next-anterior",
    "node_modules/.cache",
    "go-build",
    "Library/Caches/go-build",
    ".cache/go-build",
    "ShipIt",
    ".tmp.driveupload",
    "ola-",
]

# Lista negra de aliviar: lo que NUNCA se toca (PURA)
ALIVIAR_NEGRA = [
    "~/.starseed/env",
    "~/.starseed/state.db",
    "~/.starseed/state-snapshots",
    ".env",
    "~/.ssh",
    "*.pem",
    "*key*",
    "*secret*",
    "*credential*",
    "*token*",
    "starseed_memory_root",
    ".git",
    "CloudStorage",
    "Library/Application Support/Google/DriveFS",
]


def excluir_secretos() -> List[str]:
    """PURA: patrones de exclusión para rsync/tar/restic."""
    return list(EXCLUIR_SECRETOS)


def exclusiones_memoria() -> List[str]:
    """PURA: lo secreto + los temporales de Google Drive (`.tmp.drive*`)."""
    return list(EXCLUIR_MEMORIA)


def _rsync_args(origen: str, destino: str, exclusiones: List[str], borrar: bool = True) -> List[str]:
    """PURA: argv de rsync con exclusiones; `borrar` añade --delete al espejo."""
    args = ["rsync", "-az", "--info=progress2"]
    if borrar:
        args.append("--delete")
    for ex in exclusiones:
        args.extend(["--exclude", ex])
    args.extend([origen.rstrip("/") + "/", destino.rstrip("/") + "/"])
    return args


def _rsync_remove_source_args(origen: str, destino: str, exclusiones: List[str]) -> List[str]:
    """PURA: rsync de archivos sueltos que retira el origen solo tras copiarlo."""
    args = ["rsync", "-a", "--remove-source-files", "--info=progress2"]
    for ex in exclusiones:
        args.extend(["--exclude", ex])
    args.extend([origen, destino.rstrip("/") + "/"])
    return args


def _tar_local_args(origen: str, destino_tar: str, exclusiones: List[str]) -> List[str]:
    """PURA: empaqueta en un tar LOCAL; luego se envía por scp (sin tuberías)."""
    args = ["tar", "czf", destino_tar]
    for ex in exclusiones:
        args.extend(["--exclude", ex])
    args.extend(["-C", os.path.dirname(origen), os.path.basename(origen)])
    return args


def _git_bundle_args(repo: str, destino: str) -> List[str]:
    """PURA: argv para git bundle create --all (destino LOCAL, nunca una ruta remota)."""
    return ["git", "-C", repo, "bundle", "create", destino, "--all"]


def decidir_bundle(libre_gb: float, umbral_gb: float = UMBRAL_BUNDLE_GB) -> Tuple[bool, str]:
    """PURA: solo se crea el bundle si quedan más GB libres que el umbral."""
    if libre_gb > umbral_gb:
        return True, "hay %.1f GB libres (> %.1f GB)" % (libre_gb, umbral_gb)
    return False, (
        "quedan %.1f GB libres (mínimo %.1f GB): se salta el bundle; "
        "el espejo de GitHub del Maggabox ya cubre el código" % (libre_gb, umbral_gb)
    )


def rotacion_a_borrar(bundles: List[str], conservar: int = CONSERVAR_BUNDLES) -> List[str]:
    """PURA: de una lista ordenada (nuevo→viejo), qué bundles sobran."""
    return list(bundles[conservar:]) if len(bundles) > conservar else []


def sha256_archivo(ruta: str) -> str:
    """SHA-256 de un archivo local, en hexadecimal (vacío si no se puede leer)."""
    h = hashlib.sha256()
    try:
        with open(ruta, "rb") as f:
            for bloque in iter(lambda: f.read(1024 * 1024), b""):
                h.update(bloque)
        return h.hexdigest()
    except OSError:
        return ""


def version_en_nombre(nombre: str) -> Optional[str]:
    """PURA: `StarSeed-1.2.3-prueba.4.dmg` → `1.2.3-prueba.4` (o None)."""
    m = re.search(r"(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)", nombre or "")
    return m.group(1) if m else None


def es_instalador_publicado(nombre: str, publicadas: Set[str]) -> bool:
    """PURA: instalador de una versión de prueba que YA se publicó."""
    if not re.search(r"\.(dmg|pkg|zip|exe|msi|AppImage)$", nombre or "", re.I):
        return False
    v = version_en_nombre(nombre)
    return bool(v and v in publicadas)


def formatear_candidato(c: Dict[str, Any]) -> str:
    """PURA: una línea de `--seco` con los MB y el porqué del candidato."""
    return "%-8s %8.1f MB  %-42s  %s" % (
        c.get("tipo", "?"),
        float(c.get("mb", 0.0)),
        c.get("ruta", "?"),
        c.get("motivo", ""),
    )


def resumen_alivio(resultado: Dict[str, Any]) -> str:
    """PURA: frase para el canal General con lo ganado de verdad."""
    if resultado.get("estado") == "seco":
        return "Alivio en seco: %d candidatos, %.1f MB medidos." % (
            len(resultado.get("candidatos", [])),
            sum(float(c.get("mb", 0.0)) for c in resultado.get("candidatos", [])),
        )
    return "Alivio del Mac: %.2f GB liberados (de %.2f a %.2f GB libres)." % (
        float(resultado.get("liberado_gb", 0.0)),
        float(resultado.get("libre_gb_inicial", 0.0)),
        float(resultado.get("libre_gb_final", resultado.get("libre_gb_inicial", 0.0))),
    )


def _ssh_mkdir(destino: str) -> List[str]:
    """PURA: mkdir -p remoto."""
    return SSH_BASE + ["mkdir", "-p", destino]


def _ssh_ls_bundles(destino: str) -> List[str]:
    """PURA: lista bundles remotos ordenados."""
    return SSH_BASE + ["ls", "-1t", f"{destino}/repo-*.bundle"]


def _ssh_rm(destino: str) -> List[str]:
    """PURA: borra archivo remoto."""
    return SSH_BASE + ["rm", "-f", destino]


def _ssh_du(destino: str) -> List[str]:
    """PURA: du -sk remoto."""
    return SSH_BASE + ["du", "-sk", destino]


def _ssh_test_e(destino: str) -> List[str]:
    """PURA: test -e remoto."""
    return SSH_BASE + ["test", "-e", destino]


def _ssh_cat_log(log_ruta: str, linea: str) -> List[str]:
    """PURA: añade línea al log remoto."""
    # Usar printf para evitar problemas de comillas
    return SSH_BASE + ["bash", "-c", f'printf "%s\\n" "{linea}" >> {log_ruta}']


def _ssh_sha256(ruta: str) -> List[str]:
    """PURA: SHA-256 remoto con `sha256sum` (la Maggabox es Linux)."""
    return SSH_BASE + ["sha256sum", ruta]


def _scp_args(local: str, remoto: str) -> List[str]:
    """PURA: argv de scp con la misma identidad que SSH_BASE."""
    return [
        "scp",
        "-i", os.path.expanduser("~/.ssh/starseed_nodo1"),
        "-o", "IdentitiesOnly=yes",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=8",
        "-o", f"UserKnownHostsFile={os.path.expanduser('~/.ssh/known_hosts_starseed_nodo')}",
        local,
        f"{DEST_HOST}:{remoto}",
    ]


def _ssh_find_count(ruta: str) -> List[str]:
    """PURA: cuenta entradas remotas (una por línea, sin `-printf` de GNU)."""
    return SSH_BASE + ["bash", "-c", "find %s | wc -l" % ruta]


def _disco_libre_gb(disco_fn: Optional[Callable[[str], Tuple[int, int, int]]] = None) -> float:
    """GB libres en la raíz; `disco_fn` se inyecta en pruebas."""
    try:
        _, _, libre = (disco_fn or shutil.disk_usage)("/")
        return libre / (1024 ** 3)
    except Exception:
        return 0.0


def _leer_estado_local(ruta: str = RUTA_ESTADO_LOCAL) -> Dict[str, Any]:
    """Lee el estado local del respaldo/alivio; nunca revienta si falta."""
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else {}
    except Exception:
        return {}


def _guardar_estado_local(datos: Dict[str, Any], ruta: str = RUTA_ESTADO_LOCAL) -> bool:
    """Escribe el estado local de forma atómica (tmp + replace)."""
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta + ".tmp", "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1, sort_keys=True)
        os.replace(ruta + ".tmp", ruta)
        return True
    except OSError:
        return False


def _anotar_indice(
    movidos: List[Dict[str, Any]],
    cuando: str,
    ruta: str = RUTA_INDICE,
) -> bool:
    """Añade una fila por movimiento al índice de pesados (markdown)."""
    if not movidos:
        return True
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        nuevo = not os.path.exists(ruta)
        with open(ruta, "a", encoding="utf-8") as f:
            if nuevo:
                f.write("# Índice de pesados movidos a la Maggabox\n\n")
                f.write("| fecha | ruta en la Mac | MB | destino | porqué |\n")
                f.write("|---|---|---:|---|---|\n")
            for m in movidos:
                f.write(
                    "| %s | %s | %.1f | %s | %s |\n"
                    % (
                        cuando,
                        m.get("origen", ""),
                        float(m.get("mb", 0.0)),
                        m.get("destino", ""),
                        m.get("motivo", ""),
                    )
                )
        return True
    except OSError:
        return False


def _avisar_canal_general(texto: str, avisar_fn: Optional[Callable[[str], Any]] = None) -> bool:
    """Avisa en el canal General; en pruebas se inyecta `avisar_fn`."""
    if avisar_fn is not None:
        try:
            avisar_fn(texto)
            return True
        except Exception:
            return False
    try:
        if shutil.which("starseed-puente"):
            r = subprocess.run(
                ["starseed-puente", "decir", texto, "--de", "respaldo", "--tipo", "hecho"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            return r.returncode == 0
    except Exception:
        pass
    return False


def _ejecutar(argv: List[str], ejecutar: Callable[..., Any], tope_s: float = 300.0) -> Dict[str, Any]:
    """Ejecuta subprocess con timeout; devuelve dict con codigo, salida, error."""
    try:
        r = ejecutar(argv, capture_output=True, text=True, timeout=tope_s)
        return {
            "codigo": r.returncode,
            "salida": (r.stdout or "").strip(),
            "error": (r.stderr or "").strip(),
        }
    except subprocess.TimeoutExpired:
        return {"codigo": None, "salida": "", "error": "timeout"}
    except OSError as e:
        return {"codigo": None, "salida": "", "error": str(e)}


def _hay_rsync_remoto(ejecutar: Callable[..., Any]) -> bool:
    """Comprueba si el destino tiene rsync."""
    r = _ejecutar(SSH_BASE + ["rsync", "--version"], ejecutar, tope_s=10.0)
    return r["codigo"] == 0


def _listar_bundles_remotos(ejecutar: Callable[..., Any], destino_base: str) -> List[str]:
    """Lista bundles remotos ordenados por fecha (más nuevo primero)."""
    destino = os.path.join(destino_base, "respaldos/mac")
    r = _ejecutar(_ssh_ls_bundles(destino), ejecutar, tope_s=30.0)
    if r["codigo"] != 0:
        return []
    lineas = [l.strip() for l in r["salida"].splitlines() if l.strip()]
    # Filtrar solo los que coinciden con repo-YYYY-MM-DD.bundle
    bundles = [l for l in lineas if l.startswith("repo-") and l.endswith(".bundle")]
    # Ordenar por nombre (fecha) descendente
    bundles.sort(reverse=True)
    # Devolver rutas completas
    return [os.path.join(destino, b) for b in bundles]


def _rotar_bundles(ejecutar: Callable[..., Any], destino_base: str, conservar: int = 7) -> List[str]:
    """Borra bundles antiguos manteniendo los `conservar` más nuevos. Devuelve lista de borrados."""
    bundles = _listar_bundles_remotos(ejecutar, destino_base)
    if len(bundles) <= conservar:
        return []
    a_borrar = bundles[conservar:]
    borrados = []
    for b in a_borrar:
        r = _ejecutar(_ssh_rm(b), ejecutar, tope_s=30.0)
        if r["codigo"] == 0:
            borrados.append(b)
    return borrados


def _escribir_log_remoto(ejecutar: Callable[..., Any], destino_base: str, linea: str) -> bool:
    """Escribe una línea en respaldos/mac/respaldos.log."""
    log_ruta = os.path.join(destino_base, "respaldos/mac/respaldos.log")
    r = _ejecutar(_ssh_cat_log(log_ruta, linea), ejecutar, tope_s=10.0)
    return r["codigo"] == 0


def _verificar_sha256_remoto(ejecutar: Callable[..., Any], ruta_remota: str, esperado: str) -> bool:
    """Compara la suma remota con la local; si no hay suma, no se da por buena."""
    if not esperado:
        return False
    r = _ejecutar(_ssh_sha256(ruta_remota), ejecutar, tope_s=120.0)
    if r["codigo"] != 0 or not r["salida"]:
        return False
    return r["salida"].split()[0].strip().lower() == esperado.strip().lower()


def _tamano_mb(ruta: str, du_fn: Optional[Callable[[str], int]] = None) -> float:
    """MB (no KB) de una ruta; 0.0 si no se puede medir."""
    return round(_tamano_directorio(ruta, du_fn) / 1024.0, 1)


def _tamano_directorio(ruta: str, du_fn: Optional[Callable[[str], int]] = None) -> int:
    """PURA con du inyectado: tamaño en KB de un directorio/archivo."""
    if du_fn:
        return du_fn(ruta)
    try:
        return int(subprocess.run(["du", "-sk", ruta], capture_output=True, text=True, timeout=60).stdout.split()[0])
    except Exception:
        return 0


def _contar_entradas(ruta: str, find_fn: Optional[Callable[[str], List[str]]] = None) -> int:
    """PURA con find inyectado: número de entradas (archivos + dirs) en un árbol."""
    if find_fn:
        return len(find_fn(ruta))
    try:
        r = subprocess.run(["find", ruta], capture_output=True, text=True, timeout=60)
        return len(r.stdout.splitlines()) if r.returncode == 0 else 0
    except Exception:
        return 0


def plan(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    memory_root: str = STARSEED_MEMORY_ROOT,
    destino_base: str = DEST_BASE,
    seco: bool = True,
    disco_fn: Optional[Callable[[str], Tuple[int, int, int]]] = None,
    du_fn: Optional[Callable[[str], int]] = None,
) -> Dict[str, Any]:
    """PURA: decide qué se respaldaría y qué se rotaría, sin ejecutar."""
    exclusiones = exclusiones_memoria()
    ahora = dt.datetime.now().strftime("%Y-%m-%d")
    libre_gb = _disco_libre_gb(disco_fn)
    crear_bundle, motivo_bundle = decidir_bundle(libre_gb)

    respaldar: List[Dict[str, Any]] = [
        {
            "accion": "rsync_o_tar",
            "origen": memory_root,
            "destino": os.path.join(destino_base, "respaldos/mac/starseed_memory_root"),
            "exclusiones": exclusiones,
            "tamano_aprox_mb": _tamano_mb(memory_root, du_fn),
        }
    ]
    if crear_bundle:
        respaldar.append(
            {
                "accion": "git_bundle",
                "origen": mac_root,
                "destino": os.path.join(destino_base, f"respaldos/mac/repo-{ahora}.bundle"),
                "motivo": motivo_bundle,
                "libre_gb": round(libre_gb, 1),
            }
        )
    else:
        respaldar.append(
            {"accion": "git_bundle_saltado", "motivo": motivo_bundle, "libre_gb": round(libre_gb, 1)}
        )

    bundles = _listar_bundles_remotos(ssh_fn, destino_base)
    for b in rotacion_a_borrar(bundles, CONSERVAR_BUNDLES):
        respaldar.append({"accion": "borrar_bundle_antiguo", "ruta": b})

    return {
        "generado": time.time(),
        "seco": seco,
        "libre_gb": round(libre_gb, 1),
        "respaldar": respaldar,
        "bundles_existentes": len(bundles),
    }


def respaldar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    memory_root: str = STARSEED_MEMORY_ROOT,
    destino_base: str = DEST_BASE,
    seco: bool = False,
    guardar_log: Optional[Callable[[Dict[str, Any]], Any]] = None,
    disco_fn: Optional[Callable[[str], Tuple[int, int, int]]] = None,
    ejecutar_local: Optional[Callable[..., Any]] = None,
    scp_fn: Optional[Callable[..., Any]] = None,
    sha256_fn: Callable[[str], str] = sha256_archivo,
    tempdir_fn: Optional[Callable[..., str]] = None,
    umbral_bundle_gb: float = UMBRAL_BUNDLE_GB,
    conservar: int = CONSERVAR_BUNDLES,
    auto_aliviar: bool = True,
    avisar_fn: Optional[Callable[[str], Any]] = None,
    archivar_fn: Optional[Callable[..., Any]] = None,
) -> Dict[str, Any]:
    """Ejecuta el respaldo: rsync del memory root + bundle local verificado + rotación."""
    if seco:
        return {"estado": "seco", "mensaje": "Simulación (--seco), no se ejecuta nada"}

    exclusiones = exclusiones_memoria()
    resultados: List[Dict[str, Any]] = []
    ahora = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fecha = ahora.split()[0]
    libre_gb = _disco_libre_gb(disco_fn)
    local_run = ejecutar_local or (subprocess.run if ssh_fn is subprocess.run else ssh_fn)

    # 1. Asegurar directorios destino
    for d in [
        os.path.join(destino_base, "respaldos/mac"),
        os.path.join(destino_base, "pesados/mac/olas-logs"),
    ]:
        r = _ejecutar(_ssh_mkdir(d), ssh_fn, tope_s=30.0)
        if r["codigo"] != 0:
            return {"estado": "error", "fase": "mkdir", "detalle": r}

    # 2. rsync o tar de starseed_memory_root (sin `.tmp.drive*` ni secretos)
    destino_memory = os.path.join(destino_base, "respaldos/mac/starseed_memory_root")
    if _hay_rsync_remoto(ssh_fn):
        r = _ejecutar(_rsync_args(memory_root, destino_memory, exclusiones), ssh_fn, tope_s=900.0)
        resultados.append({"fase": "rsync_memory", "codigo": r["codigo"], "error": r["error"]})
    else:
        tmp_tar_dir = (tempdir_fn or tempfile.mkdtemp)(prefix="starseed-tar-")
        tmp_tar = os.path.join(tmp_tar_dir, "memory.tar.gz")
        r_tar = _ejecutar(_tar_local_args(memory_root, tmp_tar, exclusiones), local_run, tope_s=900.0)
        r_scp = _ejecutar(_scp_args(tmp_tar, destino_memory + ".tar.gz"), scp_fn or local_run, tope_s=900.0)
        r_x = _ejecutar(SSH_BASE + ["tar", "xzf", destino_memory + ".tar.gz", "-C", os.path.dirname(destino_memory)], ssh_fn, tope_s=900.0)
        shutil.rmtree(tmp_tar_dir, ignore_errors=True)
        resultados.append(
            {"fase": "tar_memory", "codigo": r_tar["codigo"] if r_tar["codigo"] != 0 else (r_scp["codigo"] if r_scp["codigo"] != 0 else r_x["codigo"]), "error": r_tar["error"] or r_scp["error"] or r_x["error"]}
        )

    # 3. git bundle SOLO con más de 6 GB libres; local → scp → SHA-256 remoto → borrar temporal
    crear_bundle, motivo_bundle = decidir_bundle(libre_gb, umbral_bundle_gb)
    bundle_destino = os.path.join(destino_base, f"respaldos/mac/repo-{fecha}.bundle")
    if not crear_bundle:
        resultados.append({"fase": "git_bundle", "estado": "saltado", "motivo": motivo_bundle, "codigo": 0})
    else:
        tmpdir = (tempdir_fn or tempfile.mkdtemp)(prefix="starseed-bundle-")
        local_bundle = os.path.join(tmpdir, f"repo-{fecha}.bundle")
        try:
            if os.path.exists(local_bundle):
                os.remove(local_bundle)
        except OSError:
            pass
        r_git = _ejecutar(_git_bundle_args(mac_root, local_bundle), local_run, tope_s=600.0)
        if r_git["codigo"] != 0:
            resultados.append({"fase": "git_bundle", "codigo": r_git["codigo"], "error": r_git["error"], "temporal": tmpdir})
        else:
            sha_local = sha256_fn(local_bundle)
            r_scp = _ejecutar(_scp_args(local_bundle, bundle_destino), scp_fn or local_run, tope_s=900.0)
            verificado = r_scp["codigo"] == 0 and _verificar_sha256_remoto(ssh_fn, bundle_destino, sha_local)
            resultados.append(
                {
                    "fase": "git_bundle",
                    "codigo": 0 if verificado else 1,
                    "verificado": verificado,
                    "sha256": sha_local,
                    "destino": bundle_destino,
                    "temporal": None if verificado else tmpdir,
                    "error": "" if verificado else (r_scp["error"] or "la suma SHA-256 no coincide"),
                }
            )
            if verificado:
                shutil.rmtree(tmpdir, ignore_errors=True)

    # 4. Rotar bundles (mantener 7)
    borrados = _rotar_bundles(ssh_fn, destino_base, conservar=conservar)
    resultados.append({"fase": "rotar_bundles", "borrados": borrados})

    # 5. Log remoto
    linea = "%s | memory_root rsync/tar | bundle %s | rotados %d | libre %.1f GB" % (
        ahora,
        os.path.basename(bundle_destino) if crear_bundle else "saltado",
        len(borrados),
        libre_gb,
    )
    _escribir_log_remoto(ssh_fn, destino_base, linea)

    errores = [x for x in resultados if x.get("codigo") not in (0, None) or x.get("verificado") is False]
    estado = "hecho" if not errores else "parcial"
    resultado: Dict[str, Any] = {
        "estado": estado,
        "detalles": resultados,
        "timestamp": ahora,
        "libre_gb": round(libre_gb, 2),
        "indice": RUTA_INDICE,
    }

    # 6. Alivio automático si el disco baja de 12 GB (el plist también lo pide)
    if auto_aliviar and libre_gb < UMBRAL_ALIVIO_GB:
        alivio = aliviar(
            ssh_fn,
            mac_root=mac_root,
            destino_base=destino_base,
            objetivo_gb=UMBRAL_ALIVIO_GB,
            seco=False,
            avisar_fn=avisar_fn,
            archivar_fn=archivar_fn,
            disco_fn=disco_fn,
        )
        resultado["alivio"] = alivio
        if alivio.get("liberado_gb", 0) > 0:
            _avisar_canal_general(resumen_alivio(alivio), avisar_fn)

    _guardar_estado_local(
        {
            "actualizado": ahora,
            "ultimo_respaldo": resultado,
            "indice": RUTA_INDICE,
        }
    )

    if guardar_log:
        guardar_log(resultado)

    return resultado


def _es_protegida(ruta: str) -> Tuple[bool, str]:
    """PURA: lo que NUNCA sale de la Mac (cuentas, claves, bases vivas, DriveFS)."""
    rn = os.path.normpath(ruta)
    base = os.path.basename(rn)
    if base.endswith((".db", ".sqlite", ".sqlite3")):
        return True, "base de datos viva"
    for patron in ALIVIAR_NEGRA:
        limpio = patron.replace("*", "")
        if not limpio or limpio not in rn:
            continue
        # Excepción expresa de la tarea: los registros de olas viejos y los
        # trozos .tmp.driveupload SÍ se pueden mover aunque vivan en el memory root.
        if limpio == "starseed_memory_root" and (
            "%solas%s" % (os.sep, os.sep) in rn + os.sep or base.startswith(".tmp.drive")
        ):
            continue
        return True, "en lista negra (%s)" % patron
    return False, ""


def _leer_versiones_publicadas(memory_root: str = STARSEED_MEMORY_ROOT) -> Set[str]:
    """Versiones de prueba ya publicadas; sin archivo, conjunto vacío (no se mueve nada)."""
    rutas = [
        os.path.expanduser("~/.starseed/versiones-publicadas.json"),
        os.path.join(memory_root, "mando", "versiones-publicadas.json"),
    ]
    for ruta in rutas:
        try:
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
        except Exception:
            continue
        if isinstance(datos, dict):
            datos = datos.get("versiones", list(datos.keys()))
        if isinstance(datos, list):
            return {str(v).strip() for v in datos if str(v).strip()}
    env = os.environ.get("STARSEED_VERSIONES_PUBLICADAS", "")
    return {v.strip() for v in env.split(",") if v.strip()}


def _worktrees_terminados(
    wt_root: str,
    archivar_fn: Optional[Callable[..., Any]] = None,
) -> Dict[str, Any]:
    """Cuenta (sin tocar nada) los worktrees terminados con `archivar_worktrees.py`."""
    if archivar_fn is not None:
        try:
            datos = archivar_fn(wt_root) or {}
            return datos if isinstance(datos, dict) else {}
        except Exception:
            return {}
    if not os.path.isdir(wt_root):
        return {}
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "archivar_worktrees.py")
    if not os.path.exists(script):
        return {}
    try:
        r = subprocess.run(
            [sys.executable, script],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=os.path.dirname(script),
        )
        m = re.search(r"terminadas:\s*(\d+).*?ocupan\s*([\d.]+)\s*GB", r.stdout or "")
        if m:
            return {"terminadas": int(m.group(1)), "mb": float(m.group(2)) * 1024.0}
    except Exception:
        pass
    return {}


def _cand(
    tipo: str,
    ruta: str,
    motivo: str,
    tamano_fn: Callable[[str], int],
    accion: str = "mover",
    destino: str = "",
) -> Dict[str, Any]:
    """Ficha de candidato con su MB medido (no se inventa el tamaño)."""
    return {
        "id": "%s:%s" % (tipo, os.path.basename(os.path.normpath(ruta))),
        "tipo": tipo,
        "ruta": ruta,
        "mb": round(tamano_fn(ruta) / 1024.0, 1),
        "motivo": motivo,
        "accion": accion,
        "destino": destino,
    }


def detectar_candidatos(
    mac_root: str = MAC_ROOT,
    memory_root: str = STARSEED_MEMORY_ROOT,
    wt_root: str = WT_ROOT,
    ahora: Optional[float] = None,
    existe_fn: Optional[Callable[[str], bool]] = None,
    es_directorio_fn: Optional[Callable[[str], bool]] = None,
    listar_fn: Optional[Callable[[str], List[str]]] = None,
    mtime_fn: Optional[Callable[[str], float]] = None,
    tamano_fn: Optional[Callable[[str], int]] = None,
    cola_activa_ids: Optional[Set[str]] = None,
    versiones_publicadas: Optional[Set[str]] = None,
    tmp_dirs: Optional[List[str]] = None,
    descargas_dir: Optional[str] = None,
    olas_log_dir: Optional[str] = None,
    archivar_fn: Optional[Callable[..., Any]] = None,
) -> List[Dict[str, Any]]:
    """PURA con I/O inyectado: candidatos reales y medidos, con su porqué."""
    ahora = time.time() if ahora is None else ahora
    existe_fn = existe_fn or os.path.exists
    es_directorio_fn = es_directorio_fn or os.path.isdir
    listar_fn = listar_fn or os.listdir
    mtime_fn = mtime_fn or os.path.getmtime
    tamano_fn = tamano_fn or _tamano_directorio
    cola_activa_ids = cola_activa_ids or set()
    candidatos: List[Dict[str, Any]] = []
    vistos: Set[str] = set()

    def agregar(tipo: str, ruta: str, motivo: str, accion: str = "mover", destino: str = "") -> None:
        rn = os.path.normpath(ruta)
        if rn in vistos:
            return
        protegida, porque = _es_protegida(rn)
        if protegida:
            return
        vistos.add(rn)
        candidatos.append(_cand(tipo, rn, motivo, tamano_fn, accion, destino))

    def hijos(directorio: str) -> List[str]:
        if not directorio or not es_directorio_fn(directorio):
            return []
        try:
            return listar_fn(directorio)
        except OSError:
            return []

    # 1. Caché de builds de Next.js (se regenera)
    next_cache = os.path.join(mac_root, ".next", "cache")
    if existe_fn(next_cache) and es_directorio_fn(next_cache):
        agregar("next-cache", next_cache, "caché de builds de Next.js (se regenera)")

    # 2. Restos `go-build*` de más de 1 h en las carpetas temporales
    for d in tmp_dirs or [tempfile.gettempdir(), "/tmp", "/var/tmp"]:
        for e in hijos(d):
            if not e.startswith("go-build"):
                continue
            p = os.path.join(d, e)
            try:
                if ahora - mtime_fn(p) > HORAS_GO * 3600:
                    agregar("go-build", p, "restos de compilación Go con más de 1 h")
            except OSError:
                pass

    # 3. Caché de Go (se regenera)
    for p in [
        os.environ.get("GOCACHE", ""),
        os.path.expanduser("~/Library/Caches/go-build"),
        os.path.expanduser("~/.cache/go-build"),
    ]:
        if p and existe_fn(p) and es_directorio_fn(p):
            agregar("go-cache", p, "caché de compilación de Go (se regenera)")

    # 4. Restos `ShipIt` de actualizadores con más de 1 día
    for d in [os.path.expanduser("~/Library/Caches"), os.path.expanduser("~/Library/Application Support"), tempfile.gettempdir()]:
        for e in hijos(d):
            if "ShipIt" not in e:
                continue
            p = os.path.join(d, e)
            try:
                if ahora - mtime_fn(p) > HORAS_SHIPIT * 3600:
                    agregar("shipit", p, "restos del actualizador ShipIt con más de 1 día")
            except OSError:
                pass

    # 5. Trozos `.tmp.driveupload` de más de 24 h
    for d in [memory_root, mac_root, os.path.expanduser("~")]:
        for e in hijos(d):
            if not e.startswith(".tmp.drive"):
                continue
            p = os.path.join(d, e)
            try:
                if ahora - mtime_fn(p) > HORAS_DRIVE_TMP * 3600:
                    agregar("drive-tmp", p, "trozos de subida de Drive (.tmp.driveupload) con más de 24 h")
            except OSError:
                pass

    # 6. Worktrees terminados (los archiva y poda `archivar_worktrees.py`)
    wt = _worktrees_terminados(wt_root, archivar_fn)
    if int(wt.get("terminadas", 0)) > 0 and float(wt.get("mb", 0)) > 0:
        activos = [n for n in hijos(wt_root) if n in cola_activa_ids]
        if not activos:
            candidatos.append(
                {
                    "id": "worktrees-terminados",
                    "tipo": "worktrees",
                    "ruta": wt_root,
                    "mb": round(float(wt.get("mb", 0.0)), 1),
                    "motivo": "%d worktrees terminados (archivar_worktrees.py)" % int(wt.get("terminadas", 0)),
                    "accion": "archivar_worktrees",
                    "destino": "",
                }
            )

    # 7. Registros de olas de más de 7 días (se MUEVEN a pesados/mac/olas-logs)
    dirs_olas = [os.path.join(memory_root, "olas", "logs"), os.path.join(memory_root, "olas"), olas_log_dir or "/tmp"]
    for d in dirs_olas:
        for e in hijos(d):
            if not (e.endswith(".log") or (d != "/tmp" and e.endswith(".json") and not e.startswith("control-"))):
                continue
            if d == "/tmp" and not e.startswith("ola-"):
                continue
            p = os.path.join(d, e)
            try:
                if ahora - mtime_fn(p) > DIAS_OLAS * 86400:
                    agregar(
                        "olas-logs",
                        p,
                        "registro de ola con más de %d días" % DIAS_OLAS,
                        accion="rsync_remove_source",
                        destino="pesados/mac/olas-logs",
                    )
            except OSError:
                pass

    # 8. Compilación `.next-anterior` cuando la actual lleva más de 1 h sana
    next_anterior = os.path.join(mac_root, ".next-anterior")
    next_actual = os.path.join(mac_root, ".next")
    build_id = os.path.join(next_actual, "BUILD_ID")
    if existe_fn(next_anterior) and es_directorio_fn(next_anterior):
        try:
            sano_desde = mtime_fn(build_id) if existe_fn(build_id) else mtime_fn(next_actual)
            if ahora - sano_desde > HORAS_NEXT_SANO * 3600:
                agregar("next-anterior", next_anterior, "compilación anterior con la actual sana (>1 h)")
        except OSError:
            pass

    # 9. Instaladores de versiones de prueba ya publicadas en Descargas
    publicadas = versiones_publicadas if versiones_publicadas is not None else _leer_versiones_publicadas(memory_root)
    descargas = descargas_dir or os.path.expanduser("~/Downloads")
    if publicadas:
        for e in hijos(descargas):
            if es_instalador_publicado(e, publicadas):
                agregar(
                    "instalador",
                    os.path.join(descargas, e),
                    "instalador de una versión de prueba ya publicada",
                )

    return candidatos


def _copia_verificada(
    origen: str,
    destino: str,
    ssh_fn: Callable[..., Any],
    tamano_fn: Callable[[str], int],
    contar_fn: Callable[[str], int],
    tope_s: float = 600.0,
) -> bool:
    """Verifica que la copia en destino tiene mismo tamaño y entradas que el origen."""
    try:
        tam_ori = tamano_fn(origen)
        cnt_ori = contar_fn(origen)
        r_tam = _ejecutar(_ssh_du(destino), ssh_fn, tope_s=tope_s)
        if r_tam["codigo"] != 0 or not r_tam["salida"]:
            return False
        tam_dest = int(r_tam["salida"].split()[0])
        r_cnt = _ejecutar(_ssh_find_count(destino), ssh_fn, tope_s=tope_s)
        if r_cnt["codigo"] != 0:
            return False
        cnt_dest = int(r_cnt["salida"].split()[0]) if r_cnt["salida"].split() else 0
        return tam_ori == tam_dest and cnt_ori == cnt_dest and tam_ori > 0
    except Exception:
        return False


def _destino_pesados(cand: Dict[str, Any], mac_root: str, destino_base: str) -> str:
    """PURA: ruta remota dentro de pesados/mac, sin salir del árbol."""
    ruta = os.path.normpath(cand.get("ruta", ""))
    if cand.get("destino"):
        return os.path.join(destino_base, cand["destino"])
    if ruta.startswith(os.path.normpath(mac_root) + os.sep):
        rel = os.path.relpath(ruta, mac_root)
    else:
        rel = os.path.join(cand.get("tipo", "otros"), os.path.basename(ruta))
    return os.path.join(destino_base, "pesados", "mac", rel)


def _mover_a_pesados(
    cand: Dict[str, Any],
    destino_base: str,
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    tamano_fn: Callable[[str], int] = _tamano_directorio,
    contar_fn: Callable[[str], int] = _contar_entradas,
    archivar_aplicar_fn: Optional[Callable[..., Any]] = None,
) -> Dict[str, Any]:
    """Mueve un candidato a pesados/ con copia verificada antes de retirar el origen."""
    origen = cand["ruta"]
    destino = _destino_pesados(cand, mac_root, destino_base)
    base = {
        "origen": origen,
        "destino": destino,
        "mb": float(cand.get("mb", 0.0)),
        "motivo": cand.get("motivo", ""),
        "tipo": cand.get("tipo", ""),
    }

    protegida, porque = _es_protegida(origen)
    if protegida:
        return dict(base, estado="protegido", verificado=False, error=porque)

    if cand.get("accion") == "archivar_worktrees":
        if archivar_aplicar_fn is None:
            script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "archivar_worktrees.py")
            if not os.path.exists(script):
                return dict(base, estado="error", verificado=False, error="falta archivar_worktrees.py")
            try:
                r = subprocess.run(
                    [sys.executable, script, "--aplicar"],
                    capture_output=True,
                    text=True,
                    timeout=1800,
                    cwd=os.path.dirname(script),
                )
                ok = r.returncode == 0
                return dict(base, estado="archivado" if ok else "error", verificado=ok, error=(r.stderr or "")[:200])
            except Exception as e:
                return dict(base, estado="error", verificado=False, error=str(e))
        try:
            datos = archivar_aplicar_fn(origen) or {}
            ok = bool(datos.get("ok", True))
            return dict(base, estado="archivado" if ok else "error", verificado=ok, error=datos.get("error", ""))
        except Exception as e:
            return dict(base, estado="error", verificado=False, error=str(e))

    if cand.get("accion") == "rsync_remove_source":
        r = _ejecutar(_rsync_remove_source_args(origen, destino, exclusiones_memoria()), ssh_fn, tope_s=600.0)
        ok = r["codigo"] == 0
        return dict(base, estado="movido" if ok else "error", verificado=ok, error=r["error"])

    # Mover normal: copia, verificación y solo entonces se retira el origen.
    if _hay_rsync_remoto(ssh_fn):
        r = _ejecutar(_rsync_args(origen, destino, exclusiones_memoria(), borrar=False), ssh_fn, tope_s=900.0)
        if r["codigo"] != 0:
            return dict(base, estado="error", verificado=False, error=r["error"])
    else:
        tmp_dir = tempfile.mkdtemp(prefix="starseed-alivio-")
        tmp_tar = os.path.join(tmp_dir, "pesado.tar.gz")
        r_tar = _ejecutar(_tar_local_args(origen, tmp_tar, exclusiones_memoria()), subprocess.run, tope_s=900.0)
        r_scp = _ejecutar(_scp_args(tmp_tar, destino + ".tar.gz"), subprocess.run, tope_s=900.0)
        r_x = _ejecutar(
            SSH_BASE + ["tar", "xzf", destino + ".tar.gz", "-C", os.path.dirname(destino)],
            ssh_fn,
            tope_s=900.0,
        )
        shutil.rmtree(tmp_dir, ignore_errors=True)
        if r_tar["codigo"] != 0 or r_scp["codigo"] != 0 or r_x["codigo"] != 0:
            return dict(base, estado="error", verificado=False, error=r_tar["error"] or r_scp["error"] or r_x["error"])

    verificado = _copia_verificada(origen, destino, ssh_fn, tamano_fn, contar_fn)
    if not verificado:
        return dict(base, estado="error_verificacion", verificado=False, error="la copia no coincide en tamaño y entradas")

    try:
        if os.path.isdir(origen):
            shutil.rmtree(origen)
        else:
            os.remove(origen)
        return dict(base, estado="movido", verificado=True, error="")
    except OSError as e:
        return dict(base, estado="error_borrar", verificado=False, error=str(e))


def aliviar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    wt_root: str = WT_ROOT,
    destino_base: str = DEST_BASE,
    memory_root: Optional[str] = None,
    objetivo_gb: float = UMBRAL_ALIVIO_GB,
    seco: bool = False,
    guardar_log: Optional[Callable[[Dict[str, Any]], Any]] = None,
    cola_activa_ids: Optional[Set[str]] = None,
    existe_fn: Optional[Callable[[str], bool]] = None,
    es_directorio_fn: Optional[Callable[[str], bool]] = None,
    listar_fn: Optional[Callable[[str], List[str]]] = None,
    mtime_fn: Optional[Callable[[str], float]] = None,
    tamano_fn: Optional[Callable[[str], int]] = None,
    contar_fn: Optional[Callable[[str], int]] = None,
    disco_fn: Optional[Callable[[str], Tuple[int, int, int]]] = None,
    archivar_fn: Optional[Callable[..., Any]] = None,
    archivar_aplicar_fn: Optional[Callable[..., Any]] = None,
    avisar_fn: Optional[Callable[[str], Any]] = None,
    versiones_publicadas: Optional[Set[str]] = None,
    tmp_dirs: Optional[List[str]] = None,
    descargas_dir: Optional[str] = None,
    olas_log_dir: Optional[str] = None,
    ahora_fn: Optional[Callable[[], float]] = None,
) -> Dict[str, Any]:
    """Lista candidatos medidos y libera espacio moviéndolos con copia verificada."""
    tamano_fn = tamano_fn or _tamano_directorio
    contar_fn = contar_fn or _contar_entradas
    ahora = (ahora_fn or time.time)()
    libre_gb = _disco_libre_gb(disco_fn)

    candidatos = detectar_candidatos(
        mac_root=mac_root,
        memory_root=memory_root or os.path.join(mac_root, "starseed_memory_root"),
        wt_root=wt_root,
        ahora=ahora,
        existe_fn=existe_fn,
        es_directorio_fn=es_directorio_fn,
        listar_fn=listar_fn,
        mtime_fn=mtime_fn,
        tamano_fn=tamano_fn,
        cola_activa_ids=cola_activa_ids,
        versiones_publicadas=versiones_publicadas,
        tmp_dirs=tmp_dirs,
        descargas_dir=descargas_dir,
        olas_log_dir=olas_log_dir,
        archivar_fn=archivar_fn,
    )

    base = {
        "libre_gb_inicial": round(libre_gb, 2),
        "objetivo_gb": objetivo_gb,
        "candidatos": candidatos,
        "indice": RUTA_INDICE,
    }

    if seco:
        return dict(base, estado="seco", movidos=[], liberado_gb=0.0, mensaje="Simulación (--seco), no se mueve nada")

    if libre_gb >= objetivo_gb:
        return dict(base, estado="suficiente_espacio", libre_gb=round(libre_gb, 2), movidos=[], liberado_gb=0.0)

    movidos: List[Dict[str, Any]] = []
    liberado_gb = 0.0
    for cand in candidatos:
        if liberado_gb >= (objetivo_gb - libre_gb):
            break
        res = _mover_a_pesados(
            cand,
            destino_base,
            ssh_fn,
            mac_root=mac_root,
            tamano_fn=tamano_fn,
            contar_fn=contar_fn,
            archivar_aplicar_fn=archivar_aplicar_fn,
        )
        movidos.append(res)
        if res.get("verificado"):
            liberado_gb += float(res.get("mb", 0.0)) / 1024.0

    final = _disco_libre_gb(disco_fn)
    if liberado_gb > 0 and final <= libre_gb:
        final = libre_gb + liberado_gb
    liberado = round(liberado_gb, 2)

    resultado: Dict[str, Any] = dict(base)
    resultado.update(
        {
            "estado": "hecho" if any(m.get("verificado") for m in movidos) else "nada_movido",
            "libre_gb": round(final, 2),
            "liberado_gb": liberado,
            "movidos": movidos,
        }
    )

    if movidos:
        _anotar_indice(movidos, dt.datetime.now().strftime("%Y-%m-%d %H:%M"))
        estado_local = _leer_estado_local()
        estado_local.update(
            {
                "ultimo_alivio": {
                    "cuando": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "liberado_gb": liberado,
                    "movidos": movidos,
                },
                "indice": RUTA_INDICE,
            }
        )
        _guardar_estado_local(estado_local)
        if liberado > 0:
            _avisar_canal_general(resumen_alivio(resultado), avisar_fn)

    if guardar_log:
        guardar_log(resultado)

    return resultado


def estado(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    destino_base: str = DEST_BASE,
    disco_fn: Optional[Callable[[str], Tuple[int, int, int]]] = None,
) -> Dict[str, Any]:
    """Estado actual: espacio en Mac, bundles, log, índice y último alivio local."""
    libre = _disco_libre_gb(disco_fn)
    try:
        total = (disco_fn or shutil.disk_usage)("/")[0] / (1024 ** 3)
    except Exception:
        total = 0.0
    mac_libre_gb = round(libre, 2)
    mac_total_gb = round(total, 2)

    # Bundles remotos
    bundles = _listar_bundles_remotos(ssh_fn, destino_base)
    ultimos_bundles = []
    for b in bundles[:CONSERVAR_BUNDLES]:
        r = _ejecutar(_ssh_du(b), ssh_fn, tope_s=30.0)
        tam_kb = int(r["salida"].split()[0]) if r["codigo"] == 0 and r["salida"] else 0
        ultimos_bundles.append({"ruta": b, "tamano_mb": round(tam_kb / 1024, 1)})

    # Memory root respaldo
    memory_dest = os.path.join(destino_base, "respaldos/mac/starseed_memory_root")
    r_mem = _ejecutar(_ssh_du(memory_dest), ssh_fn, tope_s=30.0)
    memory_tam_mb = round(int(r_mem["salida"].split()[0]) / 1024, 1) if r_mem["codigo"] == 0 and r_mem["salida"] else 0.0

    # Log remoto
    log_ruta = os.path.join(destino_base, "respaldos/mac/respaldos.log")
    r_log = _ejecutar(_ssh_test_e(log_ruta), ssh_fn, tope_s=10.0)
    log_existe = r_log["codigo"] == 0

    # Conexión honesta: sin SSH no se puede afirmar que el destino esté vacío.
    r_ssh = _ejecutar(SSH_BASE + ["true"], ssh_fn, tope_s=10.0)
    conexion = "ok" if r_ssh["codigo"] == 0 else "sin_ssh"

    # Índice y estado local (lo movido de verdad)
    indice_existe = os.path.exists(RUTA_INDICE)
    indice_lineas = 0
    if indice_existe:
        try:
            with open(RUTA_INDICE, encoding="utf-8") as f:
                indice_lineas = sum(1 for _ in f)
        except OSError:
            pass
    local = _leer_estado_local()
    ultimo_alivio = local.get("ultimo_alivio")
    if not isinstance(ultimo_alivio, dict):
        ultimo_alivio = {}

    return {
        "mac_libre_gb": mac_libre_gb,
        "mac_total_gb": mac_total_gb,
        "conexion": conexion,
        "ultimos_bundles": ultimos_bundles,
        "destino": {
            "memory_root_mb": memory_tam_mb,
            "log_existe": log_existe,
            "bundles": len(bundles),
        },
        "indice": {
            "ruta": RUTA_INDICE,
            "existe": indice_existe,
            "lineas": indice_lineas,
        },
        "movido_gb": round(float(ultimo_alivio.get("liberado_gb", 0.0) or 0.0), 2),
        "ultimo_alivio": ultimo_alivio,
        "timestamp": time.time(),
    }


def comando_restic_inicializar(destino_base: str = DEST_BASE) -> List[str]:
    """PURA: comando para inicializar repo restic cifrado (SIN contraseña)."""
    repo = os.path.join(destino_base, "restic-secretos")
    return [
        "restic",
        "init",
        "--repository", repo,
        # La contraseña se pasa por variable de entorno RESTIC_PASSWORD (fuera del repo)
    ]


def comando_restic_respaldar(origenes: List[str], destino_base: str = DEST_BASE) -> List[str]:
    """PURA: comando para respaldar secretos en restic (SIN contraseña en argv)."""
    repo = os.path.join(destino_base, "restic-secretos")
    return [
        "restic",
        "backup",
        "--repository", repo,
        *origenes,
        # RESTIC_PASSWORD en entorno
    ]


def main(argv: Optional[List[str]] = None) -> int:
    """CLI: plan | respaldar [--seco] | aliviar [--seco] [--objetivo-gb N] | estado."""
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        args = ["estado"]

    orden = args[0]
    seco = "--seco" in args
    objetivo_gb = UMBRAL_ALIVIO_GB
    if "--objetivo-gb" in args:
        try:
            idx = args.index("--objetivo-gb")
            objetivo_gb = float(args[idx + 1])
        except (IndexError, ValueError):
            pass

    # Inyección de dependencias para pruebas
    ssh_fn = subprocess.run
    guardar_log = print

    if orden == "plan":
        res = plan(ssh_fn, seco=seco)
        print(json.dumps(res, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    if orden == "respaldar":
        res = respaldar(ssh_fn, seco=seco, guardar_log=guardar_log)
        print(json.dumps(res, ensure_ascii=False, sort_keys=True))
        return 0 if res["estado"] in ("hecho", "seco") else 1

    if orden == "aliviar":
        res = aliviar(ssh_fn, seco=seco, objetivo_gb=objetivo_gb, guardar_log=guardar_log)
        if seco:
            print("Candidatos medidos (%d):" % len(res.get("candidatos", [])))
            for cand in res.get("candidatos", []):
                print("  " + formatear_candidato(cand))
        print(json.dumps(res, ensure_ascii=False, sort_keys=True))
        return 0 if res["estado"] in ("hecho", "seco", "suficiente_espacio", "nada_movido") else 1

    if orden == "estado":
        res = estado(ssh_fn)
        print(json.dumps(res, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    print("Uso: respaldo_maggabox.py plan | respaldar [--seco] | aliviar [--seco] [--objetivo-gb N] | estado")
    return 2


if __name__ == "__main__":
    sys.exit(main())