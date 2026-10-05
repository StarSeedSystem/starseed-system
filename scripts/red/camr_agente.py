#!/usr/bin/env python3
"""Agente local CAMR (Enrutamiento Cognitivo Multiespectro) de StarSeed OS.

Escucha SOLO en 127.0.0.1. Detecta RNS, Meshtastic, iw, batctl, babeld y
yggdrasilctl; mide; aplica en seco o en real (lista blanca, sin shell); y envía.
Las librerías de radio (RNS, meshtastic) se importan de forma perezosa.
"""

from __future__ import annotations

import base64
import json
import re
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, Protocol

PUESTO = 4480
TECNOLOGIAS = ("rns", "meshtastic", "80211s", "batman", "babel", "yggdrasil")

# Comandos permitidos en modo real y validación de sus argumentos.
LISTA_BLANCA: dict[str, re.Pattern[str]] = {
    "iw": re.compile(r"^[a-zA-Z0-9_./:-]+$"),
    "batctl": re.compile(r"^[a-zA-Z0-9_./:-]+$"),
    "yggdrasilctl": re.compile(r"^[a-zA-Z0-9_:/.-]+$"),
    "rnsd": re.compile(r"^[a-zA-Z0-9_./:-]*$"),
    "babeld": re.compile(r"^[a-zA-Z0-9_./:-]*$"),
}

ResultadoCmd = tuple[int, str, str]


class Ejecutor(Protocol):
    """Ejecutor de comandos inyectable (en pruebas, uno falso)."""

    def disponible(self, comando: str) -> bool: ...
    def run(self, argv: list[str], timeout: float = 10.0) -> ResultadoCmd: ...


class EjecutorReal:
    """Ejecutor de verdad: shutil.which + subprocess, nunca shell."""

    def disponible(self, comando: str) -> bool:
        return shutil.which(comando) is not None

    def run(self, argv: list[str], timeout: float = 10.0) -> ResultadoCmd:
        proc = subprocess.run(
            argv, capture_output=True, text=True, timeout=timeout, check=False
        )
        return proc.returncode, proc.stdout, proc.stderr


# ---------------------------------------------------------------------------
# Detección
# ---------------------------------------------------------------------------


def detectar_tecnologias(ejecutor: Ejecutor) -> dict[str, dict]:
    """Qué hay disponible en este nodo y por qué no lo demás."""
    estado: dict[str, dict] = {}

    try:  # importación perezosa de RNS
        import RNS  # noqa: F401

        estado["rns"] = {"disponible": True, "detalle": "librería RNS instalada"}
    except Exception:
        if ejecutor.disponible("rnsd"):
            estado["rns"] = {"disponible": True, "detalle": "demonio rnsd presente"}
        else:
            estado["rns"] = {
                "disponible": False,
                "razon": "ni la librería RNS ni el demonio rnsd están instalados",
            }

    try:  # importación perezosa de meshtastic
        import meshtastic  # noqa: F401

        estado["meshtastic"] = {
            "disponible": True,
            "detalle": "librería meshtastic instalada",
        }
    except Exception:
        estado["meshtastic"] = {
            "disponible": False,
            "razon": "pip install meshtastic y un puerto serie disponible (§5: perfil legal)",
        }

    estado["80211s"] = (
        {"disponible": True, "detalle": "iw presente"}
        if ejecutor.disponible("iw")
        else {"disponible": False, "razon": "falta la utilidad iw (mallas 802.11s solo en Linux)"}
    )
    estado["batman"] = (
        {"disponible": True, "detalle": "batctl presente"}
        if ejecutor.disponible("batctl")
        else {"disponible": False, "razon": "falta batctl o el módulo batman-adv del kernel"}
    )
    estado["babel"] = (
        {"disponible": True, "detalle": "babeld presente"}
        if ejecutor.disponible("babeld")
        else {"disponible": False, "razon": "falta el demonio babeld"}
    )
    estado["yggdrasil"] = (
        {"disponible": True, "detalle": "yggdrasilctl presente"}
        if ejecutor.disponible("yggdrasilctl")
        else {"disponible": False, "razon": "falta yggdrasilctl (yggdrasil-go)"}
    )
    return estado


# ---------------------------------------------------------------------------
# Mediciones
# ---------------------------------------------------------------------------


def medir_rns() -> dict:
    try:
        import RNS

        ret = {"disponible": True, "interfaces": [], "estadisticas": {}}
        try:
            inst = RNS.Reticulum.get_instance()
            stats = getattr(inst, "stats", None)
            if isinstance(stats, dict):
                ret["estadisticas"] = stats
        except Exception:
            ret["aviso"] = "RNS importa pero no hay una instancia viva en este proceso"
        return ret
    except Exception:
        return {"disponible": False, "razon": "librería RNS no instalada"}


def medir_rnode() -> dict:
    """Parámetros de la radio RNode (LoRa/HF/VHF/UHF) vía la librería RNS."""
    try:
        import RNS

        rnode = None
        try:
            inst = RNS.Reticulum.get_instance()
            for interfaz in getattr(inst, "interfaces", []):
                if interfaz.__class__.__name__.startswith("RNode"):
                    rnode = interfaz
                    break
        except Exception:
            pass
        if rnode is None:
            return {"disponible": False, "razon": "no hay ninguna interfaz RNode configurada"}
        extraer: Callable[[str], object] = lambda n: getattr(rnode, n, None)
        return {
            "disponible": True,
            "frecuencia": extraer("frequency"),
            "ancho_de_banda": extraer("bandwidth"),
            "sf": extraer("sf"),
            "cr": extraer("cr"),
            "txpower": extraer("txpower"),
        }
    except Exception:
        return {"disponible": False, "razon": "librería RNS no instalada"}


def medir_meshtastic() -> dict:
    try:
        import meshtastic  # noqa: F401

        return {"disponible": True, "aviso": "la conexión serie/BLE la abre el adaptador del OS"}
    except Exception:
        return {
            "disponible": False,
            "razon": "librería meshtastic no instalada (pip install meshtastic)",
        }


def _interfaces_wifi(ejecutor: Ejecutor) -> list[str]:
    rc, salida, _ = ejecutor.run(["iw", "dev"])
    if rc != 0:
        return []
    return re.findall(r"Interface\s+(\S+)", salida)


def _estaciones(salida: str) -> list[dict]:
    estaciones: list[dict] = []
    actual: dict | None = None
    for linea in salida.splitlines():
        trozo = linea.strip()
        m = re.match(r"Station\s+([0-9a-f:]+)", trozo)
        if m:
            actual = {"mac": m.group(1)}
            estaciones.append(actual)
            continue
        if actual is None:
            continue
        m = re.match(r"signal:\s+(-?\d+)", trozo)
        if m:
            actual["rssi"] = int(m.group(1))
    return estaciones


def _survey(salida: str) -> list[dict]:
    canales: list[dict] = []
    actual: dict | None = None
    for linea in salida.splitlines():
        m = re.search(r"frequency:\s+(\d+(?:\.\d+)?)", linea)
        if m:
            actual = {"frecuencia": float(m.group(1)), "en_uso": "[in use]" in linea}
            canales.append(actual)
            continue
        if actual is None:
            continue
        if "[in use]" in linea:
            actual["en_uso"] = True
        m = re.search(r"noise:\s+(-?\d+)", linea)
        if m:
            actual["ruido"] = int(m.group(1))
    return canales


def medir_wifi(ejecutor: Ejecutor) -> dict:
    if not ejecutor.disponible("iw"):
        return {"disponible": False, "razon": "falta la utilidad iw"}
    salida: dict = {"disponible": True, "interfaces": {}}
    for iface in _interfaces_wifi(ejecutor):
        rc, st, _ = ejecutor.run(["iw", "dev", iface, "station", "dump"])
        rc2, sv, _ = ejecutor.run(["iw", "dev", iface, "survey", "dump"])
        salida["interfaces"][iface] = {
            "estaciones": _estaciones(st) if rc == 0 else [],
            "canales": _survey(sv) if rc2 == 0 else [],
        }
    return salida


def medir_batman(ejecutor: Ejecutor) -> dict:
    if not ejecutor.disponible("batctl"):
        return {"disponible": False, "razon": "falta batctl o batman-adv"}
    rc, origen, _ = ejecutor.run(["batctl", "o"])
    rc2, vecinos, _ = ejecutor.run(["batctl", "n"])
    return {
        "disponible": rc == 0,
        "origenes": origen.splitlines() if rc == 0 else [],
        "vecinos": vecinos.splitlines() if rc2 == 0 else [],
    }


def medir_babel(ejecutor: Ejecutor) -> dict:
    if not ejecutor.disponible("babeld"):
        return {"disponible": False, "razon": "falta el demonio babeld"}
    rc, salida, _ = ejecutor.run(["pgrep", "-x", "babeld"])
    return {"disponible": True, "demonio_activo": rc == 0, "detalle": salida.strip()}


def medir_yggdrasil(ejecutor: Ejecutor) -> dict:
    if not ejecutor.disponible("yggdrasilctl"):
        return {"disponible": False, "razon": "falta yggdrasilctl"}
    rc, salida, err = ejecutor.run(["yggdrasilctl", "getPeers"])
    pares = [linea.split() for linea in salida.splitlines()[1:] if linea.split()]
    return {
        "disponible": rc == 0,
        "pares": pares if rc == 0 else [],
        "error": err.strip() if rc != 0 else "",
    }


def mediciones(ejecutor: Ejecutor) -> dict:
    return {
        "rns": medir_rns(),
        "rnode": medir_rnode(),
        "meshtastic": medir_meshtastic(),
        "wifi": medir_wifi(ejecutor),
        "batman": medir_batman(ejecutor),
        "babel": medir_babel(ejecutor),
        "yggdrasil": medir_yggdrasil(ejecutor),
    }


# ---------------------------------------------------------------------------
# Aplicar (lista blanca, nunca shell) y enviar
# ---------------------------------------------------------------------------


def validar_comando(argv: object) -> str | None:
    """Devuelve None si el comando es válido; un motivo en español si no."""
    if not isinstance(argv, list) or not argv or not all(isinstance(a, str) for a in argv):
        return "el comando debe ser una lista de cadenas no vacía"
    binario, args = argv[0], argv[1:]
    if binario not in LISTA_BLANCA:
        return f"«{binario}» no está en la lista blanca: {sorted(LISTA_BLANCA)}"
    patron = LISTA_BLANCA[binario]
    for arg in args:
        if not patron.fullmatch(arg):
            return f"argumento no válido: «{arg}» (nunca se usa shell)"
    return None


def aplicar(ejecutor: Ejecutor, peticion: dict) -> dict:
    tecnologia = peticion.get("tecnologia", "")
    comandos = peticion.get("comandos")
    if comandos is None:  # también aceptamos un solo comando
        c = peticion.get("comando")
        comandos = [c] if c else []
    seco = bool(peticion.get("seco", True))
    if not comandos:
        return {"ok": False, "error": "no hay comandos que aplicar"}
    for argv in comandos:
        motivo = validar_comando(argv)
        if motivo:
            return {"ok": False, "tecnologia": tecnologia, "error": motivo}
    if seco:
        return {
            "ok": True,
            "seco": True,
            "tecnologia": tecnologia,
            "comandos": comandos,
            "aviso": "modo recomendar: nada se ha ejecutado (§5 del contrato)",
        }
    resultados = []
    for argv in comandos:
        rc, salida, err = ejecutor.run(argv)
        resultados.append({"comando": argv, "rc": rc, "salida": salida, "error": err})
        if rc != 0:
            return {"ok": False, "seco": False, "resultados": resultados}
    return {"ok": True, "seco": False, "tecnologia": tecnologia, "resultados": resultados}


def enviar(peticion: dict) -> dict:
    tecnologia = peticion.get("tecnologia", "simulado")
    datos_b64 = peticion.get("datos", "")
    try:
        datos = base64.b64decode(datos_b64 or b"", validate=bool(datos_b64))
    except Exception:
        return {"ok": False, "error": "«datos» debe estar en base64"}
    sobre = {
        "destino": peticion.get("destino"),
        "clase": peticion.get("clase", "mensajes"),
        "bytes": len(datos),
    }
    if tecnologia == "simulado":
        return {"ok": True, "via": "simulado", **sobre}
    if tecnologia in ("rns", "meshtastic"):
        try:
            __import__("RNS" if tecnologia == "rns" else "meshtastic")
        except Exception:
            return {
                "ok": False,
                "error": f"librería {tecnologia} no instalada; instálala o usa «simulado»",
            }
        return {
            "ok": False,
            "error": "el envío real lo hace la instancia RNS/Meshtastic del adaptador del OS",
        }
    return {"ok": False, "error": f"tecnología desconocida para enviar: {tecnologia}"}


# ---------------------------------------------------------------------------
# Servidor HTTP (biblioteca estándar, solo 127.0.0.1)
# ---------------------------------------------------------------------------


def crear_manejador(ejecutor: Ejecutor) -> type[BaseHTTPRequestHandler]:
    class ManejadorCamr(BaseHTTPRequestHandler):
        server_version = "CAMR/1.0"

        def _json(self, carga: dict, codigo: int = 200) -> None:
            cuerpo = json.dumps(carga, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)

        def _cuerpo(self) -> dict:
            largo = int(self.headers.get("Content-Length", "0") or "0")
            if largo <= 0 or largo > 1_000_000:
                return {}
            try:
                return json.loads(self.rfile.read(largo))
            except Exception:
                return {}

        def log_message(self, formato: str, *args: object) -> None:  # silencio
            pass

        def do_GET(self) -> None:  # noqa: N802 (nombre exigido por la librería)
            if self.path == "/estado":
                self._json({
                    "agente": "camr",
                    "puerto": PUESTO,
                    "tecnologias": detectar_tecnologias(ejecutor),
                })
            elif self.path == "/mediciones":
                self._json(mediciones(ejecutor))
            else:
                self._json({"error": "ruta desconocida"}, 404)

        def do_POST(self) -> None:  # noqa: N802
            peticion = self._cuerpo()
            if self.path == "/aplicar":
                self._json(aplicar(ejecutor, peticion))
            elif self.path == "/enviar":
                self._json(enviar(peticion))
            else:
                self._json({"error": "ruta desconocida"}, 404)

    return ManejadorCamr


def crear_servidor(puerto: int = PUESTO, ejecutor: Ejecutor | None = None) -> ThreadingHTTPServer:
    """Servidor que escucha SOLO en 127.0.0.1 (nunca expuesto a la red)."""
    return ThreadingHTTPServer(("127.0.0.1", puerto), crear_manejador(ejecutor or EjecutorReal()))


def main() -> None:
    servidor = crear_servidor()
    print(f"Agente CAMR en http://127.0.0.1:{PUESTO} (solo local; Ctrl-C para parar)")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        servidor.shutdown()


if __name__ == "__main__":
    main()
