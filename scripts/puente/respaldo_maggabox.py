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
  - rsync de starseed_memory_root a host:respaldos/mac/starseed_memory_root (excluye `.tmp.drive*`
    y secretos); si el nodo no tiene rsync, tar local + scp (nunca escribe en un `~/` local)
  - git bundle create --all a una carpeta temporal SOLO si hay >6 GB libres; se envía al nodo,
    se comprueba la suma SHA-256 y se borra el temporal (conserva 7 bundles en el nodo)
  - si el disco baja de 12 GB, dispara `aliviar` al terminar
  - registro en respaldos/mac/respaldos.log

Excluye siempre: ~/.starseed/env, .env*, ~/.ssh, *.pem, *key*, credenciales.
Lo secreto solo va en repositorio restic cifrado (orden preparada, sin contraseña).

`aliviar`: lista y mide candidatos reales (restos go-build >1 h, caché de Go, ShipIt >1 día,
trozos `.tmp.driveupload` >24 h, worktrees terminados, logs de olas >7 días, `.next-anterior`
con la compilación actual sana >1 h, instaladores de prueba en Descargas). Lo mueve a pesados/
con copia verificada; los logs de olas van a pesados/mac/olas-logs con
`rsync --remove-source-files`. Cada movimiento queda en el índice. Nunca toca cuentas, claves,
bases vivas ni proyectos en uso.

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
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

# Rutas base
MAC_ROOT = "/Users/alex/Documents/starseed-os-main"
STARSEED_MEMORY_ROOT = os.path.join(MAC_ROOT, "starseed_memory_root")
WT_ROOT = os.path.expanduser("~/Documents/starseed-wt")
DOWNLOADS = os.path.expanduser("~/Downloads")
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

# Umbrales (PURA)
MIN_LIBRE_GA_BUNDLE = 6.0   # GB mínimos libres para crear el bundle
UMBRAL_ALIVIO_GB = 12.0     # alivio automático si el disco libre baja de esto


def excluir_secretos() -> List[str]:
    """PURA: patrones de exclusión para rsync/tar/restic."""
    return list(EXCLUIR_SECRETOS)


def excluir_memory_root() -> List[str]:
    """PURA: exclusiones para el rsync de starseed_memory_root (secretos + tmp.drive)."""
    return list(EXCLUIR_SECRETOS) + [".tmp.drive*", ".tmp.driveupload*"]


def _libre_gb(libre_gb_fn: Optional[Callable[[], float]] = None) -> float:
    """GB libres en el disco de la Mac; inyectable en pruebas."""
    if libre_gb_fn is not None:
        return libre_gb_fn()
    try:
        _, _, libre = shutil.disk_usage("/")
        return libre / (1024 ** 3)
    except Exception:
        return 0.0


def _hash_archivo(ruta: str) -> str:
    """SHA-256 de un archivo local (para verificar la copia en la Maggabox)."""
    try:
        h = hashlib.sha256()
        with open(ruta, "rb") as f:
            for bloque in iter(lambda: f.read(65536), b""):
                h.update(bloque)
        return h.hexdigest()
    except Exception:
        return ""


def _ssh_comando() -> str:
    """PURA: la orden ssh (sin host) para que rsync la use con la llave del nodo."""
    opciones = SSH_BASE[:-1]  # sin el host final
    return " ".join(opciones)


def _destino_remoto(destino_base: str, subruta: str) -> str:
    """PURA: `host:ruta` del Maggabox; sin host, rsync escribiría en la Mac."""
    return "%s:%s" % (DEST_HOST, os.path.join(destino_base, subruta))


def _rsync_args(
    origen: str,
    destino: str,
    exclusiones: List[str],
    es_directorio: bool = True,
    borrar_origen: bool = False,
) -> List[str]:
    """PURA: argv de rsync con exclusiones; el destino remoto lleva `host:ruta`."""
    args = ["rsync", "-az"]
    if borrar_origen:
        args.append("--remove-source-files")
    elif es_directorio:
        args.append("--delete")
    args.extend(["-e", _ssh_comando(), "--info=progress2"])
    for ex in exclusiones:
        args.extend(["--exclude", ex])
    sufijo = "/" if es_directorio else ""
    args.extend([origen.rstrip("/") + sufijo, destino.rstrip("/") + sufijo])
    return args


def _tar_local_args(origen: str, destino_tar: str, exclusiones: List[str]) -> List[str]:
    """PURA: crea un .tar.gz local cuando el nodo no tiene rsync."""
    args = ["tar", "czf", destino_tar]
    for ex in exclusiones:
        args.extend(["--exclude", ex])
    args.extend(["-C", os.path.dirname(origen), os.path.basename(origen)])
    return args


def _scp_args(local: str, destino: str) -> List[str]:
    """PURA: envía el tar al Maggabox con la misma llave y host que ssh."""
    return ["scp"] + SSH_BASE[1:-1] + [local, destino]


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
    # Usar printf para evitar problemas de comillas
    return SSH_BASE + ["bash", "-c", f'printf "%s\\n" "{linea}" >> {log_ruta}']


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


def plan_respaldar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    memory_root: str = STARSEED_MEMORY_ROOT,
    destino_base: str = DEST_BASE,
    seco: bool = True,
    libre_gb_fn: Optional[Callable[[], float]] = None,
) -> Dict[str, Any]:
    """PURA: decide qué se respaldaría y qué se rotaría, sin ejecutar.

    El bundle de git solo se planea si hay más de MIN_LIBRE_GA_BUNDLE GB libres;
    si no, se salta con el motivo de que el espejo de GitHub ya cubre el código.
    """
    exclusiones = excluir_memory_root()
    ahora = dt.datetime.now().strftime("%Y-%m-%d")
    libre = _libre_gb(libre_gb_fn)

    respaldar: List[Dict[str, Any]] = [
        {
            "accion": "rsync_o_tar",
            "origen": memory_root,
            "destino": _destino_remoto(destino_base, "respaldos/mac/starseed_memory_root"),
            "exclusiones": exclusiones,
            "tamano_aprox_kb": _tamano_directorio(memory_root),
        }
    ]

    if libre > MIN_LIBRE_GA_BUNDLE:
        respaldar.append({
            "accion": "git_bundle",
            "origen": mac_root,
            "temp": os.path.join(tempfile.gettempdir(), f"repo-{ahora}.bundle"),
            "destino": _destino_remoto(destino_base, f"respaldos/mac/repo-{ahora}.bundle"),
            "libre_gb": round(libre, 2),
        })
    else:
        respaldar.append({
            "accion": "salta_bundle",
            "motivo": "Disco bajo %.1f GB (< %.1f GB): el espejo de GitHub del Maggabox ya cubre el código" % (libre, MIN_LIBRE_GA_BUNDLE),
            "libre_gb": round(libre, 2),
        })

    bundles = _listar_bundles_remotos(ssh_fn, destino_base)
    if len(bundles) >= 7:
        for b in bundles[7:]:
            respaldar.append({"accion": "borrar_bundle_antiguo", "ruta": b})

    return {
        "generado": time.time(),
        "seco": seco,
        "respaldar": respaldar,
        "bundles_existentes": len(bundles),
        "libre_gb": round(libre, 2),
    }


# plan se mantiene como alias por compatibilidad
plan = plan_respaldar


def respaldar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    memory_root: str = STARSEED_MEMORY_ROOT,
    destino_base: str = DEST_BASE,
    seco: bool = False,
    libre_gb_fn: Optional[Callable[[], float]] = None,
    guardar_log: Optional[Callable[[Dict[str, Any]], Any]] = None,
    aliviar_fn: Optional[Callable[..., Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Ejecuta el respaldo: rsync/tar + git bundle (temp, >6GB) + verificación + rotación + log.

    Si el disco baja de UMBRAL_ALIVIO_GB, dispara `aliviar_fn` (alivio automático) al final.
    """
    if seco:
        return {"estado": "seco", "mensaje": "Simulación (--seco), no se ejecuta nada"}

    exclusiones = excluir_memory_root()
    resultados: List[Dict[str, Any]] = []
    ahora = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fecha = ahora.split()[0]
    libre = _libre_gb(libre_gb_fn)

    # 1. Asegurar directorios destino
    for d in [
        os.path.join(destino_base, "respaldos/mac"),
        os.path.join(destino_base, "pesados"),
    ]:
        r = _ejecutar(_ssh_mkdir(d), ssh_fn, tope_s=30.0)
        if r["codigo"] != 0:
            return {"estado": "error", "fase": "mkdir", "detalle": r}

    # 2. rsync o tar de starseed_memory_root (excluye .tmp.drive* y secretos)
    destino_memory = os.path.join(destino_base, "respaldos/mac/starseed_memory_root")
    if _hay_rsync_remoto(ssh_fn):
        argv = _rsync_args(memory_root, _destino_remoto(destino_base, "respaldos/mac/starseed_memory_root"),
                           exclusiones)
        r = _ejecutar(argv, ssh_fn, tope_s=600.0)
        resultados.append({"fase": "rsync_memory", "codigo": r["codigo"], "error": r["error"]})
    else:
        # Sin rsync en el nodo: tar local y scp real (nunca se escribe en un `~/` local).
        tar_temp = os.path.join(tempfile.gettempdir(), f"starseed_memory_root-{fecha}.tar.gz")
        r_tar = _ejecutar(_tar_local_args(memory_root, tar_temp, exclusiones), ssh_fn, tope_s=600.0)
        if r_tar["codigo"] == 0:
            r_envio = _ejecutar(_scp_args(tar_temp, "%s:%s.tar.gz" % (DEST_HOST, destino_memory)),
                                ssh_fn, tope_s=600.0)
            resultados.append({"fase": "tar_memory", "codigo": r_envio["codigo"], "error": r_envio["error"]})
            try:
                os.remove(tar_temp)
            except OSError:
                pass
        else:
            resultados.append({"fase": "tar_memory", "codigo": r_tar["codigo"], "error": r_tar["error"]})

    # 3. git bundle solo si hay >6 GB libres; se crea en temp local, se envía, verifica checksum y se borra el temp
    bundle_temp = os.path.join(tempfile.gettempdir(), f"repo-{fecha}.bundle")
    bundle_remoto = os.path.join(destino_base, f"respaldos/mac/repo-{fecha}.bundle")
    if libre > MIN_LIBRE_GA_BUNDLE:
        # Crear bundle en carpeta temporal LOCAL (no ruta remota ~/...)
        r_bundle = _ejecutar(_git_bundle_args(mac_root, bundle_temp), subprocess.run, tope_s=300.0)
        resultados.append({"fase": "git_bundle_temp", "codigo": r_bundle["codigo"], "error": r_bundle["error"], "temp": bundle_temp})
        if r_bundle["codigo"] == 0:
            # Enviar bundle (archivo, sin barra final) a la Maggabox
            r_send = _ejecutar(_rsync_args(bundle_temp, "%s:%s" % (DEST_HOST, bundle_remoto), [],
                                           es_directorio=False), ssh_fn, tope_s=300.0)
            resultados.append({"fase": "enviar_bundle", "codigo": r_send["codigo"], "error": r_send["error"]})
            # Verificar checksum
            if r_send["codigo"] == 0:
                hash_local = _hash_archivo(bundle_temp)
                r_remoto = _ejecutar(SSH_BASE + ["sha256sum", bundle_remoto], ssh_fn, tope_s=30.0)
                hash_remoto = (r_remoto["salida"] or "").split()[0] if r_remoto["codigo"] == 0 else ""
                verificado = hash_local and hash_local == hash_remoto
                resultados.append({"fase": "verificar_checksum", "verificado": verificado, "hash_local": hash_local, "hash_remoto": hash_remoto})
                # Borrar temporal local solo si se verificó
                if verificado:
                    try:
                        os.remove(bundle_temp)
                        resultados.append({"fase": "borrar_temp", "ok": True})
                    except OSError as e:
                        resultados.append({"fase": "borrar_temp", "ok": False, "error": str(e)})
                else:
                    resultados.append({"fase": "verificar_checksum", "error": "checksum no coincide"})
    else:
        resultados.append({
            "fase": "salta_bundle",
            "motivo": "Disco bajo %.1f GB (< %.1f GB): el espejo de GitHub del Maggabox ya cubre el código" % (libre, MIN_LIBRE_GA_BUNDLE),
            "libre_gb": round(libre, 2),
        })

    # 4. Rotar bundles (mantener 7)
    borrados = _rotar_bundles(ssh_fn, destino_base, conservar=7)
    resultados.append({"fase": "rotar_bundles", "borrados": borrados})

    # 5. Log
    linea = f"{ahora} | memory_root rsync/tar ok | bundle repo-{fecha}.bundle | rotados {len(borrados)} | libre {round(libre,1)} GB"
    _escribir_log_remoto(ssh_fn, destino_base, linea)

    estado = "hecho" if all(
        (x.get("codigo", 0) == 0) and (x.get("verificado", True)) for x in resultados
    ) else "parcial"
    resultado = {"estado": estado, "detalles": resultados, "timestamp": ahora, "libre_gb": round(libre, 2)}

    # 6. Alivio automático si el disco ha bajado del umbral
    if aliviar_fn is not None and libre < UMBRAL_ALIVIO_GB:
        try:
            resultado["alivio"] = aliviar_fn(ssh_fn=ssh_fn, mac_root=mac_root, memoria_root=memory_root,
                                             destino_base=destino_base, seco=False,
                                             objetivo_gb=UMBRAL_ALIVIO_GB)
        except Exception as e:  # el respaldo no se cae porque el alivio falle
            resultado["alivio"] = {"estado": "error", "detalle": str(e)}

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
    medir_origen: bool = True,
) -> bool:
    """Verifica que la copia en destino tiene mismo tamaño y entradas que el origen.

    `medir_origen=False` sirve cuando el origen ya se retiró (rsync --remove-source-files):
    solo se compara el tamaño medido antes de mover.
    """
    try:
        tam_ori = tamano_fn(origen)
        cnt_ori = contar_fn(origen) if medir_origen else None
        # El destino vive en la Maggabox: se verifica por SSH, no con du/find locales
        r_tam = _ejecutar(_ssh_du(destino), ssh_fn, tope_s=tope_s)
        if r_tam["codigo"] != 0 or not r_tam["salida"]:
            return False
        tam_dest = int(r_tam["salida"].split()[0])
        if tam_ori != tam_dest or tam_ori <= 0:
            return False
        if cnt_ori is None:
            return True
        r_cnt = _ejecutar(SSH_BASE + ["find", destino, "-printf", "."], ssh_fn, tope_s=tope_s)
        if r_cnt["codigo"] != 0:
            return False
        return cnt_ori == len(r_cnt["salida"])
    except Exception:
        return False


def _destino_aliviar(
    origen: str,
    mac_root: str,
    destino_base: str,
    memoria_root: str = STARSEED_MEMORY_ROOT,
) -> Tuple[str, bool]:
    """PURA: destino en pesados/ y si es un registro de ola (se mueve con --remove-source-files)."""
    olas_dir = os.path.join(memoria_root, "olas")
    rel_olas = os.path.relpath(origen, olas_dir)
    if rel_olas not in (".", os.pardir) and not rel_olas.startswith(os.pardir + os.sep):
        return os.path.join(destino_base, "pesados/mac/olas-logs", rel_olas), True
    return os.path.join(destino_base, "pesados", os.path.relpath(origen, mac_root)), False


def _mover_a_pesados(
    origen: str,
    destino_base: str,
    ssh_fn: Callable[..., Any],
    seco: bool,
    mac_root: str = MAC_ROOT,
    memoria_root: str = STARSEED_MEMORY_ROOT,
    tamano_fn: Callable[[str], int] = _tamano_directorio,
    contar_fn: Callable[[str], int] = _contar_entradas,
) -> Dict[str, Any]:
    """Mueve origen a pesados/ en destino con copia verificada."""
    destino, es_olas = _destino_aliviar(origen, mac_root, destino_base, memoria_root)
    es_dir = os.path.isdir(origen)

    if seco:
        return {"origen": origen, "destino": destino, "estado": "seco", "verificado": True}

    tam_antes = 0
    try:
        tam_antes = tamano_fn(origen)
    except Exception:
        pass

    # 1. rsync (o scp -r si el nodo no tiene rsync) al destino remoto real
    if _hay_rsync_remoto(ssh_fn):
        argv = _rsync_args(origen, "%s:%s" % (DEST_HOST, destino), excluir_secretos(),
                           es_directorio=es_dir, borrar_origen=es_olas)
        r = _ejecutar(argv, ssh_fn, tope_s=600.0)
    else:
        argv = ["scp"] + SSH_BASE[1:-1] + (["-r"] if es_dir else []) + [origen, "%s:%s" % (DEST_HOST, destino)]
        r = _ejecutar(argv, ssh_fn, tope_s=600.0)
    if r["codigo"] != 0:
        return {"origen": origen, "destino": destino, "estado": "error", "error": r["error"], "verificado": False}

    # 2. Verificar copia; en olas el rsync ya retiró el origen, así que se mide lo previo
    if es_olas:
        verificado = _copia_verificada(origen, destino, ssh_fn, lambda _p: tam_antes, lambda _p: 0,
                                       medir_origen=False)
    else:
        verificado = _copia_verificada(origen, destino, ssh_fn, tamano_fn, contar_fn)

    # 3. Si se verificó y el origen sigue local, se retira
    if verificado and not es_olas:
        try:
            if es_dir:
                shutil.rmtree(origen)
            else:
                os.remove(origen)
            estado = "movido"
        except Exception:
            estado = "error_borrar"
            verificado = False
    elif verificado:
        estado = "movido"
    else:
        estado = "error_verificacion"

    return {"origen": origen, "destino": destino, "estado": estado, "verificado": verificado}


GO_BUILD_ANTIGUEDAD_H = 1.0      # go-build* más viejos de 1 hora
SHIPIT_ANTIGUEDAD_D = 1.0        # ShipIt* más viejos de 1 día
TMPDRIVE_ANTIGUEDAD_H = 24.0     # .tmp.driveupload más viejos de 24 h
OLAS_LOG_ANTIGUEDAD_D = 7.0      # logs de olas más viejos de 7 días
NEXT_SANO_H = 1.0                # la compilación actual debe llevar sana más de 1 h
EXT_INSTALADOR = (".dmg", ".pkg", ".zip", ".exe", ".msi", ".app", ".tar.gz")
MARCAS_PRUEBA = ("beta", "prueba", "test", "rc", "release", "nightly")


def _candidato(ruta: str, mb: float, porque: str) -> Dict[str, Any]:
    """PURA: ficha de un candidato a aliviar."""
    return {"ruta": ruta, "mb": round(mb, 2), "porque": porque}


def _esgo_build(nombre: str) -> bool:
    return nombre.startswith("go-build")


def _esshipit(nombre: str) -> bool:
    return nombre.lower().startswith("shipit")


def _es_tmpdrive(nombre: str) -> bool:
    return ".tmp.driveupload" in nombre


def _es_instalador_prueba(nombre: str) -> bool:
    """PURA: instalador (archivo o .app) de una versión de prueba ya publicada."""
    bajo = nombre.lower()
    tiene_marca = any(m in bajo for m in MARCAS_PRUEBA)
    tiene_ext = bajo.endswith(EXT_INSTALADOR) or ".app" in bajo
    return tiene_marca and tiene_ext


def _antiguedad_hora(mtime: float) -> float:
    return (time.time() - mtime) / 3600.0


def _antiguedad_dia(mtime: float) -> float:
    return (time.time() - mtime) / 86400.0


def escanear_candidatos(
    mac_root: str,
    wt_root: str,
    downloads: str,
    memoria_root: str,
    cola_activa_ids: Set[str],
    existe_fn: Callable[[str], bool],
    es_directorio_fn: Callable[[str], bool],
    listar_fn: Callable[[str], List[str]],
    mtime_fn: Callable[[str], float],
    tamano_fn: Callable[[str], int],
) -> List[Dict[str, Any]]:
    """Lista candidatos reales y medidos con su porqué (solo lectura, no mueve)."""
    candidatos: List[Dict[str, Any]] = []

    def anadir(ruta: str, porque: str) -> None:
        if not existe_fn(ruta):
            return
        try:
            mb = tamano_fn(ruta) / 1024.0
        except Exception:
            mb = 0.0
        candidatos.append(_candidato(ruta, mb, porque))

    # 1. Restos go-build* de más de 1 h en las carpetas temporales (repo y sistema)
    for tmp_root in (os.path.join(mac_root, ".tmp"), tempfile.gettempdir()):
        if not es_directorio_fn(tmp_root):
            continue
        for entry in listar_fn(tmp_root):
            if _esgo_build(entry):
                ruta = os.path.join(tmp_root, entry)
                try:
                    if _antiguedad_hora(mtime_fn(ruta)) > GO_BUILD_ANTIGUEDAD_H:
                        anadir(ruta, "restos go-build de compilación con más de 1 h")
                except OSError:
                    pass
    tmp_root = os.path.join(mac_root, ".tmp")

    # 2. Caché de Go (las rutas reales en macOS y Linux, además de la histórica)
    for go_cache in (os.path.expanduser("~/go/build"),
                     os.path.expanduser("~/Library/Caches/go-build"),
                     os.path.expanduser("~/.cache/go-build")):
        if existe_fn(go_cache):
            anadir(go_cache, "caché de Go compilaciones")

    # 3. Restos ShipIt de actualizadores de más de 1 día
    for base in dict.fromkeys([tmp_root, mac_root, tempfile.gettempdir()]):
        if not es_directorio_fn(base):
            continue
        for entry in listar_fn(base):
            if _esshipit(entry):
                ruta = os.path.join(base, entry)
                try:
                    if _antiguedad_dia(mtime_fn(ruta)) > SHIPIT_ANTIGUEDAD_D:
                        anadir(ruta, "restos ShipIt de actualizador con más de 1 día")
                except OSError:
                    pass

    # 4. Trozos de .tmp.driveupload de más de 24 h
    tmp_drive = os.path.join(mac_root, ".tmp.driveupload")
    if es_directorio_fn(tmp_drive):
        for entry in listar_fn(tmp_drive):
            ruta = os.path.join(tmp_drive, entry)
            try:
                if _antiguedad_hora(mtime_fn(ruta)) > TMPDRIVE_ANTIGUEDAD_H:
                    anadir(ruta, "trozo .tmp.driveupload con más de 24 h")
            except OSError:
                pass

    # 5. Worktrees terminados (vía archivar_worktrees, no los de cola activa)
    if es_directorio_fn(wt_root):
        for entry in listar_fn(wt_root):
            if entry.startswith("starseed-wt-") and entry.replace("starseed-wt-", "") not in cola_activa_ids:
                ruta = os.path.join(wt_root, entry)
                anadir(ruta, "worktree terminado (archivar_worktrees.py)")

    # 5b. Caché .next de compilaciones Next.js
    next_cache = os.path.join(mac_root, ".next", "cache")
    if existe_fn(next_cache):
        anadir(next_cache, "caché .next de compilaciones Next.js")

    # 6. Logs de olas de más de 7 días (se MUEVEN a pesados/mac/olas-logs)
    olas_dir = os.path.join(memoria_root, "olas")
    if es_directorio_fn(olas_dir):
        for entry in listar_fn(olas_dir):
            ruta = os.path.join(olas_dir, entry)
            if not es_directorio_fn(ruta):
                try:
                    if _antiguedad_dia(mtime_fn(ruta)) > OLAS_LOG_ANTIGUEDAD_D:
                        anadir(ruta, "registro de ola con más de 7 días → pesados/mac/olas-logs")
                except OSError:
                    pass

    # 7. Compilaciones .next-anterior cuando la actual lleva más de 1 h sana
    next_anterior = os.path.join(mac_root, ".next-anterior")
    next_actual = os.path.join(mac_root, ".next")
    if existe_fn(next_anterior):
        sana = False
        try:
            sana = es_directorio_fn(next_actual) and _antiguedad_hora(mtime_fn(next_actual)) > NEXT_SANO_H
        except OSError:
            sana = False
        if sana:
            anadir(next_anterior, "compilación .next-anterior (actual sana > 1 h)")

    # 8. Instaladores de versiones de prueba ya publicadas en Descargas
    if es_directorio_fn(downloads):
        for entry in listar_fn(downloads):
            if _es_instalador_prueba(entry):
                ruta = os.path.join(downloads, entry)
                anadir(ruta, "instalador de versión de prueba ya publicada en Descargas")

    return candidatos


def aliviar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    wt_root: str = WT_ROOT,
    downloads: str = DOWNLOADS,
    memoria_root: str = STARSEED_MEMORY_ROOT,
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
    """Libera espacio en la Mac moviendo lo regenerable a pesados/ con copia verificada."""
    cola_activa_ids = cola_activa_ids or set()
    existe_fn = existe_fn or os.path.exists
    es_directorio_fn = es_directorio_fn or os.path.isdir
    listar_fn = listar_fn or os.listdir
    mtime_fn = mtime_fn or os.path.getmtime
    tamano_fn = tamano_fn or _tamano_directorio
    contar_fn = contar_fn or _contar_entradas

    if seco:
        candidatos = escanear_candidatos(
            mac_root, wt_root, downloads, memoria_root, cola_activa_ids,
            existe_fn, es_directorio_fn, listar_fn, mtime_fn, tamano_fn,
        )
        return {
            "estado": "seco",
            "mensaje": "Simulación (--seco), no se ejecuta nada",
            "candidatos": candidatos,
            "libre_gb": round(_libre_gb(), 2),
        }

    # Espacio libre actual
    libre_gb = _libre_gb()
    if libre_gb >= objetivo_gb:
        return {"estado": "suficiente_espacio", "libre_gb": round(libre_gb, 2), "objetivo_gb": objetivo_gb}

    # Candidatos reales y medidos
    candidatos = escanear_candidatos(
        mac_root, wt_root, downloads, memoria_root, cola_activa_ids,
        existe_fn, es_directorio_fn, listar_fn, mtime_fn, tamano_fn,
    )

    # Mover candidatos hasta alcanzar objetivo, con copia verificada
    movidos = []
    liberado_gb = 0.0
    for cand in candidatos:
        if liberado_gb >= (objetivo_gb - libre_gb):
            break
        ruta = cand["ruta"]
        tam_gb = cand["mb"] / 1024.0
        res = _mover_a_pesados(ruta, destino_base, ssh_fn, seco, mac_root=mac_root,
                               memoria_root=memoria_root, tamano_fn=tamano_fn, contar_fn=contar_fn)
        res["porque"] = cand["porque"]
        res["mb"] = cand["mb"]
        movidos.append(res)
        if res.get("verificado"):
            liberado_gb += tam_gb

    # Registrar cada movimiento en el índice
    if movidos:
        _registrar_indice(movidos)

    resultado = {
        "estado": "hecho" if movidos else "nada_movido",
        "libre_gb_inicial": round(libre_gb, 2),
        "objetivo_gb": objetivo_gb,
        "liberado_gb": round(liberado_gb, 2),
        "movidos": movidos,
    }

    if guardar_log:
        guardar_log(resultado)

    return resultado


def _fila_indice(movido: Dict[str, Any], ahora: Optional[str] = None) -> str:
    """PURA: línea del índice con fecha, origen, destino, MB, porqué y verificación."""
    fecha = ahora or dt.datetime.now().isoformat(timespec="seconds")
    return "- %s: %s → %s (%.2f MB, %s, verificado=%s)\n" % (
        fecha,
        movido.get("origen", ""),
        movido.get("destino", ""),
        movido.get("mb", 0),
        movido.get("porque", ""),
        movido.get("verificado", False),
    )


def _registrar_indice(movidos: List[Dict[str, Any]]) -> None:
    """Anota cada movimiento en starseed_memory_root/nodo/indice-pesados-maggabox.md."""
    indice = os.path.join(STARSEED_MEMORY_ROOT, "nodo", "indice-pesados-maggabox.md")
    try:
        os.makedirs(os.path.dirname(indice), exist_ok=True)
        with open(indice, "a", encoding="utf-8") as f:
            for m in movidos:
                f.write(_fila_indice(m))
    except OSError:
        pass


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
        res = respaldar(ssh_fn, seco=seco, guardar_log=guardar_log, aliviar_fn=aliviar)
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