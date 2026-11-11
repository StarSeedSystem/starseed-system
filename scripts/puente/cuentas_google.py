#!/usr/bin/env python3
"""Cuentas de Google de Alex para la actividad diaria (SDP1111E · §4 y §5 de sintesis-diaria-autonoma).

OAuth de app de escritorio con PKCE y redirección local en 127.0.0.1, scopes SOLO de lectura
(gmail.readonly, drive.readonly, youtube.readonly). Las claves del cliente viven solo como
GOOGLE_ACTIVIDAD_CLIENT_ID y GOOGLE_ACTIVIDAD_CLIENT_SECRET en ~/.starseed/env y ~/.hermes/.env
(patrón de guardar-clave.sh); jamás se imprimen valores, solo huellas de 8 caracteres.
Uso: python3 scripts/puente/cuentas_google.py importar [ruta] | alta alex|fundacion | estado
"""
import json, os, secrets, socket, sys, time, webbrowser

from cuentas_google_env import (ALIAS, DESCARGAS, DIR_CUENTAS, RUTAS_ENV, TOKEN_URL, cliente_id_secret,
                                correo_de, escribir_json, huella, localizar_cliente, poner_en_env,
                                url_autorizacion)


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
         dir_cuentas=DIR_CUENTAS, descargas=DESCARGAS, rutas=RUTAS_ENV):
    """Abre el navegador, recoge el código con PKCE en un puerto libre y guarda el token de refresco
    (0600). Si faltan las variables, se llama sola a `importar` con lo que haya en Descargas."""
    if alias not in ALIAS:
        return {"ok": False, "motivo": "alias desconocido: alex|fundacion"}
    cid, secreto = cliente_id_secret(rutas)
    if not cid or not secreto:
        importar(None, descargas, rutas, dir_cuentas)
        cid, secreto = cliente_id_secret(rutas)
    if not cid or not secreto:
        return {"ok": False, "motivo": "sin cliente OAuth: corre 'importar' o crea el cliente en console.cloud.google.com"}
    verificador = secrets.token_urlsafe(64)
    pinchado = socket.socket(); pinchado.bind(("127.0.0.1", 0))
    puerto = pinchado.getsockname()[1]; pinchado.close()
    redireccion = "http://127.0.0.1:%d/" % puerto
    abrir(url_autorizacion(cid, redireccion, verificador))
    codigo, error = esperar(puerto)
    if error or not codigo:
        return {"ok": False, "motivo": error or "sin código de autorización"}
    respuesta = pedir(TOKEN_URL, {"code": codigo, "client_id": cid, "client_secret": secreto,
                                  "redirect_uri": redireccion, "grant_type": "authorization_code",
                                  "code_verifier": verificador})
    if not respuesta.get("refresh_token"):
        return {"ok": False, "motivo": "Google no devolvió token de refresco: revoca el acceso y repite"}
    ficha = {"alias": alias, "correo": correo_de(respuesta), "refresh_token": respuesta["refresh_token"],
             "access_token": respuesta.get("access_token"), "caduca": time.time() + respuesta.get("expires_in", 3600)}
    escribir_json(os.path.join(dir_cuentas, alias + ".json"), ficha)
    return {"ok": True, "alias": alias, "correo": ficha["correo"]}


def token(alias, pedir, dir_cuentas=DIR_CUENTAS, rutas=RUTAS_ENV):
    """Token de acceso renovado: devuelve el vivo, o lo renueva con el de refresco (sin enseñarlo)."""
    destino = os.path.join(dir_cuentas, alias + ".json")
    if not os.path.exists(destino):
        return None
    ficha = json.load(open(destino, encoding="utf-8"))
    if not ficha.get("refresh_token"):
        return None
    if ficha.get("caduca", 0) > time.time() + 60:
        return ficha.get("access_token")
    cid, secreto = cliente_id_secret(rutas)
    if not cid or not secreto:
        return None
    respuesta = pedir(TOKEN_URL, {"client_id": cid, "client_secret": secreto,
                                  "grant_type": "refresh_token", "refresh_token": ficha["refresh_token"]})
    if not respuesta.get("access_token"):
        return None
    ficha.update(access_token=respuesta["access_token"], caduca=time.time() + respuesta.get("expires_in", 3600))
    escribir_json(destino, ficha)
    return ficha["access_token"]


def estado(dir_cuentas=DIR_CUENTAS, rutas=RUTAS_ENV):
    """Alias, correo y si el token sigue vivo; NUNCA incluye tokens ni secretos."""
    filas = []
    for alias in ALIAS:
        destino = os.path.join(dir_cuentas, alias + ".json")
        ficha = json.load(open(destino, encoding="utf-8")) if os.path.exists(destino) else None
        filas.append({"alias": alias, "correo": (ficha or {}).get("correo"),
                      "vivo": bool(ficha and ficha.get("refresh_token") and cliente_id_secret(rutas)[0])})
    return filas


def main(argv):
    orden = argv[1] if len(argv) > 1 else "estado"
    if orden == "importar":
        print("importar: %s" % json.dumps(importar(argv[2] if len(argv) > 2 else None), ensure_ascii=False))
    elif orden == "alta" and len(argv) > 2:
        from cuentas_google_env import esperar_codigo, pedir_http  # red real solo aquí
        print("alta: %s" % json.dumps(alta(argv[2], pedir_http, esperar=esperar_codigo), ensure_ascii=False))
    elif orden == "estado":
        for fila in estado():
            print("%-10s %-34s %s" % (fila["alias"], fila["correo"] or "-", "vivo" if fila["vivo"] else "sin token"))
    else:
        print("Uso: cuentas_google.py importar [ruta] | alta alex|fundacion | estado")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
