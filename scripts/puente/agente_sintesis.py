#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente de síntesis diaria de producción audiovisual (SDP1111D).

Máquina de tres fases por día (recolectar→redactar→entregar) guardada en
starseed_memory_root/produccion-audiovisual/estado.json. Horas en
America/Mexico_City (00:30, 06:30, 07:54). Encola con encargar_por_flota en
olas/cola-suenos-sintesis.json, nunca lanza orquestador. Puntúa con
decidir.consultar('puntuar') y entrega con sintesis_telegram.enviar: primero
resumen 1500-3000 caracteres y luego síntesis completa. Guarda markdown en
starseed_memory_root/produccion-audiovisual/sintesis/AAAA-MM-DD.md con escritura
atómica. Una sola entrega al día. Cerrojo en ~/.starseed/cerrojos/.
CLI plan|ciclo|estado [--seco --json].

PET1112D (2026-11-12): la cola `cola-suenos-sintesis.json` no la escaneaba nadie — el
encargo va ahora por la vía de la flota que SÍ funciona (`encargar_por_flota` con
«tanda_viva» al orquestador vivo, como agente_referencias_diseno), los prompts de las
tareas salen dentro del tope de la flota (16000 del analista libre) y, si a las 07:54 no
hay texto, la flota gratuita redacta la síntesis en UN paso, se guarda, se sube a Drive
(carpeta «Síntesis diarias», alias alex-docs) y se envía: un día nunca queda sin síntesis.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import sintesis_fuentes as SF
import sintesis_tareas as ST
import sintesis_telegram as SG
import suenos as S
import alcance_recomendaciones as AR
import agente_alcance as AA

def _navegador_estado(raiz: str) -> dict:
    """Estado del navegador propio: sesiones vivas y última comprobación."""
    ruta_estado = os.path.expanduser("~/.starseed/navegador/estado.json")
    try:
        with open(ruta_estado, encoding="utf-8") as f:
            datos = json.load(f)
        sesiones = datos.get("sesiones", {})
        vivas = [nombre for nombre, datos in sesiones.items() if datos.get("estado") == "viva"]
        return {"ok": True, "vivas": vivas, "total": len(sesiones), "detalle": sesiones}
    except (OSError, ValueError):
        return {"ok": False, "vivas": [], "total": 0, "detalle": {}, "motivo": "sin_estado"}

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
AGENTE = "sintesis-produccion"
REL_ESTADO = "starseed_memory_root/produccion-audiovisual/estado.json"
REL_OLAS = "starseed_memory_root/olas"
NOMBRE_COLA = "cola-suenos-sintesis.json"
REL_SINTESIS = "starseed_memory_root/produccion-audiovisual/sintesis"
CERROJO_DIR = os.path.expanduser("~/.starseed/cerrojos")
HORAS_RECOLECTAR = 0.5  # 00:30
HORAS_REDACTAR = 6.5    # 06:30
HORAS_ENTREGAR = 7.9    # 07:54
RESUMEN_MIN, RESUMEN_MAX = 1500, 3000
ZONA = "America/Mexico_City"
CADA_HORAS = 0.25  # el director llama cada 15 min
DIAS_COLA = 7  # lo propio de más días sale de la cola (lo caducado se re-encarga)
TOPE_PROMPT = 14000  # el analista libre de la flota topea el prompt en 16000 (analista.MAX_PROMPT_LIBRE)
TOPE_PREVIA = 4000   # texto a tope de cada síntesis previa dentro del contexto
TOPE_INFORME = 1500  # texto a tope de cada informe nuevo
TOPE_RESUMEN = 4000  # el resumen de actividad, si es dict grande, sale a tope
TOPE_SALIDA = 2500   # cada salida de análisis del día dentro del encargo de respaldo
CARPETA_DOC = "1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI"  # «Síntesis diarias» de Drive (alex-docs)

# ALC1113G: secciones nuevas para la síntesis
SECCIONES_RESPALDO = ("Portada y rotación", "Noticias con fuente y fecha", "Actividad de Alex",
                      "Referencias de diseño", "Ideas de vídeo y redes", "Guiones y storyboard",
                      "YouTube", "Mañana (la rotación del día siguiente)",
                      "GitHub y comunidad técnica", "Alcance: contactos y mensajes para aprobar",
                      "Promoción y canales")
CIFRAS_RESPALDO = (3000, 9000)

FECHA_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")


def _como_fecha(ahora=None):
    if ahora is None:
        return datetime.now(timezone.utc)
    if isinstance(ahora, datetime):
        return ahora.replace(tzinfo=timezone.utc) if ahora.tzinfo is None else ahora.astimezone(timezone.utc)
    if isinstance(ahora, (int, float)):
        return datetime.fromtimestamp(float(ahora), timezone.utc)
    try:
        d = datetime.fromisoformat(str(ahora).replace("Z", "+00:00"))
        return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def _iso(ahora):
    return _como_fecha(ahora).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fecha_cdmx(ahora):
    """Fecha en zona horaria de Ciudad de México."""
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(ZONA)
        return _como_fecha(ahora).astimezone(tz).date().isoformat()
    except Exception:
        return _como_fecha(ahora).date().isoformat()


def _hora_cdmx(ahora):
    """Hora decimal en zona horaria de Ciudad de México."""
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(ZONA)
        dt = _como_fecha(ahora).astimezone(tz)
        return dt.hour + dt.minute / 60.0
    except Exception:
        dt = _como_fecha(ahora)
        return dt.hour + dt.minute / 60.0


def _dentro(iso, ahora, horas=0):
    if not iso:
        return False
    try:
        t = _como_fecha(datetime.fromisoformat(str(iso).replace("Z", "+00:00")))
    except ValueError:
        return False
    return abs((_como_fecha(ahora) - t).total_seconds()) < timedelta(hours=horas).total_seconds()


def estado_vacio():
    return {"version": 1, "fecha": None, "fase": "recolectar", "ultimo_ciclo": None, "ciclos": 0,
            "entregada": False, "tareas_encoladas": {}, "sintesis_path": None, "puntuacion": None,
            "respaldo": False}


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = f"{ruta}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, ruta)


def _escribir_texto(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = f"{ruta}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(tmp, ruta)


def _cerrojo(ruta=None, espera_s=60):
    import fcntl
    ruta = ruta or os.path.join(CERROJO_DIR, "sintesis.lock")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    f = open(ruta, "a")
    tomado = False
    try:
        t0 = time.time()
        while True:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                tomado = True
                break
            except BlockingIOError:
                if time.time() - t0 > espera_s:
                    break
                time.sleep(0.5)
        yield tomado
    finally:
        if tomado:
            try:
                fcntl.flock(f, fcntl.LOCK_UN)
            except OSError:
                pass
        f.close()


def cargar_estado(raiz):
    ruta = os.path.join(raiz, REL_ESTADO)
    d = _leer_json(ruta, {}) or {}
    base = estado_vacio()
    base.update({k: v for k, v in d.items() if k in base})
    return base


def guardar_estado(raiz, estado):
    _escribir_json(os.path.join(raiz, REL_ESTADO), estado)


def _siguiente_n(estado, fecha):
    return int((estado.get("tareas_encoladas") or {}).get(fecha, 0)) + 1


def _fase_actual(ahora):
    """Determina la fase según la hora en CDMX."""
    h = _hora_cdmx(ahora)
    if h < HORAS_RECOLECTAR:
        return "recolectar"
    if h <= HORAS_REDACTAR:
        return "redactar"
    return "entregar"


def _debe_entregar(estado, ahora):
    """True si toca entregar (fase entregar y no entregada hoy)."""
    fecha = _fecha_cdmx(ahora)
    return _fase_actual(ahora) == "entregar" and not (estado.get("fecha") == fecha and estado.get("entregada"))


def _encoger_contexto(ctx, previa=TOPE_PREVIA, informe=TOPE_INFORME, resumen=TOPE_RESUMEN, imaginaciones=8):
    """El 2026-11-12 el contexto real hizo 821 KB (~117 KB por prompt): por encima del tope de la
    flota. Devuelve una copia con los textos a tope (no muta el original)."""
    fuera = dict(ctx or {})
    fuera["sintesis_previas"] = [dict(s, texto=str(s.get("texto") or "")[:previa])
                                 for s in (fuera.get("sintesis_previas") or [])]
    fuera["informes"] = [dict(i, texto=str(i.get("texto") or "")[:informe])
                         for i in (fuera.get("informes") or [])][:12]
    fuera["imaginacion"] = [{"agente": x.get("agente"), "ruta": x.get("ruta")}
                            for x in (fuera.get("imaginacion") or [])][:imaginaciones]
    actividad = fuera.get("resumen_actividad")
    if isinstance(actividad, (dict, list)) and len(json.dumps(actividad, ensure_ascii=False)) > resumen:
        fuera["resumen_actividad"] = json.dumps(actividad, ensure_ascii=False)[:resumen]
    return fuera


def _a_topes(tareas, tope=TOPE_PROMPT):
    """Último freno: ningún prompt sale del tope de la flota; si recorta, deja la instrucción final."""
    cierre = ("\n\n(Encargo recortado al tope de la flota.) Entrega el análisis en JSON: "
              "cada hallazgo con fuente, fecha y por qué importa.")
    for t in tareas or []:
        texto = str(t.get("prompt") or "")
        if len(texto) > tope:
            t["prompt"] = texto[:max(0, tope - len(cierre))] + cierre
    return tareas


def encargar_por_flota(raiz, tareas, ahora=None, vivos=None, apto=None, libre=None, fundir=None):
    """PET1112D: la vía que la flota SÍ toma (agente_referencias_diseno.encargar_por_flota):
    1. poda lo propio de más de DIAS_COLA y funde en olas/cola-suenos-sintesis.json (atómico);
    2. con un orquestador VIVO apto y con análisis libre que arrancó después, las tareas van
       a su cola viva (la releerá al quedar un hueco);
    3. sin uno vivo, la cola queda lista (se lanza desde Genesis); nunca arranca un orquestador.
    `vivos`, `apto`, `libre` y `fundir` son inyectables (pruebas)."""
    import suenos as S
    momento = _como_fecha(ahora)
    r = S.rutas(raiz)
    ruta_cola = os.path.join(r["olas"], NOMBRE_COLA)
    previas = S._leer_json(ruta_cola, [])
    lista = previas if isinstance(previas, list) else (previas.get("tareas") or [] if isinstance(previas, dict) else [])
    limite = _iso(momento - timedelta(days=DIAS_COLA))

    def podar(ts):
        return [t for t in ts if isinstance(t, dict)
                and (t.get("agente") != AGENTE or str(t.get("creada") or "") >= limite)]

    fusion = fundir or S.fundir_tareas
    S._escribir_json(ruta_cola, fusion(podar(lista), podar(tareas)))
    fuera = {"ok": True, "cola": "%s/%s" % (REL_OLAS, NOMBRE_COLA), "tareas": [t["id"] for t in tareas]}
    if not tareas:
        return fuera.update(accion="nada", mensaje="Sin tareas que encargar.") or fuera
    vivos = S.orquestadores_vivos() if vivos is None else vivos
    apto_orq, mtime_orq = S.orquestador_instalado_apto() if apto is None else apto
    if libre is None:
        try:
            import agente_referencias_diseno as IR
            libre = IR.analista_libre_instalado()
        except Exception:
            libre = (False, 0.0)
    sabe_libre, mtime_libre = libre
    propio = [o for o in vivos if o.get("cola") == NOMBRE_COLA]
    otros = [o for o in vivos if o.get("cola") != NOMBRE_COLA]
    if not apto_orq or not sabe_libre:
        fuera.update(accion="cola_lista", motivo="sin_orquestador_apto" if not apto_orq else "sin_analisis_libre",
                     mensaje="Cola lista en %s: nada se mete en una cola viva." % fuera["cola"])
    elif propio:
        fuera.update(accion="releida", pid=propio[0].get("pid"),
                     mensaje="Un orquestador ya corre esta cola: la releerá al quedar un hueco.")
    elif otros and S.puede_sonar(otros[0], max(float(mtime_orq or 0), float(mtime_libre or 0))):
        o = otros[0]
        viva = os.path.join(r["olas"], o["cola"])
        prev = S._leer_json(viva, [])
        vl = prev if isinstance(prev, list) else (prev.get("tareas") or [] if isinstance(prev, dict) else [])
        fus = fusion(vl, tareas)
        S._escribir_json(viva, fus if isinstance(prev, list) else dict(prev, tareas=fus))
        fuera.update(accion="tanda_viva", pid=o.get("pid"), cola_viva=o["cola"],
                     mensaje="%d encargo(s) añadidos a la cola viva (%s), con el tope de análisis propio." % (len(tareas), o["cola"]))
    elif otros:
        fuera.update(accion="esperar", pid=otros[0].get("pid"), cola_viva=otros[0].get("cola"),
                     mensaje="El orquestador vivo arrancó antes del analista: la cola queda lista para cuando termine.")
    else:
        fuera.update(accion="cola_lista", motivo="sin_orquestador",
                     mensaje="No hay orquestador vivo: la cola queda lista en %s (se lanza desde Genesis)." % fuera["cola"])
    return fuera


def _recolectar(raiz, estado, ahora, encargar, jev, seco, home=None):
    """Fase 1: arma el contexto (a topes), genera las tareas y encarga por la vía de la flota."""
    fecha = _fecha_cdmx(ahora)
    ctx = _encoger_contexto(SF.contexto(raiz, hoy=fecha, ahora=ahora.timestamp(), casa=home))
    tareas = _a_topes(ST.generar_tareas_analisis(ctx, raiz, ahora=_iso(ahora)))
    if seco:
        return {"accion": "seco", "mensaje": "(seco) nada se escribe ni se encarga", "tareas": []}
    if not tareas:
        return {"accion": "nada", "mensaje": "Sin tareas de análisis hoy.", "tareas": []}
    try:
        encargo = (encargar or encargar_por_flota)(raiz, tareas, ahora=ahora)
    except Exception as e:
        return {"ok": False, "accion": "error", "mensaje": f"No se pudo encargar: {type(e).__name__}"}
    estado["tareas_encoladas"][fecha] = len(tareas)
    estado["encargo"] = encargo
    return {"accion": encargo.get("accion") or "cola_lista", "cola": encargo.get("cola"),
            "tareas": [t["id"] for t in tareas], "encargo": encargo,
            "mensaje": encargo.get("mensaje") or f"Cola de síntesis lista ({len(tareas)} tareas)."}


def _redactar(raiz, estado, ahora, jev, seco):
    """Fase 2: recoge salidas, funde en síntesis y pide revisión (inyectable en tests)."""
    # En implementación real, el director de autodesarrollo recoge salidas y encarga redacción+revisión.
    # Aquí solo marcamos que la fase avanza; la redacción real se hace via tareas encoladas.
    return {"accion": "esperando_salidas", "mensaje": "Esperando salidas de análisis para redactar."}


def _puntuar(estado_sintesis, jev):
    """Consulta a Jev para puntuar la calidad."""
    if jev is False:
        return {"respuesta": "medio", "p": None, "medio": "regla"}
    try:
        import decidir
        return decidir.consultar(
            "puntuar",
            {"sintesis": estado_sintesis},
            "¿La síntesis tiene todo dato con fuente y fecha, nada inventado y secciones completas?",
            niveles="bajo,medio,alto",
            regla="medio",
            quien=AGENTE,
        )
    except Exception:
        return {"respuesta": "medio", "p": None, "medio": "regla"}


def _resumen_1500_3000(texto):
    """Extrae un resumen de 1500-3000 caracteres."""
    if len(texto) <= RESUMEN_MAX:
        return texto
    # Busca corte en párrafo
    for i in range(RESUMEN_MIN, min(RESUMEN_MAX, len(texto))):
        if texto[i] == "\n":
            return texto[:i]
    return texto[:RESUMEN_MAX]


# ─── ALC1113G: Generación de las tres secciones nuevas ──────────────────────

def _cargar_recomendaciones_dia(raiz, fecha):
    """Carga las recomendaciones de alcance_recomendaciones del día (propuesta-<fecha>.json)."""
    try:
        ruta = os.path.join(raiz, "starseed_memory_root", "alcance", "propuestas", f"propuesta-{fecha}.json")
        with open(ruta, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("paquetes", []) if isinstance(data, dict) else []
    except (OSError, ValueError):
        return []


def _cargar_borradores_alcance(raiz, fecha):
    """Carga los borradores de alcance pendientes de aprobación del día (borradores-<fecha>.json)."""
    try:
        ruta = os.path.join(raiz, "starseed_memory_root", "alcance", "borradores", f"borradores-{fecha}.json")
        with open(ruta, encoding="utf-8") as f:
            data = json.load(f)
        lista = data if isinstance(data, list) else (data.get("borradores") or [])
        return [b for b in lista if isinstance(b, dict) and b.get("estado") == "esperando-aprobacion"]
    except (OSError, ValueError):
        return []


def _cargar_fichas_github_dia(raiz, fecha):
    """Carga las fichas de GitHub del día (alcance/github/<fecha>.json)."""
    try:
        ruta = os.path.join(raiz, "starseed_memory_root", "alcance", "github", f"{fecha}.json")
        with open(ruta, encoding="utf-8") as f:
            data = json.load(f)
        lista = data if isinstance(data, list) else (data.get("fichas") or [])
        return [f for f in lista if isinstance(f, dict)]
    except (OSError, ValueError):
        return []


def _seccion_github_comunidad_tecnica(raiz, fecha, max_proyectos=10):
    """Genera la sección 'GitHub y comunidad técnica': 5-10 proyectos del día con enlace, qué hacen,
    qué aprender/implementar en StarSeed OS (de alcance_recomendaciones) y propuestas para la Librería."""
    fichas = _cargar_fichas_github_dia(raiz, fecha)
    recomendaciones = _cargar_recomendaciones_dia(raiz, fecha)
    
    # Mapear recomendaciones por obj_id de ficha
    rec_por_ficha = {}
    for r in recomendaciones:
        obj_id = r.get("_ficha_obj_id") or r.get("obj_id")
        if obj_id:
            rec_por_ficha[obj_id] = r
    
    lineas = ["## GitHub y comunidad técnica", ""]
    count = 0
    for ficha in fichas:
        if count >= max_proyectos:
            break
        nombre = ficha.get("nombre_publico", "")
        que_hacen = ficha.get("que_hacen", "")
        enlace = f"https://github.com/{nombre}" if nombre and "/" in nombre else ""
        area = ficha.get("area_starseed", "")
        obj_id = ficha.get("obj_id", "")
        
        rec = rec_por_ficha.get(obj_id, {})
        que_adoptar = rec.get("que_adoptar", "")
        por_que = rec.get("por_que", "")
        esfuerzo = rec.get("esfuerzo", "")
        riesgo = rec.get("riesgo", "")
        licencia_compatible = rec.get("licencia_compatible", False)
        
        lineas.append(f"### {nombre}")
        if enlace:
            lineas.append(f"- **Enlace:** {enlace}")
        lineas.append(f"- **Qué hacen:** {que_hacen[:300]}")
        if area:
            lineas.append(f"- **Área StarSeed:** {area}")
        if que_adoptar:
            lineas.append(f"- **Qué adoptar/implementar:** {que_adoptar}")
        if por_que:
            lineas.append(f"- **Por qué:** {por_que}")
        if esfuerzo:
            lineas.append(f"- **Esfuerzo:** {esfuerzo} (S=pequeño, M=medio, L=grande)")
        if riesgo:
            lineas.append(f"- **Riesgo:** {riesgo}")
        if licencia_compatible is not None:
            lineas.append(f"- **Licencia compatible:** {'Sí' if licencia_compatible else 'No'}")
        lineas.append("")
        count += 1
    
    if count == 0:
        lineas.append("_Sin proyectos analizados hoy._")
        lineas.append("")
    
    # Propuestas para la Librería
    if recomendaciones:
        lineas.append("### Propuestas para la Librería (en esperando-aprobación)")
        lineas.append("")
        for r in recomendaciones[:5]:
            lineas.append(f"- **{r.get('que_adoptar', 'Sin título')}** ({r.get('area_sistema', 'otro')}) — "
                         f"Esfuerzo: {r.get('esfuerzo', '?')}, Riesgo: {r.get('riesgo', '?')}, "
                         f"Licencia compatible: {'Sí' if r.get('licencia_compatible') else 'No'}")
        lineas.append("")
    
    return "\n".join(lineas)


def _seccion_alcance_contactos(raiz, fecha):
    """Genera la sección 'Alcance: contactos y mensajes para aprobar': borradores pendientes
    con id, destinatario, canal y motivo, y cómo aprobarlos (/alcance)."""
    borradores = _cargar_borradores_alcance(raiz, fecha)
    
    lineas = ["## Alcance: contactos y mensajes para aprobar", ""]
    
    if not borradores:
        lineas.append("_Sin borradores pendientes de aprobación hoy._")
        lineas.append("")
        return "\n".join(lineas)
    
    lineas.append(f"Hay **{len(borradores)} borrador(es) pendientes** de aprobación (estado: `esperando-aprobacion`).")
    lineas.append("Para aprobarlos, usa el bot de Telegram @StarSeed_Design_bot con comando `/alcance` o")
    lineas.append("la sección **Acciones de Alex** en Genesis (`/genesis?pestana=acciones`).")
    lineas.append("")
    lineas.append("| ID | Destinatario | Canal | Motivo |")
    lineas.append("|----|--------------|-------|--------|")
    
    for b in borradores:
        bid = b.get("id", "")
        dest = b.get("destinatario", "")
        canal_obj = b.get("canal", {})
        canal = canal_obj.get("medio", "desconocido") if isinstance(canal_obj, dict) else str(canal_obj)
        motivo = b.get("motivo", "")[:100]
        lineas.append(f"| {bid} | {dest} | {canal} | {motivo} |")
    
    lineas.append("")
    lineas.append("**Cómo aprobar:**")
    lineas.append("- En Telegram: `/alcance` → lista pendientes → `/aprobar <id>` o `/editar <id> <nuevo texto>` o `/rechazar <id>`")
    lineas.append("- En Genesis: sección **Acciones de Alex** → ve el borrador completo → botón **Aprobar**")
    lineas.append("- La aprobación guarda el hash del texto, destinatario, canal y hora; cualquier cambio invalida la aprobación.")
    lineas.append("")
    
    return "\n".join(lineas)


def _seccion_promocion_canales(raiz, fecha):
    """Genera la sección 'Promoción y canales': recomendaciones para el repo, canales de StarSeed,
    sitios nuevos para presentar el sistema, y próximos pasos con piezas audiovisuales. Rotación diaria."""
    from datetime import date
    hoy = date.fromisoformat(fecha)
    dia_año = hoy.timetuple().tm_yday
    
    # Rotación diaria de áreas (7 áreas, rotan cada día)
    areas_rotacion = [
        "fediverso",
        "nostr", 
        "matrix",
        "red-mesh",
        "gobernanza",
        "ia-local",
        "solarpunk-regenerativa"
    ]
    area_hoy = areas_rotacion[dia_año % len(areas_rotacion)]
    
    lineas = ["## Promoción y canales", ""]
    lineas.append(f"### Rotación diaria: **{area_hoy}**")
    lineas.append("")
    
    # 1. Recomendaciones para el repo
    lineas.append("### Repositorio GitHub (StarSeedSystem/starseed-system)")
    lineas.append("- **README:** Añadir badge de versión, badges de estado (build, tests, licencia), sección 'Cómo contribuir' enlazando a CONTRIBUTING.md")
    lineas.append("- **CONTRIBUTING.md:** Crear con guía de primeros pasos, flujo de PR, estilo de código, tests, y cómo proponer features (issues + 'good first issue')")
    lineas.append("- **Good first issues:** Etiquetar 3-5 issues existentes como 'good first issue' y 'help wanted' por área rotativa")
    lineas.append("- **Discussions:** Activar categorías: 'Ideas', 'Preguntas', 'Show and tell', 'Anuncios'; fijar post de bienvenida")
    lineas.append("- **Topics:** Añadir topics relevantes: `decentralized-social`, `operating-system`, `p2p`, `mesh-network`, `local-first`, `democracy`, `cooperatives`, `solarpunk`")
    lineas.append("- **Roadmap:** Añadir `ROADMAP.md` con fases Semilla/Fruto/Cosecha y hitos técnicos; enlazar desde README")
    lineas.append("- **Vista previa social:** Configurar `og:image`, `twitter:card`, `description` en `next.config.ts` y metadata de la app")
    lineas.append("")
    
    # 2. Canales propios de StarSeed
    lineas.append("### Canales y páginas de StarSeed")
    lineas.append("- **YouTube (Sociedad StarSeed):** Publicar 1 short semanal rotando áreas (esta semana: {area}); "
                 "añadir capítulo 'Cómo funciona StarSeed OS' con timestamps; playlist 'Fases del OS'".format(area=area_hoy))
    lineas.append("- **Instagram (Sociedad StarSeed):** 3 posts/semana: 1 carrusel educativo (fase actual), 1 reels técnico (demo), "
                 "1 cita/filosofía (Tríada); stories con encuestas sobre gobernanza")
    lineas.append("- **Telegram (@StarSeed_Design_bot y canal):** Anunciar síntesis diaria en canal público; "
                 "botones de reacción en posts; encuesta semanal '¿Qué área explorar?'")
    lineas.append("- **Web (starseed-os.vercel.app):** Landing con hero animado (Trinity), demo interactivo del dock, "
                 "sección 'Únete a una Sangha' con mapa; métricas de adopción en /genesis")
    lineas.append("")
    
    # 3. Sitios nuevos según contexto (rotación por área)
    lineas.append(f"### Sitios nuevos para presentar el sistema (área: {area_hoy})")
    sitios_por_area = {
        "fediverso": [
            "Mastodon/Instance admin forums: publicar en #fediverse #activitypub con demo de federación",
            "Fediverse.to / Fedidb: añadir instancia StarSeed cuando haya servidor propio",
            "SocialHub / Fediverse.party: listar como proyecto de OS social descentralizado"
        ],
        "nostr": [
            "Nostr.dev / NIPs repo: proponer NIP para 'Social OS' con OS como relay",
            "Damus / Amethyst / Coracle: pedir review de integración Nostr en el OS",
            "Nostr band / plebdevs: anuncio en comunidades de desarrolladores Nostr"
        ],
        "matrix": [
            "Matrix.org / Element.io: propuesta de widget StarSeed en Element X",
            "Matrix rooms: #decentralized-web:matrix.org, #p2p:matrix.org — demo de salas sincronizadas",
            "MSC (Matrix Spec Changes): proponer MSC para 'Social OS capabilities'"
        ],
        "red-mesh": [
            "Meshtastic forum / Discord: caso de uso 'OS en malla LoRa', demo con Astraura mesh",
            "Reticulum / Yggdrasil / Briar dev chats: integración de transporte mesh en OS",
            "LoRaWAN / The Things Network: gateway comunitario para Sanghas"
        ],
        "gobernanza": [
            "Decidim / Consul / Loomio / Polis: importar propuestas de gobernanza como módulos OS",
            "Participedia / Civic Tech Field Guide: ficha de StarSeed OS como herramienta democrática",
            "GovTech / Open Government Partnership: caso de estudio de soberanía digital"
        ],
        "ia-local": [
            "LocalAI / Ollama / llama.cpp / GPT4All: plugin StarSeed para modelos locales",
            "Hugging Face Spaces: demo interactiva de Exocórtex (IA personal) en el OS",
            "AI Safety / Alignment forums: arquitectura de IA propiedad del usuario (no del sistema)"
        ],
        "solarpunk-regenerativa": [
            "Solarpunk Subreddit / Discord / Mastodon: 'OS para ecoaldeas y comunidades regenerativas'",
            "GEN (Global Ecovillage Network) / RIVE: piloto en 3 ecoaldeas con mesh + OS",
            "Permacomputing / Low-tech Magazine: alineación con computación frugal y soberana"
        ],
    }
    
    for sitio in sitios_por_area.get(area_hoy, []):
        lineas.append(f"- {sitio}")
    
    # Sitios transversales
    lineas.append("- **Show HN (Hacker News):** Submit cuando haya demo pública completa (título: 'Show HN: StarSeed OS – a decentralized social operating system')")
    lineas.append("- **dev.to:** Artículo técnico 'Building a decentralized social OS with Next.js, Supabase, and P2P mesh'")
    lineas.append("- **Product Hunt:** Launch cuando haya onboarding público (categoría: Developer Tools / Social)")
    lineas.append("- **Academia / Investigadores:** Paper en arXiv 'StarSeed: A Sovereign Social Operating System'; contacto con grupos de CSCW, HCI, P2P")
    lineas.append("- **Comunidades locales / Ecoaldeas:** Talleres presenciales 'Tu soberanía digital en 2 horas' con kit mesh + OS")
    lineas.append("")
    
    # 4. Próximos pasos con piezas audiovisuales
    lineas.append("### Próximos pasos y piezas audiovisuales")
    lineas.append("**Público general:**")
    lineas.append("- Video 1 (2 min): '¿Qué es StarSeed OS?' — animación Trinity + demo dock + 'Tu vida digital te pertenece'")
    lineas.append("- Video 2 (5 min): 'Cómo unirte a una Sangha' — mesh, gobernanza, economía ecológica; testimonios reales")
    lineas.append("- Infografía: 'Las 3 fases (Semilla → Fruto → Cosecha)' para redes sociales")
    lineas.append("- Podcast (15 min): Entrevista a Alex sobre visión, con clips para Reels/Shorts")
    lineas.append("")
    lineas.append("**Público especializado (devs, investigadores, activistas):**")
    lineas.append("- Tech deep-dive (10 min): Arquitectura SOSD, Exocórtex, Mesh, Federation, Trinity UI")
    lineas.append("- Live coding (30 min): 'Crea tu primer agente en StarSeed OS' — plugin, tool-calling, memoria")
    lineas.append("- Paper + slides: 'Decentralized Social OS: Architecture & Governance' para conferencias (FOSDEM, LibrePlanet, CCC)")
    lineas.append("- Workshop materials: Repo `starseed-workshop` con ejercicios guiados (mesh chat, votación, agente IA)")
    lineas.append("")
    lineas.append("**Formatos y distribución:**")
    lineas.append("- **Posts:** 1 hilo Twitter/X + Mastodon + Bluesky + Nostr por pieza (adaptado a cada plataforma)")
    lineas.append("- **Comercial:** Newsletter 'StarSeed Weekly' (solo opt-in), caso de estudio para empresas/coops que quieran OS propio")
    lineas.append("- **Social:** Testimonios de usuarios, 'Día en la vida de una Sangha', métricas de adopción abiertas")
    lineas.append("- **Todos los formatos:** Video (MP4/WebM), Audio (MP3), Infografía (PNG/SVG), Slides (PDF/PPTX), Artículo (MD/HTML)")
    lineas.append("")
    
    return "\n".join(lineas)


SECCIONES_RESPALDO = ("Portada y rotación", "Noticias con fuente y fecha", "Actividad de Alex",
                      "Referencias de diseño", "Ideas de vídeo y redes", "Guiones y storyboard",
                      "YouTube", "Mañana (la rotación del día siguiente)")
CIFRAS_RESPALDO = (3000, 9000)


def _prompt_respaldo(ctx, fecha, salidas=()):
    """El encargo de UNA sola llamada (la prueba del 2026-11-11): la flota gratuita redacta
    la síntesis entera con las secciones del protocolo. Pura; cabe en el tope de la flota."""
    partes = ["Redacta la síntesis diaria de producción audiovisual de StarSeed del %s en Markdown "
              "(entre %d y %d caracteres)." % (fecha, CIFRAS_RESPALDO[0], CIFRAS_RESPALDO[1]),
              "Regla: %s" % ST.REGLA,
              "Secciones: %s" % "; ".join(SECCIONES_RESPALDO),
              "Rotación del día: %s" % json.dumps((ctx or {}).get("rotacion") or {}, ensure_ascii=False),
              "", "Contexto:", json.dumps(ctx or {}, ensure_ascii=False, separators=(",", ":")),
              "",
              "Instrucciones para las secciones nuevas (ALC1113G):",
              "1. 'GitHub y comunidad técnica': 5-10 proyectos analizados hoy (de alcance/github/<fecha>.json) con enlace, qué hacen, qué aprender/implementar en StarSeed OS (de alcance_recomendaciones) y propuestas para la Librería (propuesta-<fecha>.json).",
              "2. 'Alcance: contactos y mensajes para aprobar': borradores pendientes (borradores-<fecha>.json) con id, destinatario, canal, motivo y cómo aprobar (/alcance en Telegram o Acciones de Alex en Genesis).",
              "3. 'Promoción y canales': recomendaciones repo (README, CONTRIBUTING, good first issues, Discussions, topics, roadmap, vista previa social); canales StarSeed (YouTube, Instagram, Telegram, web); sitios nuevos según rotación diaria (fediverso, Nostr, Matrix, mesh, gobernanza, IA local, solarpunk); próximos pasos con piezas audiovisuales para público general y especializado, posts y contenido comercial/social en todos los formatos.",
              "Rotación diaria por áreas del OS. Todo como RECOMENDACIÓN; nada se publica automáticamente.",
              ""]
    if salidas:
        partes += ["Salidas de análisis del día:", json.dumps(salidas, ensure_ascii=False, separators=(",", ":"))]
    partes += ["", "Devuelve SOLO el texto de la síntesis en Markdown, sin texto alrededor."]
    return "\n".join(partes)[:TOPE_PROMPT]


def _salidas_del_dia(raiz, fecha, tope=TOPE_SALIDA, listar=None):
    """Las salidas que la flota dejó hoy (sintesis-<fecha>-<rama>.json), cada una a tope."""
    carpeta = os.path.join(raiz, SF.AGENTES)
    try:
        nombres = (listar or os.listdir)(carpeta)
    except OSError:
        return []
    salidas = []
    patron = re.compile(r"^sintesis-%s-.+\.json$" % re.escape(fecha))
    for nombre in sorted(nombres):
        if not patron.match(nombre):
            continue
        leido = SF._leer(os.path.join(carpeta, nombre), datos=True)
        if leido:
            salidas.append({"agente": nombre[:-5], "datos": json.dumps(leido[1], ensure_ascii=False)[:tope]})
    return salidas


def _clave_flota(nombres=("FREELLMAPI_KEY", "STARSEED_FLOTA_API_KEY")):
    """La clave de la flota gratuita por NOMBRE de variable, de ~/.starseed/env o ~/.hermes/.env.
    Nunca se imprime ni se registra."""
    for nombre in nombres:
        valor = os.environ.get(nombre)
        if valor:
            return valor
        for ruta in ("~/.starseed/env", "~/.hermes/.env"):
            try:
                with open(os.path.expanduser(ruta), encoding="utf-8") as f:
                    for linea in f:
                        linea = linea.strip()
                        if linea.startswith(nombre + "=") and len(linea) > len(nombre) + 1:
                            return linea.split("=", 1)[1].strip().strip('"')
            except OSError:
                continue
    return None


def _redactar_flota(prompt, clave=None, base=None, modelo=None, abrir=None):
    """La flota gratuita en un solo paso (la prueba del 2026-11-11): FreeLLMAPI local
    (127.0.0.1:3001), modelo CON nombre (nunca «auto»). None si falta clave o no contesta."""
    clave = clave if clave is not None else _clave_flota()
    if not clave or not str(prompt).strip():
        return None
    base = (base or os.environ.get("STARSEED_FLOTA_BASE_URL") or "http://127.0.0.1:3001/v1").rstrip("/")
    modelo = modelo or os.environ.get("STARSEED_SINTESIS_MODELO") or "groq/llama-3.3-70b-instruct"
    cuerpo = {"model": modelo, "stream": False, "temperature": 0.7, "max_tokens": 8000,
              "messages": [{"role": "user", "content": str(prompt)}]}
    peticion = urllib.request.Request(base + "/chat/completions", json.dumps(cuerpo).encode("utf-8"),
                                      {"Content-Type": "application/json", "Authorization": "Bearer %s" % clave})
    try:
        with (abrir or urllib.request.urlopen)(peticion, timeout=600) as r:
            datos = json.load(r)
        return (datos["choices"][0]["message"]["content"] or "").strip() or None
    except Exception:
        return None


def _pedir_https(url, cuerpo):
    """POST JSON, la firma `pedir` de cuentas_google.token (renovar el access_token)."""
    peticion = urllib.request.Request(url, json.dumps(cuerpo).encode("utf-8"), {"Content-Type": "application/json"})
    with urllib.request.urlopen(peticion, timeout=60) as r:
        return json.load(r)


def _subir_doc(fecha, texto, pedir=None):
    """Sube el markdown como Doc de Google con el alias «alex-docs» (solo drive.file) en la
    carpeta «Síntesis diarias». Devuelve el id del Doc, o None: su fallo no bloquea la entrega."""
    try:
        import cuentas_google as CG
        acceso = CG.token("alex-docs", pedir or _pedir_https)
        if not acceso:
            return None
        borde = "starseed%d" % int(time.time() * 1000)
        meta = json.dumps({"name": "Síntesis diaria %s" % fecha,
                           "mimeType": "application/vnd.google-apps.document",
                           "parents": [CARPETA_DOC]}).encode("utf-8")
        borde_b = borde.encode("ascii")
        cuerpo = (b"--" + borde_b + b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta +
                  b"\r\n--" + borde_b + b"\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n" +
                  str(texto).encode("utf-8") + b"\r\n--" + borde_b + b"--\r\n")
        peticion = urllib.request.Request(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", data=cuerpo,
            headers={"Authorization": "Bearer %s" % acceso, "Content-Type": "multipart/related; boundary=%s" % borde})
        with urllib.request.urlopen(peticion, timeout=120) as r:
            return json.load(r).get("id")
    except Exception:
        return None


def _respaldo(raiz, estado, ahora, redactar=None, subir_drive=None, seco=False, salidas=None):
    """Respaldo de la entrega (PET1112D): si a las 07:54 de CDMX no hay texto, la flota gratuita
    redacta la síntesis en UN paso, se guarda, se sube a Drive y sale (el envío lo hace _entregar).
    Un día nunca queda sin síntesis. `redactar` y `subir_drive` son inyectables (pruebas sin red)."""
    fecha = _fecha_cdmx(ahora)
    if seco:
        return {"accion": "seco", "mensaje": "(seco) el respaldo no redacta ni envía", "respaldo": True}
    ctx = _encoger_contexto(SF.contexto(raiz, hoy=fecha, ahora=ahora.timestamp()))
    salidas = _salidas_del_dia(raiz, fecha) if salidas is None else salidas
    texto = (redactar or _redactar_flota)(_prompt_respaldo(ctx, fecha, salidas=salidas))
    if not texto or len(str(texto).strip()) < 400:
        return {"ok": False, "accion": "sin_sintesis",
                "mensaje": "La flota no devolvió texto; el día queda sin síntesis (se reintenta al siguiente ciclo)."}
    lineas = str(texto).splitlines()
    if lineas and lineas[0].startswith("```"):
        lineas = lineas[1:]
    if lineas and lineas[-1].strip().startswith("```"):
        lineas = lineas[:-1]
    texto = "\n".join(lineas).strip()
    ruta_md = os.path.join(raiz, REL_SINTESIS, "%s.md" % fecha)
    _escribir_texto(ruta_md, texto)
    estado["respaldo"] = True
    try:
        doc = (subir_drive or _subir_doc)(fecha, texto)
    except Exception:
        doc = None
    return {"ok": True, "accion": "respaldo", "ruta": ruta_md, "drive": bool(doc), "caracteres": len(texto),
            "mensaje": "Respaldo: la flota redactó la síntesis en un paso (%s Drive)." % ("con" if doc else "sin")}


def _entregar(raiz, estado, ahora, enviar, jev, seco, redactar=None, subir_drive=None,
              asegurar_fuente=None, drive_doc_id=None):
    """Fase 3: a las 07:54 sin texto, respaldo (la flota redacta en un paso); luego puntúa,
    guarda markdown, envía a Telegram, sube a Drive y añade la fuente a NotebookLM."""
    fecha = _fecha_cdmx(ahora)
    ruta_md = os.path.join(raiz, REL_SINTESIS, f"{fecha}.md")
    if not os.path.exists(ruta_md):
        if _hora_cdmx(ahora) < HORAS_ENTREGAR:
            return {"ok": True, "accion": "esperando_redaccion",
                    "mensaje": "Sin texto todavía; el respaldo redacta a las 07:54."}
        respaldo = _respaldo(raiz, estado, ahora, redactar=redactar, subir_drive=subir_drive, seco=seco)
        if not respaldo.get("ok"):
            return respaldo
        ruta_md = respaldo["ruta"]
    with open(ruta_md, encoding="utf-8") as f:
        texto = f.read()
    if seco:
        return {"accion": "seco", "mensaje": "(seco) no se envía ni se marca entregada", "resumen": _resumen_1500_3000(texto)}

    # Subir a Drive y obtener el id (antes de enviar a Telegram)
    if not drive_doc_id:
        try:
            subidor = subir_drive or _subir_doc
            texto_limpio = texto
            lineas = texto.splitlines()
            if lineas and lineas[0].startswith("```"):
                lineas = lineas[1:]
            if lineas and lineas[-1].strip().startswith("```"):
                lineas = lineas[:-1]
            texto_limpio = "\n".join(lineas).strip() if lineas else texto
            drive_doc_id = subidor(fecha, texto_limpio)
        except Exception:
            drive_doc_id = None

    puntuacion = _puntuar({"texto": texto[:6000]}, jev)
    estado["puntuacion"] = puntuacion
    resumen = _resumen_1500_3000(texto)

    # Línea extra para el mensaje completo de Telegram
    LINEA_NB = "\n\nPídeme en este chat infografía, audio, vídeo o presentación de esta síntesis"
    texto_con_nb = texto + LINEA_NB

    r1 = enviar(resumen)
    r2 = enviar(texto_con_nb)
    if r1.get("ok") and r2.get("ok"):
        estado["entregada"] = True
        estado["sintesis_path"] = ruta_md

        # Añadir como fuente al cuaderno de NotebookLM (no bloquea si falla)
        nb_ok = False
        if asegurar_fuente and drive_doc_id:
            try:
                asegurar_fuente(drive_doc_id, f"Síntesis diaria {fecha}")
                nb_ok = True
            except Exception:
                pass

        return {"ok": True, "accion": "entregada", "resumen": resumen, "puntuacion": puntuacion,
                "telegram": {"resumen": r1, "completa": r2}, "notebooklm_fuente": nb_ok}
    return {"ok": False, "accion": "error_envio", "resumen": r1, "completa": r2}


def ciclo(raiz, ahora=None, encargar=None, jev=None, enviar=None, forzar=False, seco=False, home=None,
          redactar=None, subir_drive=None, asegurar_fuente=None, drive_doc_id=None):
    """Un ciclo: decide fase, ejecuta y guarda estado. Todo inyectable; `seco` no escribe."""
    momento = _como_fecha(ahora)
    fecha = _fecha_cdmx(momento)
    estado = cargar_estado(raiz)
    jev = False if seco else jev
    # Reinicio diario
    if estado.get("fecha") != fecha:
        estado = estado_vacio()
        estado["fecha"] = fecha
    if not forzar and _dentro(estado.get("ultimo_ciclo"), momento, horas=CADA_HORAS):
        return {"ok": True, "agente": AGENTE, "fecha": fecha, "seco": seco, "toca": False,
                "motivo": f"ya hubo ciclo hace menos de {CADA_HORAS} h", "fase": estado.get("fase")}
    fase = _fase_actual(momento)
    estado["fase"] = fase
    if fase == "recolectar":
        res = _recolectar(raiz, estado, momento, encargar, jev, seco, home)
    elif fase == "redactar":
        res = _redactar(raiz, estado, momento, jev, seco)
    else:  # entregar
        if _debe_entregar(estado, momento):
            res = _entregar(raiz, estado, momento, enviar or SG.enviar, jev, seco,
                            redactar=redactar, subir_drive=subir_drive,
                            asegurar_fuente=asegurar_fuente, drive_doc_id=drive_doc_id)
        else:
            res = {"accion": "ya_entregada", "mensaje": "Síntesis ya entregada hoy."}
    if not seco:
        estado["ultimo_ciclo"] = _iso(momento)
        estado["ciclos"] = int(estado.get("ciclos") or 0) + 1
        guardar_estado(raiz, estado)
    return {"ok": True, "agente": AGENTE, "fecha": fecha, "seco": seco, "toca": True,
            "fase": fase, "resultado": res}


def _plan(raiz, ahora, home):
    ctx = SF.contexto(raiz, hoy=_fecha_cdmx(ahora), ahora=ahora.timestamp(), casa=home)
    tareas = ST.generar_tareas_analisis(ctx, raiz, ahora=_iso(ahora))
    return {"ok": True, "seco": True, "fecha": _fecha_cdmx(ahora), "fase": _fase_actual(ahora),
            "tareas": len(tareas), "detalle": [{"id": t["id"], "rama": t["rama"]} for t in tareas]}


def _estado(raiz):
    e = cargar_estado(raiz)
    return {"ok": True, "fecha": e.get("fecha"), "fase": e.get("fase"),
            "ultimo_ciclo": e.get("ultimo_ciclo"), "ciclos": e.get("ciclos"),
            "entregada": e.get("entregada"), "tareas_encoladas": e.get("tareas_encoladas"),
            "sintesis_path": e.get("sintesis_path"), "puntuacion": e.get("puntuacion"),
            "respaldo": e.get("respaldo")}


def parser():
    p = argparse.ArgumentParser(description="Agente de síntesis diaria de producción")
    p.add_argument("orden", choices=("plan", "ciclo", "estado", "navegador-estado"))
    p.add_argument("--raiz", default=RAIZ)
    p.add_argument("--home")
    p.add_argument("--seco", action="store_true")
    p.add_argument("--forzar", action="store_true")
    p.add_argument("--sin-jev", action="store_true")
    p.add_argument("--json", action="store_true")
    return p


def main(argv=None, salida=None):
    a = parser().parse_args(argv)
    ahora = _como_fecha(None)
    if a.orden == "plan":
        d = _plan(a.raiz, ahora, a.home)
    elif a.orden == "ciclo":
        d = ciclo(a.raiz, ahora, encargar=None, jev=False if a.sin_jev else None,
                  enviar=None, forzar=a.forzar, seco=a.seco, home=a.home)
    elif a.orden == "navegador-estado":
        d = _navegador_estado(a.raiz)
    else:
        d = _estado(a.raiz)
    salida = salida or sys.stdout
    if a.json:
        print(json.dumps(d, ensure_ascii=False, indent=1), file=salida)
    else:
        print(json.dumps(d, ensure_ascii=False), file=salida)
    return 0 if d.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())