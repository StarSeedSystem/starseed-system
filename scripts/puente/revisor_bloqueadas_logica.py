#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ninguna tarea se desperdicia: el criterio de TODOS los directores sobre cada tarea quieta.

Módulo PURO (sin disco, red ni procesos): recibe una foto del estado y devuelve, para cada
tarea que no avanza, UNA acción que la mueve, con su motivo. Quien aplica es
`revisor_bloqueadas.py`.

POR QUÉ (Alex, 2026-10-10): «hay demasiadas tareas bloqueadas en MetaGenesis; los directores en
vez de bloquear las tareas deben modificarlas, adaptarlas, reasignarlas o enlistarlas donde y
como correspondan». Medido ese día: 40 «bloqueadas» en Genesis que en realidad eran ESPERAS de
dos cadenas (35 de la Protomolécula detrás de cinco raíces), y esas raíces no avanzaban por
causas del MEDIO —un `index.lock` huérfano del reinicio de la Mac tumbó cuatro integraciones ya
revisadas, y tsc y los worktree no terminaban con la Mac sin memoria— que la escalera contaba
como fallos de la tarea. Nadie estaba «bloqueando» a propósito: cada pieza tenía su propia regla
para dejar algo quieto y ninguna para moverlo.

LA REGLA: un director NUNCA deja una tarea quieta. La transforma con la acción que corresponda:

  en_cadena        espera a otra que SÍ avanza: no se toca; se dice a quién espera y por dónde va.
  priorizar        las raíces que más desbloquean van primero (tramo de capacidad antes).
  trasladar        lista, pero en una cola que nadie corre: entra en la tanda viva.
  reintentar       el fallo fue del MEDIO (cerrojo, memoria, red, cupos): vuelve sin gastar intento.
  reintegrar       la rama ya tiene el trabajo revisado y solo falló el merge: vuelve a las puertas.
  relajar          espera a algo que no llegará o que no comparte archivos ni símbolos: se suelta.
  reescribir       falla por sí misma: vuelve con el contexto de hoy y el error exacto.
  reasignar        mismo fallo con el mismo escritor: otro modelo/proveedor (Codex si hay cupo).
  dividir          más de 3 archivos, o falla repetida con varios archivos: partes ≤ 3 archivos.
  fusionar         duplicada de otra viva (mismo título y archivos): se queda una (nunca una
                   sucesora con su predecesora: eso es una cadena, no un duplicado).
  ceder            quieta y su cadena ya sigue por una sucesora viva: se cierra (rama guardada).
  reabrir          la escalera la reabrió y la tanda viva no la recogió (o la apartó como
                   cerrada y volvió a pendiente): se le vuelve a pedir, sin gastar intento.
  ya_hecha         main ya lo tiene (su commit o el de una sucesora/hermana): se cierra.
  pedir_a_alex     SOLO si la decisión es suya (credenciales, migraciones, publicar) o tras
                   agotar las transformaciones: UNA pregunta con sus opciones.

Jev solo veta (p ≥ 0,8) las acciones que cierran o sueltan algo (ya_hecha, fusionar, relajar);
nunca convierte un «no» en «sí». Cada acción lleva su motivo, y el aprendizaje anota qué acción
sacó adelante cada clase de fallo para elegirla antes la próxima vez.
"""

from __future__ import annotations

import re
import time
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

# ── estados ──────────────────────────────────────────────────────────────────────────────
CUMPLIDOS = frozenset({"commit", "hecho", "hecha", "integrada"})
#: Cerradas sin código que esperar: no son trabajo pendiente ni desperdicio.
CERRADOS = CUMPLIDOS | frozenset({"informe", "sustituida", "reasignada", "descartada"})
#: Cerradas por una DECISIÓN con motivo (de la dirección o de Alex): no se reabren solas.
DECIDIDOS = frozenset({"rechazada"})
TRABAJANDO = frozenset({"en_curso"})
#: Las que esperan un visto bueno: las lleva el desatascador, no este revisor.
EN_APROBACION = frozenset({"esperando_aprobacion", "pendiente_aprobacion"})
QUIETOS = frozenset({
    "fallo", "fallo_tsc", "fallo_tests", "fallo_motor", "sin_cambios", "conflicto",
    "interrumpida", "bloqueante", "bloqueada",
})

#: Transformaciones por tarea (contando su cadena) antes de preguntar a Alex.
TOPE_TRANSFORMACIONES = 3
VENTANA_TOPE_S = 72 * 3600
#: Una misma tarea no se toca dos veces seguidas en menos de esto: hay que dejar que la acción
#: anterior surta efecto (una tanda tarda 10-40 min en escribir y pasar las puertas).
RESPIRO_S = 25 * 60
MAX_ARCHIVOS = 3
UMBRAL_JEV = 0.8

ACCIONES_CON_VETO = frozenset({"ya_hecha", "fusionar", "relajar", "ceder"})
#: Lo que mueve una tarea sin culparla: no cuenta para el tope que acaba preguntando a Alex.
#: (2026-10-10) Un fallo del medio (cupo agotado del reparador, dependencias sin instalar, una
#: reapertura que no llegó) no es un intento de la tarea; antes se contaba y la llevaba a Alex.
ACCIONES_DEL_MEDIO = frozenset({"en_cadena", "priorizar", "trasladar", "reintentar", "reabrir", "reintegrar"})
#: Si la escalera del director no recoge un fallo en este tiempo (no hay corrección para él), el
#: revisor no espera más: lo transforma él (XR1010Cb esperó 5 h con 19 tareas detrás porque la
#: escalera la daba por «con sucesora» —una XR1010Cc rechazada al instante— y el revisor, por
#: «primer fallo: lo lleva la escalera»).
ESPERA_ESCALERA_S = 30 * 60
#: Una corrección «pendiente» de la tanda viva que no se aplicó en este tiempo (la tarea sigue
#: quieta en disco) se vuelve a pedir desde aquí: red de seguridad del vigilante.
ESPERA_REAPERTURA_S = 20 * 60
#: Lo que dice un reparador sin cupo: la tarea no pudo arreglar sus errores porque su modelo no
#: contestó, no porque no supiera.
_SIN_CUPO = re.compile(
    r"tokens used|buy a subscription|insufficient|quota|cuota|rate.?limit|\b429\b|\b402\b|"
    r"payment required|credits? (exhausted|agotad)|no (credit|cr[eé]dito)|model not found|"
    r"modelo retirado|ProviderModelNotFound", re.I)
#: Errores de tsc que son del ENTORNO: un paquete declarado que no está instalado.
_MODULO_FALTA = re.compile(
    r"error TS(?:2307|2664|7016|2688)\b.*?(?:module|declaration file for module|type definition file for)"
    r" '((?!@/)[^'./][^']*)'", re.I)
_ERROR_TS = re.compile(r"^(.+?)\(\d+,\d+\): error TS\d+")

# ── clases de fallo ─────────────────────────────────────────────────────────────────────
#: (patrón, clase). El orden importa: lo primero que case manda. Las del MEDIO van antes
#: porque un texto de fallo de medio suele mencionar también «tsc» o «conflicto».
_CLASES: Tuple[Tuple[re.Pattern, str], ...] = (
    (re.compile(r"index\.lock|another git process|git process may have crashed", re.I), "medio:cerrojo"),
    (re.compile(r"no se pudo preparar worktree|worktree: ", re.I), "medio:worktree"),
    (re.compile(r"no termin[oó]|se pas[oó] de tiempo|timed? ?out|tiempo agotado", re.I), "medio:tiempo"),
    # (2026-10-20, AV1011G-d1) La puerta de Python sin pytest en ese python: falta algo en la MÁQUINA.
    # Antes la nota era «No module named pytest» y casaba con «pytest» → tarea:pruebas (gastaba intento).
    (re.compile(r"sin pytest instalado|no module named '?pytest|falta pytest", re.I), "medio:dependencias"),
    (re.compile(r"memoria|swap|guardia de memoria|killed|sigkill|oom", re.I), "medio:memoria"),
    (re.compile(r"red ca[ií]da|connection reset|network|getaddrinfo|ECONN", re.I), "medio:red"),
    (re.compile(r"\b429\b|\b402\b|sin cupo|cupo del d[ií]a|rate.?limit|ning[uú]n proveedor|"
                r"todos ca[ií]dos|esperando proveedor|model not found|no lleg[oó] a github", re.I),
     "medio:proveedor"),
    (re.compile(r"estancad|colgad|sin escribir", re.I), "medio:estancado"),
    (re.compile(r"ff fall[oó]|merge ff|no es fast-forward|not possible to fast-forward", re.I), "integracion"),
    (re.compile(r"revisi[oó]n (es )?bloqueante|bloqueo confirmado|objeci[oó]n", re.I), "tarea:revision"),
    (re.compile(r"ning[uú]n modelo toc[oó]|sin cambios|sin_cambios|no toc[oó] ning", re.I), "tarea:sin_cambios"),
    (re.compile(r"tsc", re.I), "tarea:tsc"),
    (re.compile(r"vitest|pruebas?|tests?\b|unittest|pytest", re.I), "tarea:pruebas"),
    (re.compile(r"alcance|faltan|fuera de alcance", re.I), "tarea:alcance"),
    (re.compile(r"escalada agotada|requiere una persona", re.I), "tarea:escalera"),
)

#: Lo que de verdad decide Alex: credenciales, migraciones o publicar.
_DE_ALEX = re.compile(
    r"credencial|contrase[nñ]a|\btoken\b|clave (de|del) |secreto|api[_ ]key|"
    r"aplicar (la )?migraci|\bRLS\b|publicar en producci|\bpush\b|facturaci|tarjeta",
    re.I,
)
_RUTAS_DE_ALEX = ("supabase/migrations/", ".env", "deploy/oracle/env")

#: Orden de preferencia (antes de aprender) de las acciones para cada clase de fallo de tarea.
PREFERENCIAS: Dict[str, Tuple[str, ...]] = {
    "tarea:tsc": ("reescribir", "reasignar", "dividir"),
    "tarea:pruebas": ("reescribir", "reasignar", "dividir"),
    "tarea:sin_cambios": ("reasignar", "reescribir", "dividir"),
    "tarea:revision": ("reescribir", "reasignar", "dividir"),
    "tarea:alcance": ("reescribir", "dividir", "reasignar"),
    "tarea:escalera": ("dividir", "reescribir", "reasignar"),
    "tarea:otro": ("reescribir", "reasignar", "dividir"),
}


def clase_de_fallo(texto: Any) -> str:
    """La clase del fallo a partir de su nota o del texto del evento. Nunca lanza."""
    s = str(texto or "")
    if not s.strip():
        return "tarea:otro"
    for patron, clase in _CLASES:
        if patron.search(s):
            return clase
    return "tarea:otro"


def es_del_medio(clase: str) -> bool:
    return str(clase or "").startswith("medio:")


def paquete_de(especificador: Any) -> str:
    """«@react-three/xr/x» → «@react-three/xr»; «three/examples/jsm/a» → «three»."""
    partes = str(especificador or "").split("/")
    if partes and partes[0].startswith("@") and len(partes) > 1:
        return "/".join(partes[:2])
    return partes[0] if partes else ""


def diagnostico_tsc(lineas: Sequence[str], declarados: Iterable[str] = (),
                    faltan: Iterable[str] = ()) -> Dict[str, Any]:
    """PURA. Lee el registro de una tarea (`olas/logs/<id>.log`) y separa su ÚLTIMO tsc en:

      entorno   errores de un paquete DECLARADO en package.json que no está instalado (el medio)
      propios   el resto (los de la tarea)
      reparador_sin_cupo   lo que contestó el modelo que debía reparar, si fue un «sin cupo»

    (2026-10-10, medido) Desde que la Ola 1010 declaró `qrcode` y los paquetes de XR sin que nadie
    los instalara en la Mac, CADA tarea tenía en su tsc «Cannot find module 'qrcode'» de un archivo
    de main; y el reparador de PM1010F0Bc contestó «Free 10M tokens used» y no arregló nada. Las
    dos cosas se contaban como fallo de la tarea («3 errores tsc»)."""
    lineas = [str(x) for x in (lineas or [])]
    inicio = None
    for i in range(len(lineas) - 1, -1, -1):
        if lineas[i].startswith("$ ") and "tsc" in lineas[i]:
            inicio = i
            break
    if inicio is None:
        return {"errores": [], "entorno": [], "propios": [], "reparador_sin_cupo": None}
    errores = []
    for l in lineas[inicio + 1:]:
        if l.startswith("$ "):
            break
        if "error TS" in l:
            errores.append(l.strip())
    declarados_s, faltan_s = set(declarados or ()), set(faltan or ())
    entorno, propios = [], []
    for e in dict.fromkeys(errores):
        m = _MODULO_FALTA.search(e)
        paquete = paquete_de(m.group(1)) if m else ""
        codigo = (re.search(r"error TS(\d+)", e) or [None, ""])[1]
        tipos = "@types/" + (paquete[1:].replace("/", "__") if paquete.startswith("@") else paquete)
        # Del entorno: el paquete (o sus tipos) falta HOY, o es un «no encuentro el módulo» de un
        # paquete declarado (faltaba cuando corrió; si ya se instaló, el reintento pasará).
        if paquete and (paquete in faltan_s or tipos in faltan_s
                        or (codigo in ("2307", "2664") and paquete in declarados_s)):
            entorno.append(e)
        else:
            propios.append(e)
    # El reparador: el último «$ opencode run|codex exec» ANTES de ese tsc.
    sin_cupo = None
    for j in range(inicio - 1, -1, -1):
        l = lineas[j]
        if l.startswith("$ ") and ("opencode run" in l or "codex exec" in l):
            bloque = " ".join(lineas[j + 1:inicio])
            m = _SIN_CUPO.search(bloque)
            if m:
                k = max(0, m.start() - 60)
                sin_cupo = re.sub(r"\x1b\[[0-9;]*m", "", bloque[k:m.end() + 60]).strip()[:200]
            break
        if l.startswith("$ ") and "tsc" in l:
            break
    return {"errores": errores, "entorno": entorno, "propios": propios, "reparador_sin_cupo": sin_cupo}


# ── cadenas ──────────────────────────────────────────────────────────────────────────────
def base_de_cadena(tid: Any) -> str:
    """«PRD1005Sc» → «PRD1005S» (la regla de `obtenerBaseId` de Genesis y de prioridad_logica)."""
    tid = str(tid or "")
    if len(tid) > 1 and tid[-1] in "bcdefghijklmnopqrstuvwxyz" and (tid[-2].isdigit() or tid[-2].isupper()):
        return tid[:-1]
    # (2026-10-10) La sucesora de un id que ya acaba en minúscula: «S1010-EV-ORACLE-1a» → «…-1ab».
    if (len(tid) > 2 and tid[-1] in "bcdefghijklmnopqrstuvwxyz" and tid[-2].islower()
            and (tid[-3].isdigit() or tid[-3].isupper())):
        return tid[:-1]
    return tid


def _norma(texto: Any) -> str:
    return re.sub(r"\W+", " ", str(texto or "")).strip().lower()


def es_sucesora(k: Any, tid: Any, tareas: Optional[Dict[str, Any]] = None) -> bool:
    """¿`k` rehace a `tid`? (X → Xb → Xc, «…-1a» → «…-1ab», X → X-d1).

    (2026-10-10, medido) Compartir base NO basta: «S1010-EV-ORACLE-1b» depende de «…-1a» y no
    la rehace. Cuenta si el id de `k` empieza por el de `tid` con un sufijo de reintento, o si
    comparten base Y dicen lo mismo (título o archivos). La misma regla que el vigilante."""
    k, tid = str(k or ""), str(tid or "")
    if not k or not tid or k <= tid:
        return False
    if k.startswith(tid):
        return bool(re.fullmatch(r"[a-z]{1,2}|-d\d+[a-z]?", k[len(tid):]))
    if base_de_cadena(k) != base_de_cadena(tid) or base_de_cadena(tid) == tid:
        return False
    tk = (tareas or {}).get(k) or {}
    tt = (tareas or {}).get(tid) or {}
    if _norma(tk.get("titulo")) and _norma(tk.get("titulo")) == _norma(tt.get("titulo")):
        return True
    fk, ft = sorted(_archivos(tk)), sorted(_archivos(tt))
    return bool(fk) and fk == ft


def _raiz_de_cadena(tid: str) -> str:
    """«PM1010F0A-d2» → «PM1010F0A»; «X» → «X»: las partes de una división cuentan como cadena."""
    tid = re.sub(r"-d\d+$", "", str(tid or ""))
    anterior = None
    while anterior != tid:
        anterior, tid = tid, base_de_cadena(tid)
    return tid


def _estado(progreso: Dict[str, Any], tid: str) -> str:
    e = progreso.get(tid) if isinstance(progreso, dict) else None
    return str((e or {}).get("estado") or "") if isinstance(e, dict) else ""


def id_en_asuntos(tid: str, asuntos: Iterable[str]) -> bool:
    """El id INTEGRADO en main («Ola 228 · V2: …», «345 · NE3-1: …»); una mención suelta no cuenta."""
    patron = re.compile(r"(?:^|·\s*)%s\s*:" % re.escape(str(tid)))
    return any(patron.search(a or "") for a in asuntos or ())


def _norma_titulo(t: Optional[Dict[str, Any]]) -> str:
    return re.sub(r"\W+", " ", str((t or {}).get("titulo") or "")).strip().lower()


def _archivos(t: Optional[Dict[str, Any]]) -> List[str]:
    a = (t or {}).get("archivos") or []
    if isinstance(a, str):
        a = [a]
    return [str(x).strip() for x in a if str(x).strip()]


def _deps(t: Optional[Dict[str, Any]]) -> List[str]:
    d = (t or {}).get("depende") or (t or {}).get("dependencias") or []
    if isinstance(d, str):
        d = [d]
    return [str(x) for x in d if str(x).strip()]


def sucesora(tid: str, progreso: Dict[str, Any], tareas: Dict[str, Any]) -> Tuple[Optional[str], str]:
    """(id, 'integrada'|'viva'|None) de la última sucesora de la cadena de `tid` (Xb, Xc, X-d1…).

    Integrada manda sobre viva: si cualquiera de la cadena está en main, la cadena está cumplida.
    (2026-10-10) Sucesora = `es_sucesora` (no basta compartir base: «…-1b» no rehace «…-1a»)."""
    candidatas = set(k for k in (progreso or {}) if k != tid) | set(k for k in (tareas or {}) if k != tid)
    viva = None
    for k in sorted(candidatas):
        if not es_sucesora(k, tid, tareas):
            continue
        est = _estado(progreso, k)
        if est in CUMPLIDOS:
            return k, "integrada"
        if est not in CERRADOS and est not in DECIDIDOS and (k in (tareas or {}) or est):
            viva = k
    return (viva, "viva") if viva else (None, None)


def estado_de_dependencia(dep: str, progreso: Dict[str, Any], tareas: Dict[str, Any],
                          asuntos: Sequence[str]) -> Tuple[str, str]:
    """('cumplida'|'viva'|'muerta'|'desconocida', por dónde va) de UNA dependencia, por su CADENA.

    «viva» incluye lo que falló y aún tiene arreglo (la retoman la escalera o este revisor):
    con la regla nueva nada muere solo. Muere lo rechazado por una decisión, lo sustituido sin
    sucesora y lo que no existe en ninguna cola ni en el progreso."""
    est = _estado(progreso, dep)
    if est in CUMPLIDOS or est == "informe" or id_en_asuntos(dep, asuntos):
        return "cumplida", "integrada en main"
    suc, como = sucesora(dep, progreso, tareas)
    if como == "integrada":
        return "cumplida", "la integró %s" % suc
    if como == "viva":
        return "viva", "la rehace %s (%s)" % (suc, _estado(progreso, suc) or "en cola")
    if est in TRABAJANDO:
        return "viva", "en curso"
    if est == "reasignada":
        return "viva", "reasignada a otro medio"
    if est in EN_APROBACION:
        return "viva", "esperando visto bueno"
    if est in QUIETOS:
        nota = str((progreso.get(dep) or {}).get("nota") or "")
        return "viva", "%s (%s): la retoma el revisor" % (est, clase_de_fallo(nota))
    reap = (progreso.get(dep) or {}).get("reapertura") if isinstance(progreso.get(dep), dict) else None
    if est == "pendiente" and isinstance(reap, dict):
        return "viva", "falló (%s) a las %s; la escalera la vuelve a poner en la tanda" % (
            reap.get("estado_disco") or "fallo", str(reap.get("t_disco") or "")[11:16] or "?")
    if est in ("", "pendiente"):
        if dep in (tareas or {}) or est == "pendiente":
            return "viva", "pendiente en cola"
        return "desconocida", "no está en ninguna cola ni en el progreso"
    if est in DECIDIDOS or est in CERRADOS:
        return "muerta", "%s sin sucesora" % est
    return "viva", est


def dependientes_transitivos(tareas: Dict[str, Dict[str, Any]]) -> Dict[str, Set[str]]:
    """{id: ids que dependen de él directa o indirectamente}, sobre TODAS las colas vivas."""
    hijos: Dict[str, Set[str]] = {}
    for tid, t in (tareas or {}).items():
        for d in _deps(t):
            hijos.setdefault(d, set()).add(tid)
    salida: Dict[str, Set[str]] = {}
    # También las dependencias que ya no están en ninguna cola (PM1010F0B, rehecha por PM1010F0Bc):
    # su sucesora hereda a quien la esperaba.
    for tid in set(tareas or {}) | set(hijos):
        vistos: Set[str] = set()
        pila = list(hijos.get(tid, ()))
        while pila:
            x = pila.pop()
            if x in vistos or x == tid:
                continue
            vistos.add(x)
            pila.extend(hijos.get(x, ()))
        salida[tid] = vistos
    return salida


def raiz_de_espera(tid: str, tareas: Dict[str, Any], progreso: Dict[str, Any], asuntos: Sequence[str],
                   _visto: Optional[Set[str]] = None) -> Optional[str]:
    """La tarea viva más profunda de la que depende `tid`: la que de verdad hay que mover."""
    _visto = _visto if _visto is not None else set()
    if tid in _visto:
        return None
    _visto.add(tid)
    for d in _deps(tareas.get(tid)):
        estado, _ = estado_de_dependencia(d, progreso, tareas, asuntos)
        if estado != "viva":
            continue
        suc, como = sucesora(d, progreso, tareas)
        objetivo = suc if como == "viva" else d
        mas_hondo = raiz_de_espera(objetivo, tareas, progreso, asuntos, _visto)
        return mas_hondo or objetivo
    return None


# ── memoria y aprendizaje ─────────────────────────────────────────────────────────────────
def _t_epoch(t: Any) -> float:
    if isinstance(t, (int, float)):
        return float(t)
    s = str(t or "")[:19].replace("T", " ")
    try:
        return time.mktime(time.strptime(s, "%Y-%m-%d %H:%M:%S"))
    except ValueError:
        return 0.0


def transformaciones_recientes(memoria: Dict[str, Any], tid: str, ahora: float) -> List[Dict[str, Any]]:
    """Las transformaciones de la CADENA de `tid` dentro de la ventana del tope."""
    raiz = _raiz_de_cadena(tid)
    hist = (memoria or {}).get("historial") or []
    return [h for h in hist if isinstance(h, dict) and _raiz_de_cadena(h.get("tid")) == raiz
            and h.get("accion") not in ACCIONES_DEL_MEDIO
            and ahora - _t_epoch(h.get("t")) < VENTANA_TOPE_S]


def tasa(aprendizaje: Dict[str, Any], clase: str, accion: str) -> float:
    """Tasa de acierto suavizada (Laplace) de `accion` para `clase`."""
    par = (aprendizaje or {}).get("%s|%s" % (clase, accion)) or [0, 0]
    try:
        ok, mal = int(par[0]), int(par[1])
    except (TypeError, ValueError, IndexError):
        ok, mal = 0, 0
    return (ok + 1.0) / (ok + mal + 2.0)


def elegir_accion(clase: str, candidatas: Sequence[str], aprendizaje: Dict[str, Any],
                  ya_probadas: Sequence[str] = ()) -> Optional[str]:
    """La acción con mejor tasa aprendida para la clase; empate → el orden de preferencia.
    Lo ya probado en esta ventana va al final: repetir lo mismo es el error que se quiere evitar."""
    if not candidatas:
        return None
    preferencia = {a: i for i, a in enumerate(candidatas)}
    probadas = set(ya_probadas or ())
    return sorted(
        candidatas,
        key=lambda a: (a in probadas, -round(tasa(aprendizaje, clase, a), 3), preferencia[a]),
    )[0]


def evaluar_historial(memoria: Dict[str, Any], progreso: Dict[str, Any], tareas: Dict[str, Any],
                      asuntos: Sequence[str], ahora: float) -> Tuple[Dict[str, Any], List[str]]:
    """Cierra las acciones pasadas cuyo resultado ya se sabe y lo suma al aprendizaje.

    Acierto: la tarea (o cualquiera de su cadena, partes incluidas) llegó a main. Fallo: volvió a
    quedarse quieta DESPUÉS de la acción. Devuelve (memoria nueva, frases de lo aprendido)."""
    memoria = dict(memoria or {})
    hist = [dict(h) for h in (memoria.get("historial") or []) if isinstance(h, dict)]
    apr = dict(memoria.get("aprendizaje") or {})
    frases: List[str] = []
    for h in hist:
        if h.get("resultado") or h.get("accion") in ("en_cadena", "priorizar"):
            continue
        tid = str(h.get("tid") or "")
        t_acc = _t_epoch(h.get("t"))
        raiz = _raiz_de_cadena(tid)
        integrada = any(
            _raiz_de_cadena(k) == raiz and (_estado(progreso, k) in CUMPLIDOS or id_en_asuntos(k, asuntos))
            for k in set(progreso or {}) | set(tareas or {}) | {tid}
        )
        e = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
        volvio = (_estado(progreso, tid) in QUIETOS - {"bloqueada"} and _t_epoch(e.get("t")) > t_acc + 60)
        if not integrada and not volvio:
            if ahora - t_acc > 7 * 24 * 3600:
                h["resultado"] = "sin_dato"
            continue
        clave = "%s|%s" % (h.get("clase") or "?", h.get("accion") or "?")
        par = list(apr.get(clave) or [0, 0])
        if integrada:
            par[0] = int(par[0]) + 1
            h["resultado"] = "acierto"
            frases.append("%s: «%s» funcionó para %s" % (tid, h.get("accion"), h.get("clase")))
        else:
            par[1] = int(par[1]) + 1
            h["resultado"] = "fallo"
        apr[clave] = par
    memoria["historial"] = hist[-400:]
    memoria["aprendizaje"] = apr
    return memoria, frases


# ── la decisión ─────────────────────────────────────────────────────────────────────────
def _accion(tid: str, accion: str, motivo: str, clase: str = "", **datos: Any) -> Dict[str, Any]:
    a = {"tid": tid, "accion": accion, "motivo": motivo, "clase": clase,
         "veto_jev": accion in ACCIONES_CON_VETO}
    if datos:
        a["datos"] = datos
    return a


def _es_de_alex(tarea: Optional[Dict[str, Any]], nota: str) -> Optional[str]:
    for a in _archivos(tarea):
        if any(a.startswith(r) or ("/" + r) in a for r in _RUTAS_DE_ALEX):
            return "toca %s: aplicarlo es decisión de Alex" % a
    m = _DE_ALEX.search(nota or "")
    if m:
        return "el fallo pide algo que solo decide Alex («%s»)" % m.group(0)
    return None


def partes_de(tarea: Dict[str, Any], motivo: str, max_archivos: int = MAX_ARCHIVOS) -> List[Dict[str, Any]]:
    """Divide una tarea en partes de ≤ max_archivos, encadenadas, con el mismo encargo acotado.

    Con ≤ max_archivos archivos (división por fallo repetido) va un archivo por parte."""
    archivos = _archivos(tarea)
    if len(archivos) < 2:
        return []
    tam = max_archivos if len(archivos) > max_archivos else 1
    grupos = [archivos[i:i + tam] for i in range(0, len(archivos), tam)]
    if len(grupos) < 2:
        return []
    tid = str(tarea.get("id"))
    n = len(grupos)
    partes = []
    for i, grupo in enumerate(grupos, 1):
        pid = "%s-d%d" % (tid, i)
        p = {k: v for k, v in tarea.items() if k not in ("id", "archivos", "depende", "dependencias", "prompt", "titulo")}
        p["id"] = pid
        p["titulo"] = "%s (parte %d de %d)" % (str(tarea.get("titulo") or tid)[:140], i, n)
        p["archivos"] = grupo
        p["depende"] = _deps(tarea) if i == 1 else ["%s-d%d" % (tid, i - 1)]
        p["prompt"] = (
            str(tarea.get("prompt") or "").rstrip()
            + "\n\n## PARTE %d DE %d (la dirección dividió %s: %s)\n"
            "En esta parte tocas SOLO: %s. Lo demás lo hace otra parte de la misma cadena: no lo "
            "toques ni lo adelantes. Si necesitas algo de una parte anterior, ya está en main."
            % (i, n, tid, motivo, ", ".join(grupo))
        ).lstrip()
        p["revisor"] = {"origen": tid, "accion": "dividir", "motivo": motivo}
        partes.append(p)
    return partes


def decidir(foto: Dict[str, Any]) -> Dict[str, Any]:
    """La decisión entera, sin tocar nada.

    `foto`:
      tareas:      {id: tarea} de las colas de código vivas (la primera definición gana)
      colas:       {nombre: [ids]}
      cola_viva:   nombre de la cola que corre el orquestador (o None)
      progreso:    progreso.json
      asuntos:     asuntos de `git log main`
      fallos:      {id: [{"t", "tipo", "texto"}…]} últimos eventos de fallo por tarea
      memoria:     estado del revisor (historial + aprendizaje + decisiones de Alex)
      ahora:       epoch
      codex_ok:    ¿Codex puede escribir? (peldaño capaz sin créditos)
      modelos_mejores: escritores con mejor mérito, para reasignar
      reabiertas_tras_cola: True si hubo reaperturas después de la última escritura de la cola viva

    Devuelve {acciones, cadenas, en_cadena, orden_cola, resumen, cuentas}.
    """
    tareas: Dict[str, Dict[str, Any]] = dict(foto.get("tareas") or {})
    progreso: Dict[str, Any] = dict(foto.get("progreso") or {})
    #: progreso.json tal cual (sin las correcciones del director encima): lo que de verdad tiene
    #: cada tarea mientras la corrección no se aplique.
    progreso_disco: Dict[str, Any] = dict(foto.get("progreso_disco") or progreso)
    diagnosticos: Dict[str, Dict[str, Any]] = dict(foto.get("diagnosticos") or {})
    corregidas: Set[str] = set(foto.get("corregidas") or ())
    deps_faltan: List[str] = list(foto.get("deps_faltan") or [])
    asuntos: List[str] = list(foto.get("asuntos") or [])
    fallos: Dict[str, List[Dict[str, Any]]] = dict(foto.get("fallos") or {})
    memoria: Dict[str, Any] = dict(foto.get("memoria") or {})
    ahora: float = float(foto.get("ahora") or time.time())
    colas: Dict[str, List[str]] = dict(foto.get("colas") or {})
    cola_viva: Optional[str] = foto.get("cola_viva")
    ids_viva = list(colas.get(cola_viva) or []) if cola_viva else []
    apr = memoria.get("aprendizaje") or {}
    decisiones_alex = memoria.get("decisiones_alex") or {}
    definiciones: Dict[str, Dict[str, Any]] = dict(foto.get("definiciones") or {})
    #: Ids que alguien va a correr si vuelven a «pendiente»: los de una cola FUENTE viva o los de la
    #: tanda viva. Lo que solo vive en una copia `cola-auto-*` vieja (o en el archivo) hay que
    #: ENLISTARLO en una cola de código, o el reconciliador lo cierra como huérfano.
    ejecutables: Set[str] = set(ids_viva)
    for nombre, ids in colas.items():
        if not str(nombre).startswith("cola-auto-"):
            ejecutables.update(ids)

    acciones: List[Dict[str, Any]] = []
    en_cadena: Dict[str, Dict[str, Any]] = {}
    tocadas: Set[str] = set()
    trans = dependientes_transitivos(tareas)

    def respira(tid: str) -> bool:
        """¿Se le tocó hace poco? Entonces se deja surtir efecto a la acción anterior."""
        for h in reversed(memoria.get("historial") or []):
            if isinstance(h, dict) and h.get("tid") == tid and h.get("accion") not in ("en_cadena", "priorizar"):
                return ahora - _t_epoch(h.get("t")) < RESPIRO_S
        return False

    # Universo: lo de las colas vivas + lo quieto del progreso reciente (3 días).
    universo = set(tareas)
    for tid, e in progreso.items():
        if isinstance(e, dict) and e.get("estado") in QUIETOS and ahora - _t_epoch(e.get("t")) < 3 * 24 * 3600:
            universo.add(tid)

    def enlistar(tid: str, datos: Dict[str, Any]) -> Dict[str, Any]:
        """Si `tid` no la va a correr nadie al reabrirla, la acción lleva su definición para
        meterla en la cola del revisor."""
        if tid not in ejecutables:
            definicion = tareas.get(tid) or definiciones.get(tid)
            if definicion:
                datos["enlistar"] = dict(definicion)
        return datos

    for tid in sorted(universo):
        t = tareas.get(tid) or definiciones.get(tid) or {"id": tid}
        est = _estado(progreso, tid)
        entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
        nota = str(entrada.get("nota") or "")
        if est in CERRADOS or est in DECIDIDOS or est in TRABAJANDO or est in EN_APROBACION:
            continue
        est_disco = _estado(progreso_disco, tid) or est

        # 0a) (2026-10-10) Quieta en disco y su cadena YA sigue por una sucesora viva (PM1010F0B y
        #     PM1010F0Bb con PM1010F0Bc en marcha): se cede a la sucesora. Si no, la escalera o este
        #     revisor la rehacían en paralelo a su sucesora, y su corrección vieja la resucitaba
        #     al morir la tanda.
        if est_disco in QUIETOS and not id_en_asuntos(tid, asuntos):
            suc, como = sucesora(tid, progreso, tareas)
            if como == "viva":
                acciones.append(_accion(tid, "ceder", "la cadena ya sigue por su sucesora %s (%s): esta copia "
                                        "se cierra con su rama guardada" % (suc, _estado(progreso, suc) or "en cola"),
                                        "sucesora", estado="sustituida", por=suc))
                tocadas.add(tid)
                continue

        # 0) ¿ya está en main, ella o su cadena?
        if est in QUIETOS or est in ("", "pendiente"):
            if id_en_asuntos(tid, asuntos):
                acciones.append(_accion(tid, "ya_hecha", "su commit de integración ya está en main", "hecha",
                                        estado="commit"))
                tocadas.add(tid)
                continue
            suc, como = sucesora(tid, progreso, tareas)
            if como == "integrada" and est in QUIETOS:
                acciones.append(_accion(tid, "ya_hecha", "la integró su sucesora %s" % suc, "hecha",
                                        estado="sustituida", por=suc))
                tocadas.add(tid)
                continue

        # 0b) duplicada de otra (mismo título y mismos archivos)
        if est in QUIETOS or est in ("", "pendiente"):
            titulo, archivos = _norma_titulo(t), sorted(_archivos(t))
            if titulo and archivos:
                gemela = None
                for k, otra in sorted(tareas.items()):
                    if k == tid or _raiz_de_cadena(k) == _raiz_de_cadena(tid):
                        continue
                    # (2026-10-10, medido) Una sucesora NO es una duplicada: el vigía creaba
                    # «S1010-EV-ORACLE-1ab» para rehacer «…-1a» y el revisor la fusionaba de vuelta
                    # en la fallida, siete veces seguidas, mientras su dependiente esperaba.
                    if es_sucesora(tid, k, tareas) or es_sucesora(k, tid, tareas) or tid.startswith(k) \
                            or k.startswith(tid):
                        continue
                    if _norma_titulo(otra) == titulo and sorted(_archivos(otra)) == archivos:
                        gemela = k
                        break
                if gemela:
                    e_g = _estado(progreso, gemela)
                    if e_g in CUMPLIDOS or id_en_asuntos(gemela, asuntos):
                        acciones.append(_accion(tid, "ya_hecha", "su gemela %s (mismo título y archivos) ya está en main"
                                                % gemela, "hecha", estado="sustituida", por=gemela))
                        tocadas.add(tid)
                        continue
                    if e_g not in CERRADOS and e_g not in DECIDIDOS and tid > gemela:
                        acciones.append(_accion(tid, "fusionar", "es la misma tarea que %s (mismo título y archivos): "
                                                "se queda %s" % (gemela, gemela), "duplicada",
                                                estado="sustituida", por=gemela))
                        tocadas.add(tid)
                        continue

        deps = _deps(t)
        # 1) ESPERA: no ha empezado y depende de algo
        if est in ("", "pendiente", "bloqueada") and deps:
            vivas, muertas = [], []
            for d in deps:
                e_d, por = estado_de_dependencia(d, progreso, tareas, asuntos)
                if e_d == "viva":
                    vivas.append((d, por))
                elif e_d in ("muerta", "desconocida"):
                    muertas.append((d, por))
            if muertas:
                quitar = [d for d, _ in muertas]
                acciones.append(_accion(
                    tid, "relajar",
                    "espera a %s, que no va a llegar (%s): se suelta la dependencia y se le avisa de que, si "
                    "necesita algo suyo, lo cree dentro de sus archivos" % (
                        ", ".join(quitar), "; ".join(p for _, p in muertas)),
                    "dependencia_muerta", quitar=quitar))
                tocadas.add(tid)
                continue
            if vivas:
                raiz = raiz_de_espera(tid, tareas, progreso, asuntos) or vivas[0][0]
                _, por_raiz = estado_de_dependencia(raiz, progreso, tareas, asuntos)
                if (_estado(progreso, raiz) in ("", "pendiente") and raiz in tareas
                        and not (progreso.get(raiz) or {}).get("reapertura")):
                    por_raiz = "pendiente en cola" + (" (en la tanda viva)" if raiz in ids_viva else "")
                en_cadena[tid] = {
                    "espera_a": [d for d, _ in vivas],
                    "va_por": "; ".join("%s: %s" % (d, p) for d, p in vivas),
                    "raiz": raiz,
                    "raiz_va_por": por_raiz,
                }
                continue
            # todas cumplidas → cae a «lista»

        # 2) LISTA: todas sus dependencias en main. Si estaba marcada «bloqueada», o vive en una
        #    cola que nadie corre, se enlista en la tanda viva.
        deps_ok = all(estado_de_dependencia(d, progreso, tareas, asuntos)[0] == "cumplida" for d in deps)
        if est == "bloqueada" and deps and deps_ok:
            acciones.append(_accion(tid, "trasladar", "sus dependencias ya están en main: vuelve a la cola%s"
                                    % (" (tanda viva %s)" % cola_viva if cola_viva else ""), "lista",
                                    estado="pendiente", cola=cola_viva))
            tocadas.add(tid)
            continue
        if est in ("", "pendiente"):
            if cola_viva and tid not in ids_viva and tid in tareas and deps_ok:
                acciones.append(_accion(tid, "trasladar", "lista y en una cola que nadie corre: entra en la tanda viva "
                                        "(%s)" % cola_viva, "lista", cola=cola_viva))
                tocadas.add(tid)
                continue
            # (2026-10-10) La escalera la reabrió, pero la tanda viva no lo recogió: sigue quieta en
            # disco (PM1010F0Bc 5 h con 28 tareas detrás). Red de seguridad del vigilante.
            reap = entrada.get("reapertura") if isinstance(entrada.get("reapertura"), dict) else None
            if (reap and tid in ids_viva and deps_ok and not respira(tid)
                    and ahora - _t_epoch(reap.get("t_disco")) > ESPERA_REAPERTURA_S):
                acciones.append(_accion(
                    tid, "reabrir",
                    "falló (%s) a las %s, la escalera la reabrió y la tanda viva no la recogió: se le vuelve a "
                    "pedir" % (reap.get("estado_disco"), str(reap.get("t_disco") or "")[11:16]),
                    "medio:reapertura", **enlistar(tid, {"estado": "pendiente", "no_cuenta": True})))
                tocadas.add(tid)
                continue
            # La tanda la dejó de lado al verla cerrada en disco («no la repito») y luego alguien la
            # devolvió a pendiente: en la memoria del orquestador sigue cerrada. Se le pide.
            t_soltada = float((foto.get("soltadas") or {}).get(tid) or 0)
            if (t_soltada and tid in ids_viva and deps_ok and not respira(tid)
                    and _t_epoch(entrada.get("t")) > t_soltada):
                acciones.append(_accion(
                    tid, "reabrir",
                    "la tanda viva la apartó como cerrada a las %s y ahora vuelve a estar pendiente: se le pide "
                    "que la coja" % time.strftime("%H:%M", time.localtime(t_soltada)),
                    "medio:reapertura", **enlistar(tid, {"estado": "pendiente", "no_cuenta": True})))
                tocadas.add(tid)
            continue
        if est not in QUIETOS:
            continue

        # 3) QUIETA por un fallo: se transforma
        if respira(tid):
            continue
        ultimos = fallos.get(tid) or []
        texto = nota if nota.strip() else (ultimos[-1].get("texto") if ultimos else "")
        # La escalera reescribe la nota («director: reintento gratuito 1/8»): la causa real está en
        # el último evento de fallo.
        if nota.startswith("director:") and ultimos:
            texto = str(ultimos[-1].get("texto") or nota)
        clase = clase_de_fallo(texto)
        if est == "bloqueante" and clase == "tarea:otro":
            clase = "tarea:escalera"
        # (2026-10-10) El registro de la tarea dice qué falló de verdad en su último tsc.
        diag = diagnosticos.get(tid) or {}
        errores_propios = list(diag.get("propios") or [])
        if est == "fallo_tsc" and diag.get("errores"):
            if diag.get("entorno") and not errores_propios:
                clase = "medio:dependencias"
                if deps_faltan:
                    # Se están instalando (o hay que instalarlas): reintentar antes fallaría igual.
                    continue
            elif diag.get("reparador_sin_cupo"):
                clase = "medio:proveedor"
            if errores_propios:
                texto = "%s · errores de la tarea: %s" % (texto, " | ".join(errores_propios[:8]))
            if diag.get("reparador_sin_cupo"):
                texto = "%s · el reparador no contestó: %s" % (texto, diag["reparador_sin_cupo"])
        previas = transformaciones_recientes(memoria, tid, ahora)

        de_alex = _es_de_alex(t, texto)
        decision_previa = decisiones_alex.get(_raiz_de_cadena(tid))
        if de_alex and not decision_previa:
            acciones.append(_accion(tid, "pedir_a_alex", de_alex, clase,
                                    pregunta="%s: %s. ¿La rehago con otro enfoque o la descarto?" % (tid, de_alex),
                                    opciones=["rehacer", "descartar"]))
            tocadas.add(tid)
            continue
        if len(previas) >= TOPE_TRANSFORMACIONES and not decision_previa:
            hechas = ", ".join(sorted({str(h.get("accion")) for h in previas}))
            acciones.append(_accion(
                tid, "pedir_a_alex",
                "%d transformaciones en 72 h (%s) sin llegar a main; la última causa: %s" % (
                    len(previas), hechas, clase),
                clase,
                pregunta="%s lleva %d intentos transformados (%s) y sigue sin salir. ¿La rehago con otro "
                         "enfoque (Codex/división) o la descarto con su rama guardada?" % (tid, len(previas), hechas),
                opciones=["rehacer", "descartar"]))
            tocadas.add(tid)
            continue

        if tid not in ejecutables and not (tareas.get(tid) or definiciones.get(tid)):
            if not decision_previa:
                acciones.append(_accion(
                    tid, "pedir_a_alex",
                    "está quieta (%s) y no encuentro su definición en ninguna cola: no la puede coger nadie" % est,
                    clase,
                    pregunta="%s no está en ninguna cola (ni en el archivo). ¿La rehago desde su rama o la "
                             "descarto con la rama guardada?" % tid,
                    opciones=["rehacer", "descartar"]))
                tocadas.add(tid)
            continue
        if es_del_medio(clase):
            datos: Dict[str, Any] = enlistar(tid, {"estado": "pendiente", "no_cuenta": True})
            if errores_propios:
                # El medio falló, pero la tarea también tiene errores suyos: el próximo escritor
                # los recibe exactos (el reparador sin cupo no llegó a verlos).
                datos["mensaje"] = _mensaje_contexto(tid, clase, texto, foto)
            acciones.append(_accion(
                tid, "reintentar",
                "el fallo fue del medio (%s), no de la tarea: vuelve a la cola sin gastar un intento" % clase,
                clase, **datos))
            tocadas.add(tid)
            continue
        if clase == "integracion" or (est == "conflicto" and entrada.get("rama")):
            acciones.append(_accion(
                tid, "reintegrar",
                "su rama %s ya tiene el trabajo y solo falló la integración: vuelve directa a las puertas"
                % (entrada.get("rama") or "ola/" + tid),
                clase or "integracion", **enlistar(tid, {"estado": "pendiente", "no_cuenta": True})))
            tocadas.add(tid)
            continue

        # Fallo de la PROPIA tarea. El primero lo retoma la escalera del director; a partir del
        # segundo (o si la escalera se rindió) se transforma: repetir lo mismo falla igual.
        n_fallos = sum(1 for f in ultimos if clase_de_fallo(f.get("texto")) == clase) or 1
        # (2026-10-10) …salvo que la escalera NO la esté llevando: sin corrección suya y quieta más de
        # media hora, nadie la va a mover si este revisor espera (XR1010Cb, 5 h y 19 detrás).
        abandonada = tid not in corregidas and ahora - _t_epoch(entrada.get("t")) > ESPERA_ESCALERA_S
        if (est != "bloqueante" and n_fallos < 2 and int(entrada.get("intentos_auto") or 0) < 2
                and not abandonada):
            continue
        candidatas = list(PREFERENCIAS.get(clase, PREFERENCIAS["tarea:otro"]))
        if len(_archivos(t)) > MAX_ARCHIVOS:
            candidatas = ["dividir"] + [c for c in candidatas if c != "dividir"]
        if len(_archivos(t)) < 2:
            candidatas = [c for c in candidatas if c != "dividir"]
        if not foto.get("codex_ok") and not foto.get("modelos_mejores"):
            candidatas = [c for c in candidatas if c != "reasignar"] or candidatas
        elegida = elegir_accion(clase, candidatas, apr, [str(h.get("accion")) for h in previas])
        if elegida == "dividir":
            partes = partes_de(t, "falla por sí misma (%s)" % clase)
            if partes:
                acciones.append(_accion(tid, "dividir", "%s con %d archivos: se divide en %d partes encadenadas"
                                        % (clase, len(_archivos(t)), len(partes)), clase,
                                        partes=[p["id"] for p in partes], tareas_nuevas=partes))
                tocadas.add(tid)
                continue
            elegida = "reescribir"
        if elegida == "reasignar":
            modelo = "codex/gpt-5.6-sol" if foto.get("codex_ok") else (list(foto.get("modelos_mejores") or []) or [None])[0]
            previo = str(entrada.get("modelo") or "")
            if modelo and modelo != previo:
                acciones.append(_accion(tid, "reasignar", "%s con %s: lo intenta otro escritor (%s)"
                                        % (clase, previo or "el escritor anterior", modelo), clase,
                                        **enlistar(tid, {"estado": "pendiente", "modelo_siguiente": modelo,
                                                         "mensaje": _mensaje_contexto(tid, clase, texto, foto)})))
                tocadas.add(tid)
                continue
            elegida = "reescribir"
        acciones.append(_accion(tid, "reescribir", "%s: vuelve con el contexto de hoy y el error exacto" % clase,
                                clase, **enlistar(tid, {"estado": "pendiente",
                                                        "mensaje": _mensaje_contexto(tid, clase, texto, foto)})))
        tocadas.add(tid)

    # 4) ORDEN de la tanda viva: las raíces que más desbloquean, primero. Las que se acaban de
    #    trasladar cuentan ya como de la tanda (si no, quedaban delante de las raíces sin orden).
    orden_cola = None
    trasladadas = [a["tid"] for a in acciones if a["accion"] == "trasladar" and a["tid"] not in ids_viva]
    ids_viva = ids_viva + [t for t in trasladadas if t not in ids_viva]
    if cola_viva and ids_viva:
        trans = heredar_dependientes(trans, ids_viva, tareas, progreso)
        orden_cola = orden_ideal(ids_viva, tareas, progreso, trans)
        pendientes_actual = [i for i in ids_viva if _estado(progreso, i) in ("", "pendiente")]
        pendientes_ideal = [i for i in orden_cola if _estado(progreso, i) in ("", "pendiente")]
        if pendientes_actual == pendientes_ideal and not foto.get("reabiertas_tras_cola") and not trasladadas:
            orden_cola = None
        elif orden_cola:
            primeras = [i for i in pendientes_ideal[:3]]
            acciones.append(_accion(
                "", "priorizar",
                "la tanda viva coge primero lo que más desbloquea: %s" % ", ".join(
                    "%s (+%d)" % (i, len(trans.get(i, ()))) for i in primeras),
                "orden", orden=pendientes_ideal))

    cadenas = agrupar_cadenas(en_cadena, tareas, progreso)
    cuentas = {
        "en_cadena": len(en_cadena),
        "transformadas": sum(1 for a in acciones if a["accion"] not in ("priorizar", "pedir_a_alex")),
        "necesitan_alex": sum(1 for a in acciones if a["accion"] == "pedir_a_alex"),
    }
    return {
        "acciones": acciones,
        "en_cadena": en_cadena,
        "cadenas": cadenas,
        "orden_cola": orden_cola,
        "cuentas": cuentas,
        "resumen": resumen(cuentas, cadenas),
    }


def heredar_dependientes(trans: Dict[str, Set[str]], ids: Sequence[str], tareas: Dict[str, Any],
                         progreso: Dict[str, Any]) -> Dict[str, Set[str]]:
    """Una sucesora hereda a quien esperaba a su predecesora (para ordenar la tanda).

    (2026-10-10, medido) Las 28 tareas de la Protomolécula dependen de «PM1010F0B», no de su
    sucesora «PM1010F0Bc»: el orden la contaba «+0» y la ponía detrás de hojas sueltas."""
    salida = dict(trans or {})
    por_base: Dict[str, List[str]] = {}
    for k in set(tareas or {}) | set(progreso or {}):
        por_base.setdefault(base_de_cadena(k), []).append(k)
    for i in ids or ():
        posibles = {i[:-1], i[:-2], re.sub(r"-d\d+[a-z]?$", "", i)} | set(por_base.get(base_de_cadena(i), ()))
        heredados: Set[str] = set(salida.get(i, ()))
        for p in posibles:
            if p and p != i and es_sucesora(i, p, tareas):
                heredados |= set((trans or {}).get(p, ()))
        heredados.discard(i)
        salida[i] = heredados
    return salida


def _mensaje_contexto(tid: str, clase: str, texto: str, foto: Dict[str, Any]) -> str:
    """El mensaje del director que el agente lee antes de escribir (canal `mensajes/`)."""
    head = str(foto.get("head") or "")[:10]
    return (
        "REVISOR DE BLOQUEADAS (%s): este intento NO es repetir el anterior.\n"
        "- Lo que falló: %s — %s\n"
        "- main va por %s: parte de main tal como está HOY; si algo que esperabas no existe, créalo "
        "dentro de tus archivos o adáptate a lo que hay.\n"
        "- Corrige exactamente eso, con una prueba que lo demuestre; no reescribas lo que ya funciona "
        "ni salgas de tus archivos."
        % (time.strftime("%Y-%m-%d %H:%M", time.localtime(float(foto.get("ahora") or time.time()))),
           clase, str(texto or "sin texto")[:700], head or "su último commit")
    )


def orden_ideal(ids: Sequence[str], tareas: Dict[str, Any], progreso: Dict[str, Any],
                trans: Dict[str, Set[str]]) -> List[str]:
    """Orden de la cola viva: lo empezado/cerrado queda donde está (el orquestador lo lleva en
    memoria) y lo pendiente va por: pedida por Alex › tramo de capacidad › reparación de la nube ›
    cuántas desbloquea › orden original."""
    try:
        import prioridad_logica as _pl  # el tramo de capacidad es SU regla: no se duplica
        es_cap = _pl.es_de_capacidad
        por_alex = _pl.pedida_por_alex
        rep_nube = _pl.es_reparacion_nube
    except Exception:  # pragma: no cover - sin el módulo, sin tramo
        def es_cap(_t):
            return False

        def por_alex(e):
            return bool((e or {}).get("adelantar"))

        def rep_nube(_e):
            return False
    pos = {tid: i for i, tid in enumerate(ids)}
    fijas = [i for i in ids if _estado(progreso, i) not in ("", "pendiente")]
    libres = [i for i in ids if _estado(progreso, i) in ("", "pendiente")]

    def clave(i: str):
        e = progreso.get(i) if isinstance(progreso.get(i), dict) else {}
        # (2026-10-21) Igual que prioridad_logica.ordenar: la orden de Alex (texto con la hora)
        # › capacidad › reparación de la nube (`adelantar: True`) › lo que desbloquea.
        return (
            0 if por_alex(e) else 1,
            0 if es_cap(tareas.get(i) or {}) else 1,
            0 if rep_nube(e) else 1,
            -len(trans.get(i, ())),
            pos[i],
        )

    return fijas + sorted(libres, key=clave)


def agrupar_cadenas(en_cadena: Dict[str, Dict[str, Any]], tareas: Dict[str, Any],
                    progreso: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Las esperas agrupadas por su raíz: «N esperan a X, que va por Y»."""
    grupos: Dict[str, Dict[str, Any]] = {}
    for tid, info in en_cadena.items():
        raiz = str(info.get("raiz") or "")
        g = grupos.setdefault(raiz, {
            "raiz": raiz,
            "titulo_raiz": str((tareas.get(raiz) or {}).get("titulo") or raiz),
            "va_por": info.get("raiz_va_por") or "",
            "esperan": [],
        })
        g["esperan"].append(tid)
    salida = sorted(grupos.values(), key=lambda g: (-len(g["esperan"]), g["raiz"]))
    for g in salida:
        g["esperan"] = sorted(g["esperan"])
        g["n"] = len(g["esperan"])
    return salida


def resumen(cuentas: Dict[str, int], cadenas: List[Dict[str, Any]]) -> str:
    partes = []
    if cuentas.get("en_cadena"):
        partes.append("%d en cadena (esperan a %d raíz/raíces que avanzan)" % (cuentas["en_cadena"], len(cadenas)))
    if cuentas.get("transformadas"):
        partes.append("%d transformada(s) en esta pasada" % cuentas["transformadas"])
    if cuentas.get("necesitan_alex"):
        partes.append("%d necesita(n) una decisión de Alex" % cuentas["necesitan_alex"])
    return " · ".join(partes) or "ninguna tarea quieta: todo avanza o está hecho"
