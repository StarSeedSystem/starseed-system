#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Respaldos cifrados de la base del OS y de las memorias de MetaGenesis (SEG1119D).

`plan [--seco]` decide qué se volcaría, a qué medios y qué se rotaría; `respaldar
[--seco]` lo ejecuta. La contraseña sale del llavero de Alex (servicio
`starseed-respaldo-claves`) y viaja solo por stdin de gpg: nunca se guarda, se imprime
ni se pasa por argv. La base se lee con `pg_dump` (solo lectura) y sus credenciales van
por entorno, nunca por argv. En cada destino se conservan los últimos 14 archivos
propios y nada más se borra. Español neutro.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import shlex
import subprocess
import sys
import tarfile
import tempfile
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence

SERVICIO_LLAVERO = "starseed-respaldo-claves"
DESTINOS = ("maggabox", "a1", "gdrive")
CONSERVAR = 14
PREFIJOS = ("datos-os-", "memorias-meta-")
VARIABLES_DB = ("STARSEED_SUPABASE_DB_URL", "SUPABASE_DB_URL", "DATABASE_URL",
                "POSTGRES_URL", "POSTGRES_PRISMA_URL")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAIZ_MEMORIA = os.path.join(REPO, "starseed_memory_root")
RUTA_LOG = os.path.expanduser("~/.starseed/respaldo-claves/respaldo-datos.log")
TOPE_S = 1800.0
HOST_MAGGABOX = os.environ.get("STARSEED_MAGGABOX_HOST", "maggasukha@starseed-nodo-1.local")
HOST_A1 = (os.environ.get("STARSEED_A1_SSH") or os.environ.get("STARSEED_A1_HOST")
           or "a1")
NODO_MAGGABOX = "starseed-nodo-1.local"
LLAVE_NODO = os.path.expanduser("~/.ssh/starseed_nodo1")
KNOWN_HOSTS_NODO = os.path.expanduser("~/.ssh/known_hosts_starseed_nodo")


def nombre_archivo(tipo: str, fecha: str) -> str:
    """PURA: nombre cifrado de un artefacto para una fecha `YYYY-MM-DD`."""
    base = "datos-os" if tipo == "datos" else "memorias-meta"
    return f"{base}-{fecha}.gpg"


def es_nuestro(nombre: str) -> bool:
    """PURA: solo los archivos de este módulo entran en la rotación."""
    return nombre.startswith(PREFIJOS) and nombre.endswith(".gpg")


def rotar(existentes: Sequence[str], nuevos: Sequence[str] = (), conservar: int = CONSERVAR) -> List[str]:
    """PURA: devuelve los archivos propios que sobran tras conservar los últimos N."""
    propios = sorted({n for n in list(existentes) + list(nuevos) if es_nuestro(n)}, reverse=True)
    return propios[conservar:]


def credenciales_db(entorno: Optional[Mapping[str, str]] = None) -> Optional[str]:
    """PURA: nombre de la primera variable de entorno con cadena de la base, sin su valor."""
    fuente: Mapping[str, str] = os.environ if entorno is None else entorno
    for nombre in VARIABLES_DB:
        if (fuente.get(nombre) or "").strip():
            return nombre
    return None


def plan(fecha: Optional[str] = None, destinos: Optional[Sequence[str]] = None,
         existentes: Optional[Dict[str, Sequence[str]]] = None,
         variables_db: Optional[Sequence[str]] = None) -> Dict[str, Any]:
    """PURA: qué artefactos, qué envíos y qué rotación, sin tocar red ni secretos."""
    fecha = fecha or dt.date.today().isoformat()
    destinos = list(destinos or DESTINOS)
    existentes = existentes or {}
    candidatas = list(os.environ) if variables_db is None else list(variables_db)
    variable = next((v for v in candidatas if v in VARIABLES_DB), None)

    artefactos = [
        {"tipo": "datos", "archivo": nombre_archivo("datos", fecha), "origen": "supabase",
         "omitir": variable is None, "motivo": "sin-variable-de-entorno" if variable is None else ""},
        {"tipo": "memorias", "archivo": nombre_archivo("memorias", fecha),
         "origen": RAIZ_MEMORIA, "omitir": False, "motivo": ""},
    ]
    envios = [{"destino": d, "archivo": a["archivo"]}
              for d in destinos for a in artefactos if not a["omitir"]]
    rotacion = {d: rotar(existentes.get(d, []), [a["archivo"] for a in artefactos if not a["omitir"]])
                for d in destinos}
    return {"fecha": fecha, "artefactos": artefactos, "envios": envios,
            "rotacion": rotacion, "llavero": SERVICIO_LLAVERO}


def leer_contrasena(ejecutar: Callable[..., Any] = subprocess.run) -> Optional[str]:
    """Lee la contraseña del llavero de Alex; nunca la imprime ni la devuelve en claro a un log."""
    orden = ["security", "find-generic-password", "-w", "-s", SERVICIO_LLAVERO]
    try:
        hecho = ejecutar(orden, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if getattr(hecho, "returncode", 1) != 0:
        return None
    valor = (getattr(hecho, "stdout", "") or "").strip()
    return valor or None


def comando_cifrar(origen: str, destino: str) -> List[str]:
    """PURA: gpg simétrico; la contraseña entra por stdin (fd 0), jamás por argv."""
    return ["gpg", "--batch", "--yes", "--symmetric", "--cipher-algo", "AES256",
            "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--output", destino, origen]


REMOTO = "StarSeed-respaldos/datos"
GDRIVE = f"gdrive:{REMOTO}"


def _opciones_ssh(host: str) -> List[str]:
    """PURA: opciones SSH; la identidad local es solo para el nodo conocido."""
    opciones = ["-o", "AddressFamily=inet", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8"]
    nombre_host = host.rsplit("@", 1)[-1]
    if nombre_host.endswith(NODO_MAGGABOX):
        opciones[0:0] = [
            "-i", LLAVE_NODO,
            "-o", "IdentitiesOnly=yes",
            "-o", "UserKnownHostsFile=" + KNOWN_HOSTS_NODO,
        ]
    return opciones


def _ssh(destino: str, *orden: str) -> List[str]:
    """PURA: argv ssh no interactivo contra el nodo que toque."""
    host = HOST_MAGGABOX if destino == "maggabox" else HOST_A1
    return ["ssh", *_opciones_ssh(host), host, *orden]


def comando_subida(destino: str, local: str, nombre: str) -> List[str]:
    """PURA: argv de subida al medio; Google Drive usa rclone, los nodos usan rsync."""
    if destino == "gdrive":
        return ["rclone", "copyto", local, f"{GDRIVE}/{nombre}"]
    host = HOST_MAGGABOX if destino == "maggabox" else HOST_A1
    transporte = shlex.join(["ssh", *_opciones_ssh(host)])
    return ["rsync", "-az", "-e", transporte, local, f"{host}:{REMOTO}/{nombre}"]


def comando_huella(destino: str, nombre: str) -> List[str]:
    """PURA: argv para leer la huella remota sin abrir el archivo cifrado."""
    if destino == "gdrive":
        return ["rclone", "sha256sum", f"{GDRIVE}/{nombre}"]
    return _ssh(destino, "sha256sum", f"{REMOTO}/{nombre}")


def comando_preparar(destino: str) -> List[str]:
    """PURA: argv para crear la carpeta de respaldos; vacío en Google Drive."""
    return [] if destino == "gdrive" else _ssh(destino, "mkdir", "-p", REMOTO)


def comando_listar(destino: str) -> List[str]:
    """PURA: argv para listar los respaldos propios de un destino."""
    return (["rclone", "lsf", "--files-only", f"{GDRIVE}/"] if destino == "gdrive"
            else _ssh(destino, "ls", "-1", f"{REMOTO}/"))


def comando_borrar(destino: str, nombre: str) -> List[str]:
    """PURA: argv para borrar solo un archivo propio ya rotado."""
    return (["rclone", "deletefile", f"{GDRIVE}/{nombre}"] if destino == "gdrive"
            else _ssh(destino, "rm", "-f", f"{REMOTO}/{nombre}"))


def huella_sha256(ruta: str) -> str:
    """PURA (I/O local): SHA-256 en hexadecimal de un archivo."""
    resumen = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1024 * 1024), b""):
            resumen.update(bloque)
    return resumen.hexdigest()


def ejecutar_orden(ejecutar: Callable[..., Any], argv: List[str], entrada: Optional[str] = None,
                   entorno: Optional[Dict[str, str]] = None, tope: float = TOPE_S) -> Dict[str, Any]:
    """Subprocess con timeout y entorno opcional; devuelve código, salida y error."""
    try:
        hecho = ejecutar(argv, capture_output=True, text=True, timeout=tope,
                         input=entrada, env=entorno)
    except subprocess.TimeoutExpired:
        return {"codigo": None, "salida": "", "error": "sin-respuesta"}
    except OSError as fallo:
        return {"codigo": None, "salida": "", "error": str(fallo)}
    return {"codigo": getattr(hecho, "returncode", 1),
            "salida": (getattr(hecho, "stdout", "") or "").strip(),
            "error": (getattr(hecho, "stderr", "") or "").strip()}


def _sin_secreto(texto: str, secreto: str) -> str:
    """PURA: borra un valor sensible de cualquier mensaje antes de guardarlo o registrarlo."""
    return texto.replace(secreto, "***") if secreto and secreto in texto else texto


def _cifrar_artefactos(ejecutar: Callable[..., Any], clave: str, variable: Optional[str],
                       fecha: str, tmp: str) -> Dict[str, Dict[str, Any]]:
    """Vuelca y cifra; la contraseña solo viaja por stdin de gpg y el volcado es solo lectura."""
    piezas: Dict[str, Dict[str, Any]] = {}
    if variable:
        crudo = os.path.join(tmp, "datos.sql")
        entorno = dict(os.environ)
        valor = entorno.get(variable, "")
        entorno["PGDATABASE"] = valor
        entorno["PGOPTIONS"] = "-c default_transaction_read_only=on"
        volcado = ejecutar_orden(ejecutar, ["pg_dump", "--no-owner", "--no-privileges",
                                            "--file", crudo], entorno=entorno)
        cifrado = os.path.join(tmp, nombre_archivo("datos", fecha))
        copia = ejecutar_orden(ejecutar, comando_cifrar(crudo, cifrado),
                               entrada=clave + "\n") if volcado["codigo"] == 0 else volcado
        piezas["datos"] = {"archivo": os.path.basename(cifrado),
                           "ruta": cifrado, "ok": copia["codigo"] == 0,
                           "error": _sin_secreto(copia["error"], valor)}
    crudo_mem = os.path.join(tmp, "memorias.tar.gz")
    try:
        with tarfile.open(crudo_mem, "w:gz") as paquete:
            paquete.add(RAIZ_MEMORIA, arcname="starseed_memory_root")
        cifrado_mem = os.path.join(tmp, nombre_archivo("memorias", fecha))
        copia_mem = ejecutar_orden(ejecutar, comando_cifrar(crudo_mem, cifrado_mem),
                                   entrada=clave + "\n")
        piezas["memorias"] = {"archivo": os.path.basename(cifrado_mem),
                              "ruta": cifrado_mem, "ok": copia_mem["codigo"] == 0,
                              "error": copia_mem["error"]}
    except (OSError, tarfile.TarError) as fallo:
        piezas["memorias"] = {"archivo": nombre_archivo("memorias", fecha),
                              "ruta": "", "ok": False, "error": str(fallo)}
    return piezas


def _registrar_log(linea: str) -> None:
    """Añade una línea sin secretos al registro; si no se puede, no rompe el respaldo."""
    try:
        os.makedirs(os.path.dirname(RUTA_LOG), exist_ok=True)
        with open(RUTA_LOG, "a", encoding="utf-8") as f:
            f.write(linea + "\n")
    except OSError:
        pass


def _rotar_destino(destino: str, nuevos: List[str],
                   listar: Callable[[str], List[str]], borrar: Callable[[str, str], None]) -> List[str]:
    """Borra solo los archivos propios que sobran: conserva los 14 últimos por destino."""
    existentes = listar(destino)
    sobran = rotar(existentes, nuevos)
    for nombre in sobran:
        borrar(destino, nombre)
    return sobran


def respaldar(ejecutar: Callable[..., Any] = subprocess.run, fecha: Optional[str] = None,
              destinos: Optional[Sequence[str]] = None, existentes: Optional[Dict[str, Sequence[str]]] = None,
              seco: bool = False, contrasena: Optional[str] = None,
              listar: Optional[Callable[[str], List[str]]] = None,
              borrar: Optional[Callable[[str, str], None]] = None,
              registrar: Optional[Callable[[str], Any]] = None) -> Dict[str, Any]:
    """Ejecuta el respaldo cifrado y la rotación; `--seco` solo devuelve el plan."""
    variable = credenciales_db()
    p = plan(fecha, destinos, existentes or {}, [variable] if variable else [])
    if seco:
        return {"estado": "seco", "plan": p}

    clave = contrasena if contrasena is not None else leer_contrasena(ejecutar)
    if not clave:
        return {"estado": "sin-contrasena", "plan": p, "detalle": "no se pudo leer el llavero"}

    fecha_iso: str = str(p["fecha"])
    with tempfile.TemporaryDirectory(prefix="respaldo-datos-") as tmp:
        piezas = _cifrar_artefactos(ejecutar, clave, variable, fecha_iso, tmp)
        subir = lambda d, ruta, n: ejecutar_orden(ejecutar, comando_subida(d, ruta, n))["codigo"] == 0
        huella = lambda d, n: ejecutar_orden(ejecutar, comando_huella(d, n))

        def _listar_por_defecto(d: str) -> List[str]:
            salida = ejecutar_orden(ejecutar, comando_listar(d))["salida"] or ""
            return [str(linea) for linea in salida.splitlines()]

        def _borrar_por_defecto(d: str, n: str) -> None:
            ejecutar_orden(ejecutar, comando_borrar(d, n))

        listar_fn: Callable[[str], List[str]] = listar or _listar_por_defecto
        borrar_fn: Callable[[str, str], None] = borrar or _borrar_por_defecto
        for destino in p["rotacion"]:
            preparar = comando_preparar(destino)
            if preparar:
                ejecutar_orden(ejecutar, preparar)
        envios = []
        for envio in p["envios"]:
            tipo = "datos" if envio["archivo"].startswith("datos-os-") else "memorias"
            pieza = piezas.get(tipo)
            if not pieza or not pieza["ok"]:
                envios.append({"destino": envio["destino"], "archivo": envio["archivo"],
                               "estado": "origen-fallido",
                               "error": (pieza or {}).get("error", "sin-artefacto")})
                continue
            local = huella_sha256(pieza["ruta"])
            enviado = subir(envio["destino"], pieza["ruta"], envio["archivo"])
            leido = huella(envio["destino"], envio["archivo"]) if enviado else {"codigo": 1, "salida": ""}
            remoto = (leido["salida"] or "").split()[0] if leido["codigo"] == 0 else ""
            envios.append({"destino": envio["destino"], "archivo": envio["archivo"],
                           "estado": "verificado" if remoto == local else "huella-distinta"})
        nuevos = {d: [e["archivo"] for e in envios if e["destino"] == d and e["estado"] == "verificado"]
                  for d in p["rotacion"]}
        rotados = {d: (_rotar_destino(d, nuevos[d], listar_fn, borrar_fn) if nuevos.get(d) else [])
                   for d in p["rotacion"]}
        todo_ok = bool(envios) and all(e["estado"] == "verificado" for e in envios)
        resultado = {"estado": "hecho" if todo_ok else "parcial", "fecha": fecha_iso,
                     "envios": envios, "rotados": rotados}
    (registrar or _registrar_log)(f"{fecha_iso} | {json.dumps(resultado, ensure_ascii=False, sort_keys=True)}")
    return resultado


def main(argv: Optional[List[str]] = None) -> int:
    """CLI: `plan [--seco]` y `respaldar [--seco]`."""
    args = list(sys.argv[1:] if argv is None else argv)
    orden = args[0] if args else "plan"
    seco = "--seco" in args
    if orden == "plan":
        print(json.dumps(plan(), ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    if orden == "respaldar":
        resultado = respaldar(seco=seco)
        print(json.dumps(resultado, ensure_ascii=False, sort_keys=True))
        return 0 if resultado["estado"] in ("hecho", "seco") else 1
    print("Uso: respaldo_datos.py plan | respaldar [--seco]")
    return 2


if __name__ == "__main__":
    sys.exit(main())
