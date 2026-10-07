import json, os, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

def extraer(doc, ruta):
    if doc is None or ruta is None: return None
    actual = doc
    for p in str(ruta).split("."):
        if actual is None: return None
        if isinstance(actual, dict): actual = actual.get(p)
        elif isinstance(actual, list):
            try: idx = int(p); actual = actual[idx] if 0 <= idx < len(actual) else None
            except ValueError: return None
        else: return None
    if isinstance(actual, (int, float)): return float(actual)
    if isinstance(actual, str):
        s = actual.strip()
        try: return float(s)
        except ValueError: return None
    return None

def leer_entorno(nombre, entorno=None, rutas=("~/.starseed/env", "~/.hermes/.env")):
    if entorno is not None:
        v = entorno.get(nombre)
        if v is not None: return v
    for r in rutas:
        ruta = os.path.expanduser(str(r))
        try:
            with open(ruta, "r", encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#"): continue
                    lp = linea[len("export "):].lstrip() if linea.startswith("export ") else linea
                    if "=" not in lp: continue
                    k, val = lp.split("=", 1)
                    k = k.strip(); val = val.strip()
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    if k == nombre: return val
        except (OSError, FileNotFoundError): continue
    return None

def leer_http_json(entrada, ahora, abrir_url=urllib.request.urlopen, entorno=None):
    url = entrada.get("url", "")
    if not isinstance(url, str) or not url.startswith("https://"):
        return {"id":entrada.get("id"),"nombre":entrada.get("nombre"),"proveedor":entrada.get("proveedor"),"tipo":"saldo","plan":None,"leido":ahora.isoformat() if hasattr(ahora,"isoformat") else str(ahora),"ok":False,"obsoleto":False,"error":"solo https","saldo":None,"ventanas":[],"extras":{},"fuente":"api: %s"%url}
    clave_env = entrada.get("clave_env")
    clave_valor = leer_entorno(clave_env, entorno=entorno) if clave_env else None
    if clave_env and clave_valor is None:
        return {"id":entrada.get("id"),"nombre":entrada.get("nombre"),"proveedor":entrada.get("proveedor"),"tipo":"saldo","plan":None,"leido":ahora.isoformat() if hasattr(ahora,"isoformat") else str(ahora),"ok":False,"obsoleto":False,"error":"falta %s"%clave_env,"saldo":None,"ventanas":[],"extras":{},"fuente":"api: %s"%url}
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", "Bearer %s" % clave_valor) if clave_valor else None
    req.add_header("User-Agent", "starseed-medidor")
    try:
        with abrir_url(req, timeout=20) as resp:
            datos_bytes = resp.read(256*1024)
            respuesta_texto = datos_bytes.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return {"id":entrada.get("id"),"nombre":entrada.get("nombre"),"proveedor":entrada.get("proveedor"),"tipo":"saldo","plan":None,"leido":ahora.isoformat() if hasattr(ahora,"isoformat") else str(ahora),"ok":False,"obsoleto":False,"error":"http %d"%e.code,"saldo":None,"ventanas":[],"extras":{},"fuente":"api: %s"%url}
    except Exception as e:
        return {"id":entrada.get("id"),"nombre":entrada.get("nombre"),"proveedor":entrada.get("proveedor"),"tipo":"saldo","plan":None,"leido":ahora.isoformat() if hasattr(ahora,"isoformat") else str(ahora),"ok":False,"obsoleto":False,"error":type(e).__name__,"saldo":None,"ventanas":[],"extras":{},"fuente":"api: %s"%url}
    try: data = json.loads(respuesta_texto) if respuesta_texto else {}
    except json.JSONDecodeError:
        return {"id":entrada.get("id"),"nombre":entrada.get("nombre"),"proveedor":entrada.get("proveedor"),"tipo":"saldo","plan":None,"leido":ahora.isoformat() if hasattr(ahora,"isoformat") else str(ahora),"ok":False,"obsoleto":False,"error":"respuesta no es json","saldo":None,"ventanas":[],"extras":{},"fuente":"api: %s"%url}
    rutas_obj = entrada.get("rutas", {})
    usado_ruta = limite_ruta = restante_ruta = None
    if isinstance(rutas_obj, dict):
        for k, v in rutas_obj.items():
            if k == "usado": usado_ruta = v
            elif k == "limite": limite_ruta = v
            elif k == "restante": restante_ruta = v
    usado = extraer(data, usado_ruta)
    limite = extraer(data, limite_ruta)
    restante = extraer(data, restante_ruta)
    ventanas = []
    if limite is not None and limite > 0:
        usado_pct = (usado / limite * 100) if usado is not None else 0.0
        ventanas = [{"id":"uso","etiqueta":"Uso","usado_pct":round(usado_pct,2),"reinicia":None}]
    unidad = entrada.get("unidad", "USD")
    valor_saldo = restante if restante is not None else (limite - usado if (usado is not None and limite is not None) else None)
    saldo = {"valor":round(valor_saldo,4),"limite":limite if limite is not None else None,"unidad":unidad} if valor_saldo is not None else None
    host = urllib.parse.urlparse(url).netloc if hasattr(urllib.parse,"urlparse") else url.split("/")[2] if "/" in url else url
    return {"id":entrada.get("id"),"nombre":entrada.get("nombre"),"proveedor":entrada.get("proveedor"),"tipo":"saldo","plan":None,"leido":ahora.isoformat() if hasattr(ahora,"isoformat") else str(ahora),"ok":True,"obsoleto":False,"error":None,"saldo":saldo,"ventanas":ventanas,"extras":{},"fuente":"api: %s"%host}

def leer_declarado(entrada, ahora, abrir=open):
    archivo_raw = entrada.get("archivo", "")
    archivo = os.path.expanduser(str(archivo_raw))
    try:
        with abrir(archivo, "r", encoding="utf-8") as f:
            contenido = f.read()
        data = json.loads(contenido)
    except Exception as e:
        return {"id":entrada.get("id"),"nombre":entrada.get("nombre"),"proveedor":entrada.get("proveedor"),"tipo":"saldo","plan":None,"leido":ahora.isoformat() if hasattr(ahora,"isoformat") else str(ahora),"ok":False,"obsoleto":False,"error":"archivo: %s"%type(e).__name__,"saldo":None,"ventanas":[],"extras":{},"fuente":"declarado"}
    rutas_obj = entrada.get("rutas", {})
    restante_ruta = limite_ruta = vence_ruta = None
    if isinstance(rutas_obj, dict):
        for k, v in rutas_obj.items():
            if k == "restante": restante_ruta = v
            elif k == "limite": limite_ruta = v
            elif k == "vence": vence_ruta = v
    restante = extraer(data, restante_ruta)
    limite = extraer(data, limite_ruta)
    ventanas = []
    if limite is not None and limite > 0:
        usado = limite - restante if (restante is not None and limite is not None) else None
        usado_pct = (usado / limite * 100) if usado is not None else 0.0
        ventanas = [{"id":"uso","etiqueta":"Uso","usado_pct":round(usado_pct,2),"reinicia":None}]
    unidad = entrada.get("unidad", "USD")
    valor_saldo = restante
    saldo = {"valor":round(float(valor_saldo),4),"limite":limite if limite is not None else None,"unidad":unidad} if valor_saldo is not None else None
    declarado_en = data.get("declarado_en") if isinstance(data, dict) else None
    leido_valor = declarado_en if (declarado_en and isinstance(declarado_en, str)) else (datetime.fromtimestamp(os.stat(archivo).st_mtime, tz=timezone.utc).isoformat() if os.path.isfile(archivo) else (ahora.isoformat() if hasattr(ahora,"isoformat") else str(ahora)))
    extras = {}
    if vence_ruta and isinstance(data, dict):
        actual = data
        for p in str(vence_ruta).split("."):
            if isinstance(actual, dict): actual = actual.get(p)
            else: actual = None; break
        if isinstance(actual, str): extras["vence"] = actual
    elif isinstance(extraer(data, vence_ruta), str): extras["vence"] = extraer(data, vence_ruta)
    return {"id":entrada.get("id"),"nombre":entrada.get("nombre"),"proveedor":entrada.get("proveedor"),"tipo":"saldo","plan":None,"leido":leido_valor,"ok":True,"obsoleto":False,"error":None,"saldo":saldo,"ventanas":ventanas,"extras":extras,"fuente":"declarado"}
