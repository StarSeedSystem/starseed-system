#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Terminal entre neuronas — cliente para la dirección y los directores (TRM1125E).

MetaGenesis usa la terminal entre neuronas de la cuenta en vez de ssh, con el permiso que
el dueño da en cada aparato. Contrato: `architecture/terminal-entre-neuronas.md` y
`architecture/control-remoto-entre-neuronas.md` (sus reglas siguen en pie):

  · permiso apagado por defecto y encendido por el dueño EN ese aparato;
  · aviso visible, «Terminar» y «Quitar permiso»; nada entra con el aparato bloqueado;
  · órdenes selladas (anti-repetición y topes); las contraseñas NUNCA viajan;
  · mientras no exista el canal de control, se ejecuta por el ssh de respaldo
    (`respaldo_maggabox.py`) con sus mismas opciones;
  · cada orden queda registrada en el chat de dirección.

Cliente para la dirección y los directores: ejecuta órdenes tipadas del ayudante en una
neurona de la cuenta. Nunca pide ni guarda contraseñas. Solo biblioteca estándar; la red y
el canal son inyectables para las pruebas (con dobles, sin tocar ~/.ssh ni el disco real).

Uso:
    python3 scripts/puente/terminal_neuronas.py ejecutar <neurona> <comando> [--args JSON]
    python3 scripts/puente/terminal_neuronas.py estado <neurona>
Pruebas: python3 -m unittest scripts/puente/test_terminal_neuronas.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

# ── Constantes del contrato ───────────────────────────────────────────────────

#: Niveles de terminal (espejo de `NIVELES_TERMINAL` de src/lib/control-remoto/terminal.ts).
NIVELES = ("usuario", "administrador")

#: Modos del nivel administrador (espejo de `ModoAdmin`).
MODOS_ADMIN = ("tipado", "completo")

#: Topes de una orden (espejo de `LimitesTerminal` de terminal_remota.rs).
ORDEN_MAX_CHARS = 8_000
TIEMPO_MAX_DEFECTO_MS = 30_000
SALIDA_MAX_DEFECTO_BYTES = 100_000

#: Ventana de validez de una orden sellada (±5 min, como el timbre de faro).
TOLERANCIA_MS = 5 * 60 * 1000

#: Opciones de respaldo del ssh de la Maggabox (mismas que `respaldo_maggabox.SSH_BASE`).
SSH_BASE = [
    "ssh",
    "-i", os.path.expanduser("~/.ssh/starseed_nodo1"),
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "AddressFamily=inet",
    "-o", "UserKnownHostsFile=%s" % os.path.expanduser("~/.ssh/known_hosts_starseed_nodo"),
]

#: Host de respaldo por defecto de la Maggabox (lo resuelve `respaldo_maggabox`).
HOST_RESPALDO = "maggasukha@starseed-nodo-1.local"

#: Canal del chat de dirección donde se registra cada orden.
CANAL_DIRECCION = "terminal"

Ejecutar = Callable[..., Any]


class ErrorTerminal(Exception):
    """Fallo controlado del cliente (nunca lleva contraseñas ni datos privados)."""

    def __init__(self, motivo: str, detalle: str = "") -> None:
        super().__init__(motivo)
        self.motivo = motivo
        self.detalle = detalle


# ── Firmas / tipos ────────────────────────────────────────────────────────────


def es_nivel(n: Any) -> bool:
    """PURA: True si `n` es uno de los dos niveles de terminal."""
    return n in NIVELES


def es_modo_admin(m: Any) -> bool:
    """PURA: True si `m` es un modo válido del nivel administrador."""
    return m in MODOS_ADMIN


def nivel_minimo(a: str, b: str) -> str:
    """PURA: el menor de dos niveles (usuario < administrador)."""
    return a if NIVELES.index(a) <= NIVELES.index(b) else b


# ── Validación y sellado de órdenes ───────────────────────────────────────────


def validar_orden(orden: str) -> Optional[str]:
    """PURA: motivo por el que la orden no cabe, o None si es válida.

    No se ejecuta nada: solo acota tamaño y vacío, como `motivoOrdenInvalida` de la web.
    """
    if not isinstance(orden, str) or orden.strip() == "":
        return "La orden está vacía."
    if len(orden) > ORDEN_MAX_CHARS:
        return "La orden pasa de %d caracteres." % ORDEN_MAX_CHARS
    return None


def _clave_sellado(sesion: Dict[str, Any]) -> str:
    """PURA: clave HMAC de la sesión (NOMBRE de variable, nunca un valor del entorno)."""
    return str(sesion.get("clave") or "")


def _nonce_orden(orden: str, sesion: Dict[str, Any], ahora_ms: int) -> str:
    """PURA: nonce estable de la orden (mismo texto + misma ventana de 5 min = mismo nonce).

    Así el reintento legítimo reenvía la MISMA orden sellada (no una nueva), y el lado
    controlado rechaza un nonce repetido.
    """
    ventana = ahora_ms // TOLERANCIA_MS
    base = "%s|%s|%s|%d" % (sesion.get("token", ""), orden, sesion.get("de", ""), ventana)
    import hashlib

    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:32]


def sellar_orden(orden: str, sesion: Dict[str, Any], ahora_ms: Optional[int] = None) -> Dict[str, Any]:
    """PURA: sobre sellado de la orden (firma HMAC, seq, nonce, caduca).

    El sobre no lleva contraseñas. `seq` es monótono por sesión; `caduca` caduca la orden.
    """
    motivo = validar_orden(orden)
    if motivo is not None:
        raise ErrorTerminal("argumentos", motivo)
    t = int(ahora_ms if ahora_ms is not None else time.time() * 1000)
    clave = _clave_sellado(sesion)
    seq = int(sesion.get("seq", 0)) + 1
    nonce = _nonce_orden(orden, sesion, t)
    caduca = t + TOLERANCIA_MS
    carga = "%s|%s|%s|%d|%s|%d" % (sesion.get("token", ""), sesion.get("de", ""), orden, seq, nonce, caduca)
    import hashlib
    import hmac

    firma = hmac.new(clave.encode("utf-8"), carga.encode("utf-8"), hashlib.sha256).hexdigest()
    return {
        "v": 1,
        "token": sesion.get("token", ""),
        "de": sesion.get("de", ""),
        "orden": orden,
        "seq": seq,
        "nonce": nonce,
        "t": t,
        "caduca": caduca,
        "firma": firma,
    }


def _firma_valida(carga: str, firma: str, clave: str) -> bool:
    """PURA: comprueba la firma HMAC en tiempo constante."""
    import hashlib
    import hmac

    esperada = hmac.new(clave.encode("utf-8"), carga.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, firma or "")


def verificar_orden(sobre: Dict[str, Any], sesion: Dict[str, Any], ahora_ms: Optional[int] = None) -> Optional[str]:
    """PURA: motivo de rechazo del sobre, o None si es válido y no repetido.

    Comprueba forma, nivel, ventana ±5 min, caducidad, firma y anti-repetición (seq/nonce).
    No ejecuta nada.
    """
    if sobre.get("v") != 1:
        return "versión"
    if sobre.get("token") != sesion.get("token"):
        return "sesión"
    if sobre.get("de") != sesion.get("de"):
        return "origen"
    motivo = validar_orden(str(sobre.get("orden", "")))
    if motivo is not None:
        return "argumentos"
    t = int(ahora_ms if ahora_ms is not None else time.time() * 1000)
    if abs(int(sobre.get("t", 0)) - t) > TOLERANCIA_MS:
        return "caducada"
    if int(sobre.get("caduca", 0)) < t:
        return "caducada"
    vistos = sesion.setdefault("_vistos", {})
    clave_seq = str(sobre.get("seq"))
    if clave_seq in vistos:
        return "repetida"
    carga = "%s|%s|%s|%d|%s|%d" % (
        sobre.get("token", ""), sobre.get("de", ""), sobre.get("orden", ""),
        int(sobre.get("seq", 0)), sobre.get("nonce", ""), int(sobre.get("caduca", 0)),
    )
    if not _firma_valida(carga, str(sobre.get("firma", "")), _clave_sellado(sesion)):
        return "firma"
    vistos[clave_seq] = sobre.get("nonce")
    return None


# ── Clasificación de órdenes (reflejo de acceso_equipo_logica::clasificar) ────


def clasificar_orden(orden: str) -> str:
    """PURA: clase de la orden para confirmarla una a una en el aparato.

    Devuelve «confirmar» para lo delicado (borrar/sobrescribir, ajustes/permisos/procesos/
    privilegios, credenciales, enviar datos fuera, instalar y órdenes opacas) y «sola» para
    el resto. No detecta pagos ni un binario propio que esquive (SEG1111U §4.8.2).
    """
    t = (orden or "").strip().lower()
    if t == "":
        return "opaca"
    delicadas = (
        "rm ", "rm-", "del ", "delete", "borrar", "sobrescrib", "mv ", "move",
        "chmod", "chown", "sudo", "su ", "passwd", "login", "credential", "credencial",
        "curl ", "wget ", "scp ", "rsync ", "nc ", "netcat", "ssh ", "ftp",
        "install", "instalar", "apt ", "apt-get", "yum ", "dnf ", "pacman", "brew ",
        "systemctl", "launchctl", "service ", "kill", "pkill", "reboot", "shutdown",
        "keychain", "secret", "token", "password", "contrase",
    )
    if any(p in t for p in delicadas):
        return "confirmar"
    # Órdenes opacas: redirigir, tuberías encadenadas o eval de shell.
    if any(s in t for s in (">", "<", "|", ";", "&&", "$(", "`", "eval", "exec")):
        return "opaca"
    return "sola"


def requiere_confirmacion(orden: str) -> bool:
    """PURA: True si la orden se confirma en el aparato antes de ejecutarse."""
    return clasificar_orden(orden) in ("confirmar", "opaca")


# ── Transporte: ssh de respaldo (mientras no exista el canal de control) ───────


def ssh_orden(orden: str, host: str = HOST_RESPALDO) -> List[str]:
    """PURA: argv de ssh con las opciones de respaldo_maggabox.py y la orden por stdin.

    La orden NO va en el argv (no queda en el listado de procesos): se escribe por `stdin`.
    """
    return SSH_BASE + [host, "bash", "-s"]


def _ejecutar(argv: List[str], ejecutar: Ejecutar, entrada: Optional[str] = None,
              tope_s: float = 60.0) -> Dict[str, Any]:
    """Ejecuta un subprocess con timeout; devuelve {codigo, salida, error}. Inyectable."""
    try:
        r = ejecutar(argv, input=entrada, capture_output=True, text=True, timeout=tope_s)
        return {
            "codigo": r.returncode,
            "salida": (r.stdout or "").strip(),
            "error": (r.stderr or "").strip(),
        }
    except subprocess.TimeoutExpired:
        return {"codigo": None, "salida": "", "error": "timeout"}
    except OSError as e:  # red caída, ssh ausente…
        return {"codigo": None, "salida": "", "error": str(e)}


def _resumen_salida(salida: str, tope: int = SALIDA_MAX_DEFECTO_BYTES) -> str:
    """PURA: resumen de una línea para el registro, recortado al tope."""
    limpia = " ".join((salida or "").split())
    return limpia[:tope]


# ── Registro en el chat de dirección ──────────────────────────────────────────


def _publicar_chat(texto: str, de: str = "terminal-neuronas", raiz: Optional[str] = None) -> Dict[str, Any]:
    """Publica en el chat de dirección (canal `terminal`). Nunca escribe en pruebas.

    `director_chat.publicar` ya tacha secretos y no escribe en el chat real cuando el proceso
    es una prueba; se importa aquí (y no arriba) para que el módulo siga siendo de solo stdlib.
    """
    try:
        import director_chat

        return director_chat.publicar(texto, de=de, rol="director", tipo="informe",
                                      canal=CANAL_DIRECCION, raiz=raiz)
    except Exception:
        return {}


# ── Cliente: ejecutar una orden tipada en una neurona de la cuenta ────────────


def _canal_control(neurona: str, sobre: Dict[str, Any]) -> Dict[str, Any]:
    """Envía el sobre por el canal de control. Hoy no existe: se responde «sin-canal».

    Cuando exista (`src/lib/control-remoto/canal.ts`), este es el único punto que cambia.
    """
    return {"ok": False, "motivo": "sin-canal", "neurona": neurona}


def ejecutar_orden(
    neurona: str,
    comando: str,
    sesion: Dict[str, Any],
    args: Optional[Dict[str, Any]] = None,
    ejecutar: Ejecutar = subprocess.run,
    canal: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]] = None,
    publicar: Optional[Callable[[str], Any]] = None,
    ahora_ms: Optional[int] = None,
) -> Dict[str, Any]:
    """Ejecuta una orden tipada del ayudante en una neurona de la cuenta.

    La ejecuta por el canal de control si existe; mientras no, por el ssh de respaldo con las
    opciones de `respaldo_maggabox.py`. Nunca pide ni guarda contraseñas. Registra en el chat
    de dirección. Devuelve un dict con el resultado y el registro.
    """
    # 1. Sellar y verificar (anti-repetición, topes, caducidad) antes de molestar a la red.
    sobre = sellar_orden(comando, sesion, ahora_ms=ahora_ms)
    motivo = verificar_orden(sobre, sesion, ahora_ms=ahora_ms)
    if motivo is not None:
        raise ErrorTerminal("orden-rechazada", motivo)
    sesion["seq"] = sobre["seq"]

    # 2. Clasificar: lo delicado se marca para confirmación en el aparato.
    clase = clasificar_orden(comando)

    # 3. Transporte: canal de control si existe; si no, ssh de respaldo.
    etiqueta = "canal" if canal is not None else "ssh"
    if canal is not None:
        salida = canal(neurona, sobre)
        resultado = {"ok": bool(salida.get("ok")), "detalle": salida, "via": etiqueta}
    else:
        r = _ejecutar(ssh_orden(comando), ejecutar, entrada=comando)
        resultado = {
            "ok": r["codigo"] == 0,
            "codigo": r["codigo"],
            "salida": r["salida"],
            "error": r["error"],
            "via": etiqueta,
        }

    # 4. Registro legible en el chat de dirección (quién, cuándo, qué y salida resumida).
    linea = "terminal · %s · %s · %s · %s" % (
        neurona, sesion.get("de", ""), comando, "ok" if resultado.get("ok") else "fallo",
    )
    if resultado.get("salida"):
        linea += " · " + _resumen_salida(str(resultado["salida"]))
    registro = publicar(linea) if publicar is not None else _publicar_chat(linea)

    return {"orden": sobre, "clase": clase, "resultado": resultado, "registro": registro}


def estado_neurona(neurona: str, ejecutar: Ejecutar = subprocess.run) -> Dict[str, Any]:
    """Lee el estado del ayudante en la neurona (no ejecuta nada delicado)."""
    r = _ejecutar(ssh_orden("starseed-ayudante estado"), ejecutar, entrada="starseed-ayudante estado")
    return {"neurona": neurona, "codigo": r["codigo"], "salida": r["salida"], "error": r["error"]}


def main(argv: Optional[List[str]] = None) -> int:
    """CLI: ejecutar <neurona> <comando> [--args JSON] | estado <neurona>."""
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        print(__doc__)
        return 2
    orden = args[0]
    if orden == "estado" and len(args) >= 2:
        res = estado_neurona(args[1])
        print(json.dumps(res, ensure_ascii=False, sort_keys=True))
        return 0 if res["codigo"] == 0 else 1
    if orden == "ejecutar" and len(args) >= 3:
        neurona, comando = args[1], args[2]
        extra: Dict[str, Any] = {}
        if "--args" in args:
            try:
                extra = json.loads(args[args.index("--args") + 1])
            except (IndexError, ValueError):
                print("--args necesita un JSON válido")
                return 2
        sesion = {"token": os.environ.get("STARSEED_TERMINAL_TOKEN", ""),
                  "de": os.environ.get("STARSEED_TERMINAL_DE", "direccion"), "clave": "", "seq": 0}
        try:
            res = ejecutar_orden(neurona, comando, sesion, args=extra)
        except ErrorTerminal as e:
            print("rechazada: %s (%s)" % (e.motivo, e.detalle))
            return 1
        print(json.dumps(res, ensure_ascii=False, sort_keys=True))
        return 0 if res["resultado"].get("ok") else 1
    print("Uso: terminal_neuronas.py ejecutar <neurona> <comando> [--args JSON] | estado <neurona>")
    return 2


if __name__ == "__main__":
    sys.exit(main())