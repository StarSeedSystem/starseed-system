#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Autopublicación: el director de producción y publicación (interruptor en Genesis · Ajustes).

QUÉ. Con el interruptor «Autopublicación» encendido, cada 5 min (launchd `com.starseed.produccion`)
este director mira si `main` tiene commits sin publicar y, si los hay, lleva ESE commit a producción
él solo, pasando de la puerta más barata a la más cara:
  1. Análisis del lote: secretos en el diff, migraciones destructivas, vetos y coherencia (Jev, que
     solo puede frenar).
  2. Pruebas del puente en la Mac (unittest + pytest) sobre ese mismo commit.
  3. CI de GitHub Actions sobre ese commit (rama `produccion/candidato`): tsc, vitest, núcleo mesh y
     `next build` en una máquina de 16 GB — nunca en la Mac con el enjambre vivo.
  4. Publicar: push fast-forward de ese commit a `origin/main` (nunca force).
  5. Verificar en producción: el despliegue de Vercel de ese commit en «success» y humo de rutas.
Las esperas largas (CI, Vercel) no se duermen: quedan en el estado y se retoman en la siguiente
pasada. Todo se dice en el Chat Director y en `~/.starseed/produccion/autopublicar-estado.json`.

POR QUÉ. Alex (2026-10-05 y 2026-10-07): un director especializado que publique automáticamente
tras pruebas, análisis y verificaciones profesionales en sus medios. La publicación manual de las
14:46 del 07-10 cayó por un intérprete sin pytest y el director anterior nunca llegó a correr (su
plist de launchd estaba mal escrito). Contrato: `architecture/director-produccion.md`.

  python3 scripts/puente/autopublicar.py [--json]      una pasada
  python3 scripts/puente/autopublicar.py --bucle       el servicio (cada 5 min)
"""
import fcntl
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
import produccion_puertas as PP  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
CARPETA = os.path.expanduser("~/.starseed/produccion")
INTERRUPTOR = os.path.join(CARPETA, "autopublicar.json")
ESTADO = os.path.join(CARPETA, "autopublicar-estado.json")
CERROJO = os.path.expanduser("~/.starseed/cerrojos/autopublicar.lock")
DIARIO_MANUAL = os.path.join(RAIZ, "starseed_memory_root", "mando", "publicacion-estado.json")
REPO = "StarSeedSystem/starseed-system"
RAMA_CANDIDATO = "produccion/candidato"
WEB = "https://starseed-os.vercel.app"
RUTAS_HUMO = ("/", "/login", "/version.json")
CI_TOPE_S = 50 * 60
VERCEL_TOPE_S = 45 * 60  # Vercel ha llegado a tardar 27 min en compilar (CLAUDE.md, «Publicar»)
VENTANA_S = 20 * 60
MAX_DIA = 24
#: (2026-10-08) Jev frenó 8 de 8 lotes del 07-10 con p 0,84–0,85 sin un motivo concreto (es un
#: consejero de bajo coste que solo ve asuntos de commits). Con 0,8 la autopublicación no salía
#: nunca. Ahora frena solo con certeza (≥ 0,95); entre 0,8 y 0,95 es una DUDA que se anota y se
#: dice, y deciden las puertas deterministas (pruebas, CI, Vercel y humo).
JEV_FRENA = 0.95
JEV_DUDA = 0.8
PETICION = os.path.join(CARPETA, "autopublicar-peticion.json")
#: (PUB1029G) Las colas de tareas que lee el enjambre: ahí se escribe la cola del CI en rojo.
RAIZ_OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")


# ── puro ──────────────────────────────────────────────────────────────────────
def encendido(datos):
    return isinstance(datos, dict) and datos.get("activo") is True


def quien_dirige(lider):
    """PURA. La neurona que tiene el arriendo de dirección, para decirlo tal cual."""
    a = lider.get("arriendo") if isinstance(lider, dict) else None
    return str((a or {}).get("dueno") or "").strip() or "otra neurona"


# Lo idempotente y lo que solo NOMBRA un borrado no borra nada: recrear una política o un trigger
# (`drop … if exists` + `create`), `on delete cascade` de una clave foránea, `for delete` de una
# política, `grant … delete` o el evento de un trigger. Sin esto, TODAS nuestras migraciones (estilo os_canales) parecían
# destructivas y ningún lote con una tabla nueva se habría publicado nunca.
_IDEMPOTENTE = re.compile(
    r"drop\s+(?:policy|trigger|function|view|index)\s+if\s+exists[^;]*;"
    r"|on\s+delete\s+(?:cascade|set\s+null|set\s+default|restrict|no\s+action)"
    r"|for\s+(?:select|insert|update|delete|all)\b"
    r"|grant\s+[^;]*;|revoke\s+[^;]*;"
    # (2026-10-20) El evento de un trigger («after insert or update or delete on …») dice CUÁNDO
    # corre, no borra nada: os_variaciones recalcula la media al borrar una valoración.
    r"|\b(?:before|after|instead\s+of)\s+(?:insert|update|delete|truncate)(?:\s+of\s+[\w\s,]+?)?"
    r"(?:\s+or\s+(?:insert|update|delete|truncate)(?:\s+of\s+[\w\s,]+?)?)*\s+on\b", re.I)


# El cuerpo de una función (`$$ … $$`) es código que corre después, no un borrado al migrar: el
# trigger de tope de `mando_eventos` poda filas viejas a propósito (anillo de eventos).
_CUERPO_FUNCION = re.compile(r"\$([A-Za-z_]*)\$.*?\$\1\$", re.S)


def sql_sin_idempotente(sql):
    return _IDEMPOTENTE.sub(" ", _CUERPO_FUNCION.sub(" ", sql or ""))


def analizar_lote(diff, migraciones):
    """Bloqueos del lote (lista vacía = puede seguir). Nunca imprime un secreto: solo tipo y archivo."""
    bloqueos = []
    for h in PP.escanear_secretos(diff or ""):
        bloqueos.append("posible secreto (%s) en %s" % (h.get("tipo", "clave"), h.get("archivo", "?")))
    for ruta, sql in sorted((migraciones or {}).items()):
        mala, motivo = PP.migracion_destructiva(sql_sin_idempotente(sql))
        if mala:
            bloqueos.append("migración destructiva en %s (%s): la decide Alex" % (ruta, motivo))
    return bloqueos


def estado_ci(runs, sha):
    """(«esperando»|«verde»|«rojo»|«sin-run», url, id) del run de CI de ese commit."""
    propios = [r for r in (runs or []) if r.get("head_sha") == sha]
    if not propios:
        return "sin-run", None, None
    r = sorted(propios, key=lambda x: x.get("created_at") or "")[-1]
    if r.get("status") != "completed":
        return "esperando", r.get("html_url"), r.get("id")
    return ("verde" if r.get("conclusion") == "success" else "rojo"), r.get("html_url"), r.get("id")


def estado_vercel(estados):
    """(«esperando»|«listo»|«fallo», url) del último estado del despliegue de producción."""
    if not estados:
        return "esperando", None
    ultimo = estados[0]
    s = ultimo.get("state")
    url = ultimo.get("environment_url") or ultimo.get("target_url")
    if s == "success":
        return "listo", url
    if s in ("failure", "error"):
        return "fallo", ultimo.get("target_url")
    return "esperando", url


def publicadas_hoy(historial, ahora):
    hoy = time.strftime("%Y-%m-%d", time.localtime(ahora))
    return sum(1 for h in historial or [] if h.get("resultado") == "publicado" and str(h.get("dia")) == hoy)


def con_fase(est, fase, detalle, ahora, **mas):
    nuevo = dict(est)
    nuevo.update(fase=fase, detalle=detalle, actualizado=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora)))
    nuevo.update(mas)
    return nuevo


def vetar(est, sha, motivo, ahora, url=None, evidencia=None):
    """Veta `sha`. `evidencia` (OPA1011b): la salida de la puerta que falló, para que MetaGenesis la
    convierta en una tarea de reparación si el veto no se levanta solo (`nodo_metagenesis`)."""
    vetados = dict(est.get("vetados") or {})
    vetados[sha] = motivo
    # Solo los 30 últimos: un veto viejo ya no puede volver a ser HEAD.
    vetados = dict(list(vetados.items())[-30:])
    hist = list(est.get("historial") or [])[-29:] + [{"sha": sha, "resultado": "bloqueado", "motivo": motivo,
                                                     "dia": time.strftime("%Y-%m-%d", time.localtime(ahora)), "url": url}]
    mas = {}
    if evidencia:
        mas["evidencia"] = {"sha": sha, "motivo": motivo, "texto": str(evidencia)[-2400:]}
    return con_fase(est, "bloqueado", motivo, ahora, sha=sha, vetados=vetados, historial=hist, url=url, **mas)


def arbol_limpio(raiz, sha, git, destino):
    """Un árbol de trabajo LIMPIO de `sha` en `destino` (`git worktree add --detach`), con el
    `node_modules` de la Mac enlazado. → ruta o None. (OPA1011b, 2026-10-10) Las pruebas del puente
    corrían sobre el árbol VIVO de la Mac: a las 14:28 vetaron 17cf6a67 por `test_oracle_nodo` a medio
    editar por otro agente (sin commit); el commit estaba bien. Un árbol limpio prueba ESE commit."""
    try:
        quitar_arbol(raiz, destino, git)
        rc = git(["worktree", "add", "--detach", "--force", destino, sha], timeout=300)[0]
    except Exception:  # noqa: BLE001 — un git colgado no tumba la pasada: se reintenta
        return None
    if rc != 0 or not os.path.isdir(destino):
        return None
    nm = os.path.join(raiz, "node_modules")
    if os.path.isdir(nm) and not os.path.exists(os.path.join(destino, "node_modules")):
        try:
            os.symlink(nm, os.path.join(destino, "node_modules"))
        except OSError:
            pass
    return destino


def quitar_arbol(raiz, destino, git):
    """Quita el árbol de pruebas (solo ese: nunca toca otros worktrees). Nunca lanza."""
    try:
        if os.path.exists(destino):
            git(["worktree", "remove", "--force", destino], timeout=120)
            if os.path.exists(destino) and os.path.basename(destino) == "arbol-pruebas":
                subprocess.run(["rm", "-rf", destino], check=False)
    except Exception:  # noqa: BLE001
        pass


# ── medios reales (todo inyectable en las pruebas) ───────────────────────────
class Medios(object):
    def __init__(self, raiz=RAIZ):
        self.raiz = raiz

    def git(self, args, timeout=180):
        r = subprocess.run(["git"] + args, cwd=self.raiz, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()

    def gh(self, ruta):
        try:
            r = subprocess.run(["gh", "api", ruta], cwd=self.raiz, capture_output=True, text=True, timeout=60)
            return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None
        except Exception:
            return None

    def log_fallido(self, run_id):
        try:
            r = subprocess.run(["gh", "run", "view", str(run_id), "--repo", REPO, "--log-failed"],
                               cwd=self.raiz, capture_output=True, text=True, timeout=120)
            lineas = [l.split("\t")[-1] for l in (r.stdout or "").splitlines() if l.strip()]
            # (PUB1029G) Suficiente para varios FAIL de Vitest y sus detalles sin desbordar el estado.
            return "\n".join(lineas[-200:])[-6000:]
        except Exception:
            return ""

    def leer_cola(self, nombre):
        return _leer(os.path.join(RAIZ_OLAS, nombre), [])

    def guardar_cola(self, nombre, tareas):
        _escribir(os.path.join(RAIZ_OLAS, nombre), tareas)

    def http(self, url):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "starseed-director-produccion"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code
        except Exception:
            return 0

    def interruptor(self):
        # El botón «Pausar» de la tarjeta Producción también frena la autopublicación.
        pausada = (_leer(os.path.expanduser("~/.starseed/produccion-pausada.json"), {}) or {}).get("pausada") is True
        return encendido(_leer(INTERRUPTOR, {})) and not pausada

    def soy_lider(self):
        """El arriendo de dirección (IND1029B). Sin puerta, sin red o sin el módulo: líder en local."""
        try:
            import lider_direccion
            return lider_direccion.soy_lider()
        except Exception:  # noqa: BLE001 — como hoy: sin puerta se sigue en local
            return {"soy": True, "motivo": "sin líder de dirección: sigo en local", "arriendo": None}

    def vetos_externos(self):
        """Vetos de Genesis o de otros directores (`~/.starseed/produccion/vetos.json`, por sha)."""
        datos = _leer(os.path.join(CARPETA, "vetos.json"), {})
        return set(datos) if isinstance(datos, dict) else set()

    def publicando_a_mano(self):
        return (_leer(DIARIO_MANUAL, {}) or {}).get("estado") == "corriendo"

    def unir_origen(self, head, espera_s=120):
        """(ok, detalle). Une origin/main a main con la estrategia «ours» (el árbol NO cambia) bajo el
        cerrojo `integrar` del orquestador y de commit-seguro.py, y solo si main sigue en `head`.
        Quien llama ya comprobó con `git cherry` que lo de origin/main está dentro de main."""
        import importlib.util
        try:
            spec = importlib.util.spec_from_file_location("commit_seguro", os.path.join(DIRECTORIO, "commit-seguro.py"))
            cs = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cs)
            if not cs.esperar_momento_seguro(tope_s=espera_s):
                return False, "una tarea está integrando en main; lo intento en la próxima pasada"
            cerrojo = cs.CERROJO
        except Exception as e:  # sin commit-seguro: el mismo cerrojo por su ruta
            cerrojo = os.path.expanduser("~/.starseed/cerrojos/integrar.lock")
            if not os.path.isdir(os.path.dirname(cerrojo)):
                return False, "sin cerrojo de integración (%s)" % e
        f = open(cerrojo, "a+")
        t0 = time.time()
        while True:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.time() - t0 > espera_s:
                    f.close()
                    return False, "el cerrojo de integración sigue tomado"
                time.sleep(5)
        try:
            if self.git(["rev-parse", "HEAD"])[1] != head:
                return False, "main se movió mientras esperaba"
            antes = self.git(["rev-parse", "HEAD^{tree}"])[1]
            rc, _, err = self.git(["-c", "core.hooksPath=/dev/null", "merge", "-q", "-s", "ours", "--no-ff",
                                   "origin/main", "-m", "Unir origin/main a main sin cambiar el árbol "
                                   "(autopublicación: lo suyo ya estaba dentro)"], timeout=120)
            if rc != 0:
                return False, "git merge: %s" % err[-200:]
            if self.git(["rev-parse", "HEAD^{tree}"])[1] != antes:
                self.git(["reset", "-q", "--keep", head])  # imposible con «ours»; --keep no pisa cambios sin commit
                return False, "el árbol cambió y lo deshice"
            return True, self.git(["rev-parse", "--short", "HEAD"])[1]
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
            f.close()

    def pruebas_python(self, sha):
        """(True|False|None, detalle). None = no se pudo probar ahora (reintentar en la próxima pasada).

        Sobre un árbol LIMPIO de `sha` (OPA1011b): en la Mac trabajan a la vez agentes con cambios
        sin commit en scripts/puente, y probar el árbol vivo vetaba commits buenos por trabajo ajeno a
        medias. Como se prueba ESE sha, que main avance mientras tanto ya no invalida el resultado."""
        import publicar as PUB
        if self.git(["rev-parse", "HEAD"])[1] != sha:
            return None, "main cambió antes de empezar las pruebas"
        py = PUB.python_de_pruebas()
        destino = os.path.join(CARPETA, "arbol-pruebas")
        arbol = arbol_limpio(self.raiz, sha, lambda a, timeout=180: self.git(a, timeout=timeout), destino)
        if not arbol:
            return None, "no pude preparar un árbol limpio de %s para las pruebas" % sha[:8]
        env = dict(PUB.entorno(), STARSEED_ROOT=arbol)
        try:
            for orden in ([py, "-m", "unittest", "discover", "-s", "scripts/puente", "-p", "test_*.py"],
                          [py, "-m", "pytest", "scripts/enjambre", "-q"]):
                try:
                    r = subprocess.run(orden, cwd=arbol, capture_output=True, text=True, timeout=900, env=env)
                except subprocess.TimeoutExpired:
                    return False, "las pruebas del puente pasaron de 15 min"
                if r.returncode != 0:
                    return False, ((r.stdout or "") + (r.stderr or ""))[-2400:]
        finally:
            quitar_arbol(self.raiz, arbol, lambda a, timeout=180: self.git(a, timeout=timeout))
        return True, "unittest y pytest en verde (árbol limpio de %s)" % sha[:8]

    def jev_opina(self, resumen):
        """{respuesta, confianza, medio} de Jev sobre el lote. Sin Jev, la regla («sí»)."""
        try:
            import decidir
            r = decidir.consultar("si-no", resumen,
                                  "Con las puertas que aún faltan, ¿es coherente publicar ya en producción estas "
                                  "tareas integradas de StarSeed OS?",
                                  quien="director-produccion", regla="si", dominio="produccion")
            return {"respuesta": r.get("respuesta"), "confianza": r.get("confianza") or r.get("p"),
                    "medio": r.get("medio")}
        except Exception:
            return {"respuesta": "sí", "confianza": None, "medio": "regla"}

    def peticion(self):
        """La petición de Genesis («revisar» o «saltar-jev»), una sola vez: se borra al leerla."""
        datos = _leer(PETICION, None)
        if datos is not None:
            try:
                os.remove(PETICION)
            except OSError:
                pass
        return datos if isinstance(datos, dict) else None

    def avisar(self, texto, tipo="informe"):
        try:
            import director_chat
            director_chat.publicar(texto, de="director-produccion", rol="director", tipo=tipo)
        except Exception:
            pass


def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


_RUIDO = ("salvavidas ·", "chore(memoria)")
_TAREA = re.compile(r"· ([A-Z]{1,6}\d{3,5}[A-Za-z]*): (.+)$")


def resumen_para_jev(asuntos, archivos):
    """Lo que Jev necesita para juzgar: las TAREAS integradas (no los commits de respaldo del
    enjambre, que parecían trabajo a medias) y qué puertas quedan. PURA."""
    tareas, direccion, ruido = [], [], 0
    for a in asuntos or []:
        if a.startswith(_RUIDO):
            ruido += 1
            continue
        mt = _TAREA.search(a)
        if mt:
            tareas.append("%s: %s" % (mt.group(1), mt.group(2)[:110]))
        else:
            direccion.append(a[:110])
    return {"tareas_integradas": tareas[:30], "commits_de_la_direccion": direccion[:10],
            "commits_de_respaldo_omitidos": ruido, "archivos": archivos,
            "puertas_ya_pasadas": ["análisis de secretos y de migraciones destructivas: limpio"],
            "puertas_que_vienen_despues": ["pruebas del puente en la Mac (unittest y pytest)",
                                           "CI en GitHub: tsc, vitest, núcleo mesh y next build",
                                           "push sin force", "despliegue de Vercel y humo en producción"],
            "nota": "Cada tarea pasó tsc y vitest en su rama antes de integrarse en main."}


def juicio_jev(opinion):
    """('frena'|'duda'|'sigue', confianza). Solo un «no» con certeza frena. PURA."""
    op = opinion or {}
    try:
        conf = float(op.get("confianza") or 0)
    except (TypeError, ValueError):
        conf = 0.0
    if str(op.get("respuesta")).strip().lower() not in ("no", "false"):
        return "sigue", conf
    if conf >= JEV_FRENA:
        return "frena", conf
    if conf >= JEV_DUDA:
        return "duda", conf
    return "sigue", conf


def _pct(x):
    return ("%.2f" % x).replace(".", ",")


# (PUB1029G) Un CI en rojo no se queda en un aviso: la extracción de los fallos es PURA y va a una
# cola del enjambre. Vitest: « FAIL  ruta.test.ts > grupo > prueba». unittest: «FAIL: p (mod.Cls.p)».
_FALLO_VITEST = re.compile(r"^\s*FAIL\s+(?P<ruta>[\w./@-]+\.\w+)\s*(?P<nombre>.*)$")
_FALLO_UNIT = re.compile(r"^(?:FAIL|ERROR): (?P<prueba>\S+) \((?P<ruta>\S+)\)\s*$")

REGLAS_CIR = (
    "Reglas de la casa: español con acentos en textos y comentarios; nada de `any`; arregla la CAUSA "
    "en el código (solo si la prueba es la que quedó vieja, arréglala y dilo en tu respuesta); sin "
    "claves ni cadenas con forma de clave en código ni pruebas; ≤ 3 archivos y ≤ 120 líneas por "
    "archivo; no toques archivos ajenos ni hagas push; corrígete con la prueba del archivo cambiado.")


def fallos_de_log(log):
    """PURA. Los encabezados de fallo del log del run en rojo. Una fila por encabezado, con hasta
    20 líneas siguientes como detalle; en unittest el archivo sale del `File "…" del traceback."""
    salida = []
    for _i, linea in enumerate((log or "").splitlines()):
        mu, mv = _FALLO_UNIT.match(linea), _FALLO_VITEST.match(linea)
        if mu:
            salida.append({"archivo": None, "nombre": "%s (%s)" % (mu.group("prueba"), mu.group("ruta")), "lineas": []})
        elif mv:
            nombre = (mv.group("nombre") or "").strip(" >")
            salida.append({"archivo": mv.group("ruta"), "nombre": nombre or mv.group("ruta"), "lineas": []})
        elif salida and linea.strip() and len(salida[-1]["lineas"]) < 20:
            salida[-1]["lineas"].append(linea.strip())
    previa_modulo, archivo_previo = None, None
    for h in salida:
        if not h["archivo"]:
            for l in h["lineas"]:
                mf = re.search(r'File "([^"]+)", line', l)
                if mf:
                    h["archivo"] = mf.group(1)
                    break
        modulo = ((h.get("nombre") or "").rsplit("(", 1)[-1].split(".")[0]
                  if "(" in (h.get("nombre") or "") else None)
        if not h["archivo"] and modulo and modulo == previa_modulo:
            h["archivo"] = archivo_previo  # unittest agrupa por módulo: hereda el archivo anterior
        if h["archivo"]:
            archivo_previo = h["archivo"]
        previa_modulo = modulo
        h["detalle"] = "\n".join(h.pop("lineas"))
    return salida


def _prompt_ci_rojo(nombres, archivo, detalle, url):
    """PURA. El enunciado de la tarea: prueba, archivo, las 20 primeras líneas del error y las reglas."""
    cuerpo = "\n".join((detalle or "").splitlines()[:20]) or "sin detalle en el log"
    return "\n\n".join([
        "El CI de GitHub del candidato de producción falló y la autopublicación está parada hasta que "
        "esta prueba vuelva al verde.",
        "Prueba: %s." % (" | ".join(nombres) if nombres else "sin nombre"),
        "Archivo: %s." % archivo,
        "Primeras líneas del fallo:\n%s" % cuerpo,
        "Run en rojo: %s." % (url or "sin url"),
        REGLAS_CIR])


def cola_ci_rojo(log, mmdd, previa, url=None):
    """PURA. La cola `cola-ci-rojo-<MMDD>.json`: UNA tarea por ARCHIVO de prueba que falla, id
    `CIR<MMDD><n>` (numeración que sigue a `previa`, la cola de hoy), prompt con el nombre de la
    prueba y las 20 primeras líneas del error, sin repetir un archivo que ya tenga tarea pendiente."""
    grupos = {}
    for h in fallos_de_log(log or ""):
        arch = (h.get("archivo") or "").strip()
        if not arch:
            continue
        g = grupos.setdefault(arch, {"nombres": [], "detalle": ""})
        if h.get("nombre") and len(g["nombres"]) < 3 and h["nombre"] not in g["nombres"]:
            g["nombres"].append(h["nombre"])
        if not g["detalle"]:
            g["detalle"] = h.get("detalle") or ""
    previa = [t for t in (previa if isinstance(previa, list) else []) if isinstance(t, dict)]
    ya = {a for t in previa for a in (t.get("archivos") or []) if isinstance(a, str)}
    usados = {str(t.get("id") or "") for t in previa}
    tareas = list(previa)
    for arch in sorted(grupos):
        if arch in ya:
            continue
        num = 1
        while "CIR%s%d" % (mmdd, num) in usados:
            num += 1
        tid = "CIR%s%d" % (mmdd, num)
        usados.add(tid)
        g = grupos[arch]
        tareas.append({"id": tid, "ola": "Ola CI-rojo %s · el CI del candidato falla" % mmdd,
                       "titulo": "Arreglar la prueba del CI: %s" % os.path.basename(arch),
                       "archivos": [arch], "depende": [],
                       "prompt": _prompt_ci_rojo(g["nombres"], arch, g["detalle"], url)})
    return tareas


# ── la pasada ────────────────────────────────────────────────────────────────
def pasada(m, est, ahora):
    est = dict(est or {})
    if not m.interruptor():
        return con_fase(est, "apagado", "Autopublicación apagada (Genesis · Ajustes).", ahora)
    if m.publicando_a_mano():
        return con_fase(est, "esperando", "Hay una publicación manual en curso; espero a que termine.", ahora)
    # (IND1029C) Solo publica y sube candidatos el líder de dirección; las demás neuronas miran.
    lf = getattr(m, "soy_lider", None)
    lider = lf() if callable(lf) else {"soy": True}
    if not (isinstance(lider, dict) and lider.get("soy")):
        return con_fase(est, "esperando", "espera: dirige %s." % quien_dirige(lider), ahora)
    m.git(["fetch", "-q", "origin", "main"], timeout=120)
    if est.get("fase") == "ci":
        return _seguir_ci(m, est, ahora)
    if est.get("fase") == "verificando":
        return _seguir_vercel(m, est, ahora)
    return _nuevo_lote(m, est, ahora)


def _nuevo_lote(m, est, ahora):
    head = m.git(["rev-parse", "HEAD"])[1]
    rc, n, _ = m.git(["rev-list", "--count", "origin/main..%s" % head])
    pendientes = int(n) if rc == 0 and n.isdigit() else 0
    if pendientes == 0:
        return con_fase(est, "al-dia", "Producción al día con main.", ahora, pendientes=0)
    # (2026-10-12) origin/main tiene que ser antecesor de main ANTES de gastar Jev, pruebas y CI:
    # si no, el CI pasaba, el push (solo avance rápido) se negaba con «rehago el lote» y la pasada
    # siguiente repetía todo. Así estuvo producción 47 h (10→12-10) tras perder main dos commits
    # ya publicados de S1010-EV-FONDO cuyo contenido había vuelto por otra vía.
    if m.git(["merge-base", "--is-ancestor", "origin/main", head])[0] != 0:
        return _divergido(m, est, head, pendientes, ahora)
    vetos = m.vetos_externos() if hasattr(m, "vetos_externos") else set()
    if head in vetos or head[:8] in vetos or head[:7] in vetos:
        return con_fase(est, "bloqueado", "Vetado desde Genesis: espero un commit nuevo.", ahora, sha=head, pendientes=pendientes)
    pet = m.peticion() if hasattr(m, "peticion") else None
    saltar_jev = False
    if pet and str(pet.get("sha") or head) == head and pet.get("accion") in ("revisar", "saltar-jev"):
        # Genesis («Revisar ahora» / «Publicar sin Jev esta vez»): solo levanta un veto de JEV;
        # los de las puertas deterministas (análisis, pruebas, CI, Vercel) no se tocan.
        motivo_veto = str((est.get("vetados") or {}).get(head) or "")
        if motivo_veto.startswith("Jev"):
            est["vetados"] = {k: v for k, v in (est.get("vetados") or {}).items() if k != head}
        saltar_jev = pet.get("accion") == "saltar-jev"
    if head in (est.get("vetados") or {}):
        motivo_veto = est["vetados"][head]
        cola = ("reviso de nuevo con el próximo commit o con «Publicar sin Jev esta vez»"
                if str(motivo_veto).startswith("Jev") else "espero a que llegue un commit nuevo")
        return con_fase(est, "bloqueado", "%s · %s" % (motivo_veto, cola), ahora, sha=head, pendientes=pendientes)
    if ahora - float(est.get("ultima_publicacion") or 0) < VENTANA_S:
        # (2026-10-08) Alex: «autopublicación tampoco, ya que aún hay pendientes». Estaba bien
        # (la ventana es a propósito) pero no lo decía: se dice CUÁNDO sale el lote.
        sale = time.strftime("%H:%M", time.localtime(float(est.get("ultima_publicacion") or 0) + VENTANA_S))
        return con_fase(est, "esperando", "Ventana de 20 min entre publicaciones: %d commit(s) en cola; "
                        "salen solos hacia las %s." % (pendientes, sale), ahora, pendientes=pendientes)
    if publicadas_hoy(est.get("historial"), ahora) >= MAX_DIA:
        return con_fase(est, "esperando", "Tope de %d publicaciones hoy." % MAX_DIA, ahora, pendientes=pendientes)

    # 1. Análisis del lote
    diff = m.git(["diff", "origin/main..%s" % head], timeout=300)[1]
    nombres = m.git(["diff", "--name-only", "origin/main..%s" % head])[1].splitlines()
    migs = {r: m.git(["show", "%s:%s" % (head, r)])[1] for r in nombres
            if r.startswith("supabase/migrations/") and r.endswith(".sql") and not r.endswith("_rollback.sql")}
    bloqueos = analizar_lote(diff, migs)
    if bloqueos:
        motivo = "análisis: " + "; ".join(bloqueos)
        # (2026-10-07) El mismo bloqueo con cada commit nuevo del enjambre llenaba el Chat
        # Director cada 5 min. Se avisa cuando cambia el motivo, no cuando cambia el sha.
        if not (est.get("fase") == "bloqueado" and est.get("detalle") == motivo):
            m.avisar("Autopublicación frenada (%s): %s." % (head[:8], "; ".join(bloqueos)), tipo="aviso")
        return vetar(est, head, motivo, ahora)
    asuntos = m.git(["log", "--format=%s", "origin/main..%s" % head])[1].splitlines()
    if saltar_jev:
        jev = {"decision": "saltado", "por": "genesis", "sha": head}
    else:
        opinion = m.jev_opina(resumen_para_jev(asuntos, len(nombres)))
        decision, conf = juicio_jev(opinion)
        jev = {"decision": decision, "respuesta": opinion.get("respuesta"), "confianza": conf,
               "medio": opinion.get("medio"), "sha": head}
        if decision == "frena":
            motivo = "Jev frenó el lote (seguro al %s)" % _pct(conf)
            if not (est.get("fase") == "bloqueado" and str(est.get("detalle") or "").startswith("Jev")):
                m.avisar("Autopublicación frenada (%s): Jev está seguro (%s) de que no conviene publicar este lote "
                         "ahora. En Genesis: «Publicar sin Jev esta vez» lo salta; las demás puertas siguen."
                         % (head[:8], _pct(conf)), tipo="aviso")
            est["jev"] = jev
            return vetar(est, head, motivo, ahora)
    est["jev"] = jev

    # 2. Pruebas del puente sobre ESE commit
    ok, detalle = m.pruebas_python(head)
    if ok is None:
        return con_fase(est, "esperando", "Reintento: %s." % detalle, ahora, pendientes=pendientes)
    if not ok:
        m.avisar("Autopublicación frenada (%s): pruebas del puente en rojo.\n%s" % (head[:8], detalle[-800:]), tipo="aviso")
        return vetar(est, head, "pruebas del puente en rojo", ahora, evidencia=detalle)

    # 3. CI en GitHub Actions sobre ese commit
    rc, _, err = m.git(["push", "--force", "origin", "%s:refs/heads/%s" % (head, RAMA_CANDIDATO)], timeout=300)
    if rc != 0:
        m.avisar("Autopublicación: no pude subir el candidato (%s): %s" % (head[:8], err[-300:]), tipo="aviso")
        return con_fase(est, "esperando", "No pude subir el candidato; reintento en la próxima pasada.", ahora)
    nota_jev = ""
    if jev.get("decision") == "duda":
        nota_jev = " Jev dudaba (%s), pero no frena por debajo de %s: deciden las puertas." % (
            _pct(jev.get("confianza") or 0), _pct(JEV_FRENA))
    elif jev.get("decision") == "saltado":
        nota_jev = " Jev saltado desde Genesis para este lote."
    m.avisar("Autopublicación: %d commit(s) (%s) pasaron el análisis y las pruebas del puente; CI en GitHub "
             "(tsc, vitest, next build) en marcha.%s" % (pendientes, head[:8], nota_jev))
    return con_fase(est, "ci", "CI en GitHub Actions: tsc, vitest, núcleo mesh y next build.", ahora,
                    sha=head, desde=ahora, pendientes=pendientes, asuntos=asuntos[:12], url=None)


def solo_ya_incluidos(cherry):
    """PURA. Con la salida de `git cherry <main> origin/main`: ¿todo lo que origin/main tiene y main
    no tiene ya está en main con otro sha («-» en cada línea)? Vacío = no hay nada que decidir."""
    lineas = [l for l in (cherry or "").splitlines() if l.strip()]
    return bool(lineas) and all(l.lstrip().startswith("-") for l in lineas)


def _divergido(m, est, head, pendientes, ahora):
    """origin/main no es antecesor de main. Si su contenido ya está en main, se une sin cambiar el
    árbol (`Medios.unir_origen`) y el lote sale en la próxima pasada; si origin trae algo que main no
    tiene, se frena y lo decide un director. Nunca se publica con force."""
    cherry = m.git(["cherry", head, "origin/main"])[1]
    if solo_ya_incluidos(cherry) and hasattr(m, "unir_origen"):
        ok, detalle = m.unir_origen(head)
        if ok:
            m.avisar("Autopublicación: origin/main no era antecesor de main, pero lo suyo ya estaba dentro; "
                     "lo uní sin cambiar el árbol (%s). El lote sale en la próxima pasada." % detalle)
            return con_fase(est, "al-dia", "Uní origin/main a main sin cambiar el árbol; el lote sale en la "
                            "próxima pasada.", ahora, sha=None, pendientes=pendientes)
        motivo = "origin/main no es antecesor de main y no pude unirlo (%s)" % detalle
    else:
        nuevos = sum(1 for l in (cherry or "").splitlines() if l.lstrip().startswith("+"))
        motivo = ("origin/main tiene %d commit(s) que main no tiene: lo decide un director "
                  "(no se publica con force)" % nuevos)
    if not (est.get("fase") == "bloqueado" and est.get("detalle") == motivo):
        m.avisar("Autopublicación frenada (%s): %s." % (head[:8], motivo), tipo="aviso")
    return con_fase(est, "bloqueado", motivo, ahora, sha=head, pendientes=pendientes)


def _ci_rojo_a_cola(m, log, ahora, url, sha):
    """(PUB1029G) Cuando el CI sale en rojo, el veto espera y TAMBIÉN escribe `olas/cola-ci-rojo-<MMDD>.json`
    con una tarea por archivo de prueba fallido, para que el enjambre arregle la causa. Nunca toca main
    ni el candidato de producción."""
    mmdd = time.strftime("%m%d", time.localtime(ahora))
    nombre_cola = "cola-ci-rojo-%s.json" % mmdd
    previa = m.leer_cola(nombre_cola) if hasattr(m, "leer_cola") else []
    previa = previa if isinstance(previa, list) else []
    tareas = cola_ci_rojo(log, mmdd, previa, url)
    nuevas = len(tareas) - len(previa)
    if not nuevas or not hasattr(m, "guardar_cola"):
        return
    m.guardar_cola(nombre_cola, tareas)
    m.avisar("Autopublicación (%s): CI en rojo; escribí %d tarea(s) nuevas en olas/%s para que el "
             "enjambre arregle las pruebas." % (sha[:8], nuevas, nombre_cola), tipo="aviso")


def _seguir_ci(m, est, ahora):
    sha = est.get("sha")
    datos = m.gh("repos/%s/actions/workflows/ci.yml/runs?head_sha=%s&per_page=5" % (REPO, sha)) or {}
    estado, url, run_id = estado_ci(datos.get("workflow_runs"), sha)
    espera = ahora - float(est.get("desde") or ahora)
    if estado in ("sin-run", "esperando"):
        if espera > CI_TOPE_S:
            m.avisar("Autopublicación: el CI de %s no terminó en 50 min (%s)." % (sha[:8], url or "sin run"), tipo="aviso")
            return vetar(est, sha, "CI sin terminar en 50 min", ahora, url=url)
        return con_fase(est, "ci", "CI en marcha (%d min)." % (espera // 60), ahora, url=url)
    if estado == "rojo":
        log = m.log_fallido(run_id) if run_id else ""
        _ci_rojo_a_cola(m, log, ahora, url, sha)
        m.avisar("Autopublicación frenada (%s): el CI falló. %s\n%s" % (sha[:8], url or "", log[-1200:]), tipo="aviso")
        return vetar(est, sha, "CI en rojo", ahora, url=url, evidencia=log)
    # verde → publicar ESE commit, solo si es avance rápido
    if m.git(["merge-base", "--is-ancestor", "origin/main", sha])[0] != 0:
        return con_fase(est, "al-dia", "origin/main ya no es antecesor del candidato: rehago el lote.", ahora, sha=None)
    rc, _, err = m.git(["push", "origin", "%s:main" % sha], timeout=300)
    if rc != 0:
        m.avisar("Autopublicación: GitHub rechazó el push de %s: %s" % (sha[:8], err[-400:]), tipo="aviso")
        return vetar(est, sha, "push rechazado", ahora, url=url)
    m.avisar("Autopublicación: %s publicado en origin/main con el CI en verde (%s). Verifico Vercel." % (sha[:8], url or ""))
    return con_fase(est, "verificando", "Esperando el despliegue de producción en Vercel.", ahora,
                    desde=ahora, url=url, ultima_publicacion=ahora)


def _seguir_vercel(m, est, ahora):
    sha = est.get("sha")
    espera = ahora - float(est.get("desde") or ahora)
    despliegues = m.gh("repos/%s/deployments?sha=%s&environment=Production&per_page=3" % (REPO, sha)) or []
    estados = m.gh("repos/%s/deployments/%s/statuses?per_page=3" % (REPO, despliegues[0]["id"])) if despliegues else []
    estado, url = estado_vercel(estados or [])
    if estado == "esperando":
        if espera > VERCEL_TOPE_S:
            m.avisar("Autopublicación: Vercel no confirmó %s en 45 min." % sha[:8], tipo="aviso")
            return vetar(est, sha, "Vercel sin confirmar en 45 min", ahora)
        return con_fase(est, "verificando", "Vercel compilando (%d min)." % (espera // 60), ahora)
    if estado == "fallo":
        m.avisar("Autopublicación: Vercel no pudo construir %s; producción sigue sirviendo la versión anterior. %s"
                 % (sha[:8], url or ""), tipo="aviso")
        return vetar(est, sha, "build de Vercel en rojo", ahora, url=url)
    malas = ["%s→%s" % (r, c) for r in RUTAS_HUMO for c in [m.http(WEB + r)] if not (200 <= c < 400)]
    hist = list(est.get("historial") or [])[-29:]
    dia = time.strftime("%Y-%m-%d", time.localtime(ahora))
    if malas:
        m.avisar("Autopublicación: %s está en producción pero el humo falla (%s). Revisa %s" % (sha[:8], ", ".join(malas), WEB),
                 tipo="aviso")
        hist.append({"sha": sha, "resultado": "humo-fallido", "dia": dia, "url": url})
        return con_fase(est, "bloqueado", "En producción con humo fallido: %s" % ", ".join(malas), ahora, historial=hist)
    hist.append({"sha": sha, "resultado": "publicado", "dia": dia, "url": url, "commits": est.get("pendientes")})
    m.avisar("Autopublicación completa: %s en %s · %s commit(s) · Vercel listo y humo en verde (%s)."
             % (sha[:8], WEB, est.get("pendientes"), ", ".join(RUTAS_HUMO)))
    aviso_flujos = False
    motivo = ""
    try:
        import produccion_webhooks as pw
        asuntos = est.get("asuntos") or []
        tareas_ids = []
        for a in asuntos:
            mt = _TAREA.search(a)
            if mt:
                tareas_ids.append(mt.group(1))
        medios = ["web"]
        res = pw.emitir("produccion.publicada", {"sha": sha, "medios": medios, "tareas": tareas_ids})
        aviso_flujos = bool(res.get("enviado"))
        motivo = res.get("motivo") or ""
    except Exception:
        aviso_flujos = False
        motivo = "emisión falló"
    return con_fase(est, "publicado", "Publicado y verificado en producción.", ahora, historial=hist, sha=sha, aviso_flujos=aviso_flujos, motivo=motivo)


def una_pasada(como_json=False):
    os.makedirs(os.path.dirname(CERROJO), exist_ok=True)
    with open(CERROJO, "a+") as cerrojo:
        try:
            fcntl.flock(cerrojo, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("otra pasada de la autopublicación sigue en marcha")
            return None
        est = pasada(Medios(), _leer(ESTADO, {}), time.time())
        _escribir(ESTADO, est)
    print(json.dumps(est, ensure_ascii=False) if como_json else
          "[%s] %s · %s" % (time.strftime("%H:%M"), est.get("fase"), est.get("detalle")), flush=True)
    return est


def main(argv=None):
    """`--bucle` (el servicio de launchd): una pasada cada 5 min, sin cerrojos mientras duerme.
    Sin él, una sola pasada (la usa Genesis y quien quiera mirar)."""
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--bucle" not in argv:
        una_pasada("--json" in argv)
        return 0
    while True:
        # (2026-10-07) Cada pasada en un proceso nuevo: el servicio vive días y, con los módulos
        # cargados al arrancar, seguía usando un escáner de secretos ya corregido en el repo.
        try:
            subprocess.run([sys.executable, os.path.abspath(__file__)], timeout=3600)
        except Exception as e:  # noqa: BLE001 — una pasada rota no tumba al director
            print("[%s] pasada rota: %s: %s" % (time.strftime("%H:%M"), type(e).__name__, e), flush=True)
        time.sleep(300)


if __name__ == "__main__":
    raise SystemExit(main())
