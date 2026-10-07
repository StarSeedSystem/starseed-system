#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""suenos_areas · el plan de los sueños profundos: áreas × lentes → tareas de análisis.

    python3 scripts/puente/suenos_areas.py [--areas rito,voz] [--lentes arquitectura-deuda]
                                           [--horas 4] [--fecha 2026-09-29] [--json]

POR QUÉ EXISTE (2026-09-29). Alex: «a través de Genesis orquesta una flota de agentes
de sueños profundos que pueda llevar varias horas, donde analicen a detalle cada área de todo
StarSeed OS para buscar mejoras y optimizaciones potenciales como recomendaciones para próximas
olas». El Dream de Hermes lee registros una vez al día; esto lee CÓDIGO, área por área y con
seis lentes distintas, y deja cada hallazgo citado (archivo:línea) para que Claude lo verifique.

Qué decide este módulo (y nada más):
  · qué áreas hay: las de `src/lib/mando/areas.ts` (AREAS_TRABAJO) + tres propias de la
    orquestación (mando, dashboards, gobernanza). Una prueba falla si se separan.
  · qué lee cada área: sus raíces en el repo (RAICES) y sus documentos de memoria.
  · con qué lentes: LENTES (la de seguridad es privada: solo en la Mac).
  · cuántas llamadas costará; `--horas` da la profundidad (archivos por área). El ritmo no
    lo pone el plan: lo ponen los cupos por minuto de cada proveedor.

Módulo PURO en su núcleo (`construir_plan` no abre archivos ni red); lo impuro —listar el
repo y leer areas.ts— está en funciones pequeñas aparte que la CLI y `suenos.py` usan.
Las tareas salen con `tipo: "analisis"`: el orquestador las delega en
`scripts/enjambre/analista.py` (sin worktree, sin tsc, sin integrar nada).
"""

import argparse
import datetime
import json
import math
import os
import re
import subprocess
import sys

RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_ENJAMBRE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "enjambre")
if _ENJAMBRE not in sys.path:
    sys.path.insert(0, _ENJAMBRE)
import analista as _analista  # noqa: E402  (lentes, tamaños de trozo: una sola verdad)
AREAS_TS = os.path.join("src", "lib", "mando", "areas.ts")

# Áreas de la orquestación que no están en la rejilla de áreas del OS pero sí son código vivo
# que merece soñarse. Si algún día entran en areas.ts, salen de aquí (la prueba lo exige).
AREAS_EXTRA = [
    {
        "id": "mando",
        "nombre": "Genesis y orquestación",
        "descripcion": "Genesis en localhost:9002, los directores en Python y el orquestador único del enjambre.",
        "documentos": ["memory/orquestacion-economica.md", "PUENTE-DE-MANDO.md"],
    },
    {
        "id": "dashboards",
        "nombre": "Dashboards y widgets",
        "descripcion": "Escritorios, dashboards arrastrables, widgets libres y su sincronización entre neuronas.",
        "documentos": ["design-system/starseed-system/MASTER.md"],
    },
    {
        "id": "gobernanza",
        "nombre": "Gobernanza y Hub",
        "descripcion": "Democracia directa, voto líquido, decisiones, comunidades del Hub y la ontocracia en código.",
        "documentos": ["memory/principles.md"],
    },
]
IDS_EXTRA = [a["id"] for a in AREAS_EXTRA]

# Dónde vive cada área en el repositorio (prefijos de ruta de `git ls-files`). Toda área de
# areas.ts DEBE tener entrada aquí: sin raíces, un sueño no tiene nada que leer.
RAICES = {
    "rito": ["src/app/(app)/bienvenida", "src/components/welcome", "src/components/onboarding",
             "src/lib/onboarding", "src/app/onboarding", "src/app/auth", "src/lib/auth"],
    "voz": ["src/app/(app)/voces", "src/lib/voces", "src/components/voces",
            "src/lib/aurora/voz-starseed", "src/app/api/voz", "native/astraura-voice"],
    "avatares": ["src/app/(app)/mundo-avatares", "src/lib/avatares", "src/components/avatares",
                 "src/lib/movimiento", "src/components/movimiento"],
    "laboratorio": ["src/app/(app)/laboratorio", "src/lib/laboratorio", "src/components/laboratorio"],
    "astraura": ["src/ai/astraura", "src/lib/astraura", "src/app/(app)/agent", "src/app/api/ai",
                 "src/components/astraura"],
    "social": ["src/app/(app)/network", "src/app/(app)/profile", "src/lib/social", "src/lib/feed",
               "src/lib/posts", "src/lib/profiles", "src/components/social", "src/components/posts",
               "src/components/profile"],
    "creacion": ["src/app/(app)/crear", "src/lib/creation", "src/components/creation",
                 "src/app/(app)/publish", "src/lib/publish", "src/app/(app)/store", "src/lib/store"],
    "biblioteca": ["src/app/(app)/library", "src/lib/library", "src/lib/library-store.ts",
                   "src/lib/library-sync.ts", "src/components/library"],
    "conexiones": ["src/ai/astraura/mesh", "src/app/(app)/red-mesh", "src/app/(app)/senales",
                   "src/components/connectivity", "src/components/mesh", "src/lib/network",
                   "src/lib/realtime", "src/lib/sync"],
    "nube": ["DESPLIEGUE.md", "Dockerfile", "cloudbuild.yaml", "vercel.json", "next.config.ts",
             "middleware.ts", "deploy", ".github/workflows", "scripts/puente/publicar.py"],
    "memoria": ["src/lib/memory-sync", "src/app/(app)/memorias", "memory"],
    "mando": ["src/lib/mando", "src/app/api/mando", "src/components/mando", "scripts/enjambre",
              "scripts/puente"],
    "dashboards": ["src/lib/dashboard", "src/lib/widgets", "src/lib/widget-data", "src/lib/widget-sync",
                   "src/lib/dashboards-sync.ts", "src/app/(app)/dashboard-compartido",
                   "src/components/widgets-libres", "src/components/dashboard"],
    "gobernanza": ["src/app/(app)/network/politics", "src/app/(app)/hub", "src/app/(app)/decisiones",
                   "src/lib/governance", "src/lib/hub", "src/components/governance", "src/components/hub",
                   "src/components/decisions"],
}
# Lo que una raíz ancha arrastra y pertenece a otra área.
EXCLUIR = {
    "social": ["src/app/(app)/network/politics"],
    "astraura": ["src/ai/astraura/mesh"],
}

# Las lentes viven en scripts/enjambre/analista.py: viajan con el orquestador (instalar.sh
# copia ese directorio a ~/.local/bin) y el analista las necesita todas para la lectura
# compartida. Aquí solo se importan: una sola definición.
LENTES = _analista.LENTES
IDS_LENTES = [l["id"] for l in LENTES]
LENTES_PRIVADAS = set(_analista.LENTES_PRIVADAS)

EXTENSIONES = (".ts", ".tsx", ".py", ".md", ".mjs", ".js", ".sql", ".css", ".sh", ".yml", ".yaml")
ARCHIVOS_SUELTOS = {"Dockerfile"}
# Nunca se lee (ni se manda a un modelo) nada que pueda llevar un secreto.
PATRON_SECRETO = re.compile(
    r"(^|/)(\.env[^/]*|.*\.pem|.*\.key|credenciales?[^/]*|secrets?[^/]*|id_rsa[^/]*)$", re.I
)

# Tamaño de un trozo de lectura y tope por archivo: los del analista (una sola verdad).
TROZO_CARACTERES = _analista.TROZO_CARACTERES
TOPE_POR_ARCHIVO = _analista.TOPE_POR_ARCHIVO
TOPE_ANALISIS_POR_DEFECTO = _analista.TOPE_ANALISIS_POR_DEFECTO
LATENCIA_MEDIA_S = 25.0


# ─────────────────────────────── áreas ───────────────────────────────

def leer_areas_ts(texto):
    """[{id, nombre, descripcion, documentos}] de `AREAS_TRABAJO` en areas.ts. PURA.

    Se parsea el texto (no se ejecuta TypeScript): cada bloque empieza en `id: "…"` y llega
    hasta el siguiente. Si el archivo cambia de forma y ya no se entiende, devuelve [] y la
    prueba de deriva se pone roja: mejor eso que soñar con una lista vieja."""
    if not texto:
        return []
    m = re.search(r"AREAS_TRABAJO[^=]*=\s*\[", texto)
    if not m:
        return []
    cuerpo = texto[m.end():]
    fin = re.search(r"^\];", cuerpo, re.M)
    if fin:
        cuerpo = cuerpo[:fin.start()]
    posiciones = [x.start() for x in re.finditer(r"\bid:\s*\"", cuerpo)]
    areas = []
    for i, ini in enumerate(posiciones):
        bloque = cuerpo[ini:posiciones[i + 1] if i + 1 < len(posiciones) else len(cuerpo)]
        ident = re.match(r"id:\s*\"([^\"]+)\"", bloque)
        if not ident:
            continue
        nombre = re.search(r"nombre:\s*\"([^\"]*)\"", bloque)
        desc = re.search(r"descripcion:\s*\"([^\"]*)\"", bloque, re.S)
        docs = re.search(r"documentos:\s*\[([^\]]*)\]", bloque, re.S)
        areas.append({
            "id": ident.group(1),
            "nombre": nombre.group(1) if nombre else ident.group(1),
            "descripcion": " ".join((desc.group(1) if desc else "").split()),
            "documentos": re.findall(r"\"([^\"]+)\"", docs.group(1)) if docs else [],
        })
    return areas


def areas_del_plan(areas_ts):
    """Las áreas de areas.ts, en su orden, y detrás las extra. Las extra que areas.ts ya
    trae no se repiten. PURA."""
    vistas = {a["id"] for a in areas_ts}
    fuera = [dict(a) for a in areas_ts]
    fuera += [dict(a) for a in AREAS_EXTRA if a["id"] not in vistas]
    for a in fuera:
        a["raices"] = list(RAICES.get(a["id"], []))
        a["excluir"] = list(EXCLUIR.get(a["id"], []))
    return fuera


def cargar_areas(raiz=RAIZ_REPO):
    """Lee areas.ts del repo y devuelve las áreas del plan (impuro: abre un archivo)."""
    try:
        with open(os.path.join(raiz, AREAS_TS), encoding="utf-8") as f:
            return areas_del_plan(leer_areas_ts(f.read()))
    except OSError:
        return areas_del_plan([])


# ─────────────────────────────── archivos ───────────────────────────────

def es_prueba(ruta):
    b = os.path.basename(ruta)
    return "__tests__" in ruta or ".test." in b or ".spec." in b or b.startswith("test_")


def legible(ruta):
    """¿Se puede mandar este archivo a un modelo gratuito? Nunca secretos, nunca binarios."""
    if PATRON_SECRETO.search(ruta):
        return False
    b = os.path.basename(ruta)
    return b in ARCHIVOS_SUELTOS or b.endswith(EXTENSIONES)


def _bajo(ruta, prefijo):
    prefijo = prefijo.rstrip("/")
    return ruta == prefijo or ruta.startswith(prefijo + "/")


def _prioridad_lente(lente_id):
    """Orden de relevancia de un archivo para una lente (menor = antes)."""
    def clave(par):
        ruta, tam = par
        prueba = es_prueba(ruta)
        if lente_id == "pruebas-fiabilidad":
            grupo = 0
        elif lente_id == "ux-accesibilidad-diseno":
            grupo = 0 if ruta.endswith((".tsx", ".css")) and not prueba else (2 if prueba else 1)
        elif lente_id == "seguridad-privacidad":
            servidor = "/api/" in ruta or ruta.endswith(("route.ts", "middleware.ts")) or "servidor" in ruta
            grupo = 0 if servidor and not prueba else (2 if prueba else 1)
        else:
            grupo = 1 if prueba else 0
        return (grupo, -tam, ruta)
    return clave


def archivos_del_area(area, archivos_repo, maximo, ids_lentes=None):
    """Qué leen los sueños de esta área. PURA. El MISMO conjunto para todas sus lentes.

    Por qué el mismo: la lectura (fase map) se comparte entre las seis lentes del área —un
    trozo se lee una vez con las seis a la vez y lo aprovechan los seis sueños—, y eso solo
    funciona si todos trocean los mismos archivos en el mismo orden.

    `archivos_repo`: {ruta_relativa: bytes} (de `git ls-files`). Primero los documentos que
    mandan sobre el área; luego el código de sus raíces, repartiendo los huecos por turnos
    entre las lentes, cada una con su orden de relevancia:
      · pruebas-fiabilidad: las pruebas cuentan igual que el código;
      · ux: primero los .tsx y .css;
      · seguridad: primero rutas de API, middleware y módulos de servidor;
      · el resto: el código antes que las pruebas.
    Dentro de cada grupo, los archivos grandes primero (más lógica que mirar). El resultado
    se devuelve ordenado por ruta: el orden de lectura no depende de quién lo pidió."""
    documentos = []
    for d in area.get("documentos") or []:
        if d in archivos_repo and legible(d) and d not in documentos:
            documentos.append(d)
    candidatos = []
    for ruta, tam in archivos_repo.items():
        if ruta in documentos or not legible(ruta):
            continue
        if not any(_bajo(ruta, r) for r in area.get("raices") or []):
            continue
        if any(_bajo(ruta, x) for x in area.get("excluir") or []):
            continue
        candidatos.append((ruta, int(tam or 0)))
    lentes = [l for l in IDS_LENTES if not ids_lentes or l in ids_lentes] or IDS_LENTES
    colas = [[r for r, _ in sorted(candidatos, key=_prioridad_lente(l))] for l in lentes]
    elegidos, vistos = list(documentos[:maximo]), set(documentos[:maximo])
    posiciones = [0] * len(colas)
    while len(elegidos) < maximo and any(p < len(c) for p, c in zip(posiciones, colas)):
        for i, cola in enumerate(colas):
            while posiciones[i] < len(cola) and cola[posiciones[i]] in vistos:
                posiciones[i] += 1
            if posiciones[i] < len(cola) and len(elegidos) < maximo:
                elegidos.append(cola[posiciones[i]])
                vistos.add(cola[posiciones[i]])
                posiciones[i] += 1
    return documentos[:maximo] + sorted(r for r in elegidos if r not in documentos)


def archivos_por_area(horas):
    """Más horas → sueño más hondo: 16 archivos por área hasta 1 h, +6 por hora, hasta 48."""
    h = max(0.0, float(horas or 0))
    return int(min(48, max(16, 16 + 6 * (h - 1))))


def caracteres_leidos(archivos, archivos_repo):
    return sum(min(TOPE_POR_ARCHIVO, int(archivos_repo.get(a, 0) or 0)) for a in archivos)


def trozos_estimados(caracteres):
    """Trozos de lectura (map) de un área: uno por TROZO_CARACTERES."""
    return max(1, int(math.ceil(caracteres / float(TROZO_CARACTERES))))


def pausa_entre_llamadas(llamadas_totales, horas, trabajadores, latencia_s=LATENCIA_MEDIA_S):
    """Segundos de pausa entre dos llamadas de UN trabajador para que el sueño dure `horas`.

    Sin horas (0) no hay pausa: se va tan rápido como dejen los cupos. Con horas, cada
    trabajador reparte sus llamadas en la ventana y descuenta lo que tarda cada una. Nunca
    negativo y nunca más de 15 min (un latido más lento que eso parecería un agente muerto)."""
    if not horas or llamadas_totales <= 0:
        return 0
    por_trabajador = float(llamadas_totales) / max(1, int(trabajadores or 1))
    ciclo = float(horas) * 3600.0 / max(1.0, por_trabajador)
    return int(max(0, min(900, round(ciclo - latencia_s))))


# ─────────────────────────────── plan ───────────────────────────────

def id_tarea(fecha, indice):
    """«SA» + MMDD + índice canónico (1…): estable para el mismo área×lente el mismo día, así
    un relanzamiento con otras áreas cae en la MISMA cola sin repetir ids. ≤ 9 caracteres."""
    n = "SA%s%d" % (fecha.strftime("%m%d"), int(indice))
    if not re.match(r"^[A-Za-z][A-Za-z0-9]{0,8}$", n):
        raise ValueError("id de sueño demasiado largo: %s" % n)
    return n


def prompt_de(area, lente, privado):
    """El encargo que viaja en la cola. Corto a propósito: el analista construye los prompts
    de verdad con el código leído; esto es lo que un humano lee en Genesis."""
    return (
        "SUEÑO PROFUNDO · análisis, NO escritura: no edites ningún archivo ni hagas commits.\n\n"
        "Analiza el área «%s» (%s) con la lente «%s»: %s.\n\n"
        "Preguntas guía:\n%s\n\n"
        "Cada hallazgo con cita archivo:línea, impacto (1-5), esfuerzo (1-5), confianza (0-1) y una "
        "propuesta de tarea para el enjambre de ≤3 archivos y ≤120 líneas por archivo. Lo ejecuta "
        "scripts/enjambre/analista.py (map → reduce → contraste con modelos gratuitos) y lo verifica "
        "un supervisor Claude.%s"
        % (
            area["nombre"], area.get("descripcion") or area["id"], lente["nombre"], lente["foco"],
            "\n".join("- " + p for p in lente["preguntas"]),
            "\n\n🔒 PRIVADO: el informe se queda en la Mac (ni bus, ni Telegram, ni nube)." if privado else "",
        )
    )


def construir_plan(areas, archivos_repo, fecha, horas=0, ids_areas=None, ids_lentes=None,
                   trabajadores=TOPE_ANALISIS_POR_DEFECTO, maximo_archivos=None):
    """El plan completo de una sesión de sueños. PURA.

    `areas`: salida de `areas_del_plan`; `archivos_repo`: {ruta: bytes}; `fecha`: date.
    `ids_areas`/`ids_lentes`: filtros (None = todas). Devuelve {sesion, ola, horas, tareas,
    llamadas, pausa_s, tope_analisis, desconocidas}. El índice de cada tarea es el canónico
    (área × lente en el orden completo), no el del filtro: así los ids no cambian."""
    ids_areas = [x for x in (ids_areas or []) if x]
    ids_lentes = [x for x in (ids_lentes or []) if x]
    conocidas_a = {a["id"] for a in areas}
    desconocidas = [x for x in ids_areas if x not in conocidas_a] + [x for x in ids_lentes if x not in IDS_LENTES]
    maximo = int(maximo_archivos or archivos_por_area(horas))
    sesion = fecha.isoformat()
    ola = "Sueños profundos %s" % sesion
    tareas = []
    llamadas = 0
    for ia, area in enumerate(areas):
        if ids_areas and area["id"] not in ids_areas:
            continue
        lentes = [l for l in LENTES if not ids_lentes or l["id"] in ids_lentes]
        archivos = archivos_del_area(area, archivos_repo, maximo, [l["id"] for l in lentes])
        if not archivos or not lentes:
            continue
        caracteres = caracteres_leidos(archivos, archivos_repo)
        trozos = trozos_estimados(caracteres)
        # La lectura es del área (una vez); la síntesis y el contraste, de cada lente.
        llamadas += trozos + 2 * len(lentes)
        for lente in lentes:
            il = IDS_LENTES.index(lente["id"])
            privado = lente["id"] in LENTES_PRIVADAS
            tareas.append({
                "id": id_tarea(fecha, ia * len(LENTES) + il + 1),
                "ola": ola,
                "titulo": "Sueño · %s × %s" % (area["nombre"], lente["nombre"]),
                "tipo": "analisis",
                "area": area["id"],
                "area_nombre": area["nombre"],
                "area_descripcion": area.get("descripcion") or "",
                "lente": lente["id"],
                "sesion": sesion,
                "privado": privado,
                "archivos": archivos,
                "depende": [],
                "prompt": prompt_de(area, lente, privado),
                "estimado": {
                    "caracteres": caracteres,
                    "trozos_area": trozos,
                    "llamadas": 2 + int(math.ceil(trozos / float(len(lentes)))),
                },
            })
    trab = max(1, int(trabajadores or 1))
    # (2026-09-29, primera sesión real) Sin pausa global: con 104 s entre llamadas, ocho
    # trabajadores iban a paso de uno (4 informes en 151 min). El ritmo lo pone el cupo por
    # minuto de CADA proveedor (llamar_llm) y el reparto por turnos del analista; `--horas`
    # solo decide la profundidad (archivos por área). `pausa_entre_llamadas` queda como
    # referencia de cuánto «cabría» esperar, no se aplica.
    pausa = 0
    for t in tareas:
        t["pausa_s"] = pausa
        t["tope_analisis"] = trab
    return {
        "sesion": sesion,
        "ola": ola,
        "horas": float(horas or 0),
        "archivos_por_area": maximo,
        "tareas": tareas,
        "llamadas": llamadas,
        "pausa_s": pausa,
        "tope_analisis": trab,
        "desconocidas": desconocidas,
    }


# ─────────────────────────────── impuro: el repo ───────────────────────────────

def listar_repo(raiz=RAIZ_REPO):
    """{ruta: bytes} de los archivos versionados (git ls-files). Sin git, un recorrido del
    disco limitado a las raíces conocidas."""
    fuera = {}
    try:
        salida = subprocess.run(["git", "ls-files", "-z"], cwd=raiz, capture_output=True,
                                text=True, timeout=60).stdout
        rutas = [r for r in salida.split("\0") if r]
    except Exception:
        rutas = []
    if not rutas:
        for raices in RAICES.values():
            for r in raices:
                base = os.path.join(raiz, r)
                if os.path.isfile(base):
                    rutas.append(r)
                for carpeta, subs, nombres in os.walk(base):
                    subs[:] = [s for s in subs if s not in ("node_modules", ".next", ".git")]
                    for n in nombres:
                        rutas.append(os.path.relpath(os.path.join(carpeta, n), raiz))
    for r in rutas:
        try:
            fuera[r] = os.path.getsize(os.path.join(raiz, r))
        except OSError:
            continue
    return fuera


def _lista(valor):
    return [x.strip() for x in (valor or "").split(",") if x.strip()]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--areas", default="")
    ap.add_argument("--lentes", default="")
    ap.add_argument("--horas", type=float, default=0)
    ap.add_argument("--fecha", default="")
    ap.add_argument("--trabajadores", type=int, default=TOPE_ANALISIS_POR_DEFECTO)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    fecha = datetime.date.fromisoformat(a.fecha) if a.fecha else datetime.date.today()
    plan = construir_plan(cargar_areas(), listar_repo(), fecha, a.horas, _lista(a.areas),
                          _lista(a.lentes), a.trabajadores)
    if a.json:
        print(json.dumps(plan, ensure_ascii=False, indent=1))
        return 0
    print("%s · %d tareas · ~%d llamadas · pausa %d s · %d archivos por área"
          % (plan["ola"], len(plan["tareas"]), plan["llamadas"], plan["pausa_s"], plan["archivos_por_area"]))
    for t in plan["tareas"]:
        print("  %-9s %-12s %-24s %3d archivos · ~%d llamadas%s" % (
            t["id"], t["area"], t["lente"], len(t["archivos"]), t["estimado"]["llamadas"],
            " · privado" if t["privado"] else ""))
    if plan["desconocidas"]:
        print("desconocidas (ignoradas): %s" % ", ".join(plan["desconocidas"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
