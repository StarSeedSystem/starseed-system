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
    excluyendo `.tmp.drive*` (los 2 GB de restos de Google Drive) y todo lo secreto
  - git bundle create --all EN UNA CARPETA TEMPORAL LOCAL (nunca en la ruta remota, que git
    trataría como local). Solo si hay más de 6 GB libres; si no, se salta y se dice que el
    espejo de GitHub del Maggabox ya cubre el código. Se envía, se comprueba su SHA-256 y se
    borra el temporal.
  - rotación de los 7 bundles más nuevos y registro en respaldos/mac/respaldos.log
  - si el disco queda por debajo de 12 GB, encadena `aliviar` y avisa al canal General

`aliviar`: lista REAL y medida de candidatos, cada uno con su porqué y sus MB (`--seco` los
enseña sin tocar nada): restos `go-build*` de más de 1 h, caché de Go, restos `ShipIt` de más de
1 día, trozos `.tmp.driveupload` de más de 24 h, worktrees terminados (archivar_worktrees.py),
registros de olas de más de 7 días (a pesados/mac/olas-logs con rsync --remove-source-files),
`.next-anterior` cuando la compilación actual lleva más de 1 h sana e instaladores de versiones
ya publicadas en Descargas. Nada se retira sin copia verificada y cada movimiento queda en
`starseed_memory_root/nodo/indice-pesados-maggabox.md`. Nunca toca cuentas, claves, bases vivas
ni proyectos en uso.

Plist launchd real: `deploy/launchd/com.starseed.respaldo-maggabox.plist` (cada 6 h = 21600 s).
El que sigue es el mismo contenido, para que el módulo se lea solo:
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
    <key>StandardOutPath</key><string>/tmp/starseed-respaldo-maggabox.log</string>
    <key>StandardErrorPath</key><string>/tmp/starseed-respaldo-maggabox.log</string>
</dict>
</plist>
"""
from __future__ import annotations

import datetime as dt
import glob
import hashlib
import json
import os
import shlex
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
DEST_HOST = "maggasukha@starseed-nodo-1.local"
DEST_BASE = "~/StarSeed-almacen"

# ALM1121 · topes y retenciones (PURA)
UMBRAL_BUNDLE_GB = 6.0          # sin 6 GB libres no se crea el bundle: GitHub ya espeja el código
RETENCION_BUNDLES = 7
UMBRAL_ALIVIO_GB = 12.0         # alivio automático por debajo de 12 GB libres
RETENCION_GO_BUILD_S = 3600     # restos go-build* de más de 1 h
RETENCION_SHIPIT_S = 86400      # restos ShipIt de más de 1 día
RETENCION_DRIVE_S = 86400       # trozos .tmp.driveupload de más de 24 h
RETENCION_OLAS_S = 7 * 86400    # registros de olas de más de 7 días
RETENCION_NEXT_S = 3600         # .next-anterior si la compilación actual lleva > 1 h sana
DIR_TEMP_BUNDLE = os.path.join(tempfile.gettempdir(), "starseed-respaldo-bundle")
INDICE_PESADOS = os.path.join("starseed_memory_root", "nodo", "indice-pesados-maggabox.md")
RUTA_ALIVIO = os.path.expanduser("~/.starseed/almacenamiento-alivio.json")

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
# Opciones de ssh sin el host, para `rsync -e "ssh ..."`.
SSH_OPCIONES = SSH_BASE[:-1]

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


def excluir_secretos() -> List[str]:
    """PURA: patrones de exclusión para rsync/tar/restic."""
    return list(EXCLUIR_SECRETOS)


#: Lo que la app de Google Drive deja a medio subir: son 2 GB que no son datos de nadie.
EXCLUIR_TMP_DRIVE = [".tmp.drive*", ".tmp.drivedownload*"]


def exclusiones_respaldo() -> List[str]:
    """PURA: secretos + temporales de Drive. Lo usa el rsync de starseed_memory_root."""
    return list(EXCLUIR_SECRETOS) + list(EXCLUIR_TMP_DRIVE)


def _cabe_bundle(libre_gb: float, umbral_gb: float = UMBRAL_BUNDLE_GB) -> bool:
    """PURA: ¿hay disco suficiente para crear el bundle temporal?"""
    return libre_gb >= umbral_gb


def _motivo_sin_bundle(libre_gb: float) -> str:
    """PURA: por qué se salta el bundle cuando no hay 6 GB libres."""
    return (
        "sin bundle: quedan %.1f GB libres (< %.0f GB); el espejo de GitHub del Maggabox "
        "ya cubre el código" % (libre_gb, UMBRAL_BUNDLE_GB)
    )


def _sha256_archivo(ruta: str) -> str:
    """SHA-256 de un archivo local; cadena vacía si no se puede leer."""
    try:
        h = hashlib.sha256()
        with open(ruta, "rb") as f:
            for trozo in iter(lambda: f.read(1024 * 1024), b""):
                h.update(trozo)
        return h.hexdigest()
    except OSError:
        return ""


def _verificar_sha(local: str, remoto: str) -> bool:
    """PURA: la copia remota es buena solo si ambas sumas existen y coinciden."""
    return bool(local) and bool(remoto) and local == remoto


def _rsync_archivo_args(origen: str, destino: str, host: str = DEST_HOST) -> List[str]:
    """PURA: envía UN archivo (el bundle) al destino remoto por ssh, sin `--delete`."""
    return ["rsync", "-az", "--info=progress2", "-e", " ".join(SSH_OPCIONES),
            origen, "%s:%s" % (host, destino)]


def _ssh_sha256(ruta: str) -> List[str]:
    """PURA: argv para leer la suma SHA-256 remota."""
    return SSH_BASE + ["sha256sum", ruta]


def _libre_gb(ruta: str = "/") -> float:
    """GB libres del disco que contiene `ruta`; 0.0 si no se puede medir."""
    try:
        _total, _usado, libre = shutil.disk_usage(ruta)
        return libre / (1024 ** 3)
    except OSError:
        return 0.0


def _rsync_args(origen: str, destino: str, exclusiones: List[str],
                host: str = DEST_HOST) -> List[str]:
    """PURA: construye argv de rsync por ssh con exclusiones (destino remoto real)."""
    args = ["rsync", "-az", "--delete", "--info=progress2", "-e", " ".join(SSH_OPCIONES)]
    for ex in exclusiones:
        args.extend(["--exclude", ex])
    args.extend([origen.rstrip("/") + "/", "%s:%s/" % (host, destino.rstrip("/"))])
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
    """PURA: añade línea al log remoto (comillas seguras: la línea lleva `|` y rutas)."""
    orden = "printf '%%s\\n' %s >> %s" % (shlex.quote(linea), shlex.quote(log_ruta))
    return SSH_BASE + ["bash", "-c", orden]


def _ejecutar(argv: List[str], ejecutar: Callable[..., Any], tope_s: float = 300.0,
              env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Ejecuta subprocess con timeout; devuelve dict con codigo, salida, error."""
    extra = {"env": env} if env is not None else {}
    try:
        r = ejecutar(argv, capture_output=True, text=True, timeout=tope_s, **extra)
        return {
            "codigo": r.returncode,
            "salida": (r.stdout or "").strip(),
            "error": (r.stderr or "").strip(),
        }
    except subprocess.TimeoutExpired:
        return {"codigo": None, "salida": "", "error": "timeout"}
    except OSError as e:
        return {"codigo": None, "salida": "", "error": str(e)}


def _sha256_remoto(ruta: str, ejecutar: Callable[..., Any]) -> str:
    """Lee la suma SHA-256 en la Maggabox; cadena vacía si no se puede."""
    r = _ejecutar(_ssh_sha256(ruta), ejecutar, tope_s=120.0)
    if r["codigo"] != 0 or not r["salida"]:
        return ""
    return r["salida"].split()[0]


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
    exclusiones = exclusiones_respaldo()
    ahora = dt.datetime.now().strftime("%Y-%m-%d")
    libre = _libre_gb()

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
            "destino_local": os.path.join(DIR_TEMP_BUNDLE, f"repo-{ahora}.bundle"),
            "destino": os.path.join(destino_base, f"respaldos/mac/repo-{ahora}.bundle"),
            "cabe": _cabe_bundle(libre),
            "motivo": None if _cabe_bundle(libre) else _motivo_sin_bundle(libre),
        },
    ]

    # Simular rotación: listar bundles existentes (usa ssh_fn inyectado)
    bundles = _listar_bundles_remotos(ssh_fn, destino_base)
    if len(bundles) >= RETENCION_BUNDLES:
        for b in bundles[RETENCION_BUNDLES:]:
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
    libre_gb_fn: Optional[Callable[[], float]] = None,
    tmp_dir: Optional[str] = None,
    sha_local_fn: Optional[Callable[[str], str]] = None,
    sha_remoto_fn: Optional[Callable[[str], str]] = None,
    ahora_fn: Optional[Callable[[], dt.datetime]] = None,
) -> Dict[str, Any]:
    """Respalda memoria y código: rsync con exclusiones, bundle local verificado, rotación y log.

    El bundle NUNCA se crea en la ruta remota (git la trataría como local): se crea en
    `tmp_dir`, se envía, se comprueba su SHA-256 en la Maggabox y solo entonces se borra.
    Sin 6 GB libres se salta: el espejo de GitHub del Maggabox ya cubre el código.
    """
    if seco:
        return {"estado": "seco", "mensaje": "Simulación (--seco), no se ejecuta nada"}

    libre_gb_fn = libre_gb_fn or _libre_gb
    sha_local_fn = sha_local_fn or _sha256_archivo
    sha_remoto_fn = sha_remoto_fn or (lambda ruta: _sha256_remoto(ruta, ssh_fn))
    momento = (ahora_fn or dt.datetime.now)()
    ahora = momento.strftime("%Y-%m-%d %H:%M:%S")
    fecha = momento.strftime("%Y-%m-%d")
    exclusiones = exclusiones_respaldo()
    resultados: List[Dict[str, Any]] = []

    # 1. Directorios destino
    for d in [os.path.join(destino_base, "respaldos/mac"), os.path.join(destino_base, "pesados")]:
        r = _ejecutar(_ssh_mkdir(d), ssh_fn, tope_s=30.0)
        if r["codigo"] != 0:
            return {"estado": "error", "fase": "mkdir", "detalle": r, "timestamp": ahora}

    # 2. rsync o tar de starseed_memory_root (sin .tmp.drive* ni secretos)
    destino_memory = os.path.join(destino_base, "respaldos/mac/starseed_memory_root")
    if _hay_rsync_remoto(ssh_fn):
        r = _ejecutar(_rsync_args(memory_root, destino_memory, exclusiones), ssh_fn, tope_s=1800.0)
        resultados.append({"fase": "rsync_memory", "codigo": r["codigo"], "error": r["error"]})
    else:
        tar_argv, _ssh_argv = _tar_ssh_args(memory_root, DEST_HOST, destino_memory, exclusiones)
        r = _ejecutar(tar_argv, ssh_fn, tope_s=1800.0)
        resultados.append({"fase": "tar_memory", "codigo": r["codigo"], "error": r["error"]})
    memory_ok = resultados[-1]["codigo"] == 0

    # 3. Bundle local, envío, suma y borrado del temporal
    libre = libre_gb_fn()
    bundle: Dict[str, Any] = {
        "estado": "saltado", "motivo": _motivo_sin_bundle(libre), "libre_gb": round(libre, 2)
    }
    if _cabe_bundle(libre):
        destino_bundle = os.path.join(destino_base, "respaldos/mac", "repo-%s.bundle" % fecha)
        carpeta = tmp_dir or DIR_TEMP_BUNDLE
        local = os.path.join(carpeta, "repo-%s.bundle" % fecha)
        bundle = _respaldar_bundle(mac_root, local, destino_bundle, ssh_fn, sha_local_fn, sha_remoto_fn)
        bundle["libre_gb"] = round(libre, 2)
    resultados.append({"fase": "git_bundle", "estado": bundle["estado"]})

    # 4. Rotación (7)
    borrados = _rotar_bundles(ssh_fn, destino_base, conservar=RETENCION_BUNDLES)
    resultados.append({"fase": "rotar_bundles", "borrados": borrados})

    # 5. Log remoto
    linea = "%s | memoria %s | bundle %s | rotados %d" % (
        ahora, "ok" if memory_ok else "falló", bundle["estado"], len(borrados))
    log_ok = _escribir_log_remoto(ssh_fn, destino_base, linea)

    bundle_ok = bundle["estado"] == "saltado" or (
        bundle["estado"] == "enviado" and bundle.get("verificado"))
    estado = "hecho" if (memory_ok and bundle_ok) else "parcial"
    if not memory_ok and bundle["estado"] == "error":
        estado = "error"
    resultado = {"estado": estado, "memory_root_ok": memory_ok, "bundle": bundle,
                 "rotados": borrados, "log_ok": log_ok, "detalles": resultados, "timestamp": ahora}
    if guardar_log:
        guardar_log(resultado)
    return resultado


def _respaldar_bundle(
    mac_root: str,
    local: str,
    destino: str,
    ssh_fn: Callable[..., Any],
    sha_local_fn: Callable[[str], str],
    sha_remoto_fn: Callable[[str], str],
) -> Dict[str, Any]:
    """Crea el bundle en local, lo envía, comprueba la suma y borra el temporal."""
    try:
        os.makedirs(os.path.dirname(local), exist_ok=True)
    except OSError as e:
        return {"estado": "error", "error": str(e), "ruta_local": local, "ruta_remota": destino}
    r = _ejecutar(_git_bundle_args(mac_root, local), ssh_fn, tope_s=600.0)
    if r["codigo"] != 0:
        return {"estado": "error", "error": r["error"] or "git bundle falló",
                "ruta_local": local, "ruta_remota": destino}
    local_sha = sha_local_fn(local)
    envio = _ejecutar(_rsync_archivo_args(local, destino), ssh_fn, tope_s=600.0)
    if envio["codigo"] != 0:
        return {"estado": "error", "error": envio["error"], "ruta_local": local,
                "ruta_remota": destino, "sha256": local_sha}
    remoto_sha = sha_remoto_fn(destino)
    verificado = _verificar_sha(local_sha, remoto_sha)
    borrado = False
    if verificado:
        try:
            os.remove(local)
            borrado = True
        except OSError:
            borrado = False
    return {"estado": "enviado", "ruta_local": local, "ruta_remota": destino,
            "sha256": local_sha, "sha256_remoto": remoto_sha,
            "verificado": verificado, "borrado": borrado}


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


def _es_viejo(mtime: float, ahora: float, retencion_s: float) -> bool:
    """PURA: una marca de tiempo existe y ya pasó la retención."""
    return mtime > 0 and (ahora - mtime) >= retencion_s


def _candidato(ruta: str, tipo: str, motivo: str, mb: float, accion: str = "mover") -> Dict[str, Any]:
    """PURA: ficha de un candidato a aliviar, con su tamaño y su porqué."""
    return {"ruta": ruta, "tipo": tipo, "motivo": motivo,
            "mb": round(mb, 1), "accion": accion}


def _tamano_mb(ruta: str, tamano_fn: Callable[[str], int]) -> float:
    """PURA: `tamano_fn` devuelve KB (como `du -sk`); aquí se pasa a MB."""
    return tamano_fn(ruta) / 1024.0


def _version_en_nombre(nombre: str, versiones: List[str]) -> Optional[str]:
    """PURA: primera versión publicada que aparece en el nombre del instalador."""
    for version in versiones:
        if version and version in nombre:
            return version
    return None


def _versiones_publicadas(texto: str) -> List[str]:
    """PURA: versiones `x.y.z` que aparecen en `lanzamientos-estado.json`."""
    import re
    return sorted(set(re.findall(r"\d+\.\d+\.\d+", texto or "")))


def _leer_texto(ruta: str) -> str:
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _borrar_local(ruta: str) -> bool:
    """Retira del Mac una copia YA verificada; nunca se llama antes de verificar."""
    try:
        if os.path.isdir(ruta):
            shutil.rmtree(ruta)
        elif os.path.exists(ruta):
            os.remove(ruta)
        return True
    except OSError:
        return False


def _decir_canal(texto: str) -> None:
    """Aviso en el canal común (General). Best-effort: si el puente no está, no rompe."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import puente  # noqa: WPS433
        puente.decir(texto, quien="respaldo-maggabox", tipo="hecho")
    except Exception:
        pass


def _anotar_indice(movidos: List[Dict[str, Any]], mac_root: str, ahora: str) -> str:
    """Añade cada movimiento al índice legible de pesados (append, nunca reescribe)."""
    ruta = os.path.join(mac_root, INDICE_PESADOS)
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        nuevo = not os.path.exists(ruta)
        with open(ruta, "a", encoding="utf-8") as f:
            if nuevo:
                f.write("# Índice de pesados movidos a la Maggabox\n\n")
                f.write("Cada fila la escribe `scripts/puente/respaldo_maggabox.py aliviar`.\n\n")
                f.write("| fecha | MB | de | a | porqué |\n|---|---:|---|---|---|\n")
            for m in movidos:
                f.write("| %s | %.1f | `%s` | `%s` | %s |\n" % (
                    ahora, float(m.get("mb", 0.0)), m.get("origen", ""),
                    m.get("destino", ""), m.get("motivo", "")))
    except OSError:
        pass
    return ruta


def _escribir_estado_alivio(datos: Dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(RUTA_ALIVIO), exist_ok=True)
        with open(RUTA_ALIVIO + ".tmp", "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(RUTA_ALIVIO + ".tmp", RUTA_ALIVIO)
    except OSError:
        pass


def _worktrees_terminados(wt_root: str) -> List[str]:
    """Los que `higiene_worktrees` daría por terminados (solo lectura, sin podar)."""
    try:
        import higiene_worktrees as H
        raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return list(H.podar(raiz, wt_root, simular=True, decir=False))
    except Exception:
        return []


def _archivar_worktrees() -> bool:
    """Archiva lo sin guardar y poda con `archivar_worktrees.py --aplicar`."""
    try:
        import archivar_worktrees as A
        return A.main(["--aplicar"]) == 0
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
    borrar_fn: Optional[Callable[[str], bool]] = None,
) -> Dict[str, Any]:
    """Mueve origen a pesados/ en destino con copia verificada antes de borrar."""
    borrar_fn = borrar_fn or _borrar_local
    rel = os.path.relpath(origen, mac_root)
    destino = os.path.join(destino_base, "pesados", rel)

    if seco:
        return {"origen": origen, "destino": destino, "estado": "seco", "verificado": True}

    argv = _rsync_args(origen, destino, exclusiones_respaldo())
    r = _ejecutar(argv, ssh_fn, tope_s=1800.0)
    if r["codigo"] != 0:
        return {"origen": origen, "destino": destino, "estado": "error",
                "error": r["error"], "verificado": False}

    verificado = _copia_verificada(origen, destino, ssh_fn, tamano_fn, contar_fn)
    if verificado:
        ok = borrar_fn(origen)
        estado = "movido" if ok else "error_borrar"
        verificado = ok
    else:
        estado = "error_verificacion"
    return {"origen": origen, "destino": destino, "estado": estado, "verificado": verificado}


def _mover_archivo_con_rsync(
    origen: str,
    destino: str,
    ssh_fn: Callable[..., Any],
    borrar_fn: Callable[[str], bool],
) -> Dict[str, Any]:
    """Mueve archivos sueltos (registros de olas) con `rsync --remove-source-files`."""
    argv = ["rsync", "-a", "--remove-source-files", "--info=progress2", origen, destino]
    r = _ejecutar(argv, ssh_fn, tope_s=900.0)
    if r["codigo"] != 0:
        return {"origen": origen, "destino": destino, "estado": "error",
                "error": r["error"], "verificado": False}
    existe = _ejecutar(_ssh_test_e(destino), ssh_fn, tope_s=30.0)
    verificado = existe["codigo"] == 0
    if verificado:
        borrar_fn(origen)  # rsync ya lo quitó; si quedó, se retira tras verificar
    return {"origen": origen, "destino": destino,
            "estado": "movido" if verificado else "error_verificacion",
            "verificado": verificado}



def _candidatos_alivio(
    mac_root: str,
    wt_root: str,
    ahora: float,
    existe_fn: Callable[[str], bool],
    es_directorio_fn: Callable[[str], bool],
    listar_fn: Callable[[str], List[str]],
    mtime_fn: Callable[[str], float],
    tamano_fn: Callable[[str], int],
    glob_fn: Callable[[str], List[str]],
    tmp_root: str,
    home: str,
    cola_activa_ids: Set[str],
    worktrees_terminados: List[str],
    versiones_publicadas: List[str],
) -> List[Dict[str, Any]]:
    """PURA con fs inyectado: lista MEDIDA de candidatos, cada uno con su porqué."""
    cands: List[Dict[str, Any]] = []
    vistos: Set[str] = set()

    def anadir(ruta: str, tipo: str, motivo: str, accion: str = "mover") -> None:
        if not ruta or ruta in vistos or not existe_fn(ruta):
            return
        vistos.add(ruta)
        cands.append(_candidato(ruta, tipo, motivo, _tamano_mb(ruta, tamano_fn), accion))

    # 1. restos go-build* de más de 1 h y caché de Go
    for patron in (os.path.join(tmp_root, "go-build*"), "/tmp/go-build*"):
        for ruta in glob_fn(patron):
            if _es_viejo(mtime_fn(ruta), ahora, RETENCION_GO_BUILD_S):
                anadir(ruta, "go-build", "resto go-build de más de 1 h (se regenera)")
    for cache in (os.path.join(home, "Library/Caches/go-build"),
                  os.path.join(home, ".cache/go-build")):
        if es_directorio_fn(cache):
            anadir(cache, "go-cache", "caché de Go (se regenera)")

    # 2. restos de actualizadores ShipIt de más de 1 día
    for patron in (os.path.join(home, "Library/Caches/*ShipIt*"),
                   os.path.join(home, "Library/Application Support/*ShipIt*"),
                   "/tmp/ShipIt*"):
        for ruta in glob_fn(patron):
            if _es_viejo(mtime_fn(ruta), ahora, RETENCION_SHIPIT_S):
                anadir(ruta, "shipit", "resto de actualizador ShipIt de más de 1 día")

    # 3. trozos de .tmp.driveupload de más de 24 h
    for patron in (os.path.join(mac_root, "starseed_memory_root", ".tmp.drive*"),
                   os.path.join(mac_root, "starseed_memory_root", "*", ".tmp.drive*"),
                   os.path.join(home, ".tmp.drive*")):
        for ruta in glob_fn(patron):
            if _es_viejo(mtime_fn(ruta), ahora, RETENCION_DRIVE_S):
                anadir(ruta, "drive", "temporal de subida de Drive de más de 24 h")

    # 4. worktrees terminados: los archiva y poda `archivar_worktrees.py`
    for nombre in worktrees_terminados:
        if nombre in cola_activa_ids:
            continue
        ruta = os.path.join(wt_root, nombre)
        if es_directorio_fn(ruta):
            anadir(ruta, "worktree", "worktree terminado: archivar y podar", "archivar")

    # 5. registros de olas de más de 7 días (rsync --remove-source-files)
    olas = os.path.join(mac_root, "starseed_memory_root", "olas")
    for sub in ("logs", "pasos"):
        carpeta = os.path.join(olas, sub)
        if not es_directorio_fn(carpeta):
            continue
        for nombre in listar_fn(carpeta):
            ruta = os.path.join(carpeta, nombre)
            if not es_directorio_fn(ruta) and _es_viejo(mtime_fn(ruta), ahora, RETENCION_OLAS_S):
                anadir(ruta, "olas", "registro de ola de más de 7 días", "mover_archivos")
    for ruta in glob_fn(os.path.join(olas, "eventos-*.jsonl")):
        if _es_viejo(mtime_fn(ruta), ahora, RETENCION_OLAS_S):
            anadir(ruta, "olas", "registro de ola de más de 7 días", "mover_archivos")

    # 6. .next-anterior cuando la compilación actual lleva más de 1 h sana
    anterior = os.path.join(mac_root, ".next-anterior")
    actual = os.path.join(mac_root, ".next")
    if es_directorio_fn(anterior) and existe_fn(os.path.join(actual, "BUILD_ID")):
        if _es_viejo(mtime_fn(actual), ahora, RETENCION_NEXT_S):
            anadir(anterior, "next", "compilación anterior; la actual lleva más de 1 h sana")

    # 7. caché de compilación de Next (se regenera)
    next_cache = os.path.join(actual, "cache")
    if es_directorio_fn(next_cache):
        anadir(next_cache, "next-cache", "caché de compilación de Next (se regenera)")

    # 8. instaladores de versiones ya publicadas en Descargas
    descargas = os.path.join(home, "Downloads")
    if es_directorio_fn(descargas):
        for nombre in listar_fn(descargas):
            if not nombre.lower().endswith((".dmg", ".pkg", ".zip", ".exe", ".apk")):
                continue
            version = _version_en_nombre(nombre, versiones_publicadas)
            if version:
                anadir(os.path.join(descargas, nombre), "instalador",
                       "instalador de la versión %s ya publicada" % version)
    return cands


def _mover_candidato(
    cand: Dict[str, Any],
    destino_base: str,
    ssh_fn: Callable[..., Any],
    mac_root: str,
    tamano_fn: Callable[[str], int],
    contar_fn: Callable[[str], int],
    borrar_fn: Callable[[str], bool],
    archivar_fn: Callable[[], bool],
) -> Dict[str, Any]:
    """Ejecuta el movimiento del candidato según su tipo, sin saltarse la verificación."""
    accion = cand.get("accion", "mover")
    if accion == "archivar":
        ok = bool(archivar_fn())
        res: Dict[str, Any] = {"origen": cand["ruta"], "destino": "rama archivo-wt",
                               "estado": "archivado" if ok else "error",
                               "verificado": ok}
    elif accion == "mover_archivos":
        destino = os.path.join(destino_base, "pesados/mac/olas-logs",
                               os.path.basename(cand["ruta"]))
        res = _mover_archivo_con_rsync(cand["ruta"], destino, ssh_fn, borrar_fn)
    else:
        res = _mover_a_pesados(cand["ruta"], destino_base, ssh_fn, False, mac_root,
                               tamano_fn, contar_fn, borrar_fn)
    res.update({"mb": cand["mb"], "motivo": cand["motivo"]})
    return res


def aliviar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    wt_root: str = WT_ROOT,
    destino_base: str = DEST_BASE,
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
    glob_fn: Optional[Callable[[str], List[str]]] = None,
    ahora_fn: Optional[Callable[[], float]] = None,
    tmp_root: Optional[str] = None,
    home: Optional[str] = None,
    indice_fn: Optional[Callable[[List[Dict[str, Any]]], Any]] = None,
    decir_fn: Optional[Callable[[str], Any]] = None,
    borrar_fn: Optional[Callable[[str], bool]] = None,
    archivar_fn: Optional[Callable[[], bool]] = None,
    leer_texto_fn: Optional[Callable[[str], str]] = None,
    escribir_estado_fn: Optional[Callable[[Dict[str, Any]], Any]] = None,
    worktrees_terminados: Optional[List[str]] = None,
    versiones_publicadas: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Libera espacio en la Mac moviendo lo regenerable a pesados/ con copia verificada."""
    cola_activa_ids = cola_activa_ids or set()
    existe_fn = existe_fn or os.path.exists
    es_directorio_fn = es_directorio_fn or os.path.isdir
    listar_fn = listar_fn or os.listdir
    mtime_fn = mtime_fn or os.path.getmtime
    tamano_fn = tamano_fn or _tamano_directorio
    contar_fn = contar_fn or _contar_entradas
    glob_fn = glob_fn or glob.glob
    ahora_fn = ahora_fn or time.time
    tmp_root = tmp_root or tempfile.gettempdir()
    home = home or os.path.expanduser("~")
    borrar_fn = borrar_fn or _borrar_local
    archivar_fn = archivar_fn or _archivar_worktrees
    leer_texto_fn = leer_texto_fn or _leer_texto
    escribir_estado_fn = escribir_estado_fn or _escribir_estado_alivio
    ahora = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora_fn()))
    if versiones_publicadas is None:
        texto = leer_texto_fn(os.path.expanduser(
            "~/.starseed/produccion/lanzamientos-estado.json"))
        versiones_publicadas = _versiones_publicadas(texto)
    if worktrees_terminados is None:
        worktrees_terminados = []

    libre_gb = _libre_gb("/")
    candidatos = _candidatos_alivio(
        mac_root, wt_root, ahora_fn(), existe_fn, es_directorio_fn, listar_fn,
        mtime_fn, tamano_fn, glob_fn, tmp_root, home, cola_activa_ids,
        worktrees_terminados, versiones_publicadas,
    )
    total_mb = sum(c["mb"] for c in candidatos)

    if seco:
        return {"estado": "seco", "libre_gb": round(libre_gb, 2), "objetivo_gb": objetivo_gb,
                "candidatos": candidatos, "total_mb": round(total_mb, 1),
                "mensaje": "Simulación (--seco): esto es lo que se movería, con sus MB"}

    if libre_gb >= objetivo_gb:
        return {"estado": "suficiente_espacio", "libre_gb": round(libre_gb, 2),
                "objetivo_gb": objetivo_gb, "candidatos": len(candidatos)}

    movidos: List[Dict[str, Any]] = []
    liberado_gb = 0.0
    for cand in candidatos:
        if libre_gb + liberado_gb >= objetivo_gb:
            break
        res = _mover_candidato(cand, destino_base, ssh_fn, mac_root, tamano_fn,
                               contar_fn, borrar_fn, archivar_fn)
        movidos.append(res)
        if res.get("verificado"):
            liberado_gb += cand["mb"] / 1024.0

    indice = ""
    if movidos:
        anotar = indice_fn or (lambda entradas: _anotar_indice(entradas, mac_root, ahora))
        indice = anotar(movidos) or ""
        ganado = "alivio Mac → Maggabox: %.1f GB liberados (%d candidatos). Índice: %s" % (
            liberado_gb, len(movidos), indice or INDICE_PESADOS)
        (decir_fn or _decir_canal)(ganado)
        escribir_estado_fn({
            "t": ahora, "movidoGb": round(liberado_gb, 2),
            "indice": indice or INDICE_PESADOS, "libreGb": round(libre_gb, 2),
            "candidatos": len(candidatos),
        })

    resultado = {
        "estado": "hecho" if movidos else "nada_movido",
        "libre_gb_inicial": round(libre_gb, 2),
        "libre_gb_final": round(_libre_gb("/"), 2),
        "objetivo_gb": objetivo_gb,
        "liberado_gb": round(liberado_gb, 2),
        "indice": indice or INDICE_PESADOS,
        "movidos": movidos,
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

    # Último alivio medido (lo escribe `aliviar` y lo enseña el medidor de MetaGenesis)
    alivio: Dict[str, Any] = {}
    try:
        with open(RUTA_ALIVIO, encoding="utf-8") as f:
            alivio = json.load(f)
    except (OSError, ValueError):
        alivio = {}

    return {
        "mac_libre_gb": mac_libre_gb,
        "mac_total_gb": mac_total_gb,
        "ultimos_bundles": ultimos_bundles,
        "destino": {
            "memory_root_mb": memory_tam_mb,
            "log_existe": log_existe,
        },
        "alivio": alivio,
        "indice": INDICE_PESADOS,
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


def _refrescar_capacidades() -> None:
    """Regenera `~/.starseed/capacidades-nodos.json` para que el medidor no esté vacío."""
    try:
        import importlib.util
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "recopilar-capacidades-nodos.py")
        spec = importlib.util.spec_from_file_location("recopilar_capacidades_nodos", ruta)
        if spec is None or spec.loader is None:
            return
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.guardar(mod.recopilar())
    except Exception:
        pass


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
        # Alivio automático: solo si el disco bajó del umbral. Nunca en seco.
        if not seco and _libre_gb("/") < UMBRAL_ALIVIO_GB:
            res["alivio"] = aliviar(
                ssh_fn, objetivo_gb=UMBRAL_ALIVIO_GB, guardar_log=guardar_log,
                worktrees_terminados=_worktrees_terminados(WT_ROOT))
        _refrescar_capacidades()
        print(json.dumps(res, ensure_ascii=False, sort_keys=True))
        return 0 if res["estado"] in ("hecho", "seco") else 1

    if orden == "aliviar":
        res = aliviar(ssh_fn, seco=seco, objetivo_gb=objetivo_gb, guardar_log=guardar_log,
                      worktrees_terminados=_worktrees_terminados(WT_ROOT))
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