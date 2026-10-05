/**
 * El script que corre EN LA MAC (Python 3, solo biblioteca estándar).
 *
 * QUÉ: lee el Mando (`127.0.0.1:9002/api/mando/…`) y el Chat Director, y lo reduce a un
 * resumen pequeño; o ejecuta una acción (reparar, decir, informar, publicar, entrega).
 * POR QUÉ: el mod vive en Claude Code y el Mando solo escucha en la Mac. Un único viaje
 * por el enlace con el equipo trae todo el panel ya recortado (decenas de KB, no los
 * 2,5 MB de `/estado`), así que no carga la Mac ni el contexto.
 * CÓMO: `python3 - <acción> '<json %-codificado>' <<'PYEOF_MANDO' … PYEOF_MANDO`. Imprime
 * UNA línea `@@MANDO@@{json}`; el mod busca esa marca y descarta todo lo demás. Nunca
 * imprime claves ni rutas de secretos: solo lee las respuestas públicas del Mando.
 */
export const MARCA = '@@MANDO@@'

export const SCRIPT_MAC = String.raw`
import json, os, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
BASE = "http://127.0.0.1:9002/api/mando/"
MARCA = "@@MANDO@@"
TOPE = 20

def pedir(ruta, cuerpo=None, tope=TOPE):
    datos = None if cuerpo is None else json.dumps(cuerpo).encode("utf-8")
    cab = {"Content-Type": "application/json"} if datos is not None else {}
    req = urllib.request.Request(BASE + ruta, data=datos, method="POST" if datos is not None else "GET", headers=cab)
    with urllib.request.urlopen(req, timeout=tope) as f:
        return json.loads(f.read().decode("utf-8"))

def corto(t, n):
    t = "" if t is None else str(t)
    return t if len(t) <= n else t[: n - 1] + "…"

def fila(f):
    return {
        "id": str(f.get("id") or ""),
        "titulo": corto(f.get("titulo"), 140),
        "estado": f.get("estado"),
        "porcentaje": f.get("porcentaje"),
        "etapa": f.get("etapa"),
        "porque": corto(f.get("porque"), 240) or None,
        "quien": f.get("quien"),
        "desde": f.get("desde"),
        "acciones": sorted({a.get("clase") for a in (f.get("acciones") or []) if a.get("clase")}),
    }

def medidor(clave, n=40):
    d = pedir("medidores?clave=" + urllib.parse.quote(clave))["detalle"]
    filas = [f for f in (d.get("filas") or []) if not f.get("historica")]
    return {
        "clave": clave,
        "titulo": d.get("titulo"),
        "resumen": corto(d.get("resumen"), 220),
        "total": len(filas),
        "historicas": d.get("historicas") or 0,
        "porcentaje": d.get("porcentajeMedio"),
        "aviso": corto(d.get("aviso"), 300) or None,
        "cargando": (d.get("cargando") or {}).get("texto"),
        "filas": [fila(f) for f in filas[: max(0, int(n))]],
    }

def limpio_detalle(t):
    """Cola del detalle de un paso fallido, sin colores de terminal y con las líneas que dicen algo."""
    import re
    t = re.sub(r"\x1b\[[0-9;]*m", "", t or "")
    utiles = [l.rstrip() for l in t.splitlines() if re.search(r"FAIL|Error|error|×|✗|expect|Tests |Test Files|❯ src/", l)]
    return corto("\n".join(utiles[-14:]) or t[-600:], 1400)

def publicacion():
    d = pedir("publicacion")
    di = d.get("diario") or {}
    def commit(c):
        if isinstance(c, dict):
            return corto(" ".join(str(v) for v in c.values()), 120)
        return corto(c, 120)
    return {
        "head": d.get("head"), "rama": d.get("rama"), "sinPublicar": d.get("sinPublicar"),
        "archivos": d.get("archivosCambiados"), "comprobaciones": d.get("comprobaciones"),
        "titulo": d.get("tituloDiario"),
        "diario": {
            "id": di.get("id"), "estado": di.get("estado"), "nota": corto(di.get("nota"), 160),
            "empezado": di.get("empezado"), "terminado": di.get("terminado"),
            "resumen": corto(di.get("resumen"), 300),
            "pasos": [{
                "titulo": p.get("titulo") or p.get("clave") or "?", "estado": p.get("estado") or "?",
                "segundos": p.get("segundos"),
                "detalle": limpio_detalle(p.get("detalle")) if str(p.get("estado") or "").startswith(("fall", "error")) else None,
            } for p in (di.get("pasos") or [])],
        },
        "commits": [commit(c) for c in (d.get("commits") or [])[:8]],
    }

def servidor():
    d = pedir("servidor", tope=30)
    m = d.get("maquina") or {}
    en = d.get("energia") or {}
    nu = d.get("nube") or {}
    return {
        "maquina": {"host": m.get("hostname"), "memLibreMb": m.get("memLibreMb"), "memTotalMb": m.get("memTotalMb"),
                     "carga": m.get("loadavg"), "uptimeS": m.get("uptimeS")},
        "despierto": en.get("despierto"),
        "enjambre": d.get("enjambre"),
        "tunel": nu.get("tunelActivo"),
        "servicios": [{"etiqueta": s.get("etiqueta"), "pid": s.get("pid"), "salida": s.get("ultimaSalida"),
                        "reiniciable": s.get("reiniciable")} for s in (d.get("servicios") or [])],
        "avisos": [corto(a, 220) for a in (d.get("avisos") or [])],
    }

def mensaje(m):
    return {"id": m.get("id"), "t": m.get("t"), "de": m.get("de"), "canal": m.get("canal"),
            "tipo": m.get("tipo"), "texto": corto(m.get("texto"), 700)}

def chat(n=12):
    d = pedir("director-chat?limite=%d" % int(n))
    return [mensaje(m) for m in (d.get("mensajes") or [])][-int(n):]

def director_chat():
    sys.path.insert(0, os.path.join(RAIZ, "scripts", "puente"))
    import director_chat as dc
    return dc

def bandeja():
    return [mensaje(m) for m in director_chat().bandeja("claude-cowork")][-20:]

def uso():
    out = {"total": None, "limites": None}
    try:
        out["total"] = pedir("uso-claude").get("total")
    except Exception:
        pass
    ruta = os.path.expanduser("~/.starseed/limites-claude.json")
    if os.path.exists(ruta):
        try:
            d = json.load(open(ruta, encoding="utf-8"))
            out["limites"] = {k: v for k, v in d.items() if isinstance(v, (str, int, float)) or v is None}
        except Exception:
            pass
    return out

def resumen(_d):
    trabajos = {
        "en-curso": lambda: medidor("en-curso", 20),
        "agentes": lambda: medidor("agentes", 20),
        "bloqueadas": lambda: medidor("bloqueadas", 60),
        "olas": lambda: medidor("ola-activa", 40),
        "sin-publicar": lambda: medidor("sin-publicar", 0),
        "memoria": lambda: medidor("memoria", 0),
        "disco": lambda: medidor("disco", 0),
        "credito": lambda: medidor("credito-claude", 0),
        "publicacion": publicacion,
        "servidor": servidor,
        "chat": lambda: chat(12),
        "bandeja": bandeja,
        "uso": uso,
    }
    out = {"t": time.strftime("%Y-%m-%d %H:%M:%S"), "errores": {}}
    with ThreadPoolExecutor(4) as ex:
        futuros = {k: ex.submit(f) for k, f in trabajos.items()}
        for k, f in futuros.items():
            try:
                out[k] = f.result()
            except Exception as e:
                out["errores"][k] = corto("%s: %s" % (type(e).__name__, e), 160)
    return out

def reparar(d):
    ids = [str(x) for x in (d.get("ids") or []) if str(x).strip()]
    cuerpo = {"automatico": True}
    if ids:
        cuerpo["ids"] = ids
    if d.get("cambio"):
        cuerpo["cambio"] = corto(d.get("cambio"), 4000)
    return pedir("reintentar", cuerpo, tope=45)

def decir(d):
    cuerpo = {"accion": "decir", "texto": corto(d.get("texto"), 20000)}
    if d.get("canales"):
        cuerpo["canales"] = list(d.get("canales"))
    r = pedir("director-chat", cuerpo, tope=45)
    return {k: r.get(k) for k in ("ok", "id", "error", "pendientes", "respuesta") if k in r} or {"ok": True}

def informar(d):
    texto = corto(d.get("texto"), 20000).strip()
    if not texto:
        raise ValueError("falta el texto")
    m = director_chat().publicar(texto, de="claude-cowork", rol="director", tipo="informe",
                                 modelo="claude-cowork/claude-opus-5-5")
    return {"id": m.get("id")}

def entrega(d):
    estado = d.get("estado") or "entregado"
    director_chat().entrega(str(d.get("id")), "claude-cowork", estado)
    return {"id": d.get("id"), "estado": estado}

def publicar(d):
    nota = corto(d.get("nota"), 400).strip()
    if len(nota) < 8:
        raise ValueError("la nota de la publicación necesita al menos 8 caracteres")
    return pedir("publicacion", {"accion": "publicar", "nota": nota}, tope=45)

def un_medidor(d):
    return medidor(str(d.get("clave") or "en-curso"), int(d.get("limite") or 40))

ACCIONES = {
    "resumen": resumen, "reparar": reparar, "decir": decir, "informar": informar,
    "entrega": entrega, "publicar": publicar, "medidor": un_medidor,
}

def main():
    accion = sys.argv[1] if len(sys.argv) > 1 else "resumen"
    try:
        datos = json.loads(urllib.parse.unquote(sys.argv[2])) if len(sys.argv) > 2 else {}
        if accion not in ACCIONES:
            raise ValueError("acción desconocida: %s" % accion)
        r = {"ok": True, "datos": ACCIONES[accion](datos)}
    except Exception as e:
        r = {"ok": False, "error": corto("%s: %s" % (type(e).__name__, e), 400)}
    sys.stdout.write(MARCA + json.dumps(r, ensure_ascii=False) + "\n")
    sys.stdout.flush()

main()
`
