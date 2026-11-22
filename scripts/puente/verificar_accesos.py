#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ACC1121D · tabla canal × medio de accesos del director (sin enviar nada ni tocar el enjambre)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

CANALES = ("principal", "general", "audiovisual")
MEDIOS = ("telegram", "bot-a1", "astraura", "metagenesis", "antigravity", "codex", "mac")
ESTADOS = ("puede", "no puede", "no comprobable")
Sonda = Tuple[str, str]

def ruta_salida() -> Path:
    raiz = Path(os.environ.get("STARSEED_MEMORY_ROOT") or Path.home() / "starseed_memory_root")
    return raiz / "mando" / "director" / "verificacion-accesos.json"

def leer_entorno() -> Dict[str, str]:
    datos: Dict[str, str] = {}
    for ruta in (Path.home() / ".starseed" / "env", Path.home() / ".hermes" / ".env"):
        try:
            for linea in ruta.read_text(encoding="utf-8").splitlines():
                if "=" in linea and not linea.strip().startswith("#"):
                    k, v = linea.split("=", 1)
                    datos[k.strip()] = v.strip().strip('"').strip("'")
        except OSError:
            pass
    return datos

def _probar() -> Tuple[bool, bool, bool]:
    try:
        import sincronizador_direccion as S
        motor = (S.interpretar_orden_director("estado")["tipo"] == "estado"
                 and S.interpretar_orden_director("busca más capacidad")["tipo"] == "orden")
    except Exception:  # noqa: BLE001
        motor = False
    try:
        import mcp_director_ordenes as O
        puerta = "Alex" in O.ejecutar("cerrar_apps", {}, "verificador", "prueba inocua")
    except Exception:  # noqa: BLE001
        puerta = False
    try:
        import mcp_director as M
        mcp = any(h.get("name") == "metagenesis_orden" for h in M.HERRAMIENTAS)
    except Exception:  # noqa: BLE001
        mcp = False
    return motor, puerta, mcp

def sondear(env: Optional[Dict[str, str]] = None,
            pruebas: Optional[Tuple[bool, bool, bool]] = None) -> Dict[Tuple[str, str], Sonda]:
    env = leer_entorno() if env is None else env
    motor, puerta, mcp = _probar() if pruebas is None else pruebas
    if not motor:
        return {(c, m): ("no puede", "el motor común no reconoce estado y orden")
                for c in CANALES for m in MEDIOS}
    s: Dict[Tuple[str, str], Sonda] = {}
    tg = {
        "principal": ("TELEGRAM_MAGGACORTEX_BOT_TOKEN", "TELEGRAM_MAGGACORTEX_CHAT_ID"),
        "general": ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"),
        "audiovisual": ("TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID"),
    }
    codex = Path.home() / ".codex" / "config.toml"
    codex_ok = mcp and codex.exists() and "starseed-director" in codex.read_text(errors="ignore")
    comunes = {
        "astraura": ("no comprobable", "la pestaña usa /api/metagenesis/orden (acciones de nodo), "
                                       "no la puerta metagenesis_orden"),
        "metagenesis": ("no comprobable", "el panel usa /api/metagenesis/orden (acciones de nodo), "
                                          "no la puerta metagenesis_orden"),
        "antigravity": (("puede", "MCP starseed-director expone metagenesis_orden") if mcp
                        else ("no comprobable", "no se pudo leer la lista de herramientas del MCP")),
        "codex": (("puede", "MCP registrado en Codex y expone metagenesis_orden") if codex_ok
                  else ("no comprobable", "Codex no tiene registrado starseed-director con la herramienta")),
        "mac": (("puede", "la puerta local contestó la orden reservada sin ejecutarla") if puerta
                else ("no puede", "la puerta local no respondió a la orden inocua")),
    }
    for canal, (tok, chat) in tg.items():
        s[(canal, "telegram")] = (
            ("puede", "bot y chat de Alex configurados; mismo motor")
            if env.get(tok) and env.get(chat) else ("no puede", "faltan %s/%s" % (tok, chat)))
        s[(canal, "bot-a1")] = (
            ("puede", "bot del A1 con reenvío a la puerta del Mac")
            if canal == "audiovisual" and env.get(tok) and env.get(chat)
            else ("no puede", "el bot del A1 solo atiende audiovisual"))
        for medio, sonda in comunes.items():
            s[(canal, medio)] = sonda
    return s

def evaluar(sondas: Dict[Tuple[str, str], Sonda]) -> List[Dict[str, str]]:
    tabla: List[Dict[str, str]] = []
    for canal in CANALES:
        for medio in MEDIOS:
            estado, motivo = sondas.get((canal, medio), ("no comprobable", "sin sonda para este medio"))
            if estado not in ESTADOS:
                estado, motivo = "no comprobable", "estado inválido: %s" % estado
            tabla.append({"canal": canal, "medio": medio, "estado": estado, "motivo": motivo})
    return tabla

def resumir(tabla: List[Dict[str, str]]) -> Dict[str, int]:
    cuenta = {e: 0 for e in ESTADOS}
    for fila in tabla:
        cuenta[fila["estado"]] = cuenta.get(fila["estado"], 0) + 1
    return cuenta

def main() -> int:
    tabla = evaluar(sondear())
    destino = ruta_salida()
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(
        {"canales": list(CANALES), "medios": list(MEDIOS), "tabla": tabla,
         "resumen": resumir(tabla)}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Tabla canal × medio → %s" % destino)
    for f in tabla:
        print("%-12s %-12s %-15s %s" % (f["canal"], f["medio"], f["estado"], f["motivo"]))
    return 0

if __name__ == "__main__":
    sys.exit(main())
