"""nucleo.py — lo que no necesita GPU: catálogo de formatos, campañas, plan de render, textos y vocabulario de la tabla de piezas.

Puro y probado (test_estudio.py). Aquí se decide QUÉ se renderiza (un maestro por proporción, derivados escalados), con qué
márgenes (los más estrictos del grupo, escalados al tamaño del maestro) y CÓMO se llama cada archivo; captura.py y
codificar.py hacen el trabajo pesado.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent.parent
FORMATOS_JSON = AQUI / "formatos.json"
CARPETA_CAMPANAS = AQUI / "campanas"
SALIDA_DEFECTO = Path("/mnt/user-data/outputs/metageminis")

# Vocabulario de metageminis_piezas (supabase/migrations/20261011090000_metageminis.sql)
TIPOS_DB = ("imagen", "video", "animacion3d", "anuncio", "cartel", "carrusel")
FORMATO_DB_RE = re.compile(r"^[0-9]{2,5}x[0-9]{2,5}(@[0-9]+(\.[0-9]+)?s)?$")
MEDIO_DB_RE = re.compile(r"^[a-z0-9_]{2,40}$")
IDIOMAS = ("es", "en")
TOPE_VIDEO_BYTES = 15 * 1_000_000  # regla de la tarea: cada vídeo ≤ 15 MB
SALIDAS_VIDEO = ("video",)
SALIDAS_ESTATICAS = ("imagen", "banner", "cabecera", "cartel", "carrusel")


# ───────────────────────── catálogo ─────────────────────────

def cargar_formatos(ruta: Path = FORMATOS_JSON) -> dict[str, dict]:
    datos = json.loads(Path(ruta).read_text(encoding="utf8"))
    return {f["id"]: f for f in datos["formatos"]}


def cargar_fuentes(ruta: Path = FORMATOS_JSON) -> dict[str, dict]:
    datos = json.loads(Path(ruta).read_text(encoding="utf8"))
    return {f["id"]: f for f in datos["fuentes"]}


def razon(ancho: int, alto: int) -> tuple[int, int]:
    g = math.gcd(ancho, alto)
    return ancho // g, alto // g


def formato_pieza(ancho: int, alto: int, duracion: float | None = None) -> str:
    """El campo `formato` de la tabla de piezas: «1080x1920@15s» o «1080x1080»."""
    base = f"{ancho}x{alto}"
    if duracion is None:
        return base
    d = str(int(duracion)) if float(duracion).is_integer() else str(round(float(duracion), 2))
    return f"{base}@{d}s"


# ───────────────────────── márgenes ─────────────────────────

LADOS = ("arriba", "abajo", "izquierda", "derecha")


def escalar_margenes(m: dict, k: float) -> dict:
    return {lado: int(math.ceil(m[lado] * k)) for lado in LADOS}


def margenes_union(maestro: dict, formatos: list[dict]) -> dict:
    """Los márgenes más estrictos de un grupo, medidos en píxeles del maestro (cada formato se escala a su ancho)."""
    out = {lado: 0 for lado in LADOS}
    for f in formatos:
        k = maestro["ancho"] / f["ancho"]
        e = escalar_margenes(f["margenes"], k)
        for lado in LADOS:
            out[lado] = max(out[lado], e[lado])
    return out


def evitar_union(maestro: dict, formatos: list[dict]) -> list[dict]:
    """Zonas que la interfaz tapa en cualquiera de los formatos, escaladas al maestro."""
    rects = []
    for f in formatos:
        k = maestro["ancho"] / f["ancho"]
        for z in f.get("evitar") or []:
            rects.append({"motivo": z["motivo"], "izquierda": int(z["izquierda"] * k), "arriba": int(z["arriba"] * k), "ancho": int(math.ceil(z["ancho"] * k)), "alto": int(math.ceil(z["alto"] * k))})
    return rects


def area_segura(ancho: int, alto: int, m: dict) -> dict:
    return {"x": m["izquierda"], "y": m["arriba"], "ancho": ancho - m["izquierda"] - m["derecha"], "alto": alto - m["arriba"] - m["abajo"]}


# ───────────────────────── verdad ─────────────────────────

# «Cero ilusiones»: ninguna cifra, logro, testimonio ni promesa inventada. Este filtro no sustituye a una persona,
# pero atrapa lo típico (porcentajes, importes, «usuarios», «garantizado»…) antes de renderizar.
PROHIBIDO = [
    (r"\d+\s*%", "porcentaje"), (r"[€$£]\s*\d|\d\s*[€$£]|\d\s*euros", "importe"),
    (r"\b\d[\d.,]*\s*(usuarios|usuarias|miembros|socios|socias|personas|voluntarios|voluntarias|downloads|descargas|users|members)\b", "cifra de personas"),
    (r"\b(miles|millones|cientos) de\b", "cantidad vaga"), (r"\b(thousands|millions|hundreds) of\b", "cantidad vaga"),
    (r"garantiz|garantía|rentab|ganar dinero|enriquec|sin riesgo|guarantee|risk-free|get rich", "promesa"),
    (r"\bya somos\b|we are already|ya hemos logrado|premiad|galardon|award-winning", "logro"),
    (r"testimonio|\"[^\"]+\"\s*[-—]\s*[A-ZÁÉÍÓÚ]", "testimonio"),
    (r"\b(el|la) (mejor|primer[oa]|único|única) .{0,24}(del mundo|de europa|de españa)\b", "superlativo"),
    (r"\b(cura|curar|curación|sana|sanar|sanación|terapia|terapéutic[oa])\b|\bheal(ing|s)?\b|\btherap", "afirmación de salud"),
]


def mentiras_en(texto: str) -> list[str]:
    """Etiquetas de lo que el texto afirma y no debería (vacío = pasa el filtro)."""
    out = []
    for patron, etiqueta in PROHIBIDO:
        if re.search(patron, texto, flags=re.IGNORECASE):
            out.append(etiqueta)
    return out


def textos_de_beat(b: dict) -> list[str]:
    out = []
    for k in ("kicker", "titular", "sub", "cuerpo", "cta", "url", "aviso", "pie", "pie_derecha", "qr_texto", "desliza", "numero"):
        if isinstance(b.get(k), str):
            out.append(b[k])
    for it in b.get("lista") or []:
        out.append(it if isinstance(it, str) else it.get("texto", ""))
    for t in b.get("tarjetas") or []:
        out += [t.get("titulo", ""), t.get("texto", "")]
    return out


def textos_de_campana(c: dict) -> list[tuple[str, str]]:
    """(ruta, texto) de todo lo que se ve o se publica con las piezas."""
    out: list[tuple[str, str]] = []
    for clave, por_idioma in (c.get("guiones") or {}).items():
        for idioma, beats in por_idioma.items():
            lista = beats if isinstance(beats, list) else [beats]
            for i, b in enumerate(lista):
                for t in textos_de_beat(b):
                    out.append((f"guiones.{clave}.{idioma}[{i}]", t))
    for p in c.get("piezas", []):
        for lam in p.get("laminas", []):
            for idioma in IDIOMAS:
                b = lam.get(idioma)
                if b:
                    for t in textos_de_beat(b):
                        out.append((f"piezas.{p['id']}.laminas.{idioma}", t))
    for k, v in (c.get("textos_acompanantes") or {}).items():
        for idioma, t in v.items():
            out.append((f"acompanante.{k}.{idioma}", t))
    return out


# ───────────────────────── campañas ─────────────────────────

def cargar_campana(id_: str, carpeta: Path = CARPETA_CAMPANAS) -> dict:
    return json.loads((Path(carpeta) / f"{id_}.json").read_text(encoding="utf8"))


def validar_campana(c: dict, formatos: dict[str, dict]) -> list[str]:
    """Problemas de una campaña (lista vacía = lista para renderizar)."""
    p: list[str] = []
    for k in ("id", "nombre", "marca", "paleta", "piezas", "guiones"):
        if k not in c:
            p.append(f"falta «{k}»")
    if p:
        return p
    ids = set()
    for pz in c["piezas"]:
        pid = pz.get("id", "?")
        if pid in ids:
            p.append(f"pieza repetida: {pid}")
        ids.add(pid)
        if pz.get("salida") not in SALIDAS_VIDEO + SALIDAS_ESTATICAS:
            p.append(f"{pid}: salida desconocida «{pz.get('salida')}»")
        if pz.get("tipo") not in TIPOS_DB:
            p.append(f"{pid}: tipo «{pz.get('tipo')}» no es uno de {TIPOS_DB}")
        fs = pz.get("formatos") or []
        if not fs:
            p.append(f"{pid}: sin formatos")
        for fid in fs + (pz.get("compatibles") or []):
            f = formatos.get(fid)
            if not f:
                p.append(f"{pid}: formato desconocido «{fid}»")
                continue
            if pz["tipo"] not in f["tipos"] and not (pz["tipo"] == "carrusel" and "imagen" in f["tipos"]):
                p.append(f"{pid}: el formato {fid} no admite el tipo {pz['tipo']}")
            if pz["salida"] == "video":
                d = pz.get("duracion", 0)
                dur = f.get("duracion") or {}
                if dur.get("max") is not None and d > dur["max"]:
                    p.append(f"{pid}: {d}s supera el máximo de {fid} ({dur['max']}s)")
                if dur.get("min") is not None and d < dur["min"]:
                    p.append(f"{pid}: {d}s no llega al mínimo de {fid} ({dur['min']}s)")
        for idioma in pz.get("idiomas", ["es"]):
            if idioma not in IDIOMAS:
                p.append(f"{pid}: idioma desconocido {idioma}")
            clave = pz.get("guion")
            if pz["salida"] != "carrusel" and clave and idioma not in (c["guiones"].get(clave) or {}):
                p.append(f"{pid}: el guion «{clave}» no tiene versión «{idioma}»")
        if pz["salida"] == "carrusel" and not pz.get("laminas"):
            p.append(f"{pid}: carrusel sin láminas")
    for ruta, t in textos_de_campana(c):
        malo = mentiras_en(t)
        if malo:
            p.append(f"{ruta}: «{t[:50]}» afirma algo que no se puede sostener ({', '.join(malo)})")
    return p


# ───────────────────────── plan de render ─────────────────────────

@dataclass
class Entrega:
    formato: dict
    archivo: str  # relativo a la carpeta de la campaña: «instagram/reel-instagram-reels-es.mp4»
    contenedor: str
    derivado: bool = False  # True si se obtiene escalando el maestro
    compartida: bool = False  # True si reutiliza el archivo de otra entrega (mismo tamaño): solo añade una fila al manifiesto


@dataclass
class Trabajo:
    campana: str
    pieza: dict
    idioma: str
    maestro: dict
    margenes: dict
    evitar: list
    duracion: float | None
    fps: int
    entregas: list[Entrega] = field(default_factory=list)
    lamina: int | None = None  # índice (0..n-1) en carruseles

    @property
    def id(self) -> str:
        base = f"{self.pieza['id']}__{self.maestro['ancho']}x{self.maestro['alto']}__{self.idioma}"
        return base if self.lamina is None else f"{base}__{self.lamina + 1:02d}"


def _nombre(pieza_id: str, formato_id: str, idioma: str, ext: str, lamina: int | None = None) -> str:
    extra = "" if lamina is None else f"-{lamina + 1:02d}"
    return f"{pieza_id}-{formato_id}{extra}-{idioma}.{ext}"


def _contenedor_principal(pieza: dict, f: dict) -> str:
    quiere = pieza.get("contenedor")
    if quiere:
        return quiere
    if pieza["salida"] == "video":
        return "mp4"
    if pieza["salida"] == "cartel":
        return "png"
    return "png" if "png" in f["contenedores"] else f["contenedores"][0]


def _contenedores(pieza: dict, f: dict) -> list[str]:
    """Contenedores que se entregan de un estático (p. ej. cartel: png y pdf; banner: png y gif)."""
    quiere = pieza.get("contenedores")
    if quiere:
        return [c for c in quiere if c in f["contenedores"] or c in ("pdf",)]
    return [_contenedor_principal(pieza, f)]


def plan_pieza(campana: dict, pieza: dict, formatos: dict[str, dict], idiomas: list[str] | None = None, solo_formatos: list[str] | None = None) -> list[Trabajo]:
    """Trabajos de render de una pieza. `formatos` = los que tienen archivo propio; `compatibles` = los que reutilizan un archivo
    de igual tamaño (solo suman una fila al manifiesto) y que cuentan para los márgenes del grupo, así el archivo cumple en todos."""
    propios = [x for x in pieza["formatos"] if not solo_formatos or x in solo_formatos]
    compat = [x for x in pieza.get("compatibles", []) if x not in propios and (not solo_formatos or x in solo_formatos or not propios)]
    fs = [formatos[x] for x in propios]
    fc = [formatos[x] for x in compat]
    langs = [i for i in pieza.get("idiomas", ["es"]) if not idiomas or i in idiomas]
    fps = int(pieza.get("fps", 30))
    trabajos: list[Trabajo] = []

    def compartidas(t: Trabajo, grupo_compat: list[dict], lam: int | None, idioma: str) -> None:
        for f in grupo_compat:
            for e in list(t.entregas):
                if not e.compartida and (e.formato["ancho"], e.formato["alto"]) == (f["ancho"], f["alto"]) and e.formato["id"] != f["id"]:
                    t.entregas.append(Entrega(f, e.archivo, e.contenedor, compartida=True))
                    break

    for idioma in langs:
        if pieza["salida"] == "video":
            grupos: dict[tuple[int, int], list[dict]] = {}
            for f in fs + fc:
                grupos.setdefault(razon(f["ancho"], f["alto"]), []).append(f)
            for _, g in grupos.items():
                propios_g = [f for f in g if f["id"] in propios]
                if not propios_g:
                    continue
                maestro = max(g, key=lambda f: f["ancho"] * f["alto"])
                t = Trabajo(campana["id"], pieza, idioma, maestro, margenes_union(maestro, g), evitar_union(maestro, g), pieza["duracion"], fps)
                for f in propios_g:
                    t.entregas.append(Entrega(f, f"{f['medio']}/{_nombre(pieza['id'], f['id'], idioma, 'mp4')}", "mp4", derivado=(f["ancho"], f["alto"]) != (maestro["ancho"], maestro["alto"])))
                compartidas(t, [f for f in g if f["id"] in compat], None, idioma)
                trabajos.append(t)
        else:
            grupos2: dict[tuple[int, int], list[dict]] = {}
            for f in fs + fc:
                grupos2.setdefault((f["ancho"], f["alto"]), []).append(f)
            laminas = range(len(pieza["laminas"])) if pieza["salida"] == "carrusel" else [None]
            for _, g in grupos2.items():
                propios_g = [f for f in g if f["id"] in propios]
                if not propios_g:
                    continue
                maestro = propios_g[0]
                for lam in laminas:
                    t = Trabajo(campana["id"], pieza, idioma, maestro, margenes_union(maestro, g), evitar_union(maestro, g), pieza.get("duracion"), fps, lamina=lam)
                    for f in propios_g:
                        for ext in _contenedores(pieza, f):
                            t.entregas.append(Entrega(f, f"{f['medio']}/{_nombre(pieza['id'], f['id'], idioma, ext, lam)}", ext))
                    for f in g:
                        if f["id"] in compat:
                            for e in [e for e in t.entregas if not e.compartida]:
                                t.entregas.append(Entrega(f, e.archivo, e.contenedor, compartida=True))
                    trabajos.append(t)
    return trabajos


def plan_campana(campana: dict, formatos: dict[str, dict], piezas: list[str] | None = None, idiomas: list[str] | None = None, solo_formatos: list[str] | None = None) -> list[Trabajo]:
    out: list[Trabajo] = []
    for pz in campana["piezas"]:
        if piezas and pz["id"] not in piezas:
            continue
        out += plan_pieza(campana, pz, formatos, idiomas, solo_formatos)
    return out


# ───────────────────────── configuración para el motor JS ─────────────────────────

def beats_de(campana: dict, trabajo: Trabajo) -> list[dict]:
    pz = trabajo.pieza
    if pz.get("laminas"):
        lam = pz["laminas"][trabajo.lamina or 0]
        return [lam.get(trabajo.idioma) or lam["es"]]
    g = campana["guiones"][pz["guion"]][trabajo.idioma]
    return g if isinstance(g, list) else [g]


def pulsos_de(pieza: dict, campana: dict) -> list[float]:
    aud = pieza.get("audio")
    if not aud:
        return []
    return [float(x) for x in aud.get("pulsos", [])]


# Un lienzo de más de ~10 megapíxeles (cartel A3 a 300 ppp: 3508×4961) tumba el Chromium con WebGL de SwiftShader. Para esos formatos
# el DOM se maqueta a la MITAD (dpr = 2: 1754×2480 px CSS) y la captura se hace con clip.scale = 2, así el archivo sale a tamaño completo.
UMBRAL_DPR_PX = 10_000_000


def css_div(ancho: int, alto: int) -> int:
    return 2 if ancho * alto > UMBRAL_DPR_PX else 1


def formato_css(m: dict, margenes: dict, evitar: list, dpr: int) -> dict:
    """El bloque `formato` del motor JS. Con dpr > 1 todo va en píxeles CSS (÷ dpr) y `px_ancho/px_alto` guardan el tamaño real del archivo."""
    if dpr == 1:
        return {"id": m["id"], "ancho": m["ancho"], "alto": m["alto"], "margenes": margenes, "evitar": evitar, "dpr": 1, "px_ancho": m["ancho"], "px_alto": m["alto"]}
    return {
        "id": m["id"], "ancho": math.ceil(m["ancho"] / dpr), "alto": math.ceil(m["alto"] / dpr), "dpr": dpr, "px_ancho": m["ancho"], "px_alto": m["alto"],
        "margenes": {k: int(math.ceil(v / dpr)) for k, v in margenes.items()},
        "evitar": [{**z, "izquierda": z["izquierda"] // dpr, "arriba": z["arriba"] // dpr, "ancho": math.ceil(z["ancho"] / dpr), "alto": math.ceil(z["alto"] / dpr)} for z in evitar],
    }


def cfg_motor(campana: dict, trabajo: Trabajo, borrador: bool = False, depurar: bool = False, qr: dict | None = None) -> dict:
    pz = trabajo.pieza
    m = trabajo.maestro
    estatico = pz["salida"] != "video"
    forzar_beats = estatico and not pz.get("gif")
    escena = dict(pz.get("escena", {}))
    dpr = css_div(m["ancho"], m["alto"])
    cfg = {
        "formato": formato_css(m, trabajo.margenes, trabajo.evitar, dpr),
        "modo": "estatico" if estatico else "video",
        "layout": pz.get("layout", "lamina" if pz["salida"] in ("carrusel", "cartel") else "kinetico"),
        "escena": {"id": escena.get("id", pz.get("escena_id")), "semilla": escena.get("semilla", 7), "params": escena.get("params", {})},
        "duracion": trabajo.duracion or 15,
        "fps": trabajo.fps,
        "t_estatico": pz.get("t_estatico", 12.5),
        "idioma": trabajo.idioma,
        "escala3d": 0.4 if borrador else pz.get("escala3d", 0.75),
        "calidad": "borrador" if borrador else "final",
        "textos": [dict(b) for b in beats_de(campana, trabajo)],
        "paleta": campana["paleta"],
        "audio": {"pulsos": pulsos_de(pz, campana)},
        "marca": campana["marca"],
        "qr": qr,
        "depurar": depurar,
    }
    if forzar_beats:
        for b in cfg["textos"]:
            b.update({"t": 0, "fin": True, "entrada": 0.01})
    if estatico:
        cfg["escena"]["params"] = {**cfg["escena"]["params"], "post": {"grano": 0.008, **(cfg["escena"]["params"].get("post") or {})}}
    for k in ("tipografia", "ancla", "ancho_texto", "marca_pos", "marca_sin_nombre", "pie", "velo", "escala_lamina"):
        if k in pz:
            cfg[k] = pz[k]
    if pz.get("laminas"):
        lam = pz["laminas"][trabajo.lamina or 0]
        for k in ("layout", "ancla", "ancho_texto", "tipografia", "escala_lamina", "velo", "marca_pos"):
            if k in lam:
                cfg[k] = lam[k]
        if lam.get("escena"):
            cfg["escena"] = {"id": lam["escena"].get("id", cfg["escena"]["id"]), "semilla": lam["escena"].get("semilla", cfg["escena"]["semilla"]), "params": lam["escena"].get("params", {})}
            cfg["t_estatico"] = lam["escena"].get("t", cfg["t_estatico"])
    return cfg


# ───────────────────────── tabla de piezas ─────────────────────────

def tipo_db(pieza: dict) -> str:
    return pieza["tipo"]


def fila_tabla_piezas(campana_id: str, pieza: dict, entrega: Entrega, sha256: str, duracion: float | None, tamano: tuple[int, int] | None = None) -> dict:
    """Una fila de metageminis_piezas lista para insertar (estado «para_aprobar»; la base rechaza cualquier otro)."""
    f = entrega.formato
    ancho, alto = tamano or (f["ancho"], f["alto"])
    fila = {
        "campana_ref": campana_id,
        "rama_id": "estudio",
        "tipo": tipo_db(pieza),
        "medio": f["medio"],
        "formato": formato_pieza(ancho, alto, duracion if (pieza["salida"] == "video" or entrega.contenedor in ("gif", "apng", "webm")) else None),
        "ruta": entrega.archivo,
        "sha256": sha256,
        "estado": "para_aprobar",
    }
    return fila


def fila_valida(fila: dict) -> list[str]:
    p = []
    if fila["tipo"] not in TIPOS_DB:
        p.append("tipo")
    if not MEDIO_DB_RE.match(fila["medio"]):
        p.append("medio")
    if not FORMATO_DB_RE.match(fila["formato"]):
        p.append("formato")
    if not re.match(r"^[0-9a-f]{64}$", fila.get("sha256") or ""):
        p.append("sha256")
    ruta = fila.get("ruta") or ""
    if len(ruta) > 500 or ".." in ruta or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", ruta):
        p.append("ruta")
    if fila["estado"] != "para_aprobar":
        p.append("estado")
    return p


# ───────────────────────── QR ─────────────────────────

def qr_matriz(url: str) -> dict:
    """Matriz de módulos del QR de `url` (la genera node con el paquete qrcode del repositorio)."""
    salida = subprocess.run(["node", str(AQUI / "qr.mjs"), url], capture_output=True, text=True, timeout=60, check=True).stdout
    return json.loads(salida)
