#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Oracle Always Free: entrega de claves por SSH sin pisar el resto del entorno.

Manda solo las variables pedidas de `~/.starseed/env` con la MISMA llave y el MISMO usuario
que `oracle_nodo.ssh` (la IP sale de `~/.starseed/oracle.json`). En el A1 quita únicamente las
líneas de esas variables y añade las nuevas, con archivo temporal e `install -m 600 -o root`:
nunca sustituye el archivo entero. No imprime valores: devuelve, por variable, si quedó y una
huella de 8 caracteres (sha256) para poder comprobarla sin enseñarla.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import shlex
import sys
from pathlib import Path

# Regla del contrato: nombres solo [A-Z][A-Z0-9_]+
_NOMBRE_VALIDO = re.compile(r"^[A-Z][A-Z0-9_]*$")
ENV_LOCAL = Path.home() / ".starseed/env"
DESTINO_DEFECTO = "/etc/starseed/direccion.env"


def _leer_env_local() -> dict[str, str]:
    resultado: dict[str, str] = {}
    if not ENV_LOCAL.exists():
        return resultado
    with ENV_LOCAL.open(encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, valor = linea.split("=", 1)
            clave, valor = clave.strip(), valor.strip()
            if (valor.startswith('"') and valor.endswith('"')) or \
               (valor.startswith("'") and valor.endswith("'")):
                valor = valor[1:-1]
            if _NOMBRE_VALIDO.match(clave):
                resultado[clave] = valor
    return resultado


def validar_nombres(vars_solicitadas: list[str]) -> list[str]:
    return [f"{v} (no coincide con [A-Z][A-Z0-9_]+)" for v in vars_solicitadas
            if not _NOMBRE_VALIDO.match(v)]


def huella(valor: str) -> str:
    """PURA. Huella de 8 caracteres del valor: lo justo para comprobarlo sin enseñarlo."""
    return hashlib.sha256(str(valor).encode("utf-8")).hexdigest()[:8]


def orden_remota(destino: str, nombres: list[str]) -> str:
    """PURA. Orden que fusiona SOLO `nombres` en `destino`: quita sus líneas viejas, añade las
    nuevas que llegan por la entrada, instala con 600 root e imprime «OK <NOMBRE>» por cada una
    que quedó. Nunca imprime valores. `destino` va citado y los nombres se validan aquí mismo."""
    validos = [n for n in nombres if _NOMBRE_VALIDO.match(n)]
    if not validos:
        return "true"
    destino_q = shlex.quote(destino)
    patron = "|".join(validos)
    lista = " ".join(validos)
    return (
        "set -u; umask 077\n"
        "nuevo=$(mktemp); fus=$(mktemp)\n"
        "trap 'rm -f \"$nuevo\" \"$fus\"' EXIT\n"
        "cat > \"$nuevo\"\n"
        f"if [ -f {destino_q} ]; then grep -vE '^(export )?({patron})=' {destino_q} > \"$fus\" || true; fi\n"
        "cat \"$nuevo\" >> \"$fus\"\n"
        f"sudo install -m 600 -o root -g root \"$fus\" {destino_q} || exit 1\n"
        f"for v in {lista}; do grep -qE \"^(export )?$v=\" {destino_q} && echo \"OK $v\"; done\n"
    )


def _importar_nodo():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import oracle_nodo  # noqa: PLC0415 — mismo usuario, misma llave y misma IP

    return oracle_nodo


def entregar(env_local: dict[str, str], nombres: list[str], destino: str = DESTINO_DEFECTO,
             simular: bool = False) -> tuple[int, dict[str, dict[str, object]]]:
    """Manda `nombres` presentes en `env_local` con `oracle_nodo.ssh` y devuelve, por variable,
    `quedo` y `huella` (nunca el valor)."""
    resultado = {v: {"quedo": False, "huella": huella(env_local[v]) if v in env_local else ""}
                 for v in nombres}
    presentes = [v for v in nombres if v in env_local]
    if simular:
        for v in nombres:
            resultado[v]["quedo"] = v in env_local
        return 0, resultado
    if not presentes:
        return 0, resultado
    contenido = "".join(f"{v}={env_local[v]}\n" for v in presentes)
    nodo = _importar_nodo()
    rc, salida = nodo.ssh(orden_remota(destino, presentes), entrada=contenido, timeout=120)
    if rc != 0:
        print("Error ssh: %s" % salida.strip()[-200:], file=sys.stderr)
        return 1, resultado
    quedaron = set(re.findall(r"^OK ([A-Z][A-Z0-9_]*)$", salida, re.MULTILINE))
    for v in presentes:
        resultado[v]["quedo"] = v in quedaron
    return 0, resultado


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("maquina", help="Nombre de la máquina destino")
    parser.add_argument("variables", nargs="+", help="Variables [A-Z][A-Z0-9_]*")
    parser.add_argument("--archivo", default=DESTINO_DEFECTO,
                        help=f"Archivo remoto (por defecto {DESTINO_DEFECTO})")
    parser.add_argument("--simular", action="store_true", help="Describe lo que haría sin ejecutar")
    args = parser.parse_args(argv)

    errores = validar_nombres(args.variables)
    if errores:
        for e in errores:
            print(f"Rechazado: {e}")
        return 2

    rc, resultado = entregar(_leer_env_local(), args.variables, destino=args.archivo,
                              simular=args.simular)
    for v in args.variables:
        r = resultado[v]
        if not r["huella"]:
            print(f"{v} (no está en tu env)")
        else:
            print(f"{v} {'✓' if r['quedo'] else '✗'} {r['huella']}")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
