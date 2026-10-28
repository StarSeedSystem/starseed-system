"""Cachés y restos que la lista blanca de Genesis no ve (CNS1010C: 1,1 GB libres y «nada regenerable»).
`plan` decide (PURA), `aplicar` ejecuta lo inyectado y `recoger` mira la máquina. Ante la duda no se borra."""
import glob
import os
import shutil
import subprocess
import time

LISTA_NEGRA = ("state.db", "state-snapshots", "respaldos", ".env", ".git", ".gguf", "CloudStorage",
               "starseed_memory_root", ".supabase")  # gana siempre: si la ruta contiene una, no se toca
CHROME, NPM = "/private/var/folders/*/*/X/com.google.Chrome.code_sign_clone/*", "/private/tmp/npm-cache-*/_cacache"
NPM_NUNCA, NPM_VIVOS = ("_npx", "_logs"), ("npm install", "npm ci", "npm i ")  # _npx: Desktop Commander
NPM_MINIMO_MB, GRADLE_LIBRE_GB, LOG_MAXIMO_MB, CONSERVA_BYTES = 500, 6.0, 50, 3_000_000
GRADLE = ("~/.gradle/caches", "~/.gradle/wrapper/dists", "~/.gradle/daemon")
LOGS = ("~/.hermes/logs/*.log", "~/Documents/IA 1.58 bit/backend/bitnet-server.log")
VERSIONES = (("~/.local/share/claude/versions/*", "~/.local/bin/claude"),  # (versiones, enlace a la de uso)
             ("~/.codex/packages/standalone/releases/*", "~/.codex/packages/standalone/current"))
EJECUTABLE_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  # exacto: un ayudante no llega
_MES = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
        "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def vetada(ruta):  # PURA: la lista negra, y nunca una ruta relativa ni con «..»
    r = str(ruta)
    return not r.startswith("/") or ".." in r.split("/") or any(n in r for n in LISTA_NEGRA)


def _lstart_a_epoch(texto):  # PURA
    """«Tue Oct 28 03:24:17 2026» (lstart de ps) → epoch LOCAL de ese arranque; None si no se entiende."""
    partes = texto.split()
    if len(partes) != 5 or partes[1] not in _MES:
        return None
    try:
        h, m, s = (int(x) for x in partes[3].split(":"))
        return time.mktime((int(partes[4]), _MES[partes[1]], int(partes[2]), h, m, s, 0, 0, -1))
    except (ValueError, OverflowError):
        return None


def inicio_chrome_de_ps(texto):  # PURA
    """Salida completa de `ps -axo pid=,lstart=,comm=` → (inicio, vivo).

    inicio = epoch del Chrome principal MÁS VIEJO (ejecutable exactamente EJECUTABLE_CHROME; los
    ayudantes, crashpad y el actualizador no llegan), None si no se leyó ninguna fecha. vivo = True
    solo si hay algún proceso con ese ejecutable; si el ps no salió (None) no se sabe: vivo=True,
    que es «ante la duda no se borra».
    """
    if texto is None:
        return None, True
    posibles = []
    for l in texto.splitlines():
        partes = l.split(None, 6)
        if len(partes) == 7 and partes[6] == EJECUTABLE_CHROME:
            posibles.append(" ".join(partes[1:6]))
    fechas = [f for f in (_lstart_a_epoch(p) for p in posibles) if f is not None]
    return (min(fechas), True) if fechas else (None, bool(posibles))


def clones_de_chrome_a_borrar(clones, inicio_chrome_mas_viejo):  # PURA
    """[(ruta, mtime)] de los clones de firma de Chrome y el arranque del Chrome principal más viejo
    → rutas que corresponden borrar. Sin Chrome vivo (None) van TODOS; con Chrome vivo, solo los de
    ANTES de su arranque −60 s (los suyos se conservan: los borrados suelen ser de matanzas nocturnas).
    Una ruta vetada nunca se devuelve."""
    limpios = [(r, m) for r, m in clones if not vetada(r)]
    if inicio_chrome_mas_viejo is None:
        return [r for r, _ in limpios]
    return [r for r, m in limpios if m < inicio_chrome_mas_viejo - 60]


def _clones_con_fecha(rutas, mtime_fn):
    """[(ruta, mtime)]; un clon cuya fecha no se pueda leer se omite (ante la duda no se borra)."""
    salida = []
    for r in rutas:
        try:
            f = mtime_fn(r)
        except OSError:
            continue
        if f is not None:
            salida.append((r, f))
    return salida


def plan(libre_gb, existe, tamano_mb, proceso_vivo, enlace_destino,
         clones=None, inicio_chrome_mas_viejo=None):
    """PURA. [{accion: "borrar"|"recortar", ruta, mb, por_que}]. `existe(patron)` → rutas; `proceso_vivo(texto)`
    → ¿algún proceso lo nombra o tiene algo abierto bajo esa ruta?; `enlace_destino(e)` → ruta real o None.
    `clones` = [(ruta, mtime)] de los clones de firma de Chrome y `inicio_chrome_mas_viejo` = epoch (o None);
    con `clones` None no se sabe nada de ellos y no se toca ninguno."""
    acciones = []

    def poner(accion, ruta, mb, por_que):
        if not vetada(ruta) and all(a["ruta"] != ruta for a in acciones):
            acciones.append({"accion": accion, "ruta": ruta, "mb": round(max(mb, 0.0), 1), "por_que": por_que})
    if clones is not None:
        for r in clones_de_chrome_a_borrar(clones, inicio_chrome_mas_viejo):
            poner("borrar", r, tamano_mb(r), "clon de firma de Chrome anterior al Chrome vivo (clon APFS: libera quizá menos)")
    for r in existe(NPM) if not any(proceso_vivo(p) for p in NPM_VIVOS) else []:
        mb = 0.0 if any(n in r for n in NPM_NUNCA) else tamano_mb(r)
        if mb > NPM_MINIMO_MB:
            poner("borrar", r, mb, "caché de npm de más de %d MB (npm la rehace)" % NPM_MINIMO_MB)
    if libre_gb is not None and libre_gb < GRADLE_LIBRE_GB and not proceso_vivo("gradle"):
        for r in (r for p in GRADLE for r in existe(p)):
            poner("borrar", r, tamano_mb(r), "Gradle parado y menos de %g GB libres (se rehace)" % GRADLE_LIBRE_GB)
    for r, mb in ((r, tamano_mb(r)) for p in LOGS for r in existe(p)):
        if mb > LOG_MAXIMO_MB:
            poner("recortar", r, mb - CONSERVA_BYTES / 2 ** 20, "registro de %d MB: quedan sus últimos 3 MB" % mb)
    for patron, enlace in VERSIONES:
        destino, rs = enlace_destino(enlace), existe(patron)
        uso = [r for r in rs if destino and (destino == r or destino.startswith(r.rstrip("/") + "/"))]
        for r in rs if uso else []:  # sin saber cuál de ESTAS está en uso no se toca ninguna
            if r not in uso and not proceso_vivo(r):
                poner("borrar", r, tamano_mb(r), "versión vieja sin procesos (en uso: %s)" % os.path.basename(destino))
    return acciones


def aplicar(acciones, borrar_fn, recortar_fn):
    """Ejecuta el plan con las funciones dadas; una ruta que falla no para las demás. Devuelve SOLO lo hecho."""
    fns, hecho = {"borrar": borrar_fn, "recortar": recortar_fn}, []
    for a in (a for a in acciones if a.get("accion") in fns and not vetada(a.get("ruta", ""))):
        try:
            fns[a["accion"]](a["ruta"])
            hecho.append(a)
        except Exception:
            continue
    return hecho


def resumen(hecho):
    """PURA. Una línea con los MB liberados y, para que quede anotado, cada ruta tocada."""
    cada = "; ".join("%s %s ≈%d MB" % ("borré" if a["accion"] == "borrar" else "recorté", a["ruta"], a["mb"]) for a in hecho)
    return "liberados ≈%d MB según du, fuera de la lista blanca de Genesis: %s" % (sum(a["mb"] for a in hecho), cada)


def borrar(ruta):
    if vetada(ruta):
        raise ValueError("en la lista negra: %s" % ruta)
    (shutil.rmtree if os.path.isdir(ruta) and not os.path.islink(ruta) else os.remove)(ruta)


def recortar(ruta, abrir=open, conservar=CONSERVA_BYTES):
    """Deja sus últimos `conservar` bytes EN SITIO (mismo inodo: quien escribe sigue). Devuelve lo quitado."""
    if vetada(ruta):
        raise ValueError("en la lista negra: %s" % ruta)
    with abrir(ruta, "r+b") as f:
        total = f.seek(0, os.SEEK_END)
        if total > conservar:
            f.seek(total - conservar)
            cola = f.read(conservar)
            f.seek(0)
            f.truncate(f.write(cola))
        return max(total - conservar, 0)


def _correr(orden, ok=(0,), tope_s=60):
    try:  # None = no se pudo saber (falta, se colgó o falló)
        r = subprocess.run(orden, capture_output=True, text=True, timeout=tope_s)
        return r.stdout if r.returncode in ok else None
    except (OSError, subprocess.SubprocessError):
        return None


def recoger(libre_gb, home=None, glob_fn=glob.glob, correr=_correr, es_enlace=os.path.islink,
            ruta_real=os.path.realpath, mtime_fn=os.path.getmtime):  # lo que `plan` necesita, mirado aquí: plan(**recoger(libre))
    home = home or os.path.expanduser("~")
    ruta = lambda p: home + p[1:] if p.startswith("~") else p  # noqa: E731
    ps = correr(["ps", "axww", "-o", "command="]) or None
    inicio_ch, vivo_ch = inicio_chrome_de_ps(correr(["ps", "-axo", "pid=,lstart=,comm="]))
    lsof = [correr(["lsof", "-nP", "-Fn", "+D", ruta_real(os.path.dirname(ruta(p)))], ok=(0, 1)) for p, _ in VERSIONES]
    abiertos = None if None in lsof else [x[1:] for s in lsof for x in s.splitlines() if x.startswith("n")]

    def proceso_vivo(texto):  # sin saber qué corre, nada que dependa de ello se borra
        return ps is None or (abiertos is None and texto.startswith("/")) or texto in ps or any(
            p == texto or p.startswith(texto.rstrip("/") + "/") for p in abiertos or [])

    def tamano_mb(r):  # du sale con 1 si algo dentro no se puede leer, pero da el total
        partes = (correr(["du", "-sk", r], ok=(0, 1)) or "").split()
        return int(partes[0]) / 1024 if partes and partes[0].isdigit() else 0.0

    def existe(patron):  # rutas reales (como lsof y el enlace), pero nada que pase por un enlace simbólico:
        p = ruta(patron)  # ni la ruta lo es, ni su ruta real sale de la carpeta fija del patrón (sin resolver)
        fija = os.path.dirname(p[:min([p.index(c) for c in "*?[" if c in p] or [len(p)])]).rstrip("/")
        return sorted({ruta_real(x) for x in glob_fn(p) if not es_enlace(x) and ruta_real(x).startswith(fija + "/")})
    # los clones de firma: si no hay Chrome vivo (o leímos su arranque) se recogen con fecha; si
    # vive y no se sabe cuándo empezó, NO se recoge ninguno, que es «ante la duda no se borra».
    # (nunca `pgrep -l/-fl` ni `ps -E`: en macOS imprimen el entorno)
    clones = ([] if vivo_ch and inicio_ch is None
              else _clones_con_fecha(existe(CHROME), mtime_fn))
    return {"libre_gb": libre_gb, "existe": existe, "tamano_mb": tamano_mb, "proceso_vivo": proceso_vivo,
            "enlace_destino": lambda e: ruta_real(ruta(e)) if es_enlace(ruta(e)) else None,
            "clones": clones, "inicio_chrome_mas_viejo": inicio_ch}
