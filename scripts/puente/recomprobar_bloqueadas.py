#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recomprueba TODAS las bloqueadas con los directores (botón del medidor «Bloqueadas»).

Alex (2026-10-08): «para las bloqueadas agrega un botón de recomprobar todas con los directores
desde el medidor». Medido ese día: 36 bloqueadas (28 «escalada agotada tras 8 intentos (libre×8)»,
casi todas de los días en que todos los proveedores gratuitos estaban sin cupo; 8 que la nube no
integró; 1 que YA estaba en main).

Qué decide, tarea por tarea (PURO: `clasificar`):
  · ya en main (su commit de integración, misma ola y mismo id) → «commit»;
  · el fallo fue del MEDIO (sin cupo, todos caídos, la nube dijo sin_cambios/en_curso, escalada
    con modelos libres) → vuelve a la cola de la Mac («pendiente», medio «mac»): la sonda del
    orquestador ya espera a que haya un escritor con cupo en vez de gastar intentos;
  · el fallo es de la TAREA (no tocó sus archivos, puertas en rojo con modelo de pago…) → sigue,
    con el motivo: necesita «Reintentar con un cambio» o una persona.
Jev opina SOLO sobre las que se reabrirían y llevan más de 7 días: si está seguro (p ≥ 0,9) de que
ya no tiene sentido, no se reabre y se dice («decide Alex»). Nunca archiva nada por su cuenta.
Cada tarea se reabre por aquí como mucho una vez cada 24 h. Los cambios van por
`olas/progreso-correcciones.json`, el camino de siempre (los aplica el vigilante sin pisar al
orquestador vivo).

Uso: python3 scripts/puente/recomprobar_bloqueadas.py [--simular] [--json]
"""
import glob
import json
import os
import re
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
FUENTES = os.path.join(RAIZ, "starseed_memory_root", "colas-fuente")
PROGRESO = os.path.join(OLAS, "progreso.json")
CORRECCIONES = os.path.join(OLAS, "progreso-correcciones.json")
INFORME = os.path.join(RAIZ, "starseed_memory_root", "mando", "recomprobacion-bloqueadas.json")
MEMORIA = os.path.expanduser("~/.starseed/recomprobaciones-bloqueadas.json")

ESTADOS_BLOQUEADOS = ("bloqueada", "bloqueante")
UNA_VEZ_CADA_S = 24 * 3600
JEV_VIEJA_S = 7 * 24 * 3600
JEV_OBSOLETA = 0.9

#: Señales de que el fallo fue del MEDIO (proveedores, nube, cupos), no de la tarea.
_MEDIO = re.compile(
    r"libre×|sin_cambios|«en_curso»|ning[uú]n proveedor|todos ca[ií]dos|sin cupo|cupo del d[ií]a|"
    r"\b429\b|\b402\b|rate.?limit|timeout|colgad|no lleg[oó] a github|la nube la intent[oó]",
    re.I)
#: Señales de que la TAREA falla por sí misma: repetirla igual no sirve.
_TAREA = re.compile(r"no toc[oó] ning|alcance|puertas? en rojo|tsc|vitest|revisi[oó]n (es )?bloqueante|conflicto", re.I)


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


def tareas_conocidas(carpetas):
    """{id: tarea} de todas las colas (vivas y archivadas). La más reciente gana."""
    salida = {}
    archivos = []
    for c in carpetas:
        archivos += glob.glob(os.path.join(c, "cola-*.json"))
    for ruta in sorted(archivos, key=lambda r: os.path.getmtime(r) if os.path.exists(r) else 0):
        d = _leer(ruta, None)
        lista = d if isinstance(d, list) else (d or {}).get("tareas") if isinstance(d, dict) else None
        for t in lista or []:
            if isinstance(t, dict) and t.get("id"):
                salida[str(t["id"])] = t
    return salida


def en_main(tid, tarea, asuntos):
    """Integrada si hay un commit de integración de ESA tarea (no un «salvavidas»)."""
    try:
        import identidad_tarea
        if tarea and identidad_tarea.esta_integrada(tarea, asuntos):
            return True
    except Exception:
        pass
    patron = re.compile(r"^Ola [^·]+·.*· %s: " % re.escape(tid))
    return any(patron.search(a or "") for a in asuntos or [])


def _titulo_normal(t):
    return re.sub(r"\W+", " ", str((t or {}).get("titulo") or "")).strip().lower()


def sucesora_integrada(tid, progreso, tareas=None):
    """La sucesora (mismo id + sufijo en minúsculas: BLQ1005A → BLQ1005Ad) en «commit», o una
    HERMANA (mismo id base: p318Jc ↔ p318Jb) en «commit» con el MISMO título. (2026-10-08)
    p318Jc y PRD1005T seguían «bloqueadas» con p318Jb y PRD1005Tb ya integradas en main."""
    base = re.sub(r"(?<=[A-Z0-9])[a-z]+$", "", tid)
    for k, v in sorted((progreso or {}).items()):
        if k == tid or not isinstance(v, dict) or v.get("estado") != "commit":
            continue
        if k.startswith(tid) and re.fullmatch(r"[a-z]+", k[len(tid):] or "-"):
            return k
        if tareas is not None and k.startswith(base) and re.fullmatch(r"[a-z]*", k[len(base):]) \
                and _titulo_normal(tareas.get(k)) and _titulo_normal(tareas.get(k)) == _titulo_normal(tareas.get(tid)):
            return k
    return None


#: Ventana en la que cuentan los intentos de la propia Mac para juzgar la tarea.
VENTANA_PASOS_S = 72 * 3600


def falla_repetida(pasos, ahora, ventana_s=VENTANA_PASOS_S):
    """PURA. Si los intentos de la Mac fallan por la PROPIA tarea, el porqué; si no, None.

    (2026-10-08) «escalada agotada tras 8 intentos (libre×8)» parecía fallo del medio y se
    reabría, pero R7c llevaba tres intentos con los mismos 14 errores de tsc: repetirla igual no
    sirve. Cuenta solo tsc (lo mide el worktree tras escribir; main está en 0): las pruebas en
    rojo no, porque a veces era main el que estaba roto (PRD1005S el 10-05, veredicto-servidor).
    Hacen falta los DOS últimos tsc en rojo y el último dentro de la ventana."""
    tsc = [p for p in pasos or [] if p.get("paso") == "tsc"]
    if len(tsc) < 2:
        return None
    ultimo, penultimo = tsc[-1], tsc[-2]
    try:
        t = time.mktime(time.strptime(str(ultimo.get("t"))[:19], "%Y-%m-%d %H:%M:%S"))
    except ValueError:
        return None
    if ahora - t > ventana_s:
        return None
    rojos = [p for p in (penultimo, ultimo) if str(p.get("errores_despues") or "0") not in ("0", "")]
    if len(rojos) == 2:
        n = sum(1 for p in tsc if str(p.get("errores_despues") or "0") not in ("0", ""))
        return "tsc sigue con %s errores tras %d intentos" % (ultimo.get("errores_despues"), n)
    return None


def clasificar(tid, entrada, tarea, asuntos, ahora, ultima_reapertura=None, fuentes=None, progreso=None,
               tareas=None, pasos=None):
    """('commit'|'sustituida'|'reabrir'|'sigue', motivo). PURA.

    `fuentes`: ids definidos por alguna cola FUENTE viva (no `cola-auto-*`). (2026-10-08) Reabrir
    una tarea que solo vive en copias `auto` no sirve: el reconciliador la cierra al momento como
    «huérfana» (pasó con 10 de 34). Esas se dicen por su nombre: o ya las hizo una sucesora, o
    hay que rehacerlas en una cola nueva. `pasos`: los intentos de la Mac (`olas/pasos/<id>.jsonl`)."""
    nota = str((entrada or {}).get("nota") or "")
    if en_main(tid, tarea, asuntos):
        return "commit", "ya estaba integrada en main"
    suc = sucesora_integrada(tid, progreso, tareas)
    if suc:
        return "sustituida", "la hizo %s (ya en main)" % suc
    if fuentes is not None and tid not in fuentes:
        return "sigue", "su ola está cerrada (ninguna cola fuente la define): hay que rehacerla en una cola nueva"
    if tarea is not None and "archivos" in tarea and not tarea.get("archivos"):
        return "sigue", "no declara archivos: no es trabajo de código para el enjambre, lo revisa la dirección"
    repetida = falla_repetida(pasos, ahora)
    if repetida:
        return "sigue", "falla la propia tarea: %s; repetirla igual no sirve" % repetida
    if ultima_reapertura and ahora - float(ultima_reapertura) < UNA_VEZ_CADA_S:
        return "sigue", "ya se reabrió por aquí hace menos de 24 h"
    if _TAREA.search(nota) and not re.search(r"libre×", nota):
        return "sigue", "falla la propia tarea: «Reintentar con un cambio» o una persona"
    if _MEDIO.search(nota):
        return "reabrir", "el fallo fue del medio (proveedores o nube), no de la tarea"
    return "sigue", "sin una causa clara de medio: la revisa una persona"


def antigua(entrada, ahora):
    t = str((entrada or {}).get("t") or "")
    try:
        return ahora - time.mktime(time.strptime(t[:19], "%Y-%m-%dT%H:%M:%S")) > JEV_VIEJA_S
    except ValueError:
        try:
            return ahora - time.mktime(time.strptime(t[:16], "%Y-%m-%d %H:%M")) > JEV_VIEJA_S
        except ValueError:
            return False


def opinion_jev(candidatas, titulos, asuntos, consultar_lote=None):
    """{tid: p_obsoleta} para las candidatas. Sin Jev, vacío (se reabren todas)."""
    if not candidatas:
        return {}
    if consultar_lote is None:
        try:
            import decidir
            consultar_lote = decidir.consultar_lote
        except Exception:
            return {}
    integraciones = [a[:120] for a in asuntos if a.startswith("Ola ")][:40]
    salida = {}
    for i in range(0, len(candidatas), 24):
        trozo = candidatas[i:i + 24]
        preguntas = {tid: {"tipo": "si-no",
                           "pregunta": "¿Ha quedado obsoleta (ya hecha por otra tarea o sin sentido hoy) la "
                                       "tarea %s: «%s»?" % (tid, (titulos.get(tid) or "")[:160])}
                     for tid in trozo}
        try:
            r = consultar_lote({"integraciones_recientes_en_main": integraciones}, preguntas,
                               quien="director-bloqueadas", dominio="bloqueadas")
        except Exception:
            continue
        for tid, resp in ((r or {}).get("respuestas") or {}).items():
            si = str(resp.get("respuesta")).lower() in ("sí", "si", "true")
            conf = float(resp.get("confianza") or resp.get("p") or 0)
            if si:
                salida[tid] = conf
    return salida


def recomprobar(progreso, tareas, asuntos, ahora, memoria, jev=None, fuentes=None, pasos=None):
    """Decide todo. Devuelve (correcciones, informe, memoria_nueva). PURA salvo `jev`."""
    bloqueadas = {k: v for k, v in (progreso or {}).items()
                  if isinstance(v, dict) and v.get("estado") in ESTADOS_BLOQUEADOS}
    decisiones = {}
    for tid, v in sorted(bloqueadas.items()):
        decisiones[tid] = clasificar(tid, v, tareas.get(tid), asuntos, ahora, (memoria or {}).get(tid),
                                     fuentes=fuentes, progreso=progreso, tareas=tareas,
                                     pasos=(pasos or {}).get(tid))
    viejas = [t for t, (d, _) in decisiones.items() if d == "reabrir" and antigua(bloqueadas[t], ahora)]
    titulos = {t: str((tareas.get(t) or {}).get("titulo") or "") for t in viejas}
    obsoletas = {t: p for t, p in (jev(viejas, titulos) if jev else {}).items() if p >= JEV_OBSOLETA}
    hora = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora))
    correcciones, informe, memoria_nueva = {}, {"integradas": [], "sustituidas": [], "reabiertas": [], "siguen": []}, dict(memoria or {})
    for tid, (decision, motivo) in decisiones.items():
        if decision == "reabrir" and tid in obsoletas:
            decision, motivo = "sigue", "Jev la ve obsoleta (%.2f): decide Alex si se archiva o se reintenta" % obsoletas[tid]
        if decision == "commit":
            correcciones[tid] = {"estado": "commit", "nota": "recomprobada por los directores: %s" % motivo, "t": hora}
            informe["integradas"].append(tid)
        elif decision == "sustituida":
            correcciones[tid] = {"estado": "sustituida", "nota": "recomprobada por los directores: %s" % motivo, "t": hora}
            informe["sustituidas"].append(tid)
        elif decision == "reabrir":
            correcciones[tid] = {"estado": "pendiente", "medio": "mac", "t": hora,
                                 "nota": "recomprobada por los directores: %s; vuelve a la cola de la Mac" % motivo}
            informe["reabiertas"].append(tid)
            memoria_nueva[tid] = ahora
        else:
            informe["siguen"].append({"id": tid, "motivo": motivo})
    informe["total"] = len(bloqueadas)
    return correcciones, informe, memoria_nueva


#: Estados de una tarea que todavía va a salir por sí sola.
_VIVOS = ("pendiente", "en_curso", "pendiente_aprobacion", "reasignada")


def dependencias(tarea):
    deps = (tarea or {}).get("depende") or []
    return [str(d) for d in ([deps] if isinstance(deps, str) else deps) if d]


def _sucesora_viva(dep, estados):
    """Una sucesora (mismo id + sufijo en minúsculas) que va a salir o ya salió."""
    for k, e in sorted(estados.items()):
        if k != dep and k.startswith(dep) and re.fullmatch(r"[a-z]+", k[len(dep):] or "-") \
                and e in _VIVOS + ("commit", "hecho"):
            return k
    return None


def borrables(progreso, tareas, asuntos, informe, candidatos, definidas=()):
    """({tid: motivo} que se borran, {tid: motivo} que se quedan porque se pueden reaplicar). PURA.

    Alex (2026-10-08): «al lado de Recomprobar todas con los directores pon uno para borrarlas,
    antes revisa que no sean reaplicables». Se parte de lo que ya decidió `recomprobar` (los
    directores): lo que vuelve a la cola o se reabrió hace menos de 24 h SE QUEDA; lo que falla
    por sí misma, está obsoleta o su ola cerró, se borra. Y una tarea que espera a otra solo se
    queda si esa otra (o una sucesora suya) todavía va a salir: si su dependencia se borra o
    murió, tampoco se puede reaplicar y se borra con ella (hasta que no cambie nada).
    «Borrar» = estado «rechazada» con el motivo; la rama, si la hay, se conserva."""
    estados = {k: (v or {}).get("estado") for k, v in (progreso or {}).items() if isinstance(v, dict)}
    for tid in informe.get("integradas", []):
        estados[tid] = "commit"
    for tid in informe.get("sustituidas", []):
        estados[tid] = "sustituida"
    for tid in informe.get("reabiertas", []):
        estados[tid] = "pendiente"
    cerradas = set(informe.get("integradas", [])) | set(informe.get("sustituidas", []))
    borrar, quedan = {}, {}
    for s in informe.get("siguen", []):
        if str(s.get("motivo", "")).startswith("ya se reabrió"):
            quedan[s["id"]] = "se reabrió hace menos de 24 h: vuelve a intentarse sola"
        else:
            borrar[s["id"]] = s["motivo"]
    for tid in informe.get("reabiertas", []):
        quedan[tid] = "el fallo fue del medio: vuelve a la cola"

    def viva(dep):
        if dep in borrar:
            return False
        e = estados.get(dep)
        if e in ("commit", "hecho") or en_main(dep, tareas.get(dep), asuntos):
            return True
        if e in _VIVOS:
            return True
        if not e and dep in definidas:  # recién definida en una cola de código: aún no empezó
            return True
        if e in ESTADOS_BLOQUEADOS:
            return dep in quedan
        return _sucesora_viva(dep, estados) is not None

    cambio = True
    while cambio:
        cambio = False
        for tid in sorted(set(candidatos) - cerradas - set(borrar)):
            muertas = [d for d in dependencias(tareas.get(tid)) if not viva(d)]
            if muertas:
                borrar[tid] = "espera a %s, que ya no va a salir" % ", ".join(muertas)
                quedan.pop(tid, None)
                cambio = True
            elif tid not in quedan:
                # Solo se nombran las dependencias que siguen ABIERTAS, con su estado: «espera a
                # CAMR1005Db (fallo_tsc)» dice dónde está el nudo; las ya integradas no.
                abiertas = [d for d in dependencias(tareas.get(tid))
                            if not (estados.get(d) in ("commit", "hecho") or en_main(d, tareas.get(d), asuntos))]
                if abiertas:
                    quedan[tid] = "espera a %s, que todavía va a salir" % ", ".join(
                        "%s (%s)" % (d, estados.get(d) or "sin empezar") for d in abiertas)
    for tid in list(quedan):
        if tid in borrar:
            quedan.pop(tid)
    return borrar, quedan


def resumen(informe):
    if "borradas" in informe:
        partes = ["Borré %d que no se pueden reaplicar" % len(informe["borradas"])
                  + (" (%s)" % ", ".join(b["id"] for b in informe["borradas"][:8]) if informe["borradas"] else "")]
        if informe.get("quedan"):
            partes.append("%d se quedan porque sí se pueden reaplicar" % len(informe["quedan"]))
        if informe["integradas"]:
            partes.append("%d ya estaban en main" % len(informe["integradas"]))
        if informe.get("sustituidas"):
            partes.append("%d ya las hizo una sucesora" % len(informe["sustituidas"]))
        if informe["reabiertas"]:
            partes.append("%d vuelven a la cola" % len(informe["reabiertas"]))
        return " · ".join(partes)
    partes = ["%d bloqueadas recomprobadas" % informe.get("total", 0)]
    if informe["integradas"]:
        partes.append("%d ya estaban en main (%s)" % (len(informe["integradas"]), ", ".join(informe["integradas"][:6])))
    if informe.get("sustituidas"):
        partes.append("%d ya las hizo una sucesora" % len(informe["sustituidas"]))
    if informe["reabiertas"]:
        partes.append("%d vuelven a la cola (fallo del medio)" % len(informe["reabiertas"]))
    # (2026-10-08) Antes todas las que siguen salían como «por la propia tarea o porque Jev las ve
    # obsoletas», aunque fuesen 7 que solo esperaban su turno de 24 h: Alex las dio por perdidas.
    grupos = {}
    for s in informe["siguen"]:
        m = str(s.get("motivo", ""))
        clave = ("esperan su turno (se reabrieron hace menos de 24 h)" if m.startswith("ya se reabrió")
                 else "fallan por sí mismas" if m.startswith("falla la propia tarea")
                 else "Jev las ve obsoletas" if m.startswith("Jev")
                 else "su ola está cerrada" if m.startswith("su ola")
                 else "no son trabajo de código (las revisa la dirección)" if m.startswith("no declara archivos")
                 else "sin causa clara (las revisa una persona)")
        grupos[clave] = grupos.get(clave, 0) + 1
    for clave, n in grupos.items():
        partes.append("%d %s" % (n, clave))
    if informe.get("esperan"):
        partes.append("%d esperan a otra tarea que todavía va a salir (%s)" % (
            len(informe["esperan"]), "; ".join("%s: %s" % (e["id"], e["motivo"].replace("espera a ", "")
                                                          .replace(", que todavía va a salir", ""))
                                                for e in informe["esperan"][:4])))
    if informe.get("sin_salida"):
        partes.append("%d esperan a algo que ya no saldrá (%s): pulsa «Borrar las que no se pueden reaplicar»" % (
            len(informe["sin_salida"]), ", ".join(e["id"] for e in informe["sin_salida"][:6])))
    enj = informe.get("enjambre")
    if enj == "reiniciado":
        partes.append("el orquestador estaba parado: lo reinicié para que avance lo que esperan")
    elif enj == "despertado":
        partes.append("no había orquestador: desperté al vigilante para que avance lo que esperan")
    if informe.get("total", 0) == 0 and len(partes) == 1:
        partes = ["Ninguna bloqueada por fallo y nada esperando"]
    elif informe.get("total", 0) == 0:
        partes[0] = "Ninguna bloqueada por fallo"
    return " · ".join(partes)


def leer_pasos(ids):
    """{id: [pasos]} de `olas/pasos/<id>.jsonl` (los intentos de la Mac), tolerante a líneas rotas."""
    salida = {}
    for tid in ids:
        lista = []
        try:
            with open(os.path.join(OLAS, "pasos", "%s.jsonl" % tid), encoding="utf-8") as f:
                for linea in f:
                    try:
                        lista.append(json.loads(linea))
                    except ValueError:
                        continue
        except OSError:
            pass
        salida[tid] = lista
    return salida


def ids_de_colas_de_codigo(carpeta):
    """Ids que puede coger el orquestador de CÓDIGO (sin `cola-auto-*` ni `cola-suenos-*`)."""
    try:
        from vigilante_logica import es_cola_de_codigo
    except Exception:
        def es_cola_de_codigo(n):
            return n.startswith("cola-") and n.endswith(".json") and not n.startswith(("cola-auto-", "cola-suenos-"))
    ids = set()
    for ruta in glob.glob(os.path.join(carpeta, "cola-*.json")):
        if not es_cola_de_codigo(os.path.basename(ruta)):
            continue
        d = _leer(ruta, None)
        for t in (d if isinstance(d, list) else (d or {}).get("tareas") if isinstance(d, dict) else None) or []:
            if isinstance(t, dict) and t.get("id"):
                ids.add(str(t["id"]))
    return ids


def encolar_para_codigo(reabiertas, tareas, codigo, ahora):
    """(2026-10-08) Una reabierta que solo vive en la cola de SUEÑOS no la coge nadie: el vigilante
    no lee esas colas (`es_cola_de_codigo`). Genesis la contaba como «lista» y «Buscar más
    capacidad» decía «no cabe más» con 0 listas para la Mac. Se copia a una cola de código."""
    nuevas = [dict((k, v) for k, v in tareas[t].items() if k not in ("estado", "nota", "motivo"))
              for t in reabiertas if t not in codigo and t in tareas]
    if not nuevas:
        return None
    ruta = os.path.join(OLAS, "cola-recomprobadas-%s.json" % time.strftime("%m%d-%H%M", time.localtime(ahora)))
    actuales = _leer(ruta, [])
    vistos = {t.get("id") for t in actuales}
    _escribir(ruta, actuales + [t for t in nuevas if t.get("id") not in vistos])
    return ruta


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    simular = "--simular" in argv
    borrar = "--borrar" in argv
    ids = []
    if "--ids" in argv and argv.index("--ids") + 1 < len(argv):
        ids = [i for i in argv[argv.index("--ids") + 1].split(",") if i]
    ahora = time.time()
    progreso = _leer(PROGRESO, {})
    tareas = tareas_conocidas([OLAS, FUENTES])
    asuntos = subprocess.run(["git", "log", "main", "--format=%s"], cwd=RAIZ, capture_output=True,
                             text=True, timeout=60).stdout.splitlines()
    memoria = _leer(MEMORIA, {})
    try:
        import reconciliar_progreso
        fuentes = reconciliar_progreso.ids_de_colas_fuente(OLAS)
    except Exception:
        fuentes = None  # «no sé»: no se usa la regla de la ola cerrada
    correcciones, informe, memoria_nueva = recomprobar(
        progreso, tareas, asuntos, ahora, memoria,
        jev=lambda c, t: opinion_jev(c, t, asuntos), fuentes=fuentes,
        pasos=leer_pasos([k for k, v in progreso.items() if isinstance(v, dict) and v.get("estado") in ESTADOS_BLOQUEADOS]))
    if borrar:
        bloqueadas = [k for k, v in progreso.items() if isinstance(v, dict) and v.get("estado") in ESTADOS_BLOQUEADOS]
        if not ids:  # sin la lista del medidor: las bloqueadas y las que esperan a otra
            ids = [k for k in ids_de_colas_de_codigo(OLAS) if (progreso.get(k) or {}).get("estado") in (None, "pendiente")
                   and dependencias(tareas.get(k))]
        a_borrar, quedan = borrables(progreso, tareas, asuntos, informe, set(ids) | set(bloqueadas),
                                     definidas=ids_de_colas_de_codigo(OLAS))
        hora = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora))
        for tid, motivo in a_borrar.items():
            correcciones[tid] = {"estado": "rechazada", "t": hora,
                                 "nota": "borrada desde el medidor tras recomprobarla con los directores: %s; "
                                         "rama conservada si la había" % motivo}
        informe["borradas"] = [{"id": t, "motivo": m} for t, m in sorted(a_borrar.items())]
        informe["quedan"] = [{"id": t, "motivo": m} for t, m in sorted(quedan.items())]
    else:
        # (2026-10-08) Alex: «no funciona el recomprobar las bloqueadas». El panel enseñaba 5
        # que esperaban a otra tarea y esto contestaba «0 bloqueadas recomprobadas»: solo miraba
        # las bloqueadas por fallo. Ahora explica también las que esperan (a quién y si esa otra
        # todavía va a salir) y, si lo que esperan está listo y nadie lo trabaja, lo pone en
        # marcha en el acto (orquestador parado → se reinicia).
        if not ids:
            codigo = ids_de_colas_de_codigo(OLAS)
            ids = [k for k in codigo if (progreso.get(k) or {}).get("estado") in (None, "pendiente")
                   and dependencias(tareas.get(k))]
        sin_salida, esperan = borrables(progreso, tareas, asuntos, informe, set(ids),
                                        definidas=ids_de_colas_de_codigo(OLAS))
        informe["esperan"] = [{"id": t, "motivo": m} for t, m in sorted(esperan.items())
                              if t not in {s["id"] for s in informe["siguen"]}]
        informe["sin_salida"] = [{"id": t, "motivo": m} for t, m in sorted(sin_salida.items())
                                 if t not in {s["id"] for s in informe["siguen"]}]
        if informe["esperan"] and not simular:
            try:
                import atasco_orquestador
                cura = atasco_orquestador.curar(persiste_s=0, edad_min_s=120)
                informe["enjambre"] = cura.get("accion")
                if cura.get("accion") == "sin_orquestador":
                    import asignar_huecos
                    informe["enjambre"] = "despertado" if asignar_huecos.despertar_vigilante() else "sin_orquestador"
            except Exception as e:  # noqa: BLE001
                informe["enjambre"] = "no pude mirarlo (%s)" % type(e).__name__
    informe["resumen"] = resumen(informe)
    informe["t"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    informe["simulado"] = simular
    if not simular and correcciones:
        actuales = _leer(CORRECCIONES, {})
        actuales = actuales if isinstance(actuales, dict) else {}
        actuales.update(correcciones)
        _escribir(CORRECCIONES, actuales)
        _escribir(MEMORIA, memoria_nueva)
        cola = encolar_para_codigo(informe["reabiertas"], tareas, ids_de_colas_de_codigo(OLAS), ahora)
        if cola:
            informe["cola_nueva"] = os.path.basename(cola)
    if not simular:
        _escribir(INFORME, informe)
        try:
            import director_chat
            director_chat.publicar("Recomprobación de bloqueadas: %s." % informe["resumen"],
                                   de="director-bloqueadas", rol="director", tipo="informe")
        except Exception:
            pass
    if "--json" in argv:
        print(json.dumps(informe, ensure_ascii=False))
    else:
        print(informe["resumen"])
        for s in informe["siguen"]:
            print("  · %s: %s" % (s["id"], s["motivo"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
