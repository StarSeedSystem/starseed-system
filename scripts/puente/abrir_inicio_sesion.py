#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SES1126A · Los directores inician las sesiones; Maggasukha solo inicia sesión.

`iniciar(sesion, motivo)` (lo llama el sanador en vez de «escalado autoservicio»):
1. escribe un guion .command (macOS) / .sh (Linux) que lanza el inicio de sesión y,
   si hace falta una clave, la pide con `read -s` y la guarda en ~/.starseed/env (600);
2. lo abre con `open -a Terminal` (sin AppleScript) o, sin sesión gráfica, manda por
   Telegram (canal Principal) el comando exacto;
3. lanza un vigía que espera el archivo de estado del guion, comprueba la sesión y
   avisa UNA vez;
4. nunca más de un aviso por sesión cada 6 h.
Nunca imprime ni registra una clave. Todo lo externo se puede inyectar (pruebas).
"""
from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

AVISO_HORAS = 6
ESPERA_VIGIA_S = 1800
SONDEO_VIGIA_S = 10

# sesion -> título, pasos (líneas de shell), comprobación (argv) y clave opcional (variable de entorno).
SESIONES: dict[str, dict[str, Any]] = {
    "claude": {"titulo": "Claude Code", "pasos": ["claude auth login", "claude setup-token"],
               "comprobar": ["claude", "auth", "status"]},
    "gh": {"titulo": "GitHub", "pasos": ["gh auth login --web"], "comprobar": ["gh", "auth", "status"]},
    "agy": {"titulo": "Antigravity", "pasos": ["agy auth login"], "comprobar": ["agy", "auth", "status"]},
    "codex": {"titulo": "Codex", "pasos": ["codex login"], "comprobar": ["codex", "login", "status"]},
    "vercel": {"titulo": "Vercel", "pasos": ["vercel login"], "comprobar": ["vercel", "whoami"]},
    "notebooklm": {"titulo": "NotebookLM", "pasos": ["notebooklm login"], "comprobar": ["notebooklm", "auth", "check"]},
    "higgsfield": {"titulo": "Higgsfield", "pasos": ["higgsfield auth login"], "comprobar": ["higgsfield", "auth", "status"]},
    "higgsfield-clave": {"titulo": "Higgsfield (clave)", "pasos": [], "clave": "HIGGSFIELD_API_KEY",
                         "comprobar": ["higgsfield", "auth", "status"]},
}


def _ahora() -> datetime:
    return datetime.now().astimezone()


def _cola_clave(var: str, env: Path) -> list[str]:
    """Líneas del guion que piden la clave oculta y la guardan sin imprimirla."""
    e = shlex.quote(str(env))
    return [f"printf 'Pega la clave de {var} (no se ve): '", "read -r -s CLAVE", "echo",
            f"mkdir -p \"$(dirname {e})\" && touch {e} && chmod 600 {e}",
            f"grep -v '^export {var}=' {e} > {e}.tmp; mv {e}.tmp {e}; chmod 600 {e}",
            f"printf 'export {var}=%s\\n' \"$CLAVE\" >> {e}", "unset CLAVE"]


def generar_guion(sesion: str, carpeta: Path, plataforma: str, home: Path) -> tuple[Path, Path]:
    """Escribe el guion y devuelve (guion, archivo_de_estado). El estado lleva «ok» o «fallo»."""
    ficha = SESIONES[sesion]
    ext = ".command" if plataforma == "darwin" else ".sh"
    guion = carpeta / f"Sesion-{sesion}{ext}"
    estado = carpeta / f"estado-{sesion}.txt"
    lineas = ["#!/bin/bash", "set -u", f"echo 'StarSeed · iniciar sesión de {ficha['titulo']}'",
              f"rm -f {shlex.quote(str(estado))}", "RC=0"]
    if ficha.get("clave"):
        lineas += _cola_clave(ficha["clave"], home / ".starseed" / "env")
    for paso in ficha["pasos"]:
        lineas.append(f"{paso} || RC=1")
    lineas += [f"if [ $RC -eq 0 ]; then echo ok > {shlex.quote(str(estado))}; "
               f"else echo fallo > {shlex.quote(str(estado))}; fi",
               "echo 'Listo. Puedes cerrar esta ventana.'"]
    carpeta.mkdir(parents=True, exist_ok=True)
    guion.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    guion.chmod(0o755)
    return guion, estado


def _hay_sesion_grafica(plataforma: str, entorno: dict[str, str]) -> bool:
    if plataforma == "darwin":
        return not entorno.get("SSH_CONNECTION") and shutil.which("open") is not None
    return bool(entorno.get("DISPLAY") or entorno.get("WAYLAND_DISPLAY"))


def _abrir_real(guion: Path, plataforma: str) -> bool:
    cmd = ["open", "-a", "Terminal", str(guion)] if plataforma == "darwin" else ["x-terminal-emulator", "-e", str(guion)]
    try:
        return subprocess.run(cmd, capture_output=True, timeout=20).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def _enviar_real(mensaje: str) -> dict[str, Any]:
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        import entorno
        return entorno.enviar_telegram(mensaje)
    except Exception as exc:  # el canal puede no existir en este nodo
        return {"ok": False, "motivo": f"sin canal: {type(exc).__name__}"}


def _comprobar_real(argv: list[str]) -> bool:
    if not shutil.which(argv[0]):
        return False
    try:
        return subprocess.run(argv, capture_output=True, timeout=60).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def _vigia_real(sesion: str, guion: Path, estado: Path) -> None:
    subprocess.Popen([sys.executable, str(Path(__file__)), "vigilar", sesion, str(estado)],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def _ya_avisado(ruta: Path, sesion: str, ahora: datetime) -> bool:
    try:
        previo = json.loads(ruta.read_text(encoding="utf-8")).get(sesion)
        return bool(previo) and ahora - datetime.fromisoformat(previo) < timedelta(hours=AVISO_HORAS)
    except (OSError, ValueError):
        return False


def _anotar(ruta: Path, sesion: str, ahora: datetime) -> None:
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        datos = {}
    datos[sesion] = ahora.isoformat()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos), encoding="utf-8")
    os.replace(tmp, ruta)


def iniciar(sesion: str, motivo: str = "", *, home: Path | None = None, plataforma: str | None = None,
            entorno: dict[str, str] | None = None, abrir_fn: Callable[[Path], bool] | None = None,
            enviar_fn: Callable[[str], dict[str, Any]] | None = None,
            vigia_fn: Callable[[str, Path, Path], None] | None = None,
            ahora_fn: Callable[[], datetime] = _ahora) -> dict[str, Any]:
    """Prepara y lanza el inicio de sesión. Devuelve {ok, detalle, via} (ok=False si no hay quien lo haga)."""
    if sesion not in SESIONES:
        return {"ok": False, "motivo": f"sesión sin receta de inicio: {sesion}"}
    home = home or Path.home()
    plataforma = plataforma or sys.platform
    entorno = os.environ if entorno is None else entorno
    registro = home / ".starseed" / "inicio_sesion_avisos.json"
    ahora = ahora_fn()
    if _ya_avisado(registro, sesion, ahora):
        return {"ok": True, "detalle": f"{sesion} ya avisado hace menos de {AVISO_HORAS} h", "via": "ya_avisado"}
    guion, estado = generar_guion(sesion, home / ".starseed" / "inicio_sesion", plataforma, home)
    enviar = enviar_fn or _enviar_real
    abrir = abrir_fn or (lambda g: _abrir_real(g, plataforma))
    via = "terminal" if _hay_sesion_grafica(plataforma, entorno) and abrir(guion) else ""
    if via:
        enviar(f"StarSeed · {SESIONES[sesion]['titulo']} sin sesión. Abrí la Terminal en tu neurona: solo inicia sesión.")
    else:
        r = enviar(f"StarSeed · {SESIONES[sesion]['titulo']} sin sesión. En la neurona, pega este comando:\nbash {guion}")
        if not r.get("ok"):
            return {"ok": False, "motivo": f"sin Terminal ni Telegram: {r.get('motivo', 'sin canal')}"}
        via = "telegram"
    _anotar(registro, sesion, ahora)
    (vigia_fn or _vigia_real)(sesion, guion, estado)
    return {"ok": True, "detalle": f"inicio de sesión de {sesion} lanzado por {via}", "via": via}


def vigilar(sesion: str, estado: Path, *, comprobar_fn: Callable[[list[str]], bool] = _comprobar_real,
            enviar_fn: Callable[[str], dict[str, Any]] = _enviar_real, espera_s: float = ESPERA_VIGIA_S,
            sondeo_s: float = SONDEO_VIGIA_S, dormir: Callable[[float], None] = time.sleep) -> str:
    """Espera el archivo de estado, comprueba la sesión y avisa una sola vez. Devuelve el desenlace."""
    titulo = SESIONES[sesion]["titulo"]
    t = 0.0
    while t <= espera_s:
        if estado.exists():
            if comprobar_fn(SESIONES[sesion]["comprobar"]):
                enviar_fn(f"StarSeed · {titulo}: sesión iniciada y comprobada. Sigo solo.")
                return "ok"
            enviar_fn(f"StarSeed · {titulo}: el inicio terminó pero la sesión no responde. Los directores lo reintentan.")
            return "fallo"
        dormir(sondeo_s)
        t += sondeo_s
    enviar_fn(f"StarSeed · {titulo}: nadie terminó el inicio de sesión a tiempo. Reintento en la próxima ronda.")
    return "caducado"


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "vigilar":
        print(vigilar(sys.argv[2], Path(sys.argv[3])))
    elif len(sys.argv) >= 2 and sys.argv[1] in SESIONES:
        print(json.dumps(iniciar(sys.argv[1], " ".join(sys.argv[2:])), ensure_ascii=False))
    else:
        print("uso: abrir_inicio_sesion.py <sesion> [motivo] | vigilar <sesion> <estado>", file=sys.stderr)
        sys.exit(2)
