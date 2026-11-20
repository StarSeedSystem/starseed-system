#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Módulo NotebookLM: Drive, lanzar/esperar/descargar artefactos, CLI inyectable."""
import fcntl
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from typing import Any

from peticiones_reglas import TIPOS, INDICACIONES

CASA = os.path.expanduser("~")
NBLM = os.path.join(CASA, ".starseed", "venvs", "notebooklm", "bin", "notebooklm")
CUADERNO = os.environ.get("STARSEED_CUADERNO_PRODUCCION", "dc62bea7-a241-46b6-a9f9-1ea954f0ea16")
CARPETA_SINTESIS = os.environ.get("STARSEED_CARPETA_SINTESIS", "1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI")
SALIDAS = os.path.join(CASA, ".starseed", "peticiones", "salidas")
ENLACE_CUADERNO = "https://notebooklm.google.com/notebook/" + CUADERNO

LOCK_PATH = os.path.join(CASA, ".notebooklm", "profiles", "default", ".starseed-cli.lock")


class SesionCaducada(Exception):
    """Sesión de NotebookLM caducada (autenticación expirada)."""
    pass


class SesionTransitoria(Exception):
    """Error transitorio de red/timeout - no es caducidad, se reintenta sin avisar."""
    pass


@contextmanager
def _cerrojo_notebooklm(bloquear: bool = True):
    """Cerrojo entre procesos para el CLI de NotebookLM usando fcntl.flock.
    
    Args:
        bloquear: Si True, bloquea hasta obtener el cerrojo. Si False (keepalive),
                  retorna False inmediatamente si está ocupado.
    """
    os.makedirs(os.path.dirname(LOCK_PATH), exist_ok=True)
    fd = os.open(LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        if bloquear:
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield True
        else:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                yield True
            except BlockingIOError:
                yield False
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        except Exception:
            pass
        os.close(fd)


def leer_json(ruta: str, defecto: Any) -> Any:
    try:
        with open(ruta) as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def escribir_json(ruta: str, datos: Any) -> None:
    tmp = ruta + ".tmp"
    with open(tmp, "w") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _respuesta_http(abrir):
    try:
        with abrir() as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {"ok": False, "description": "HTTP %s" % e.code}
    except Exception as e:
        return {"ok": False, "description": type(e).__name__}


def token_google(alias: str = "alex") -> str:
    vistos: list[str] = []
    ultimo_err = "?"
    for candidato in (alias, "alex", "alex-docs", "fundacion"):
        if not candidato or candidato in vistos:
            continue
        vistos.append(candidato)
        c = leer_json(os.path.join(CASA, ".starseed", "cuentas", candidato + ".json"), {})
        if not c.get("refresh_token"):
            continue
        datos = urllib.parse.urlencode({
            "client_id": c.get("client_id", ""),
            "client_secret": c.get("client_secret", ""),
            "refresh_token": c.get("refresh_token", ""),
            "grant_type": "refresh_token",
        }).encode()
        d = _respuesta_http(lambda: urllib.request.urlopen(
            c.get("token_uri") or "https://oauth2.googleapis.com/token",
            datos, timeout=30
        ))
        if d.get("access_token"):
            return d["access_token"]
        ultimo_err = str(d.get("error", "?"))
    raise RuntimeError("no pude renovar el acceso a Drive de la cuenta %s (%s)" % (alias, ultimo_err))


def drive(ruta: str, params: dict[str, str]) -> dict[str, Any]:
    tok = token_google()
    url = "https://www.googleapis.com/drive/v3/%s?%s" % (ruta, urllib.parse.urlencode(params))
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})
    return _respuesta_http(lambda: urllib.request.urlopen(req, timeout=30))


def _exportar_texto_drive(fid: str) -> str:
    """Exporta el contenido de un Google Doc como texto plano."""
    tok = token_google()
    url = "https://www.googleapis.com/drive/v3/files/%s/export?mimeType=text/plain" % fid
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _extraer_fecha_titulo(nombre: str) -> str | None:
    """Extrae la fecha AAAA-MM-DD del título 'Síntesis diaria AAAA-MM-DD...'."""
    m = re.search(r"S[ií]ntesis diaria (\d{4}-\d{2}-\d{2})", nombre)
    return m.group(1) if m else None


def ultima_sintesis(fecha: str | None = None) -> tuple[str, str]:
    """Busca la síntesis diaria más reciente por fecha del título.
    
    Args:
        fecha: Si se proporciona, busca la síntesis de esa fecha exacta (AAAA-MM-DD).
               Si es None, retorna la más reciente válida.
    
    Returns:
        Tupla (file_id, nombre) del documento encontrado.
    
    Raises:
        RuntimeError: Si no hay síntesis válida para la fecha pedida o en general.
    """
    q = ("'%s' in parents and trashed=false and mimeType='application/vnd.google-apps.document'" % CARPETA_SINTESIS)
    d = drive("files", {"q": q, "pageSize": "50", "fields": "files(id,name,createdTime)"})
    
    candidatos: list[tuple[str, str, str]] = []  # (fecha_titulo, file_id, nombre)
    
    for a in d.get("files") or []:
        nombre = a.get("name", "")
        fid = a.get("id", "")
        fecha_titulo = _extraer_fecha_titulo(nombre)
        if not fecha_titulo:
            continue
        if "prueba" in nombre.lower():
            continue
        # Exportar texto y verificar longitud
        texto = _exportar_texto_drive(fid)
        if len(texto) < 4000:
            continue
        candidatos.append((fecha_titulo, fid, nombre))
    
    if not candidatos:
        raise RuntimeError("no encontré ninguna «Síntesis diaria AAAA-MM-DD» válida en la carpeta de Drive")
    
    # Ordenar por fecha del título descendente
    candidatos.sort(key=lambda x: x[0], reverse=True)
    
    if fecha is not None:
        for f_titulo, fid, nombre in candidatos:
            if f_titulo == fecha:
                return fid, nombre
        raise RuntimeError("no hay síntesis válida para la fecha %s" % fecha)
    
    # Sin fecha: retornar la más reciente por título
    _, fid, nombre = candidatos[0]
    return fid, nombre


def nombre_drive(fid: str) -> str:
    d = drive("files/" + fid, {"fields": "name"})
    if not d.get("name"):
        raise RuntimeError("no encuentro ese archivo de Drive con la cuenta alexbordongarrigos")
    return d["name"]


def nb(args: list[str], timeout: int = 600, bloquear: bool = True) -> tuple[int, str, str]:
    """Ejecuta el CLI de NotebookLM con cerrojo entre procesos.
    
    Args:
        args: Argumentos para el CLI
        timeout: Timeout en segundos
        bloquear: Si True (default), espera el cerrojo. Si False (keepalive),
                  lanza SesionTransitoria si el CLI está ocupado.
    """
    with _cerrojo_notebooklm(bloquear=bloquear) as obtenido:
        if not obtenido:
            raise SesionTransitoria("CLI ocupado (keepalive no espera)")
        entorno = dict(os.environ, HOME=CASA, NOTEBOOKLM_HL="es")
        try:
            p = subprocess.run([NBLM] + args, capture_output=True, text=True, timeout=timeout, env=entorno, cwd=CASA)
        except subprocess.TimeoutExpired:
            raise SesionTransitoria("timeout")
        except (urllib.error.URLError, OSError) as e:
            raise SesionTransitoria(f"error de red: {e}")
    
    todo = (p.stdout or "") + (p.stderr or "")
    # Solo es caducidad si returncode != 0 Y el texto indica auth expirado/error
    if p.returncode != 0 and re.search(r"Authentication (expired|error)|Run 'notebooklm login'", todo):
        raise SesionCaducada(todo[-300:])
    # returncode 0 con texto de auth NO es caducidad (puede ser mensaje informativo)
    # returncode != 0 sin texto de auth = error genérico, no caducidad
    return p.returncode, p.stdout or "", p.stderr or ""


def json_de(texto: str) -> dict[str, Any]:
    try:
        return json.loads(texto)
    except ValueError:
        m = re.search(r"\{.*\}", texto, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except ValueError:
                pass
    return {}


def sesion_viva() -> bool:
    try:
        rc, _, _ = nb(["list", "--json"], 120)
        return rc == 0
    except SesionCaducada:
        return False
    except SesionTransitoria:
        # Error transitorio (red, timeout, CLI ocupado) = sesión está viva
        return True


def asegurar_fuente(fid: str, titulo: str) -> str:
    rc, out, err = nb(["source", "list", "-n", CUADERNO, "--json"], 180)
    for s in json_de(out).get("sources") or []:
        if s.get("drive_document_id") == fid and s.get("status") == "ready":
            return s["id"]
    rc, out, err = nb(["source", "add-drive", "-n", CUADERNO, fid, titulo, "--json"], 300)
    d = json_de(out)
    sid = d.get("source_id") or d.get("id") or (d.get("source") or {}).get("id")
    if rc != 0 or not sid:
        raise RuntimeError("no pude añadir «%s» al cuaderno: %s" % (titulo, (err or out)[-300:]))
    nb(["source", "wait", "-n", CUADERNO, sid, "--timeout", "600"], 660)
    return sid


def asegurar_fuente_local(ruta_local: str, titulo: str = "") -> str | None:
    """Asegura que un archivo local (p. ej. contexto-vivo-AAAA-MM-DD.md) esté en CUADERNO cuando Drive OAuth falla."""
    if not ruta_local or not os.path.exists(ruta_local):
        return None
    nombre_base = os.path.basename(ruta_local)
    rc, out, _ = nb(["source", "list", "-n", CUADERNO, "--json"], 180)
    for s in json_de(out).get("sources") or []:
        stitle = str(s.get("title") or "")
        if s.get("status") == "ready" and (nombre_base in stitle or (titulo and titulo in stitle)):
            return s.get("id")
    rc, out, _ = nb(["source", "add", "-n", CUADERNO, ruta_local, "--json"], 300)
    d = json_de(out)
    sid = d.get("source_id") or d.get("id") or (d.get("source") or {}).get("id")
    if rc == 0 and sid:
        nb(["source", "wait", "-n", CUADERNO, sid, "--timeout", "300"], 330)
        return sid
    return None


def lanzar(tipo: str, indicaciones: str, sid: str) -> str:
    nombre, _ext, fijas, tope, idioma, espera = TIPOS[tipo]
    args = ["generate", tipo, "-n", CUADERNO, "--json"] + fijas
    if sid:
        args += ["-s", sid]
    if idioma:
        args += ["--language", "es"]
    texto = indicaciones or INDICACIONES.get(tipo, "En español, con lo esencial de la fuente.")
    if not espera:
        rc, out, err = nb(args + [texto], tope)
        if rc != 0:
            raise RuntimeError("%s: %s" % (nombre, (err or out)[-400:]))
        return "sincrono:" + json.dumps(json_de(out), ensure_ascii=False)
    rc, out, err = nb(args + ["--no-wait", "--retry", "2", texto], 300)
    tarea = json_de(out).get("task_id")
    if rc != 0 or not tarea:
        raise RuntimeError("%s no arrancó: %s" % (nombre, (err or out)[-400:]))
    return tarea


def esperar_y_bajar(tipo: str, tarea: str, peticion: str) -> str:
    nombre, ext, _f, tope, _i, _e = TIPOS[tipo]
    os.makedirs(SALIDAS, exist_ok=True)
    ruta = os.path.join(SALIDAS, "%s-%s%s" % (peticion, tipo, ext))
    if tarea.startswith("sincrono:"):
        with open(ruta, "w") as f:
            f.write(tarea[len("sincrono:"):])
        return ruta
    rc, out, err = nb(["artifact", "wait", "-n", CUADERNO, tarea, "--timeout", str(tope), "--json"], tope + 120)
    estado = json_de(out).get("status", "")
    if rc != 0 or estado not in ("completed", ""):
        raise RuntimeError("%s no terminó (%s): %s" % (nombre, estado or rc, (err or out)[-300:]))
    rc, out, err = nb(["download", tipo, "-n", CUADERNO, "-a", tarea, ruta, "--force"], 900)
    if rc != 0 or not os.path.exists(ruta):
        raise RuntimeError("no pude descargar %s: %s" % (nombre, (err or out)[-300:]))
    return ruta


def ffmpeg(args: list[str]) -> int:
    return subprocess.run(["ffmpeg", "-y", "-loglevel", "error"] + args, capture_output=True, timeout=1800).returncode


def subir(metodo: str, campo: str, ruta: str, pie: str) -> dict[str, Any]:
    import uuid
    frontera = uuid.uuid4().hex
    partes = []
    for k, v in (("chat_id", os.environ.get("TELEGRAM_SINTESIS_CHAT_ID", "")), ("caption", pie[:1000])):
        partes.append(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (frontera, k, v)).encode())
    with open(ruta, "rb") as f:
        contenido = f.read()
    cabecera = ('--%s\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\n'
                'Content-Type: application/octet-stream\r\n\r\n' % (frontera, campo, os.path.basename(ruta)))
    partes.append(cabecera.encode() + contenido + b"\r\n")
    partes.append(("--%s--\r\n" % frontera).encode())
    token = os.environ.get("TELEGRAM_SINTESIS_BOT_TOKEN", "")
    req = urllib.request.Request("https://api.telegram.org/bot%s/%s" % (token, metodo), b"".join(partes),
                                 {"Content-Type": "multipart/form-data; boundary=%s" % frontera})
    return _respuesta_http(lambda: urllib.request.urlopen(req, timeout=900))


def enviar_resultado(tipo: str, ruta: str, titulo: str) -> None:
    nombre = TIPOS[tipo][0]
    pie = "%s · %s" % (nombre.capitalize(), titulo or "cuaderno StarSeed: Producción audiovisual")
    tam = os.path.getsize(ruta)
    if tipo == "infographic":
        if tam < 10 * 1024 * 1024:
            subir("sendPhoto", "photo", ruta, pie)
        subir("sendDocument", "document", ruta, pie + " (calidad completa)")
        return
    if tipo == "audio":
        mp3 = ruta[:-4] + ".mp3"
        if ffmpeg(["-i", ruta, "-vn", "-ac", "1", "-b:a", "96k", mp3]) == 0 and os.path.exists(mp3):
            if os.path.getsize(mp3) > 49 * 1024 * 1024:
                ffmpeg(["-i", ruta, "-vn", "-ac", "1", "-b:a", "48k", mp3])
            ruta = mp3
        r = subir("sendAudio", "audio", ruta, pie)
        if not r.get("ok"):
            subir("sendDocument", "document", ruta, pie)
        return
    if tipo == "video":
        if tam > 49 * 1024 * 1024:
            chico = ruta[:-4] + "-tg.mp4"
            if ffmpeg(["-i", ruta, "-vf", "scale=-2:720", "-c:v", "libx264", "-crf", "30", "-preset", "veryfast",
                       "-c:a", "aac", "-b:a", "96k", chico]) == 0:
                ruta = chico
        if os.path.getsize(ruta) <= 49 * 1024 * 1024:
            subir("sendVideo", "video", ruta, pie)
        else:
            # decir no está disponible aquí; se maneja en capa superior
            pass
        return
    subir("sendDocument", "document", ruta, pie)


if __name__ == "__main__":
    # Smoke test
    print("CUADERNO:", CUADERNO)
    print("TIPOS:", list(TIPOS.keys()))
    print("sesion_viva:", sesion_viva())