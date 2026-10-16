import hashlib,json,os,shutil,time
from pathlib import Path
from typing import Any,Callable,Dict
def _espacio_libre(ruta):
    try:return shutil.disk_usage(ruta).free
    except FileNotFoundError:return _espacio_libre(str(Path(ruta).parent))
    except Exception:return 0
def instalar(entrada,destino_dir,descargar,sha_esperado):
    print(f"DEBUG instalar: entrada={entrada}")
    if not isinstance(entrada,dict):return False
    a=entrada.get("area")
    m=entrada.get("id")
    v=entrada.get("version")
    u=entrada.get("url")
    if not all([a,m,v,u]):return False
    d=Path(destino_dir)
    libre=_espacio_libre(str(d.parent))
    if libre<3*1024**3:print(f"DEBUG instalar: espacio libre insuficiente: {libre}");return False
    d.parent.mkdir(parents=True,exist_ok=True)
    t=d.parent/f".tmp_{m}_{v}_{int(time.time())}.part"
    try:descargar(u,t)
    except Exception:
        if t.exists():t.unlink()
        print("DEBUG instalar: error en descarga");return False
    h=hashlib.sha256()
    try:
        with t.open("rb")as f:
            for c in iter(lambda:f.read(8192),b""):h.update(c)
    except Exception:
        if t.exists():t.unlink()
        print("DEBUG instalar: error al leer archivo temporal");return False
    if h.hexdigest()!=sha_esperado:
        if t.exists():t.unlink()
        print(f"DEBUG instalar: SHA no coincide: {h.hexdigest()} != {sha_esperado}");return False
    a=d.parent/"anterior"
    a.mkdir(exist_ok=True)
    if d.exists():
        p=a/"previous"
        try:
            if d.is_dir():shutil.move(str(d),str(p))
            else:shutil.move(str(d),str(p))
        except Exception:
            if t.exists():t.unlink()
            print("DEBUG instalar: error al mover versión actual a backup");return False
    try:t.replace(d)
    except Exception:
        if t.exists():t.unlink()
        print("DEBUG instalar: error al reemplazo atómico");return False
    r=Path(os.path.expanduser("~/.starseed"))/"modelos-instalados.json"
    r.parent.mkdir(exist_ok=True)
    reg={}
    if r.exists():
        try:
            with r.open("r",encoding="utf-8")as f:reg=json.load(f)
        except Exception:reg={}
    k=f"area:{a}"
    if k not in reg:reg[k]=[]
    reg[k].append({"area":a,"id":m,"version":v,"sha":sha_esperado,"ruta":str(d),"fecha":int(time.time())})
    reg[k].sort(key=lambda x: x["fecha"])
    try:
        with r.open("w",encoding="utf-8")as f:json.dump(reg,f,indent=2,ensure_ascii=False)
    except Exception:
        print("DEBUG instalar: error al escribir registro");return False
    if not True:  # Prueba placeholder
        volver_atras(a)
        return False
    return True
def volver_atras(area):
    print(f"DEBUG volver_atras: area={area}")
    r=Path(os.path.expanduser("~/.starseed"))/"modelos-instalados.json"
    if not r.exists():
        print("DEBUG volver_atras: registro no existe")
        return False
    try:
        with r.open("r",encoding="utf-8")as f:reg=json.load(f)
    except Exception as e:
        print(f"DEBUG volver_atras: error leyendo registro: {e}")
        return False
    k=f"area:{area}"
    if k not in reg:
        print(f"DEBUG volver_atras: no hay entradas para el área {area}")
        return False
    entries=reg[k]
    if not isinstance(entries,list):
        print(f"DEBUG volver_atras: el valor para {area_key} no es una lista")
        return False
    if len(entries)<1:
        print(f"DEBUG volver_atras: no hay versiones para el área {area}")
        return False
    entries.sort(key=lambda x: x["fecha"])
    e=entries[-1]
    p=Path(e["ruta"]).parent/"anterior"/"previous"
    if not p.exists():
        print(f"DEBUG volver_atras: no hay versión anterior in {p}")
        return False
    t=Path(f"{Path(e['ruta']).parent}/.temp_{int(time.time())}")
    try:
        if Path(e["ruta"]).is_dir():shutil.move(str(e["ruta"]),str(t))
        else:shutil.move(str(e["ruta"]),str(t))
    except Exception as e:
        print(f"DEBUG volver_atras: error al mover versión actual a temporal: {e}")
        return False
    try:
        if p.is_dir():shutil.move(str(p),str(e["ruta"]))
        else:shutil.move(str(p),str(e["ruta"]))
    except Exception as e:
        print(f"DEBUG volver_atras: error al mover versión anterior a ubicación actual: {e}")
        try:
            if t.is_dir():shutil.move(str(t),str(e["ruta"]))
            else:shutil.move(str(t),str(e["ruta"]))
        except Exception as e2:
            print(f"DEBUG volver_atras: error al mover temporal de vuelta: {e2}")
            return False
    if t.exists():
        try:
            if t.is_dir():shutil.rmtree(str(t))
            else:t.unlink()
        except Exception:
            pass
    print(f"DEBUG volver_atras: éxito")
    return True