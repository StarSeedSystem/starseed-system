# -*- coding: utf-8 -*-
"""Revisar las ramas de la nube que main ya superó: rescatar lo útil, archivar, aprender y borrar
(2026-10-06).

Alex (2026-10-05/06): «realiza una revisión y reactivación y si es necesario regeneración,
adaptación o transformación a las que sean útiles y funcionales en sus contextos y borra las
demás, toma nota para aprender de todo y que nada sea desperdiciado y se entienda y transforme
el propósito de cada rama» · «utiliza mucho Jev … para esa revisión y las próximas también».

`traer_nube.py` trae lo integrado y repara lo que quedó a medias; lo que main ya hizo por otro
camino queda «superada» y antes solo se anunciaba. La primera revisión a mano (72 ramas) enseñó
que esas ramas casi nunca traen código que main no tenga, pero SÍ pruebas: casos que la prueba de
main no cubre (18 tareas de rescate de 72 ramas). Esta pasada lo hace sola en cada vuelta:

1. Por cada rama superada sin revisar, mira sus archivos de prueba frente a los de main y saca
   los casos con título nuevo (ni igual ni parecido: Jaccard de palabras < 0,5).
2. Decide con la REGLA (≥ 3 casos nuevos → rescatar; si no, archivar) y pregunta a Jev
   (`decidir.consultar`, dominio «ramas-nube»). Jev solo cambia la regla con p ≥ 0,8 y nunca
   hacia archivar: veta perder, no da permiso para borrar.
3. Rescatar = una tarea en `cola-rescate-nube.json` con el código de los casos en el prompt (el
   agente no ve la rama): los añade a la prueba de main SOLO si cubren algo nuevo, adaptados a la
   API de hoy; si ninguno aporta, `NO APLICA`.
4. Archiva SIEMPRE antes de borrar: `refs/archivo/<rama>` en el repo de la Mac (verificado contra
   el sha del remoto) y un paquete `starseed_memory_root/archivo/ramas-nube-<fecha>.bundle`.
5. Anota el aprendizaje (propósito, por qué no llegó, qué se rescató, decisión y Jev) en
   `starseed_memory_root/archivo/aprendizaje-ramas-nube.jsonl` y en el Chat Director.
6. Borra del remoto solo lo archivado y verificado (permiso permanente de Alex del 2026-10-06).

Decisiones PURAS con sus pruebas en `test_revisar_ramas_nube.py`.

Uso: python3 revisar_ramas_nube.py [revisar] [--aplicar] [--json]
     python3 revisar_ramas_nube.py archivar --ramas nube/1/ola/X …     (sin borrar)
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import unicodedata

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import traer_nube as T  # noqa: E402  (git, json, cerrojos, progreso y colas)

ARCHIVO = os.path.join(T.RAIZ, "starseed_memory_root", "archivo")
APRENDIZAJE = os.path.join(ARCHIVO, "aprendizaje-ramas-nube.jsonl")
COLA_RESCATE = os.path.join(T.OLAS, "cola-rescate-nube.json")
OLA_RESCATE = "Rescate de las ramas de la nube"
MIN_CASOS = 3
UMBRAL_JEV = 0.8
TOPE_CODIGO = 9000
PRUEBA = re.compile(r"(\.test\.tsx?$|(^|/)test_[^/]+\.py$)")
_TS = re.compile(r"^(\s*)(?:it|test)(?:\.each\([^)]*\))?\(\s*([`\"'])(.*?)\2", re.M)
_PY = re.compile(r"^(\s*)def (test_\w+)", re.M)


# ── decisiones puras ────────────────────────────────────────────────────────────

def es_prueba(ruta):
    return bool(PRUEBA.search(ruta or ""))


def titulos(texto, archivo):
    """Títulos de los casos de un archivo de prueba (vitest o unittest)."""
    if archivo.endswith(".py"):
        return [m.group(2) for m in _PY.finditer(texto or "")]
    return [m.group(3) for m in _TS.finditer(texto or "")]


def bloques(texto, archivo):
    """{título: código del caso}, cortando por sangría (lo justo para dárselo a un agente)."""
    lineas = (texto or "").split("\n")
    rx = _PY if archivo.endswith(".py") else _TS
    salida = {}
    for i, linea in enumerate(lineas):
        m = rx.match(linea)
        if not m:
            continue
        sangria = len(m.group(1))
        titulo = m.group(2) if archivo.endswith(".py") else m.group(3)
        j = i + 1
        while j < len(lineas):
            s = lineas[j]
            if s.strip() and len(s) - len(s.lstrip()) <= sangria:
                if not archivo.endswith(".py") and s.strip().startswith("}"):
                    j += 1
                break
            j += 1
        salida[titulo] = "\n".join(lineas[i:j]).rstrip()
    return salida


def _palabras(t):
    """Palabras de más de 2 letras, sin acentos («números» y «numeros» son la misma)."""
    plano = unicodedata.normalize("NFKD", (t or "").lower())
    plano = "".join(c for c in plano if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]+", plano) if len(w) > 2}


def equivalente(titulo, otros, umbral=0.5):
    """¿Hay en `otros` un título que dice lo mismo con otras palabras?"""
    a = _palabras(titulo)
    if not a:
        return titulo in otros
    for o in otros:
        b = _palabras(o)
        if b and len(a & b) / len(a | b) >= umbral:
            return True
    return False


def casos_nuevos(texto_rama, texto_main, archivo):
    """[(título, código)] de la rama que la prueba de main no tiene (ni parecido)."""
    en_main = titulos(texto_main, archivo)
    codigo = bloques(texto_rama, archivo)
    vistos, salida = set(), []
    for t in titulos(texto_rama, archivo):
        if t in vistos or t in en_main or equivalente(t, en_main):
            continue
        vistos.add(t)
        salida.append((t, codigo.get(t, "")))
    return salida


def id_rescate(tid, conocidos):
    """`RT<base>` y, si ya existe, su sucesor (`RT<base>b`, `…c`)."""
    rid = "RT" + T.base_de(tid)
    return rid if rid not in conocidos else T.siguiente_id(rid, conocidos)


CERRADOS = {"sustituida", "descartada", "duplicada", "commit", "hecho", "integrada", "rechazada", "informe"}


def cadena_viva(tid, progreso):
    """PURA: ids de la MISMA cadena (`X`, `Xb`, `Xc`…) que siguen abiertos. Si hay alguno, esa
    tarea lleva el trabajo y rescatar pruebas de una rama vieja suya solo lo duplica (2026-10-06:
    RTRSC1006Q, Qb, Qc y RTRSC1006S salieron de ramas viejas de RSC1006Q/S mientras RSC1006Qe y Se
    seguían vivas)."""
    if not tid:
        return []
    base = T.base_de(tid)
    vivos = []
    for k, v in (progreso or {}).items():
        if k != base and T.base_de(k) != base:
            continue
        estado = v.get("estado") if isinstance(v, dict) else v
        if estado not in CERRADOS:
            vivos.append(k)
    return sorted(vivos)


def regla(n_casos, minimo=MIN_CASOS):
    return "rescatar" if n_casos >= minimo else "archivar"


def con_jev(base, d, umbral=UMBRAL_JEV, perder=("archivar", "no")):
    """(final, motivo). Jev cambia la regla solo con p ≥ umbral y nunca hacia perder."""
    d = d if isinstance(d, dict) else {}
    r, p = d.get("respuesta"), d.get("p")
    if d.get("medio") in (None, "regla") or r is None:
        return base, "regla (Jev calló)"
    pt = ("%.2f" % p) if isinstance(p, (int, float)) else "?"
    if r == base:
        return base, "regla y Jev coinciden (p=%s)" % pt
    if r in perder:
        return base, "Jev prefería «%s» (p=%s), pero Jev no puede llevar a perder: manda la regla" % (r, pt)
    if isinstance(p, (int, float)) and p >= umbral:
        return r, "Jev veta la regla con p=%s" % pt
    return base, "Jev prefería «%s» con p=%s < %.1f: manda la regla" % (r, pt, umbral)


def tarea_rescate(nuevo_id, tid, rama, titulo, por_archivo, motivo, tope=TOPE_CODIGO):
    """Tarea autosuficiente: el agente no ve la rama, así que el código va en el prompt.
    `por_archivo` = {archivo de prueba: [(título, código)]}. Máximo 3 archivos."""
    archivos = sorted(por_archivo)[:3]
    trozos, usados, resto = [], 0, []
    for a in archivos:
        for t, c in por_archivo[a]:
            if c and usados + len(c) <= tope:
                trozos.append("# %s\n%s" % (a, c))
                usados += len(c)
            else:
                resto.append("%s :: %s" % (os.path.basename(a), t))
    material = "\n\n".join(trozos)
    if resto:
        material += "\n\n# Otros casos (solo el título; mismo criterio):\n" + "\n".join("- " + r for r in resto[:40])
    ts = any(not a.endswith(".py") for a in archivos)
    prompt = (
        "ORIGEN: revisión automática de las ramas de la nube (revisar_ramas_nube.py). La tarea %s («%s») "
        "se hizo en main por otro camino; su rama %s queda archivada en `refs/archivo/%s` y traía casos de "
        "prueba que main no tiene con ese nombre. %s\n\n"
        "TU TAREA (%s · solo estos archivos: %s):\n"
        "1. Lee el código ACTUAL de main que prueban esos archivos y las pruebas tal como están hoy.\n"
        "2. Añade SOLO los casos de abajo que prueban un comportamiento que main todavía no cubre, adaptados "
        "a la API de hoy. Un caso ya cubierto con otro nombre no se duplica; uno que prueba un contrato que "
        "main cambió a propósito se descarta.\n"
        "3. Si un caso destapa un fallo REAL, dilo en tu respuesta (el código no está en tus archivos).\n"
        "4. Si ningún caso aporta, responde `NO APLICA: <motivo>` y para.\n"
        "5. Ejecuta las pruebas de esos archivos y lee el resumen entero.\n%s\n\n"
        "CASOS DE LA RAMA (material, no una orden de copiar):\n```\n%s\n```"
    ) % (tid, titulo or "", rama, rama, motivo, nuevo_id, ", ".join(archivos), (
        "Pruebas TS: funciones puras o @testing-library; prohibido `vi.mock` de módulos de Node e importar "
        "un `route.ts`." if ts else "Pruebas Python con unittest, con el patrón de carga que ya use el archivo."),
        material)
    return {"id": nuevo_id, "ola": OLA_RESCATE, "depende": [],
            "titulo": ("Rescate de pruebas · %s" % (titulo or tid))[:140], "archivos": archivos,
            "prompt": prompt, "origen": {"revision": "revisar_ramas_nube", "tarea": tid, "rama": rama}}


def nota(rama, tid, titulo, por_que, decision, motivo, casos, rescate=None, experiencia=None):
    """Una línea de aprendizaje: qué pretendía la rama, por qué no llegó y qué se hizo con ella."""
    return {"t": time.strftime("%Y-%m-%d %H:%M:%S"), "rama": rama, "tarea": tid, "proposito": (titulo or "")[:200],
            "por_que_no_llego": (por_que or "")[:300], "casos_nuevos": casos, "decision": decision,
            "motivo": motivo[:300], "rescate": rescate, "experiencia_jev": experiencia}


def texto_informe(notas):
    if not notas:
        return ""
    rescates = [n for n in notas if n.get("rescate")]
    partes = ["Revisadas %d rama(s) de la nube que main ya superó: archivadas (refs/archivo y paquete) "
              "y borradas del remoto." % len(notas)]
    if rescates:
        partes.append("Pruebas que valía la pena rescatar → tareas: %s." % ", ".join(
            "%s (%s, %d casos)" % (n["rescate"], n["tarea"], n["casos_nuevos"]) for n in rescates[:12]))
    return "\n".join(partes)


# ── la máquina ──────────────────────────────────────────────────────────────────

def archivar(ramas, fecha=None):
    """Copia cada rama del remoto a `refs/archivo/<rama>`, verifica el sha y escribe el paquete.
    Devuelve {archivadas: {rama: sha}, fallidas: [rama], paquete}."""
    ramas = [r for r in ramas if str(r).startswith(T.PREFIJO_RAMA)]
    if not ramas:
        return {"archivadas": {}, "fallidas": [], "paquete": None}
    _, remoto = T._git(["ls-remote", "origin"] + ["refs/heads/" + r for r in ramas], timeout=120)
    sha_remoto = {}
    for linea in remoto.splitlines():
        partes = linea.split()
        if len(partes) == 2 and partes[1].startswith("refs/heads/"):
            sha_remoto[partes[1][len("refs/heads/"):]] = partes[0]
    specs = ["+refs/heads/%s:refs/archivo/%s" % (r, r) for r in ramas if r in sha_remoto]
    if specs:
        T._git(["fetch", "-q", "origin", *specs], timeout=600)
    archivadas, fallidas = {}, []
    for r in ramas:
        _, sha = T._git(["rev-parse", "-q", "--verify", "refs/archivo/" + r])
        sha = sha.strip()
        if r in sha_remoto and sha == sha_remoto[r]:
            archivadas[r] = sha
        elif r not in sha_remoto and sha:
            archivadas[r] = sha  # ya borrada del remoto, pero archivada antes
        else:
            fallidas.append(r)
    paquete = None
    if archivadas:
        os.makedirs(ARCHIVO, exist_ok=True)
        paquete = os.path.join(ARCHIVO, "ramas-nube-%s.bundle" % (fecha or time.strftime("%Y-%m-%d")))
        # (2026-10-06) El paquete es ACUMULADO: todo `refs/archivo/nube/*`, no solo esta pasada.
        # Con un nombre por día y solo las ramas de la pasada, la siguiente del mismo día pisaba
        # el paquete de la revisión grande (72 ramas). `^main`: solo lo que main no tiene; para
        # recuperarlo basta un clon con main. El archivo principal son las refs (verificadas
        # arriba); el paquete es la copia portátil, así que si no se puede escribir (p. ej. todo
        # ya está en main y el paquete saldría vacío) no se pierde la pasada.
        rc, salida = T._git(["bundle", "create", paquete, "--glob=refs/archivo/nube", "^main"], timeout=600)
        if rc != 0:
            paquete = None
    return {"archivadas": archivadas, "fallidas": fallidas, "paquete": paquete}


def borrar_archivadas(archivadas):
    """push --delete SOLO de lo archivado cuyo sha sigue siendo el del remoto."""
    borradas, no = [], []
    for rama, sha in archivadas.items():
        rc, _ = T._git(["push", "-q", "origin", "--force-with-lease=refs/heads/%s:%s" % (rama, sha),
                        "--delete", rama], timeout=120)
        (borradas if rc == 0 else no).append(rama)
    return {"borradas": borradas, "no_borradas": no}


def _anotar(notas):
    if not notas:
        return
    os.makedirs(ARCHIVO, exist_ok=True)
    with open(APRENDIZAJE, "a", encoding="utf-8") as f:
        for n in notas:
            f.write(json.dumps(n, ensure_ascii=False) + "\n")


def _casos_de(rama_ref):
    """{archivo de prueba: [(título, código)]} nuevos de una rama frente a main."""
    _, base = T._git(["merge-base", rama_ref, "main"])
    _, nombres = T._git(["diff", "--name-only", base.strip() or "main", rama_ref])
    salida = {}
    for a in [n for n in nombres.splitlines() if es_prueba(n)]:
        _, txt_r = T._git(["show", "%s:%s" % (rama_ref, a)])
        rc, txt_m = T._git(["show", "main:%s" % a])
        nuevos = casos_nuevos(txt_r, txt_m if rc == 0 else "", a)
        if nuevos:
            salida[a] = nuevos
    return salida


def _consultar_jev(tid, titulo, por_archivo, base):
    try:
        import decidir
    except Exception:
        return {}
    estado = {"tarea": tid, "titulo": titulo, "regla": base,
              "casos_nuevos": {a: [t for t, _ in c][:20] for a, c in por_archivo.items()},
              "contexto": "La tarea se hizo en main por otro camino; decidimos si estos casos de prueba de su rama de "
                          "la nube se rescatan en main o se archivan."}
    try:
        return decidir.consultar("elegir", estado, "¿Rescatamos en main los casos de prueba de la rama, o solo se archivan?",
                                 opciones={"rescatar": "cubren comportamiento que main no prueba",
                                           "archivar": "son los mismos casos con otro nombre o un contrato viejo"},
                                 quien="director-nube", regla=base, dominio="ramas-nube")
    except Exception:
        return {}


def revisar(aplicar=False, borrar=True):
    """Una pasada sobre las superadas de traer_nube que aún no se revisaron."""
    if aplicar:
        try:
            with T._Cerrojo("revisar-ramas-nube", 0):
                return _revisar(True, borrar)
        except TimeoutError:
            return {"notas": [], "texto": "", "ocupado": "ya hay otra revisión en marcha"}
    return _revisar(False, borrar)


def _revisar(aplicar, borrar):
    estado = T._leer_json(T.ESTADO, {}) or {}
    revisadas = set(estado.get("revisadas") or [])
    pendientes = [s for s in estado.get("superadas") or [] if s.get("rama") and s["rama"] not in revisadas]
    titulos_cola = {tid: (t or {}).get("titulo", "") for tid, (_, t) in T._colas_por_id().items()}
    progreso = T._progreso()
    cola = T._leer_json(COLA_RESCATE, {"ola": OLA_RESCATE, "tareas": []})
    cola = cola if isinstance(cola, dict) else {"ola": OLA_RESCATE, "tareas": cola}
    conocidos = set(progreso) | set(titulos_cola) | {str(t.get("id")) for t in cola.get("tareas") or []}
    if aplicar:
        T._git(["fetch", "-q", "origin", "+refs/heads/nube/*:refs/remotes/origin/nube/*"], timeout=300)
    notas, nuevas_tareas, por_rama = [], [], {}
    for s in pendientes:
        por_rama.setdefault(s["rama"], []).append(s)
    for rama, filas in por_rama.items():
        ref = "refs/remotes/origin/" + rama
        casos = _casos_de(ref)
        for s in filas:
            tid = s.get("tid") or ""
            n = sum(len(v) for v in casos.values())
            vivos = cadena_viva(tid, progreso)
            if vivos:
                base, d = "archivar", {}
                final, motivo = "archivar", "la cadena sigue viva en %s: ella lleva el trabajo" % ", ".join(vivos[:4])
            else:
                base = regla(n)
                d = _consultar_jev(tid, titulos_cola.get(tid, ""), casos, base) if (aplicar and n) else {}
                final, motivo = con_jev(base, d)
            rescate = None
            if final == "rescatar" and casos and tid:
                rescate = id_rescate(tid, conocidos)
                conocidos.add(rescate)
                nuevas_tareas.append(tarea_rescate(rescate, tid, rama, titulos_cola.get(tid, ""), casos, motivo))
                casos = {}  # una rama con varias tareas: el material va una vez
            notas.append(nota(rama, tid, titulos_cola.get(tid, ""), s.get("motivo"), final, motivo, n, rescate,
                              d.get("experiencia")))
    resultado = {"notas": notas, "tareas": [t["id"] for t in nuevas_tareas]}
    if not aplicar:
        resultado["texto"] = texto_informe(notas)
        return resultado
    if nuevas_tareas:
        cola["tareas"] = (cola.get("tareas") or []) + nuevas_tareas
        T._escribir_json(COLA_RESCATE, cola)
        T._actualizar_progreso({t["id"]: {"estado": "pendiente", "nota": "rescate de pruebas de %s"
                                          % t["origen"]["rama"]} for t in nuevas_tareas})
    a = archivar(list(por_rama))
    b = borrar_archivadas(a["archivadas"]) if borrar else {"borradas": [], "no_borradas": []}
    _anotar([dict(x, archivada=x["rama"] in a["archivadas"], borrada=x["rama"] in b["borradas"]) for x in notas])
    estado = T._leer_json(T.ESTADO, {}) or {}
    estado["revisadas"] = sorted(set(estado.get("revisadas") or []) | set(a["archivadas"]))
    T._escribir_json(T.ESTADO, estado)
    texto = texto_informe([x for x in notas if x["rama"] in a["archivadas"]])
    if texto:
        T._avisar("Revisión de ramas de la nube:\n" + texto)
    resultado.update(texto=texto, archivo=a, borrado=b)
    return resultado


def main(argv):
    orden = argv[1] if len(argv) > 1 and not argv[1].startswith("--") else "revisar"
    if orden == "archivar":
        ramas = argv[argv.index("--ramas") + 1:] if "--ramas" in argv else []
        print(json.dumps(archivar(ramas), ensure_ascii=False, indent=1))
        return 0
    r = revisar(aplicar="--aplicar" in argv, borrar="--sin-borrar" not in argv)
    if "--json" in argv:
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        for n in r.get("notas") or []:
            print("%-9s %-12s %-44s %s" % (n["decision"], n["tarea"], n["rama"], n["motivo"]))
        if r.get("texto"):
            print("\n" + r["texto"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
