#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Respaldo automático de la Mac a la Maggabox (ALM1118B · ALM1121A).

Órdenes: `plan`, `respaldar [--seco] [--sin-alivio]`, `aliviar [--seco] [--objetivo-gb N]`, `estado`.

Conexión SSH:
    ssh -i ~/.ssh/starseed_nodo1 -o IdentitiesOnly=yes -o BatchMode=yes
    -o ConnectTimeout=8 -o UserKnownHostsFile=$HOME/.ssh/known_hosts_starseed_nodo
    maggasukha@starseed-nodo-1.local

Destino: ~/StarSeed-almacen/

`respaldar`:
  - rsync (o tar+scp si no hay rsync remoto) de starseed_memory_root a
    respaldos/mac/starseed_memory_root, excluyendo `.tmp.drive*` y lo secreto.
  - git bundle create --all en una carpeta TEMPORAL LOCAL, solo si hay más de
    6 GB libres (si no, se salta: el espejo de GitHub del Maggabox cubre el
    código). Se envía, se comprueba el SHA-256 y se borra el temporal.
  - rotación de 7 `repo-<fecha>.bundle` y línea en respaldos/mac/respaldos.log.
  - si el disco baja de 12 GB, llama a `aliviar` y avisa en el canal común.

Excluye siempre: ~/.starseed/env, .env*, ~/.ssh, *.pem, *key*, credenciales,
`.tmp.drive*` (los 2 GB de restos de Google Drive no son respaldo).
Lo secreto solo va en repositorio restic cifrado (orden preparada, sin contraseña).

`aliviar`: mide candidatos reales y dice por qué antes de mover nada:
restos `go-build*` de más de 1 h, caché de Go, restos `ShipIt` de más de 1 día,
trozos `.tmp.driveupload` de más de 24 h, worktrees terminados
(`archivar_worktrees.py`), registros de olas de más de 7 días (se mueven a
`pesados/mac/olas-logs` con `rsync --remove-source-files`), `.next-anterior`
cuando el `.next` actual lleva más de 1 h sano e instaladores de pruebas ya
publicadas en Descargas. Copia verificada antes de retirar; cada movimiento
queda en `starseed_memory_root/nodo/indice-pesados-maggabox.md`.

Plist launchd real (cada 6 h = 21600 s), en
`deploy/launchd/com.starseed.respaldo-maggabox.plist`:
<key>StartInterval</key><integer>21600</integer> con `RunAtLoad`.
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
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple

# Rutas base (se pueden inyectar en pruebas)
HOME = os.path.expanduser("~")
MAC_ROOT = "/Users/alex/Documents/starseed-os-main"
STARSEED_MEMORY_ROOT = os.path.join(MAC_ROOT, "starseed_memory_root")
WT_ROOT = os.path.expanduser("~/Documents/starseed-wt")
DEST_HOST = "maggasukha@starseed-nodo-1.local"
DEST_BASE = "~/StarSeed-almacen"

# Límites del respaldo y del alivio
MIN_LIBRE_BUNDLE_GB = 6.0
RETENCION_BUNDLES = 7
UMBRAL_ALIVIO_GB = 12.0
EDAD_GO_BUILD_S = 3600
EDAD_SHIPIT_S = 86400
EDAD_TMP_DRIVE_S = 86400
EDAD_LOGS_OLAS_S = 7 * 86400
EDAD_NEXT_SANO_S = 3600

RUTA_ESTADO = os.path.join(HOME, ".starseed", "almacen-maggabox.json")
INDICE_POR_DEFECTO = os.path.join(STARSEED_MEMORY_ROOT, "nodo", "indice-pesados-maggabox.md")
MOTIVO_BUNDLE_SIN_ESPACIO = (
    "menos de %.0f GB libres: no se crea el git bundle local; el espejo de GitHub "
    "del Maggabox ya cubre el código" % MIN_LIBRE_BUNDLE_GB
)

# SSH base command
_SSH_OPCIONES = [
    "-i", os.path.expanduser("~/.ssh/starseed_nodo1"),
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "UserKnownHostsFile=%s" % os.path.expanduser("~/.ssh/known_hosts_starseed_nodo"),
]
SSH_BASE = ["ssh"] + _SSH_OPCIONES + [DEST_HOST]

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

# Exclusiones propias del respaldo: restos de Drive y bundles ya empaquetados
EXCLUIR_RESPALDO = EXCLUIR_SECRETOS + [
    ".tmp.drive*",
    ".tmp.driveupload",
    ".tmp.drivedownload",
    "*.bundle",
]


def excluir_secretos() -> List[str]:
    """PURA: patrones de exclusión para rsync/tar/restic."""
    return list(EXCLUIR_SECRETOS)


def excluir_respaldo() -> List[str]:
    """PURA: secretos + restos de Google Drive + bundles."""
    return list(EXCLUIR_RESPALDO)


def _ssh_e() -> str:
    """PURA: cadena `-e` que rsync usa para hablar por SSH con la Maggabox."""
    return "ssh " + " ".join(_SSH_OPCIONES)


def _ruta_remota(destino_base: str, rel: str) -> str:
    """PURA: ruta dentro de la Maggabox (`~/StarSeed-almacen/...`)."""
    return os.path.join(destino_base.rstrip("/"), rel.strip("/"))


def _destino_remoto(destino_base: str, rel: str) -> str:
    """PURA: destino rsync/scp CON host (si falta el host, git/rsync lo tratan como local)."""
    return "%s:%s" % (DEST_HOST, _ruta_remota(destino_base, rel))


def _rsync_args(
    origen: str,
    destino: str,
    exclusiones: List[str],
    *,
    borrar: bool = True,
    extra: Optional[List[str]] = None,
    directorio: bool = True,
) -> List[str]:
    """PURA: argv de rsync con exclusiones; `destino` puede ser `host:ruta`."""
    args = ["rsync", "-az", "--info=progress2", "-e", _ssh_e()]
    if borrar:
        args.append("--delete")
    for ex in exclusiones:
        args.extend(["--exclude", ex])
    if extra:
        args.extend(extra)
    if directorio:
        args.extend([origen.rstrip("/") + "/", destino.rstrip("/") + "/"])
    else:
        args.extend([origen, destino])
    return args


def _tar_ssh_args(origen: str, destino_ruta: str, exclusiones: List[str]) -> List[str]:
    """PURA: argv de tar local (el envío se hace con scp en `_tar_fallback`)."""
    tar_args = ["tar", "czf", "-"]
    for ex in exclusiones:
        tar_args.extend(["--exclude", ex])
    tar_args.extend(["-C", os.path.dirname(origen), os.path.basename(origen)])
    return tar_args


def _git_bundle_args(repo: str, destino: str) -> List[str]:
    """PURA: argv para git bundle create --all (destino LOCAL, nunca remoto)."""
    return ["git", "-C", repo, "bundle", "create", destino, "--all"]


def _scp_args(local: str, remoto: str) -> List[str]:
    """PURA: argv de scp con la misma identidad y host que SSH_BASE."""
    return ["scp"] + _SSH_OPCIONES + [local, remoto]


def _ssh_mkdir(destino: str) -> List[str]:
    """PURA: mkdir -p remoto."""
    return SSH_BASE + ["mkdir", "-p", destino]


def _ssh_ls_bundles(destino: str) -> List[str]:
    """PURA: lista bundles remotos ordenados."""
    return SSH_BASE + ["bash", "-lc", "ls -1t %s/repo-*.bundle 2>/dev/null || true" % destino]


def _ssh_rm(destino: str) -> List[str]:
    """PURA: borra archivo remoto."""
    return SSH_BASE + ["rm", "-f", destino]


def _ssh_du(destino: str) -> List[str]:
    """PURA: du -sk remoto."""
    return SSH_BASE + ["du", "-sk", destino]


def _ssh_test_e(destino: str) -> List[str]:
    """PURA: test -e remoto."""
    return SSH_BASE + ["test", "-e", destino]


def _ssh_sha256(destino: str) -> List[str]:
    """PURA: sha256sum remoto."""
    return SSH_BASE + ["sha256sum", destino]


def _ssh_cat_log(log_ruta: str, linea: str) -> List[str]:
    """PURA: añade línea al log remoto (printf, sin comillas frágiles)."""
    return SSH_BASE + ["bash", "-lc", "printf '%%s\\n' %s >> %s" % (_citar(linea), log_ruta)]


def _citar(texto: str) -> str:
    """PURA: comilla simple segura para bash (`'` → `'\\''`)."""
    return "'" + str(texto).replace("'", "'\\''") + "'"


def _ejecutar(argv: List[str], ejecutar: Callable[..., Any], tope_s: float = 300.0) -> Dict[str, Any]:
    """Ejecuta con timeout; devuelve dict con codigo, salida, error. Nunca lanza."""
    try:
        r = ejecutar(argv, capture_output=True, text=True, timeout=tope_s)
        return {"codigo": r.returncode, "salida": (r.stdout or "").strip(), "error": (r.stderr or "").strip()}
    except subprocess.TimeoutExpired:
        return {"codigo": None, "salida": "", "error": "timeout"}
    except OSError as e:
        return {"codigo": None, "salida": "", "error": str(e)}


def _hay_rsync_remoto(ejecutar: Callable[..., Any]) -> bool:
    """Comprueba si el destino tiene rsync."""
    return _ejecutar(SSH_BASE + ["rsync", "--version"], ejecutar, tope_s=10.0)["codigo"] == 0


def _libre_gb(ruta: str = "/") -> float:
    """GB libres del disco donde vive `ruta` (0 si no se puede medir)."""
    try:
        _, _, libre = shutil.disk_usage(ruta)
        return libre / (1024 ** 3)
    except OSError:
        return 0.0


def hay_espacio_para_bundle(libre_gb: float, minimo_gb: float = MIN_LIBRE_BUNDLE_GB) -> bool:
    """PURA: el bundle local solo se crea si deja margen (más de 6 GB)."""
    return float(libre_gb) > float(minimo_gb)


def _sha256_archivo(ruta: str) -> str:
    """SHA-256 de un archivo local ('' si no se puede leer)."""
    h = hashlib.sha256()
    try:
        with open(ruta, "rb") as f:
            for trozo in iter(lambda: f.read(1024 * 1024), b""):
                h.update(trozo)
        return h.hexdigest()
    except OSError:
        return ""


def _sha256_remoto(ruta: str, ssh_fn: Callable[..., Any]) -> str:
    """SHA-256 remoto con `sha256sum`; '' si no se puede leer."""
    r = _ejecutar(_ssh_sha256(ruta), ssh_fn, tope_s=60.0)
    if r["codigo"] != 0 or not r["salida"]:
        return ""
    return r["salida"].split()[0]


def _subir_archivo(local: str, remoto: str, ssh_fn: Callable[..., Any]) -> Dict[str, Any]:
    """Sube un archivo con scp (misma identidad que SSH_BASE)."""
    return _ejecutar(_scp_args(local, remoto), ssh_fn, tope_s=600.0)


def _crear_bundle_local(repo: str, destino: str) -> Dict[str, Any]:
    """Crea el git bundle en una ruta LOCAL (el temporal de la Mac)."""
    return _ejecutar(_git_bundle_args(repo, destino), subprocess.run, tope_s=300.0)


def _tamano_directorio(ruta: str, du_fn: Optional[Callable[[str], int]] = None) -> int:
    """Tamaño en KB de un directorio/archivo; 0 si no se puede medir."""
    if du_fn:
        try:
            return int(du_fn(ruta))
        except (TypeError, ValueError):
            return 0
    try:
        out = subprocess.run(["du", "-sk", ruta], capture_output=True, text=True, timeout=60).stdout
        return int(out.split()[0])
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return 0


def _contar_entradas(ruta: str, find_fn: Optional[Callable[[str], List[str]]] = None) -> int:
    """Número de entradas (archivos + dirs) de un árbol; 0 si no se puede leer."""
    if find_fn:
        try:
            return len(find_fn(ruta))
        except Exception:
            return 0
    try:
        r = subprocess.run(["find", ruta], capture_output=True, text=True, timeout=60)
        return len(r.stdout.splitlines()) if r.returncode == 0 else 0
    except (OSError, subprocess.TimeoutExpired):
        return 0


def _listar_bundles_remotos(ejecutar: Callable[..., Any], destino_base: str) -> List[str]:
    """Bundles remotos ordenados por fecha (más nuevo primero), con ruta completa."""
    destino = _ruta_remota(destino_base, "respaldos/mac")
    r = _ejecutar(_ssh_ls_bundles(destino), ejecutar, tope_s=30.0)
    if r["codigo"] != 0:
        return []
    nombres = [
        linea.strip().rsplit("/", 1)[-1]
        for linea in r["salida"].splitlines()
        if linea.strip().startswith("repo-") and linea.strip().endswith(".bundle")
    ]
    nombres.sort(reverse=True)
    return [_ruta_remota(destino_base, "respaldos/mac/" + n) for n in nombres]


def _rotar_bundles(ejecutar: Callable[..., Any], destino_base: str, conservar: int = RETENCION_BUNDLES) -> List[str]:
    """Borra los bundles antiguos manteniendo los `conservar` más nuevos."""
    bundles = _listar_bundles_remotos(ejecutar, destino_base)
    borrados: List[str] = []
    for b in bundles[conservar:]:
        if _ejecutar(_ssh_rm(b), ejecutar, tope_s=30.0)["codigo"] == 0:
            borrados.append(b)
    return borrados


def _escribir_log_remoto(ejecutar: Callable[..., Any], destino_base: str, linea: str) -> bool:
    """Escribe una línea en respaldos/mac/respaldos.log."""
    log_ruta = _ruta_remota(destino_base, "respaldos/mac/respaldos.log")
    return _ejecutar(_ssh_cat_log(log_ruta, linea), ejecutar, tope_s=10.0)["codigo"] == 0


def _leer_json(ruta: str) -> Dict[str, Any]:
    """Lee un JSON tolerante; {} si no existe o está roto."""
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else {}
    except (OSError, ValueError):
        return {}


def _guardar_json(ruta: str, datos: Dict[str, Any]) -> bool:
    """Escribe JSON de forma atómica (tmp + replace); nunca lanza."""
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta + ".tmp", "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2, sort_keys=True)
        os.replace(ruta + ".tmp", ruta)
        return True
    except OSError:
        return False


def _notificar(texto: str, tipo: str = "hecho") -> None:
    """Avisa en el canal común; un fallo aquí nunca tumba el respaldo."""
    print(texto, flush=True)
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import puente  # noqa: F401
        puente.decir(texto, "respaldo-maggabox", tipo)
    except Exception:
        pass


def _anotar_indice(indice: str, filas: Iterable[Dict[str, Any]], ahora: Optional[str] = None) -> bool:
    """Añade una fila por movimiento al índice Markdown; crea cabecera si falta."""
    filas = list(filas)
    if not filas:
        return True
    fecha = ahora or dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    try:
        os.makedirs(os.path.dirname(indice), exist_ok=True)
        nuevo = not os.path.isfile(indice)
        with open(indice, "a", encoding="utf-8") as f:
            if nuevo:
                f.write("# Índice de datos pesados movidos a la Maggabox\n\n")
                f.write("| Fecha | Tipo | Origen | MB | Destino | Porqué |\n")
                f.write("|---|---|---|---:|---|---|\n")
            for fila in filas:
                f.write("| %s | %s | %s | %s | %s | %s |\n" % (
                    fecha, fila.get("tipo", ""), fila.get("origen", ""),
                    fila.get("mb", 0), fila.get("destino", ""), fila.get("motivo", "")))
        return True
    except OSError:
        return False


def _estado_previo(ruta_estado: str) -> Dict[str, Any]:
    """Estado acumulado de pasadas anteriores (movido_gb e índice)."""
    return _leer_json(ruta_estado)


def plan(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    memory_root: str = STARSEED_MEMORY_ROOT,
    destino_base: str = DEST_BASE,
    seco: bool = True,
    libre_fn: Optional[Callable[[], float]] = None,
) -> Dict[str, Any]:
    """PURA: decide qué se respaldaría y qué se rotaría, sin ejecutar."""
    libre_fn = libre_fn or (lambda: _libre_gb(tempfile.gettempdir()))
    ahora = dt.datetime.now().strftime("%Y-%m-%d")
    libre = libre_fn()
    respaldar = [
        {
            "accion": "rsync_o_tar",
            "origen": memory_root,
            "destino": _destino_remoto(destino_base, "respaldos/mac/starseed_memory_root"),
            "exclusiones": excluir_respaldo(),
            "tamano_aprox_kb": _tamano_directorio(memory_root),
        },
        {
            "accion": "git_bundle",
            "origen": mac_root,
            "destino": _destino_remoto(destino_base, "respaldos/mac/repo-%s.bundle" % ahora),
            "se_creara": hay_espacio_para_bundle(libre),
            "motivo": "" if hay_espacio_para_bundle(libre) else MOTIVO_BUNDLE_SIN_ESPACIO,
        },
    ]
    bundles = _listar_bundles_remotos(ssh_fn, destino_base)
    for b in bundles[RETENCION_BUNDLES:]:
        respaldar.append({"accion": "borrar_bundle_antiguo", "ruta": b})
    return {
        "generado": time.time(),
        "seco": seco,
        "libre_gb": round(libre, 2),
        "respaldar": respaldar,
        "bundles_existentes": len(bundles),
    }


def _tar_fallback(
    memory_root: str,
    destino_base: str,
    ssh_fn: Callable[..., Any],
    temp_dir_fn: Callable[[], str],
) -> Dict[str, Any]:
    """Respaldo del memory root con tar + scp cuando el destino no tiene rsync."""
    temp = temp_dir_fn()
    tar_local = os.path.join(temp, "starseed_memory_root.tar.gz")
    try:
        tar_argv = ["tar", "czf", tar_local]
        for ex in excluir_respaldo():
            tar_argv.extend(["--exclude", ex])
        tar_argv.extend(["-C", os.path.dirname(memory_root), os.path.basename(memory_root)])
        r_tar = _ejecutar(tar_argv, ssh_fn, tope_s=600.0)
        if r_tar["codigo"] != 0:
            return {"fase": "tar_memory", "codigo": r_tar["codigo"], "error": r_tar["error"]}
        remoto = _destino_remoto(destino_base, "respaldos/mac/starseed_memory_root.tar.gz")
        r_scp = _subir_archivo(tar_local, remoto, ssh_fn)
        if r_scp["codigo"] != 0:
            return {"fase": "tar_memory", "codigo": r_scp["codigo"], "error": r_scp["error"]}
        destino = _ruta_remota(destino_base, "respaldos/mac")
        r_x = _ejecutar(SSH_BASE + ["bash", "-lc", "mkdir -p %s && tar xzf %s -C %s" % (
            destino, _ruta_remota(destino_base, "respaldos/mac/starseed_memory_root.tar.gz"), destino)], ssh_fn, tope_s=600.0)
        return {"fase": "tar_memory", "codigo": r_x["codigo"], "error": r_x["error"]}
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def respaldar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    memory_root: str = STARSEED_MEMORY_ROOT,
    destino_base: str = DEST_BASE,
    seco: bool = False,
    guardar_log: Optional[Callable[[Dict[str, Any]], Any]] = None,
    *,
    libre_fn: Optional[Callable[[], float]] = None,
    bundle_fn: Optional[Callable[[str, str], Dict[str, Any]]] = None,
    sha_local_fn: Optional[Callable[[str], str]] = None,
    sha_remoto_fn: Optional[Callable[[str, Callable[..., Any]], str]] = None,
    temp_dir_fn: Optional[Callable[[], str]] = None,
    auto_aliviar: bool = True,
    aliviar_fn: Optional[Callable[..., Dict[str, Any]]] = None,
    notificar_fn: Optional[Callable[..., Any]] = None,
    indice: Optional[str] = None,
    ruta_estado: Optional[str] = None,
) -> Dict[str, Any]:
    """Ejecuta el respaldo: rsync/tar + bundle local verificado + rotación + log."""
    if seco:
        return {"estado": "seco", "mensaje": "Simulación (--seco), no se ejecuta nada"}

    libre_fn = libre_fn or (lambda: _libre_gb(tempfile.gettempdir()))
    bundle_fn = bundle_fn or _crear_bundle_local
    sha_local_fn = sha_local_fn or _sha256_archivo
    sha_remoto_fn = sha_remoto_fn or _sha256_remoto
    temp_dir_fn = temp_dir_fn or (lambda: tempfile.mkdtemp(prefix="respaldo-maggabox-"))
    notificar_fn = notificar_fn or _notificar
    indice = indice or INDICE_POR_DEFECTO
    ruta_estado = ruta_estado or RUTA_ESTADO

    resultados: List[Dict[str, Any]] = []
    ahora = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    hoy = ahora.split()[0]

    for d in ("respaldos/mac", "pesados", "pesados/mac/olas-logs", "pesados/mac/descargas"):
        r = _ejecutar(_ssh_mkdir(_ruta_remota(destino_base, d)), ssh_fn, tope_s=30.0)
        if r["codigo"] != 0:
            return {"estado": "error", "fase": "mkdir", "detalle": r}

    if _hay_rsync_remoto(ssh_fn):
        destino_memory = _destino_remoto(destino_base, "respaldos/mac/starseed_memory_root")
        argv = _rsync_args(memory_root, destino_memory, excluir_respaldo())
        r = _ejecutar(argv, ssh_fn, tope_s=600.0)
        resultados.append({"fase": "rsync_memory", "codigo": r["codigo"], "error": r["error"]})
    else:
        resultados.append(_tar_fallback(memory_root, destino_base, ssh_fn, temp_dir_fn))

    libre = libre_fn()
    if not hay_espacio_para_bundle(libre):
        resultados.append({"fase": "git_bundle", "estado": "omitido", "motivo": MOTIVO_BUNDLE_SIN_ESPACIO})
    else:
        resultados.append(_respaldar_bundle(
            ssh_fn, mac_root, destino_base, hoy, bundle_fn, sha_local_fn, sha_remoto_fn, temp_dir_fn))

    borrados = _rotar_bundles(ssh_fn, destino_base)
    resultados.append({"fase": "rotar_bundles", "borrados": borrados})

    linea = "%s | memory_root rsync/tar | bundle %s | rotados %d | libre %.1f GB" % (
        ahora, "sí" if hay_espacio_para_bundle(libre) else "omitido", len(borrados), libre)
    _escribir_log_remoto(ssh_fn, destino_base, linea)

    previo = _estado_previo(ruta_estado)
    estado_json = dict(previo)
    estado_json.update({
        "ultimo_respaldo": ahora,
        "libre_gb": round(libre, 2),
        "bundles": len(_listar_bundles_remotos(ssh_fn, destino_base)),
        "indice": indice,
        "log_existe": True,
    })
    _guardar_json(ruta_estado, estado_json)

    estado = "hecho" if all(x.get("codigo", 0) == 0 for x in resultados) else "parcial"
    resultado: Dict[str, Any] = {"estado": estado, "detalles": resultados, "timestamp": ahora,
                                 "libre_gb": round(libre, 2), "indice": indice}

    if auto_aliviar and libre < UMBRAL_ALIVIO_GB:
        aliviar_fn = aliviar_fn or aliviar
        alivio = aliviar_fn(ssh_fn=ssh_fn, mac_root=mac_root, wt_root=WT_ROOT,
                            destino_base=destino_base, objetivo_gb=UMBRAL_ALIVIO_GB,
                            guardar_log=None, notificar_fn=notificar_fn, indice_path=indice)
        resultado["alivio"] = alivio
        if alivio.get("liberado_gb", 0) > 0:
            notificar_fn("Respaldo Mac → Maggabox: alivio automático ganó %.2f GB (disco bajo de %.0f GB)."
                         % (alivio["liberado_gb"], UMBRAL_ALIVIO_GB))

    if guardar_log:
        guardar_log(resultado)
    return resultado


def _respaldar_bundle(
    ssh_fn: Callable[..., Any],
    mac_root: str,
    destino_base: str,
    hoy: str,
    bundle_fn: Callable[[str, str], Dict[str, Any]],
    sha_local_fn: Callable[[str], str],
    sha_remoto_fn: Callable[[str, Callable[..., Any]], str],
    temp_dir_fn: Callable[[], str],
) -> Dict[str, Any]:
    """Crea el bundle en local, lo envía, comprueba SHA-256 y borra el temporal."""
    temp = temp_dir_fn()
    local = os.path.join(temp, "repo-%s.bundle" % hoy)
    remoto = _destino_remoto(destino_base, "respaldos/mac/repo-%s.bundle" % hoy)
    try:
        r = bundle_fn(mac_root, local)
        if r.get("codigo") != 0:
            return {"fase": "git_bundle", "codigo": r.get("codigo"), "error": r.get("error", "")}
        sha_local = sha_local_fn(local)
        if not sha_local:
            return {"fase": "git_bundle", "codigo": 1, "error": "bundle local ilegible"}
        envio = _subir_archivo(local, remoto, ssh_fn)
        if envio["codigo"] != 0:
            return {"fase": "git_bundle", "codigo": envio["codigo"], "error": envio["error"]}
        sha_remoto = sha_remoto_fn(remoto, ssh_fn)
        if sha_remoto != sha_local:
            return {"fase": "git_bundle", "codigo": 1,
                    "error": "SHA-256 no coincide (local %s, remoto %s)" % (sha_local[:12], sha_remoto[:12])}
        return {"fase": "git_bundle", "estado": "hecho", "codigo": 0,
                "destino": remoto, "sha256": sha_local, "bytes": os.path.getsize(local)}
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def _edad_s(ruta: str, ahora: float, mtime_fn: Callable[[str], float]) -> float:
    """Segundos desde la última modificación; -1 si no se puede leer."""
    try:
        return ahora - mtime_fn(ruta)
    except OSError:
        return -1.0


def _candidato(tipo: str, ruta: str, motivo: str, accion: str, mb: int,
               destino_rel: str = "") -> Dict[str, Any]:
    """Ficha de un candidato a aliviar, con su tamaño medido y su porqué."""
    return {"id": "%s:%s" % (tipo, ruta), "tipo": tipo, "ruta": ruta, "motivo": motivo,
            "accion": accion, "mb": int(mb), "destino_rel": destino_rel}


def _pruebas_publicadas(mac_root: str) -> Set[int]:
    """Números de prueba ya publicadas en `MetaGenesis/instaladores/canal-pruebas`."""
    publicadas: Set[int] = set()
    base = os.path.join(mac_root, "MetaGenesis", "instaladores", "canal-pruebas")
    try:
        entradas = os.listdir(base)
    except OSError:
        return publicadas
    for entrada in entradas:
        ruta = os.path.join(base, entrada)
        if not os.path.isdir(ruta):
            continue
        ficha = _leer_json(os.path.join(ruta, "_publicacion.json"))
        numero = ficha.get("prueba")
        if isinstance(numero, int):
            publicadas.add(numero)
        elif entrada.startswith("prueba-") and entrada[7:].isdigit():
            publicadas.add(int(entrada[7:]))
    return publicadas


def buscar_candidatos(
    mac_root: str,
    wt_root: str,
    memory_root: str,
    home: str,
    temp_dirs: List[str],
    ahora: float,
    cola_activa_ids: Set[str],
    *,
    existe_fn: Callable[[str], bool] = os.path.exists,
    es_directorio_fn: Callable[[str], bool] = os.path.isdir,
    listar_fn: Callable[[str], List[str]] = os.listdir,
    mtime_fn: Callable[[str], float] = os.path.getmtime,
    tamano_fn: Callable[[str], int] = _tamano_directorio,
    worktrees_terminados_fn: Optional[Callable[[str, str], List[str]]] = None,
) -> List[Dict[str, Any]]:
    """Lista REAL y medida de lo que se puede mover, con su porqué. Nunca toca nada."""
    salida: List[Dict[str, Any]] = []
    vistos: Set[str] = set()

    def anadir(tipo: str, ruta: str, motivo: str, accion: str = "mover", destino_rel: str = "") -> None:
        clave = os.path.realpath(ruta) if existe_fn(ruta) else ruta
        if clave in vistos:
            return
        vistos.add(clave)
        salida.append(_candidato(tipo, ruta, motivo, accion, tamano_fn(ruta), destino_rel))

    for base in temp_dirs:
        try:
            entradas = listar_fn(base)
        except OSError:
            continue
        for nombre in entradas:
            if not nombre.startswith("go-build"):
                continue
            ruta = os.path.join(base, nombre)
            if es_directorio_fn(ruta) and _edad_s(ruta, ahora, mtime_fn) > EDAD_GO_BUILD_S:
                anadir("go-build", ruta, "resto de compilación Go de más de 1 h en una carpeta temporal",
                       destino_rel="pesados/mac/tmp/" + nombre)

    for ruta in (os.path.join(home, "Library", "Caches", "go-build"),
                 os.path.join(home, ".cache", "go-build")):
        if es_directorio_fn(ruta):
            anadir("go-cache", ruta, "caché de compilación Go (se regenera sola)",
                   destino_rel="pesados/mac/go-cache")

    for base in (os.path.join(home, "Library", "Caches"), os.path.join(home, "Library", "Application Support")):
        try:
            entradas = listar_fn(base)
        except OSError:
            continue
        for nombre in entradas:
            if "ShipIt" not in nombre:
                continue
            ruta = os.path.join(base, nombre)
            if _edad_s(ruta, ahora, mtime_fn) > EDAD_SHIPIT_S:
                anadir("shipit", ruta, "resto de actualizador ShipIt de más de 1 día",
                       destino_rel="pesados/mac/shipit/" + nombre)

    for base in (os.path.join(home, "Library", "Application Support", "Google", "DriveFS"), mac_root, memory_root):
        if not es_directorio_fn(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            for nombre in list(dirnames) + list(filenames):
                if not nombre.startswith(".tmp.drive"):
                    continue
                ruta = os.path.join(dirpath, nombre)
                if _edad_s(ruta, ahora, mtime_fn) > EDAD_TMP_DRIVE_S:
                    anadir("tmp-drive", ruta, "trozo de Google Drive de más de 24 h (.tmp.driveupload)",
                           destino_rel="pesados/mac/tmp-drive/" + nombre)
            dirnames[:] = [d for d in dirnames if not d.startswith(".tmp.drive")]

    terminados_fn = worktrees_terminados_fn or _worktrees_terminados
    try:
        nombres = [n for n in terminados_fn(mac_root, wt_root) if n not in cola_activa_ids]
    except Exception:
        nombres = []
    if nombres:
        mb = sum(tamano_fn(os.path.join(wt_root, n)) for n in nombres)
        salida.append(_candidato("worktrees", wt_root,
                                 "%d worktrees de tareas terminadas (archivar_worktrees.py)" % len(nombres),
                                 "archivar_worktrees", mb, "pesados/mac/worktrees"))

    logs_dir = os.path.join(memory_root, "olas", "logs")
    try:
        nombres_log = listar_fn(logs_dir)
    except OSError:
        nombres_log = []
    for nombre in nombres_log:
        if not nombre.endswith(".log"):
            continue
        ruta = os.path.join(logs_dir, nombre)
        if _edad_s(ruta, ahora, mtime_fn) > EDAD_LOGS_OLAS_S:
            anadir("olas-logs", ruta, "registro de ola de más de 7 días (se mueve, no se borra)",
                   accion="mover_log", destino_rel="pesados/mac/olas-logs/" + nombre)

    anterior = os.path.join(mac_root, ".next-anterior")
    actual = os.path.join(mac_root, ".next")
    sano = all(os.path.isfile(os.path.join(actual, n)) for n in ("BUILD_ID", "build-manifest.json"))
    if es_directorio_fn(anterior) and sano and _edad_s(actual, ahora, mtime_fn) > EDAD_NEXT_SANO_S:
        anadir("next-anterior", anterior,
               "build anterior guardado; el .next actual lleva más de 1 h sano",
               destino_rel="pesados/mac/next-anterior")

    publicadas = _pruebas_publicadas(mac_root)
    descargas = os.path.join(home, "Downloads")
    try:
        nombres_desc = listar_fn(descargas)
    except OSError:
        nombres_desc = []
    for nombre in nombres_desc:
        ruta = os.path.join(descargas, nombre)
        if not os.path.isfile(ruta) or _edad_s(ruta, ahora, mtime_fn) <= EDAD_SHIPIT_S:
            continue
        numeros = [int(t) for t in nombre.replace("_", "-").split("-") if t.isdigit()]
        if any(n in publicadas for n in numeros):
            anadir("instalador-prueba", ruta, "instalador de una prueba ya publicada en GitHub (se mueve)",
                   destino_rel="pesados/mac/descargas/" + nombre)

    return salida


def _worktrees_terminados(mac_root: str, wt_root: str) -> List[str]:
    """Worktrees de tareas terminadas según `higiene_worktrees.podar(simular=True)`."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import higiene_worktrees as H
        return list(H.podar(mac_root, wt_root, simular=True, decir=False))
    except Exception:
        return []


def _copia_verificada(
    origen: str,
    destino_remoto: str,
    ssh_fn: Callable[..., Any],
    tamano_fn: Callable[[str], int],
    contar_fn: Callable[[str], int],
    tope_s: float = 600.0,
) -> bool:
    """Comprueba que la copia remota tiene el mismo tamaño y número de entradas."""
    try:
        tam_ori = tamano_fn(origen)
        cnt_ori = contar_fn(origen)
        if tam_ori <= 0 or cnt_ori <= 0:
            return False
        r_tam = _ejecutar(_ssh_du(destino_remoto), ssh_fn, tope_s=tope_s)
        if r_tam["codigo"] != 0 or not r_tam["salida"]:
            return False
        tam_dest = int(r_tam["salida"].split()[0])
        r_cnt = _ejecutar(SSH_BASE + ["find", destino_remoto, "-printf", "."], ssh_fn, tope_s=tope_s)
        if r_cnt["codigo"] != 0:
            return False
        return tam_ori == tam_dest and cnt_ori == len(r_cnt["salida"])
    except (TypeError, ValueError, IndexError):
        return False


def _mover_a_pesados(
    candidato: Dict[str, Any],
    destino_base: str,
    ssh_fn: Callable[..., Any],
    seco: bool,
    tamano_fn: Callable[[str], int],
    contar_fn: Callable[[str], int],
) -> Dict[str, Any]:
    """Copia un candidato a pesados/, verifica y solo entonces retira el original."""
    origen = candidato["ruta"]
    destino_rel = candidato["destino_rel"]
    destino = _destino_remoto(destino_base, destino_rel)
    if seco:
        return {"tipo": candidato["tipo"], "origen": origen, "destino": destino,
                "estado": "seco", "verificado": True, "mb": candidato["mb"]}
    argv = _rsync_args(origen, destino, excluir_secretos(), borrar=False)
    r = _ejecutar(argv, ssh_fn, tope_s=600.0)
    if r["codigo"] != 0:
        return {"tipo": candidato["tipo"], "origen": origen, "destino": destino,
                "estado": "error", "error": r["error"], "verificado": False, "mb": candidato["mb"]}
    verificado = _copia_verificada(origen, destino, ssh_fn, tamano_fn, contar_fn)
    if not verificado:
        return {"tipo": candidato["tipo"], "origen": origen, "destino": destino,
                "estado": "error_verificacion", "verificado": False, "mb": candidato["mb"]}
    try:
        if os.path.isdir(origen):
            shutil.rmtree(origen)
        else:
            os.remove(origen)
        estado = "movido"
    except OSError as e:
        estado = "error_borrar: %s" % e
    return {"tipo": candidato["tipo"], "origen": origen, "destino": destino,
            "estado": estado, "verificado": estado == "movido", "mb": candidato["mb"]}


def _mover_log(
    candidato: Dict[str, Any],
    destino_base: str,
    ssh_fn: Callable[..., Any],
    seco: bool,
    tamano_fn: Callable[[str], int],
    contar_fn: Callable[[str], int],
) -> Dict[str, Any]:
    """Mueve un registro de ola con `rsync --remove-source-files` y verifica la copia."""
    origen = candidato["ruta"]
    destino = _destino_remoto(destino_base, candidato["destino_rel"])
    if seco:
        return {"tipo": candidato["tipo"], "origen": origen, "destino": destino,
                "estado": "seco", "verificado": True, "mb": candidato["mb"]}
    argv = _rsync_args(origen, destino, excluir_secretos(), borrar=False,
                       extra=["--remove-source-files"], directorio=False)
    r = _ejecutar(argv, ssh_fn, tope_s=300.0)
    if r["codigo"] != 0:
        return {"tipo": candidato["tipo"], "origen": origen, "destino": destino,
                "estado": "error", "error": r["error"], "verificado": False, "mb": candidato["mb"]}
    verificado = _copia_verificada(origen, destino, ssh_fn, tamano_fn, contar_fn)
    return {"tipo": candidato["tipo"], "origen": origen, "destino": destino,
            "estado": "movido" if verificado else "error_verificacion",
            "verificado": verificado, "mb": candidato["mb"]}


def aliviar(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    wt_root: str = WT_ROOT,
    destino_base: str = DEST_BASE,
    objetivo_gb: float = 25.0,
    seco: bool = False,
    guardar_log: Optional[Callable[[Dict[str, Any]], Any]] = None,
    cola_activa_ids: Optional[Set[str]] = None,
    *,
    home: Optional[str] = None,
    temp_dirs: Optional[List[str]] = None,
    ahora: Optional[float] = None,
    indice_path: Optional[str] = None,
    ruta_estado: Optional[str] = None,
    libre_fn: Optional[Callable[[], float]] = None,
    existe_fn: Optional[Callable[[str], bool]] = None,
    es_directorio_fn: Optional[Callable[[str], bool]] = None,
    listar_fn: Optional[Callable[[str], List[str]]] = None,
    mtime_fn: Optional[Callable[[str], float]] = None,
    tamano_fn: Optional[Callable[[str], int]] = None,
    contar_fn: Optional[Callable[[str], int]] = None,
    worktrees_terminados_fn: Optional[Callable[[str, str], List[str]]] = None,
    archivar_fn: Optional[Callable[..., Any]] = None,
    notificar_fn: Optional[Callable[..., Any]] = None,
) -> Dict[str, Any]:
    """Mide lo regenerable y lo mueve a pesados/ con copia verificada; nunca borra sin copia."""
    cola_activa_ids = cola_activa_ids or set()
    home = home or HOME
    temp_dirs = temp_dirs or [tempfile.gettempdir(), "/tmp"]
    temp_dirs = list(dict.fromkeys(temp_dirs))
    ahora = time.time() if ahora is None else ahora
    indice_path = indice_path or INDICE_POR_DEFECTO
    ruta_estado = ruta_estado or RUTA_ESTADO
    libre_fn = libre_fn or (lambda: _libre_gb(tempfile.gettempdir()))
    existe_fn = existe_fn or os.path.exists
    es_directorio_fn = es_directorio_fn or os.path.isdir
    listar_fn = listar_fn or os.listdir
    mtime_fn = mtime_fn or os.path.getmtime
    tamano_fn = tamano_fn or _tamano_directorio
    contar_fn = contar_fn or _contar_entradas
    notificar_fn = notificar_fn or _notificar
    memory_root = os.path.join(mac_root, "starseed_memory_root")

    candidatos = buscar_candidatos(
        mac_root, wt_root, memory_root, home, temp_dirs, ahora, cola_activa_ids,
        existe_fn=existe_fn, es_directorio_fn=es_directorio_fn, listar_fn=listar_fn,
        mtime_fn=mtime_fn, tamano_fn=tamano_fn, worktrees_terminados_fn=worktrees_terminados_fn)

    libre_gb = libre_fn()
    total_mb = sum(c["mb"] for c in candidatos)
    if seco:
        return {"estado": "seco", "libre_gb": round(libre_gb, 2), "objetivo_gb": objetivo_gb,
                "candidatos": candidatos, "total_mb": total_mb,
                "mensaje": "Simulación (--seco): no se mueve nada"}

    if libre_gb >= objetivo_gb:
        return {"estado": "suficiente_espacio", "libre_gb": round(libre_gb, 2),
                "objetivo_gb": objetivo_gb, "candidatos": candidatos}

    necesario_gb = objetivo_gb - libre_gb
    movidos: List[Dict[str, Any]] = []
    filas_indice: List[Dict[str, Any]] = []
    liberado_gb = 0.0
    for cand in candidatos:
        if liberado_gb >= necesario_gb:
            break
        if cand["accion"] == "archivar_worktrees":
            try:
                archivar_fn = archivar_fn or _archivar_worktrees
                r = archivar_fn(mac_root, wt_root)
                res = {"tipo": "worktrees", "origen": wt_root, "destino": _destino_remoto(destino_base, cand["destino_rel"]),
                       "estado": "archivado" if r.get("ok") else "error", "verificado": bool(r.get("ok")),
                       "mb": cand["mb"], "detalle": r.get("detalle", "")}
            except Exception as e:
                res = {"tipo": "worktrees", "origen": wt_root, "estado": "error", "verificado": False,
                       "mb": cand["mb"], "detalle": str(e)}
        elif cand["accion"] == "mover_log":
            res = _mover_log(cand, destino_base, ssh_fn, seco, tamano_fn, contar_fn)
        else:
            res = _mover_a_pesados(cand, destino_base, ssh_fn, seco, tamano_fn, contar_fn)
        movidos.append(res)
        if res.get("verificado"):
            liberado_gb += cand["mb"] / (1024 ** 2)
            filas_indice.append({"tipo": cand["tipo"], "origen": cand["ruta"],
                                 "mb": cand["mb"], "destino": res.get("destino", ""),
                                 "motivo": cand["motivo"]})

    _anotar_indice(indice_path, filas_indice)
    previo = _estado_previo(ruta_estado)
    movido_total = round(float(previo.get("movido_gb", 0.0) or 0.0) + liberado_gb, 2)
    _guardar_json(ruta_estado, dict(previo, **{
        "movido_gb": movido_total,
        "libre_gb": round(libre_gb + liberado_gb, 2),
        "indice": indice_path,
        "ultimo_alivio": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "candidatos": len(candidatos),
    }))

    resultado = {
        "estado": "hecho" if any(m.get("verificado") for m in movidos) else "nada_movido",
        "libre_gb_inicial": round(libre_gb, 2),
        "objetivo_gb": objetivo_gb,
        "liberado_gb": round(liberado_gb, 2),
        "movidos": movidos,
        "candidatos": candidatos,
        "indice": indice_path,
    }
    if liberado_gb > 0:
        notificar_fn("Alivio Mac → Maggabox: %.2f GB liberados (libre %.1f → %.1f GB). Índice: %s"
                     % (liberado_gb, libre_gb, libre_gb + liberado_gb, indice_path))
    if guardar_log:
        guardar_log(resultado)
    return resultado


def _archivar_worktrees(mac_root: str, wt_root: str) -> Dict[str, Any]:
    """Archiva el trabajo sin guardar y poda worktrees terminados (archivar_worktrees.py)."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import archivar_worktrees as AW
        codigo = AW.main(["--aplicar"])
        return {"ok": codigo == 0, "detalle": "archivar_worktrees --aplicar"}
    except Exception as e:
        return {"ok": False, "detalle": str(e)}


def estado(
    ssh_fn: Callable[..., Any],
    mac_root: str = MAC_ROOT,
    destino_base: str = DEST_BASE,
    movido_gb: Optional[float] = None,
    indice: Optional[str] = None,
    *,
    ruta_estado: Optional[str] = None,
    libre_fn: Optional[Callable[[], float]] = None,
) -> Dict[str, Any]:
    """Estado real del respaldo: lo que hay en el Maggabox, libre local y lo ya movido."""
    ruta_estado = ruta_estado or RUTA_ESTADO
    libre_fn = libre_fn or (lambda: _libre_gb(tempfile.gettempdir()))
    previo = _estado_previo(ruta_estado)
    if movido_gb is None:
        movido_gb = float(previo.get("movido_gb", 0.0) or 0.0)
    if indice is None:
        indice = previo.get("indice") or INDICE_POR_DEFECTO

    memoria = _ruta_remota(destino_base, "respaldos/mac/starseed_memory_root")
    r_du = _ejecutar(_ssh_du(memoria), ssh_fn, tope_s=30.0)
    memoria_kb = int(r_du["salida"].split()[0]) if r_du["codigo"] == 0 and r_du["salida"] else 0
    log = _ruta_remota(destino_base, "respaldos/mac/respaldos.log")
    r_log = _ejecutar(_ssh_test_e(log), ssh_fn, tope_s=10.0)
    bundles = _listar_bundles_remotos(ssh_fn, destino_base)
    return {
        "mac_root": mac_root,
        "destino": {
            "base": destino_base,
            "memoria_kb": memoria_kb,
            "memoria_gb": round(memoria_kb / (1024 ** 2), 2),
            "log_existe": r_log["codigo"] == 0,
        },
        "libre_gb": round(libre_fn(), 2),
        "movido_gb": round(float(movido_gb), 2),
        "indice": indice,
        "ultimos_bundles": [os.path.basename(b) for b in bundles[:RETENCION_BUNDLES]],
        "ultimo_respaldo": previo.get("ultimo_respaldo"),
    }


def comando_restic_init(repo: str, password_file: str) -> List[str]:
    """PURA: argv de `restic init`."""
    return ["restic", "-r", repo, "--password-file", password_file, "init"]


def comando_restic_backup(repo: str, password_file: str, rutas: List[str]) -> List[str]:
    """PURA: argv de `restic backup`."""
    return ["restic", "-r", repo, "--password-file", password_file, "backup"] + list(rutas)


def comando_restic_snapshots(repo: str, password_file: str) -> List[str]:
    """PURA: argv de `restic snapshots`."""
    return ["restic", "-r", repo, "--password-file", password_file, "snapshots"]


def main(argv: Optional[List[str]] = None) -> int:
    """CLI: `respaldar` (por defecto), `aliviar`, `estado` o `plan`."""
    parser = argparse.ArgumentParser(description="Respaldo y alivio Mac → Maggabox")
    parser.add_argument("accion", nargs="?", default="respaldar",
                        choices=["respaldar", "aliviar", "estado", "plan"])
    parser.add_argument("--seco", action="store_true", help="simula sin mover ni borrar nada")
    parser.add_argument("--sin-alivio", action="store_true", help="no aliviar aunque el disco esté bajo")
    parser.add_argument("--objetivo-gb", type=float, default=UMBRAL_ALIVIO_GB,
                        help="GB libres a recuperar (por defecto %.0f)" % UMBRAL_ALIVIO_GB)
    parser.add_argument("--destino", default=DEST_BASE)
    parser.add_argument("--mac-root", default=MAC_ROOT)
    args = parser.parse_args(argv)

    ssh_fn = subprocess.run
    if args.accion == "plan":
        print(json.dumps(plan(ssh_fn, args.mac_root, destino_base=args.destino, seco=args.seco),
                         ensure_ascii=False, indent=2))
        return 0
    if args.accion == "estado":
        print(json.dumps(estado(ssh_fn, args.mac_root, args.destino), ensure_ascii=False, indent=2))
        return 0
    if args.accion == "aliviar":
        r = aliviar(ssh_fn, args.mac_root, destino_base=args.destino, objetivo_gb=args.objetivo_gb,
                    seco=args.seco, guardar_log=lambda x: print(json.dumps(x, ensure_ascii=False, indent=2)))
        return 0 if r["estado"] in ("hecho", "nada_movido", "suficiente_espacio", "seco") else 1
    r = respaldar(ssh_fn, args.mac_root, destino_base=args.destino, seco=args.seco,
                  guardar_log=lambda x: print(json.dumps(x, ensure_ascii=False, indent=2)),
                  auto_aliviar=not args.sin_alivio)
    return 0 if r.get("estado") in ("hecho", "seco") else 1


if __name__ == "__main__":
    raise SystemExit(main())
