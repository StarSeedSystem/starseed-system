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


# ── puro ──────────────────────────────────────────────────────────────────────
def encendido(datos):
    return isinstance(datos, dict) and datos.get("activo") is True


# Lo idempotente y lo que solo NOMBRA un borrado no borra nada: recrear una política o un trigger
# (`drop … if exists` + `create`), `on delete cascade` de una clave foránea, `for delete` de una
# política o `grant … delete`. Sin esto, TODAS nuestras migraciones (estilo os_canales) parecían
# destructivas y ningún lote con una tabla nueva se habría publicado nunca.
_IDEMPOTENTE = re.compile(
    r"drop\s+(?:policy|trigger|function|view|index)\s+if\s+exists[^;]*;"
    r"|on\s+delete\s+(?:cascade|set\s+null|set\s+default|restrict|no\s+action)"
    r"|for\s+(?:select|insert|update|delete|all)\b"
    r"|grant\s+[^;]*;|revoke\s+[^;]*;", re.I)


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


def vetar(est, sha, motivo, ahora, url=None):
    vetados = dict(est.get("vetados") or {})
    vetados[sha] = motivo
    # Solo los 30 últimos: un veto viejo ya no puede volver a ser HEAD.
    vetados = dict(list(vetados.items())[-30:])
    hist = list(est.get("historial") or [])[-29:] + [{"sha": sha, "resultado": "bloqueado", "motivo": motivo,
                                                     "dia": time.strftime("%Y-%m-%d", time.localtime(ahora)), "url": url}]
    return con_fase(est, "bloqueado", motivo, ahora, sha=sha, vetados=vetados, historial=hist, url=url)


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
            return "\n".join(lineas[-25:])[-2500:]
        except Exception:
            return ""

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

    def vetos_externos(self):
        """Vetos de Genesis o de otros directores (`~/.starseed/produccion/vetos.json`, por sha)."""
        datos = _leer(os.path.join(CARPETA, "vetos.json"), {})
        return set(datos) if isinstance(datos, dict) else set()

    def publicando_a_mano(self):
        return (_leer(DIARIO_MANUAL, {}) or {}).get("estado") == "corriendo"

    def pruebas_python(self, sha):
        """(True|False|None, detalle). None = main se movió durante las pruebas: reintentar."""
        import publicar as PUB
        if self.git(["rev-parse", "HEAD"])[1] != sha:
            return None, "main cambió antes de empezar las pruebas"
        py = PUB.python_de_pruebas()
        env = PUB.entorno()
        for orden in ([py, "-m", "unittest", "discover", "-s", "scripts/puente", "-p", "test_*.py"],
                      [py, "-m", "pytest", "scripts/enjambre", "-q"]):
            try:
                r = subprocess.run(orden, cwd=self.raiz, capture_output=True, text=True, timeout=900, env=env)
            except subprocess.TimeoutExpired:
                return False, "las pruebas del puente pasaron de 15 min"
            if r.returncode != 0:
                return False, ((r.stdout or "") + (r.stderr or ""))[-1500:]
        if self.git(["rev-parse", "HEAD"])[1] != sha:
            return None, "main cambió mientras corrían las pruebas"
        return True, "unittest y pytest en verde"

    def jev_frena(self, resumen):
        """True solo si Jev dice «no» con p ≥ 0,8. Sin Jev, sigue (la regla es publicar)."""
        try:
            import decidir
            r = decidir.consultar("si-no", {"lote": resumen}, "¿Es coherente publicar ya este lote de StarSeed OS en producción?",
                                  quien="director-produccion", regla="si", dominio="produccion")
            return r.get("respuesta") in ("no", False) and float(r.get("confianza") or r.get("p") or 0) >= 0.8
        except Exception:
            return False

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


# ── la pasada ────────────────────────────────────────────────────────────────
def pasada(m, est, ahora):
    est = dict(est or {})
    if not m.interruptor():
        return con_fase(est, "apagado", "Autopublicación apagada (Genesis · Ajustes).", ahora)
    if m.publicando_a_mano():
        return con_fase(est, "esperando", "Hay una publicación manual en curso; espero a que termine.", ahora)
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
    vetos = m.vetos_externos() if hasattr(m, "vetos_externos") else set()
    if head in vetos or head[:8] in vetos or head[:7] in vetos:
        return con_fase(est, "bloqueado", "Vetado desde Genesis: espero un commit nuevo.", ahora, sha=head, pendientes=pendientes)
    if head in (est.get("vetados") or {}):
        return con_fase(est, "bloqueado", "%s · espero a que llegue un commit nuevo" % est["vetados"][head], ahora,
                        sha=head, pendientes=pendientes)
    if ahora - float(est.get("ultima_publicacion") or 0) < VENTANA_S:
        return con_fase(est, "esperando", "Ventana de 20 min entre publicaciones: %d commit(s) en cola." % pendientes,
                        ahora, pendientes=pendientes)
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
    if m.jev_frena({"commits": asuntos[:40], "archivos": len(nombres), "pendientes": pendientes}):
        m.avisar("Autopublicación frenada (%s): Jev no ve coherente publicar este lote ahora." % head[:8], tipo="aviso")
        return vetar(est, head, "Jev frenó el lote", ahora)

    # 2. Pruebas del puente sobre ESE commit
    ok, detalle = m.pruebas_python(head)
    if ok is None:
        return con_fase(est, "esperando", "Reintento: %s." % detalle, ahora, pendientes=pendientes)
    if not ok:
        m.avisar("Autopublicación frenada (%s): pruebas del puente en rojo.\n%s" % (head[:8], detalle[-800:]), tipo="aviso")
        return vetar(est, head, "pruebas del puente en rojo", ahora)

    # 3. CI en GitHub Actions sobre ese commit
    rc, _, err = m.git(["push", "--force", "origin", "%s:refs/heads/%s" % (head, RAMA_CANDIDATO)], timeout=300)
    if rc != 0:
        m.avisar("Autopublicación: no pude subir el candidato (%s): %s" % (head[:8], err[-300:]), tipo="aviso")
        return con_fase(est, "esperando", "No pude subir el candidato; reintento en la próxima pasada.", ahora)
    m.avisar("Autopublicación: %d commit(s) (%s) pasaron el análisis y las pruebas del puente; CI en GitHub "
             "(tsc, vitest, next build) en marcha." % (pendientes, head[:8]))
    return con_fase(est, "ci", "CI en GitHub Actions: tsc, vitest, núcleo mesh y next build.", ahora,
                    sha=head, desde=ahora, pendientes=pendientes, asuntos=asuntos[:12], url=None)


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
        m.avisar("Autopublicación frenada (%s): el CI falló. %s\n%s" % (sha[:8], url or "", log[-1200:]), tipo="aviso")
        return vetar(est, sha, "CI en rojo", ahora, url=url)
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
    return con_fase(est, "publicado", "Publicado y verificado en producción.", ahora, historial=hist, sha=sha)


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
