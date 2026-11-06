#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de lanzamientos: lleva cada versión nativa de «lista terminada» a «lanzada en todos los medios».

Contrato: architecture/centro-versiones-1105.md (§2 pasos, §3 autorreparación). Las decisiones son PURAS
(`lanzamientos_logica.py`); aquí solo se reúnen hechos (git, gh, http) y se actúa. Corre en cada pasada de
la autopublicación (`autopublicar.py --bucle`, proceso nuevo cada 5 min) y solo en la neurona líder.

  python3 scripts/puente/director_lanzamientos.py           # una pasada
  python3 scripts/puente/director_lanzamientos.py --json    # una pasada, estado en JSON

Lo que NO hace nunca: una versión mayor, `push --force`, borrar una etiqueta o una release, tocar un secreto.
"""
import fcntl
import json
import os
import re
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
import autopublicar as AP  # noqa: E402
import lanzamientos_logica as L  # noqa: E402

RAIZ = AP.RAIZ
CARPETA = AP.CARPETA
ESTADO = os.path.join(CARPETA, "lanzamientos-estado.json")
PETICION = os.path.join(CARPETA, "lanzamientos-peticion.json")
INTERRUPTOR = os.path.join(CARPETA, "lanzamientos.json")
CONFIG = os.path.join(RAIZ, "config", "lanzamientos.json")
CERROJO = os.path.expanduser("~/.starseed/cerrojos/lanzamientos.lock")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
#: Donde el revisor deja las colas que ya pasó a la tanda viva: la lista del lanzamiento sigue ahí.
COLAS_FUENTE = os.path.join(RAIZ, "starseed_memory_root", "colas-fuente")
ARCHIVOS_VERSION = ("native/src-tauri/tauri.conf.json", "native/src-tauri/Cargo.toml", "src/lib/version/os-release.ts")
_TID = re.compile(r"\b([A-Z]{1,7}\d{3,5}[A-Za-z0-9-]*)\b")


class Medios(AP.Medios):
    def sh(self, args, timeout=180):
        try:
            r = subprocess.run(args, cwd=self.raiz, capture_output=True, text=True, timeout=timeout)
            return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
        except Exception as e:  # noqa: BLE001
            return 1, "", "%s: %s" % (type(e).__name__, e)

    def gh_json(self, args, timeout=120):
        rc, out, _ = self.sh(["gh"] + args + ["--repo", L.REPO], timeout)
        try:
            return json.loads(out) if rc == 0 and out else None
        except ValueError:
            return None

    def leer(self, ruta, defecto):
        return AP._leer(ruta, defecto)

    def escribir(self, ruta, datos):
        AP._escribir(ruta, datos)


def _paso(est, fase, detalle, ahora, **mas):
    est = dict(est)
    if est.get("fase") != fase:
        est.setdefault("pasos", []).append({"fase": fase, "t": ahora, "detalle": detalle})
        est["pasos"] = est["pasos"][-60:]
    est.update(fase=fase, detalle=detalle, t=ahora, **mas)
    return est


def _atascado(m, est, detalle, ahora, **mas):
    if est.get("fase") != "atascado":
        m.avisar("Lanzamiento %s atascado: %s" % (est.get("version") or "", detalle), tipo="alerta")
        mas.setdefault("volver_a", est.get("fase"))  # «Reintentar paso» del panel vuelve aquí
    return _paso(est, "atascado", detalle, ahora, **mas)


def _version_actual(m):
    try:
        return json.loads(open(os.path.join(m.raiz, ARCHIVOS_VERSION[0]), encoding="utf-8").read())["version"]
    except Exception:
        return None


def _ids_en_main(m, n=3000):
    _, out, _ = m.git(["log", "--format=%s", "-n", str(n), "origin/main"], timeout=60)
    return {x for linea in out.splitlines() if not linea.lower().startswith("salvavidas")
            for x in _TID.findall(linea)}


def _titulo_en_main(m, tid, n=400):
    """El título del commit de `tid` en origin/main («… · TID: título» → «título»), o ""."""
    _, out, _ = m.git(["log", "--format=%s", "-n", str(n), "origin/main"], timeout=60)
    for linea in out.splitlines():
        hallado = re.search(r"\b%s: (.+)$" % re.escape(tid), linea)
        if hallado:
            return hallado.group(1).strip()
    return ""


def _lista(m, cfg):
    tareas = []
    for nombre in cfg.get("colas") or []:
        datos = m.leer(os.path.join(OLAS, nombre), None)
        if not datos:  # el revisor la movió a colas-fuente/ al pasarla a la tanda viva
            datos = m.leer(os.path.join(COLAS_FUENTE, nombre), [])
        tareas += datos if isinstance(datos, list) else (datos or {}).get("tareas", [])
    return L.lista_terminada(tareas, m.leer(PROGRESO, {}), _ids_en_main(m))


def _auto(m, cfg):
    datos = m.leer(INTERRUPTOR, {}) or {}
    return bool(datos.get("auto", cfg.get("auto_por_defecto", False)))


def _preparar(m, est, ahora):
    """§2.3: sube la versión, prueba y hace el commit «Lanzamiento vX.Y.Z» bajo el cerrojo de commits."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("cs", os.path.join(m.raiz, "scripts/puente/commit-seguro.py"))
    cs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cs)
    v = est["version"]
    _, ultimo, _ = m.git(["describe", "--tags", "--abbrev=0", "--match", "v*", "origin/main"], timeout=30)
    rango = ("%s..origin/main" % ultimo) if ultimo else "-n200"
    _, asuntos, _ = m.git(["log", "--format=%s", rango], timeout=60)
    notas = L.notas_de(asuntos.splitlines(), v)
    if est.get("version_sin_lanzar") and est.get("notas"):
        # (1106) Parche de una versión que se atascó y nunca se lanzó: lleva sus notas y lo arreglado.
        notas = L.notas_de_parche(est["notas"], est["version_sin_lanzar"], v, est.get("arreglo_titulo") or "") or notas
    if not cs.esperar_momento_seguro(tope_s=600):
        return _paso(est, "preparando", "espero un momento seguro para el commit de versión", ahora)
    with open(cs.CERROJO, "a") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        textos = {r: open(os.path.join(m.raiz, r), encoding="utf-8").read() for r in ARCHIVOS_VERSION}
        try:
            nuevos = L.aplicar_version(textos, v, time.strftime("%Y-%m-%d", time.localtime(ahora)), notas)
        except ValueError as e:
            return _atascado(m, est, "no pude subir la versión: %s" % e, ahora)
        for r, s in nuevos.items():
            open(os.path.join(m.raiz, r), "w", encoding="utf-8").write(s)
        rc, out, err = m.sh([os.path.join(m.raiz, "node_modules/.bin/vitest"), "run",
                             "src/lib/__tests__/os-release.test.ts"], timeout=600)
        if rc:
            m.git(["checkout", "--"] + list(ARCHIVOS_VERSION))
            return _atascado(m, est, "la prueba de versión salió en rojo: %s" % (out or err)[-300:], ahora)
        m.git(["add"] + list(ARCHIVOS_VERSION))
        rc, _, err = m.git(["commit", "-m", "Lanzamiento v%s · %s\n\nContrato: architecture/centro-versiones-1105.md"
                            % (v, notas[:200]), "--"] + list(ARCHIVOS_VERSION))
        if rc:
            m.git(["checkout", "--"] + list(ARCHIVOS_VERSION))
            return _atascado(m, est, "commit de versión fallido: %s" % err[-200:], ahora)
        _, sha, _ = m.git(["rev-parse", "HEAD"])
    return _paso(est, "esperando-publicacion", "versión %s preparada (%s): espero a que se publique" % (v, sha[:9]),
                 ahora, preparado_sha=sha, notas=notas)


def _etiquetar(m, est, cfg, ahora):
    v, sha = est["version"], est["preparado_sha"]
    etiqueta = "v" + v
    rc, _, _ = m.git(["merge-base", "--is-ancestor", sha, "origin/main"], timeout=30)
    if rc:
        return _paso(est, "esperando-publicacion", "el commit de versión aún no está en origin/main", ahora)
    rc_t, existe, _ = m.git(["ls-remote", "--tags", "origin", etiqueta], timeout=60)
    if not existe:
        m.git(["tag", "-a", etiqueta, sha, "-m", "StarSeed OS %s" % v])
        rc, _, err = m.git(["push", "origin", "refs/tags/%s" % etiqueta], timeout=120)
        if rc:
            return _atascado(m, est, "no pude subir la etiqueta %s: %s" % (etiqueta, err[-200:]), ahora)
    runs = m.gh_json(["run", "list", "--workflow", cfg.get("workflow", "native-build.yml"), "--branch", etiqueta,
                      "--json", "databaseId,status,conclusion,url", "--limit", "3"]) or []
    # Tras regenerar un medio, el run nuevo tarda en aparecer: no se confunde con el anterior.
    runs = [r for r in runs if r.get("databaseId") != est.get("run_previo")]
    if not runs:
        return _paso(est, "etiquetando", "etiqueta %s subida: espero a que arranque el workflow" % etiqueta, ahora)
    return _paso(est, "compilando", "compilando %s en GitHub" % etiqueta, ahora,
                 run=runs[0]["databaseId"], run_url=runs[0].get("url"), compilando_desde=ahora, jobs=[])


def _compilar(m, est, cfg, ahora):
    datos = m.gh_json(["run", "view", str(est["run"]), "--json", "status,conclusion,jobs,url"]) or {}
    est = dict(est, jobs=L.pasos_de_jobs(datos.get("jobs")))
    if datos.get("status") != "completed":
        if ahora - (est.get("compilando_desde") or ahora) > cfg.get("ci_tope_min", 75) * 60:
            return _atascado(m, est, "el workflow pasó de %s min" % cfg.get("ci_tope_min", 75), ahora)
        hechos = sum(1 for j in est["jobs"] if j["estado"] in ("ok", "omitido"))
        return dict(est, detalle="compilando: %d de %d jobs listos" % (hechos, len(est["jobs"])), t=ahora)
    fallidos = [j for j in est["jobs"] if j["estado"] == "fallo" and j["medio"] != "ios"]
    if not fallidos:
        return _paso(est, "verificando-archivos", "workflow en verde: compruebo cada archivo", ahora)
    clases = []
    for j in fallidos:
        _, log, _ = m.sh(["gh", "run", "view", "--job", str(j["id"]), "--log-failed", "--repo", L.REPO], timeout=120)
        clase, motivo = L.clasificar_fallo(log)
        clases.append((j, clase, motivo, log))
    if any(c == "credencial" for _, c, _, _ in clases):
        return _atascado(m, est, "una credencial falla (%s): te toca a ti, Alex"
                         % next(mo for _, c, mo, _ in clases if c == "credencial"), ahora)
    if all(c in ("reintentar", "sin-firma") for _, c, _, _ in clases) and est.get("reintentos", 0) < cfg.get(
            "reintentos_job", 2):
        m.sh(["gh", "run", "rerun", str(est["run"]), "--failed", "--repo", L.REPO], timeout=60)
        return _paso(est, "compilando", "reintento %d de los jobs fallidos (%s)" % (
            est.get("reintentos", 0) + 1, "; ".join(mo for _, _, mo, _ in clases)[:200]), ahora,
            reintentos=est.get("reintentos", 0) + 1, compilando_desde=ahora)
    tid = _tarea_de_arreglo(m, est, clases)
    return _atascado(m, est, "error de código en %s: tarea %s al enjambre" % (
        ", ".join(sorted({j["medio"] or j["job"] for j, *_ in clases})), tid), ahora, arreglo=tid)


def _tarea_de_arreglo(m, est, clases):
    v = est["version"]
    tid = "LZ%sA" % v.replace(".", "")
    nombre = "cola-lanzamiento-%s.json" % v
    ruta = os.path.join(OLAS, nombre)
    cola = m.leer(ruta, [])
    if not any(t.get("id") == tid for t in cola):
        detalle = "\n\n".join("Job «%s» (%s): %s\n%s" % (j["job"], c, mo, (log or "")[-2500:]) for j, c, mo, log in clases)
        cola.append({"id": tid, "ola": "Lanzamiento v%s" % v, "origen": "lanzamientos", "depende": [],
                     "titulo": "Lanzamiento v%s · arreglar el build nativo que falla" % v,
                     "archivos": ["native/src-tauri/src/lib.rs"],
                     "prompt": "Contrato: `architecture/centro-versiones-1105.md` §3 y "
                               "`architecture/apps-nativas-segundo-plano.md`.\n\nEl workflow `native-build.yml` "
                               "de la etiqueta v%s falló por un error de código. Arregla la causa en `native/` (como "
                               "mucho 3 archivos; puedes cambiar la lista de archivos de esta tarea si el error está "
                               "en otro). Nunca toques secretos, firmas ni el workflow de firma.\n\n%s" % (v, detalle)})
        m.escribir(ruta, cola)
    return tid


def _verificar_archivos(m, est, cfg, ahora):
    etiqueta = "v" + est["version"]
    rel = m.gh_json(["release", "view", etiqueta, "--json", "assets,isDraft,url"]) or {}
    publicados = {a["name"]: a.get("size") or 0 for a in rel.get("assets") or []}
    verif = L.verificar_archivos(L.archivos_esperados(est["version"]), publicados)
    for nombre in L.archivos_esperados(est["version"])["canales"]:
        if nombre in publicados:
            _, texto, _ = m.sh(["gh", "release", "download", etiqueta, "--pattern", nombre, "--output", "-",
                                "--repo", L.REPO], timeout=60)
            problemas = L.verificar_canal(texto, est["version"], publicados)
            if problemas:
                verif["canales"]["estado"] = "atascado"
                verif["canales"].setdefault("problemas", []).extend("%s: %s" % (nombre, p) for p in problemas)
    est = dict(est, medios=dict(est.get("medios") or {}, **verif), release_url=rel.get("url"))
    bloquean = L.bloquean_publicacion(verif)
    if not bloquean:
        return _paso(est, "publicando", "todos los archivos están y pesan lo que deben", ahora)
    if est.get("regeneraciones", 0) < cfg.get("reintentos_job", 2):
        plataformas = sorted({L.PLATAFORMA_DE_MEDIO[b] for b in bloquean if b in L.PLATAFORMA_DE_MEDIO})
        m.sh(["gh", "workflow", "run", cfg.get("workflow", "native-build.yml"), "--ref", etiqueta, "-f",
              "plataformas=%s" % ",".join(plataformas), "-f", "etiqueta=%s" % etiqueta, "--repo", L.REPO], timeout=60)
        return _paso(est, "etiquetando", "faltan archivos de %s: los regenero" % ", ".join(bloquean), ahora,
                     regeneraciones=est.get("regeneraciones", 0) + 1, run_previo=est.get("run"))
    return _atascado(m, est, "siguen faltando archivos de %s" % ", ".join(bloquean), ahora)


def _publicar(m, est, ahora):
    etiqueta = "v" + est["version"]
    rc, _, err = m.sh(["gh", "release", "edit", etiqueta, "--draft=false", "--latest", "--repo", L.REPO], timeout=60)
    if rc:
        return _atascado(m, est, "no pude publicar la release: %s" % err[-200:], ahora)
    return _paso(est, "verificando-medios", "release publicada: compruebo cada descarga", ahora)


def _verificar_medios(m, est, ahora):
    base = "https://github.com/%s/releases/latest/download/" % L.REPO
    malos = []
    for medio, nombres in L.archivos_esperados(est["version"], ("os",)).items():
        if medio != "ios" and m.http(base + nombres[0]) != 200:
            malos.append(medio)
    if malos:
        return dict(est, detalle="aún no descargan: %s (la CDN tarda unos minutos)" % ", ".join(malos), t=ahora)
    hist = list(est.get("historial") or []) + [{"t": ahora, "tipo": "lanzado", "version": est["version"]}]
    m.avisar("StarSeed OS v%s lanzada en macOS, Windows, Linux y Android (iOS: PWA). %s"
             % (est["version"], est.get("release_url") or ""), tipo="informe")
    return _paso(est, "lanzado", "v%s lanzada y verificada en cada medio" % est["version"], ahora,
                 historial=hist[-30:], version_sin_lanzar=None, arreglo_titulo=None)


def pasada(m, est, cfg, ahora):
    est = dict(est or {})
    if est.get("fase") not in L.FASES + ("atascado",):
        est["fase"] = "esperando-lista"  # estado nuevo o roto: se empieza por el principio, sin adivinar
    peticion = m.leer(PETICION, None)
    if peticion:
        try:
            os.remove(PETICION)
        except OSError:
            pass
        accion = (peticion or {}).get("accion")
        if accion in ("pausar", "reanudar"):
            est["pausado"] = accion == "pausar"
        elif accion == "lanzar" and est.get("fase") in ("esperando-lista", "lanzado", None):
            est = _paso(est, "esperando-publicacion", "lanzamiento pedido desde MetaGenesis", ahora, manual=True)
        elif accion == "reintentar" and est.get("fase") == "atascado":
            est = _paso(est, est.get("volver_a") or "esperando-publicacion", "reintento pedido", ahora)
    if est.get("pausado"):
        return dict(est, detalle="en pausa (MetaGenesis)", t=ahora)
    dirijo, porque = m.lider(ahora)
    if not dirijo:
        return dict(est, detalle="espera: %s" % porque, t=ahora)
    # Solo main: `--tags` trae objetos de etiquetas viejas y pasó de 120 s (04-11). Las etiquetas
    # remotas se miran con `ls-remote` cuando hace falta.
    m.git(["fetch", "-q", "origin", "main"], timeout=120)
    fase = est.get("fase")
    if fase in ("esperando-lista", "lanzado"):
        if not _auto(m, cfg):
            return dict(est, detalle="lanzamiento automático apagado: usa «Lanzar versión»", t=ahora)
        terminada, pendientes = _lista(m, cfg)
        if not terminada:
            detalle = ("la lista no ha terminado: %d tarea(s)" % len(pendientes) if pendientes else
                       "la lista de tareas (%s) aún no tiene tareas" % ", ".join(cfg.get("colas") or []))
            return dict(est, fase="esperando-lista", t=ahora, pendientes=pendientes, detalle=detalle)
        if fase == "lanzado" and est.get("lista_lanzada") == cfg.get("colas"):
            return dict(est, detalle="esta lista ya se lanzó", t=ahora)
        _, lista_sha, _ = m.git(["rev-parse", "origin/main"])
        est = _paso(est, "esperando-publicacion", "lista terminada", ahora, lista_lanzada=cfg.get("colas"),
                    lista_sha=lista_sha, version_sin_lanzar=None, arreglo_titulo=None)
        fase = est["fase"]
    if fase == "esperando-publicacion":
        autopub = m.leer(AP.ESTADO, {})
        objetivo = est.get("preparado_sha") or est.get("lista_sha")
        ultimo = L.ultimo_publicado(autopub)
        contiene = bool(objetivo and ultimo) and m.git(["merge-base", "--is-ancestor", objetivo, ultimo],
                                                       timeout=30)[0] == 0
        ok, motivo = L.publicado_y_verificado(autopub, objetivo, contiene)
        if not ok:
            return dict(est, detalle="espero publicación: %s" % motivo, t=ahora)
        if est.get("preparado_sha"):
            return _etiquetar(m, _paso(est, "etiquetando", "publicada la versión: etiqueto", ahora), cfg, ahora)
        if not L.puede_lanzar_hoy(est.get("historial"), ahora, cfg.get("tope_dia", 1)):
            return dict(est, detalle="hoy ya hubo un lanzamiento (tope %d al día)" % cfg.get("tope_dia", 1), t=ahora)
        tipo = est.get("tipo_siguiente") or cfg.get("tipo", "menor")
        v = L.siguiente_version(_version_actual(m), tipo)
        est = _paso(est, "preparando", "preparo v%s" % v, ahora, version=v, preparado_sha=None, run=None,
                    run_previo=None, reintentos=0, regeneraciones=0, jobs=[], medios={}, tipo_siguiente=None)
        return _preparar(m, est, ahora)
    if fase == "preparando":
        return _preparar(m, est, ahora)
    if fase == "etiquetando":
        return _etiquetar(m, est, cfg, ahora)
    if fase == "compilando":
        return _compilar(m, est, cfg, ahora)
    if fase == "verificando-archivos":
        return _verificar_archivos(m, est, cfg, ahora)
    if fase == "publicando":
        return _publicar(m, est, ahora)
    if fase == "verificando-medios":
        return _verificar_medios(m, est, ahora)
    if fase == "atascado" and est.get("arreglo") and est["arreglo"] in _ids_en_main(m):
        v = L.siguiente_version(est["version"], "parche")
        _, lista_sha, _ = m.git(["rev-parse", "origin/main"])
        return _paso(est, "esperando-publicacion", "arreglo %s integrado: preparo el parche v%s" % (est["arreglo"], v),
                     ahora, version=None, preparado_sha=None, arreglo=None, tipo_siguiente="parche",
                     lista_sha=lista_sha, version_sin_lanzar=est["version"],
                     arreglo_titulo=_titulo_en_main(m, est["arreglo"]))
    return dict(est, t=ahora)


def una_pasada(como_json=False):
    os.makedirs(os.path.dirname(CERROJO), exist_ok=True)
    with open(CERROJO, "a+") as cerrojo:
        try:
            fcntl.flock(cerrojo, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("otra pasada de lanzamientos sigue en marcha")
            return None
        m = Medios()
        cfg = m.leer(CONFIG, {}) or {}
        try:
            est = pasada(m, m.leer(ESTADO, {}), cfg, time.time())
        except Exception as e:  # noqa: BLE001 — una pasada rota se dice, no tumba el lanzamiento
            est = dict(m.leer(ESTADO, {}) or {}, detalle="pasada rota: %s: %s" % (type(e).__name__, e), t=time.time())
        est["tono"] = L.tono_pastilla(est)
        m.escribir(ESTADO, est)
    print(json.dumps(est, ensure_ascii=False) if como_json else
          "[%s] lanzamientos · %s · %s" % (time.strftime("%H:%M"), est.get("fase"), est.get("detalle")), flush=True)
    return est


if __name__ == "__main__":
    una_pasada("--json" in sys.argv[1:])
