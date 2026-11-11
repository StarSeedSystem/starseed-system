#!/usr/bin/env python3
"""Helpers puros de cuentas_google: archivos de entorno (patrón guardar-clave.sh) y piezas OAuth.
`pedir_http` y `esperar_codigo` son costuras inyectables; los valores de claves jamás se imprimen."""
import base64, hashlib, http.server, json, os, re
import urllib.parse, urllib.request

SCOPES = ("https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/drive.readonly",
          "https://www.googleapis.com/auth/youtube.readonly")
ALIAS = ("alex", "fundacion")
RUTAS_ENV = (os.path.expanduser("~/.starseed/env"), os.path.expanduser("~/.hermes/.env"))
DIR_CUENTAS = os.path.expanduser("~/.starseed/cuentas")
DESCARGAS = os.path.expanduser("~/Downloads")
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"

NOMBRES_CLIENTE = ("GOOGLE_ACTIVIDAD_CLIENT_ID", "GOOGLE_ACTIVIDAD_CLIENT_SECRET")


def leer_env(rutas=RUTAS_ENV):  # lee NOMBRE="valor" (patrón de guardar-clave.sh); el último archivo gana
    vivos = {}
    for ruta in rutas:
        try:
            lineas = open(ruta, encoding="utf-8", errors="replace").read().split("\n")
        except FileNotFoundError:
            continue
        vivos.update({m.group(1): m.group(2).replace('\\"', '"').replace("\\\\", "\\")
                      for m in (re.match(r'\s*(?:export\s+)?([A-Z0-9_]+)="(.*)"\s*$', l) for l in lineas) if m})
    return vivos


def poner_en_env(nombre, valor, rutas=RUTAS_ENV):
    """Escribe NOMBRE="valor" entrecomillado, reemplazando sin duplicar; falla si no recarga igual."""
    escapado = valor.replace("\\", "\\\\").replace('"', '\\"')
    for ruta in rutas:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        lineas = open(ruta, encoding="utf-8", errors="replace").read().split("\n") if os.path.exists(ruta) else []
        nueva = '%s="%s"' % (nombre, escapado)
        puesto = False
        for i, linea in enumerate(lineas):
            if re.match(r'\s*(?:export\s+)?%s=' % re.escape(nombre), linea):
                lineas[i], puesto = nueva, True
                break
        if not puesto:
            lineas.append(nueva)
        open(ruta + ".tmp", "w", encoding="utf-8").write("\n".join(lineas))
        os.chmod(ruta + ".tmp", 0o600); os.replace(ruta + ".tmp", ruta)
        if leer_env([ruta]).get(nombre) != valor:
            raise RuntimeError("El archivo %s quedó mal escrito tras tocarlo" % ruta)


def cliente_id_secret(rutas=RUTAS_ENV):  # el entorno del proceso gana; si no, los archivos de entorno
    vivos = leer_env(rutas)
    vivos.update({k: os.environ[k] for k in NOMBRES_CLIENTE if k in os.environ})
    return vivos.get("GOOGLE_ACTIVIDAD_CLIENT_ID"), vivos.get("GOOGLE_ACTIVIDAD_CLIENT_SECRET")


def huella(texto):  # huella de 8 caracteres para distinguir una clave sin enseñarla
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()[:8]


def localizar_cliente(ruta=None, descargas=DESCARGAS):  # la ruta dada o el client_secret_*.json más reciente
    if ruta:
        return ruta
    try:
        nombres = os.listdir(descargas)
    except FileNotFoundError:
        nombres = []
    candidatos = [os.path.join(descargas, f) for f in nombres if f.startswith("client_secret_") and f.endswith(".json")]
    return max(candidatos, key=os.path.getmtime) if candidatos else None


def url_autorizacion(cliente_id, redireccion, verificador):
    """URL de consentimiento con PKCE S256: solo lectura, offline y prompt=consent (viene el refresco)."""
    reto = base64.urlsafe_b64encode(hashlib.sha256(verificador.encode("ascii")).digest()).decode("ascii").rstrip("=")
    consulta = urllib.parse.urlencode({
        "response_type": "code", "client_id": cliente_id, "redirect_uri": redireccion,
        "scope": " ".join(SCOPES), "code_challenge": reto, "code_challenge_method": "S256",
        "access_type": "offline", "prompt": "consent"})
    return AUTH_URL + "?" + consulta


def pedir_http(url, datos):  # intercambio OAuth por POST form-encoded (costura inyectable en las pruebas)
    peticion = urllib.request.Request(url, data=urllib.parse.urlencode(datos).encode("utf-8"))
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        return json.loads(respuesta.read().decode("utf-8"))


def esperar_codigo(puerto):  # sirve UNA petición en 127.0.0.1:puerto y devuelve el ?code= que Google trae
    caja = {}
    class Recepcion(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            consulta = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            caja["code"], caja["error"] = (consulta.get("code") or [None])[0], (consulta.get("error") or [None])[0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Sesion de Google guardada. Ya puedes cerrar esta ventana.")

        def log_message(self, format=None, *args):  # noqa: A002 (firma del stdlib)
            pass

    servidor = http.server.HTTPServer(("127.0.0.1", puerto), Recepcion)
    servidor.timeout = 300
    servidor.handle_request(); servidor.server_close()
    return caja.get("code"), caja.get("error")


def escribir_json(destino, ficha):  # escritura atómica con permisos 0600 (tokens y fichas de cuenta)
    con_tmp = destino + ".tmp"
    open(con_tmp, "w", encoding="utf-8").write(json.dumps(ficha, ensure_ascii=False))
    os.chmod(con_tmp, 0o600); os.replace(con_tmp, destino)


def correo_de(respuesta):  # el correo va en el id_token (JWT de tres trozos); nunca se imprime el token
    trozos = (respuesta.get("id_token") or "").split(".")
    if len(trozos) < 2:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(trozos[1] + "=" * (-len(trozos[1]) % 4))).get("email")
    except (ValueError, json.JSONDecodeError):
        return None
