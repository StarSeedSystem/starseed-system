"""cuentas_google: alta por OAuth de SOLO LECTURA de las cuentas de Google (SDP1111E).

Cliente de escritorio (§5 de architecture/sintesis-diaria-autonoma.md): redirección a 127.0.0.1
con puerto libre, PKCE y scopes de solo lectura; guarda el token de refresco en
~/.starseed/cuentas/<alias>.json con 0600 y nunca imprime tokens. Claves por NOMBRE de variable:
GOOGLE_ACTIVIDAD_CLIENT_ID / GOOGLE_ACTIVIDAD_CLIENT_SECRET. Solo biblioteca estándar."""
import base64, json, os, secrets, socket, sys, threading, urllib.parse, urllib.request, webbrowser
from hashlib import sha256; from http.server import BaseHTTPRequestHandler, HTTPServer

ALIAS = {"alex": "alexbordongarrigos@gmail.com", "fundacion": "fundacionstarseed@gmail.com"}
PREFIJO = "https://www.googleapis.com/auth/"
SCOPES = ["gmail.readonly", "drive.readonly", "youtube.readonly"]
AUTORIDAD = "https://accounts.google.com/o/oauth2/v2/auth"
PUNTO_TOKEN = "https://oauth2.googleapis.com/token"
RAIZ = os.path.join(os.path.expanduser("~"), ".starseed", "cuentas")
ABRIR = webbrowser.open
INTERCAMBIO = None  # costura de pruebas: (datos) -> respuesta del punto de token

def cliente():
    ident = os.environ.get("GOOGLE_ACTIVIDAD_CLIENT_ID")
    secreto = os.environ.get("GOOGLE_ACTIVIDAD_CLIENT_SECRET")
    if not ident or not secreto:
        raise SystemExit("Faltan GOOGLE_ACTIVIDAD_CLIENT_ID o GOOGLE_ACTIVIDAD_CLIENT_SECRET")
    return ident, secreto

def url_autorizacion(verificador, puerto, marca):
    reto = base64.urlsafe_b64encode(sha256(verificador.encode()).digest()).decode().rstrip("=")
    datos = {
        "client_id": cliente()[0], "redirect_uri": f"http://127.0.0.1:{puerto}",
        "response_type": "code", "scope": " ".join(PREFIJO + s for s in SCOPES),
        "access_type": "offline", "prompt": "consent",
        "code_challenge": reto, "code_challenge_method": "S256", "state": marca,
    }
    return AUTORIDAD + "?" + urllib.parse.urlencode(datos)

def _codigo_local(url, puerto, marca, abrir):
    caja = []

    class Receptor(BaseHTTPRequestHandler):
        def do_GET(self):
            pregunta = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            caja.append(pregunta.get("code", [None])[0] if pregunta.get("state", [""])[0] == marca else None)
            self.send_response(200); self.end_headers()
            self.wfile.write(b"Conectado. Vuelve a la terminal.")

        def log_message(self, format, *args):
            pass

    servidor = HTTPServer(("127.0.0.1", puerto), Receptor)
    hilo = threading.Thread(target=abrir, args=(url,), daemon=True)
    hilo.start()
    servidor.handle_request(); hilo.join(60); servidor.server_close()
    return caja[0] if caja else None

def intercambiar(datos):
    if INTERCAMBIO is not None:
        return INTERCAMBIO(datos)
    cuerpo = urllib.parse.urlencode(datos).encode()
    peticion = urllib.request.Request(PUNTO_TOKEN, cuerpo, {"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        return json.load(respuesta)

def guardar(alias, ficha):
    os.makedirs(RAIZ, exist_ok=True)
    fd = os.open(os.path.join(RAIZ, alias + ".json"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as archivo:
        json.dump(ficha, archivo)

def leer(alias):
    try:
        with open(os.path.join(RAIZ, alias + ".json"), encoding="utf-8") as archivo:
            return json.load(archivo)
    except (OSError, ValueError):
        return None

def alta(alias):
    if alias not in ALIAS:
        raise SystemExit(f"alias desconocido: {alias} (usa alex|fundacion)")
    ident, secreto = cliente()
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); puerto = s.getsockname()[1]
    verificador, marca = secrets.token_urlsafe(48), secrets.token_urlsafe(16)
    print(f"Abriendo el navegador para autorizar {ALIAS[alias]} (solo lectura)…")
    url = url_autorizacion(verificador, puerto, marca)
    codigo = _codigo_local(url, puerto, marca, ABRIR)
    if not codigo:
        raise SystemExit("No llegó la autorización: repite el alta")
    datos = {"client_id": ident, "client_secret": secreto, "code": codigo, "code_verifier": verificador,
             "redirect_uri": f"http://127.0.0.1:{puerto}", "grant_type": "authorization_code"}
    respuesta = intercambiar(datos)
    if not respuesta.get("refresh_token"):
        raise SystemExit("Google no devolvió token de refresco; repite con «consent»")
    guardar(alias, {"alias": alias, "correo": ALIAS[alias], "refresh_token": respuesta["refresh_token"]})
    print(f"Alta lista para «{alias}»: {os.path.join(RAIZ, alias + '.json')} (permisos 0600)")

def token(alias):
    ficha = leer(alias)
    if not ficha or not ficha.get("refresh_token"):
        raise SystemExit(f"Sin alta para «{alias}»: haz «python3 scripts/puente/cuentas_google.py alta {alias}»")
    ident, secreto = cliente()
    datos = {"client_id": ident, "client_secret": secreto,
             "refresh_token": ficha["refresh_token"], "grant_type": "refresh_token"}
    respuesta = intercambiar(datos)
    if not respuesta.get("access_token"):
        raise SystemExit("La renovación fue rechazada: vuelve a hacer el alta")
    return respuesta["access_token"]

def estado():
    for alias, correo in ALIAS.items():
        vivo = "token vivo" if (leer(alias) or {}).get("refresh_token") else "sin alta"
        print(f"{alias:10} {correo:34} {vivo}")

if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else "estado"
    if orden == "alta" and len(sys.argv) > 2:
        alta(sys.argv[2])
    elif len(sys.argv) == 1:
        estado()
    else:
        raise SystemExit("uso: cuentas_google.py alta <alex|fundacion> | estado")
