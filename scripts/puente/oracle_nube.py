#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vinculación y estado no secreto de Oracle Always Free."""
from __future__ import annotations

import argparse
import configparser
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

ESTADO = "~/.starseed/oracle.json"
Runner = Callable[..., subprocess.CompletedProcess[str]]
_OCID = re.compile(r"ocid1\.[^\s\"']+", re.IGNORECASE)


def _home(home: str | Path | None = None) -> Path:
    return Path(home or os.environ.get("HOME", str(Path.home())))


def _config(home: str | Path | None = None) -> dict[str, str]:
    casa = _home(home)
    ruta = casa / ".oci" / "config"
    perfil = os.environ.get("OCI_CLI_PROFILE", "DEFAULT")
    parser = configparser.RawConfigParser()
    try:
        with ruta.open(encoding="utf-8") as archivo:
            parser.read_file(archivo)
        seccion = parser[perfil]
    except (OSError, KeyError, configparser.Error):
        return {"perfil": perfil}
    llave = seccion.get("key_file", "").strip()
    if llave.startswith("~/"):
        llave = str(casa / llave[2:])
    elif llave and not os.path.isabs(llave):
        llave = str(ruta.parent / llave)
    return {"perfil": perfil, "region": seccion.get("region", "").strip(),
            "tenancy": seccion.get("tenancy", "").strip(), "llave": llave}


def _json(salida: str | dict) -> dict:
    if isinstance(salida, dict):
        return salida
    dato = json.loads(salida)
    return dato if isinstance(dato, dict) else {}


def _numero(valor: object) -> int | float:
    try:
        numero = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    return int(numero) if numero.is_integer() else numero


def vinculada(home: str | Path) -> bool:
    """Indica si el perfil activo tiene una llave legible, sin abrirla."""
    llave = _config(home).get("llave")
    return bool(llave and os.path.isfile(llave) and os.access(llave, os.R_OK))


def parsear_limites(salida: str | dict) -> dict:
    """Extrae los tres límites Always Free de la respuesta de OCI."""
    limites = {"a1_ocpu": 0, "a1_gb": 0, "micro": 0}
    for fila in _json(salida).get("data", []):
        if not isinstance(fila, dict):
            continue
        nombre = str(fila.get("name", "")).lower()
        valor = _numero(fila.get("value", 0))
        if "a1" in nombre and ("core" in nombre or "ocpu" in nombre):
            limites["a1_ocpu"] = valor
        elif "a1" in nombre and "memory" in nombre:
            limites["a1_gb"] = valor
        elif "e2" in nombre and "micro" in nombre:
            limites["micro"] = valor
    return limites


def parsear_instancias(salida: str | dict, vnics: dict[str, str | dict]) -> list[dict]:
    """Convierte instancias y VNIC en el contrato público, sin identificadores."""
    resultado = []
    for fila in _json(salida).get("data", []):
        if not isinstance(fila, dict):
            continue
        iid, forma = str(fila.get("id", "")), str(fila.get("shape", ""))
        cfg = fila.get("shape-config") if isinstance(fila.get("shape-config"), dict) else {}
        datos_vnic = _json(vnics.get(iid, {})).get("data", [])
        ip = next((v.get("public-ip") for v in datos_vnic
                   if isinstance(v, dict) and v.get("public-ip")), None)
        resultado.append({"nombre": str(fila.get("display-name", "")), "forma": forma,
                          "ocpus": _numero(cfg.get("ocpus", 0)),
                          "gb": _numero(cfg.get("memory-in-gbs", 0)),
                          "estado": str(fila.get("lifecycle-state", "")), "ip_publica": ip})
    return resultado


def _detalle(error: object) -> str:
    texto = str(error).lower()
    if "notauthenticated" in texto or "not authenticated" in texto:
        return "Oracle no autenticó el perfil; vuelve a vincular la cuenta."
    if "region" in texto and ("incorrect" in texto or "subscribed" in texto or "invalid" in texto):
        return "La región configurada no corresponde a la cuenta."
    if any(p in texto for p in ("timeout", "timed out", "connection", "network", "dns")):
        return "No se pudo conectar con Oracle Cloud."
    return "Oracle CLI no pudo completar la comprobación."


def _correr_real(orden: list[str], timeout: int = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(orden, capture_output=True, text=True, timeout=timeout, check=False)


def _llamar(correr: Runner, orden: list[str]) -> str:
    try:
        respuesta = correr(orden, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError(_detalle(error)) from error
    if respuesta.returncode:
        raise RuntimeError(_detalle(respuesta.stderr))
    return respuesta.stdout


def _estado_base(cfg: dict[str, str], enlazada: bool) -> dict:
    return {"vinculada": enlazada, "perfil": cfg.get("perfil", "DEFAULT"),
            "region": cfg.get("region", ""),
            "comprobado": datetime.now(timezone.utc).isoformat(),
            "limites": {"a1_ocpu": 0, "a1_gb": 0, "micro": 0},
            "instancias": [], "servicios": []}


def comprobar(correr: Runner, home: str | Path | None = None) -> dict:
    """Comprueba la cuenta usando una capa de ejecución inyectada."""
    casa, cfg = _home(home), _config(home)
    estado = _estado_base(cfg, vinculada(casa))
    if not estado["vinculada"]:
        estado["detalle"] = "La cuenta Oracle todavía no está vinculada."
        return estado
    tenancy = cfg.get("tenancy", "")
    if not tenancy:
        estado["detalle"] = "El perfil de Oracle no declara la cuenta principal."
        return estado
    binario = "/opt/homebrew/bin/oci" if os.access("/opt/homebrew/bin/oci", os.X_OK) else (shutil.which("oci") or "oci")
    base = [binario, "--profile", cfg["perfil"]]
    try:
        _llamar(correr, base + ["iam", "availability-domain", "list", "--compartment-id", tenancy])
        limites = _llamar(correr, base + ["limits", "value", "list", "--service-name", "compute",
                                           "--compartment-id", tenancy, "--all"])
        instancias = _llamar(correr, base + ["compute", "instance", "list", "--compartment-id",
                                              tenancy, "--all"])
        filas = _json(instancias).get("data", [])
        vnics = {}
        for fila in filas:
            iid = fila.get("id") if isinstance(fila, dict) else None
            if iid:
                try:
                    vnics[str(iid)] = _llamar(correr, base + ["compute", "instance", "list-vnics",
                                                               "--instance-id", str(iid), "--all"])
                except RuntimeError:
                    vnics[str(iid)] = {"data": []}
        estado["limites"] = parsear_limites(limites)
        estado["instancias"] = parsear_instancias(instancias, vnics)
        estado["detalle"] = "Cuenta Oracle comprobada."
    except (RuntimeError, ValueError, json.JSONDecodeError) as error:
        estado["detalle"] = str(error) if isinstance(error, RuntimeError) else _detalle(error)
    return estado


def _ocultar(valor: object) -> object:
    if isinstance(valor, str):
        return _OCID.sub("[oculto]", valor)
    if isinstance(valor, list):
        return [_ocultar(v) for v in valor]
    if isinstance(valor, dict):
        return {str(k): _ocultar(v) for k, v in valor.items() if "ocid" not in str(k).lower()}
    return valor


def _publico(estado: dict) -> dict:
    limites = estado.get("limites") if isinstance(estado.get("limites"), dict) else {}
    instancias = estado.get("instancias") if isinstance(estado.get("instancias"), list) else []
    servicios = estado.get("servicios") if isinstance(estado.get("servicios"), list) else []
    campos_i = ("nombre", "forma", "ocpus", "gb", "estado", "ip_publica")
    campos_s = ("nombre", "url", "ok", "ms", "t")
    doc = {"vinculada": bool(estado.get("vinculada")), "perfil": str(estado.get("perfil", "DEFAULT")),
           "region": str(estado.get("region", "")), "comprobado": str(estado.get("comprobado", "")),
           "limites": {k: limites.get(k, 0) for k in ("a1_ocpu", "a1_gb", "micro")},
           "instancias": [{k: fila.get(k) for k in campos_i} for fila in instancias if isinstance(fila, dict)],
           "servicios": [{k: fila.get(k) for k in campos_s} for fila in servicios if isinstance(fila, dict)]}
    return _ocultar(doc)  # type: ignore[return-value]


def escribir_estado(ruta: str | Path, estado: dict) -> dict:
    """Escribe atómicamente el estado público con permisos 0600."""
    destino, doc = Path(os.path.expanduser(str(ruta))), _publico(estado)
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = Path(str(destino) + ".tmp")
    with temporal.open("w", encoding="utf-8") as archivo:
        json.dump(doc, archivo, ensure_ascii=False, indent=2)
        archivo.write("\n")
    os.chmod(temporal, 0o600)
    os.replace(temporal, destino)
    return doc


def _leer_estado(ruta: Path) -> dict:
    try:
        with ruta.open(encoding="utf-8") as archivo:
            dato = json.load(archivo)
        return _publico(dato if isinstance(dato, dict) else {})
    except (OSError, ValueError):
        return _estado_base({"perfil": os.environ.get("OCI_CLI_PROFILE", "DEFAULT")}, False)


def _lineas(estado: dict, detalle: str = "") -> list[str]:
    vinculo = "vinculada" if estado.get("vinculada") else "no vinculada"
    lineas = [f"Oracle: {vinculo} · perfil {estado.get('perfil')} · región {estado.get('region') or 'sin definir'}",
              "Límites: A1 %s OCPU/%s GB · micro %s" % tuple(
                  estado.get("limites", {}).get(k, 0) for k in ("a1_ocpu", "a1_gb", "micro"))]
    lineas += ["Instancia: {nombre} · {forma} · {ocpus} OCPU/{gb} GB · {estado} · IP {ip_publica}".format(**i)
               for i in estado.get("instancias", [])]
    lineas += ["Servicio: {nombre} · {url} · {ok} · {ms} ms · {t}".format(**s)
               for s in estado.get("servicios", [])]
    if detalle:
        lineas.append("Detalle: " + str(_ocultar(detalle)))
    return lineas


def main(argv: list[str] | None = None, correr: Runner | None = None,
         publicar: Callable[..., object] | None = None) -> int:
    """CLI de estado y comprobación."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("accion", nargs="?", choices=("estado", "comprobar"), default="estado")
    parser.add_argument("--json", action="store_true", dest="como_json")
    args = parser.parse_args(argv)
    ruta = _home() / ".starseed" / "oracle.json"
    anterior = _leer_estado(ruta)
    detalle = ""
    if args.accion == "comprobar":
        completo = comprobar(correr or _correr_real)
        detalle = str(completo.get("detalle", ""))
        estado = escribir_estado(ruta, completo)
        if estado["vinculada"] and not anterior.get("vinculada"):
            if publicar is None:
                try:
                    from director_chat import publicar as publicar_real
                    publicar = publicar_real
                except ImportError:
                    publicar = None
            if publicar:
                publicar("Oracle Cloud Free quedó vinculada y Genesis ya recuerda su estado.",
                         de="director-nube", rol="director", tipo="hecho", tarea="OR1007A")
    else:
        estado = anterior
    if args.como_json:
        print(json.dumps(estado, ensure_ascii=False, separators=(",", ":")))
    else:
        print("\n".join(_lineas(estado, detalle)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
