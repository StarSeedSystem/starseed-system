#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mueve (sin borrar) los Docs basura de las pruebas a «_pruebas (para borrar)» en Síntesis diarias (SIN1114D §4.4).
En seco por defecto; con --aplicar mueve. Basura = «Síntesis diaria 2026-11-11», creado después del
2026-11-12 y con menos de 2000 caracteres de texto exportado. Nunca toca un Doc de 4000 o más, ni
borra ni manda a la papelera. Cuenta de Drive: alex-docs.
"""
import json, os, sys, urllib.parse, urllib.request

TITULO_BASURA = "Síntesis diaria 2026-11-11"
FECHA_LIMITE = "2026-11-12"  # se crearon DESPUÉS de esta fecha
MIN_BASURA = 2000  # con menos de esto de texto exportado es basura
INTACTO_DESDE = 4000  # un Doc con este tamaño o más nunca se toca
CARPETA_SINTESIS = os.environ.get("STARSEED_CARPETA_SINTESIS", "1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI")
SUBCARPETA_NOMBRE = "_pruebas (para borrar)"
CUENTA = "alex-docs"


def es_basura(nombre, creado, texto) -> bool:
    """Los tres criterios del §4.4 (el cerrojo de ≥ INTACTO_DESDE lo aplica limpiar antes)."""
    if nombre != TITULO_BASURA or not creado or str(creado)[:10] <= FECHA_LIMITE:
        return False
    return len(texto or "") < MIN_BASURA


def limpiar(listar, leer_texto, asegurar_subcarpeta, mover, avisar=None, aplicar=False) -> dict:
    """Núcleo puro con Drive inyectado: cuenta, mueve (solo con aplicar) y avisa al Mando."""
    subcarpeta = asegurar_subcarpeta()
    basura, ilegibles, intactos = [], 0, 0
    for documento in listar() or []:
        try:
            texto = leer_texto(documento["id"])
        except Exception:
            ilegibles += 1  # sin texto no se puede verificar el tamaño: no se toca
            continue
        if len(texto or "") >= INTACTO_DESDE:
            intactos += 1
            continue
        if es_basura(documento.get("name", ""), documento.get("createdTime", ""), texto):
            basura.append(documento)
            if aplicar:
                mover(documento["id"], subcarpeta)
    if aplicar and basura and avisar:
        avisar("Limpieza de Síntesis diarias: moví %d Doc(s) de pruebas a «%s»; no se borró nada; Maggasukha decide si se vacía." % (len(basura), SUBCARPETA_NOMBRE))
    return {"aplicar": aplicar, "basura": len(basura), "movidos": len(basura) if aplicar else 0,
            "ilegibles": ilegibles, "intactos": intactos, "subcarpeta": subcarpeta, "ids": [d["id"] for d in basura]}


def _pedir_https(url, cuerpo):
    """POST JSON, la firma `pedir` de cuentas_google.token (renovar el access_token)."""
    peticion = urllib.request.Request(url, json.dumps(cuerpo).encode("utf-8"), {"Content-Type": "application/json"})
    with urllib.request.urlopen(peticion, timeout=60) as r:
        return json.load(r)

def _acceso() -> str:
    """Token de acceso del alias alex-docs (solo drive.file)."""
    import cuentas_google as CG
    acceso = CG.token(CUENTA, _pedir_https)
    if not acceso:
        raise RuntimeError("sin token de Drive para la cuenta %s" % CUENTA)
    return acceso

def _api(metodo, ruta, params=None, cuerpo=None):
    """GET/POST/PATCH de la API de Drive v3 con el token de alex-docs; devuelve JSON."""
    url = "https://www.googleapis.com/drive/v3/%s" % ruta
    if params:
        url += "?" + urllib.parse.urlencode(params)
    encabezados = {"Authorization": "Bearer %s" % _acceso(), "Content-Type": "application/json"}
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else (b"" if metodo == "PATCH" else None)
    with urllib.request.urlopen(urllib.request.Request(url, data=datos, method=metodo,
                                                       headers=encabezados), timeout=60) as r:
        return json.load(r)

def _listar():
    """Los Docs NO borrados de «Síntesis diarias» con su fecha de creación."""
    consulta = "'%s' in parents and trashed=false and mimeType='application/vnd.google-apps.document'" % CARPETA_SINTESIS
    datos = _api("GET", "files", {"q": consulta, "pageSize": "200", "fields": "nextPageToken,files(id,name,createdTime)"})
    return datos.get("files") or []

def _leer_texto(fid) -> str:
    """Texto exportado del Doc (text/plain); falla con excepción si no se puede exportar."""
    url = "https://www.googleapis.com/drive/v3/files/%s/export?mimeType=text/plain" % fid
    encabezados = {"Authorization": "Bearer %s" % _acceso()}
    with urllib.request.urlopen(urllib.request.Request(url, headers=encabezados), timeout=60) as r:
        return r.read().decode("utf-8", errors="ignore")

def _asegurar_subcarpeta() -> str:
    """Id de «_pruebas (para borrar)» dentro de Síntesis diarias; la crea si falta."""
    consulta = "'%s' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='%s'" % (CARPETA_SINTESIS, SUBCARPETA_NOMBRE)
    existentes = _api("GET", "files", {"q": consulta, "pageSize": "1", "fields": "files(id)"}).get("files") or []
    if existentes:
        return existentes[0]["id"]
    cuerpo = {"name": SUBCARPETA_NOMBRE, "mimeType": "application/vnd.google-apps.folder", "parents": [CARPETA_SINTESIS]}
    return _api("POST", "files", cuerpo=cuerpo)["id"]

def _mover(fid, subcarpeta) -> str:
    """PATCH con addParents/removeParents: mueve el Doc SIN borrarlo ni papelera."""
    params = {"addParents": subcarpeta, "removeParents": CARPETA_SINTESIS, "fields": "id,parents"}
    return _api("PATCH", "files/%s" % fid, params)["id"]

def avisar_mando(texto) -> None:
    """Aviso al canal del Mando (tipo aviso); su fallo no bloquea la limpieza."""
    try:
        from puente import decir
        decir(texto, quien="SIN1114D", tipo="aviso", tarea="SIN1114D")
    except Exception:
        pass

def main(argv) -> int:
    try:
        resultado = limpiar(_listar, _leer_texto, _asegurar_subcarpeta, _mover,
                            avisar=avisar_mando, aplicar="--aplicar" in argv)
    except RuntimeError as fallo:
        print(json.dumps({"ok": False, "motivo": str(fallo)}, ensure_ascii=False))
        return 1
    print(json.dumps(resultado, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
