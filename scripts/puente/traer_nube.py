# -*- coding: utf-8 -*-
"""Traer a main el trabajo de la nube, y reparar (no borrar) lo que quedó a medias (2026-10-05).

Alex (18:40): «trae la nube y en vez de borrar ramas que se corrijan, arreglen y desarrollen
funcionalmente útil en su contexto con base a su propósito, a menos que sea contraproducente
por su contexto: se pregunta antes de borrar».

Lo que pasaba: cada job de GitHub Actions deja su trabajo en una rama `nube/<run>[/ola/<id>]`
del remoto, y `nube-gh.py traer` (lo único que lo trae a main) solo se corría a mano. Medido a
las 14:40: 66 ramas, con PRD1005L y PRD1005N integradas en la nube (pasaron sus puertas allí) y
fuera de main, y ~60 «salvavidas» (trabajo a medias que no pasó las puertas) sin que nadie las
mirase. La nube trabajaba y su trabajo no llegaba.

Una pasada (`revisar`), automática desde la autocuración del Mando cada 30 min:

1. **Traer** lo que la nube integró y main no tiene: `cherry-pick` de sus commits con el cerrojo
   `integrar` (el del orquestador) y, ANTES de quedarse, las mismas puertas que un agente en la
   Mac: `tsc` y las pruebas relacionadas con lo que cambia. Si no pasan, o hay conflicto, se
   deshace (`git reset --keep`, que no toca lo que haya sin commitear) y pasa a reparar.
2. **Reparar** lo que quedó a medias (o lo que no pasó al traerlo): una tarea sucesora en
   `cola-reparar-nube.json` que CONTINÚA desde la rama —trae sus commits, comprueba que cumple
   el propósito de la tarea en el contexto de hoy, corrige y completa— y la original queda
   «sustituida» con la pista. Nunca se reparan dos veces la misma tarea ni una que la Mac esté
   escribiendo ahora mismo.
3. **Preguntar** por lo que repararlo sería contraproducente: la tarea ya está en main (otra
   rama o la Mac la hizo), se sustituyó o descartó, ya figura como hecha, o es una propuesta de
   los sueños, que espera a una persona. Esas ramas NO se tocan ni se borran: se listan en el
   Chat Director con la pregunta, una vez. Borrar solo con `borrar --ramas …`, a mano y con la
   palabra de Alex (es un push al remoto).
4. **Revisar las superadas** (2026-10-06, `revisar_ramas_nube.py`, permiso permanente de Alex:
   «borra las demás… y las próximas también»): con `--aplicar`, después de traer y reparar,
   cada rama superada sin revisar se mira frente a main; las pruebas que main no tiene se
   rescatan como tarea (regla + Jev, que solo veta perder), la rama se ARCHIVA
   (`refs/archivo/…` + paquete en `starseed_memory_root/archivo/`), se anota lo aprendido y
   solo entonces se borra del remoto. `--sin-revision` lo salta.

Decisiones PURAS (`tid_de_asunto`, `decidir`, `elegir_por_tarea`, `siguiente_id`,
`tarea_reparacion`, `texto_informe`) con sus pruebas en `test_traer_nube.py`.

Uso: python3 traer_nube.py [revisar] [--aplicar] [--json]
     python3 traer_nube.py borrar --ramas nube/1/ola/X nube/2 …   (solo con la palabra de Alex)
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
COLA_REPARAR = os.path.join(OLAS, "cola-reparar-nube.json")
ESTADO = os.path.expanduser("~/.starseed/traer-nube.json")
CERROJOS = os.path.expanduser("~/.starseed/cerrojos")
PREFIJO_RAMA = "nube/"

#: Estados en que alguien DECIDIÓ que la tarea ya no se hace así: repararla sería contraproducente.
DECIDIDAS = {"sustituida", "descartada", "duplicada", "commit", "hecho", "integrada"}
#: La Mac la está escribiendo ahora, o la nube la tiene: se espera a la próxima pasada.
OCUPADAS = {"en_curso", "reasignada"}
PREFIJO_SUENOS = "cola-suenos-"

_ID = re.compile(r"·\s*([A-Za-z][A-Za-z0-9-]*\d[A-Za-z0-9-]*)\s*:")


# ── decisiones (puras) ──────────────────────────────────────────────────────────

def tid_de_asunto(asunto):
    """PURA: (tipo, id) de un commit de una rama de la nube.

    tipo: «reparto» (papeleo de la cola), «salvavidas» (trabajo del agente antes de las
    puertas), «ola» (la integración: pasó las puertas en la nube) u «otro». El id es el PRIMER
    «· ID:» con algún dígito: en «Ola 1005H · Producción: … · PRD1005L: …» es PRD1005L, no
    «Producción»."""
    a = (asunto or "").strip()
    if a.startswith("enjambre: reparto"):
        return "reparto", None
    m = _ID.search(a)
    tid = m.group(1) if m else None
    if a.startswith("salvavidas"):
        return "salvavidas", tid
    if tid and re.match(r"^(Ola\b|\d+\s*·)", a):
        return "ola", tid
    return "otro", tid


def decidir(tid, commits, en_main, estado, cola):
    """PURA. Qué hacer con el trabajo de UNA tarea en UNA rama: (accion, motivo).

    accion: «traer» | «reparar» | «superada» (se pregunta antes de tocarla) | «esperar».
    `commits`: [{tipo, nuevo, vacio}] de esa tarea en la rama."""
    estado = (estado or "").lower()
    if en_main:
        return "superada", "ya está en main (la integró la Mac u otra rama)"
    if estado in DECIDIDAS:
        return "superada", "en progreso figura «%s»: ya se decidió por otro camino" % estado
    if str(cola or "").startswith(PREFIJO_SUENOS):
        return "superada", "es una propuesta de los sueños: espera a una persona, no al enjambre"
    trabajo = [c for c in commits if c.get("tipo") in ("salvavidas", "ola", "otro")]
    if not any(c.get("nuevo") or c.get("tipo") == "ola" for c in trabajo):
        return "superada", "no aporta nada que main no tenga"
    if estado in OCUPADAS:
        return "esperar", "la tarea está «%s» ahora mismo: no se le pisa el trabajo" % estado
    if any(c.get("tipo") == "ola" for c in commits):
        return "traer", "la nube la integró (pasó sus puertas) y main aún no la tiene"
    return "reparar", "trabajo a medias que no pasó las puertas: se continúa desde la rama"


def elegir_por_tarea(entradas):
    """PURA. Si una tarea tiene trabajo en varias ramas, una sola se trae o se repara: la que
    trae la integración y, a igualdad, la más nueva. Las demás pasan a «superada» (otra rama
    de la misma tarea). `entradas`: [{rama, tid, accion, motivo, fecha}] → misma lista."""
    mejores = {}
    for e in entradas:
        if e["accion"] not in ("traer", "reparar"):
            continue
        clave = (e["accion"] == "traer", e.get("fecha") or "")
        actual = mejores.get(e["tid"])
        if actual is None or clave > (actual["accion"] == "traer", actual.get("fecha") or ""):
            mejores[e["tid"]] = e
    salida = []
    for e in entradas:
        mejor = mejores.get(e["tid"])
        if e["accion"] in ("traer", "reparar") and mejor is not e:
            e = dict(e, accion="superada", motivo="la misma tarea tiene trabajo más útil en %s" % mejor["rama"])
        salida.append(e)
    return salida


def base_de(tid):
    """PURA: el id base de una cadena de reintentos (como `obtenerBaseId` del Mando)."""
    return tid[:-1] if re.search(r"[A-Z0-9][b-z]$", tid) else tid


def siguiente_id(tid, conocidos):
    """PURA: el siguiente sucesor libre de la cadena (`LC1004B` → `LC1004Bb`, o la letra que
    siga a la última que exista)."""
    base = base_de(tid)
    letras = [i[-1] for i in conocidos if len(i) == len(base) + 1 and i.startswith(base) and i[-1] in "bcdefghijklmnopqrstuvwxyz"]
    letra = chr(max(ord(x) for x in letras) + 1) if letras else "b"
    if letra > "z":
        letra = "z"
    return base + letra


def tarea_reparacion(original, nuevo_id, rama, shas, archivos, motivo):
    """PURA: la sucesora que continúa desde la rama de la nube."""
    t = {k: v for k, v in (original or {}).items()
         if k not in ("estado", "nota", "motivo", "modelo", "rama_nube", "origen")}
    prompt = str(t.get("prompt") or "").split("\n## CONTINÚA DESDE LA NUBE")[0].rstrip()
    ref = "refs/remotes/origin/%s" % rama
    t.update(
        id=nuevo_id,
        origen="nube-reparar",
        rama_nube=rama,
        prompt=(
            "%s\n\n## CONTINÚA DESDE LA NUBE (rama `%s`)\n"
            "Un agente de la nube ya avanzó esta tarea (%s). No empieces de cero:\n"
            "1. Trae su trabajo a tu carpeta: `git fetch -q origin \"+refs/heads/%s:%s\"` y "
            "`git cherry-pick --no-commit %s`. Si hay conflictos (por ejemplo «add/add»: el archivo "
            "ya existe en main), mira la versión de la nube con `git show <sha>:<archivo>`, "
            "combínala A MANO con lo que main tiene hoy y deja el índice limpio (`git add` de cada "
            "archivo resuelto; `git status` sin «AA»/«UU»). Nunca `git checkout --theirs -- .`: "
            "pisaría lo que main ya tiene.\n"
            "2. Comprueba que cumple el PROPÓSITO de la tarea (arriba) en el contexto de hoy: "
            "corrige lo que falle, completa lo que falte y quita lo que sobre o ya no encaje.\n"
            "3. Archivos que tocó: %s.\n"
            "Deja tsc y las pruebas en verde, con pruebas nuevas para lo que arregles."
        ) % (prompt, rama, motivo, rama, ref, " ".join(shas), ", ".join(archivos) or "—"),
    )
    return t


def texto_informe(traidas, reparadas, superadas_nuevas, esperando):
    """PURA: el parte para el Chat Director (vacío si no pasó nada nuevo)."""
    partes = []
    if traidas:
        partes.append("Traído a main desde la nube (tsc y pruebas relacionadas en verde en la Mac): %s."
                      % ", ".join("%s (%s)" % (t["tid"], t["rama"]) for t in traidas))
    if reparadas:
        partes.append("A reparar desde su rama, como tarea sucesora: %s."
                      % ", ".join("%s → %s (%s)" % (r["tid"], r["nuevo"], r["motivo"]) for r in reparadas))
    if esperando:
        unicas = {}
        for e in esperando:
            unicas.setdefault(e["tid"], e["motivo"])
        partes.append("Esperan a la próxima pasada: %s."
                      % ", ".join("%s (%s)" % kv for kv in unicas.items()))
    if superadas_nuevas:
        # Agrupadas por tarea y motivo: 60 ramas se leen como una veintena de líneas.
        grupos = {}
        for s in superadas_nuevas:
            grupos.setdefault((s["tid"] or "?", s["motivo"]), []).append(s["rama"])
        lineas = ["- %s · %s (%s)" % (tid, motivo, ", ".join(ramas) if len(ramas) <= 2 else "%d ramas: %s…" % (len(ramas), ramas[0]))
                  for (tid, motivo), ramas in grupos.items()]
        partes.append("No las toco ni las borro: repararlas sería contraproducente. ¿Las borro del "
                      "remoto? (solo con tu palabra)\n" + "\n".join(lineas))
    return "\n".join(partes)


# ── la máquina ──────────────────────────────────────────────────────────────────

def _git(args, timeout=120):
    try:
        r = subprocess.run(["git", *args], cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


class _Cerrojo:
    """flock con espera acotada (el mismo archivo que usan el orquestador y commit-seguro)."""

    def __init__(self, nombre, espera_s):
        self.ruta = os.path.join(CERROJOS, nombre + ".lock")
        self.espera_s = espera_s
        self.f = None

    def __enter__(self):
        os.makedirs(CERROJOS, exist_ok=True)
        self.f = open(self.ruta, "a")
        t0 = time.time()
        while True:
            try:
                fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except BlockingIOError:
                if time.time() - t0 >= self.espera_s:
                    self.f.close()
                    self.f = None
                    raise TimeoutError("cerrojo %s ocupado" % self.ruta)
                time.sleep(2)

    def __exit__(self, *exc):
        if self.f:
            try:
                fcntl.flock(self.f, fcntl.LOCK_UN)
            finally:
                self.f.close()


def _colas_por_id():
    """{id: (nombre de la cola, tarea)} de las colas fuente (las vivas y colas-fuente/)."""
    import glob

    salida = {}
    rutas = sorted(glob.glob(os.path.join(OLAS, "cola-*.json")), key=os.path.getmtime, reverse=True)
    rutas += glob.glob(os.path.join(RAIZ, "starseed_memory_root", "colas-fuente", "cola-*.json"))
    rutas += sorted(glob.glob(os.path.join(RAIZ, "enjambre", "colas", "cola-nube-*.json")), reverse=True)
    for ruta in rutas:
        nombre = os.path.basename(ruta)
        d = _leer_json(ruta, [])
        tareas = d.get("tareas", d) if isinstance(d, dict) else d
        for t in tareas if isinstance(tareas, list) else []:
            if isinstance(t, dict) and t.get("id"):
                tid = str(t["id"])
                # La cola auto o nube es copia: manda la fuente; se queda la primera que no lo es.
                if tid not in salida or salida[tid][0].startswith(("cola-auto-", "cola-nube-")):
                    salida[tid] = (nombre, t)
    return salida


def inventario():
    """[{rama, tid, commits:[{sha, asunto, tipo, nuevo, vacio, archivos}], fecha}] de las ramas
    nube/* del remoto con algo que main no tenga."""
    _git(["fetch", "-q", "origin", "+refs/heads/nube/*:refs/remotes/origin/nube/*"], timeout=300)
    _, salida = _git(["for-each-ref", "--format=%(refname:short)|%(committerdate:iso8601)",
                      "refs/remotes/origin/nube/"])
    filas = []
    for linea in salida.splitlines():
        if "|" not in linea:
            continue
        ref, fecha = linea.split("|", 1)
        rama = ref.replace("origin/", "", 1)
        _, cherry = _git(["cherry", "main", ref])
        nuevos = {l[2:].strip() for l in cherry.splitlines() if l.startswith("+ ")}
        _, log = _git(["log", "--reverse", "--format=%H\t%s", "main.." + ref])
        por_tid = {}
        for l in log.splitlines():
            if "\t" not in l:
                continue
            sha, asunto = l.split("\t", 1)
            tipo, tid = tid_de_asunto(asunto)
            if tipo == "reparto":
                continue
            _, nombres = _git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha])
            archivos = [n for n in nombres.splitlines() if n.strip()]
            por_tid.setdefault(tid, []).append({"sha": sha, "asunto": asunto, "tipo": tipo,
                                                 "nuevo": sha in nuevos, "vacio": not archivos,
                                                 "archivos": archivos})
        # Lo que no lleva id propio (un arreglo suelto en la rama de una tarea) va con esa tarea.
        sueltos = por_tid.pop(None, [])
        if sueltos:
            m = re.search(r"/ola/([^/]+)$", rama)
            dueno = m.group(1) if m else (next(iter(por_tid), None))
            por_tid.setdefault(dueno, []).extend(sueltos)
        for tid, commits in por_tid.items():
            filas.append({"rama": rama, "tid": tid, "commits": commits, "fecha": fecha.strip()})
    return filas


def _progreso():
    p = _leer_json(PROGRESO, {})
    return p if isinstance(p, dict) else {}


def _actualizar_progreso(cambios):
    """Aplica {tid: {campos}} a progreso.json con el cerrojo de progreso y escritura atómica."""
    with _Cerrojo("progreso", 60):
        p = _progreso()
        for tid, campos in cambios.items():
            entrada = dict(p.get(tid) or {}) if isinstance(p.get(tid), dict) else {}
            entrada.update(campos)
            p[tid] = entrada
        _escribir_json(PROGRESO, p)


def _puertas(cambiados):
    """tsc + pruebas relacionadas, con el entorno y el turno de las puertas. (ok, detalle)."""
    import publicar
    import turno_pesado

    with turno_pesado.turno():
        rc, salida = publicar.correr(["npx", "tsc", "--noEmit"], timeout=1800)
        if rc != 0:
            return False, "tsc: " + salida[-600:]
        codigo = [c for c in cambiados if c.startswith("src/") and re.search(r"\.(ts|tsx)$", c)]
        if codigo:
            rc, salida = publicar.correr(["npx", "vitest", "related", "--run", "--maxWorkers=2",
                                          "--minWorkers=1", "--passWithNoTests", *codigo], timeout=1200)
            if rc != 0:
                return False, "pruebas: " + salida[-600:]
    return True, "tsc y pruebas relacionadas en verde"


def _traer(fila):
    """cherry-pick de la tarea en main + puertas. (ok, detalle). Deshace si no pasa."""
    _, orig = _git(["rev-parse", "HEAD"])
    orig = orig.strip()
    shas = [c["sha"] for c in fila["commits"] if c["nuevo"] or (c["tipo"] == "ola" and c["vacio"])]
    rc, salida = _git(["-c", "core.hooksPath=/dev/null", "cherry-pick", "--allow-empty",
                       "--keep-redundant-commits", *shas], timeout=300)
    if rc != 0:
        _git(["cherry-pick", "--abort"])
        _git(["reset", "-q", "--keep", orig])
        return False, "conflicto al traerla sobre el main de hoy: " + salida.strip()[-300:]
    _, cambiados = _git(["diff", "--name-only", orig, "HEAD"])
    ok, detalle = _puertas([c for c in cambiados.splitlines() if c.strip()])
    if not ok:
        _git(["reset", "-q", "--keep", orig])
        return False, "en la Mac no pasa: " + detalle
    return True, detalle


def _crear_reparacion(fila, motivo, colas, progreso):
    """Escribe la sucesora en cola-reparar-nube.json y marca la original. Devuelve el id nuevo."""
    original = (colas.get(fila["tid"]) or (None, {"id": fila["tid"]}))[1]
    conocidos = set(progreso) | set(colas)
    cola = _leer_json(COLA_REPARAR, {"ola": "Reparar lo que dejó la nube", "tareas": []})
    if isinstance(cola, list):
        cola = {"ola": "Reparar lo que dejó la nube", "tareas": cola}
    conocidos |= {str(t.get("id")) for t in cola.get("tareas") or [] if isinstance(t, dict)}
    nuevo = siguiente_id(fila["tid"], conocidos)
    trabajo = [c for c in fila["commits"] if c["nuevo"] and not c["vacio"]]
    archivos = sorted({a for c in trabajo for a in c["archivos"]})
    tarea = tarea_reparacion(original, nuevo, fila["rama"], [c["sha"][:12] for c in trabajo], archivos, motivo)
    cola["tareas"] = [tarea] + [t for t in cola.get("tareas") or [] if isinstance(t, dict) and t.get("id") != nuevo]
    _escribir_json(COLA_REPARAR, cola)
    _actualizar_progreso({
        fila["tid"]: {"estado": "sustituida", "nota": "continúa como %s desde la rama %s (traer_nube)"
                      % (nuevo, fila["rama"])},
        nuevo: {"estado": "pendiente", "adelantar": True,
                "nota": "reparación desde la nube: %s" % motivo[:200]},
    })
    return nuevo


def _avisar(texto):
    try:
        import director_chat

        director_chat.publicar(texto, de="director-nube", rol="director", tipo="informe")
    except Exception:
        pass


def revisar(aplicar=False, espera_integrar_s=60):
    """Una pasada. Sin `aplicar` solo dice lo que haría. Con `aplicar`, una sola a la vez."""
    if aplicar:
        try:
            with _Cerrojo("traer-nube", 0):
                return _revisar(True, espera_integrar_s)
        except TimeoutError:
            return {"traidas": [], "reparadas": [], "esperando": [], "superadas_nuevas": [],
                    "texto": "", "plan": [], "ocupado": "ya hay otra pasada de traer la nube en marcha"}
    return _revisar(False, espera_integrar_s)


def _revisar(aplicar, espera_integrar_s):
    estado = _leer_json(ESTADO, {}) or {}
    hechas_antes = estado.get("ramas") or {}
    anunciadas = set(estado.get("anunciadas") or [])
    progreso = _progreso()
    colas = _colas_por_id()
    _, asuntos = _git(["log", "main", "--format=%s"])
    from vigilante_logica import id_en_asuntos

    asuntos = asuntos.splitlines()
    entradas = []
    for fila in inventario():
        tid = fila["tid"]
        clave = "%s|%s" % (fila["rama"], tid)
        previa = hechas_antes.get(clave) or {}
        if previa.get("accion") in ("traida", "reparada"):
            continue
        entrada_p = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
        accion, motivo = decidir(tid, fila["commits"], bool(tid) and id_en_asuntos(tid, asuntos),
                                 entrada_p.get("estado"), (colas.get(tid) or ("", {}))[0])
        entradas.append(dict(fila, accion=accion, motivo=motivo, clave=clave))
    entradas = elegir_por_tarea(entradas)

    traidas, reparadas, esperando, superadas_nuevas = [], [], [], []
    if aplicar:
        try:
            with _Cerrojo("integrar", espera_integrar_s):
                for e in [x for x in entradas if x["accion"] == "traer"]:
                    ok, detalle = _traer(e)
                    if ok:
                        _actualizar_progreso({e["tid"]: {"estado": "commit", "nota": "traída de la nube (%s): %s"
                                                         % (e["rama"], detalle)}})
                        hechas_antes[e["clave"]] = {"accion": "traida", "t": time.strftime("%Y-%m-%d %H:%M:%S")}
                        traidas.append({"tid": e["tid"], "rama": e["rama"]})
                    else:
                        e["accion"], e["motivo"] = "reparar", detalle
        except TimeoutError:
            esperando += [{"tid": e["tid"], "motivo": "main ocupado (publicación o integración)"}
                          for e in entradas if e["accion"] == "traer"]
            entradas = [e for e in entradas if e["accion"] != "traer"]
        progreso = _progreso()
        for e in [x for x in entradas if x["accion"] == "reparar"]:
            nuevo = _crear_reparacion(e, e["motivo"], colas, progreso)
            progreso = _progreso()
            hechas_antes[e["clave"]] = {"accion": "reparada", "nuevo": nuevo, "t": time.strftime("%Y-%m-%d %H:%M:%S")}
            reparadas.append({"tid": e["tid"], "nuevo": nuevo, "motivo": e["motivo"][:160]})
    for e in entradas:
        if e["accion"] == "esperar":
            esperando.append({"tid": e["tid"], "motivo": e["motivo"]})
        elif e["accion"] == "superada" and e["clave"] not in anunciadas:
            superadas_nuevas.append({"rama": e["rama"], "tid": e["tid"], "motivo": e["motivo"]})

    texto = texto_informe(traidas, reparadas, superadas_nuevas, esperando if (traidas or reparadas) else [])
    if aplicar:
        estado.update(
            visto=time.strftime("%Y-%m-%d %H:%M:%S"), ramas=hechas_antes,
            anunciadas=sorted(anunciadas | {"%s|%s" % (s["rama"], s["tid"]) for s in superadas_nuevas}),
            superadas=[{"rama": e["rama"], "tid": e["tid"], "motivo": e["motivo"]}
                       for e in entradas if e["accion"] == "superada"],
        )
        _escribir_json(ESTADO, estado)
        if texto:
            _avisar("Traer la nube:\n" + texto)
    return {"traidas": traidas, "reparadas": reparadas, "esperando": esperando,
            "superadas_nuevas": superadas_nuevas, "texto": texto,
            "plan": [{k: e[k] for k in ("rama", "tid", "accion", "motivo")} for e in entradas]}


def borrar(ramas):
    """Borra del remoto SOLO las ramas nombradas, y solo si constan como superadas. Es un push:
    se corre a mano y con la palabra de Alex. Nunca la llama la autocuración."""
    superadas = {s["rama"] for s in (_leer_json(ESTADO, {}) or {}).get("superadas") or []}
    hechas, rechazadas = [], []
    for r in ramas:
        if not r.startswith(PREFIJO_RAMA) or r not in superadas:
            rechazadas.append(r)
            continue
        rc, _ = _git(["push", "-q", "origin", "--delete", r], timeout=120)
        (hechas if rc == 0 else rechazadas).append(r)
    return {"borradas": hechas, "no_borradas": rechazadas}


def main(argv):
    orden = argv[1] if len(argv) > 1 and not argv[1].startswith("--") else "revisar"
    if orden == "borrar":
        ramas = argv[argv.index("--ramas") + 1:] if "--ramas" in argv else []
        print(json.dumps(borrar(ramas), ensure_ascii=False))
        return 0
    r = revisar(aplicar="--aplicar" in argv)
    if "--aplicar" in argv and "--sin-revision" not in argv and not r.get("ocupado"):
        try:
            import revisar_ramas_nube

            r["revision"] = revisar_ramas_nube.revisar(aplicar=True)
        except Exception as e:  # noqa: BLE001 — revisar nunca tumba la pasada de traer
            r["revision"] = {"error": "%s: %s" % (type(e).__name__, e)}
    if "--json" in argv:
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        for p in r["plan"]:
            print("%-9s %-12s %-44s %s" % (p["accion"], p["tid"], p["rama"], p["motivo"]))
        if r["texto"]:
            print("\n" + r["texto"])
        rv = r.get("revision") or {}
        for n in rv.get("notas") or []:
            print("revisada  %-12s %-44s %s → %s" % (n["tarea"], n["rama"], n["decision"], n["motivo"]))
        if rv.get("error"):
            print("revisión de superadas: " + rv["error"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
