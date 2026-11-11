# -*- coding: utf-8 -*-
"""Guardados de Instagram leídos SOLO de la exportación oficial «Descargar tu información».
Lee saved_posts.json y saved_collections.json, sueltos o dentro del zip oficial, en
~/.starseed/actividad/entrada/instagram/ o ~/Downloads/; nunca abre Instagram ni pide nada a
instagram.com. Fichas privadas en ~/.starseed/actividad/fichas/; avance por enlace. Nada se borra."""
import datetime as dt, json, os, re, zipfile
_ZIP = re.compile(r"^instagram-.+?-\d{4}-\d{2}-\d{2}-[^/]+\.zip$", re.I)
_LINK = re.compile(r"instagram\.com/(?:p|reel|tv)/", re.I)
_AUTOR = ("username", "usuario", "nom d'utilisateur", "benutzername", "nome utente", "nome de usuário", "owner", "shared by", "propietario", "propriétaire", "name", "nombre")
_JSONS = ("saved_posts.json", "saved_collections.json")

def _filas(nodo):
    if isinstance(nodo, (dict, list)):
        if isinstance(nodo, dict) and ("label" in nodo or "href" in nodo) and ("value" in nodo or "href" in nodo): yield nodo
        for valor in (nodo.values() if isinstance(nodo, dict) else nodo): yield from _filas(valor)

def _filas_de_item(item):
    if isinstance(item.get("label_values"), list): return list(_filas(item["label_values"]))
    smd = item.get("string_map_data")
    return [dict(d, label=d.get("label") or k) for k, d in smd.items() if isinstance(d, dict)] if isinstance(smd, dict) else list(_filas(item.get("string_list_data") if isinstance(item.get("string_list_data"), list) else item))

def _de_items(datos, clave):
    """Fichas de una lista de guardados; el álbum anterior nombra a sus colecciones."""
    if datos is None: return []
    items = datos.get(clave) if isinstance(datos, dict) else datos
    items = [datos] if items is None else ([items] if isinstance(items, dict) else items)
    salida, coleccion = [], ""
    for item in items or []:
        if not isinstance(item, dict): continue
        filas = _filas_de_item(item); hrefs = [str(f["href"]) for f in filas if f.get("href")]
        enlace = next((h for h in hrefs if _LINK.search(h)), hrefs[0] if hrefs else "")
        if enlace:
            autor = next((str(f["value"]).strip() for etiqueta in _AUTOR for f in filas if str(f.get("label") or "").strip().lower() == etiqueta and f.get("value")), str(item.get("title") or "").strip())
            fecha = next((dt.datetime.fromtimestamp(int(str(v)), dt.timezone.utc).isoformat().replace("+00:00", "Z") for v in [item.get("timestamp")] + [f.get("timestamp") for f in filas] if str(v).isdigit()), "")
            ficha = {"fuente": "instagram", "tipo": "guardado", "enlace": enlace, "autor": autor, "fecha": fecha, "privado": True}
            if coleccion: ficha["coleccion"] = coleccion
            salida.append(ficha)
        else:
            nombre = next((str(f.get("value") or "").strip() for f in filas if str(f.get("label") or "").lower() == "name" and f.get("value")), "")
            coleccion = nombre or str(item.get("title") or "").strip()
    return salida

def fichas_de_exportacion(guardados=None, colecciones=None):
    """Fichas privadas de los dos JSON oficiales, sin duplicados por enlace."""
    salida, vistas = [], set()
    for ficha in _de_items(guardados, "saved_saved_media") + _de_items(colecciones, "saved_saved_collections"):
        if ficha["enlace"] not in vistas: vistas.add(ficha["enlace"]); salida.append(ficha)
    return salida

def nuevas_por_enlace(fichas, vistos):
    """Solo las fichas cuyo enlace no se había visto antes."""
    vistos, salida, aqui = set(vistos or ()), [], set()
    for ficha in fichas or []:
        enlace = (ficha or {}).get("enlace")
        if enlace and enlace not in vistos and enlace not in aqui: aqui.add(enlace); salida.append(ficha)
    return salida

def _raiz(home=None):
    return os.path.join(os.path.abspath(os.path.expanduser(home or "~")), ".starseed", "actividad")

def _cargar_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as archivo: return json.load(archivo)
    except (OSError, ValueError): return None

def _zips(directorio):
    try: return [os.path.join(directorio, n) for n in sorted(os.listdir(directorio)) if _ZIP.match(n)]
    except OSError: return []

def _leer_zip(ruta):
    try:
        with zipfile.ZipFile(ruta) as z:
            datos = {os.path.basename(n).lower(): json.load(z.open(n)) for n in z.namelist() if os.path.basename(n).lower() in _JSONS}
        return datos.get("saved_posts.json"), datos.get("saved_collections.json")
    except (OSError, zipfile.BadZipFile, ValueError): return None, None

def recolectar(home=None, descargas=None):
    """Junta las fichas de los JSON sueltos y de los zips oficiales, sin duplicados."""
    entrada = os.path.join(_raiz(home), "entrada", "instagram")
    descargas = os.path.abspath(os.path.expanduser(descargas or "~/Downloads"))
    fuentes = [(_cargar_json(os.path.join(entrada, n)), None) if n == "saved_posts.json"
               else (None, _cargar_json(os.path.join(entrada, n))) for n in _JSONS]
    fuentes += [_leer_zip(r) for carpeta in (entrada, descargas) for r in _zips(carpeta)]
    fichas = [f for guardados, colecciones in fuentes for f in fichas_de_exportacion(guardados, colecciones)]
    return nuevas_por_enlace(fichas, [])

def _guardar_fichas(fichas, home=None, ahora=None):
    momento = ahora or dt.datetime.now(dt.timezone.utc)
    if isinstance(momento, str): momento = dt.datetime.fromisoformat(momento.replace("Z", "+00:00"))
    carpeta = os.path.join(_raiz(home), "fichas"); os.makedirs(carpeta, mode=0o700, exist_ok=True)
    ruta = os.path.join(carpeta, "%s-instagram.json" % momento.strftime("%Y-%m-%d"))
    todas = nuevas_por_enlace(list(_cargar_json(ruta) or []) + list(fichas), [])
    with open(ruta + ".tmp", "w", encoding="utf-8") as archivo: json.dump(todas, archivo, ensure_ascii=False, indent=1)
    os.replace(ruta + ".tmp", ruta)
    try: os.chmod(ruta, 0o600)
    except OSError: pass
    return ruta

def _guardar_vistos(vistos, home=None):
    os.makedirs(_raiz(home), mode=0o700, exist_ok=True)
    with open(os.path.join(_raiz(home), "instagram-vistos.json"), "w", encoding="utf-8") as archivo:
        json.dump(sorted(set(vistos)), archivo, ensure_ascii=False, indent=1)

def ejecutar(home=None, descargas=None, ahora=None):
    """Lee, filtra lo ya visto, escribe las fichas nuevas y devuelve el parte."""
    fichas = recolectar(home, descargas)
    vistos = _cargar_json(os.path.join(_raiz(home), "instagram-vistos.json")) or []
    nuevas = nuevas_por_enlace(fichas, vistos)
    ruta = ""
    if nuevas:
        ruta = _guardar_fichas(nuevas, home, ahora)
        _guardar_vistos(list(vistos) + [f["enlace"] for f in nuevas], home)
    return {"ok": True, "leidas": len(fichas), "nuevas": len(nuevas),
            "vistos": len(set(vistos) | {f["enlace"] for f in nuevas}), "ruta": ruta}

if __name__ == "__main__":
    print(json.dumps(ejecutar(), ensure_ascii=False, indent=1))
