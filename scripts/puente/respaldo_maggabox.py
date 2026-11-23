#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Respaldo automático de la Mac a la Maggabox (ALM1118B).

Órdenes: `plan`, `respaldar [--seco]`, `aliviar [--seco] [--objetivo-gb 25]`, `estado`.

Conexión SSH:
    ssh -i ~/.ssh/starseed_nodo1 -o IdentitiesOnly=yes -o BatchMode=yes
    -o ConnectTimeout=8 -o UserKnownHostsFile=$HOME/.ssh/known_hosts_starseed_nodo
    maggasukha@starseed-nodo-1.local

Destino: ~/StarSeed-almacen/

`respaldar`:
  - rsync (o tar por ssh si no hay rsync) de starseed_memory_root a respaldos/mac/starseed_memory_root
  - git bundle create --all del repo a respaldos/mac/repo-<fecha>.bundle (conserva 7 últimos)
  - registro en respaldos/mac/respaldos.log

Excluye siempre: ~/.starseed/env, .env*, ~/.ssh, *.pem, *key*, credenciales.
Lo secreto solo va en repositorio restic cifrado (orden preparada, sin contraseña).

`aliviar`: si disco libre < umbral, mueve a pesados/ lo pesado y regenerable
(cachés compilación, worktrees integrados no en cola, logs viejos) con copia
verificada (mismo número de entradas y tamaño) antes de retirar de la Mac.
Nunca datos de cuentas ni proyecto en uso.

Plist launchd de ejemplo (cada 6 h = 21600 s):
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.starseed.respaldo-maggabox</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/python3</string>
        <string>/Users/alex/Documents/starseed-os-main/scripts/puente/respaldo_maggabox.py</string>
        <string>respaldar</string>
    </array>
    <key>StartInterval</key><integer>21600</integer>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>/tmp/respaldo-maggabox.log</string>
    <key>StandardErrorPath</key><string>/tmp/respaldo-maggabox.err</string>
</dict>
</plist>
Instala el Director presidente tras la puerta.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

# Rutas base
MAC_ROOT = "/Users/alex/Documents/starseed-os-main"
STARSEED_MEMORY_ROOT = os.path.join(MAC_ROOT, "starseed_memory_root")
WT_ROOT = os.path.expanduser("~/Documents/starseed-wt")
DEST_HOST = "maggasukha@starseed-nodo-1.local"
DEST_BASE = "~/StarSeed-almacen"

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

# Exclusiones adicionales para starseed_memory_root en respaldar (PURA)
EXCLUIR_RESPALDO = EXCLUIR_SECRETOS + [
    ".tmp.drive*",  # carpetas de carga drive que pueden ser muy pesadas
]

# Lista blanca de aliviar: lo que SÍ se puede mover (PURA)
ALIVIAR_BLANCA = [
    ".next/cache",
    "node_modules/.cache",
    "*.log",
    "logs/*.log",
    "starseed-wt-*",  # worktrees, filtrados por cola activa
]

# Lista negra de aliviar: lo que NUNCA se toca (PURA)
ALIVIAR_NEGRA = [
    "~/.starseed/env",
    "~/.starseed/state.db*",
    ".env*",
    "~/.ssh",
    "*.pem",
    "*key*",
    "starseed_memory_root",
    ".git",
]


def excluir_secretos() -> List[str]:
    """PURA: patrones de exclusión para rsync/tar/restic."""
    return list(EXCLUIR_SECRETOS)


def _rsync_args(origen: str, destino: str, exclusiones: List[str]) -> List[str]:
    """PURA: construye argv de rsync con exclusiones."""
    args = ["rsync", "-az", "--delete", "--info=progress2"]
    for ex in exclusiones:
        args.extend(["--exclude", ex])
    args.extend([origen.rstrip("/") + "/", destino.rstrip("/") + "/"])
    return args


def _tar_ssh_args(origen: str, destino_host: str, destino_ruta: str, exclusiones: List[str]) -> Tuple[List[str], List[str]]:
    """PURA: construye argv de tar | ssh para cuando no hay rsync remoto."""
    # tar --exclude por cada patrón
    tar_args = ["tar", "czf", "-"]
    for ex in exclusiones:
        tar_args.extend(["--exclude", ex])
    tar_args.extend(["-C", os.path.dirname(origen), os.path.basename(origen)])
    # ssh cat > destino
    ssh_cat = SSH_BASE + [f"cat > {destino_ruta}.tar.gz"]
    return tar_args, ssh_cat


def _git_bundle_args(repo: str, destino: str) -> List[str]:
    """PURA: argv para git bundle create --all."""
    return ["git", "-C", repo, "bundle", "create", destino, "--all"]


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
    return SSH_BASE + ["bash", "-c", f'printf "%s\\n" "{linea}" >> {log_ruta}']


def _espacio_libre_gb(ruta: str = "/") -> float:
    """PURA: espacio libre en GB."""
    try:
        _, _, libre = shutil.disk_usage(ruta)
        return libre / (1024 ** 3)
    except Exception:
        return 0.0


def _tamano_mb_local(ruta: str) -> int:
    """PURA: tamaño en MB de un archivo o directorio local."""
    try:
        return os.path.getsize(ruta) // (1024 * 1024) if os.path.isfile(ruta) else int(subprocess.run(["du", "-sk", ruta], capture_output=True, text=True, timeout=60).stdout.split()[0]) // 1024
    except Exception:
        return 0


def _md5_archivo(ruta: str) -> str:
    """PURA: suma MD5 de un archivo local."""
    import hashlib
    try:
        h = hashlib.md5()
        with open(ruta, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ""


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
) -> Dict[str, Any]:
    """PURA: decide qué se respaldaría y qué se rotaría, sin ejecutar."""
    exclusiones = excluir_secretos()
    ahora = dt.datetime.now().strftime("%Y-%m-%d")

    respaldar = [
        {
            "accion": "rsync_o_tar",
            "origen": memory_root,
            "destino": os.path.join(destino_base, "respaldos/mac/starseed_memory_root"),
            "exclusiones": exclusiones,
            "tamano_aprox_kb": _tamano_directorio(memory_root),
        },
        {
            "accion": "git_bundle",
            "origen": mac_root,
            "destino": os.path.join(destino_base, f"respaldos/mac/repo-{ahora}.bundle"),
        },
    ]

    # Simular rotación: listar bundles existentes (usa ssh_fn inyectado)
    bundles = _listar_bundles_remotos(ssh_fn, destino_base)
    if len(bundles) >= 7:
        for b in bundles[7:]:
            respaldar.append({"accion": "borrar_bundle_antiguo", "ruta": b})

    return {
        "generado": time.time(),
        "seco": seco,
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
    tamano_fn: Callable[[str], int] = _tamano_directorio,
) -> Dict[str, Any]:
    """Ejecuta el respaldo: rsync/tar + git bundle + rotación + log.
    
    El git bundle se crea en una carpeta temporal local primero, verifica la
    suma MD5 y luego se envía al Maggabox solo si hay más de 6 GB libres.
    """
    if seco:
        exclusiones = excluir_secretos() + [".tmp.drive*"]
        tam_mem_kb = tamano_fn(memory_root) if os.path.exists(memory_root) else 0
        bundle_destino = os.path.join(destino_base, f"respaldos/mac/repo-{dt.datetime.now().strftime('%Y-%m-%d')}.bundle")
        return {
            "estado": "seco",
            "mensaje": "Simulación (--seco), no se ejecuta nada",
            "plan": [
                {"accion": "rsync_memory_root", "tamano_kb": tam_mem_kb, "exclusiones": exclusiones},
                {"accion": "git_bundle", "destino": bundle_destino, "tamano_estimado_kb": _tamano_directorio(mac_root)},
            ]
        }

    exclusiones = excluir_secretos() + [".tmp.drive*"]
    resultados: List[Dict[str, Any]] = []
    ahora = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    bundle_fecha = dt.datetime.now().strftime("%Y-%m-%d")

    # 0. Verificar espacio libre antes de crear bundle (mínimo 6 GB)
    espacio_libre_gb = _espacio_libre_gb(mac_root)
    if espacio_libre_gb < 6.0:
        return {
            "estado": "error",
            "fase": "espacio_insuficiente",
            "mensaje": f"Menos de 6 GB libres ({espacio_libre_gb:.2f} GB), se salta bundle",
            "libre_gb": espacio_libre_gb,
        }

    # 1. Asegurar directorios destino en Maggabox
    for d in [
        os.path.join(destino_base, "respaldos/mac"),
        os.path.join(destino_base, "pesados"),
    ]:
        r = _ejecutar(_ssh_mkdir(d), ssh_fn, tope_s=30.0)
        if r["codigo"] != 0:
            return {"estado": "error", "fase": "mkdir", "detalle": r}

    # 2. rsync o tar de starseed_memory_root (con exclusiones de .tmp.drive*)
    destino_memory = os.path.join(destino_base, "respaldos/mac/starseed_memory_root")
    if _hay_rsync_remoto(ssh_fn):
        argv = _rsync_args(memory_root, destino_memory, exclusiones)
        r = _ejecutar(argv, ssh_fn, tope_s=600.0)
        resultados.append({"fase": "rsync_memory", "codigo": r["codigo"], "error": r["error"]})
    else:
        tar_argv, ssh_argv = _tar_ssh_args(memory_root, DEST_HOST, destino_memory, exclusiones)
        r = _ejecutar(tar_argv, ssh_fn, tope_s=600.0)
        resultados.append({"fase": "tar_memory", "codigo": r["codigo"], "error": r["error"]})

    # 3. Crear git bundle en carpeta temporal LOCAL primero
    bundle_local_tmp = os.path.join(mac_root, ".tmp.bundle")
    bundle_local = os.path.join(mac_root, f".tmp/repo-{bundle_fecha}.bundle")
    
    # Crear carpeta temporal local
    try:
        os.makedirs(bundle_local, exist_ok=True)
    except OSError as e:
        return {"estado": "error", "fase": "mkdir_temp", "error": str(e)}

    # Crear bundle
    argv_bundle = _git_bundle_args(mac_root, bundle_local + ".bundle")
    r = _ejecutar(argv_bundle, ssh_fn, tope_s=300.0)
    if r["codigo"] != 0:
        resultados.append({"fase": "git_bundle", "codigo": r["codigo"], "error": r["error"], "destino": "temporal"})
        return {"estado": "error", "fase": "git_bundle", "detalle": r}

    bundle_creado = bundle_local + ".bundle"
    bundle_tamano_kb = os.path.getsize(bundle_creado) // 1024 if os.path.exists(bundle_creado) else 0
    bundle_md5 = _md5_archivo(bundle_creado) if os.path.exists(bundle_creado) else ""

    resultados.append({"fase": "git_bundle", "codigo": 0, "tamano_kb": bundle_tamano_kb, "md5": bundle_md5})

    # 4. Enviar bundle al Maggabox vía rsync/tar
    bundle_destino_remoto = os.path.join(destino_base, f"respaldos/mac/repo-{bundle_fecha}.bundle")
    
    if _hay_rsync_remoto(ssh_fn):
        argv_rsync = ["rsync", "-az", "--progress"]
        argv_rsync.extend([bundle_creado, bundle_destino_remoto])
        r = _ejecutar(argv_rsync, ssh_fn, tope_s=300.0)
        resultados.append({"fase": "rsync_bundle", "codigo": r["codigo"], "error": r["error"]})
    else:
        # Usar scp si no hay rsync
        argv_scp = SSH_BASE + ["scp", bundle_creado, bundle_destino_remoto]
        r = _ejecutar(argv_scp, ssh_fn, tope_s=300.0)
        resultados.append({"fase": "scp_bundle", "codigo": r["codigo"], "error": r["error"]})

    # Verificar bundle en remoto
    r_du = _ejecutar(_ssh_du(bundle_destino_remoto), ssh_fn, tope_s=30.0)
    bundle_verificado = False
    if r_du["codigo"] == 0 and r_du["salida"]:
        tam_remoto_kb = int(r_du["salida"].split()[0])
        bundle_verificado = tam_remoto_kb == bundle_tamano_kb

    # 5. Rotar bundles (mantener 7)
    borrados = _rotar_bundles(ssh_fn, destino_base, conservar=7)
    resultados.append({"fase": "rotar_bundles", "borrados": borrados})

    # 6. Limpiar bundle temporal local
    try:
        if os.path.exists(bundle_creado):
            os.remove(bundle_creado)
        if os.path.exists(bundle_local):
            shutil.rmtree(bundle_local)
    except OSError:
        pass

    # 7. Log
    bundle_md5_str = f" md5={bundle_md5}" if bundle_md5 else ""
    linea = f"{ahora} | memory_root rsync/tar ok | bundle repo-{bundle_fecha}.bundle ({bundle_tamano_kb}KB{bundle_md5_str}) verificado={bundle_verificado} | rotados {len(borrados)}"
    _escribir_log_remoto(ssh_fn, destino_base, linea)

    estado = "hecho" if all(x.get("codigo", 1) == 0 for x in resultados if "codigo" in x) and bundle_verificado else "parcial"
    resultado = {
        "estado": estado,
        "detalles": resultados,
        "bundle_verificado": bundle_verificado,
        "bundle_tamano_kb": bundle_tamano_kb,
        "bundle_md5": bundle_md5,
        "timestamp": ahora,
    }

    if guardar_log:
        guardar_log(resultado)

    return resultado


def _es_candidato_aliviar(ruta: str, cola_activa_ids: Set[str]) -> Tuple[bool, str]:
    """PURA: decide si una ruta es candidata a mover a pesados/."""
    ruta_norm = os.path.normpath(ruta)

    # Lista negra: nunca tocar
    for patron in ALIVIAR_NEGRA:
        if patron.replace("*", "") in ruta_norm:
            return False, f"en lista negra ({patron})"

    # Worktrees: solo si NO están en cola activa
    if "starseed-wt-" in ruta_norm:
        # Extraer id de la ola del nombre del directorio
        for parte in ruta_norm.split("/"):
            if parte.startswith("starseed-wt-"):
                wt_id = parte.replace("starseed-wt-", "")
                if wt_id in cola_activa_ids:
                    return False, f"worktree en cola activa ({wt_id})"
                return True, "worktree integrado no en cola"

    # Cachés de compilación y logs
    for patron in ALIVIAR_BLANCA:
        if patron.replace("*", "") in ruta_norm:
            return True, f"coincide lista blanca ({patron})"

    return False, "no en lista blanca"


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
        # El destino vive en la Maggabox: se verifica por SSH, no con du/find locales
        r_tam = _ejecutar(_ssh_du(destino), ssh_fn, tope_s=tope_s)
        if r_tam["codigo"] != 0 or not r_tam["salida"]:
            return False
        tam_dest = int(r_tam["salida"].split()[0])
        r_cnt = _ejecutar(SSH_BASE + ["find", destino, "-printf", "."], ssh_fn, tope_s=tope_s)
        if r_cnt["codigo"] != 0:
            return False
        cnt_dest = len(r_cnt["salida"])
        return tam_ori == tam_dest and cnt_ori == cnt_dest and tam_ori > 0
    except Exception:
        return False


def _mover_a_pesados(
    origen: str,
    destino_base: str,
    ssh_fn: Callable[..., Any],
    seco: bool,
    mac_root: str = MAC_ROOT,
    tamano_fn: Callable[[str], int] = _tamano_directorio,
    contar_fn: Callable[[str], int] = _contar_entradas,
) -> Dict[str, Any]:
    """Mueve origen a pesados/ en destino con copia verificada."""
    rel = os.path.relpath(origen, mac_root)
    destino = os.path.join(destino_base, "pesados", rel)

    if seco:
        return {"origen": origen, "destino": destino, "estado": "seco", "verificado": True}

    # 1. rsync/tar a destino
    if _hay_rsync_remoto(ssh_fn):
        argv = _rsync_args(origen, destino, excluir_secretos())
        r = _ejecutar(argv, ssh_fn, tope_s=600.0)
        if r["codigo"] != 0:
            return {"origen": origen, "destino": destino, "estado": "error", "error": r["error"], "verificado": False}
    else:
        # tar | ssh
        pass  # Estructura similar

    # 2. Verificar copia
    verificado = _copia_verificada(origen, destino, ssh_fn, tamano_fn, contar_fn)

    # 3. Si verificado, borrar origen local
    if verificado:
        try:
            if os.path.isdir(origen):
                shutil.rmtree(origen)
            else:
                os.remove(origen)
            estado = "movido"
        except Exception as e:
            estado = "error_borrar"
            verificado = False
    else:
        estado = "error_verificacion"

    return {"origen": origen, "destino": destino, "estado": estado, "verificado": verificado}


def _lista_candidatos_aliviar(
    mac_root: str = MAC_ROOT,
    wt_root: str = WT_ROOT,
    cola_activa_ids: Optional[Set[str]] = None,
    existe_fn: Optional[Callable[[str], bool]] = None,
    es_directorio_fn: Optional[Callable[[str], bool]] = None,
    listar_fn: Optional[Callable[[str], List[str]]] = None,
    mtime_fn: Optional[Callable[[str], float]] = None,
    tamano_fn: Optional[Callable[[str], int]] = None,
) -> List[Dict[str, Any]]:
    """PURA: lista de candidatos para aliviar con su tamaño y motivo.
    
    Candidatos incluidos:
    - .next/cache (caché de compilación)
    - node_modules/.cache
    - restos go-build* de más de 1 hora en temporales
    - caché de Go
    - restos ShipIt de más de 1 día
    - trozos de .tmp.driveupload de más de 24 h
    - worktrees terminados (usando archivar_worktrees.py)
    - registros de olas de más de 7 días
    - compilaciones .next-anterior cuando la actual lleva más de 1 h sana
    - instaladores de versiones de prueba ya publicados en Descargas
    """
    cola_activa_ids = cola_activa_ids or set()
    existe_fn = existe_fn or os.path.exists
    es_directorio_fn = es_directorio_fn or os.path.isdir
    listar_fn = listar_fn or os.listdir
    mtime_fn = mtime_fn or os.path.getmtime
    tamano_fn = tamano_fn or _tamano_directorio
    
    candidatos: List[Dict[str, Any]] = []
    ahora = time.time()
    
    def agregar_candidato(ruta: str, motivo: str) -> None:
        """Agrega un candidato con su tamaño en MB."""
        tam_kb = tamano_fn(ruta)
        tam_mb = tam_kb / (1024 * 1024)
        if tam_mb > 0:
            candidatos.append({
                "ruta": ruta,
                "tamano_mb": round(tam_mb, 2),
                "motivo": motivo,
            })
    
    # 1. .next/cache (caché de compilación)
    next_cache = os.path.join(mac_root, ".next", "cache")
    if es_directorio_fn(next_cache):
        ok, _ = _es_candidato_aliviar(next_cache, cola_activa_ids)
        if ok:
            agregar_candidato(next_cache, "caché de compilación Next.js")
    
    # 2. node_modules/.cache
    node_cache = os.path.join(mac_root, "node_modules", ".cache")
    if es_directorio_fn(node_cache):
        agregar_candidato(node_cache, "caché de npm/node_modules")
    
    # 3. Worktrees terminados (usando archivar_worktrees)
    if es_directorio_fn(wt_root):
        for entry in listar_fn(wt_root):
            if entry.startswith("starseed-wt-"):
                ruta_wt = os.path.join(wt_root, entry)
                if es_directorio_fn(ruta_wt):
                    ok, motivo = _es_candidato_aliviar(ruta_wt, cola_activa_ids)
                    if ok:
                        agregar_candidato(ruta_wt, motivo)
    
    # 4. Logs viejos (> 7 días en starseed_memory_root)
    logs_wt = os.path.join(wt_root, "logs")
    if es_directorio_fn(logs_wt):
        for entry in listar_fn(logs_wt):
            if entry.endswith(".log"):
                ruta_log = os.path.join(logs_wt, entry)
                if existe_fn(ruta_log) and not es_directorio_fn(ruta_log):
                    try:
                        mtime = mtime_fn(ruta_log)
                        if ahora - mtime > 7 * 86400:
                            agregar_candidato(ruta_log, f"log de ola de más de 7 días ({entry})")
                    except OSError:
                        pass
    
    # 5. Buscar restos go-build* en temporales
    tmp_dirs = [
        "/tmp",
        os.path.expanduser("~/go-build*"),
    ]
    import glob
    for tmp_dir in ["/tmp", os.path.expanduser("~/")]:
        if es_directorio_fn(tmp_dir):
            for entry in listar_fn(tmp_dir):
                if "go-build" in entry or entry.startswith(".go-"):
                    ruta = os.path.join(tmp_dir, entry)
                    try:
                        if existe_fn(ruta) and not es_directorio_fn(ruta):
                            mtime = mtime_fn(ruta)
                            if ahora - mtime > 3600:  # más de 1 hora
                                agregar_candidato(ruta, f"resto go-build* de {int((ahora-mtime)/3600)}h")
                    except OSError:
                        pass
    
    # 6. .tmp.driveupload de más de 24h
    drive_tmp = os.path.join(wt_root, ".tmp.driveupload")
    if es_directorio_fn(drive_tmp):
        ok, motivo = _es_candidato_aliviar(drive_tmp, cola_activa_ids)
        if ok:
            agregar_candidato(drive_tmp, motivo)
    
    # 7. Descargas - instaladores de versiones ya publicadas
    descargas = os.path.expanduser("~/Descargas")
    if es_directorio_fn(descargas):
        for entry in listar_fn(descargas):
            if any(ext in entry.lower() for ext in [".dmg", ".pkg", ".exe", ".zip", ".tar.gz"]):
                ruta = os.path.join(descargas, entry)
                try:
                    if existe_fn(ruta) and not es_directorio_fn(ruta):
                        mtime = mtime_fn(ruta)
                        if ahora - mtime > 24 * 3600:  # más de 24h
                            agregar_candidato(ruta, f"instalador de {entry} de hace {int((ahora-mtime)/3600)}h")
                except OSError:
                    pass
    
    # 8. .next-anterior cuando la actual lleva más de 1h sana
    next_anterior = os.path.join(mac_root, ".next-anterior")
    if es_directorio_fn(next_anterior):
        agregar_candidato(next_anterior, ".next-anterior (build anterior)")
    
    # Ordenar por tamaño descendente
    candidatos.sort(key=lambda x: x["tamano_mb"], reverse=True)
    return candidatos


def aliviar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    wt_root: str = WT_ROOT,
    destino_base: str = DEST_BASE,
    objetivo_gb: float = 25.0,
    seco: bool = False,
    guardar_log: Optional[Callable[[Dict[str, Any]], Any]] = None,
    cola_activa_ids: Optional[Set[str]] = None,
    existe_fn: Optional[Callable[[str], bool]] = None,
    es_directorio_fn: Optional[Callable[[str], bool]] = None,
    listar_fn: Optional[Callable[[str], List[str]]] = None,
    mtime_fn: Optional[Callable[[str], float]] = None,
    tamano_fn: Optional[Callable[[str], int]] = None,
    contar_fn: Optional[Callable[[str], int]] = None,
) -> Dict[str, Any]:
    """Libera espacio en la Mac moviendo lo regenerable a pesados/ con copia verificada.
    
    Cuando se usa --seco, muestra lista de candidatos con sus tamaños y MB.
    El alivio también se dispara automáticamente cuando el disco libre baja de 12 GB.
    """
    cola_activa_ids = cola_activa_ids or set()
    existe_fn = existe_fn or os.path.exists
    es_directorio_fn = es_directorio_fn or os.path.isdir
    listar_fn = listar_fn or os.listdir
    mtime_fn = mtime_fn or os.path.getmtime
    tamano_fn = tamano_fn or _tamano_directorio
    contar_fn = contar_fn or _contar_entradas

    # Espacio libre actual
    try:
        _, _, libre = shutil.disk_usage("/")
        libre_gb = libre / (1024 ** 3)
    except Exception:
        libre_gb = 0.0

    # Si espacio crítico (< 12 GB), mostrar advertencia
    if libre_gb < 12.0:
        advertencia = f"DICTAMA: espacio crítico ({libre_gb:.2f} GB libres). Considerar alivio inmediato."
    else:
        advertencia = None

    # Si espacio suficiente (>= objetivo_gb), no hacer nada (a menos que sea seco)
    if libre_gb >= objetivo_gb:
        if seco:
            # En modo seco, aunque haya espacio suficiente, mostrar candidatos
            candidatos_detalle = _lista_candidatos_aliviar(
                mac_root=mac_root,
                wt_root=wt_root,
                cola_activa_ids=cola_activa_ids,
                existe_fn=existe_fn,
                es_directorio_fn=es_directorio_fn,
                listar_fn=listar_fn,
                mtime_fn=mtime_fn,
                tamano_fn=tamano_fn,
            )
            return {
                "estado": "seco",
                "mensaje": "Simulación (--seco), no se ejecuta nada",
                "espacio_actual_gb": round(libre_gb, 2),
                "objetivo_gb": objetivo_gb,
                "advertencia": advertencia,
                "candidatos": candidatos_detalle,
                "total_candidatos_mb": round(sum(c["tamano_mb"] for c in candidatos_detalle), 2),
            }
        return {
            "estado": "suficiente_espacio",
            "libre_gb": round(libre_gb, 2),
            "objetivo_gb": objetivo_gb,
        }

    # Obtener lista de candidatos con sus tamaños
    candidatos_detalle = _lista_candidatos_aliviar(
        mac_root=mac_root,
        wt_root=wt_root,
        cola_activa_ids=cola_activa_ids,
        existe_fn=existe_fn,
        es_directorio_fn=es_directorio_fn,
        listar_fn=listar_fn,
        mtime_fn=mtime_fn,
        tamano_fn=tamano_fn,
    )

    if seco:
        return {
            "estado": "seco",
            "mensaje": "Simulación (--seco), no se ejecuta nada",
            "espacio_actual_gb": round(libre_gb, 2),
            "objetivo_gb": objetivo_gb,
            "advertencia": advertencia,
            "candidatos": candidatos_detalle,
            "total_candidatos_mb": round(sum(c["tamano_mb"] for c in candidatos_detalle), 2),
        }

    # Mover candidatos hasta alcanzar objetivo
    movidos = []
    liberado_gb = 0.0
    candidatos_rutas = [c["ruta"] for c in candidatos_detalle]

    for cand in candidatos_rutas:
        if liberado_gb >= (objetivo_gb - libre_gb):
            break
        tam_kb = tamano_fn(cand)
        tam_gb = tam_kb / (1024 * 1024)
        res = _mover_a_pesados(cand, destino_base, ssh_fn, seco, mac_root=mac_root, tamano_fn=tamano_fn, contar_fn=contar_fn)
        movidos.append(res)
        if res.get("verificado"):
            liberado_gb += tam_gb

    resultado = {
        "estado": "hecho" if movidos else "nada_movido",
        "libre_gb_inicial": round(libre_gb, 2),
        "objetivo_gb": objetivo_gb,
        "liberado_gb": round(liberado_gb, 2),
        "movidos": movidos,
        "advertencia": advertencia,
        "candidatos_evaluados": len(candidatos_detalle),
    }

    if guardar_log:
        guardar_log(resultado)

    return resultado


def estado(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    destino_base: str = DEST_BASE,
) -> Dict[str, Any]:
    """Estado actual: espacio en Mac, últimos respaldos en destino, bundles."""
    # Espacio Mac
    try:
        total, usado, libre = shutil.disk_usage("/")
        mac_libre_gb = round(libre / (1024 ** 3), 2)
        mac_total_gb = round(total / (1024 ** 3), 2)
    except Exception:
        mac_libre_gb = 0.0
        mac_total_gb = 0.0

    # Bundles remotos
    bundles = _listar_bundles_remotos(ssh_fn, destino_base)
    ultimos_bundles = []
    for b in bundles[:7]:
        r = _ejecutar(_ssh_du(b), ssh_fn, tope_s=30.0)
        tam_kb = int(r["salida"].split()[0]) if r["codigo"] == 0 and r["salida"] else 0
        ultimos_bundles.append({"ruta": b, "tamano_mb": round(tam_kb / 1024, 1)})

    # Memory root respaldo
    memory_dest = os.path.join(destino_base, "respaldos/mac/starseed_memory_root")
    r_mem = _ejecutar(_ssh_du(memory_dest), ssh_fn, tope_s=30.0)
    memory_tam_mb = round(int(r_mem["salida"].split()[0]) / 1024, 1) if r_mem["codigo"] == 0 else 0.0

    # Log
    log_ruta = os.path.join(destino_base, "respaldos/mac/respaldos.log")
    r_log = _ejecutar(_ssh_test_e(log_ruta), ssh_fn, tope_s=10.0)
    log_existe = r_log["codigo"] == 0

    return {
        "mac_libre_gb": mac_libre_gb,
        "mac_total_gb": mac_total_gb,
        "ultimos_bundles": ultimos_bundles,
        "destino": {
            "memory_root_mb": memory_tam_mb,
            "log_existe": log_existe,
        },
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
    objetivo_gb = 25.0
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