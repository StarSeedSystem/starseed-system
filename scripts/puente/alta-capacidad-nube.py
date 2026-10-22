#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad en la nube: lanza, sigue y trae sesiones de Claude Code en la nube
(Ola 1022C, ALT1022B). Las decisiones viven en `alta_capacidad_nube_logica.py`; esto solo hace.

Alex (2026-10-22): «¿por qué solo hay 6 agentes y no se agregan solos más simultáneos en más
medios como el contenedor de Claude de los créditos disponibles?». Las sesiones de Claude en la
nube (`claude --model <m> --cloud <descripción>`) gastan SOLO el crédito de sesiones en la nube
(`~/.starseed/credito-claude-nube.json`), no la semana del plan: son un medio más del enjambre.

  alta-capacidad-nube.py lanzar --ids A,B [--modelo claude-opus-5-5] [--seco]
  alta-capacidad-nube.py lanzar --auto [--max N] [--seco]
  alta-capacidad-nube.py seguir [--aplicar]
  alta-capacidad-nube.py ciclo                 # seguir --aplicar + lanzar --auto (lo corre launchd)
  alta-capacidad-nube.py ver [--json]

El CLI de Claude exige una terminal: se lanza dentro de `script -q <log> …` con la entrada de
`tail -f <teclas>` para que no se cierre, y se lee la sesión del log. Mientras trabaja, la tarea
queda `reasignada · claude-nube` (préstamo, no traspaso): si en `gracia_h` horas no aparece su
rama `nube/cc-<AAAAMMDD>/ola/<ID>`, vuelve a `pendiente`. Nunca imprime el entorno ni claves.
Pausa: `~/.starseed/alta-nube-pausada.json` (formato de `repartir_nube.motivo_pausa`).
"""
from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import alta_capacidad_nube_logica as L  # noqa: E402
import traer_nube  # noqa: E402

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
STARSEED = os.path.expanduser("~/.starseed")
REGISTRO = os.path.join(STARSEED, "alta-capacidad-nube.json")
CREDITO = os.path.join(STARSEED, "credito-claude-nube.json")
BRIEFS = os.path.join(STARSEED, "alta-capacidad-nube")
PAUSA = os.path.join(STARSEED, "alta-nube-pausada.json")
PLANTILLA = os.path.join(DIRECTORIO, "plantillas", "alta-capacidad-nube.md")
MODELO_DEFECTO = L.MODELO_CAPAZ
ESPERA_SESION_S = 90
GRACIA_H = 8

#: Si falta la plantilla del repo, la mínima con las reglas que no se negocian.
PLANTILLA_MINIMA = """Eres el carril de alta capacidad de StarSeed OS: haces UNA tarea que el enjambre no ha cerrado.
Lee CLAUDE.md y AGENTS.md. Solo los archivos declarados; tsc sin errores nuevos y tus pruebas en verde.
Prohibido: push a main, desplegar, tocar secretos, vercel.json, .github/ o la CI; no abras pull requests.
Un solo commit con el asunto «{ID}: {TITULO}» y empújalo a nube/cc-{FECHA}/ola/{ID}
(git push origin HEAD:refs/heads/nube/cc-{FECHA}/ola/{ID}).
Última línea: INTEGRABLE · rama <nombre> · … | PENDIENTE-DE: <qué> | NO APLICA: <motivo>.

## La tarea {ID}
Título: {TITULO}
Archivos declarados: {ARCHIVOS}

{PROMPT}
"""


# ── E/S pequeña ──────────────────────────────────────────────────────────────────────────────

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


def leer_registro():
    r = _leer_json(REGISTRO, {})
    if not isinstance(r, dict) or not isinstance(r.get("sesiones"), list):
        return {"sesiones": []}
    return r


def colas():
    """[(nombre, tareas)] de `starseed_memory_root/olas/cola-*.json`, de la más reciente a la más vieja."""
    rutas = sorted(glob.glob(os.path.join(traer_nube.OLAS, "cola-*.json")), key=os.path.getmtime, reverse=True)
    salida = []
    for ruta in rutas:
        d = _leer_json(ruta, [])
        tareas = d.get("tareas", d) if isinstance(d, dict) else d
        if isinstance(tareas, list):
            salida.append((os.path.basename(ruta), tareas))
    return salida


def buscar_tarea(tid, lista_colas):
    for nombre, tareas in lista_colas:
        for t in tareas:
            if isinstance(t, dict) and str(t.get("id")) == tid:
                return t, nombre
    return None, None


def plantilla():
    try:
        with open(PLANTILLA, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return PLANTILLA_MINIMA


def fecha_de(ahora):
    return time.strftime("%Y%m%d", time.localtime(ahora))


def inicio_del_dia(ahora):
    lt = time.localtime(ahora)
    return ahora - (lt.tm_hour * 3600 + lt.tm_min * 60 + lt.tm_sec)


def max_vivas():
    try:
        return max(1, int(os.environ.get("STARSEED_ALTA_NUBE_MAX") or 4))
    except ValueError:
        return 4


def pausada():
    try:
        import repartir_nube
    except Exception:  # noqa: BLE001 — sin el módulo, la pausa se lee igual de simple
        repartir_nube = None
    datos = _leer_json(PAUSA, None)
    if datos is None:
        return None
    if repartir_nube is not None:
        return repartir_nube.motivo_pausa(datos)
    return str(datos.get("motivo") or "pausada a mano") if isinstance(datos, dict) else None


# ── Medios reales (se inyectan otros en las pruebas) ─────────────────────────────────────────

def lanzador_real(orden, log, teclas, espera_s=ESPERA_SESION_S):
    """Corre `orden` en una pseudoterminal y devuelve lo que escribió hasta dar la sesión (o 90 s)."""
    os.makedirs(os.path.dirname(log), exist_ok=True)
    open(teclas, "a").close()
    tail = subprocess.Popen(["tail", "-f", teclas], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if sys.platform == "darwin":
        pty = ["script", "-q", log] + orden
    else:
        pty = ["script", "-q", "-c", subprocess.list2cmdline(orden), log]
    proc = subprocess.Popen(pty, stdin=tail.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            start_new_session=True)
    tail.stdout.close()
    texto, t0 = "", time.time()
    try:
        while time.time() - t0 < espera_s:
            time.sleep(2)
            try:
                with open(log, encoding="utf-8", errors="replace") as f:
                    texto = f.read()
            except OSError:
                texto = ""
            if L.sesion_de_salida(texto) or proc.poll() is not None:
                break
    finally:
        tail.kill()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.terminate()
    return texto


def ramas_remotas_real():
    r = subprocess.run(["git", "ls-remote", "origin", "refs/heads/nube/cc-*"], cwd=traer_nube.RAIZ,
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError("git ls-remote falló: %s" % (r.stderr or "").strip()[:200])
    return ramas_de_ls_remote(r.stdout)


def ramas_de_ls_remote(texto):
    ramas = set()
    for linea in (texto or "").splitlines():
        partes = linea.split("\t")
        if len(partes) == 2 and partes[1].startswith("refs/heads/"):
            ramas.add(partes[1][len("refs/heads/"):].strip())
    return ramas


def traer_real():
    r = subprocess.run([sys.executable, os.path.join(DIRECTORIO, "traer_nube.py"), "revisar", "--aplicar"],
                       cwd=traer_nube.RAIZ, capture_output=True, text=True, timeout=3600)
    return r.returncode, (r.stdout or "")[-2000:]


# ── Subórdenes ───────────────────────────────────────────────────────────────────────────────

def _lanzar_una(t, cola, modelo, ahora, seco, lanzador, decir):
    tid = str(t["id"])
    fecha = fecha_de(ahora)
    rama = L.rama_pedida(tid, fecha)
    texto = L.brief(plantilla(), t, fecha)
    ruta_brief = os.path.join(BRIEFS, tid + ".md")
    os.makedirs(BRIEFS, exist_ok=True)
    with open(ruta_brief, "w", encoding="utf-8") as f:
        f.write(texto)
    orden = L.orden_cli(modelo, texto)
    coste = L.coste_estimado(modelo)
    if seco:
        decir("(seco) %s · %s · ~%.0f $ · rama %s · brief %s" % (tid, modelo, coste, rama, ruta_brief))
        return None
    traer_nube._actualizar_progreso({tid: {"estado": L.ESTADO_PRESTADA, "medio": L.MEDIO,
                                           "nota": "prestada al carril en la nube (%s)" % modelo}})
    log = os.path.join(BRIEFS, tid + ".log")
    teclas = os.path.join(BRIEFS, tid + ".teclas")
    try:
        salida = lanzador(orden, log, teclas)
    except Exception as e:  # noqa: BLE001 — un fallo del CLI devuelve la tarea, no tumba el ciclo
        salida = ""
        decir("%s: el CLI falló (%s)" % (tid, type(e).__name__))
    sesion = L.sesion_de_salida(salida)
    if not sesion:
        traer_nube._actualizar_progreso({tid: {"estado": "pendiente", "medio": "",
                                               "nota": "el carril en la nube no dio sesión: vuelve al enjambre"}})
        decir("%s: no salió ninguna sesión del CLI; vuelve a pendiente" % tid)
        return None
    fila = {"tarea": tid, "sesion": sesion["sesion"], "url": sesion["url"], "titulo": sesion["titulo"],
            "rama_pedida": rama, "modelo": modelo, "coste_usd": coste, "t": ahora, "cola": cola}
    reg = leer_registro()
    reg["sesiones"].append(fila)
    _escribir_json(REGISTRO, reg)
    decir("%s: sesión %s · %s · rama %s" % (tid, sesion["url"], modelo, rama))
    return fila


def lanzar(ids=None, modelo=None, seco=False, auto=False, maximo=None, ahora=None,
           lanzador=lanzador_real, decir=print):
    """Lanza las tareas pedidas (o las que elige `--auto`). Devuelve las filas anotadas."""
    ahora = time.time() if ahora is None else ahora
    reg = leer_registro()
    progreso = traer_nube._progreso()
    tope = max_vivas()
    vivas = L.sesiones_vivas(reg, progreso)
    credito = _leer_json(CREDITO, {})
    ok, motivo, hoy = L.cupo_nube(credito, ahora, vivas, max_vivas=tope)
    if not ok:
        decir("sin cupo: %s" % motivo)
        return []
    lista = colas()
    if auto:
        cands = L.candidatas(lista, progreso, reg)
        plan = L.elegir_auto(cands, vivas, tope, hoy, L.gastado_hoy(reg, inicio_del_dia(ahora)), maximo)
        if not plan:
            decir("nada que lanzar: %d candidatas, %d/%d vivas, %.2f $ para hoy" % (len(cands), vivas, tope, hoy))
    else:
        plan = []
        for tid in ids or []:
            t, cola = buscar_tarea(tid, lista)
            if t is None:
                decir("%s: no está en ninguna cola de %s" % (tid, traer_nube.OLAS))
                continue
            if L._prestada(progreso, tid):
                decir("%s: ya está en el carril en la nube; no la lanzo dos veces" % tid)
                continue
            m = modelo or L.modelo_para(t, progreso.get(tid))
            plan.append((t, cola, m, L.coste_estimado(m)))
    hechas = []
    for t, cola, m, _ in plan:
        ok, motivo, _ = L.cupo_nube(credito, ahora, vivas, max_vivas=tope)
        if not ok:
            decir("paro: %s" % motivo)
            break
        fila = _lanzar_una(t, cola, m, ahora, seco, lanzador, decir)
        if fila:
            hechas.append(fila)
            vivas += 1
    return hechas


def seguir(aplicar=False, ahora=None, ramas=ramas_remotas_real, traer=traer_real, decir=print):
    """Mira qué sesiones dejaron su rama y, con `aplicar`, trae, devuelve u olvida."""
    ahora = time.time() if ahora is None else ahora
    reg = leer_registro()
    progreso = traer_nube._progreso()
    acciones = L.seguir(reg, ramas(), progreso, ahora, gracia_h=GRACIA_H)
    por_tarea = {str(s["tarea"]): s for s in L.abiertas(reg)}
    for tid, accion in sorted(acciones.items()):
        decir("%-9s %-14s %s" % (accion, tid, por_tarea[tid].get("url", "")))
    if not aplicar or not acciones:
        return acciones
    cambios = {}
    for tid, accion in acciones.items():
        s = por_tarea[tid]
        if accion == "traer":
            cambios[tid] = {"estado": "pendiente", "medio": "", "nota": "traída del carril en la nube (%s)" % s.get("url")}
        elif accion == "devolver":
            horas = int((ahora - float(s.get("t") or 0)) // 3600)
            cambios[tid] = {"estado": "pendiente", "medio": "",
                            "nota": "devuelta del carril en la nube: sin rama tras %d h (sesión %s)" % (horas, s.get("url"))}
    if cambios:
        traer_nube._actualizar_progreso(cambios)
    if any(a == "traer" for a in acciones.values()):
        rc, cola = traer()
        decir("traer_nube revisar --aplicar → %s" % ("bien" if rc == 0 else "salió con %s" % rc))
    reg = leer_registro()
    nuevas = []
    for s in reg["sesiones"]:
        tid = str(s.get("tarea"))
        accion = acciones.get(tid) if not s.get("final") else None
        if accion == "olvidar":
            continue
        if accion in ("traer", "devolver"):
            s = dict(s, final="traida" if accion == "traer" else "devuelta", t_final=ahora)
        nuevas.append(s)
    reg["sesiones"] = nuevas
    _escribir_json(REGISTRO, reg)
    return acciones


def ciclo(ahora=None, ramas=ramas_remotas_real, traer=traer_real, lanzador=lanzador_real, decir=print):
    """Lo que corre launchd cada 15 min: traer lo que llegó y llenar los huecos."""
    seguir(aplicar=True, ahora=ahora, ramas=ramas, traer=traer, decir=decir)
    motivo = pausada()
    if motivo:
        decir("carril en la nube en pausa: %s (no lanzo)" % motivo)
        return []
    return lanzar(auto=True, ahora=ahora, lanzador=lanzador, decir=decir)


def ver(ahora=None):
    ahora = time.time() if ahora is None else ahora
    reg = leer_registro()
    progreso = traer_nube._progreso()
    credito = _leer_json(CREDITO, {})
    vivas = L.sesiones_vivas(reg, progreso)
    ok, motivo, hoy = L.cupo_nube(credito, ahora, vivas, max_vivas=max_vivas())
    sesiones = []
    for s in L.abiertas(reg):
        tid = str(s["tarea"])
        e = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
        sesiones.append({"tarea": tid, "url": s.get("url"), "modelo": s.get("modelo"),
                         "horas": round((ahora - float(s.get("t") or 0)) / 3600, 1),
                         "estado": "%s · %s" % (e.get("estado") or "pendiente", e.get("medio") or "-")})
    return {"restante_usd": credito.get("restante_usd"), "vence": credito.get("vence"),
            "presupuesto_hoy_usd": hoy, "puede_lanzar": ok, "motivo": motivo, "vivas": vivas,
            "max_vivas": max_vivas(), "pausa": pausada(), "sesiones": sesiones}


def _valor(argv, nombre):
    if nombre in argv:
        i = argv.index(nombre)
        if i + 1 < len(argv):
            return argv[i + 1]
    return None


def main(argv):
    orden = argv[1] if len(argv) > 1 else "ver"
    if orden == "lanzar":
        ids = [x.strip() for x in (_valor(argv, "--ids") or "").split(",") if x.strip()]
        maximo = _valor(argv, "--max")
        if "--auto" not in argv and not ids:
            print("lanzar necesita --ids A,B o --auto")
            return 2
        lanzar(ids=ids, modelo=_valor(argv, "--modelo"), seco="--seco" in argv, auto="--auto" in argv,
               maximo=int(maximo) if maximo else None)
        return 0
    if orden == "seguir":
        seguir(aplicar="--aplicar" in argv)
        return 0
    if orden == "ciclo":
        print(time.strftime("── ciclo %Y-%m-%d %H:%M:%S"))
        ciclo()
        return 0
    if orden == "ver":
        v = ver()
        if "--json" in argv:
            print(json.dumps(v, ensure_ascii=False, indent=1))
            return 0
        print("Crédito: %s $ (vence %s) · hoy %.2f $ · %d/%d vivas · %s"
              % (v["restante_usd"], v["vence"], v["presupuesto_hoy_usd"], v["vivas"], v["max_vivas"], v["motivo"]))
        if v["pausa"]:
            print("En pausa: %s" % v["pausa"])
        for s in v["sesiones"]:
            print("  %-14s %-16s %5.1f h  %-24s %s" % (s["tarea"], s["modelo"], s["horas"], s["estado"], s["url"]))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
