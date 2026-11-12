#!/usr/bin/env python3
"""Cuentas de Google de Alex para la actividad diaria (SDP1111E · relevo SDP1111P · §4 y §5).

OAuth de app de escritorio con PKCE y redirección local en 127.0.0.1, scopes SOLO de lectura
(gmail.readonly, drive.readonly, youtube.readonly). Las claves del cliente viven solo como
GOOGLE_ACTIVIDAD_CLIENT_ID y GOOGLE_ACTIVIDAD_CLIENT_SECRET en ~/.starseed/env y ~/.hermes/.env
(patrones de guardar-clave.sh); jamás se imprimen valores, solo huellas de 8 caracteres.

Reutilización (2026-11-11, el alta ya está hecha fuera del OS):
- antes de pedir un cliente nuevo, `alta` prueba el cliente OAuth que el OS ya tiene
  (NEXT_PUBLIC_GOOGLE_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET de .env.local del repo, leídos
  sin imprimir) con redirección fija http://127.0.0.1:8765/; si Google responde
  redirect_uri_mismatch o falta una API, lo dice en una línea con el arreglo exacto y solo
  entonces cae a GOOGLE_ACTIVIDAD_* o al client_secret_*.json de Descargas;
- acepta tal cual las fichas authorized_user de ~/.starseed/cuentas/<alias>.json que dejó la
  herramienta local alta-cuentas-google.py (alex, fundacion y el tercer alias alex-docs, solo
  drive.file para los Docs): `token(alias)` renueva con su propio refresh_token en su
  token_uri y `estado` las muestra vivas; si la ficha authorized_user ya existe, no se pide
  un alta nueva.
Uso: python3 scripts/puente/cuentas_google.py importar [ruta] | alta alex|fundacion | estado
"""
import json, os, re, secrets, socket, sys, time, webbrowser

from cuentas_google_env import (ALIAS, DESCARGAS, DIR_CUENTAS, RUTAS_ENV, TOKEN_URL, cliente_id_secret,
                                correo_de, escribir_json, huella, localizar_cliente, poner_en_env,
                                url_autorizacion)

RUTA_ENV_LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, os.pardir, ".env.local")
REDIRECCION_OS = "http://127.0.0.1:8765/"
CLIENTE_OS = ("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET")
ENLACE_CREDENCIALES = "https://console.cloud.google.com/apis/credentials"
ENLACE_BIBLIOTECA = "https://console.cloud.google.com/apis/library"


def cliente_os(ruta=RUTA_ENV_LOCAL):
    """Lee el cliente OAuth del OS en .env.local del repo, SIN imprimir ningún valor."""
    datos = {}
    try:
        for linea in open(ruta, encoding="utf-8", errors="replace").read().split("\n"):
            if "=" not in linea:
                continue
            clave, valor = linea.split("=", 1)
            clave = clave.strip()
            if clave.startswith("export "):
                clave = clave[7:].strip()
            if clave in CLIENTE_OS:
                datos[clave] = valor.strip().strip('"').strip("'")
    except OSError:
        pass
    return datos.get(CLIENTE_OS[0]), datos.get(CLIENTE_OS[1])


def motivo_error_google(error):
    """Una línea con el arreglo exacto para redirect_uri_mismatch o una API sin activar."""
    texto = str(error)
    if "redirect_uri_mismatch" in texto:
        return ("Google rechazó la URI de redirección del cliente del OS: añade «%s» como URI de "
                "redirección autorizada en %s (proyecto starseed-system)" % (REDIRECCION_OS, ENLACE_CREDENCIALES))
    if "API" in texto and ("enabled" in texto or "activ" in texto.lower()):
        return ("Activa Gmail API y YouTube Data API v3 en %s (proyecto starseed-system) y repite"
                % ENLACE_BIBLIOTECA)
    return None


def importar(ruta=None, descargas=DESCARGAS, rutas=RUTAS_ENV, dir_cuentas=DIR_CUENTAS):
    """Toma el client_secret_*.json (o el más reciente de Descargas), guarda las dos claves sin
    enseñarlas (solo huellas) y aparta el JSON a ~/.starseed/cuentas/cliente-oauth.json con 0600."""
    origen = localizar_cliente(ruta, descargas)
    if not origen or not os.path.exists(origen):
        return {"ok": False, "motivo": "sin client_secret_*.json"}
    bloque = json.load(open(origen, encoding="utf-8"))
    bloque = bloque.get("installed") or bloque.get("web") or bloque
    cid, secreto = bloque.get("client_id"), bloque.get("client_secret")
    if not cid or not secreto:
        return {"ok": False, "motivo": "el JSON no es un client_secret de app de escritorio"}
    for nombre, valor in (("GOOGLE_ACTIVIDAD_CLIENT_ID", cid), ("GOOGLE_ACTIVIDAD_CLIENT_SECRET", secreto)):
        poner_en_env(nombre, valor, rutas)
    print("Claves guardadas en %d archivos de entorno. Huellas: %s, %s" % (len(rutas), huella(cid), huella(secreto)))
    os.makedirs(dir_cuentas, exist_ok=True)
    destino = os.path.join(dir_cuentas, "cliente-oauth.json")
    os.replace(origen, destino)
    os.chmod(destino, 0o600)
    return {"ok": True, "destino": destino}


def alta(alias, pedir, esperar, abrir=webbrowser.open,
         dir_cuentas=DIR_CUENTAS, descargas=DESCARGAS, rutas=RUTAS_ENV, env_local=None):
    """Abre el navegador, recoge el código con PKCE en un puerto libre y guarda el token de refresco
    (0600). Si la ficha authorized_user del alias ya existe, no se pide un alta nueva. Con
    `env_local` (el CLI lo pasa), primero prueba el cliente OAuth del OS con redirección fija
    127.0.0.1:8765/; si Google lo rechaza, lo dice con el arreglo exacto antes de caer a lo demás."""
    if alias not in ALIAS:
        return {"ok": False, "motivo": "alias desconocido: alex|fundacion"}
    ficha_ya = os.path.join(dir_cuentas, alias + ".json")
    if os.path.exists(ficha_ya):
        previa = json.load(open(ficha_ya, encoding="utf-8"))
        if previa.get("refresh_token") and previa.get("client_id") and previa.get("client_secret"):
            return {"ok": True, "alias": alias, "correo": previa.get("correo"),
                    "motivo": "alta ya existente (authorized_user); no se pide otra"}
    cid, secreto, redireccion = cliente_id_secret(rutas)[0], cliente_id_secret(rutas)[1], None
    if (not cid or not secreto) and env_local:
        cid, secreto = cliente_os(env_local)
        redireccion = REDIRECCION_OS
    if not cid or not secreto:
        importar(None, descargas, rutas, dir_cuentas)
        cid, secreto = cliente_id_secret(rutas)
    if not cid or not secreto:
        return {"ok": False, "motivo": "sin cliente OAuth: corre 'importar' o crea el cliente en console.cloud.google.com"}
    verificador = secrets.token_urlsafe(64)
    pinchado = socket.socket(); pinchado.bind(("127.0.0.1", 0))
    puerto = pinchado.getsockname()[1]; pinchado.close()
    redireccion = redireccion or "http://127.0.0.1:%d/" % puerto
    abrir(url_autorizacion(cid, redireccion, verificador))
    codigo, error = esperar(puerto)
    if error or not codigo:
        return {"ok": False, "motivo": error or "sin código de autorización"}
    try:
        respuesta = pedir(TOKEN_URL, {"code": codigo, "client_id": cid, "client_secret": secreto,
                                      "redirect_uri": redireccion, "grant_type": "authorization_code",
                                      "code_verifier": verificador})
    except Exception as fallo:  # la excepción puede traer el error de Google
        arreglo = motivo_error_google(fallo)
        return {"ok": False, "motivo": arreglo or str(fallo)}
    if respuesta.get("error"):
        arreglo = motivo_error_google(respuesta["error"])
        return {"ok": False, "motivo": arreglo or str(respuesta["error"])}
    if not respuesta.get("refresh_token"):
        return {"ok": False, "motivo": "Google no devolvió token de refresco: revoca el acceso y repite"}
    ficha = {"alias": alias, "correo": correo_de(respuesta), "refresh_token": respuesta["refresh_token"],
             "access_token": respuesta.get("access_token"), "caduca": time.time() + respuesta.get("expires_in", 3600)}
    escribir_json(os.path.join(dir_cuentas, alias + ".json"), ficha)
    return {"ok": True, "alias": alias, "correo": ficha["correo"]}


def token(alias, pedir, dir_cuentas=DIR_CUENTAS, rutas=RUTAS_ENV):
    """Token de acceso renovado: devuelve el vivo, o lo renueva con el de refresco (sin enseñarlo).
    Las fichas authorized_user renuevan con SUS client_id/client_secret y su token_uri."""
    destino = os.path.join(dir_cuentas, alias + ".json")
    if not os.path.exists(destino):
        return None
    ficha = json.load(open(destino, encoding="utf-8"))
    if not ficha.get("refresh_token"):
        return None
    if ficha.get("caduca", 0) > time.time() + 60:
        return ficha.get("access_token")
    cid, secreto = cliente_id_secret(rutas)
    cid = ficha.get("client_id") or cid
    secreto = ficha.get("client_secret") or secreto
    if not cid or not secreto:
        return None
    respuesta = pedir(ficha.get("token_uri") or TOKEN_URL,
                      {"client_id": cid, "client_secret": secreto,
                       "grant_type": "refresh_token", "refresh_token": ficha["refresh_token"]})
    if not respuesta.get("access_token"):
        ficha["error_renovacion"] = str(respuesta.get("error") or "sin token de acceso")
        escribir_json(destino, ficha)
        return None
    ficha.pop("error_renovacion", None)
    ficha.update(access_token=respuesta["access_token"], caduca=time.time() + respuesta.get("expires_in", 3600))
    escribir_json(destino, ficha)
    return ficha["access_token"]


def estado(dir_cuentas=DIR_CUENTAS, rutas=RUTAS_ENV):
    """Alias, correo y si el token sigue vivo; NUNCA incluye tokens ni secretos.
    A los alias conocidos se añade cualquier otra ficha de cuenta (p. ej. alex-docs)."""
    aliases = list(ALIAS)
    try:
        aliases += [nombre[:-5] for nombre in sorted(os.listdir(dir_cuentas))
                    if nombre.endswith(".json") and not nombre.startswith(".")
                    and nombre != "cliente-oauth.json" and nombre[:-5] not in ALIAS]
    except OSError:
        pass
    filas = []
    for alias in aliases:
        destino = os.path.join(dir_cuentas, alias + ".json")
        ficha = json.load(open(destino, encoding="utf-8")) if os.path.exists(destino) else None
        cid, _ = cliente_id_secret(rutas)
        vivo = bool(ficha and ficha.get("refresh_token") and (ficha.get("client_id") or cid))
        filas.append({"alias": alias, "correo": (ficha or {}).get("correo"), "vivo": vivo,
                      "motivo": None if vivo else ((ficha or {}).get("error_renovacion") or "sin token")})
    return filas


def main(argv):
    orden = argv[1] if len(argv) > 1 else "estado"
    if orden == "importar":
        print("importar: %s" % json.dumps(importar(argv[2] if len(argv) > 2 else None), ensure_ascii=False))
    elif orden == "alta" and len(argv) > 2:
        from cuentas_google_env import esperar_codigo, pedir_http  # red real solo aquí
        print("alta: %s" % json.dumps(alta(argv[2], pedir_http, esperar=esperar_codigo,
                                           env_local=RUTA_ENV_LOCAL), ensure_ascii=False))
    elif orden == "estado":
        for fila in estado():
            print("%-10s %-34s %s" % (fila["alias"], fila["correo"] or "-", "vivo" if fila["vivo"] else "sin token"))
    else:
        print("Uso: cuentas_google.py importar [ruta] | alta alex|fundacion | estado")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
