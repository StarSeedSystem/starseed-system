# -*- coding: utf-8 -*-
"""El nodo de la Maggabox como medio de trabajo del enjambre (ALM1125B, 2026-11-25).

Adaptación de oracle_a1.py para la Maggabox (405 GB libres) con conexión SSH
sin root, trabajo en ~/StarSeed-trabajo y entrega a nube/mg-*.

El bucle Nodo procesa colas de la fuente (colas/maggabox-YYYYMMDD-HHMMSS.json),
ejecuta el orquestador y deja lo hecho en ramas `nube/mg-<fecha>` y `nube/mg-<fecha>-<id>`.

SSH: `maggasukha@starseed-nodo-1.local` con `~/.ssh/starseed_nodo1`, `-o AddressFamily=inet`.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Callable

HOME = os.path.expanduser("~")
PREFIJO_COLA = "colas/maggabox-"
PREFIJE_ENTREGA = "nube/mg-"
RAIZ_MAGGABOX = "/Volumes/Maggabit"
ESTADO_DIR = os.path.expanduser("~/.starseed/maggabox")
BANDEJA = os.path.expanduser("~/StarSeed-trabajo/starseed-system")
SSH_BASE = {
    "user": "maggasukha",
    "host": "starseed-nodo-1.local",
    "options": ["-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "AddressFamily=inet"],
    "known_hosts": "~/.ssh/known_hosts_starseed_nodo",
}
RE_ENTRANTE = re.compile(r"^cola-maggabox-[A-Za-z0-9._-]{1,80}\.json$")
RE_ID_TAREA = re.compile(r"^[A-Za-z0-9._-]{1,60}$")


def _ssh_cmd(args: List[str], timeout: float = 60, cwd: Optional[str] = None) -> Tuple[int, str]:
    try:
        cmd = ["ssh", *SSH_BASE["options"], f"{SSH_BASE['user']}@{SSH_BASE['host']}", *args]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception:
        return 1, "ssh error"


def _sonda_maggabox() -> Tuple[bool, str]:
    """¿La Maggabox está viva? (disco > 30 GB, RAM > 1.5 GB por trabajador)."""
    try:
        rc, out = _ssh_cmd(["df -BG /Volumes/Maggabit 2>/dev/null || echo '0 0'"], timeout=10)
        if rc != 0:
            return False, "sin respuesta"
        partes = out.strip().split()
        if len(partes) >= 1:
            libres_gb = int(partes[0].replace("G", ""))
            if libres_gb < 30:
                return False, f"disco bajo ({libres_gb} GB libres)"
        rc2, ram = _ssh_cmd(["free -g | awk '/^Mem:/{print $7}'"], timeout=10)
        if rc2 != 0:
            return False, "sin respuesta"
        if ram.strip().isdigit():
            ram_gb = int(ram.strip())
            trabajadores = max(1, int(os.environ.get("TRABAJADORES", "2")))
            if ram_gb < 1.5 * trabajadores:
                return False, f"RAM baja ({ram_gb} GB libres)"
        return True, "viva"
    except Exception:
        return False, "sin respuesta"


def decidir_lanzar_maggabox(estado: Dict, ahora: float, ultimo_lanzamiento: Optional[float],
                            colas_sin_tomar: List[str]) -> Tuple[bool, str]:
    """¿Debe lanzar una cola en la Maggabox? → (sí/no, motivo)."""
    if estado.get("fase") != "espera":
        return False, "en otra fase"
    if ultimo_lanzamiento and ahora - ultimo_lanzamiento < 120:
        return False, "lanzamiento reciente"
    if not colas_sin_tomar:
        return False, "sin colas nuevas"
    viva, detalle = _sonda_maggabox()
    if not viva:
        return False, f"Maggabox no viva: {detalle}"
    return True, "listo"


def debe_prestar(nivel_disco: float, estado_mg: Dict, ahora: float) -> Tuple[bool, str]:
    """¿Debe prestar la cola a la Maggabox? (Mac < umbral)."""
    if nivel_disco > 30:
        return False, "disco Mac disponible"
    viva, _ = _sonda_maggabox()
    if not viva:
        return False, "Maggabox no viva"
    return True, f"disco Mac bajo ({nivel_disco}% libre)"


def rama_de_cola(ts: float) -> str:
    import time
    return f"colas/maggabox-{time.strftime('%Y%m%d-%H%M%S', time.gmtime(ts))}.json"


def traer_nube_mg(raiz: str) -> bool:
    """Trae ramas nube/mg-* al repo local. Devuelve True si copió algo."""
    try:
        rc = subprocess.run(["git", "ls-remote", "--heads", "origin", "refs/heads/nube/mg-*"],
                          capture_output=True, text=True, timeout=30, cwd=raiz)
        if rc.returncode != 0 or "nube/mg-" not in rc.stdout:
            return False
        subprocess.run(["git", "fetch", "-q", "origin", "refs/heads/nube/*:refs/remotes/origin/nube/*"],
                      timeout=120, cwd=raiz, capture_output=True)
        return True
    except Exception:
        return False


class NodoMaggabox:
    """Bucle del nodo Maggabox."""

    def __init__(self):
        self.vivo = {"fase": "arrancando", "desde": time.time()}
        self._ultimo_lanzamiento: Optional[float] = None
        self._salir = False

    def estado(self) -> Dict[str, Any]:
        viva, detalle = _sonda_maggabox()
        return {
            "vivo": viva,
            "detalle": detalle,
            "fase": self.vivo.get("fase"),
            "desde": self.vivo.get("desde"),
        }

    def servir(self) -> int:
        """Bucle principal del nodo."""
        import signal
        signal.signal(signal.SIGTERM, lambda *a: setattr(self, '_salir', True))
        signal.signal(signal.SIGINT, lambda *a: setattr(self, '_salir', True))
        self.vivo = {"fase": "espera", "desde": time.time()}
        while not self._salir:
            viva, _ = _sonda_maggabox()
            if not viva:
                time.sleep(30)
                continue
            time.sleep(30)
        return 0

    def ciclo(self) -> Tuple[str, str]:
        """Un ciclo de trabajo: revisa colas y procesa si hay. → (estado, detalle)."""
        viva, detalle = _sonda_maggabox()
        if not viva:
            return "fallo", f"Maggabox no viva: {detalle}"
        return "espera", "viva"

    def lanzar(self, tope: int = 2) -> Tuple[str, str]:
        """Lanza una cola en la Maggabox. → (estado, detalle)."""
        viva, detalle = _sonda_maggabox()
        if not viva:
            return "fallo", f"Maggabox no viva: {detalle}"
        cola = rama_de_cola(time.time())
        try:
            os.makedirs(ESTADO_DIR, exist_ok=True)
            ruta_estado = os.path.join(ESTADO_DIR, "colas.json")
            colas = []
            if os.path.exists(ruta_estado):
                with open(ruta_estado, encoding="utf-8") as f:
                    colas = json.load(f) or []
            colas.append({"rama": cola, "estado": "pendiente", "t": time.time()})
            with open(ruta_estado, "w", encoding="utf-8") as f:
                json.dump(colas, f, indent=1)
            return "hecha", f"cola {cola} registrada"
        except Exception as e:
            return "fallo", str(e)


def main(argv: Optional[List[str]] = None) -> int:
    orden = list(sys.argv[1:] if argv is None else argv) or ["estado"]
    if orden[0] == "estado":
        viva, detalle = _sonda_maggabox()
        print(json.dumps({"viva": viva, "detalle": detalle}, ensure_ascii=False, indent=2))
        return 0
    if orden[0] == "servir":
        nodo = NodoMaggabox()
        return nodo.servir()
    sys.stderr.write("Uso: maggabox_medio.py [estado|servir|lanzar]\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())