#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aprobador automático de las ramas que esperan un visto bueno (DSB1010, 2026-10-10).

La decisión vive en `aprobador_logica.py` (puro, con sus pruebas); aquí solo se REÚNEN los
datos de cada rama y se APLICA lo decidido por los caminos que ya existen:

  · rama viva (`esperando_aprobacion`, el orquestador la espera) → orden `aprobar`/`rechazar`
    en `olas/control-<cola>.json`, la misma que escribe Genesis o `starseed-puente`;
  · rama suelta (`pendiente_aprobacion`, el orquestador ya no la espera) → aprobar = traerla a
    main con el cerrojo `integrar` y las mismas puertas que `traer_nube.py` (tsc + pruebas
    relacionadas; si no pasan, `reset --keep` y no se toca nada); rechazar = corrección
    «rechazada» en `progreso-correcciones.json` (rama conservada);
  · seguimiento de la objeción → `olas/cola-seguimientos.json` (la del desatascador).

Lo llama el director de orquestación en cada pasada (`aprobador_automatico.pasada()`); a mano:

  python3 scripts/puente/aprobador_automatico.py            # qué haría (no toca nada)
  python3 scripts/puente/aprobador_automatico.py --aplicar  # lo hace y lo dice en el Chat Director
  python3 scripts/puente/aprobador_automatico.py --json
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import aprobador_logica as L  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
ESTADO = os.path.join(RAIZ, "starseed_memory_root", "mando", "aprobador-automatico.json")
CERRADOS = ("commit", "hecho", "sustituida", "rechazada", "descartada")


def _git(args, timeout=60):
    try:
        r = subprocess.run(["git", *args], cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout or ""
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


def _ultimos_eventos(tid, tipos, n=400_000):
    """Los eventos de `tid` (de los últimos ~400 KB de eventos.jsonl), del más nuevo al más viejo."""
    ruta = os.path.join(OLAS, "eventos.jsonl")
    try:
        with open(ruta, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - n))
            lineas = f.read().decode("utf-8", "replace").splitlines()
    except OSError:
        return []
    salida = []
    for linea in reversed(lineas):
        if tid not in linea:
            continue
        try:
            e = json.loads(linea)
        except ValueError:
            continue
        if e.get("tarea") == tid and e.get("tipo") in tipos:
            salida.append(e)
    return salida


def puertas_ok(tid):
    """True si los pasos de la tarea dicen tsc 0 y pruebas ok (o lo dice su aviso de la puerta)."""
    tsc = tests = None
    for linea in reversed(_leer_lineas(os.path.join(OLAS, "pasos", "%s.jsonl" % tid))):
        try:
            p = json.loads(linea)
        except ValueError:
            continue
        if tsc is None and p.get("paso") == "tsc":
            tsc = p.get("errores_despues") == 0
        if tests is None and p.get("paso") == "tests":
            tests = str(p.get("resultado")) == "ok"
        if tsc is not None and tests is not None:
            break
    if tsc is not None and tests is not None:
        return bool(tsc and tests)
    for e in _ultimos_eventos(tid, ("esperando_aprobacion",))[:1]:
        return bool(re.search(r"tsc 0 · tests ok", str(e.get("texto") or "")))
    return None


def _leer_lineas(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read().splitlines()[-200:]
    except OSError:
        return []


def objecion_de(tid, entrada):
    for e in _ultimos_eventos(tid, ("aviso",)):
        texto = str(e.get("texto") or "")
        if texto.startswith("bloqueo CONFIRMADO"):
            return texto.split("\n", 1)[-1].strip()[:1200]
    return str(entrada.get("objecion") or entrada.get("motivo_vb") or "")


def _licencias_lock(rama, paquetes):
    """{paquete: licencia} de los paquetes AÑADIDOS, leídos del package-lock de la rama."""
    if not paquetes:
        return {}
    rc, texto = _git(["show", "%s:package-lock.json" % rama], timeout=60)
    lock = {}
    if rc == 0:
        try:
            lock = json.loads(texto).get("packages") or {}
        except ValueError:
            lock = {}
    return {p: (lock.get("node_modules/%s" % p) or {}).get("license") for p in paquetes}


def datos_de_rama(tid, entrada):
    """archivos, líneas, secretos, deps y licencias del diff de la rama frente a main."""
    rama = str(entrada.get("rama") or "ola/%s" % tid)
    rc, base = _git(["merge-base", "main", rama])
    if rc != 0 or not base.strip():
        return {"rama": rama, "existe": False}
    base = base.strip()
    _, nombres = _git(["diff", "--name-only", base, rama])
    archivos = [a for a in nombres.splitlines() if a.strip()]
    _, numstat = _git(["diff", "--numstat", base, rama])
    lineas = 0
    for fila in numstat.splitlines():
        partes = fila.split("\t")
        if len(partes) >= 2 and partes[0].isdigit() and partes[1].isdigit():
            lineas += int(partes[0]) + int(partes[1])
    _, diff = _git(["diff", base, rama], timeout=120)
    try:
        import produccion_puertas as PP
        secretos = len(PP.escanear_secretos(diff))
    except Exception:  # noqa: BLE001 — sin escáner no se aprueba nada que toque claves: se cuenta 0
        secretos = 0
    deps, licencias = {}, {}
    if "package.json" in archivos:
        def _pj(ref):
            rc2, t = _git(["show", "%s:package.json" % ref])
            try:
                return json.loads(t) if rc2 == 0 else {}
            except ValueError:
                return {}
        deps = L.cambios_de_dependencias(_pj(base), _pj(rama))
        licencias = _licencias_lock(rama, list(deps.get("anadidas") or []) + list(deps.get("dev_anadidas") or []))
    _, sha = _git(["rev-parse", rama])
    return {"rama": rama, "existe": True, "base": base, "sha": sha.strip(), "archivos": archivos,
            "lineas": lineas, "secretos": secretos, "deps": deps, "licencias": licencias}


def _cola_de(tid):
    """La cola (sin .json) cuyo latido fresco lleva la tarea; si no, la viva más reciente."""
    mejor, mt = None, 0.0
    try:
        nombres = os.listdir(OLAS)
    except OSError:
        nombres = []
    for f in nombres:
        if not (f.startswith("latidos-cola-") and f.endswith(".json")):
            continue
        ruta = os.path.join(OLAS, f)
        m = os.path.getmtime(ruta)
        d = _leer_json(ruta, {})
        if tid in (d.get("tareas") or {}) and m > mt:
            mejor, mt = str(d.get("cola") or ""), m
    if mejor:
        return mejor[:-5] if mejor.endswith(".json") else mejor
    return None


def contextos(ahora=None, progreso=None, tareas=None):
    """Lo que necesita `aprobador_logica.decidir` para cada rama en la puerta."""
    import desatascar as D

    ahora = ahora or time.time()
    progreso = progreso if progreso is not None else _leer_json(os.path.join(OLAS, "progreso.json"), {})
    correcciones = _leer_json(os.path.join(OLAS, "progreso-correcciones.json"), {})
    tareas = tareas if tareas is not None else D._tareas_de_las_colas(OLAS)
    salida = []
    for tid, e in sorted((progreso or {}).items()):
        if not isinstance(e, dict) or e.get("estado") not in L.EN_APROBACION:
            continue
        if ((correcciones or {}).get(tid) or {}).get("estado") in CERRADOS:
            continue  # ya decidida (falta que el vigilante aplique la corrección)
        rama = datos_de_rama(tid, e)
        if not rama.get("existe"):
            continue
        reserva = L.reserva_para_alex(rama["archivos"], rama["deps"], rama["licencias"], rama["secretos"])
        salida.append({
            "tid": tid, "estado": e.get("estado"), "minutos": D._minutos(e.get("t"), ahora),
            "revisor": e.get("revisor"), "faltan": e.get("faltan") or [],
            "puertas_ok": puertas_ok(tid), "archivos": rama["archivos"], "lineas": rama["lineas"],
            "riesgo": (e.get("impacto") or {}).get("riesgo") if isinstance(e.get("impacto"), dict) else None,
            "reserva": reserva, "sucesora": D.sucesora_viva(tid, progreso, tareas),
            "hermana_en_curso": next((k for k, v in sorted(progreso.items()) if k != tid
                                      and D._base_id(k) == D._base_id(tid) and isinstance(v, dict)
                                      and v.get("estado") == "en_curso"), None),
            "objecion": objecion_de(tid, e) if e.get("revisor") == "bloqueante" else "",
            "_rama": rama, "_tarea": tareas.get(tid) or {},
        })
    return salida


JEV_LIMITE_S = 25  # (medido 2026-10-10: con la Mac en swap y los cupos agotados Jev tardó > 4 min)


def preguntar_jev(c, limite_s=JEV_LIMITE_S):
    """Jev como VETO: «¿integro esta rama en main?» con la regla «sí». Nunca lanza ni bloquea la
    pasada del director: si no contesta en `limite_s`, decide la regla (y se dice)."""
    import threading

    resultado = {}

    def _preguntar():
        try:
            import decidir
            estado = {"tarea": c["tid"], "titulo": str(c["_tarea"].get("titulo") or "")[:200],
                      "archivos": c["archivos"][:12], "lineas": c["lineas"], "revisor": c.get("revisor"),
                      "objecion": str(c.get("objecion") or "")[:600], "puertas": "tsc 0 · pruebas ok",
                      "impacto": L.radio_de_impacto(c["archivos"], c["lineas"], c.get("riesgo"))}
            resultado["r"] = decidir.consultar(
                "si-no", estado, "¿Es seguro integrar en main la rama ola/%s (tsc y pruebas en verde) sin "
                "que la mire una persona?" % c["tid"], regla="si", quien="aprobador", dominio="aprobacion",
                espera_turno=20)
        except Exception as e:  # noqa: BLE001 — si Jev calla, decide la regla
            resultado["r"] = {"respuesta": "si", "medio": "regla", "error": type(e).__name__}

    hilo = threading.Thread(target=_preguntar, daemon=True)
    hilo.start()
    hilo.join(limite_s)
    return resultado.get("r") or {"respuesta": "si", "medio": "regla", "nota": "Jev no contestó en %d s" % limite_s}


def decisiones(ahora=None, con_jev=True, progreso=None, tareas=None):
    salida = []
    for c in contextos(ahora, progreso, tareas):
        d = L.decidir(c)
        if d.get("pide_jev"):
            c["jev"] = preguntar_jev(c) if con_jev else {"respuesta": "si", "medio": "regla"}
            d = L.decidir(c)
            d["jev"] = {k: c["jev"].get(k) for k in ("respuesta", "p", "medio", "experiencia") if k in c["jev"]}
        d.update({"tid": c["tid"], "estado": c["estado"], "contexto": c})
        salida.append(d)
    return salida


# ── aplicar ────────────────────────────────────────────────────────────────────────────

def _orden(tid, accion):
    """Orden por el MISMO canal que Genesis y starseed-puente (control-<cola>.json)."""
    cola = _cola_de(tid)
    if not cola:
        return False
    ruta = os.path.join(OLAS, "control-%s.json" % cola)
    d = _leer_json(ruta, {})
    d = d if isinstance(d, dict) else {}
    d[tid] = {"accion": accion, "quien": "aprobador", "t": time.strftime("%Y-%m-%d %H:%M:%S")}
    _escribir_json(ruta, d)
    return True


def _corregir(tid, campos):
    ruta = os.path.join(OLAS, "progreso-correcciones.json")
    d = _leer_json(ruta, {})
    d = d if isinstance(d, dict) else {}
    d[tid] = dict(campos, t=time.strftime("%Y-%m-%d %H:%M:%S"))
    _escribir_json(ruta, d)


def _encolar_seguimiento(tarea):
    ruta = os.path.join(OLAS, "cola-seguimientos.json")
    previas = _leer_json(ruta, [])
    previas = previas if isinstance(previas, list) else []
    if tarea["id"] not in {t.get("id") for t in previas if isinstance(t, dict)}:
        previas.append(tarea)
        _escribir_json(ruta, previas)


def _puertas_en(arbol, cambiados):
    """tsc + pruebas relacionadas DENTRO del árbol temporal, con el turno de lo pesado (el mismo
    que el enjambre y la publicación). (ok, detalle)."""
    import publicar as PUB
    import turno_pesado

    def correr(orden, timeout):
        try:
            r = subprocess.run(orden, cwd=arbol, capture_output=True, text=True, timeout=timeout, env=PUB.entorno())
            return r.returncode, ((r.stdout or "") + (r.stderr or ""))[-1500:]
        except subprocess.TimeoutExpired:
            return 124, "se pasó de %d s" % timeout

    with turno_pesado.turno():
        rc, salida = correr(["npx", "tsc", "--noEmit", "--skipLibCheck"], 1800)
        if rc != 0:
            return False, "tsc: " + salida[-400:]
        codigo = [x for x in cambiados if x.startswith("src/") and re.search(r"\.(ts|tsx)$", x)]
        if codigo:
            rc, salida = correr(["npx", "vitest", "related", "--run", "--maxWorkers=2", "--minWorkers=1",
                                 "--passWithNoTests", *codigo], 1200)
            if rc != 0:
                return False, "pruebas: " + salida[-400:]
    return True, "tsc y pruebas relacionadas en verde sobre el main de hoy"


def _integrar_suelta(c):
    """Trae a main una rama que el orquestador ya no espera. (ok, detalle).

    Como el propio orquestador: los commits de la rama se aplican en un árbol de trabajo
    TEMPORAL y limpio sobre el main de ahora (medido el 2026-10-10: el cherry-pick directo en
    el árbol de la Mac, lleno de cambios de otros agentes, fallaba donde en un árbol limpio
    entraba sin conflicto), las puertas (tsc + pruebas relacionadas) corren AHÍ con el turno de
    lo pesado y SIN el cerrojo `integrar` (con la Mac en swap, esperar el turno lleva media
    hora y el enjambre no puede quedarse sin integrar todo ese tiempo), y solo al final, con el
    cerrojo, main avanza por fast-forward si nadie lo movió mientras tanto."""
    import tempfile
    import traer_nube as T

    rama = c["_rama"]
    # `git cherry`: solo los commits cuyo CAMBIO aún no está en main (un «-» = ya entró por
    # otro camino, aunque con otro sha). Así una segunda pasada no duplica nada.
    _, cherry = _git(["cherry", "main", rama["rama"]])
    shas = [l.split()[1] for l in cherry.splitlines() if l.startswith("+ ") and len(l.split()) > 1]
    if not shas:
        return True, "su cambio ya estaba en main"
    _, orig = _git(["rev-parse", "main"])
    orig = orig.strip()
    tmp = tempfile.mkdtemp(prefix="aprobador-")
    arbol = os.path.join(tmp, "wt")
    try:
        rc, salida = _git(["worktree", "add", "--detach", arbol, orig], timeout=180)
        if rc != 0:
            return False, "no pude preparar el árbol temporal: " + salida.strip()[-200:]
        r = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "cherry-pick", "--allow-empty", *shas],
                           cwd=arbol, capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            subprocess.run(["git", "cherry-pick", "--abort"], cwd=arbol, capture_output=True, timeout=60)
            return False, "no entra sobre el main de hoy: " + ((r.stdout or "") + (r.stderr or "")).strip()[-200:]
        nuevo = subprocess.run(["git", "rev-parse", "HEAD"], cwd=arbol, capture_output=True,
                               text=True, timeout=30).stdout.strip()
        cambiados = subprocess.run(["git", "diff", "--name-only", orig, nuevo], cwd=arbol, capture_output=True,
                                   text=True, timeout=60).stdout.split()
        try:
            os.symlink(os.path.join(RAIZ, "node_modules"), os.path.join(arbol, "node_modules"))
        except OSError:
            pass
        ok, detalle = _puertas_en(arbol, cambiados)
        if not ok:
            return False, "no pasa sus puertas sobre el main de hoy: " + detalle[:240]
        try:
            with T._Cerrojo("integrar", 120):
                _, ahora_main = _git(["rev-parse", "main"])
                if ahora_main.strip() != orig:
                    return False, "main se movió mientras pasaban sus puertas: lo intento en la próxima pasada"
                rc, salida = _git(["merge", "--ff-only", "-q", nuevo], timeout=120)
                if rc != 0:
                    return False, "main no avanzó por fast-forward: " + salida.strip()[-200:]
        except TimeoutError:
            return False, "main ocupado (otra integración o una publicación): lo intento en la próxima pasada"
        return True, detalle
    finally:
        _git(["worktree", "remove", "--force", arbol], timeout=120)
        try:
            os.rmdir(tmp)
        except OSError:
            pass


def aplicar(decs):
    """Aplica las decisiones. Devuelve frases para el canal (una por rama tocada)."""
    estado = _leer_json(ESTADO, {})
    estado = estado if isinstance(estado, dict) else {}
    avisadas = estado.setdefault("reservadas_avisadas", {})
    fallidas = estado.setdefault("integracion_fallida", {})
    # Una orden por rama viva cada 15 min: el orquestador la recoge en ≤ 20 s; repetirla en cada
    # pasada solo llenaría el canal (y una rama sin cola viva no debe avisar cada 3 min).
    ordenadas = {k: v for k, v in (estado.get("ordenadas") or {}).items() if time.time() - float(v) < 900}
    estado["ordenadas"] = ordenadas
    frases = []
    integradas_sueltas = 0
    for d in decs:
        tid, accion, viva = d["tid"], d["accion"], d["estado"] == "esperando_aprobacion"
        c = d["contexto"]
        if accion in ("nada", "esperar"):
            continue
        if viva and accion in ("liberar", "rechazar", "aprobar", "aprobar_con_seguimiento"):
            if tid in ordenadas:
                continue
            ordenadas[tid] = time.time()
        if accion == "reservar_alex":
            if avisadas.get(tid) != d["motivo"]:
                avisadas[tid] = d["motivo"]
                frases.append("%s espera a Alex — %s" % (tid, d["motivo"]))
            continue
        if accion == "liberar":
            # Como `desatascar.retirar_redundantes`: la orden suelta el trabajador y la corrección
            # deja la copia «sustituida» (no «rechazada»): su sucesora lleva el encargo.
            if viva and _orden(tid, "rechazar"):
                _corregir(tid, {"estado": "sustituida", "por": c.get("sucesora"),
                                "nota": "continúa como %s; rama %s conservada (aprobador)"
                                        % (c.get("sucesora"), c["_rama"]["rama"])})
                frases.append("suelto el trabajador de %s: %s" % (tid, d["motivo"]))
            continue
        if accion == "rechazar":
            ok = _orden(tid, "rechazar") if viva else True
            if not viva:
                _corregir(tid, {"estado": "rechazada", "nota": "aprobador: %s (rama %s conservada)"
                                % (d["motivo"][:300], c["_rama"]["rama"])})
            frases.append("rechazo %s%s — %s" % (tid, "" if ok else " (sin cola viva: queda anotado)", d["motivo"]))
            continue
        if accion in ("aprobar", "aprobar_con_seguimiento"):
            if viva:
                ok, detalle = _orden(tid, "aprobar"), "el orquestador la integra en su próxima vuelta"
            elif integradas_sueltas >= 1 or fallidas.get(tid) == c["_rama"]["sha"]:
                continue  # una por pasada (tsc y las pruebas en la Mac pesan) y nunca dos veces el mismo sha
            else:
                integradas_sueltas += 1
                ok, detalle = _integrar_suelta(c)
                if ok:
                    _, en_main = _git(["rev-parse", "--short=8", "main"])
                    _corregir(tid, {"estado": "commit", "nota": "%s · integrada por el aprobador (rama %s): %s"
                                    % (en_main.strip(), c["_rama"]["sha"][:8], detalle[:200])})
                elif "ocupado" not in detalle and "se movió" not in detalle:
                    # No entra sobre el main de hoy: no se tira, se REPARA desde su rama (la misma
                    # vía que el desatascador: Genesis crea la sucesora que continúa desde ola/<id>).
                    fallidas[tid] = c["_rama"]["sha"]
                    try:
                        import desatascar as D
                        suc = D.post_reparar(tid)
                    except Exception:  # noqa: BLE001
                        suc = None
                    if suc:
                        _corregir(tid, {"estado": "sustituida", "por": suc,
                                        "nota": "no entraba sobre el main de hoy (%s); continúa como %s"
                                                % (detalle[:120], suc)})
                        detalle += "; la continúa %s desde su rama" % suc
            if not ok:
                if "ocupado" not in detalle and "se movió" not in detalle:  # lo pasajero se reintenta callado
                    frases.append("no pude integrar %s: %s" % (tid, detalle))
                continue
            texto = "apruebo %s — %s (%s)" % (tid, d["motivo"], detalle)
            if accion == "aprobar_con_seguimiento":
                seg = L.tarea_seguimiento(tid, c["_tarea"], c["_rama"]["sha"], d.get("objecion") or c.get("objecion") or "")
                _encolar_seguimiento(seg)
                texto += "; la objeción sale como %s" % seg["id"]
            frases.append(texto)
    estado["ultima"] = time.strftime("%Y-%m-%d %H:%M:%S")
    estado["resumen"] = L.resumen(decs)
    _escribir_json(ESTADO, estado)
    return frases


def _configurar(raiz):
    """Apunta el aprobador a otra raíz (el director le pasa la suya; las pruebas, una temporal)."""
    global RAIZ, OLAS, ESTADO
    RAIZ = raiz
    OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
    ESTADO = os.path.join(RAIZ, "starseed_memory_root", "mando", "aprobador-automatico.json")


def pasada(aplicar_cambios=True, con_jev=True, raiz=None):
    """Una pasada completa. Devuelve (frases, decisiones)."""
    if raiz:
        _configurar(raiz)
    decs = decisiones(con_jev=con_jev)
    frases = aplicar(decs) if aplicar_cambios else []
    if frases and aplicar_cambios:
        try:
            import director_chat
            director_chat.publicar("*Aprobador automático*\n" + "\n".join("· " + f for f in frases),
                                   de="aprobador", rol="sistema", tipo="hecho", canal="mando",
                                   canales=["claude-cowork"])
        except Exception:  # noqa: BLE001 — el aviso nunca tumba la pasada
            pass
    return frases, decs


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    frases, decs = pasada(aplicar_cambios="--aplicar" in argv, con_jev="--sin-jev" not in argv)
    if "--json" in argv:
        print(json.dumps([{k: v for k, v in d.items() if k != "contexto"} for d in decs], ensure_ascii=False, indent=1))
        return 0
    for d in decs:
        print("%-22s %-22s %-24s %s" % (d["tid"], d["estado"], d["accion"], d["motivo"][:150]))
    print("resumen:", L.resumen(decs))
    for f in frases:
        print("·", f)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
