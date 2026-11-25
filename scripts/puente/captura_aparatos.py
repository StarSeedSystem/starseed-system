#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1118B · Capturas y vídeo de evidencia en Mac, Maggabox y tableta.

Uso: captura <aparato> [--prueba ID] · grabar <aparato> --segundos N [--prueba ID]
Con --prueba guarda en starseed_memory_root/pruebas/evidencias/<ID>/; sin él, en «sueltas».
La elección de herramienta y la lectura de errores son puras (test_captura_aparatos.py).
"""
import re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ_REPO = Path(__file__).resolve().parents[2]
EVIDENCIAS_DIR = RAIZ_REPO / "starseed_memory_root" / "pruebas" / "evidencias"
APARATOS = ("mac", "maggabox", "tableta")
MAGGABOX_HOST = "maggasukha@starseed-nodo-1.local"
FOTO_MAGGABOX = ("xfce4-screenshooter", "import", "xwd")
VIDEO_MAGGABOX = ("ffmpeg",)
PERMISO_MAC = "Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla y audio del sistema"
def falta_permiso_mac(salida):
    """PURA. Reconoce el error de permisos de grabación de pantalla en macOS."""
    t = (salida or "").lower()
    return any(p in t for p in ("could not create image", "screen recording", "not permitted", "no permission"))
def elegir_herramienta(disponibles, modo):
    """PURA. Elige la herramienta de Maggabox por el orden acordado con PRU1118A."""
    for n in (VIDEO_MAGGABOX if modo == "video" else FOTO_MAGGABOX):
        if n in set(disponibles): return n
    return None
def paquete_que_falta(disponibles, modo):
    """PURA. Nombra el paquete que habría que instalar en Maggabox."""
    return "ffmpeg" if modo == "video" else "xfce4-screenshooter, imagemagick (import) o x11-apps (xwd)"
def aparato_adb(salida):
    """PURA. True solo si `adb devices` muestra un aparato en estado «device»."""
    return any(len(p) >= 2 and p[1] == "device" for p in (ln.strip().split() for ln in (salida or "").splitlines()))
def carpeta_destino(prueba, base=EVIDENCIAS_DIR):
    """PURA. Carpeta de evidencias de la prueba; sin id, la carpeta «sueltas»."""
    limpio = re.sub(r"[^A-Za-z0-9._-]+", "-", prueba or "").strip("-.")
    return base / (limpio or "sin-id") if prueba else base / "sueltas"

def nombre_archivo(aparato, modo, momento, extension):
    """PURA. Nombre trazable: aparato-modo-fecha.extension."""
    return f"{aparato}-{modo}-{momento}{extension}"

def comando_maggabox(herramienta, salida_remota, segundos=0, display=":0"):
    """PURA. Orden que se ejecuta por SSH en Maggabox, siempre con DISPLAY=:0."""
    if herramienta == "ffmpeg":
        return f"DISPLAY={display} ffmpeg -y -loglevel error -f x11grab -framerate 15 -i {display} -t {int(segundos)} -pix_fmt yuv420p {salida_remota}"
    if herramienta == "xfce4-screenshooter": return f"DISPLAY={display} xfce4-screenshooter -f -s {salida_remota}"
    if herramienta == "import": return f"DISPLAY={display} import -window root {salida_remota}"
    if herramienta == "xwd": return f"DISPLAY={display} xwd -root -silent -out {salida_remota}"
    raise ValueError(f"herramienta de Maggabox desconocida: {herramienta}")

def comando_tableta(modo, salida_remota, segundos=0):
    """PURA. Orden de adb: screencap por stdout para foto y screenrecord para vídeo."""
    if modo == "video": return ["adb", "shell", "screenrecord", "--time-limit", str(int(segundos)), salida_remota]
    return ["adb", "exec-out", "screencap", "-p"]

def mensaje_error(aparato, modo, salida, herramienta=None):
    """PURA. Explica el fallo sin conceder permisos ni encender nada."""
    if aparato == "mac" and falta_permiso_mac(salida):
        return f"mac: faltan los permisos de «StarSeed Hermes» (HERL1118A/B); concédelos en {PERMISO_MAC}"
    if aparato == "maggabox" and herramienta is None:
        return f"maggabox: no hay herramienta de {modo}; instala {paquete_que_falta(set(), modo)}"
    if aparato == "tableta" and not aparato_adb(salida):
        return "tableta: no hay aparato adb emparejado; empareja la tableta antes de capturar"
    return ""
def opciones_ssh(casa=None):
    """PURA. Opciones de ssh a la Maggabox: IPv4 y rutas del host expandidas."""
    hogar = Path.home() if casa is None else Path(casa)
    return [
        "-o", "AddressFamily=inet",
        "-o", "IdentitiesOnly=yes",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=8",
        "-o", "UserKnownHostsFile=" + str(hogar / ".ssh" / "known_hosts_starseed_nodo"),
    ]
def comando_ssh(comando, casa=None):
    """PURA. argv de ssh a la Maggabox con la clave y el known_hosts expandidos."""
    hogar = Path.home() if casa is None else Path(casa)
    return ["ssh", "-i", str(hogar / ".ssh" / "starseed_nodo1"), *opciones_ssh(casa), MAGGABOX_HOST, comando]
def comando_scp(origen, destino, casa=None):
    """PURA. argv de scp a la Maggabox con las mismas opciones de IPv4."""
    hogar = Path.home() if casa is None else Path(casa)
    return ["scp", "-i", str(hogar / ".ssh" / "starseed_nodo1"), *opciones_ssh(casa), origen, destino]
def _ssh(comando):
    return subprocess.run(comando_ssh(comando), capture_output=True, text=True, timeout=40)
def _herramientas():
    orden = " ".join(FOTO_MAGGABOX + VIDEO_MAGGABOX)
    return set(_ssh(f'for h in {orden}; do command -v "$h" >/dev/null 2>&1 && echo "$h"; done').stdout.split())
def _tomar(aparato, modo, destino, segundos):
    if aparato == "mac":
        orden = ["screencapture", "-v", "-V", str(segundos), str(destino)] if modo == "video" else ["screencapture", "-x", str(destino)]
        r = subprocess.run(orden, capture_output=True, text=True, timeout=segundos + 30)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    if aparato == "maggabox":
        h = elegir_herramienta(_herramientas(), modo)
        if h is None: return 1, mensaje_error("maggabox", modo, "", None)
        remoto = f"/tmp/starseed-evidencia-{datetime.now(timezone.utc):%H%M%S}" + (".mp4" if modo == "video" else ".png")
        r = _ssh(comando_maggabox(h, remoto, segundos))
        c = subprocess.run(comando_scp(f"{MAGGABOX_HOST}:{remoto}", str(destino)), capture_output=True, text=True, timeout=60)
        _ssh(f"rm -f {remoto}")
        return (0 if not r.returncode and not c.returncode else 1), (r.stderr or c.stderr or "")
    r = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=10)
    if not aparato_adb(r.stdout): return 1, mensaje_error("tableta", modo, r.stdout)
    if modo == "foto":
        with open(destino, "wb") as f:
            c = subprocess.run(comando_tableta("foto", "", 0), stdout=f, stderr=subprocess.PIPE, timeout=30)
        return c.returncode, (c.stderr or b"").decode("utf-8", "replace")
    remoto = f"/sdcard/starseed-evidencia-{datetime.now(timezone.utc):%H%M%S}.mp4"
    r = subprocess.run(comando_tableta("video", remoto, segundos), capture_output=True, text=True, timeout=segundos + 30)
    c = subprocess.run(["adb", "pull", remoto, str(destino)], capture_output=True, text=True, timeout=60)
    subprocess.run(["adb", "shell", "rm", "-f", remoto], capture_output=True, timeout=15)
    return (0 if not c.returncode else 1), (r.stderr or c.stderr or "").strip()
def capturar(aparato, modo="foto", segundos=0, prueba=None):
    if modo == "video" and segundos <= 0:
        print("grabar necesita --segundos mayor que cero"); return 2
    carpeta = carpeta_destino(prueba); carpeta.mkdir(parents=True, exist_ok=True)
    momento = f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}"; extension = ".mov" if aparato == "mac" and modo == "video" else ".mp4" if modo == "video" else ".png"
    destino = carpeta / nombre_archivo(aparato, modo, momento, extension)
    try:
        codigo, salida = _tomar(aparato, modo, destino, segundos)
    except (OSError, subprocess.SubprocessError) as e:
        codigo, salida = 1, str(e)
    if codigo != 0 or not destino.exists() or destino.stat().st_size == 0:
        print(mensaje_error(aparato, modo, salida) or f"{aparato}: fallo al capturar: {salida.strip()}"); return 1
    print(f"Evidencia de {aparato} guardada en {destino}"); return 0
def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) < 2 or args[0] not in ("captura", "grabar"):
        print(__doc__); return 2
    modo, aparato, resto = ("foto" if args[0] == "captura" else "video"), args[1], args[2:]
    if aparato not in APARATOS:
        print(f"aparato desconocido: {aparato}; usa {', '.join(APARATOS)}"); return 2
    prueba = resto[resto.index("--prueba") + 1] if "--prueba" in resto else None; segundos = int(resto[resto.index("--segundos") + 1]) if "--segundos" in resto else 0
    return capturar(aparato, modo, segundos, prueba)
if __name__ == "__main__":
    sys.exit(main())
