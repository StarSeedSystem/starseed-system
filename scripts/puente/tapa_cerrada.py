# -*- coding: utf-8 -*-
"""Tapa cerrada (KAL1101D): despierta la neurona solo cuando el dueño lo pidió.

Decisión PURA en `decidir`: solo se pone `pmset -a disablesleep 1` si el ajuste lo permite, hay
corriente, la batería supera el 50 % y hay trabajo del enjambre o servicios vivos. Se deshace en
cuanto falta cualquiera de las cuatro, al acabar el trabajo o al salir (también ante errores).
Nunca se ejecuta `sudo` sin `-n`: si sudoers no autoriza exactamente esos dos comandos, no hace
nada. El contrato y la línea de sudoers están en `architecture/colmena-relevo-contenedores.md` §11.
"""
import argparse
import json
import os
import subprocess
import sys
from typing import Any, Callable, Dict, List, Optional

try:
    from despierto_logica import desactivada_pmset, parsear_bateria
except ImportError:  # importado como scripts.puente.tapa_cerrada
    from scripts.puente.despierto_logica import desactivada_pmset, parsear_bateria

UMBRAL_BATERIA = 50
SUDO = "/usr/bin/sudo"
PMSET = "/usr/bin/pmset"
AJUSTE = os.path.expanduser("~/.starseed/tapa.json")
TIMEOUT_S = 10

def leer_ajuste(texto: Any) -> bool:
    """PURA. Solo un `{"permitir": true}` booleano permite; vacío, roto, `null` o el resto, no."""
    try:
        datos = json.loads(texto)
    except (ValueError, TypeError):
        return False
    return isinstance(datos, dict) and datos.get("permitir") is True

def decidir(*, pedido: bool, enchufada: bool, bateria: Optional[int], trabajo: bool, activo: bool) -> Dict[str, str]:
    """PURA. Devuelve {accion: activar|desactivar|nada, motivo}. El orden es el de la verdad:
    permiso, corriente, trabajo, batería. Sin dato de batería no se activa nunca."""
    if not pedido:
        motivo = "sin-permiso"
    elif not enchufada:
        motivo = "sin-corriente"
    elif not trabajo:
        motivo = "sin-trabajo"
    elif bateria is None:
        motivo = "bateria-desconocida"
    elif int(bateria) <= UMBRAL_BATERIA:
        motivo = "bateria-baja"
    else:
        return {"accion": "nada" if activo else "activar", "motivo": "ya-activa" if activo else "trabajo-y-corriente"}
    return {"accion": "desactivar" if activo else "nada", "motivo": motivo}

def comando(accion: str) -> Optional[List[str]]:
    """PURA. El ÚNICO argv permitido: `sudo -n /usr/bin/pmset -a disablesleep 0|1`."""
    if accion not in ("activar", "desactivar"):
        return None
    return [SUDO, "-n", PMSET, "-a", "disablesleep", "1" if accion == "activar" else "0"]

def aplicar(accion: str, correr: Optional[Callable[..., Any]] = None) -> Dict[str, Any]:
    """IO. Lanza el comando acordado con `sudo -n` y nunca insiste. Devuelve {hecho, motivo}."""
    argv = comando(accion)
    if argv is None:
        return {"hecho": False, "motivo": "nada-que-hacer"}
    try:
        r = (correr or subprocess.run)(argv, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, timeout=TIMEOUT_S)
    except (OSError, subprocess.SubprocessError):
        return {"hecho": False, "motivo": "no-ejecutado"}
    if getattr(r, "returncode", 1) == 0:
        return {"hecho": True, "motivo": "ok"}
    return {"hecho": False, "motivo": "sudo-o-pmset"}

def decidir_y_aplicar(*, pedido: bool, enchufada: bool, bateria: Optional[int], trabajo: bool,
                      activo: bool, correr: Optional[Callable[..., Any]] = None) -> Dict[str, Any]:
    """IO. Una sola puerta: decide y solo entonces ejecuta. `accion` siempre viaja en el resultado."""
    d = decidir(pedido=pedido, enchufada=enchufada, bateria=bateria, trabajo=trabajo, activo=activo)
    r = aplicar(d["accion"], correr=correr)
    return {**d, **r}

def _leer_texto(ruta: str) -> str:
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""

def _medir() -> Dict[str, Any]:
    """IO. Batería/corriente y `disablesleep` reales; si `pmset` no existe (Linux) no hay datos."""
    try:
        batt = subprocess.run([PMSET, "-g", "batt"], capture_output=True, text=True,
                              timeout=TIMEOUT_S).stdout
        actual = subprocess.run([PMSET, "-g"], capture_output=True, text=True,
                                timeout=TIMEOUT_S).stdout
    except (OSError, subprocess.SubprocessError):
        return {"bateria": None, "enchufada": False, "activo": False}
    b = parsear_bateria(batt)
    return {"bateria": b["porcentaje"], "enchufada": b["enchufada"],
            "activo": desactivada_pmset(actual)}

def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Despierta la neurona con la tapa cerrada.")
    p.add_argument("--trabajo", action="store_true", help="Hay enjambre o servicios vivos.")
    p.add_argument("--deshacer", action="store_true", help="Apaga disablesleep y sale.")
    p.add_argument("--simular", action="store_true", help="Solo enseña la decisión.")
    p.add_argument("--ajuste", default=AJUSTE)
    args = p.parse_args(argv)
    m = _medir()
    if args.deshacer:
        pedido, trabajo = False, False
    else:
        pedido, trabajo = leer_ajuste(_leer_texto(args.ajuste)), bool(args.trabajo)
    d = decidir(pedido=pedido, enchufada=m["enchufada"], bateria=m["bateria"],
                trabajo=trabajo, activo=m["activo"])
    r = {"hecho": False, "motivo": "simulado"} if args.simular else aplicar(d["accion"])
    print(json.dumps({**d, **r}, ensure_ascii=False))
    return 0 if r["hecho"] or d["accion"] == "nada" else 1

if __name__ == "__main__":
    sys.exit(main())
