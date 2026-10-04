#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""contexto_agente · el MISMO contexto de memoria y entendimiento para todos los agentes (2026-09-30).

Alex: «que se usen más las habilidades, herramientas y conectores del Puente de Mando, como
Jev en todos los agentes y subagentes, con el mismo workflow y contextos de memorias y
entendimientos completos». Cada agente —escritor o revisor del enjambre, analista de los
sueños, supervisor Claude, subagente de Claude en la terminal, Hermes, un IDE— carga ESTE
texto antes de trabajar: las reglas permanentes que le tocan (con su fuente), cómo se decide
con Jev, las herramientas que tiene con su orden exacta, su área (documentos, rutas y dónde
vive el código) y por dónde va el relevo. Es compacto a propósito: el contexto es crédito.

  python3 scripts/puente/contexto_agente.py --rol escritor|revisor|analista|supervisor|subagente
                                            [--area mando] [--tarea "…"] [--max 6000]
                                            [--excluir relevo,herramientas] [--json]

Núcleo PURO (`construir` recibe `leer`/`existe`); solo la CLI toca el disco. Nunca lleva
claves: todo pasa por `sanear` antes de salir.
"""

import argparse
import json
import os
import re
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

ROLES = ("escritor", "revisor", "analista", "supervisor", "subagente")
TODOS = ROLES
MAX_POR_DEFECTO = 6000
#: Por debajo de este tope el contexto va COMPACTO: reglas sin su fuente y herramientas sin
#: explicación (en el prompt de un escritor o de un analista cada carácter se paga).
COMPACTO_BAJO = 2500
AREAS_TS = "src/lib/mando/areas.ts"
RELEVO = "starseed_memory_root/relevo/relevo.md"

# ─────────────────────────────── reglas permanentes ───────────────────────────────
# (id, roles, regla, fuente). La fuente es «ruta · sección»: la prueba de deriva exige que la
# ruta exista en el repositorio, para que ninguna regla hable en nombre de un documento que ya no está.
REGLAS = [
    ("jev-consejero", TODOS,
     "Jev es consejero con umbral, nunca oráculo: decide tu regla y Jev afina la zona de duda; si calla, sigues.",
     "memory/orquestacion-economica.md · §9 y §17"),
    ("un-orquestador", TODOS,
     "UN orquestador, N agentes; nunca `next build` con el enjambre vivo.",
     "CLAUDE.md · cabecera"),
    ("claves", TODOS,
     "Claves: solo NOMBRES de variables de entorno; jamás valores en código, memorias, prompts, informes ni el bus.",
     "memory/orquestacion-economica.md · §1.5"),
    ("creditos", TODOS,
     "Ningún modelo agota sus créditos: lo mecánico a la flota gratuita, OpenRouter solo ids `:free`; ante 429/402 se releva al siguiente sin insistir.",
     "CLAUDE.md · Economía de créditos"),
    ("quien-escribe", ("supervisor", "subagente"),
     "El enjambre escribe el código de producto; Claude y los asistentes dirigen, verifican y aprueban (a mano solo para deshacer una regresión).",
     "memory/workflow-actual.md · Quién escribe qué"),
    ("tarea-pequena", ("escritor", "analista", "supervisor"),
     "Una tarea del enjambre cabe en ≤ 3 archivos y ≤ 120 líneas por archivo.",
     "CLAUDE.md · Mando ampliado"),
    ("candidato", ("escritor", "revisor", "supervisor"),
     "La salida de un motor es un CANDIDATO, no un archivo: uno que encoge más de la mitad no se integra.",
     "memory/orquestacion-economica.md · §0"),
    ("puertas", ("escritor", "revisor", "supervisor", "subagente"),
     "Puertas: alcance → cableado → tsc → vitest → revisión → integración; nada está hecho hasta que se ve en el Mando de la Mac.",
     "memory/workflow-actual.md · Las puertas"),
    ("tests", ("escritor",),
     "Tests TS solo de funciones puras: prohibido `vi.mock` de módulos de Node e importar un `route.ts`; importa describe/it/expect de vitest.",
     "scripts/enjambre/starseed-enjambre.py · REGLA_TESTS"),
    ("servidor-cliente", ("escritor", "revisor"),
     "Un módulo que importa `node:*` es solo de servidor: sus tipos puros van aparte; una ruta de Next solo exporta GET/POST/config.",
     "CLAUDE.md · Publicar"),
    ("bloqueante", ("revisor",),
     "Bloqueante SOLO por un defecto visible en el código mostrado que rompa comportamiento, seguridad o datos; la falta de contexto es riesgo, no bloqueo.",
     "scripts/enjambre/starseed-enjambre.py · revisar"),
    ("citar", ("analista", "revisor"),
     "Cita solo archivo:línea que ves; una lista vacía es una respuesta válida; no inventes archivos ni APIs.",
     "architecture/suenos-profundos.md"),
    ("privada", ("analista", "supervisor"),
     "La lente seguridad-privacidad es SOLO de la Mac: nunca en artefactos públicos, el bus ni Telegram.",
     "memory/orquestacion-economica.md · §16"),
    ("consumo", ("escritor", "supervisor", "subagente"),
     "Supabase: pocos eventos y gruesos (presupuesto diario, freno al 100 %); nada de sondeos en bucle.",
     "memory/orquestacion-economica.md · §15"),
    ("no-publicar", ("supervisor", "subagente"),
     "Nunca `git push` ni publicar sin la palabra explícita de Alex; nunca borrar datos o cuentas sin copia.",
     "CLAUDE.md · Publicar"),
    ("capacidad", ("supervisor",),
     "Lo que sube el TECHO del sistema (más agentes a la vez, mejores modelos) va primero en cualquier cola.",
     "CLAUDE.md · Regla permanente de prioridad"),
    ("entrega", ("supervisor", "subagente"),
     "A Alex: enlace o comando exacto, explicando QUÉ, POR QUÉ y CÓMO; cada respuesta termina con el informe de uso.",
     "CLAUDE.md · Regla permanente de entrega"),
    ("preflight-binarios", ("supervisor", "subagente"),
     "Antes de lanzar una ola verifica que existen los binarios que usa (p. ej. `command -v opencode`); "
     "si una tarea falla 3 veces con el mismo error, paúsala y escala en el canal en vez de reintentar.",
     "memory/aprendizaje-olas.md · 2026-09-16 21:17"),
]

# ─────────────────────────────── herramientas ───────────────────────────────
# (id, roles, orden exacta, para qué, archivo del repo que la respalda o None si es de la Mac).
HERRAMIENTAS = [
    ("decidir", TODOS,
     "python3 scripts/puente/decidir.py si-no --estado '<json breve>' --pregunta \"¿…?\" --regla no --quien <tú>",
     "decisión tipada con probabilidad (también `elegir --opciones a,b`, `puntuar --niveles …`, `confirmar <exp>`, `uso`)",
     "scripts/puente/decidir.py"),
    ("contexto", ("supervisor", "subagente"),
     "python3 scripts/puente/contexto_agente.py --rol <rol> --area <área>",
     "este mismo contexto para el agente que lances", "scripts/puente/contexto_agente.py"),
    ("suenos", ("supervisor",),
     "python3 scripts/puente/suenos.py estado | por-verificar --n 3 | veredicto <id> --estado verificado --nota \"… jev: p=…\" --por claude-<modelo> | consolidar | detener --fecha F | lanzar --fecha F",
     "dirigir y verificar los sueños profundos", "scripts/puente/suenos.py"),
    ("latido", ("supervisor", "subagente"),
     "python3 scripts/puente/latido_externo.py empezar <id> \"<título>\" --agente <tú> --medio claude",
     "aparecer como agente en el Mando (fase, terminar)", "scripts/puente/latido_externo.py"),
    ("gitnexus", ("escritor", "revisor", "analista", "subagente"),
     "gitnexus context <símbolo> · gitnexus impact <símbolo> · gitnexus query \"<concepto>\" · gitnexus detect-changes",
     "mapa del código antes que grep a ciegas (Mac, índice en .gitnexus/)", None),
    ("fuentes", ("escritor", "analista", "supervisor", "subagente"),
     "starseed-fuentes buscar <texto>",
     "catálogos de APIs, MCP y patrones antes de inventar uno (Mac)", None),
    ("decir", ("supervisor", "subagente"),
     "starseed-puente decir \"<texto>\" --de <tú> --tipo aviso|hecho|error",
     "el canal común del Mando y de los IDE", "scripts/puente/puente.py"),
    ("relevo", ("supervisor", "subagente"),
     "starseed-relevo nota --de <tú> \"hecho…; sigue…\"",
     "dejar el punto de relevo para el siguiente agente (Mac)", None),
    ("hermes", ("supervisor",),
     "hermes send -t telegram:Maggasukha -s \"<asunto>\" \"<cuerpo>\"",
     "solo lo importante, y solo si `command -v hermes` responde (Mac)", None),
]

PROTOCOLO = [
    "1. Primero tu REGLA determinista (la del código o la del SOP). Si es clara, decide ella y no preguntes.",
    "2. En la zona de duda pregunta por la puerta común `decidir.py` con un estado breve (lo que ves, no todo) y `--regla` = lo que harías sin Jev.",
    "3. Umbrales: sigue a Jev solo con p ≥ 0,8 (o ≤ 0,2 para el no); entre medias manda tu regla. Jev puede VETAR una acción cara; nunca convierte en SÍ un NO de la regla.",
    "4. Anota «jev: p=0,83 (medio)» junto a tu decisión; cuando sepas si acertó, `decidir.py confirmar <exp> --acierto si|no` (así aprende la conciencia colectiva).",
    "5. Coste ≈ $0,00002 por decisión, con techo diario (`decidir.py uso`). Si calla («medio: regla»), sigues con tu regla: nunca esperes a Jev.",
]

PROTOCOLO_COMPACTO = (
    "Tu regla primero. En la duda: `python3 scripts/puente/decidir.py si-no --estado '<json breve>' "
    "--pregunta \"¿…?\" --regla <lo que harías sin Jev> --quien <tú>` (también `elegir --opciones a,b` y "
    "`puntuar --niveles …`). Sigue a Jev solo con p ≥ 0,8 (≤ 0,2 para el no); si calla, tu regla. "
    "Anota «jev: p=…» junto a la decisión."
)

ORDEN = {
    "escritor": ("reglas", "protocolo", "herramientas", "area", "relevo"),
    "revisor": ("reglas", "area", "protocolo", "herramientas"),
    "analista": ("reglas", "area", "protocolo", "herramientas"),
    "supervisor": ("reglas", "protocolo", "herramientas", "area", "relevo"),
    "subagente": ("reglas", "protocolo", "herramientas", "relevo", "area"),
}

_SECRETOS = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgsk_[A-Za-z0-9]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bnvapi-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
    re.compile(r"(?i)(?<=bearer )[A-Za-z0-9._\-]{20,}"),
]


def sanear(texto):
    t = texto or ""
    for p in _SECRETOS:
        t = p.sub("[REDACTADO]", t)
    return t


def _ruta_de_fuente(fuente):
    return fuente.split(" · ", 1)[0].strip()


def _para(roles, rol):
    return rol in roles


# ─────────────────────────────── áreas ───────────────────────────────

def _extras_y_raices():
    """Áreas extra y raíces de código de `suenos_areas` (una sola verdad); vacío si no está."""
    try:
        import suenos_areas as _sa

        return list(_sa.AREAS_EXTRA), dict(_sa.RAICES)
    except Exception:
        return [], {}


def areas_de(texto_ts, extras=()):
    """{id: {nombre, descripcion, documentos, rutas}} desde el texto de areas.ts + extras. PURA."""
    fuera = {}
    m = re.search(r"AREAS_TRABAJO[^=]*=\s*\[", texto_ts or "")
    if m:
        cuerpo = texto_ts[m.end():]
        fin = re.search(r"^\];", cuerpo, re.M)
        cuerpo = cuerpo[:fin.start()] if fin else cuerpo
        pos = [x.start() for x in re.finditer(r"\bid:\s*\"", cuerpo)]
        for i, ini in enumerate(pos):
            b = cuerpo[ini:pos[i + 1] if i + 1 < len(pos) else len(cuerpo)]
            ident = re.match(r"id:\s*\"([^\"]+)\"", b)
            if not ident:
                continue
            nombre = re.search(r"nombre:\s*\"([^\"]*)\"", b)
            desc = re.search(r"descripcion:\s*\"([^\"]*)\"", b, re.S)
            docs = re.search(r"documentos:\s*\[([^\]]*)\]", b, re.S)
            fuera[ident.group(1)] = {
                "nombre": nombre.group(1) if nombre else ident.group(1),
                "descripcion": " ".join((desc.group(1) if desc else "").split()),
                "documentos": re.findall(r"\"([^\"]+)\"", docs.group(1)) if docs else [],
                "rutas": re.findall(r"href:\s*\"([^\"]+)\"", b),
            }
    for a in extras or ():
        if a.get("id") and a["id"] not in fuera:
            fuera[a["id"]] = {"nombre": a.get("nombre") or a["id"], "descripcion": a.get("descripcion") or "",
                              "documentos": list(a.get("documentos") or []), "rutas": list(a.get("rutas") or [])}
    return fuera


def area_de_texto(texto, raices):
    """El área cuyo código nombra el texto (la raíz más larga que aparezca), o None. PURA."""
    t = texto or ""
    mejor, largo = None, 0
    for area, prefijos in (raices or {}).items():
        for p in prefijos:
            if p and p in t and len(p) > largo:
                mejor, largo = area, len(p)
    return mejor


# ─────────────────────────────── secciones ───────────────────────────────

def seccion_reglas(rol, compacto=False):
    """Las del rol primero y las de todos después: si el tope corta, corta lo común."""
    lineas = ["## Reglas permanentes (mandan sobre tu criterio)"]
    propias = [r for r in REGLAS if r[1] is not TODOS and _para(r[1], rol)]
    comunes = [r for r in REGLAS if r[1] is TODOS]
    for _id, roles, regla, fuente in propias + comunes:
        lineas.append("- %s" % regla if compacto else "- %s _(%s)_" % (regla, fuente))
    return "\n".join(lineas)


def seccion_protocolo(rol, compacto=False):
    lineas = ["## Cómo se decide (protocolo Jev)"] + ([PROTOCOLO_COMPACTO] if compacto else list(PROTOCOLO))
    if rol == "analista":
        # Al analista le llega hecho: el orquestador ya pasa sus observaciones por Jev.
        lineas = ["## Cómo se decide (protocolo Jev)",
                  "Tus observaciones pasan por un triaje de Jev (¿accionable? p · valor) antes de la síntesis: "
                  "sé concreto y cita archivo:línea; lo genérico se cae. Jev es consejero: si calla, pasa todo."]
    return "\n".join(lineas)


def seccion_herramientas(rol, existe, compacto=False):
    lineas = ["## Herramientas (orden exacta)"]
    for _id, roles, orden, para, archivo in HERRAMIENTAS:
        if not _para(roles, rol):
            continue
        if archivo and not existe(archivo):
            continue  # honestidad: no se ofrece lo que no está
        if compacto and _id == "decidir":
            continue  # en compacto la orden ya va en el protocolo
        lineas.append("- `%s`" % orden if compacto else "- `%s` — %s" % (orden, para))
    return "\n".join(lineas) if len(lineas) > 1 else ""


def seccion_area(area, areas, raices, existe):
    if not area:
        return ""
    a = areas.get(area)
    if not a:
        conocidas = ", ".join(sorted(areas)) or "ninguna"
        return "## Tu área\n«%s» no está en %s (conocidas: %s)." % (area, AREAS_TS, conocidas)
    lineas = ["## Tu área: %s (`%s`)" % (a["nombre"], area)]
    if a.get("descripcion"):
        lineas.append(a["descripcion"])
    docs = [d for d in a.get("documentos") or [] if existe(d)]
    if docs:
        lineas.append("Documentos que mandan: " + ", ".join("`%s`" % d for d in docs))
    if a.get("rutas"):
        lineas.append("Rutas de la app: " + ", ".join(a["rutas"][:6]))
    codigo = [r for r in (raices.get(area) or []) if existe(r)]
    if codigo:
        lineas.append("Código: " + ", ".join("`%s`" % r for r in codigo[:8]))
    return "\n".join(lineas)


def seccion_relevo(texto):
    if not texto:
        return ""
    trozo = texto.split("## Proyecto")[0].strip()
    if not trozo:
        return ""
    return "## Dónde vamos (relevo)\n" + trozo[:900]


def _recortar(texto, n):
    if len(texto) <= n:
        return texto
    corte = texto.rfind("\n", 0, max(0, n - 2))
    return (texto[:corte] if corte > n // 2 else texto[:max(0, n - 2)]) + "\n…"


def construir(rol, area=None, tarea="", max_chars=MAX_POR_DEFECTO, leer=None, existe=None, excluir=(),
              extras=None, raices=None):
    """El contexto común de un agente (markdown) y sus metadatos. PURA con `leer`/`existe`.

    Devuelve {texto, rol, area, secciones, recortadas, caracteres}. `area` puede inferirse de
    la tarea (si nombra una ruta de código de un área)."""
    if rol not in ROLES:
        raise ValueError("rol desconocido: %s (%s)" % (rol, " | ".join(ROLES)))
    leer = leer or (lambda ruta: None)
    existe = existe or (lambda ruta: False)
    if extras is None or raices is None:
        e, r = _extras_y_raices()
        extras = e if extras is None else extras
        raices = r if raices is None else raices
    areas = areas_de(leer(AREAS_TS) or "", extras)
    area = area or area_de_texto(tarea, raices)
    max_chars = max(400, int(max_chars or MAX_POR_DEFECTO))
    compacto = max_chars < COMPACTO_BAJO
    cabecera = "# Contexto común · rol %s%s\n_El mismo para todos los agentes (scripts/puente/contexto_agente.py)._" % (
        rol, (" · área %s" % area) if area else "")
    if tarea:
        cabecera += "\nTAREA: " + " ".join(str(tarea).split())[:300]
    piezas = {
        "reglas": lambda: seccion_reglas(rol, compacto),
        "protocolo": lambda: seccion_protocolo(rol, compacto),
        "herramientas": lambda: seccion_herramientas(rol, existe, compacto),
        "area": lambda: seccion_area(area, areas, raices, existe),
        "relevo": lambda: seccion_relevo(leer(RELEVO)),
    }
    partes, puestas, recortadas = [cabecera], [], []
    usado = len(cabecera)
    for nombre in ORDEN[rol]:
        if nombre in excluir:
            continue
        texto = sanear(piezas[nombre]() or "")
        if not texto:
            continue
        queda = max_chars - usado - 2
        if queda < 160:
            recortadas.append(nombre)
            continue
        if len(texto) > queda:
            texto = _recortar(texto, queda)
            recortadas.append(nombre)
        partes.append(texto)
        puestas.append(nombre)
        usado += len(texto) + 2
    salida = sanear("\n\n".join(partes))[:max_chars]
    return {"texto": salida, "rol": rol, "area": area or "", "secciones": puestas, "recortadas": recortadas,
            "caracteres": len(salida), "compacto": compacto}


def texto(rol, area=None, tarea="", max_chars=MAX_POR_DEFECTO, raiz=None, excluir=()):
    """Atajo con el disco del repo (lo que usan el orquestador y la CLI). Nunca lanza: sin
    repo o con un error, devuelve ""."""
    raiz = raiz or RAIZ

    def leer(ruta):
        try:
            with open(os.path.join(raiz, ruta), encoding="utf-8", errors="replace") as f:
                return f.read()
        except OSError:
            return None

    try:
        return construir(rol, area, tarea, max_chars, leer, lambda r: os.path.exists(os.path.join(raiz, r)),
                         excluir)["texto"]
    except Exception:
        return ""


def main(argv=None, salida=None):
    salida = salida or sys.stdout
    ap = argparse.ArgumentParser(prog="contexto_agente.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rol", required=True, choices=ROLES)
    ap.add_argument("--area", default=None)
    ap.add_argument("--tarea", default="")
    ap.add_argument("--max", type=int, default=MAX_POR_DEFECTO)
    ap.add_argument("--excluir", default="", help="secciones a omitir: reglas,protocolo,herramientas,area,relevo")
    ap.add_argument("--raiz", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    raiz = a.raiz or RAIZ

    def leer(ruta):
        try:
            with open(os.path.join(raiz, ruta), encoding="utf-8", errors="replace") as f:
                return f.read()
        except OSError:
            return None

    d = construir(a.rol, a.area, a.tarea, a.max, leer, lambda r: os.path.exists(os.path.join(raiz, r)),
                  tuple(x.strip() for x in a.excluir.split(",") if x.strip()))
    salida.write((json.dumps(d, ensure_ascii=False, indent=1) if a.json else d["texto"]) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
