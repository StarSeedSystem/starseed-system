#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ronda de aparatos: un estado efímero que coordina una tanda de pruebas con los aparatos.

QUÉ. Cuando Genesis o la dirección piden una «ronda de aparatos», este módulo crea un estado
que vive solo mientras dura la tanda (caduca solo, no persiste entre reinicios). Durante la
ronda:
  1. Retiene las puertas locales de la autopublicación (autopublicar no avanza mientras la
     ronda esté viva).
  2. Retiene los tsc/vitest del enjambre (el orquestador no lanza nuevas tareas de prueba).
  3. El tope de 50 min del CI cuenta desde la creación del run en GitHub, no desde que
     autopublicar empieza a esperarlo.

CÓMO. La ronda se pide con `python3 scripts/puente/ronda.py pedir --sha <40hex> [--quien alex]`
y se sigue con `python3 scripts/puente/ronda.py pasada` (la llama el servicio de launchd cada
minuto). El estado vive en `~/.starseed/produccion/ronda-estado.json`.

ARCHIVOS:
  ronda-estado.json        lo que lee Genesis y la autopublicación
  ronda-cerrojo.lock       un solo proceso a la vez
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
import director_pruebas as DP  # noqa: E402
import director_pruebas_logica as DPL  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
CARPETA = os.path.expanduser("~/.starseed/produccion")
ESTADO_RONDA = os.path.join(CARPETA, "ronda-estado.json")
CERROJO_RONDA = os.path.join(CARPETA, "ronda-cerrojo.lock")
REPO = "StarSeedSystem/starseed-system"
FLUJO_PRUEBAS = "native-build.yml"
CI_TOPE_DESDE_CREACION_S = 50 * 60

_ID = re.compile(r"^[a-z0-9][a-z0-9-]{2,39}$")
_SHA = re.compile(r"^[0-9a-f]{40}$")


# ── puro ──────────────────────────────────────────────────────────────────────
def estado_vacio():
    return {"formato": 1, "activa": False, "sha": None, "numero": None, "run_id": None,
            "run_creado_t": None, "pedida_por": None, "t_inicio": None, "t_caduca": None,
            "fase": "esperando-run", "detalle": "", "avisos": []}


def normalizar_estado(d):
    """Lo leído del disco → estado válido; lo que no encaja se descarta."""
    e = estado_vacio()
    if not isinstance(d, dict):
        return e
    if isinstance(d.get("activa"), bool):
        e["activa"] = d["activa"]
    for k in ("sha", "pedida_por", "fase", "detalle"):
        if isinstance(d.get(k), str):
            e[k] = d[k][:200]
    for k in ("numero", "run_id"):
        if isinstance(d.get(k), int):
            e[k] = d[k]
    for k in ("run_creado_t", "t_inicio", "t_caduca"):
        if isinstance(d.get(k), (int, float)):
            e[k] = float(d[k])
    if isinstance(d.get("avisos"), list):
        e["avisos"] = [str(x)[:200] for x in d["avisos"]][-6:]
    return e


def con_fase(est, fase, detalle, ahora, **mas):
    """Actualiza fase, detalle y timestamp; devuelve nuevo estado."""
    nuevo = dict(est)
    nuevo.update(fase=fase, detalle=detalle, t=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora)))
    nuevo.update(mas)
    return nuevo


def caducada(est, ahora):
    """True si la ronda ya caducó (t_caduca pasada o sin run tras 10 min de lanzada)."""
    if not est.get("activa"):
        return True
    t_caduca = est.get("t_caduca")
    if t_caduca is not None and ahora >= t_caduca:
        return True
    if est.get("run_creado_t") is None and est.get("t_inicio") is not None:
        if ahora - est["t_inicio"] > 600:  # 10 min sin run visible
            return True
    return False


# ── medios reales (inyectables en pruebas) ────────────────────────────────────
class Medios:
    def __init__(self, dir_estado=None, raiz=None):
        self.dir = dir_estado or CARPETA
        self.raiz = raiz or RAIZ

    def ahora(self):
        return time.time()

    def ruta_estado(self):
        return ESTADO_RONDA

    def leer_estado(self):
        try:
            with open(self.ruta_estado(), encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def escribir_estado(self, est):
        os.makedirs(os.path.dirname(self.ruta_estado()), exist_ok=True)
        tmp = self.ruta_estado() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(est, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, self.ruta_estado())

    def sh(self, args, timeout=120, env=None):
        try:
            r = subprocess.run(args, cwd=self.raiz, capture_output=True, text=True, timeout=timeout, env=env)
            return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
        except Exception as e:
            return 1, "", "%s: %s" % (type(e).__name__, e)

    def gh_json(self, args):
        rc, out, _ = self.sh(["gh"] + args + ["-R", REPO])
        try:
            return json.loads(out) if rc == 0 and out else None
        except ValueError:
            return None

    def runs_pruebas(self):
        return self.gh_json(["run", "list", "--workflow", FLUJO_PRUEBAS, "--limit", "5",
                             "--json", "databaseId,number,status,conclusion,headSha,createdAt,headBranch,event"])

    def run_detalle(self, run_id):
        return self.gh_json(["run", "view", str(int(run_id)), "--json",
                             "databaseId,number,status,conclusion,headSha,createdAt,updatedAt,jobs,url"])

    def autopublicar_estado(self):
        """Lee el estado de la autopublicación para saber si está en una fase que debe respetar."""
        try:
            with open(os.path.join(CARPETA, "autopublicar-estado.json"), encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def avisar_autopublicar(self, motivo):
        """Escribe una petición en autopublicar-peticion.json para que la autopublicación se entere."""
        try:
            pet = {"accion": "ronda-activa", "motivo": motivo, "t": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
            ruta = os.path.join(CARPETA, "autopublicar-peticion.json")
            os.makedirs(CARPETA, exist_ok=True)
            tmp = ruta + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(pet, f, ensure_ascii=False)
            os.replace(tmp, ruta)
        except Exception:
            pass

    def chat(self, texto, tipo="informe"):
        try:
            import director_chat
            director_chat.publicar(texto, de="ronda-aparatos", rol="sistema", tipo=tipo, canal="mando")
        except Exception:
            pass


# ── la pasada ─────────────────────────────────────────────────────────────────
def _guardar(m, est):
    m.escribir_estado(est)


def _seguir_run(m, est, ahora):
    """Sigue el run de pruebas: actualiza fase y comprueba tope de 50 min desde CREACIÓN."""
    run_id = est.get("run_id")
    if not run_id:
        return est
    run = m.run_detalle(run_id)
    if not run:
        est["avisos"] = (est["avisos"] + ["no pude leer la compilación %s en GitHub" % est.get("numero")])[-3:]
        return est

    creado = run.get("createdAt")
    if creado:
        try:
            from datetime import datetime, timezone
            creado_t = datetime.strptime(creado[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
            est["run_creado_t"] = creado_t
        except Exception:
            pass

    # Tope de 50 min desde CREACIÓN del run en GitHub (no desde que autopublicar lo espera)
    if est.get("run_creado_t") and ahora - est["run_creado_t"] > CI_TOPE_DESDE_CREACION_S:
        if run.get("status") != "completed":
            est = con_fase(est, "fallo", "CI superó 50 min desde su creación en GitHub", ahora)
            m.chat("Ronda de aparatos: la compilación %s pasó de 50 min desde su creación; se da por fallida." % est.get("numero"), "aviso")
            _guardar(m, est)
            return _cerrar_ronda(m, est, ahora)

    status = run.get("status")
    concl = run.get("conclusion") or ""
    jobs = run.get("jobs") or []

    if status != "completed":
        if status in ("queued", "waiting", "pending"):
            return con_fase(est, "en-cola", "en cola en GitHub", ahora)
        return con_fase(est, "compilando", "compilando en GitHub", ahora)

    if concl == "cancelled":
        return _cerrar_ronda(m, con_fase(est, "cancelada", "cancelada en GitHub", ahora), ahora)

    if concl == "success":
        # Verificar manifiestos
        manifiestos = {}
        for clave, nombre in (("escritorio", "latest-prueba.json"), ("android", "latest-prueba-android.json")):
            rc, out, _ = m.sh(["gh", "release", "download", "canal-pruebas", "-R", REPO, "-p", nombre, "-O", "-"])
            try:
                manifiestos[clave] = (json.loads(out) or {}).get("version") if rc == 0 and out else None
            except ValueError:
                manifiestos[clave] = None

        version = est.get("version") or DPL.version_de_prueba("0.5.0", est["numero"])
        ok_esc = manifiestos.get("escritorio") == version
        ok_and = manifiestos.get("android") == version

        if ok_esc and ok_and:
            return _cerrar_ronda(m, con_fase(est, "publicada", "manifiestos servidos", ahora, manifiestos=manifiestos), ahora)

        return con_fase(est, "publicando", "esperando manifiestos (%s, %s)" % (manifiestos.get("escritorio") or "—", manifiestos.get("android") or "—"), ahora)

    return _cerrar_ronda(m, con_fase(est, "fallo", "run terminó con «%s»" % (concl or "sin resultado"), ahora), ahora)


def _cerrar_ronda(m, est, ahora):
    """Cierra la ronda: desactiva, avisa, limpia cerrojos de autopublicación."""
    est["activa"] = False
    est["t_caduca"] = None
    m.avisar_autopublicar("ronda terminada: %s" % est.get("fase"))
    m.chat("Ronda de aparatos terminada: prueba %s → %s." % (est.get("numero"), est.get("fase")), "informe")
    _guardar(m, est)
    return est


def pasada(m):
    """Una pasada del director de la ronda. Devuelve el estado escrito."""
    ahora = m.ahora()
    est = normalizar_estado(m.leer_estado())

    if not est.get("activa"):
        return est

    if caducada(est, ahora):
        return _cerrar_ronda(m, con_fase(est, "caducada", "la ronda caducó", ahora), ahora)

    # Si no tenemos run_id, buscar uno recién lanzado para este sha
    if not est.get("run_id"):
        runs = m.runs_pruebas() or []
        sha = est.get("sha")
        t0 = est.get("t_inicio") or ahora
        candidatos = [r for r in runs if r.get("head_sha") == sha and r.get("event") == "workflow_dispatch"
                      and r.get("headBranch") == "main"
                      and (DPL.de_iso(r.get("createdAt")) or 0) >= t0 - 15]
        if candidatos:
            run = max(candidatos, key=lambda r: r.get("number") or 0)
            est["run_id"] = run.get("databaseId")
            est["numero"] = run.get("number")
            est["version"] = DPL.version_de_prueba("0.5.0", run.get("number"))
            est = con_fase(est, "en-cola", "run %s detectado" % run.get("number"), ahora)
            _guardar(m, est)

    return _seguir_run(m, est, ahora)


def pedir_ronda(sha, quien, ahora=None):
    """Crea una petición de ronda. Devuelve (ok, mensaje, estado_inicial)."""
    if not isinstance(sha, str) or not _SHA.match(sha.lower()):
        return False, "el commit debe ser de 40 caracteres hexadecimales", None
    if not isinstance(quien, str) or not re.match(r"^[a-z0-9][a-z0-9_.-]{0,39}$", quien.lower()):
        return False, "quién no válido", None

    ahora = time.time() if ahora is None else ahora
    # La ronda dura como mucho 60 min (50 CI + 10 margen)
    est = {"formato": 1, "activa": True, "sha": sha.lower(), "numero": None, "run_id": None,
           "run_creado_t": None, "pedida_por": quien.lower(), "t_inicio": ahora,
           "t_caduca": ahora + 60 * 60, "fase": "esperando-run", "detalle": "ronda pedida",
           "avisos": []}
    return True, "ronda de aparatos creada para %s" % sha[:10], est


# ── línea de órdenes ──────────────────────────────────────────────────────────
def una_pasada_con_cerrojo(como_json=False):
    os.makedirs(CARPETA, exist_ok=True)
    with open(CERROJO_RONDA, "a+") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            print("ronda: ya hay otra pasada en marcha")
            return None
        m = Medios()
        est = pasada(m)
    if como_json:
        print(json.dumps(est, ensure_ascii=False, indent=2))
    else:
        print("[%s] ronda · %s · %s" % (time.strftime("%H:%M"), est.get("fase"), est.get("detalle")), flush=True)
    return est


def main(argv=None):
    import argparse
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--bucle" in argv:
        while True:
            try:
                subprocess.run([sys.executable, os.path.abspath(__file__), "pasada"], timeout=120)
            except Exception as e:
                print("[%s] pasada rota: %s" % (time.strftime("%H:%M"), type(e).__name__), flush=True)
            time.sleep(60)
        return 0

    ap = argparse.ArgumentParser(description="Ronda de aparatos de StarSeed OS")
    sub = ap.add_subparsers(dest="orden", required=True)

    p = sub.add_parser("pedir", help="pide una ronda de aparatos para un commit")
    p.add_argument("--sha", required=True)
    p.add_argument("--quien", default=os.environ.get("STARSEED_QUIEN", "terminal"))

    sub.add_parser("pasada", help="una pasada del director de la ronda")
    sub.add_parser("estado", help="muestra el estado actual")

    a = ap.parse_args(argv)
    m = Medios()

    if a.orden == "pedir":
        ok, msg, est = pedir_ronda(a.sha, a.quien)
        if not ok:
            print("error: %s" % msg, file=sys.stderr)
            return 2
        m.escribir_estado(est)
        m.avisar_autopublicar("ronda iniciada por %s para %s" % (a.quien, a.sha[:10]))
        m.chat("Ronda de aparatos iniciada por %s para %s." % (a.quien, a.sha[:10]), "informe")
        print(msg)
        return 0

    if a.orden == "pasada":
        una_pasada_con_cerrojo()
        return 0

    if a.orden == "estado":
        est = normalizar_estado(m.leer_estado())
        print(json.dumps(est, ensure_ascii=False, indent=2))
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())