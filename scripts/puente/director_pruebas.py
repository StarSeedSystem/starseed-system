#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de pruebas: las versiones `0.5.1-prueba.N` tienen un director propio (PRB1111W · contrato §11).

Sustituye a los cuatro guiones que la dirección corría a mano (lanzar cuando X esté en main, vigilar el run, publicar
los manifiestos de respaldo, registrar las comprobaciones). Actúa SOLO con petitions —archivos pequeños que escribe
Genesis o la orden `pedir`— y, sin que nadie lo pida, sigue hasta el final la compilación que lanzó o que encontró en marcha.

  python3 scripts/puente/director_pruebas.py pedir compilar [--sha <40 hex>] --quien alex
  python3 scripts/puente/director_pruebas.py pedir cancelar|reintentar|republicar [--numero N] --quien claude
  python3 scripts/puente/director_pruebas.py pedir pedir-arreglo --prueba 39 --comprobacion c7 [--nota "…"] --quien alex
  python3 scripts/puente/director_pruebas.py pedir app-abrir --quien alex
  python3 scripts/puente/director_pruebas.py pedir ronda-iniciar --nota "llamadas con la tableta" [--minutos 30] --quien alex
  python3 scripts/puente/director_pruebas.py pedir ronda-terminar --quien alex
  python3 scripts/puente/director_pruebas.py pasada [--json]     una pasada (la que corre el servicio)
  python3 scripts/puente/director_pruebas.py --bucle             el servicio de launchd: una pasada por minuto
  python3 scripts/puente/director_pruebas.py estado | pausar "motivo" | reanudar

Carpeta de trabajo: `~/.starseed/produccion/` (`STARSEED_PRODUCCION_DIR` la cambia; las pruebas usan una temporal):
  pruebas-peticiones/<id>.json        peticiones pendientes (hechas/ guarda las atendidas con su resultado)
  pruebas-director-estado.json        lo que lee Genesis
  pruebas-director.pausa              si existe, el director solo mira (primera línea = motivo)
  pruebas-banco.json                  la evidencia de los aparatos (banco_pruebas.py), en cada pasada
Reglas: un conjunto cerrado de acciones; ningún texto de una petición llega a un shell (los comandos son listas fijas);
sin nada en marcha y sin peticiones, una pasada no hace ninguna llamada de red; el estado vive en disco, así que se puede
matar a mitad de pasada y repetir. Nunca lanza, cancela ni publica por su cuenta: solo por una petición, y sigue o
repara solo lo que ya había (publicar los manifiestos que el run no actualizó, como el guion de respaldo).
"""
import fcntl
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
import comprobaciones_prueba as C  # noqa: E402
import director_pruebas_logica as D  # noqa: E402
import lanzamientos_logica as LL  # noqa: E402
import ronda as R  # noqa: E402  (RON1112C: la ronda de aparatos)

REPO = LL.REPO
FLUJO = "native-build.yml"
APP_ID = "app.starseed.os"
ESTADO = "pruebas-director-estado.json"
PAUSA = "pruebas-director.pausa"
PETICIONES = "pruebas-peticiones"
BANCO = "pruebas-banco.json"
PAQUETES = ("databaseId,number,status,conclusion,headSha,createdAt,updatedAt,event,headBranch")


def carpeta():
    return os.environ.get("STARSEED_PRODUCCION_DIR") or os.path.expanduser("~/.starseed/produccion")


def raiz_repo():
    return os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")


def tachar(texto, secretos=()):
    """Quita claves (y los secretos que se le den) de lo que se va a escribir o decir."""
    for s in secretos:
        if s:
            texto = texto.replace(s, "[oculto]")
    texto = re.sub(r"(sk-[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|Bearer\s+\S+|eyJ[\w\-]+\.[\w\-]+\.[\w\-]+)", "[oculto]", texto)
    return re.sub(r"(?:/Users|/home|/private|/var)/[^\s\"']+", "[ruta]", texto)


class Medios:
    """Todo lo que toca el mundo. Las pruebas lo sustituyen entero."""

    def __init__(self, dir_estado=None, raiz=None):
        self.dir = dir_estado or carpeta()
        self.raiz = raiz or raiz_repo()
        self.llamadas_red = 0

    # reloj y archivos
    def ahora(self):
        return time.time()

    def ruta(self, *partes):
        return os.path.join(self.dir, *partes)

    def leer_json(self, ruta):
        try:
            with open(ruta, encoding="utf-8") as f:
                return json.load(f)
        except OSError:
            return None
        except ValueError:
            return {"__ilegible__": True}

    def escribir_json(self, ruta, datos):
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        tmp = "%s.tmp-%d" % (ruta, os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, ruta)

    def pausa(self):
        try:
            with open(self.ruta(PAUSA), encoding="utf-8") as f:
                return (f.readline().strip() or "pausa sin motivo")[:200]
        except OSError:
            return None

    def peticiones_pendientes(self):
        """[(nombre, contenido | None si no es JSON)] por orden de nombre."""
        d = self.ruta(PETICIONES)
        try:
            nombres = sorted(n for n in os.listdir(d) if n.endswith(".json") and not n.startswith("."))
        except OSError:
            return []
        fuera = []
        for n in nombres[:200]:
            try:
                with open(os.path.join(d, n), encoding="utf-8") as f:
                    fuera.append((n, json.load(f)))
            except (OSError, ValueError):
                fuera.append((n, None))
        return fuera

    def peticion_hecha(self, pid):
        return os.path.exists(self.ruta(PETICIONES, "hechas", pid + ".json"))

    def cerrar_peticion(self, nombre, contenido, estado, resultado, ahora):
        """Escribe hechas/<id>.json y borra la pendiente. En ese orden: si se mata en medio, la próxima pasada la ve hecha."""
        pid = nombre[:-5]
        c = dict(contenido) if isinstance(contenido, dict) else {"id": pid}
        c.update(estado=estado, resultado=resultado[:300], t_fin=D.a_iso(ahora))
        self.escribir_json(self.ruta(PETICIONES, "hechas", pid + ".json"), c)
        try:
            os.unlink(self.ruta(PETICIONES, nombre))
        except OSError:
            pass

    # órdenes (listas fijas; nunca un shell)
    def sh(self, args, timeout=120, env=None, red=False):
        if red:
            self.llamadas_red += 1
        try:
            r = subprocess.run(args, cwd=self.raiz, capture_output=True, text=True, timeout=timeout, env=env)
            return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
        except Exception as e:  # noqa: BLE001
            return 1, "", "%s: %s" % (type(e).__name__, e)

    def gh_json(self, args):
        rc, out, _ = self.sh(["gh"] + args + ["-R", REPO], red=True)
        try:
            return json.loads(out) if rc == 0 and out else None
        except ValueError:
            return None

    def runs(self):
        return self.gh_json(["run", "list", "--workflow", FLUJO, "--limit", "8", "--json", PAQUETES])

    def run(self, run_id):
        return self.gh_json(["run", "view", str(int(run_id)), "--json", PAQUETES + ",jobs,url"])

    def manifiestos(self):
        fuera = {}
        for clave, nombre in (("escritorio", "latest-prueba.json"), ("android", "latest-prueba-android.json")):
            rc, out, _ = self.sh(["gh", "release", "download", "canal-pruebas", "-R", REPO, "-p", nombre, "-O", "-"], red=True)
            try:
                fuera[clave] = (json.loads(out) or {}).get("version") if rc == 0 and out else None
            except ValueError:
                fuera[clave] = None
        return fuera

    def git_fetch(self):
        return self.sh(["git", "fetch", "-q", "origin", "main"], red=True)[0] == 0

    def git_cabeza(self):
        rc, out, _ = self.sh(["git", "rev-parse", "origin/main"])
        return out if rc == 0 and re.match(r"^[0-9a-f]{40}$", out) else None

    def git_en_main(self, sha):
        return self.sh(["git", "merge-base", "--is-ancestor", sha, "origin/main"])[0] == 0

    def version_base(self, sha):
        rc, out, _ = self.sh(["git", "show", "%s:native/src-tauri/tauri.conf.json" % sha])
        try:
            return json.loads(out).get("version") if rc == 0 else None
        except ValueError:
            return None

    def lanzar(self):
        """Dispara native-build en main con los argumentos fijos del canal de pruebas."""
        rc, out, err = self.sh(["gh", "workflow", "run", FLUJO, "-R", REPO, "--ref", "main", "-f", "canal=pruebas", "-f", "systems=os",
                                "-f", "plataformas=escritorio,android", "-f", "servidor_local_android=true"], red=True)
        return rc == 0, tachar(err or out)[:200]

    def cancelar_run(self, run_id):
        rc, out, err = self.sh(["gh", "run", "cancel", str(int(run_id)), "-R", REPO], red=True)
        return rc == 0, tachar(err or out)[:200]

    def reintentar_run(self, run_id):
        rc, out, err = self.sh(["gh", "run", "rerun", str(int(run_id)), "--failed", "-R", REPO], red=True)
        return rc == 0, tachar(err or out)[:200]

    def publicar_manifiestos(self, run_id, version, escritorio, android):
        """El MISMO paso que hace la compilación (canal-pruebas.mjs publicar) con las notas del run. → (ok, resumen)."""
        with tempfile.TemporaryDirectory(prefix="notas-prueba-") as tmp:
            rc, out, err = self.sh(["gh", "run", "download", str(int(run_id)), "-R", REPO, "-n", "canal-pruebas-notas", "-D", tmp], red=True)
            notas = os.path.join(tmp, "notas-prueba.md")
            if not os.path.exists(notas):
                return False, "el run no dejó sus notas (canal-pruebas-notas); no publico"
            rc, token, _ = self.sh(["gh", "auth", "token"])
            if rc != 0 or not token:
                return False, "no hay sesión de gh para publicar"
            env = dict(os.environ, GITHUB_TOKEN=token, REPO=REPO, VERSION=version, ESCRITORIO=escritorio, ANDROID=android)
            rc, out, err = self.sh(["node", os.path.join("native", "scripts", "canal-pruebas.mjs"), "publicar", "--notas-archivo", notas],
                                   timeout=300, env=env, red=True)
            cola = "\n".join(tachar(out + "\n" + err, (token,)).splitlines()[-6:])
            return rc == 0, cola[:500]

    def abrir_app(self):
        """Abre la app instalada (`open -b`); nunca la cierra. → (ok, texto)."""
        if sys.platform != "darwin":
            return False, "solo se puede abrir la app en la Mac"
        rc, out, err = self.sh(["open", "-b", APP_ID])
        return rc == 0, tachar(err or out)[:200]

    def app_abierta(self):
        try:
            import plistlib
            with open("/Applications/StarSeed OS.app/Contents/Info.plist", "rb") as f:
                ejecutable = plistlib.load(f).get("CFBundleExecutable")
        except Exception:  # noqa: BLE001
            return None
        if not ejecutable or sys.platform != "darwin":
            return None
        return self.sh(["pgrep", "-x", ejecutable])[0] == 0

    # RON1112C: la ronda de aparatos vive en su propio archivo (ronda.py); el director es el único que lo escribe
    def mundo_ronda(self):
        w = R.Mundo(dir_estado=self.dir)
        w.ahora = self.ahora                      # un solo reloj para todo el director
        return w

    def pasada_ronda(self):
        return R.pasada(self.mundo_ronda())

    # chat y comprobaciones
    def chat(self, texto, canales, tipo, tarea=None):
        import director_chat
        return director_chat.publicar(texto, de="director-pruebas", rol="sistema", tipo=tipo, canal="mando",
                                      canales=canales, tarea=tarea)

    def comprobaciones(self):
        return C.leer(self.ruta(C.NOMBRE))

    def guardar_comprobaciones(self, datos):
        C.escribir(datos, self.ruta(C.NOMBRE))

    def banco_actual(self):
        d = self.leer_json(self.ruta(BANCO))
        return d if isinstance(d, dict) and "__ilegible__" not in d else None

    def pasada_banco(self):
        import banco_pruebas
        return banco_pruebas.pasada(banco_pruebas.Medios(salida=self.dir))


# ── la pasada ───────────────────────────────────────────────────────────────────────────────────────────────────

def _guardar(m, est):
    m.escribir_json(m.ruta(ESTADO), est)


def _objetivo(est, numero):
    """La compilación sobre la que actúan cancelar/reintentar/republicar: (fila con run_id, es_en_curso) o (None, motivo)."""
    ec = est["en_curso"]
    if numero is None:
        if ec and (ec.get("run_id") or ec.get("lanzando")):
            return ec, True
        if est["ultimas"] and est["ultimas"][0].get("run_id"):
            return est["ultimas"][0], False
        return None, "no hay ninguna compilación conocida"
    if ec and ec.get("numero") == numero:
        return ec, True
    for u in est["ultimas"]:
        if u.get("numero") == numero and u.get("run_id"):
            return u, False
    return None, "no conozco la prueba %d" % numero


def _entrada_comprobaciones(m, ec):
    """Crea la entrada de la versión en el archivo de comprobaciones (idempotente)."""
    if not ec.get("numero") or ec.get("comprobaciones_creadas"):
        return
    datos, _ = C.heredar(m.comprobaciones(), ec["numero"], version=ec.get("version") or "", sha=ec.get("sha") or "",
                         t=D.a_iso(m.ahora()), quien="director")
    m.guardar_comprobaciones(datos)
    ec["comprobaciones_creadas"] = True


def _nueva_en_curso(run, origen, pedida_por, m):
    return {"numero": run.get("number"), "version": None, "run_id": run.get("databaseId"), "sha": run.get("headSha"),
            "url": run.get("url") or "https://github.com/%s/actions/runs/%s" % (REPO, run.get("databaseId")),
            "estado": "en-cola", "desde": run.get("createdAt"), "origen": origen, "pedida_por": pedida_por,
            "plataformas": [], "manifiestos": {"escritorio": None, "android": None},
            "publicado_por_director": False, "avisado": False, "comprobaciones_creadas": False, "fallo": None}


def _completar_version(m, ec):
    if not ec.get("version") and ec.get("sha") and ec.get("numero"):
        ec["version"] = D.version_de_prueba(m.version_base(ec["sha"]), ec["numero"])


def _adoptar(m, est, run, jobs, pedida_por=None):
    ec = _nueva_en_curso(run, "peticion" if pedida_por else "encontrada", pedida_por, m)
    _completar_version(m, ec)
    est["en_curso"] = ec
    return ec


def _cerrar(m, est, ec, ahora):
    """Una compilación terminó: una sola vez al chat. Se anota ANTES de decirlo (como mucho una vez aunque se corte la pasada)."""
    if ec.get("avisado"):
        return
    ec["avisado"] = True
    D.cierre_en_ultimas(est, ec, ec["estado"], ahora)
    _guardar(m, est)
    try:
        m.chat(D.texto_aviso(ec), ["telegram"], "aviso", tarea="prueba-%s" % ec.get("numero"))
    except Exception as e:  # noqa: BLE001
        est["avisos"] = (est["avisos"] + ["no pude avisar en el chat: %s" % type(e).__name__])[-3:]


def _seguir(m, est, ahora):
    """Sigue el run en vuelo: una llamada a gh run view (y los manifiestos solo cuando el run ya acabó)."""
    ec = est["en_curso"]
    if ec.get("lanzando") and not ec.get("run_id"):
        runs = m.runs() or []
        t0 = D.de_iso(ec.get("lanzada_t")) or ahora
        candidatos = [r for r in runs if r.get("event") == "workflow_dispatch" and r.get("headBranch") == "main"
                      and (D.de_iso(r.get("createdAt")) or 0) >= t0 - 15]
        if candidatos:
            run = max(candidatos, key=lambda r: r.get("number") or 0)
            nuevo = _nueva_en_curso(run, "peticion", ec.get("pedida_por"), m)
            nuevo["comprobaciones_creadas"] = False
            est["en_curso"] = ec = nuevo
            _completar_version(m, ec)
            _entrada_comprobaciones(m, ec)
        elif ahora - t0 > D.LANZAMIENTO_MAX_S:
            ec.update(lanzando=False, estado="fallo", numero=None, avisado=False,
                      fallo={"job": None, "paso": "la orden de lanzar no dejó ninguna compilación visible tras 10 min"},
                      plataformas=[], manifiestos={"escritorio": None, "android": None}, version=None)
            _cerrar(m, est, ec, ahora)
            return
        else:
            return
    run = m.run(ec["run_id"])
    if not run:
        est["avisos"] = (est["avisos"] + ["no pude leer la compilación %s en GitHub" % ec.get("numero")])[-3:]
        return
    jobs = run.get("jobs") or []
    if ec.get("reintento_hasta") and run.get("status") == "completed" and ahora < (D.de_iso(ec["reintento_hasta"]) or 0):
        return                                    # GitHub tarda unos segundos en mostrar que el reintento arrancó
    ec.pop("reintento_hasta", None)
    if not D.es_run_de_pruebas(jobs) and run.get("status") == "completed":
        est["avisos"] = (est["avisos"] + ["la ejecución %s no es del canal de pruebas; la dejo" % run.get("number")])[-3:]
        est["en_curso"] = None
        return
    ec["numero"], ec["sha"] = run.get("number"), run.get("headSha")
    ec["url"] = run.get("url") or ec.get("url")
    _completar_version(m, ec)
    _entrada_comprobaciones(m, ec)
    manifiestos = m.manifiestos() if run.get("status") == "completed" else ec.get("manifiestos") or {}
    ev = D.evaluar_run(run, jobs, manifiestos, ec.get("version"), ahora, ec.get("publicado_por_director"))
    if ev["hacer"] == "publicar-manifiestos" and ec.get("version"):
        esc = "success" if any(p["estado"] in ("compilada", "publicada") for p in ev["plataformas"] if p["id"] != "android") else "failure"
        andr = "success" if any(p["id"] == "android" and p["estado"] in ("compilada", "publicada") for p in ev["plataformas"]) else "failure"
        ec["publicado_por_director"] = True       # primero se anota: un reintento tras un corte no repite
        _guardar(m, est)
        ok, resumen = m.publicar_manifiestos(ec["run_id"], ec["version"], esc, andr)
        est["avisos"] = (est["avisos"] + ["publicación de respaldo de %s: %s" % (ec["version"], "hecha" if ok else "no se pudo (%s)" % resumen[:120])])[-3:]
        manifiestos = m.manifiestos()
        ev = D.evaluar_run(run, jobs, manifiestos, ec["version"], ahora, True)
    ec.update(estado=ev["estado"], plataformas=ev["plataformas"], fallo=ev["fallo"], manifiestos=manifiestos)
    if ev["estado"] in D.TERMINALES:
        _cerrar(m, est, ec, ahora)


def _atender(m, est, nombre, pet, ahora):
    """Atiende UNA petición válida → (estado 'hecha'|'rechazada'|'pendiente', texto)."""
    a = pet["accion"]
    ec = est["en_curso"]
    if a == "compilar":
        if D.vivo(ec):
            return "rechazada", D.decidir_compilar(est, pet, {}, ahora)[1]
        m.git_fetch()
        run_vivo = None
        runs = m.runs() or []
        for r in runs:
            if r.get("status") in ("queued", "in_progress", "waiting", "pending") and not (ec and ec.get("run_id") == r.get("databaseId")):
                run_vivo = "ejecución %s" % r.get("number")
                if not D.vivo(est["en_curso"]):
                    jobs = (m.run(r["databaseId"]) or {}).get("jobs") or []
                    if D.es_run_de_pruebas(jobs):
                        _adoptar(m, est, r, jobs)
                        _entrada_comprobaciones(m, est["en_curso"])
                        run_vivo = None
                        return "rechazada", "ya estaba compilando la prueba %s; la sigo y la anuncio al acabar" % r.get("number")
                break
        hechos = {"head": m.git_cabeza(), "run_vivo": run_vivo}
        hechos["sha_en_main"] = m.git_en_main(pet["sha"]) if pet["sha"] else None
        dec, motivo, extra = D.decidir_compilar(est, pet, hechos, ahora)
        if dec == "rechazar":
            return "rechazada", motivo
        if dec == "esperar":
            e = est["esperando"]
            if not e or e.get("peticion_id") != pet["id"]:
                est["esperando"] = {"sha": pet["sha"], "peticion_id": pet["id"], "quien": pet["quien"], "desde": D.a_iso(ahora),
                                    "hasta": extra["hasta"], "motivo": motivo}
            est["esperando"]["ultima_comprobacion"] = D.a_iso(ahora)
            return "pendiente", "esperando: %s" % motivo
        est["esperando"] = None
        est["en_curso"] = {"lanzando": True, "lanzada_t": D.a_iso(ahora), "pedida_por": pet["quien"], "sha": extra["sha"], "estado": "en-cola"}
        _guardar(m, est)                          # intención escrita ANTES de lanzar: un corte no lanza dos veces
        ok, msg = m.lanzar()
        if not ok:
            est["en_curso"] = None
            return "rechazada", "GitHub no aceptó la orden de lanzar: %s" % msg
        return "hecha", "lanzada la compilación sobre %s; la sigo hasta que esté publicada" % extra["sha"][:10]
    if a in ("cancelar", "reintentar", "republicar"):
        if a == "cancelar" and est["esperando"] and pet["numero"] is None and not D.vivo(ec):
            est["esperando"] = None
            return "hecha", "dejo de esperar el commit"
        obj, es_ec = _objetivo(est, pet["numero"])
        if obj is None:
            return "rechazada", es_ec
        if obj.get("lanzando") and not obj.get("run_id"):
            return "rechazada", "la compilación se está lanzando; espera a que aparezca"
        if a == "cancelar":
            if not (es_ec and D.vivo(obj)):
                return "rechazada", "la prueba %s ya no está compilando" % obj.get("numero")
            ok, msg = m.cancelar_run(obj["run_id"])
            return ("hecha", "cancelación pedida para la prueba %s" % obj.get("numero")) if ok else ("rechazada", "GitHub no pudo cancelar: %s" % msg)
        if a == "reintentar":
            if es_ec and D.vivo(obj):
                return "rechazada", "la prueba %s aún compila; reintentar es para los trabajos que fallaron" % obj.get("numero")
            if obj.get("estado") != "fallo":
                return "rechazada", "la prueba %s no falló (%s); no hay trabajos que reintentar" % (obj.get("numero"), obj.get("estado"))
            if D.vivo(ec):
                return "rechazada", "hay otra prueba compilando; una sola a la vez"
            ok, msg = m.reintentar_run(obj["run_id"])
            if not ok:
                return "rechazada", "GitHub no pudo reintentar: %s" % msg
            nuevo = dict(obj) if es_ec else _nueva_en_curso({"number": obj.get("numero"), "databaseId": obj["run_id"], "headSha": obj.get("sha")}, "peticion", pet["quien"], m)
            nuevo.update(estado="en-cola", avisado=False, fallo=None, publicado_por_director=False, version=obj.get("version"), numero=obj.get("numero"),
                         run_id=obj["run_id"], sha=obj.get("sha"), plataformas=obj.get("plataformas") or [], manifiestos=obj.get("manifiestos") or {},
                         comprobaciones_creadas=True, reintento_hasta=D.a_iso(ahora + 90))
            est["en_curso"] = nuevo
            return "hecha", "reintentados los trabajos fallidos de la prueba %s" % obj.get("numero")
        # republicar
        run = m.run(obj["run_id"])
        if not run:
            return "rechazada", "no pude leer la prueba %s en GitHub" % obj.get("numero")
        if run.get("status") != "completed":
            return "rechazada", "la prueba %s aún compila; republicar es para una compilación terminada" % obj.get("numero")
        jobs = run.get("jobs") or []
        pl = D.plataformas_de_jobs(jobs)
        version = obj.get("version") or D.version_de_prueba(m.version_base(run.get("headSha")), run.get("number"))
        if not version:
            return "rechazada", "no sé la versión de la prueba %s" % obj.get("numero")
        esc = "success" if any(p["estado"] in ("compilada", "publicada") for p in pl if p["id"] != "android") else "failure"
        andr = "success" if any(p["id"] == "android" and p["estado"] in ("compilada", "publicada") for p in pl) else "failure"
        ok, resumen = m.publicar_manifiestos(obj["run_id"], version, esc, andr)
        if es_ec:
            obj["publicado_por_director"] = True
            obj["avisado"] = False if obj.get("estado") != "publicada" else obj.get("avisado")
        return ("hecha", "manifiestos republicados para %s" % version) if ok else ("rechazada", "no se pudo republicar: %s" % resumen[:150])
    if a == "pedir-arreglo":
        return _pedir_arreglo(m, est, pet, ahora)
    if a in D.ACCIONES_RONDA:
        # RON1112C: instantáneo, sin red. Iniciar con una ronda activa la renueva (nunca pasa de 90 min desde que empezó).
        return R.aplicar(m.mundo_ronda(), a, pet["quien"], pet["nota"], pet["minutos"], pet["id"])
    if a == "app-abrir":
        if m.app_abierta():
            return "hecha", ("la app ya estaba abierta, no la toco. Pedirle desde fuera que busque una actualización no es posible: "
                             "lo hace sola a los 25 s de abrirse y cada 6 h, o con «Buscar actualización» dentro de la app")
        ok, msg = m.abrir_app()
        if not ok:
            return "rechazada", "no se pudo abrir la app: %s" % msg
        return "hecha", "app abierta; buscará una actualización sola unos 25 s después de arrancar"
    return "rechazada", "acción desconocida"


def _pedir_arreglo(m, est, pet, ahora):
    clave = (pet["prueba"], pet["comprobacion"], pet["plataforma"])
    for f in est["peticiones"]:
        if f.get("id") != pet["id"] and f.get("accion") == "pedir-arreglo" and f.get("estado") == "hecha" and f.get("clave") == list(clave):
            t = D.de_iso(f.get("t_fin"))
            if t and 0 <= ahora - t < D.ARREGLO_REPETIDO_S:
                return "hecha", "ya se pidió hace menos de 5 min (%s); no repito" % f["id"]
    datos = m.comprobaciones()
    entrada = datos["pruebas"].get(str(pet["prueba"]))
    version = (entrada or {}).get("version") or None
    comp = None
    if pet["comprobacion"]:
        comp = next((c for c in (entrada or {}).get("comprobaciones", []) if c["id"] == pet["comprobacion"]), None)
        if comp is None:
            return "rechazada", "no existe la comprobación %s de la prueba %d" % (pet["comprobacion"], pet["prueba"])
        datos, anotado = C.pedir_arreglo(datos, pet["prueba"], comp["id"], pet["quien"], pet["nota"] or "", D.a_iso(ahora), pet["id"])
        if not anotado:
            return "hecha", "ya se pidió hace menos de 5 min; no repito"
        m.guardar_comprobaciones(datos)
    import banco_pruebas_logica as B
    texto = D.texto_arreglo(pet, version, comp, B.resumen_texto(m.banco_actual(), pet["prueba"], pet["comprobacion"]))
    m.chat(texto, ["claude-cowork", "hermes"], "peticion", tarea="arreglo-prueba-%d" % pet["prueba"])
    return "hecha", "mensaje publicado para la dirección (Claude y Hermes)"


def pasada(m):
    """Una pasada. Devuelve el estado escrito."""
    ahora = m.ahora()
    est = D.normalizar_estado(m.leer_json(m.ruta(ESTADO)))
    est["pasada"] += 1
    est["t"], est["cada_s"] = D.a_iso(ahora), D.CADA_S
    pausa = m.pausa()
    est["pausado"], est["pausa_motivo"] = bool(pausa), pausa
    est["avisos"] = []
    if not pausa:
        _con_peticiones(m, est, ahora)
        if D.vivo(est["en_curso"]):
            _seguir(m, est, ahora)
    else:
        _con_peticiones(m, est, ahora, solo_ronda=True)   # RON1112C: proteger la Mac no es lanzar nada: se atiende aun en pausa
    try:
        m.pasada_ronda()                                  # RON1112C: caduca lo vencido y mide si la Mac está tranquila
    except Exception as e:  # noqa: BLE001 — la ronda falla sola; el director sigue
        est["avisos"] = (est["avisos"] + [tachar("la ronda de aparatos falló al medir: %s" % type(e).__name__)])[-3:]
    _guardar(m, est)
    try:
        m.pasada_banco()
    except Exception as e:  # noqa: BLE001 — la evidencia falla sola; el director sigue
        import banco_pruebas_logica as BL
        aviso = tachar("el banco de pruebas falló: %s" % BL.describir_error(e))       # el mensaje y el sitio, no solo el tipo
        est["avisos"] = (est["avisos"] if aviso in est["avisos"] else est["avisos"] + [aviso])[-3:]
        _guardar(m, est)
    return est


def _con_peticiones(m, est, ahora, solo_ronda=False):
    pendientes = m.peticiones_pendientes()
    validas = []
    for nombre, crudo in pendientes[:D.MAX_PASADA]:
        pid = nombre[:-5]
        if solo_ronda and not (isinstance(crudo, dict) and crudo.get("accion") in D.ACCIONES_RONDA):
            continue                              # en pausa solo se atienden las de la ronda; el resto espera
        if m.peticion_hecha(pid):                 # ya atendida antes de un corte: solo falta quitar la pendiente
            try:
                os.unlink(m.ruta(PETICIONES, nombre))
            except OSError:
                pass
            continue
        previa = next((f for f in est["peticiones"] if f.get("id") == pid and f.get("estado") in ("hecha", "rechazada")), None)
        if previa:                                # atendida y guardada en el estado, cortada antes de cerrar el archivo
            m.cerrar_peticion(nombre, crudo, previa["estado"], previa["resultado"], ahora)
            continue
        if crudo is None:
            pet, motivo = None, "el archivo no es JSON válido"
        else:
            pet, motivo = D.validar_peticion(crudo, nombre, ahora)
        if pet is None:
            fila = {"id": pid if re.match(r"^[a-z0-9][a-z0-9-]{2,39}$", pid) else "pet-ilegible", "accion": str((crudo or {}).get("accion"))[:30] if isinstance(crudo, dict) else "?",
                    "quien": "?", "t": D.a_iso(ahora)}
            D.anotar_peticion(est, fila, "rechazada", "rechazada: " + motivo, ahora)
            m.cerrar_peticion(nombre, crudo if isinstance(crudo, dict) else None, "rechazada", motivo, ahora)
            continue
        validas.append((nombre, pet))
    validas.sort(key=lambda x: (D.de_iso(x[1]["t"]) or 0, x[1]["id"]))
    # solo se compila la última: cada «compilar» más antigua que otra pendiente la sustituye esa otra
    compilar = [x for x in validas if x[1]["accion"] == "compilar"]
    for nombre, pet in compilar[:-1]:
        _terminar(m, est, nombre, pet, "rechazada", "sustituida por la petición %s, más reciente" % compilar[-1][1]["id"], ahora)
    validas = [x for x in validas if not (x[1]["accion"] == "compilar" and x not in compilar[-1:])]
    # espera vigente (sin petición nueva que la sustituya)
    e = est["esperando"]
    if e and not any(p["id"] == e["peticion_id"] for _, p in validas):
        est["esperando"] = None
    for nombre, pet in validas:
        if pet["accion"] == "compilar" and est["esperando"] and est["esperando"].get("peticion_id") == pet["id"]:
            if D.espera_vencida(est["esperando"], ahora):
                est["esperando"] = None
                _terminar(m, est, nombre, pet, "rechazada", "se acabó la espera (4 h): main no llegó a contener el commit", ahora)
                continue
            ult = D.de_iso(est["esperando"].get("ultima_comprobacion")) or 0
            if ahora - ult < D.ESPERA_FETCH_S:    # sin red hasta la próxima mirada
                D.anotar_peticion(est, pet, "pendiente", "esperando: " + est["esperando"]["motivo"], ahora)
                continue
        try:
            estado, texto = _atender(m, est, nombre, pet, ahora)
        except Exception as ex:  # noqa: BLE001 — una petición rota no tumba al director
            estado, texto = "rechazada", "error inesperado (%s); vuelve a pedirla" % type(ex).__name__
        if estado == "pendiente":
            D.anotar_peticion(est, pet, "pendiente", texto, ahora)
            continue
        _terminar(m, est, nombre, pet, estado, texto, ahora)


def _terminar(m, est, nombre, pet, estado, texto, ahora):
    fila = D.anotar_peticion(est, pet, estado, texto, ahora)
    if pet["accion"] == "pedir-arreglo":
        fila["clave"] = [pet["prueba"], pet["comprobacion"], pet["plataforma"]]
    _guardar(m, est)                              # primero el estado, luego mover el archivo
    m.cerrar_peticion(nombre, pet, estado, texto, ahora)


# ── línea de órdenes ────────────────────────────────────────────────────────────────────────────────────────────

def escribir_peticion(carpeta_base, accion, quien, ahora, **campos):
    pid = "pet-%d-%s" % (int(ahora), secrets.token_hex(2))
    crudo = {"formato": 1, "id": pid, "accion": accion, "quien": quien, "t": D.a_iso(ahora)}
    crudo.update({k: v for k, v in campos.items() if v is not None})
    pet, motivo = D.validar_peticion(crudo, None, ahora)
    if pet is None:
        raise ValueError(motivo)
    ruta = os.path.join(carpeta_base, PETICIONES, pid + ".json")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(pet, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, ruta)
    return pid


def una_pasada_con_cerrojo(m, como_json=False):
    cerrojo = os.path.join(m.dir, ".pruebas-director.lock")
    os.makedirs(m.dir, exist_ok=True)
    with open(cerrojo, "w") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            print("director_pruebas: ya hay otra pasada en marcha; esta no hace nada")
            return None
        est = pasada(m)
    if como_json:
        print(json.dumps(est, ensure_ascii=False, indent=2))
    else:
        print("director_pruebas · pasada %d · %s · %s" % (est["pasada"], "PAUSADO (%s)" % est["pausa_motivo"] if est["pausado"] else "activo",
              ("prueba %s %s" % (est["en_curso"].get("numero"), est["en_curso"]["estado"])) if est["en_curso"] else "nada en marcha"))
    return est


def main(argv=None):
    import argparse
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--bucle" in argv:
        while True:
            try:
                subprocess.run([sys.executable, os.path.abspath(__file__), "pasada"], timeout=900)
            except Exception as e:  # noqa: BLE001
                print("[%s] pasada rota: %s" % (time.strftime("%H:%M"), type(e).__name__), flush=True)
            time.sleep(D.CADA_S)
    ap = argparse.ArgumentParser(description="Director de pruebas de StarSeed OS")
    sub = ap.add_subparsers(dest="orden", required=True)
    p = sub.add_parser("pedir", help="deja una petición para el director")
    p.add_argument("accion", choices=D.ACCIONES)
    p.add_argument("--quien", default=os.environ.get("STARSEED_QUIEN", "terminal"))
    p.add_argument("--sha")
    p.add_argument("--numero", type=int)
    p.add_argument("--prueba", type=int)
    p.add_argument("--comprobacion")
    p.add_argument("--plataforma")
    p.add_argument("--nota")
    p.add_argument("--minutos", type=int)
    s = sub.add_parser("pasada")
    s.add_argument("--json", action="store_true")
    sub.add_parser("estado")
    q = sub.add_parser("pausar")
    q.add_argument("motivo", nargs="?", default="pausa manual")
    sub.add_parser("reanudar")
    a = ap.parse_args(argv)
    m = Medios()
    if a.orden == "pedir":
        try:
            pid = escribir_peticion(m.dir, a.accion, a.quien, m.ahora(), sha=a.sha, numero=a.numero, prueba=a.prueba,
                                    comprobacion=a.comprobacion, plataforma=a.plataforma, nota=a.nota, minutos=a.minutos)
        except ValueError as e:
            print("error: %s" % e, file=sys.stderr)
            return 2
        print("petición %s dejada; el director la atiende en su próxima pasada (cada %d s)" % (pid, D.CADA_S))
    elif a.orden == "pasada":
        una_pasada_con_cerrojo(m, a.json)
    elif a.orden == "estado":
        print(json.dumps(D.normalizar_estado(m.leer_json(m.ruta(ESTADO))), ensure_ascii=False, indent=2))
    elif a.orden == "pausar":
        os.makedirs(m.dir, exist_ok=True)
        with open(m.ruta(PAUSA), "w", encoding="utf-8") as f:
            f.write(a.motivo + "\n")
        print("director en pausa: %s" % a.motivo)
    elif a.orden == "reanudar":
        try:
            os.unlink(m.ruta(PAUSA))
        except OSError:
            pass
        print("director reanudado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
