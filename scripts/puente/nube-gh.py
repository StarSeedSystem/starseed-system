#!/usr/bin/env python3
"""Medio «nube-gh»: el enjambre en GitHub Actions, gratis y sin tope en repos públicos (2026-09-21).

Alex: «se puede más con más medios… algún servicio gratuito para alojar más agentes».
Hugging Face exige PRO para Spaces Docker (HTTP 402, comprobado); GitHub Actions
en este repo PÚBLICO da máquinas de 4 vCPU / 16 GB, hasta 6 h por job y varios
jobs a la vez, sin coste. El workflow `.github/workflows/enjambre-nube.yml` corre
el orquestador sobre una `enjambre/colas/cola-nube-*.json` con 3 trabajadores y
empuja SU rama `nube/<run-id>`; la Mac la trae, y publica con las cuatro puertas.

Uso (en la Mac, con `gh` autenticado como StarSeedSystem):
  nube-gh.py secretos             copia a los secretos del repo las claves de
                                  ~/.starseed/env que usa el enjambre (nombres en
                                  pantalla, nunca valores) — lo corre Alex
  nube-gh.py lanzar [--tope N] [--trabajadores 3] [--minutos 300] [--cola ruta]
                                  reparte N tareas a una cola-nube nueva (o usa
                                  --cola), la publica en main y dispara el workflow
  nube-gh.py estado               últimos runs y sus ramas nube/<run>
  nube-gh.py traer                trae todas las ramas nube/* a main (ff o merge)
                                  y las borra del remoto; luego publicar.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORKFLOW = "enjambre-nube.yml"
#: (2026-09-21) NVIDIA_SHARED_KEY estuvo aqui desde el principio y NO EXISTE en ninguna
#: parte: ni en ~/.starseed/env, ni en ~/.hermes/.env, ni en los secretos del repo. Pedir
#: una clave que nadie tiene hacia que la lista de «te toca a ti» mostrara para siempre
#: una tarea imposible para Alex. Fuera: si algun dia aparece, se anade entonces.
SECRETOS = (
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY",
    "OPENROUTER_API_KEY", "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY",
    "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY",
)

#: Los dos archivos de entorno de esta maquina. Solo se leen NOMBRES y valores para
#: mandarlos a `gh secret set` por la entrada estandar; nunca se imprime un valor.
#: (2026-09-21) Antes solo se leia ~/.starseed/env, y por eso AIHUBMIX_API_KEY y
#: TOKENROUTER_API_KEY salian como «sin valor» habiendo estado siempre en ~/.hermes/.env.
#: El resultado era un aviso permanente pidiendole a Alex que subiera unas claves que ya
#: tenia, por un archivo que no miramos. Mismo par de archivos que usa jev.py.
ARCHIVOS_DE_ENTORNO = ("~/.starseed/env", "~/.hermes/.env")
VARIABLES = ("STARSEED_PASARELA_GROQ_URL", "STARSEED_PASARELA_GROQ_MODELOS", "STARSEED_PASARELA_GROQ_RPM")


def _env() -> dict:
    salida = dict(os.environ)
    for ruta in ARCHIVOS_DE_ENTORNO:
        try:
            for linea in open(os.path.expanduser(ruta), encoding="utf-8"):
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                # ~/.hermes/.env escribe `export CLAVE=valor`; ~/.starseed/env no.
                if linea.startswith("export "):
                    linea = linea[len("export "):].strip()
                k, v = linea.split("=", 1)
                v = v.strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                    v = v[1:-1]
                salida.setdefault(k.strip(), v)
        except OSError:
            continue
    return salida


def _sh(args, entrada=None, check=True):
    p = subprocess.run(args, cwd=RAIZ, input=entrada, capture_output=True, text=True)
    if check and p.returncode != 0:
        sys.exit("falló %s: %s" % (" ".join(args[:3]), (p.stderr or p.stdout)[-300:]))
    return p.stdout.strip()


def secretos() -> None:
    env = _env()
    puestos, faltan = [], []
    for k in SECRETOS:
        v = (env.get(k) or "").strip()
        if not v:
            faltan.append(k); continue
        p = subprocess.run(["gh", "secret", "set", k], cwd=RAIZ, input=v, capture_output=True, text=True)
        (puestos if p.returncode == 0 else faltan).append(k)
    for k in VARIABLES:
        v = (env.get(k) or "").strip()
        if v:
            subprocess.run(["gh", "variable", "set", k, "--body", v], cwd=RAIZ, capture_output=True, text=True)
    print("secretos puestos en GitHub:", ", ".join(puestos) or "ninguno")
    if faltan:
        print("sin valor en ~/.starseed/env (no se ponen):", ", ".join(faltan))


def lanzar(args: list[str]) -> None:
    tope, trabajadores, minutos, cola = "6", "3", "300", None
    it = iter(args)
    for a in it:
        if a == "--tope": tope = next(it)
        elif a == "--trabajadores": trabajadores = next(it)
        elif a == "--minutos": minutos = next(it)
        elif a == "--cola": cola = next(it)
    if not cola:
        antes = set(os.listdir(os.path.join(RAIZ, "enjambre", "colas")))
        out = subprocess.run([sys.executable, os.path.join(RAIZ, "scripts", "puente", "repartir-a-nube.py"), "--tope", tope],
                             cwd=RAIZ, capture_output=True, text=True).stdout
        print(out.strip()[-300:])
        nuevas = sorted(set(os.listdir(os.path.join(RAIZ, "enjambre", "colas"))) - antes)
        if not nuevas:
            sys.exit("el reparto no creó ninguna cola (¿no hay atraso?)")
        cola = "enjambre/colas/" + nuevas[-1]
        _sh(["git", "add", cola, "starseed_memory_root/olas/progreso.json"], check=False)
        _sh(["git", "add", cola])
        _sh(["git", "commit", "-q", "-m", "enjambre: reparto a la nube (GitHub Actions) · %s" % os.path.basename(cola)], check=False)
    # LA COLA VIAJA EN SU PROPIA RAMA, NO EN MAIN (2026-09-22).
    #
    # Historia de este trozo, porque explica los dos fallos que arregla:
    #   · Nació como `git push origin HEAD:main` diciendo «solo este commit de cola», y era
    #     mentira: empujaba HEAD entero, así que se llevó a main código sin pasar las
    #     puertas (una ruta con un `export` de más llegó a origin/main sin tsc).
    #   · El parche fue abortar si había código sin publicar. Correcto en la intención y
    #     desastroso en el efecto: el enjambre commitea cada pocos minutos, así que CASI
    #     SIEMPRE hay código sin publicar y la nube quedó apagada de hecho. Medido hoy: el
    #     director dijo «LANZO» a las 22:05, 22:09 y 22:13 y GitHub no recibió ni un run,
    #     porque el aborto salía por stderr y nadie lo leía. Tres «LANZO» y cero agentes.
    #
    # La nube no necesita main: necesita el código y la cola. Así que se empuja HEAD a una
    # rama propia e irrepetible y el workflow se dispara CON ESA REFERENCIA. Main no se
    # toca (sigue siendo lo único con las cuatro puertas pasadas), no hay nada que abortar,
    # y de paso la nube deja de trabajar con el código viejo de main: trabaja con el mismo
    # que la Mac. Su resultado sigue saliendo por `nube/<run>` y sigue pasando las puertas
    # aquí antes de publicarse.
    rama = "colas/nube-%s" % time.strftime("%Y%m%d-%H%M%S")
    print("empujando la cola y el código a su propia rama (main NO se toca): %s" % rama)
    rc_push, salida_push = _sh_rc(["git", "push", "-q", "origin", "HEAD:refs/heads/%s" % rama])
    if rc_push != 0:
        sys.exit("no pude empujar la rama de la cola: %s" % (salida_push.strip()[-300:] or "?"))
    rc_run, salida_run = _sh_rc(["gh", "workflow", "run", WORKFLOW, "--ref", rama,
                                 "-f", "cola=%s" % cola,
                                 "-f", "trabajadores=%s" % trabajadores,
                                 "-f", "minutos=%s" % minutos])
    if rc_run != 0:
        sys.exit("gh no pudo disparar el workflow: %s" % (salida_run.strip()[-300:] or "?"))
    run_id = _esperar_run(rama)
    if not run_id:
        sys.exit("el workflow se disparó pero GitHub no registró ningún run en 40 s: "
                 "mira `gh run list --workflow %s`" % WORKFLOW)
    print("lanzado:", cola, "· trabajadores", trabajadores, "· minutos", minutos, "· run", run_id)
    _anotar_lanzamiento(cola, trabajadores, minutos, run_id=run_id)
    _podar_ramas_de_cola()
    print("sigue con: python3 scripts/puente/nube-gh.py estado")


def _sh_rc(orden: list[str], timeout: int = 120):
    """(returncode, stdout+stderr). Existe porque `_sh` se come stderr y el codigo de
    salida, y por eso un lanzamiento que abortaba se veia como un lanzamiento hecho."""
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        return 1, "%s: %s" % (type(e).__name__, e)


def _esperar_run(rama: str, segundos: int = 40):
    """El id del run recien disparado para esta rama, o None si GitHub no registro ninguno.

    `gh workflow run` devuelve 0 en cuanto GitHub acepta la peticion, no cuando hay run.
    Si nadie comprueba que el run existe, un dispatch perdido se cuenta como lanzamiento
    y el director vuelve a «lanzar» lo mismo cada pocos minutos sin un solo agente vivo.
    """
    limite = time.time() + segundos
    while time.time() < limite:
        rc, salida = _sh_rc(["gh", "run", "list", "--workflow", WORKFLOW, "--limit", "5",
                             "--json", "databaseId,headBranch"], timeout=30)
        if rc == 0 and salida.strip():
            try:
                for r in json.loads(salida):
                    if str(r.get("headBranch")) == rama:
                        return r.get("databaseId")
            except ValueError:
                pass
        time.sleep(4)
    return None


def _podar_ramas_de_cola(dejar: int = 8) -> None:
    """Borra las ramas `colas/nube-*` viejas del remoto, dejando las `dejar` ultimas.

    Una rama por lanzamiento y un lanzamiento cada pocos minutos serian cientos de ramas
    en un dia. Se borran por nombre (llevan la fecha), nunca las mas recientes, y nunca
    `nube/*` (esas guardan trabajo sin integrar).
    """
    rc, salida = _sh_rc(["git", "ls-remote", "--heads", "origin", "colas/nube-*"], timeout=60)
    if rc != 0:
        return
    ramas = sorted(l.split("refs/heads/")[-1].strip() for l in salida.splitlines() if "refs/heads/" in l)
    for r in ramas[:-dejar] if len(ramas) > dejar else []:
        _sh_rc(["git", "push", "-q", "origin", "--delete", r], timeout=60)


def _anotar_lanzamiento(cola: str, trabajadores: str, minutos: str, run_id=None) -> None:
    """Deja escrito con cuantos trabajadores sale este run.

    (2026-09-22) El Puente no podia contar los agentes de la nube, y no por descuido: el
    bus de medios es un archivo del disco de la Mac y un runner de GitHub no puede
    escribir en el. Preguntar a GitHub tampoco basta, porque los inputs de un
    `workflow_dispatch` no se pueden leer por la API despues del lanzamiento. El unico
    que sabe cuantos trabajadores lleva un run es quien lo lanza, o sea esto. Se anota
    aqui y `agentes_nube.py` lo cruza con los runs vivos.
    """
    import time as _t

    ruta = os.path.join(RAIZ, "starseed_memory_root", "mando", "agentes-nube.json")
    if not run_id:
        # Ya no se adivina cogiendo «el run mas nuevo del workflow»: con varios jobs en
        # paralelo eso atribuia los trabajadores al run equivocado. Quien llama trae el id
        # que ya comprobo que existe (`_esperar_run`), y sin id no se anota nada.
        return
    try:
        datos = json.load(open(ruta, encoding="utf-8"))
    except Exception:
        datos = {}
    lanz = [l for l in (datos.get("lanzamientos") or []) if str(l.get("run")) != str(run_id)]
    lanz.append({
        "run": run_id,
        "cola": cola,
        "trabajadores": trabajadores,
        "minutos": minutos,
        "t": _t.strftime("%Y-%m-%d %H:%M:%S"),
    })
    datos["lanzamientos"] = lanz[-30:]
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        json.dump(datos, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("anotado: run %s con %s trabajadores" % (run_id, trabajadores))
    except OSError:
        pass


def estado() -> None:
    print(_sh(["gh", "run", "list", "--workflow", WORKFLOW, "--limit", "8"], check=False) or "sin runs")
    ramas = _sh(["git", "ls-remote", "--heads", "origin", "nube/*"], check=False)
    print("ramas nube/* en el remoto:", len([l for l in ramas.splitlines() if l.strip()]))


def traer() -> None:
    _sh(["git", "fetch", "-q", "origin", "+refs/heads/nube/*:refs/remotes/origin/nube/*"], check=False)
    ramas = [l.split()[-1].replace("refs/heads/", "") for l in _sh(["git", "ls-remote", "--heads", "origin", "nube/*"], check=False).splitlines() if l.strip()]
    if not ramas:
        print("nada que traer"); return
    for r in ramas:
        ff = subprocess.run(["git", "merge", "--ff-only", "origin/" + r], cwd=RAIZ, capture_output=True, text=True)
        if ff.returncode != 0:
            m = subprocess.run(["git", "merge", "--no-edit", "origin/" + r], cwd=RAIZ, capture_output=True, text=True)
            if m.returncode != 0:
                print("conflicto en", r, "→ se conserva en el remoto:", m.stdout[-200:]); continue
            print("integrada por merge:", r)
        else:
            print("integrada por ff:", r)
        subprocess.run(["git", "push", "-q", "origin", "--delete", r], cwd=RAIZ, capture_output=True, text=True)
    print("ahora: python3 scripts/puente/publicar.py (cuatro puertas y push desde la Mac)")


if __name__ == "__main__":
    orden = sys.argv[1] if len(sys.argv) > 1 else "estado"
    {"secretos": secretos, "lanzar": lambda: lanzar(sys.argv[2:]), "estado": estado, "traer": traer}.get(orden, lambda: print(__doc__))()
