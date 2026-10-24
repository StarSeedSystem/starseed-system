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

Una pasada (`revisar`), automática desde la autocuración de Genesis cada 30 min:

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

Decisiones PURAS (`tid_de_asunto`, `decidir`, `libre_de_su_reasignacion`, `elegir_por_tarea`,
`siguiente_id`, `tarea_reparacion`, `texto_informe`) con sus pruebas en `test_traer_nube.py`.
Una «reasignada» a un run de nube-gh espera, salvo que la rama sea de OTRO medio y ese run ya no
esté vivo según la API (o, sin dato del run, la reasignación pase de 6 h): OPS1024E, 2026-10-24.

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

import vigia_runs_nube as VR  # noqa: E402 — la misma lectura de la reasignación que el vigía

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
#: (OPS1024E) Una reasignación a nube-gh de más de esto ya no la lleva ningún run (el job muere a las 6 h).
REASIGNADA_VIEJA_S = 6 * 3600

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


def run_de_rama(rama):
    """PURA. El run de GitHub de una rama `nube/<run>[/…]`, o None si es de otro medio
    (`nube/cr-<fecha>/ola/<ID>` de Cloudroom, `nube/a1-…` del A1)."""
    partes = str(rama or "").split("/")
    return partes[1] if len(partes) > 1 and partes[0] == "nube" and partes[1].isdigit() else None


def libre_de_su_reasignacion(rama, entrada, run_vivo, ahora):
    """PURA (OPS1024E). ¿La rama llega de OTRO medio que el de una reasignación a nube-gh que ya no
    lleva nadie? → el motivo (entra en las puertas normales) o None (se espera, como siempre).

    (2026-10-24, MEDIDO) CRM1024B/C/D llegaron hechas por Cloudroom (`nube/cr-20261024/ola/…`, pruebas
    en verde) y se quedaban «esperar» para siempre porque la tarea figuraba reasignada a un run de
    nube-gh que ya había terminado. `run_vivo`: True | False | None (sin dato) del run de la nota.
    Run vivo, o la rama ES la de ese run: se espera. Sin dato del run, solo con más de 6 h."""
    if not VR.es_reasignada_a_la_nube(entrada):
        return None
    run = VR.run_de_la_nota(entrada.get("nota"))
    de_la_rama = run_de_rama(rama)
    cambio = VR.ultimo_cambio(entrada)
    vieja = cambio is not None and ahora - cambio > REASIGNADA_VIEJA_S
    if run:
        if de_la_rama == run or run_vivo is True:
            return None
        if run_vivo is False:
            return "la reasignación apuntaba al run %s de nube-gh, que ya terminó, y esta rama es de otro medio" % run
        return ("la reasignación al run %s tiene más de 6 h, GitHub no da su estado y esta rama es de otro medio"
                % run) if vieja else None
    # Sin run en la nota no se sabe cuál la lleva: una rama de un run de GitHub podría ser la suya.
    if de_la_rama is None and vieja:
        return "la reasignación a la nube tiene más de 6 h y esta rama es de otro medio"
    return None


def decidir(tid, commits, en_main, estado, cola, libre=None):
    """PURA. Qué hacer con el trabajo de UNA tarea en UNA rama: (accion, motivo).

    accion: «traer» | «reparar» | «superada» (se pregunta antes de tocarla) | «esperar».
    `commits`: [{tipo, nuevo, vacio}] de esa tarea en la rama. `libre` (OPS1024E): el motivo de
    `libre_de_su_reasignacion`; con él, una «reasignada» no espera y entra en las puertas normales."""
    estado = (estado or "").lower()
    if en_main:
        return "superada", "ya está en main (la integró la Mac u otra rama)"
    if estado in DECIDIDAS:
        # (2026-10-12) «commit» que main no tiene: un director lo anotó leyendo un main a medio
        # comprobar. Si la rama trae la integración de la nube y trabajo que main no tiene, NO es
        # superada (se archivaba y se borraba: 11 tareas el 12-10): se trae, comprobada como siempre.
        trabajo_nuevo = any(x.get("nuevo") and x.get("tipo") in ("salvavidas", "ola", "otro") for x in commits)
        if (estado in ("commit", "hecho", "integrada") and trabajo_nuevo
                and any(x.get("tipo") == "ola" for x in commits)):
            return "traer", "progreso dice «%s» pero main no la tiene: se trae comprobada" % estado
        return "superada", "en progreso figura «%s»: ya se decidió por otro camino" % estado
    if str(cola or "").startswith(PREFIJO_SUENOS):
        return "superada", "es una propuesta de los sueños: espera a una persona, no al enjambre"
    trabajo = [c for c in commits if c.get("tipo") in ("salvavidas", "ola", "otro")]
    if not any(c.get("nuevo") or c.get("tipo") == "ola" for c in trabajo):
        return "superada", "no aporta nada que main no tenga"
    libre = libre if estado == "reasignada" else None
    if estado in OCUPADAS and not libre:
        return "esperar", "la tarea está «%s» ahora mismo: no se le pisa el trabajo" % estado
    extra = " (%s)" % libre if libre else ""
    if any(c.get("tipo") == "ola" for c in commits):
        return "traer", "la nube la integró (pasó sus puertas) y main aún no la tiene" + extra
    return "reparar", "trabajo a medias que no pasó las puertas: se continúa desde la rama" + extra


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
    """PURA: el id base de una cadena de reintentos (como `obtenerBaseId` de Genesis)."""
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


REPARACIONES_MAX = 3


def sucesores_en_cadena(tid, progreso):
    """PURA: los sucesores (`Xb`, `Xc`…) que ya existen en la cadena de `tid`, en orden."""
    base = base_de(tid)
    return sorted(k for k in (progreso or {}) if k != base and len(k) == len(base) + 1
                  and k.startswith(base) and k[-1] in "bcdefghijklmnopqrstuvwxyz")


def es_rescate(tid):
    """PURA: ¿es una tarea de rescate de pruebas (`RT…`, de revisar_ramas_nube)? Mismo criterio que
    `revisar_ramas_nube.profundidad_rescate` (que cuenta los `RT` de delante)."""
    return (tid or "").startswith("RT")


#: Cierre de la reparación de una tarea normal.
CIERRE_REPARACION = "Deja tsc y las pruebas en verde, con pruebas nuevas para lo que arregles."
#: (2026-10-20) Cierre de la reparación de un RESCATE (`%s` = los archivos propios de la tarea). Su
#: prompt original ya admite `NO APLICA` (paso 4), pero «con pruebas nuevas» se lo quitaba a la
#: sucesora, y RTOPO1011T1 (cuyos casos ya estaban en main, dos veces) acabó «bloqueada» tras b, c y d.
#: HIPÓTESIS coherente con el código (no se vieron los logs de las puertas de esos intentos): el
#: cierre no dejaba salida, y además la rama final llevaba archivos de otras tareas.
#: Decir `NO APLICA` no basta, y deshacer solo la carpeta tampoco: el orquestador da una tarea por
#: «sin cambios» únicamente si `git status --porcelain` sale vacío Y la rama no lleva commits por
#: delante de main (`starseed-enjambre.py`: con `main..HEAD` > 0 y diff dice «la rama ya lleva N
#: commit(s)… salto a las puertas» y la trata como una escritura). Y el vigilante guarda un punto de
#: control de todo trabajo a medias cada ~20 s (COL1012D, `commit_salvavidas`: `git add -A` + commit en
#: `ola/<id>`), así que a los pocos segundos del `cherry-pick --no-commit` del paso 1 el trabajo de la
#: nube ya está COMMITEADO en HEAD: `reset --hard HEAD` no deshace nada (porcelain vacío, pero
#: `main..HEAD` = 1). Por eso se vuelve a `main` (`reset --hard main`, que quita también esos commits) y
#: los archivos ajenos se devuelven con `checkout main --`, no con `checkout HEAD --`.
CIERRE_REPARACION_RESCATE = (
    "Si la rama no aporta nada que main no tenga ya (con ese nombre o con otro), responde "
    "`NO APLICA: <motivo>` y para: no inventes trabajo. ANTES de responderlo, deshaz todo lo que trajo "
    "el paso 1 con `git reset -q --hard main` (vuelve a main: borra los archivos preparados y también "
    "los commits de punto de control que el vigilante ya haya hecho con ese trabajo; `reset --hard "
    "HEAD` no basta) y comprueba DOS cosas: que `git status --porcelain` no imprime nada y que `git "
    "rev-list --count main..HEAD` da 0. El orquestador solo da la tarea por «sin cambios» con las dos; "
    "si queda algo preparado o la rama lleva commits por delante de main, la trata como una escritura, "
    "la pasa por las puertas y vuelve a pedir reparación.\n"
    "Si aporta algo, déjalo con tsc y las pruebas en verde y quédate solo con los archivos de esta "
    "tarea (%s): el paso 1 puede traer los de otra tarea (el «Archivos que tocó» de arriba es de la "
    "rama, no de la tarea); devuélvelos a como estaban en main (`git rm -rqf --ignore-unmatch -- "
    "<ruta>` si eran nuevos, `git checkout main -- <ruta>` si ya existían; no `git checkout HEAD`: "
    "el punto de control ya puede llevar la versión de la nube)."
)


def tarea_reparacion(original, nuevo_id, rama, shas, archivos, motivo):
    """PURA: la sucesora que continúa desde la rama de la nube."""
    t = {k: v for k, v in (original or {}).items()
         if k not in ("estado", "nota", "motivo", "modelo", "rama_nube", "origen")}
    prompt = str(t.get("prompt") or "").split("\n## CONTINÚA DESDE LA NUBE")[0].rstrip()
    ref = "refs/remotes/origin/%s" % rama
    cierre = (CIERRE_REPARACION_RESCATE % (", ".join(str(a) for a in t.get("archivos") or []) or "—")
              if es_rescate(nuevo_id) else CIERRE_REPARACION)
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
            "%s"
        ) % (prompt, rama, motivo, rama, ref, " ".join(shas), ", ".join(archivos) or "—", cierre),
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


def dueno_de_sueltos(rama, por_tid):
    """PURA: a qué tarea pertenecen los commits sin id de una rama, o None si a ninguna.

    (2026-10-12) Las ramas del A1 se llaman `nube/a1-<fecha>-<hora>-<ID>` (no `…/ola/<ID>`) y la
    rama de la cola entera (`nube/a1-<fecha>-<hora>`) a veces solo trae «chore(memoria): aprendizaje de
    la ola …», que no es de ninguna tarea. Antes eso daba una fila con id None y `traer_nube` moría
    en `base_de(None)` en CADA pasada (74 veces desde el 11-10 01:02 UTC): nada de la nube ni del A1
    se reparaba y el trabajo del A1 no llegaba a main."""
    m = re.search(r"/ola/([^/]+)$", rama) or re.search(r"^nube/a1-\d{8}-\d{6}-([A-Za-z0-9][A-Za-z0-9-]*)$", rama)
    if m:
        return m.group(1)
    return next(iter(por_tid), None)


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
            dueno = dueno_de_sueltos(rama, por_tid)
            if dueno:
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


#: Carpeta donde se comprueba lo que llega de la nube ANTES de tocar main (ver `_traer`).
CARPETA_COMPROBAR = os.path.join(os.path.dirname(RAIZ), "starseed-wt", "_traer")
#: tsc con memoria propia y sin revisar las librerías (como la puerta del orquestador y tsc-turno.sh).
#: (2026-10-12) Sin esto `npx tsc --noEmit` moría en la Mac de 8 GB con «JavaScript heap out of memory»
#: (el registro solo enseñaba `node::LoadEnvironment…`) y TODO lo que traía la nube iba a «reparar».
ORDEN_TSC = ["npx", "tsc", "--noEmit", "--skipLibCheck"]
MEMORIA_TSC = "--max-old-space-size=3072"
_SENALES_MEDIO = ("heap out of memory", "FATAL ERROR", "node::LoadEnvironment", "se pasó de", "Killed",
                  "ENOMEM", "another git process", "index.lock", "la Mac no tiene memoria")


def presion_memoria():
    """Nivel de presión de memoria del núcleo de macOS (1 normal, 2 aviso, 4 crítico); 0 si no se sabe."""
    try:
        r = subprocess.run(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"],
                           capture_output=True, text=True, timeout=5)
        return int((r.stdout or "0").strip() or 0)
    except Exception:  # noqa: BLE001 — fuera de macOS no hay dato
        return 0


def tsc_cabe_aqui(nivel):
    """PURA. ¿Se puede lanzar aquí un tsc completo (~3 GB)? No con la presión en aviso o peor.

    (2026-10-13, medido) Con la presión en 2, 108 MB libres y el compresor en 2,7 GB, el tsc de
    traer (763 MB y subiendo) dejó Genesis sin responder: /api/mando/estado pasaba de 50 s y
    MetaGenesis «no carga». Esperar a la próxima pasada es un fallo del medio, no de la tarea."""
    return int(nivel or 0) < 2


def es_fallo_del_medio(detalle):
    """PURA: ¿el fallo es de la máquina (memoria, tiempo, cerrojo), no del trabajo de la tarea?
    Un fallo del medio no crea una sucesora: se reintenta en la próxima pasada."""
    return any(s in str(detalle or "") for s in _SENALES_MEDIO)


def archivos_ts(cambiados):
    """PURA: lo que obliga a pasar tsc (código TS o la configuración que lo cambia)."""
    return [c for c in cambiados or () if re.search(r"\.(ts|tsx|mts|cts)$", c)
            or os.path.basename(c) in ("tsconfig.json", "package.json", "package-lock.json")]


def reaplicable(propios, de_main):
    """PURA: ¿lo comprobado sobre el main de antes sigue valiendo sobre el de ahora? Sí si main no
    tocó ninguno de nuestros archivos y no hay TS en los dos lados (los tipos cruzan archivos)."""
    if set(propios) & set(de_main):
        return False
    return not (archivos_ts(propios) and archivos_ts(de_main))


def pruebas_python(cambiados, existe=os.path.exists):
    """PURA (con `existe` inyectable): pruebas del puente que tocan lo que llega: las propias
    `test_*.py` cambiadas y la hermana `test_<módulo>.py` de cada módulo cambiado."""
    salida = []
    for c in cambiados or ():
        if not (c.startswith("scripts/") and c.endswith(".py")):
            continue
        carpeta, nombre = os.path.split(c)
        cand = c if nombre.startswith("test_") else os.path.join(carpeta, "test_" + nombre)
        if cand not in salida and existe(cand):
            salida.append(cand)
    return salida


def _correr_en(cwd, orden, timeout, memoria=None):
    import publicar

    env = publicar.entorno()
    if memoria:
        env = dict(env, NODE_OPTIONS=memoria)
    try:
        r = subprocess.run(orden, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
        return r.returncode, ((r.stdout or "") + (r.stderr or ""))[-4000:]
    except subprocess.TimeoutExpired:
        return 124, "se pasó de %d s sin terminar" % timeout
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def _git_en(cwd, args, timeout=120):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def _puertas(base_sha, shas, cambiados, cwd=None):
    """First try to check on A1, if A1 is busy or not responding, fall back to local check.
    tsc (solo si cambió TS) + pruebas relacionadas de TS y del puente, con el turno de las puertas,
    en la carpeta `cwd`. (ok, detalle)."""
    # Con TS, primero el A1 (TRA1012A). (2026-10-13) Aquí ponía `traer_nube.archivos_ts` y
    # `from . import comprobar_en_a1` DENTRO de este mismo módulo, que corre como guion: NameError
    # en cada tarea con TS y traer_nube caído otra vez (§15 de CLAUDE.md). El A1 es un extra: si
    # su comprobación falla por lo que sea, se comprueba aquí.
    # (2026-10-13) Al A1 se le manda la carpeta `cwd` (HEAD ya cherry-pickeado): lo empaqueta
    # sobre el main de la Mac que el A1 ya tiene y lo comprueba en un clon aparte.
    if archivos_ts(cambiados):
        motivo_a1 = ""
        try:
            if DIRECTORIO not in sys.path:
                sys.path.insert(0, DIRECTORIO)
            import comprobar_en_a1

            ok, detalle, del_medio = comprobar_en_a1.comprobar(base_sha, shas, cambiados, timeout=900, cwd=cwd)
            if not del_medio:
                return ok, detalle
            motivo_a1 = detalle
        except Exception as e:  # noqa: BLE001
            motivo_a1 = "A1: %s" % type(e).__name__
        if not tsc_cabe_aqui(presion_memoria()):
            return False, ("la Mac no tiene memoria para un tsc completo ahora (presión en aviso): en la próxima pasada"
                           + (" (%s)" % motivo_a1[:160] if motivo_a1 else ""))

    # Local check (original logic)
    import contextlib

    import turno_pesado

    cwd = cwd or RAIZ
    codigo_ts = [c for c in cambiados if c.startswith("src/") and re.search(r"\.(ts|tsx)$", c)]
    # El turno de la máquina (uno pesado a la vez) solo hace falta para tsc y vitest; unas pocas
    # pruebas del puente en Python no esperan detrás de un tsc de 15 min de otra tarea.
    turno = turno_pesado.turno() if (archivos_ts(cambiados) or codigo_ts) else contextlib.nullcontext()
    with turno:
        if archivos_ts(cambiados):
            rc, salida = _correr_en(cwd, ORDEN_TSC, 1800, MEMORIA_TSC)
            if rc != 0:
                return False, "tsc: " + salida[-600:]
        codigo = [c for c in cambiados if c.startswith("src/") and re.search(r"\.(ts|tsx)$", c)]
        if codigo:
            rc, salida = _correr_en(cwd, ["npx", "vitest", "related", "--run", "--maxWorkers=2",
                                           "--minWorkers=1", "--passWithNoTests", *codigo], 1200)
            if rc != 0:
                return False, "pruebas: " + salida[-600:]
        py = pruebas_python(cambiados, lambda r: os.path.exists(os.path.join(cwd, r)))
        if py:
            rc, salida = _correr_en(cwd, [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *py], 900)
            if rc not in (0, 5):  # 5 = no encontró pruebas
                return False, "pruebas del puente: " + salida[-600:]
    return True, "tsc y pruebas relacionadas en verde"


def _traer(fila, espera_integrar_s=60):
    """Trae la tarea a main SIN tocar main hasta que pasa. (ok, detalle, del_medio).

    (2026-10-12) Antes se hacía cherry-pick EN main y, si no pasaba, `reset --keep`: main subía y
    bajaba cada 30 min (16 veces el 12-10), el revisor de bloqueadas leía `git log main` en ese hueco
    y daba por integradas tareas que no lo estaban (COL1012A, COL1012B…), y las carpetas de tareas
    nuevas nacían con commits sin comprobar. Ahora se comprueba en una carpeta aparte y main solo
    avanza (fast-forward) si todo pasa y nadie lo movió mientras tanto."""
    import shutil

    _, orig = _git(["rev-parse", "main"])
    orig = orig.strip()
    shas = [c["sha"] for c in fila["commits"] if c["nuevo"] or (c["tipo"] == "ola" and c["vacio"])]
    wt = os.path.join(CARPETA_COMPROBAR, re.sub(r"[^A-Za-z0-9._-]", "-", str(fila["tid"])))
    _git(["worktree", "remove", "--force", wt])
    shutil.rmtree(wt, ignore_errors=True)
    _git(["worktree", "prune"])
    os.makedirs(CARPETA_COMPROBAR, exist_ok=True)
    rc, salida = _git(["worktree", "add", "-q", "--detach", wt, orig], timeout=300)
    if rc != 0:
        return False, "no pude preparar la carpeta de comprobación: " + salida.strip()[-200:], True
    try:
        nm = os.path.join(RAIZ, "node_modules")
        if os.path.isdir(nm) and not os.path.exists(os.path.join(wt, "node_modules")):
            os.symlink(nm, os.path.join(wt, "node_modules"))
        rc, salida = _git_en(wt, ["-c", "core.hooksPath=/dev/null", "cherry-pick", "--allow-empty",
                                  "--keep-redundant-commits", *shas], timeout=300)
        if rc != 0:
            _git_en(wt, ["cherry-pick", "--abort"])
            return False, "conflicto al traerla sobre el main de hoy: " + salida.strip()[-300:], es_fallo_del_medio(salida)
        _, cambiados = _git_en(wt, ["diff", "--name-only", orig, "HEAD"])
        cambiados_list = [c for c in cambiados.splitlines() if c.strip()]
        ok, detalle = _puertas(base_sha=orig, shas=shas, cambiados=cambiados_list, cwd=wt)
        if not ok:
            donde = "no pasa " if detalle.startswith("en el A1") else "en la Mac no pasa: "
            return False, donde + detalle, es_fallo_del_medio(detalle)
        propios = [c for c in cambiados.splitlines() if c.strip()]
        _, nuevo = _git_en(wt, ["rev-parse", "HEAD"])
        try:
            with _Cerrojo("integrar", espera_integrar_s):
                _, actual = _git(["rev-parse", "main"])
                actual = actual.strip()
                if actual != orig:
                    # main avanzó mientras se comprobaba (el orquestador integró otra tarea). Si lo nuevo de
                    # main no toca nuestros archivos y no mezcla TS con TS, lo comprobado sigue valiendo:
                    # se reaplica encima en segundos. Si no, se reintenta en la próxima pasada.
                    _, de_main = _git(["diff", "--name-only", orig, actual])
                    de_main = [c for c in de_main.splitlines() if c.strip()]
                    if not reaplicable(propios, de_main):
                        return False, "main avanzó mientras se comprobaba y toca lo mismo: se reintenta", True
                    _git_en(wt, ["reset", "-q", "--hard", actual])
                    rc, salida = _git_en(wt, ["-c", "core.hooksPath=/dev/null", "cherry-pick", "--allow-empty",
                                              "--keep-redundant-commits", *shas], timeout=300)
                    if rc != 0:
                        _git_en(wt, ["cherry-pick", "--abort"])
                        return False, "main avanzó mientras se comprobaba y no se reaplica limpio: se reintenta", True
                    _, nuevo = _git_en(wt, ["rev-parse", "HEAD"])
                rc, salida = _git(["merge", "--ff-only", "-q", nuevo.strip()], timeout=120)
        except TimeoutError:
            return False, "main ocupado (publicación o integración): se reintenta en la próxima pasada", True
        if rc != 0:
            return False, "no pude avanzar main: " + salida.strip()[-200:], True
        return True, detalle, False
    finally:
        _git(["worktree", "remove", "--force", wt])
        shutil.rmtree(wt, ignore_errors=True)
        _git(["worktree", "prune"])


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
    vivos_por_run = {}  # una pregunta a GitHub por run y pasada

    def _vivo(run):
        if run not in vivos_por_run:
            vivos_por_run[run] = VR.run_vivo(VR.estado_del_run(run, RAIZ))
        return vivos_por_run[run]

    for fila in inventario():
        tid = fila["tid"]
        if not tid:  # commits que no son de ninguna tarea: ni se traen ni se reparan
            continue
        clave = "%s|%s" % (fila["rama"], tid)
        previa = hechas_antes.get(clave) or {}
        if previa.get("accion") in ("traida", "reparada"):
            continue
        entrada_p = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
        en_main, cola_t = bool(tid) and id_en_asuntos(tid, asuntos), (colas.get(tid) or ("", {}))[0]
        accion, motivo = decidir(tid, fila["commits"], en_main, entrada_p.get("estado"), cola_t)
        if accion == "esperar" and VR.es_reasignada_a_la_nube(entrada_p):
            # (OPS1024E) ¿La rama es de otro medio y el run de la reasignación ya no la lleva?
            run = VR.run_de_la_nota(entrada_p.get("nota"))
            vivo = _vivo(run) if run and run_de_rama(fila["rama"]) != run else None
            libre = libre_de_su_reasignacion(fila["rama"], entrada_p, vivo, time.time())
            if libre:
                accion, motivo = decidir(tid, fila["commits"], en_main, entrada_p.get("estado"), cola_t, libre=libre)
        entradas.append(dict(fila, accion=accion, motivo=motivo, clave=clave))
    entradas = elegir_por_tarea(entradas)

    traidas, reparadas, esperando, superadas_nuevas = [], [], [], []
    if aplicar:
        # (2026-10-12) Sin el cerrojo `integrar` mientras se comprueba: cada tarea se comprueba en su
        # carpeta y `_traer` solo lo toma para el avance rápido de main. Antes se tenía durante TODA la
        # pasada (tsc de hasta 30 min en la Mac) y el orquestador no podía integrar nada mientras.
        for e in [x for x in entradas if x["accion"] == "traer"]:
            ok, detalle, del_medio = _traer(e, espera_integrar_s)
            if not ok and del_medio:
                # Fallo de la máquina, no de la tarea: se reintenta, sin crear sucesora.
                e["accion"], e["motivo"] = "esperar", detalle
                continue
            if ok:
                _actualizar_progreso({e["tid"]: {"estado": "commit", "nota": "traída de la nube (%s): %s"
                                                 % (e["rama"], detalle)}})
                hechas_antes[e["clave"]] = {"accion": "traida", "t": time.strftime("%Y-%m-%d %H:%M:%S")}
                traidas.append({"tid": e["tid"], "rama": e["rama"]})
            else:
                e["accion"], e["motivo"] = "reparar", detalle
        progreso = _progreso()
        for e in [x for x in entradas if x["accion"] == "reparar"]:
            sucesores = sucesores_en_cadena(e["tid"], progreso)
            if len(sucesores) >= REPARACIONES_MAX:
                # (2026-10-06) Tope de la cadena: RSC1006Q pasó por Qb, Qc, Qd y Qe en doce horas,
                # cada una con tres envíos nuevos a la nube que fallaba igual. Sin tope, un bucle.
                _actualizar_progreso({e["tid"]: {
                    "estado": "bloqueada",
                    "nota": "la nube no la integra tras %d reparaciones encadenadas (%s): se queda para "
                            "la Mac y su revisor; el último trabajo está en %s"
                            % (len(sucesores), ", ".join(sucesores), e["rama"])}})
                progreso = _progreso()
                hechas_antes[e["clave"]] = {"accion": "tope", "t": time.strftime("%Y-%m-%d %H:%M:%S")}
                esperando.append({"tid": e["tid"], "motivo": "tope de reparaciones: a Bloqueadas, en la Mac"})
                continue
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
