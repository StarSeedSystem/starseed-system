# -*- coding: utf-8 -*-
"""Decisiones puras para repartir tareas entre medios del enjambre.

No toca procesos ni archivos. El orquestador conserva esas responsabilidades y usa
este módulo para decidir qué medio está sano, qué arriendos vencieron y quién debe
recibir cada tarea pendiente.
"""
import copy
import math


ESTADOS_UTILIZABLES = ("disponible", "ocupado")


def _entero_no_negativo(valor):
    try:
        return max(0, int(valor or 0))
    except (TypeError, ValueError):
        return 0


def _numero(valor):
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def area_de_tarea(tarea):
    """Devuelve un área estable para aprender qué medio resuelve mejor cada trabajo."""
    explicita = str(tarea.get("area") or tarea.get("área") or "").strip().lower()
    if explicita:
        return explicita
    rutas = [str(r).lower() for r in tarea.get("archivos") or []]
    pistas = (
        ("tests", ("test", "spec", "vitest", "pytest")),
        ("datos", ("supabase", "sql", "schema", "migration")),
        ("api", ("/api/", "route.ts", "server/")),
        ("interfaz", ("component", "page.tsx", "layout.tsx", ".css")),
        ("automatización", ("scripts/", ".py", ".sh")),
        ("documentación", (".md", "docs/")),
    )
    texto = " ".join(rutas + [str(tarea.get("titulo") or "").lower()])
    for area, claves in pistas:
        if any(clave in texto for clave in claves):
            return area
    return "general"


def estado_medio(medio, ahora, latido_max_s=90, avance_max_s=300):
    """Clasifica un medio sin confundir proceso vivo con escritura que progresa."""
    if not medio.get("activo", True):
        return "desconectado"
    try:
        edad_latido = ahora - float(medio.get("latido", 0))
    except (TypeError, ValueError):
        edad_latido = latido_max_s + 1
    if edad_latido > latido_max_s:
        return "desconectado"
    carga = _entero_no_negativo(medio.get("carga"))
    if carga:
        try:
            edad_avance = ahora - float(medio.get("avance", medio.get("latido", 0)))
        except (TypeError, ValueError):
            edad_avance = avance_max_s + 1
        if edad_avance > avance_max_s:
            return "colgado"
    capacidad = _entero_no_negativo(medio.get("capacidad"))
    return "ocupado" if carga >= capacidad else "disponible"


def normalizar_medios(medios, ahora, latido_max_s=90, avance_max_s=300):
    """Copia el registro y añade estado y capacidad libre calculados."""
    salida = {}
    for medio_id, original in (medios or {}).items():
        medio = copy.deepcopy(original)
        medio["id"] = str(medio.get("id") or medio_id)
        medio["estado"] = estado_medio(medio, ahora, latido_max_s, avance_max_s)
        capacidad = _entero_no_negativo(medio.get("capacidad"))
        carga = _entero_no_negativo(medio.get("carga"))
        medio["libres"] = max(0, capacidad - carga) if medio["estado"] in ESTADOS_UTILIZABLES else 0
        salida[medio_id] = medio
    return salida


def arriendo_vigente(arriendo, medios, ahora, latido_max_s=90, avance_max_s=300):
    """Un arriendo solo protege la tarea si no venció y su medio sigue sano."""
    if not isinstance(arriendo, dict):
        return False
    try:
        if float(arriendo.get("vence", 0)) <= ahora:
            return False
    except (TypeError, ValueError):
        return False
    medio = (medios or {}).get(arriendo.get("medio"))
    return bool(medio and estado_medio(medio, ahora, latido_max_s, avance_max_s) in ESTADOS_UTILIZABLES)


def vencer_arriendos(arriendos, medios, ahora, latido_max_s=90, avance_max_s=300):
    """Separa arriendos vigentes y vencidos, sin mutar los datos recibidos."""
    vigentes, vencidos = {}, []
    for tarea_id, arriendo in (arriendos or {}).items():
        if arriendo_vigente(arriendo, medios, ahora, latido_max_s, avance_max_s):
            vigentes[tarea_id] = copy.deepcopy(arriendo)
        else:
            vencidos.append(tarea_id)
    return vigentes, vencidos


def _estadistica(historial, medio_id, area):
    por_medio = (historial or {}).get(medio_id) or {}
    return por_medio.get(area) or por_medio.get("general") or {}


def puntuacion_medio(medio, tarea, historial=None):
    """Puntúa capacidad y experiencia; el éxito en el área pesa más que la velocidad."""
    area = area_de_tarea(tarea)
    areas = [str(a).lower() for a in medio.get("areas") or ["*"]]
    if "*" not in areas and area not in areas:
        return None
    estadistica = _estadistica(historial, medio.get("perfil") or medio.get("id"), area)
    exitos = _entero_no_negativo(estadistica.get("exitos"))
    fallos = _entero_no_negativo(estadistica.get("fallos"))
    total = exitos + fallos
    confianza = exitos / total if total else 0.5
    segundos = max(0.0, _numero(estadistica.get("segundos_promedio")))
    rapidez = 20.0 / (1.0 + segundos / 600.0) if segundos else 10.0
    experiencia = min(20.0, math.log2(total + 1) * 5.0)
    prioridad = _numero(medio.get("prioridad"))
    libres = _entero_no_negativo(medio.get("libres"))
    return round(confianza * 100.0 + rapidez + experiencia + prioridad + min(libres, 5), 6)


def ordenar_medios(tarea, medios, historial=None):
    """Devuelve solo medios sanos con hueco, mejor historial primero y desempate estable."""
    candidatos = []
    for medio_id, medio in (medios or {}).items():
        if medio.get("estado") != "disponible" or _entero_no_negativo(medio.get("libres")) <= 0:
            continue
        candidato = dict(medio)
        candidato["id"] = str(candidato.get("id") or medio_id)
        puntuacion = puntuacion_medio(candidato, tarea, historial)
        if puntuacion is not None:
            candidatos.append((puntuacion, candidato["id"]))
    candidatos.sort(key=lambda item: (-item[0], item[1]))
    return [medio_id for _, medio_id in candidatos]


def repartir(tareas, medios, arriendos=None, historial=None, ahora=0,
             duracion_arriendo_s=120, latido_max_s=90, avance_max_s=300):
    """Recalcula el reparto sin tocar tareas que aún tienen un arriendo sano.

    Devuelve las asignaciones nuevas, todos los arriendos vigentes y los identificadores
    recuperados. Una tarea recuperada conserva su `worktree`, que el ejecutor puede reusar.
    """
    sanos = normalizar_medios(medios, ahora, latido_max_s, avance_max_s)
    vigentes, vencidos = vencer_arriendos(
        arriendos, medios, ahora, latido_max_s, avance_max_s)
    ocupacion = {}
    for arriendo in vigentes.values():
        medio_id = arriendo.get("medio")
        ocupacion[medio_id] = ocupacion.get(medio_id, 0) + 1
    for medio_id, medio in sanos.items():
        capacidad = _entero_no_negativo(medio.get("capacidad"))
        carga_real = max(_entero_no_negativo(medio.get("carga")), ocupacion.get(medio_id, 0))
        medio["libres"] = max(0, capacidad - carga_real)
        medio["estado"] = "ocupado" if medio["libres"] == 0 and medio["estado"] in ESTADOS_UTILIZABLES else medio["estado"]
    asignaciones = []
    ya_arrendadas = set(vigentes)
    for tarea in tareas or []:
        tarea_id = str(tarea.get("id") or "").strip()
        if not tarea_id or tarea_id in ya_arrendadas:
            continue
        orden = ordenar_medios(tarea, sanos, historial)
        if not orden:
            continue
        medio_id = orden[0]
        arriendo = {
            "tarea": tarea_id,
            "medio": medio_id,
            "area": area_de_tarea(tarea),
            "desde": ahora,
            "renovado": ahora,
            "vence": ahora + duracion_arriendo_s,
            "worktree": str(tarea.get("worktree") or ""),
            "reanudar": tarea_id in vencidos or bool(tarea.get("reanudar")),
        }
        vigentes[tarea_id] = arriendo
        asignaciones.append(copy.deepcopy(arriendo))
        sanos[medio_id]["libres"] -= 1
        if sanos[medio_id]["libres"] <= 0:
            sanos[medio_id]["estado"] = "ocupado"
    return {"asignaciones": asignaciones, "arriendos": vigentes,
            "vencidos": vencidos, "medios": sanos}


def renovar_arriendo(arriendo, ahora, duracion_arriendo_s, worktree=""):
    """Renueva una copia del arriendo; nunca borra la ruta donde quedó lo escrito."""
    nuevo = copy.deepcopy(arriendo or {})
    nuevo["renovado"] = ahora
    nuevo["vence"] = ahora + duracion_arriendo_s
    if worktree:
        nuevo["worktree"] = worktree
    return nuevo


def registrar_resultado(historial, medio_id, area, exito, segundos):
    """Actualiza una copia del historial que luego guía el próximo reparto."""
    nuevo = copy.deepcopy(historial or {})
    areas = nuevo.setdefault(medio_id, {})
    dato = areas.setdefault(area or "general", {
        "exitos": 0, "fallos": 0, "segundos_promedio": 0.0,
    })
    clave = "exitos" if exito else "fallos"
    dato[clave] = _entero_no_negativo(dato.get(clave)) + 1
    muestras = _entero_no_negativo(dato.get("exitos")) + _entero_no_negativo(dato.get("fallos"))
    anterior = _numero(dato.get("segundos_promedio"))
    dato["segundos_promedio"] = round(
        (anterior * (muestras - 1) + max(0, _numero(segundos))) / muestras, 3)
    return nuevo


def tope_de_silencio(bytes_trabajo, colgado_s=300, orientacion_s=900, log_creciendo=False):
    """Cuántos segundos sin tocar el worktree se le consienten a un agente.

    POR QUÉ (2026-09-14, medido en el log de p324A). El vigilante mataba a cualquier agente
    que pasara 300 s sin cambiar un byte del worktree. Kimi K3 empezó a las 16:35:45, leyó
    CLAUDE.md, listó `src/lib/mando`, contó líneas de tres archivos y buscó sesenta y cinco
    coincidencias en centro-mando.tsx — y a las 16:41:02 lo cortaron. Cinco minutos y
    diecisiete segundos: exactamente el tope, por el delito de orientarse.

    Y orientarse es lo que le PEDIMOS: el propio prompt empieza con «lee AGENTS.md y
    memory/orquestacion-economica.md antes de tocar nada». Un modelo gratuito a 5-10 tok/s
    no hace eso en cinco minutos. De ahí la epidemia de `sin_cambios` de las olas 323 y 324:
    no es que los modelos no supieran programar, es que no llegaban a escribir.

    Un agente que YA escribió algo y lleva cinco minutos parado sí es sospechoso: ahí el tope
    corto sigue siendo el bueno. La diferencia está en si ha tocado el worktree alguna vez.

    LA SEGUNDA MITAD DEL MISMO ERROR (2026-09-16, medido en PS1 y PS7 de la ola 325). Después
    de escribir su archivo, un agente se pasa minutos corriendo `tsc`, leyendo lo que acaba de
    hacer y pensando el segundo archivo. Nada de eso cambia un byte del worktree, así que el
    reloj corto lo mataba otra vez: PS7 a los 341 s y PS1 a los 322 s, los dos con su archivo
    ya escrito y su registro creciendo. Los dos tuvieron que empezar de cero.

    `log_creciendo` es la señal que faltaba: si el REGISTRO del agente sigue creciendo, está
    vivo y hablando aunque no escriba. Entonces se le da el tope largo. Solo cuando no crece
    ni el worktree ni el registro está colgado de verdad. El tope largo sigue siendo un tope:
    un agente en bucle también habla, y a los quince minutos se corta igual.

    LA TERCERA MITAD (2026-09-16, medido en zD1 y zO2). Faltaba aplicar esa misma señal al
    caso de arriba: quien no había escrito nada se llevaba el tope largo SIEMPRE, incluso con
    el registro parado. Y eso es justo lo que hace un modelo gratuito que acepta la conexión
    y no emite un solo token: registro plano en el banner del modelo, cero bytes, quince
    minutos regalados. Con cinco modelos en la rotación son setenta y cinco minutos por
    tarea sin una línea escrita — el enjambre pareciendo ocupado sin estarlo. El registro
    del propio enjambre lo decía con todas las letras: «911 s sin crecer en bytes con
    kimi-k3 (tope 900 s, AÚN NO HABÍA ESCRITO NADA)».

    Orientarse deja rastro: cada lectura, cada listado, cada búsqueda escribe en el registro.
    Un registro plano no es un agente orientándose, es un modelo que no ha contestado. Así
    que la regla queda en una sola línea, y es la misma para todos: manda el registro.
    """
    _entero_no_negativo(bytes_trabajo)  # valida la entrada aunque ya no ramifique por ella
    return orientacion_s if log_creciendo else colgado_s



# ── (2026-09-20) La ficha de IDE de cada agente, para el Mando ────────────────
#: Cómo se abre el proceso de un agente en su IDE, cuando el IDE ofrece un enlace.
#: opencode no tiene enlace por sesión (se sigue por el log); Codex sí (`codex://threads/…`).
ENLACES_IDE = {
    "codex": "codex://threads/{sesion}",
    "hermes": "hermes chat -r {sesion}",
    "claude": "claude --resume {sesion}",
}


def partes_de_medio(medio_id):
    """`opencode:mac:mac:30929` → (motor, origen, entorno, pid). Lo que falte, vacío."""
    p = str(medio_id or "").split(":") + ["", "", "", ""]
    try:
        pid = int(p[3])
    except (TypeError, ValueError):
        pid = None
    return p[0], p[1], p[2], pid


def ficha_ide(tid, registro, medios_vivos, ahora, servidor="", sesion=None, ruta_log=""):
    """Lo que el Mando enseña de un agente: desde dónde trabaja, si está en línea, quién
    podría seguir su tarea si ese medio cae, y cómo ver su proceso en vivo.

    - `medioId` sale del ARRIENDO de la tarea (el medio que la tiene ahora mismo).
    - `enLinea`: el estado calculado por `normalizar_medios` es disponible/ocupado.
    - `alternativas`: los demás medios utilizables con hueco, primero los de otro servidor
      (si cae el servidor entero, los del mismo caen con él).
    - El traslado es automático: el arriendo caduca y otro medio vivo la toma.
    """
    arriendo = ((registro or {}).get("arriendos") or {}).get(tid) or {}
    medio_id = str(arriendo.get("medio") or "")
    motor, origen, entorno, pid = partes_de_medio(medio_id)
    propio = (medios_vivos or {}).get(medio_id) or {}
    en_linea = propio.get("estado") in ESTADOS_UTILIZABLES
    alternativas = []
    for mid, m in (medios_vivos or {}).items():
        if mid == medio_id or m.get("estado") not in ESTADOS_UTILIZABLES or int(m.get("libres") or 0) <= 0:
            continue
        o_motor, o_origen, _, _ = partes_de_medio(mid)
        alternativas.append({"id": mid, "motor": o_motor, "origen": o_origen, "libres": int(m.get("libres") or 0),
                             "otroServidor": o_origen != origen})
    alternativas.sort(key=lambda a: (not a["otroServidor"], a["motor"], a["id"]))
    enlace_ide = ENLACES_IDE.get(motor, "").format(sesion=sesion) if sesion else ""
    try:
        vence_en = int(float(arriendo.get("vence") or 0) - ahora) if arriendo.get("vence") else None
    except (TypeError, ValueError):
        vence_en = None
    return {
        "ide": {"motor": motor, "origen": origen, "entorno": entorno, "pid": pid, "servidor": servidor,
                "medioId": medio_id, "enLinea": bool(en_linea), "estado": propio.get("estado") or "desconocido",
                "venceEnS": vence_en, "worktree": arriendo.get("worktree") or ""},
        "alternativas": alternativas[:6],
        "proceso": {"log": ruta_log, "enVivo": "/api/mando/agente/%s/log" % tid, "sesion": sesion or "", "enlaceIde": enlace_ide},
    }
