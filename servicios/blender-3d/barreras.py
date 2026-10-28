#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Barreras del trabajo 3D (§4.2 y §4.3 de `architecture/blender-3d.md`): el mismo intérprete
de especificaciones que `validarTrabajo` de TypeScript y la barrera AST que solo admite el
preámbulo fijo y llamadas `o.<operación>(...)` de la lista blanca con argumentos constantes."""
import ast, json, math, re
from pathlib import Path
VOCABULARIO = Path(__file__).resolve().parents[2] / "src" / "lib" / "blender3d" / "vocabulario.json"
RE_NOMBRE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,31}$")
RE_RUTA = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$")
BASE = {"cubo": 8, "plano": 4, "circulo": 32, "esfera": 482, "icosfera": 42, "cilindro": 64, "cono": 64, "toro": 576}
VELOCIDAD = {"workbench": 350000, "cycles-cpu": 120000, "cycles-gpu": 1500000, "eevee": 15000}
PROHIBIDOS = {"exec", "eval", "compile", "open", "__import__", "getattr", "setattr", "os", "subprocess", "socket", "urllib", "builtins"}
NO_PERMITIDAS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp, ast.With, ast.AsyncWith, ast.Global, ast.Nonlocal, ast.JoinedStr, ast.FormattedValue)
def cargar_vocabulario(): return json.loads(VOCABULARIO.read_text(encoding="utf-8"))
def _num(x): return isinstance(x, (int, float)) and not isinstance(x, bool) and abs(x) <= 1.7976931348623157e308
def _validar_campo(e, v, ctx):
    t, mn, mx = e.get("t"), e.get("min"), e.get("max")
    if t in ("num", "vec"):
        ok = (_num(v) and (not e.get("ent") or float(v).is_integer()) and (mn is None or v >= mn) and (mx is None or v <= mx)) if t == "num" else (isinstance(v, list) and len(v) == e.get("n") and all(_num(x) and (mn is None or x >= mn) and (mx is None or x <= mx) for x in v))
        return None if ok else ("número%s en rango [%s, %s]" % (" entero" if e.get("ent") else "", "-∞" if mn is None else mn, "∞" if mx is None else mx) if t == "num" else "vector de %s números en rango [%s, %s]" % (e.get("n"), "-∞" if mn is None else mn, "∞" if mx is None else mx))
    if t == "bool": return None if isinstance(v, bool) else "debe ser booleano"
    if t == "enum": return None if v in e.get("v", []) else "valor no permitido (usa %s)" % ", ".join(e.get("v", []))
    if t == "rgba": return None if isinstance(v, list) and len(v) == 4 and all(_num(x) and 0 <= x <= 1 for x in v) else "rgba: 4 números entre 0 y 1"
    if t == "nombre":
        if not isinstance(v, str) or not RE_NOMBRE.match(v) or v in ctx: return "nombre inválido o repetido: %s" % v
        ctx.add(v); return None
    if t == "ref": return None if isinstance(v, str) and v in ctx else "referencia a un objeto que no existe: %s" % v
    if t == "txt": return None if isinstance(v, str) and len(v) <= e.get("max", math.inf) and (not e.get("patron") or re.search(e["patron"], v)) else ("debe ser texto" if not isinstance(v, str) else ("texto más largo de %s caracteres" % e["max"] if len(v) > e.get("max", math.inf) else "texto con caracteres no permitidos"))
    if t == "ruta":
        ok = isinstance(v, str) and RE_RUTA.match(v) and ".." not in v and not v.startswith("/") and v[v.rfind(".") + 1:].lower() in e.get("ext", [])
        return None if ok else "ruta relativa inválida (extensiones: %s)" % ", ".join(e.get("ext", []))
    if t == "lista":
        if not isinstance(v, list): return "debe ser una lista"
        if e.get("max") is not None and len(v) > e["max"]: return "lista con más de %s elementos" % e["max"]
        return next(("%s: %s" % (i, z) for i, z in ((i, _validar_campo(e["de"], x, ctx)) for i, x in enumerate(v)) if z), None)
    if t != "obj": return "especificación desconocida: %s" % t
    if not isinstance(v, dict): return "debe ser un objeto"
    campos = e.get("campos", {})
    for k in v:
        if k not in campos: return "campo desconocido: %s" % k
    for k, campo in campos.items():
        z = _validar_campo(campo, v[k], ctx) if k in v else (None if campo.get("opc") or "def" in campo else "falta el campo obligatorio: %s" % k)
        if z: return z if k not in v else "%s: %s" % (k, z)
    return None
def _validar_elemento(v, tipo, defs, clase, ctx):
    if not isinstance(v, dict): return "la %s debe ser un objeto" % clase
    d = defs.get(str(tipo))
    if not d: return "%s desconocida: %s" % (clase, tipo)
    if clase == "operacion" and d.get("estado") != "listo": return "%s: próximamente (%s)" % (tipo, d.get("motivo", "sin motivo"))
    cuerpo = dict(v); cuerpo.pop("op" if clase == "operacion" else "tipo", None)
    return _validar_campo({"t": "obj", "campos": d.get("params", {})}, cuerpo, ctx)
def _normalizar(v, d, clave):
    return {clave: v[clave], **{c: (v[c] if c in v else e["def"]) for c, e in d.get("params", {}).items() if c in v or "def" in e}}
def _estimar_coste(trabajo):
    cuenta, vertices = {}, 0
    for op in trabajo["escena"]:
        if op.get("op") == "primitiva": n = BASE.get(str(op.get("tipo")), 0); cuenta[str(op.get("nombre"))] = n; vertices += n
        elif op.get("op") == "modificador" and op.get("tipo") == "subdivision":
            previos = cuenta.get(str(op.get("objeto")), 0); veces = 4 ** int(op.get("niveles", 0)); cuenta[str(op.get("objeto"))] = previos * veces; vertices += previos * (veces - 1)
    segundos = sum(s["ancho"] * s["alto"] * s["muestras"] * (max(1, int(s.get("hasta", 0)) - int(s.get("desde", 0)) + 1) if s.get("tipo") == "render_mp4" else 1) / VELOCIDAD.get(str(s.get("motor")), VELOCIDAD["cycles-cpu"]) for s in trabajo["salidas"] if str(s.get("tipo", "")).startswith("render_"))
    return {"vertices": vertices, "segundos": round(segundos, 3)}
def validar_trabajo(bruto, vocab=None):
    v = vocab or cargar_vocabulario(); topes, motivos = v["topes"], []
    if not isinstance(bruto, dict): return False, None, ["el trabajo debe ser un objeto"]
    permitidos = ("v", "titulo", "calidad", "ambito", "origen", "quien", "escena", "salidas", "limites")
    motivos += ["campo desconocido en el trabajo: %s" % k for k in bruto if k not in permitidos]
    if type(bruto.get("v")) is not int or bruto.get("v") != v["version"]: motivos.append("v debe ser %s" % v["version"])
    titulo = bruto.get("titulo")
    if not isinstance(titulo, str) or not titulo.strip() or len(titulo) > 80: motivos.append("titulo debe ser texto de 1 a 80 caracteres")
    enums = {"calidad": ["borrador", "normal", "final"], "ambito": ["personal", "perfil", "grupo", "publica"], "origen": ["protomolecula", "astraura", "estudio", "xr", "avatares", "orbe", "api"]}
    motivos += ["%s no válido" % c for c, o in enums.items() if bruto.get(c) not in o]
    if bruto.get("quien") not in ("persona", "agente"): motivos.append("quien debe ser persona o agente")
    ctx, escena, salidas = set(), bruto.get("escena"), bruto.get("salidas")
    for lista, defs, clase, clave, tope, nombre in ((escena, v["operaciones"], "operacion", "op", topes["operaciones"], "escena"), (salidas, v["salidas"], "salida", "tipo", 4, "salidas")):
        if not isinstance(lista, list): motivos.append("%s debe ser una lista" % nombre); continue
        if clase == "operacion" and len(lista) > tope: motivos.append("demasiadas operaciones: máximo %s" % tope)
        if clase == "salida" and not 1 <= len(lista) <= tope: motivos.append("salidas debe tener entre 1 y 4 elementos"); continue
        motivos += ["%s[%s]: %s" % (nombre, i, z) for i, x in enumerate(lista) if (z := _validar_elemento(x, x.get(clave) if isinstance(x, dict) else None, defs, clase, ctx))]
    limites = bruto.get("limites")
    if "limites" in bruto and not isinstance(limites, dict): motivos.append("limites debe ser un objeto")
    elif isinstance(limites, dict):
        motivos += ["campo desconocido en limites: %s" % k for k in limites if k not in ("segundos", "memoriaMB")]
        motivos += ["limites.%s debe ser un número positivo dentro de los topes" % c for c in ("segundos", "memoriaMB") if c in limites and (not _num(limites[c]) or limites[c] <= 0 or (c == "segundos" and limites[c] > topes["segundos"]))]
    if motivos: return False, None, motivos
    trabajo = {"v": v["version"], "titulo": titulo, "calidad": bruto["calidad"], "ambito": bruto["ambito"], "origen": bruto["origen"], "quien": bruto["quien"],
               "escena": [_normalizar(x, v["operaciones"][str(x["op"])], "op") for x in escena], "salidas": [_normalizar(x, v["salidas"][str(x["tipo"])], "tipo") for x in salidas]}
    if "limites" in bruto: trabajo["limites"] = bruto["limites"]
    coste = _estimar_coste(trabajo)
    if coste["vertices"] > topes["vertices"]: motivos.append("demasiados vértices: %s (máximo %s)" % (coste["vertices"], topes["vertices"]))
    if coste["segundos"] > topes["segundos"]: motivos.append("demasiados segundos estimados: %s (máximo %s)" % (coste["segundos"], topes["segundos"]))
    return (True, trabajo, []) if not motivos else (False, None, motivos)
def lista_blanca(vocab=None): v = vocab or cargar_vocabulario(); return {n for n, d in v["operaciones"].items() if d.get("estado") == "listo"} | set(v["salidas"]) | {"iniciar"}
def _es_constante(n):
    if isinstance(n, ast.Constant): return isinstance(n.value, (int, float, str, bool, type(None)))
    if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd)): return isinstance(n.operand, ast.Constant) and isinstance(n.operand.value, (int, float)) and not isinstance(n.operand.value, bool)
    return isinstance(n, (ast.List, ast.Tuple)) and all(_es_constante(x) for x in n.elts)
def _es_insert(c):
    f = c.func
    return isinstance(f, ast.Attribute) and f.attr == "insert" and isinstance(f.value, ast.Attribute) and f.value.attr == "path" and isinstance(f.value.value, ast.Name) and f.value.value.id == "sys" and len(c.args) == 2 and type(getattr(c.args[0], "value", None)) is int and c.args[0].value == 0 and getattr(c.args[1], "value", None) == "." and not c.keywords
def verificar_guion(src):
    if not isinstance(src, str): return ["el guion debe ser texto"]
    try: arbol = ast.parse(src)
    except SyntaxError as e: return ["sintaxis inválida: %s" % e.msg]
    permitidos, motivos, inserts = lista_blanca(), [], 0
    for n in ast.walk(arbol):
        if isinstance(n, NO_PERMITIDAS): motivos.append("construcción no permitida: %s" % type(n).__name__)
        if isinstance(n, ast.Attribute) and "__" in n.attr: motivos.append("atributo no permitido: %s" % n.attr)
        if isinstance(n, ast.Name) and (n.id in PROHIBIDOS or "__" in n.id): motivos.append("nombre no permitido: %s" % n.id)
    for n in arbol.body:
        if isinstance(n, ast.Import):
            motivos += ["import no permitido: %s" % a.name for a in n.names if not ((a.name == "sys" and a.asname is None) or (a.name == "ops_starseed" and a.asname == "o") or (a.name in ("bpy", "math", "json") and a.asname is None))]
        elif isinstance(n, ast.ImportFrom): motivos.append("import no permitido")
        elif isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and _es_insert(n.value): inserts += 1
        elif not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and isinstance(n.value.func, ast.Attribute) and isinstance(n.value.func.value, ast.Name) and n.value.func.value.id == "o" and n.value.func.attr in permitidos and all(k.arg is not None and _es_constante(k.value) for k in n.value.keywords) and all(_es_constante(a) for a in n.value.args)):
            motivos.append("sentencia no permitida")
    if inserts != 1: motivos.append("debe haber exactamente una sentencia sys.path.insert(0, \".\")")
    return motivos
