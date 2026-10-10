# -*- coding: utf-8 -*-
"""Túnel de MetaGenesis: el motor de la Mac usable desde cualquier neurona (2026-10-10).

QUÉ HACE
  1. Levanta una PUERTA local (127.0.0.1:9012) que solo deja pasar `/api/mando/*` hacia el
     Genesis de la Mac (127.0.0.1:9002). Todo lo demás del servidor (voz, proxies de IA con
     claves compartidas, Jev…) se queda fuera: por este túnel solo pasa el motor.
  2. Levanta un túnel rápido de cloudflared hacia esa puerta y lee su URL del registro SIN
     imprimirla nunca (las líneas de cloudflared se tachan antes de guardarlas).
  3. Publica la URL en la fila única de `metagenesis_motor` (Supabase, migración
     20261010100000) con la clave de servicio de `.env.local` —leída por NOMBRE, nunca
     mostrada— y late cada 60 s, comprobando POR EL TÚNEL que el motor contesta.
  4. Si cloudflared muere o el túnel deja de contestar 5 veces seguidas (con Genesis local
     vivo), lo relanza con espera creciente; si Cloudflare limita (429 · 1015), espera 20 min.
  5. Al parar (SIGTERM de launchd, Ctrl+C) marca la fila como apagada y borra la URL.

SEGURIDAD
  · La URL del túnel solo vive en memoria y en esa tabla (que solo leen los miembros de
    MetaGenesis por RLS). Ni en registros, ni en archivos, ni en la salida.
  · Una petición que llega por el túnel NUNCA pasa como «de esta máquina»: cloudflared manda
    el Host del túnel y `cf-connecting-ip`; la puerta los reenvía tal cual y además pone
    `X-Real-IP` (la IP de quien llama) y `Forwarded: for="_metagenesis-tunel"`, que
    `esPeticionDeEstaMaquina` rechaza siempre. El guardián de `/api/mando/*` exige entonces
    token válido y membresía.
  · Nunca se pasa `--http-host-header` a cloudflared.

SERVICIO
  launchd `com.starseed.tunel-metagenesis` (scripts/puente/com.starseed.tunel-metagenesis.plist),
  python3 de Homebrew directo (tiene el permiso de disco; no hace falta lanzador-tcc).
  Registro: /tmp/starseed-tunel-metagenesis.log. SOP: architecture/metagenesis-remoto-tunel.md

  python3 scripts/puente/tunel_metagenesis.py            # servicio (primer plano)
  python3 scripts/puente/tunel_metagenesis.py --estado   # qué cree la Mac que pasa (sin URL)
"""
import collections
import datetime as dt
import http.client
import http.server
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUERTO_MOTOR = int(os.environ.get("METAGENESIS_PUERTO_MOTOR", "9002"))
PUERTO_PUERTA = int(os.environ.get("METAGENESIS_PUERTO_PUERTA", "9012"))
LATIDO_S = 60
FALLOS_MAX = 5
ESPERA_URL_S = 60
ESPERA_LIMITE_S = 20 * 60
ESPERA_MAX_S = 10 * 60
TABLA = "metagenesis_motor"
PID = os.path.expanduser("~/.starseed/tunel-metagenesis.pid")
#: Cabecera que la puerta añade SIEMPRE: con ella `esPeticionDeEstaMaquina` dice que no.
FORWARDED = 'for="_metagenesis-tunel"'
AGENTE = "starseed-tunel-metagenesis/1"

_RE_URL = re.compile(r"https://([a-z0-9-]+)\.trycloudflare\.com")
_NO_SON_TUNEL = {"api", "www"}
_RE_LIMITE = re.compile(r"429 Too Many Requests|error code: 1015|rate.?limit", re.I)
#: Cabeceras de salto (no se reenvían de un lado a otro).
_SALTO = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
          "trailers", "transfer-encoding", "upgrade", "content-length"}


# ─── piezas puras ───────────────────────────────────────────────────────────────────────


def url_de_linea(linea):
    """PURA. La URL del túnel rápido que aparece en una línea de cloudflared, o None."""
    for m in _RE_URL.finditer(linea or ""):
        if m.group(1) not in _NO_SON_TUNEL:
            return m.group(0)
    return None


def tachar(texto):
    """PURA. El texto con cualquier URL de túnel sustituida por «[túnel]»."""
    return _RE_URL.sub("[túnel]", texto or "")


def url_valida(url):
    """PURA. https://<un-nivel>.trycloudflare.com sin ruta."""
    return bool(url) and _RE_URL.fullmatch(url) is not None and url_de_linea(url) == url


def es_limite(texto):
    """PURA. ¿Cloudflare está limitando los túneles rápidos?"""
    return bool(_RE_LIMITE.search(texto or ""))


def ruta_permitida(objetivo):
    """PURA. ¿Esta petición puede pasar la puerta? Solo `/api/mando` y `/api/mando/…`, sin
    segmentos `.`/`..` (ni codificados) ni barras invertidas."""
    if not objetivo or not objetivo.startswith("/"):
        return False
    ruta = objetivo.split("?", 1)[0].split("#", 1)[0]
    if "\\" in ruta or "%5c" in ruta.lower():
        return False
    for seg in ruta.split("/"):
        if urllib.parse.unquote(seg) in (".", ".."):
            return False
    return re.match(r"^/api/mando(/|$)", ruta) is not None


def decidir_vigilancia(cf_vivo, tunel_ok, local_ok, fallos, fallos_max=FALLOS_MAX):
    """PURA. (acción, fallos): «latir» si el túnel contesta; «relanzar» si cloudflared murió o
    el túnel falló `fallos_max` veces seguidas con Genesis local vivo; si no, «seguir». Si el
    que no contesta es Genesis local, el túnel no tiene la culpa: no se cuenta."""
    if not cf_vivo:
        return "relanzar", 0
    if tunel_ok:
        return "latir", 0
    if not local_ok:
        return "seguir", fallos
    fallos += 1
    if fallos >= fallos_max:
        return "relanzar", 0
    return "seguir", fallos


def espera_relanzar(intentos):
    """PURA. Espera creciente entre relanzamientos: 30 s, 60, 120… hasta 10 min."""
    return min(ESPERA_MAX_S, 30 * (2 ** max(0, intentos)))


def ahora_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def maquina():
    return (socket.gethostname().split(".")[0] or "Mac")[:64]


def fila_encendida(url, cuando, nombre):
    return {"url": url, "encendido": True, "ultimo_latido": cuando, "arrancado_en": cuando,
            "maquina": nombre, "motivo": None}


def fila_latido(cuando):
    return {"encendido": True, "ultimo_latido": cuando, "motivo": None}


def fila_motivo(motivo):
    return {"motivo": motivo[:200]}


def fila_apagada(motivo):
    return {"url": None, "encendido": False, "motivo": motivo[:200]}


# ─── entorno y Supabase ─────────────────────────────────────────────────────────────────


def leer_env(nombres, rutas=None):
    """Solo los NOMBRES pedidos, de .env.local (y ~/.starseed/env) o del entorno. Nunca se
    imprimen sus valores."""
    rutas = rutas if rutas is not None else [os.path.join(RAIZ, ".env.local"), os.path.expanduser("~/.starseed/env")]
    encontrados = {}
    for ruta in rutas:
        try:
            with open(ruta, encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if linea.startswith("export "):
                        linea = linea[7:]
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    k, v = linea.split("=", 1)
                    k = k.strip()
                    if k in nombres and k not in encontrados:
                        encontrados[k] = v.strip().strip('"').strip("'")
        except OSError:
            continue
    for k in nombres:
        if k not in encontrados and os.environ.get(k):
            encontrados[k] = os.environ[k]
    return encontrados


def credenciales(rutas=None):
    """(url_base, clave) de Supabase o None si falta alguna."""
    e = leer_env(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], rutas)
    base, clave = (e.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/"), e.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    return (base, clave) if base.startswith("https://") and clave else None


def escribir_fila(cred, datos, abrir=None):
    """Upsert de la fila única (id=1) con la clave de servicio y `return=minimal`. True si fue bien."""
    base, clave = cred
    cuerpo = dict(datos, id=1, actualizado_en=ahora_iso())
    req = urllib.request.Request(
        "%s/rest/v1/%s?on_conflict=id" % (base, TABLA), json.dumps(cuerpo).encode("utf-8"),
        {"apikey": clave, "Authorization": "Bearer " + clave, "Content-Type": "application/json",
         "Prefer": "resolution=merge-duplicates,return=minimal", "User-Agent": AGENTE},
        method="POST")
    try:
        with (abrir or urllib.request.urlopen)(req, timeout=15) as r:
            return 200 <= r.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        return False


def estado_http(url, timeout=15.0):
    """Código HTTP de un GET (sin cabeceras de sesión) o None si no llega."""
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, OSError, ValueError):
        return None


def contesta_motor(base):
    """¿El motor contesta en esa base? 200/401/403 = sí (sin token, el guardián dice 401)."""
    return estado_http(base.rstrip("/") + "/api/mando/latido") in (200, 401, 403)


# ─── la puerta: solo /api/mando/* ───────────────────────────────────────────────────────


class Puerta(http.server.BaseHTTPRequestHandler):
    """Reenvía `/api/mando/*` a Genesis local con las cabeceras de cloudflared intactas."""

    protocol_version = "HTTP/1.1"
    destino = ("127.0.0.1", PUERTO_MOTOR)
    tope_s = 120

    def log_message(self, *_a):  # nada de rutas ni IPs en el registro
        pass

    def _responder(self, codigo, texto):
        cuerpo = json.dumps({"error": texto}, ensure_ascii=False).encode("utf-8")
        self.send_response_only(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(cuerpo)

    def _cuerpo(self):
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            partes = []
            while True:
                tam = int(self.rfile.readline().split(b";", 1)[0].strip() or b"0", 16)
                if tam == 0:
                    while self.rfile.readline() not in (b"\r\n", b"\n", b""):
                        pass
                    break
                partes.append(self.rfile.read(tam))
                self.rfile.readline()
            return b"".join(partes)
        largo = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(largo) if largo > 0 else b""

    def _reenviar(self):
        if not ruta_permitida(self.path):
            self._cuerpo()
            return self._responder(404, "Por este túnel solo pasa el motor de MetaGenesis (/api/mando).")
        cuerpo = self._cuerpo()
        try:
            conn = http.client.HTTPConnection(*self.destino, timeout=self.tope_s)
            conn.putrequest(self.command, self.path, skip_host=True, skip_accept_encoding=True)
            hay_forwarded = False
            for k, v in self.headers.items():
                if k.lower() in _SALTO or k.lower() == "x-real-ip":
                    continue
                if k.lower() == "forwarded":
                    v = "%s, %s" % (FORWARDED, v)
                    hay_forwarded = True
                conn.putheader(k, v)
            if not hay_forwarded:
                conn.putheader("Forwarded", FORWARDED)
            # La IP real de quien llama (la que da Cloudflare). Su sola presencia hace que
            # `esPeticionDeEstaMaquina` diga que no, aunque faltaran las demás cabeceras.
            conn.putheader("X-Real-IP", (self.headers.get("cf-connecting-ip") or "tunel").strip()[:64])
            if cuerpo or self.command in ("POST", "PUT", "PATCH", "DELETE"):
                conn.putheader("Content-Length", str(len(cuerpo)))
            conn.endheaders(cuerpo or None)
            r = conn.getresponse()
        except (OSError, http.client.HTTPException):
            return self._responder(502, "Genesis local no responde en la Mac.")
        try:
            self.send_response_only(r.status, r.reason)
            for k, v in r.getheaders():
                if k.lower() not in _SALTO:
                    self.send_header(k, v)
            largo = r.getheader("Content-Length")
            sin_cuerpo = self.command == "HEAD" or r.status in (204, 304) or 100 <= r.status < 200
            if sin_cuerpo or largo is not None:
                if largo is not None:
                    self.send_header("Content-Length", largo)
                self.end_headers()
                if not sin_cuerpo:
                    while True:
                        bloque = r.read(65536)
                        if not bloque:
                            break
                        self.wfile.write(bloque)
                else:
                    r.read()
            else:
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                while True:
                    bloque = r.read1(65536) if hasattr(r, "read1") else r.read(65536)
                    if not bloque:
                        break
                    self.wfile.write(b"%x\r\n%s\r\n" % (len(bloque), bloque))
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
        finally:
            conn.close()

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_HEAD = _reenviar


def arrancar_puerta(puerto=PUERTO_PUERTA, destino=None):
    """Sirve la puerta en 127.0.0.1:<puerto> en un hilo. Devuelve el servidor (o lanza OSError)."""
    clase = type("PuertaMotor", (Puerta,), {"destino": destino or ("127.0.0.1", PUERTO_MOTOR)})
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", puerto), clase)
    servidor.daemon_threads = True
    threading.Thread(target=servidor.serve_forever, name="puerta-metagenesis", daemon=True).start()
    return servidor


# ─── cloudflared ────────────────────────────────────────────────────────────────────────


def orden_cloudflared(binario, puerto):
    """La orden del túnel. `--no-autoupdate` va ANTES de `--url` para que el `pkill` del túnel
    viejo de Genesis (tunel-mando.sh) no la confunda con la suya. Nunca `--http-host-header`."""
    return [binario, "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:%d" % puerto]


class Tunel:
    """Un cloudflared hijo. La URL se lee de su salida y solo se guarda en memoria."""

    def __init__(self, binario, puerto, popen=subprocess.Popen):
        self.orden = orden_cloudflared(binario, puerto)
        self.popen = popen
        self.proc = None
        self.url = None
        self.ultimas = collections.deque(maxlen=20)  # líneas YA tachadas, para dar motivos

    def arrancar(self):
        self.proc = self.popen(self.orden, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               stdin=subprocess.DEVNULL, text=True, bufsize=1)
        threading.Thread(target=self._leer, name="cloudflared-salida", daemon=True).start()
        try:
            os.makedirs(os.path.dirname(PID), exist_ok=True)
            with open(PID, "w") as f:
                f.write(str(self.proc.pid))
        except OSError:
            pass

    def _leer(self):
        for linea in self.proc.stdout:
            if self.url is None:
                u = url_de_linea(linea)
                if u:
                    self.url = u
            self.ultimas.append(tachar(linea.strip())[:200])

    def vivo(self):
        return self.proc is not None and self.proc.poll() is None

    def esperar_url(self, tope_s, parar):
        fin = time.monotonic() + tope_s
        while time.monotonic() < fin and not parar.is_set():
            if self.url or not self.vivo():
                break
            parar.wait(0.5)
        return self.url

    def parar(self):
        if self.proc is None or self.proc.poll() is not None:
            return
        self.proc.terminate()
        try:
            self.proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def matar_huerfano(ruta=PID):
    """Si quedó un cloudflared nuestro de una vuelta anterior (lo dice el .pid), se para."""
    try:
        pid = int(open(ruta).read().strip())
        orden = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True).stdout
        if "cloudflared" in orden and ("127.0.0.1:%d" % PUERTO_PUERTA) in orden:
            os.kill(pid, signal.SIGTERM)
    except (OSError, ValueError):
        pass


# ─── el bucle (con todo lo de fuera inyectado, para poder probarlo) ─────────────────────


def ejecutar(d):
    """Bucle del servicio. `d` trae: crear_tunel(), contesta(url), contesta_local(), escribir(datos),
    parar (threading.Event), log(texto), ahora(), maquina. Nunca pasa la URL a `log`."""
    intentos = 0
    tunel = None
    try:
        while not d["parar"].is_set():
            tunel = d["crear_tunel"]()
            tunel.arrancar()
            url = tunel.esperar_url(ESPERA_URL_S, d["parar"])
            if d["parar"].is_set():
                break
            if not url or not url_valida(url):
                limite = es_limite(" ".join(tunel.ultimas))
                tunel.parar()
                motivo = ("Cloudflare limitó los túneles rápidos; reintento en 20 min" if limite
                          else "cloudflared no dio túnel; reintento")
                d["escribir"](fila_apagada(motivo))
                d["log"](motivo + (": " + tunel.ultimas[-1] if tunel.ultimas else ""))
                d["parar"].wait(ESPERA_LIMITE_S if limite else espera_relanzar(intentos))
                intentos += 1
                continue

            # Se publica cuando contesta POR EL TÚNEL (no un enlace que aún no abre).
            publicado = False
            for _ in range(10):
                if d["parar"].is_set() or not tunel.vivo():
                    break
                if d["contesta"](url):
                    publicado = d["escribir"](fila_encendida(url, d["ahora"](), d["maquina"]))
                    d["log"]("túnel publicado en la tabla (la URL no se muestra)" if publicado
                             else "el túnel contesta pero no pude escribir en la tabla")
                    break
                d["parar"].wait(6)
            if publicado:
                intentos = 0

            fallos, motivo_puesto = 0, None
            while not d["parar"].is_set():
                d["parar"].wait(LATIDO_S)
                if d["parar"].is_set():
                    break
                cf_vivo = tunel.vivo()
                tunel_ok = cf_vivo and d["contesta"](url)
                local_ok = tunel_ok or d["contesta_local"]()
                accion, fallos = decidir_vigilancia(cf_vivo, tunel_ok, local_ok, fallos)
                if accion == "latir":
                    datos = fila_latido(d["ahora"]()) if publicado else fila_encendida(url, d["ahora"](), d["maquina"])
                    if d["escribir"](datos):
                        publicado, motivo_puesto = True, None
                elif accion == "relanzar":
                    d["log"]("cloudflared terminó o el túnel dejó de contestar: lo relanzo")
                    break
                elif not local_ok and motivo_puesto != "local":
                    d["escribir"](fila_motivo("Genesis no responde en la Mac (el túnel sigue levantado)"))
                    d["log"]("Genesis local no responde; el túnel sigue")
                    motivo_puesto = "local"
            tunel.parar()
            if not d["parar"].is_set():
                d["escribir"](fila_apagada("el túnel se cayó; relanzando"))
                d["parar"].wait(espera_relanzar(intentos))
                intentos += 1
    finally:
        if tunel is not None:
            tunel.parar()
        d["escribir"](fila_apagada("la Mac paró el túnel de MetaGenesis"))
        d["log"]("túnel parado y fila marcada como apagada")


def _log(texto):
    # Doble seguro: aunque alguien pasara una URL, sale tachada.
    print("[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), tachar(str(texto))), flush=True)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cred = credenciales()
    if "--estado" in argv:
        print("credenciales de Supabase:", "presentes" if cred else "FALTAN (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
        print("cloudflared:", shutil.which("cloudflared") or ("/opt/homebrew/bin/cloudflared" if os.path.exists("/opt/homebrew/bin/cloudflared") else "NO INSTALADO"))
        print("Genesis local (:%d):" % PUERTO_MOTOR, "contesta" if contesta_motor("http://127.0.0.1:%d" % PUERTO_MOTOR) else "no contesta")
        print("puerta (:%d):" % PUERTO_PUERTA, "contesta" if contesta_motor("http://127.0.0.1:%d" % PUERTO_PUERTA) else "no contesta")
        return 0
    if not cred:
        _log("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local (sus valores nunca se imprimen). Espero 10 min.")
        time.sleep(600)
        return 1
    binario = shutil.which("cloudflared") or "/opt/homebrew/bin/cloudflared"
    if not os.path.exists(binario):
        escribir_fila(cred, fila_apagada("cloudflared no está instalado en la Mac"))
        _log("cloudflared no está instalado (brew install cloudflared). Espero 10 min.")
        time.sleep(600)
        return 1
    matar_huerfano()
    try:
        puerta = arrancar_puerta()
    except OSError as e:
        _log("no puedo abrir la puerta en 127.0.0.1:%d (%s). Espero 1 min." % (PUERTO_PUERTA, e.strerror or e))
        time.sleep(60)
        return 1

    parar = threading.Event()
    for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(s, lambda *_a: parar.set())
    _log("puerta lista en 127.0.0.1:%d (solo /api/mando) → Genesis en :%d" % (PUERTO_PUERTA, PUERTO_MOTOR))
    try:
        ejecutar({
            "crear_tunel": lambda: Tunel(binario, PUERTO_PUERTA),
            "contesta": contesta_motor,
            "contesta_local": lambda: contesta_motor("http://127.0.0.1:%d" % PUERTO_MOTOR),
            "escribir": lambda datos: escribir_fila(cred, datos),
            "parar": parar,
            "log": _log,
            "ahora": ahora_iso,
            "maquina": maquina(),
        })
    finally:
        puerta.shutdown()
        puerta.server_close()
        try:
            os.remove(PID)
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
