# -*- coding: utf-8 -*-
"""Sugerencias de agentes potentes por tarea (CAP1126A).

Paso 4 de «Buscar más capacidad» (buscar_capacidad.py). Lógica pura: recibe colas,
progreso y contexto de cupo y propone, para cada tarea candidata, UN agente y
modelo con su motivo, su coste estimado y el cupo que queda.

Candidatas: prioridad ≥ 90 y (carril de alta capacidad · ≥ 2 fallos · horas sin turno).

Nada se lanza: solo escribe ~/.starseed/capacidad-sugerencias.json.
Las sugerencias requieren aprobación antes de ejecutarse.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import alta_capacidad_logica as AL  # noqa: E402  necesita_alta, cupo_claude
import urgencia_tarea as UT  # noqa: E402  prioridad_de_tarea

RUTA_SUGERENCIAS = os.path.expanduser("~/.starseed/capacidad-sugerencias.json")
RUTA_LIMITES_CLAUDE = os.path.expanduser("~/.starseed/limites-claude.json")
RUTA_USO_AG = os.path.expanduser("~/.starseed/antigravity-uso.json")
RUTA_PASARELAS = os.path.expanduser("~/.starseed/pasarelas-informe.json")

PRIORIDAD_MINIMA = 90
FALLOS_MINIMOS = 2
HORAS_SIN_TURNO_DEFECTO = 24
DE_PAGO = ("xai", "deepseek", "anthropic", "openai")

MODELO_AG = {
    "rust_nativo": "claude-opus-5-5-high",
    "fallo_dificil": "claude-opus-5-5-high",
    "ui_typescript": "gemini-4-neon-high",
    "arquitectura": "gemini-4-hydrogen-xhigh",
    "mecanico": "gemini-3.8-flash",
}
MODELO_AG_DEFECTO = "gemini-4-neon-high"
MOTIVO_AG = {
    "rust_nativo": "Rust/nativo: Opus 5.5 para código nativo y fallos difíciles",
    "fallo_dificil": "Fallos repetidos: Opus 5.5 resuelve lo que otros no pudieron",
    "ui_typescript": "UI/TypeScript: neon-high para componentes y estilos",
    "arquitectura": "Arquitectura: hydrogen-xhigh para decisiones de sistema",
    "mecanico": "Mecánico: gemini-3.8-flash de bajo coste",
}
MOTIVO_AG_DEFECTO = "General: gemini-4-neon-high"

COSTE_AG = "sin clave API (Antigravity, cuenta de Google de Alex)"
COSTE_CLAUDE = "crédito de sesión/semanal de Claude (límite 85 % semana)"
COSTE_EXPLABS = "según pasarelas-informe.json (pasarela explabs)"
COSTE_CODEX = "suscripción de Codex/ChatGPT"


def _epoch_ts(valor):
    """PURA: fecha «YYYY-MM-DD HH:MM:SS» → epoch, o None si no se entiende."""
    try:
        return time.mktime(time.strptime(str(valor), "%Y-%m-%d %H:%M:%S"))
    except (ValueError, OverflowError, AttributeError, TypeError):
        return None


def horas_sin_turno(entrada, ahora=None):
    """PURA: horas transcurridas desde el `t` de la entrada de progreso, o None."""
    ahora = time.time() if ahora is None else ahora
    t = None
    if isinstance(entrada, dict):
        t = entrada.get("t") or entrada.get("updated") or entrada.get("modificado")
    if t is None:
        return None
    ep = _epoch_ts(t)
    if ep is None:
        return None
    return max(0.0, (ahora - ep) / 3600.0)


def _archivos(tarea):
    a = tarea.get("archivos") or []
    return a if isinstance(a, (list, tuple)) else [a]


def _texto_tarea(tarea, entrada):
    partes = [
        str(tarea.get("titulo") or ""), str(tarea.get("nota") or ""),
        str(tarea.get("nota_director") or ""), str(tarea.get("notas") or ""),
    ]
    if isinstance(entrada, dict):
        partes.append(str(entrada.get("nota") or ""))
    return " ".join(partes).lower()


def clasificar_tarea(tarea, entrada):
    """PURA: tipo de tarea (rust_nativo, fallo_dificil, ui_typescript, arquitectura,
    mecanico, otro). Se usa para elegir el agente y modelo más adecuado."""
    textos = _texto_tarea(tarea, entrada)
    archivos = _archivos(tarea)
    extensiones = {os.path.splitext(a)[1].lower() for a in archivos if isinstance(a, str)}
    rutas = [str(a).lower() for a in archivos if isinstance(a, str)]
    estado = str((entrada or {}).get("estado") or "")
    intentos = int((entrada or {}).get("intentos_auto") or tarea.get("intentos_auto") or 0)

    if intentos >= FALLOS_MINIMOS and estado in (
        "fallo", "fallo_tsc", "fallo_tests", "conflicto", "interrumpida",
    ):
        return "fallo_dificil"
    if extensiones & {".rs", ".go", ".c", ".cpp", ".cc", ".h", ".swift", ".kt", ".m", ".mm"}:
        return "rust_nativo"
    if any(p in textos for p in ("rust", "nativo", "objc", "swift", "kotlin")):
        return "rust_nativo"
    if any(
        r.startswith("architecture/")
        or (r.endswith(".md") and any(w in r for w in ("arquitectura", "diseño", "sistema")))
        for r in rutas
    ):
        return "arquitectura"
    if any(w in textos for w in ("arquitectura", "arquitecto", "sistema", "orquestador", "infraestructura")):
        return "arquitectura"
    if extensiones & {".ts", ".tsx", ".css", ".scss", ".less"}:
        return "ui_typescript"
    if any(w in textos for w in ("ui", "typescript", "componente", "frontend", "tailwind", "shadcn", "pantalla", "widget")):
        return "ui_typescript"
    if any(w in textos for w in ("renombrar", "formatear", "resumir", "scrape", "mecánico", "mecanico")):
        return "mecanico"
    return "otro"


def es_candidata(tarea, entrada, ahora, prioridad_minima=PRIORIDAD_MINIMA,
                 fallos_minimos=FALLOS_MINIMOS, umbral_horas_sin_turno=HORAS_SIN_TURNO_DEFECTO):
    """PURA: ¿esta tarea es candidata a agente potente?

    prioridad ≥ 90 y (carril de alta capacidad o ≥ 2 fallos o horas sin turno).
    """
    if UT.prioridad_de_tarea(tarea) < prioridad_minima:
        return False
    if AL.necesita_alta(tarea, entrada):
        return True
    if int((entrada or {}).get("intentos_auto") or tarea.get("intentos_auto") or 0) >= fallos_minimos:
        return True
    hs = horas_sin_turno(entrada, ahora)
    if hs is not None and hs >= umbral_horas_sin_turno:
        return True
    return False


def candidatas(colas, progreso, ahora, **kw):
    """PURA: [(tarea, entrada)] de todas las colas fuente que son candidatas."""
    salida = []
    progreso = progreso if isinstance(progreso, dict) else {}
    for _nombre, tareas in (colas or []):
        for tarea in tareas or []:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            entrada = progreso.get(str(tarea["id"]))
            if not isinstance(entrada, dict):
                entrada = {}
            if es_candidata(tarea, entrada, ahora, **kw):
                salida.append((tarea, entrada))
    return salida


def _opciones(tipo):
    """PURA: lista de (agente, modelo, motivo, clave_cupo, modelo_cupo) por orden de preferencia."""
    modelo = MODELO_AG.get(tipo, MODELO_AG_DEFECTO)
    motivo = MOTIVO_AG.get(tipo, MOTIVO_AG_DEFECTO)
    principal = [("Antigravity", modelo, motivo, "ag", modelo)]
    fallbacks = [
        ("Claude Code (Mac)", "claude-opus-5-5 / sonnet",
         "Claude Code de la Mac: cupo bajo el 85 % de la semana", "claude", None),
        ("Experiential Labs", "clef-flash / chat con descuento",
         "Pasarela explabs: cupo según pasarelas-informe.json", "explabs", None),
        ("Codex", "gpt-5.6-sol", "Codex de ChatGPT: escritura potente si está habilitado", "codex", None),
    ]
    pago = [
        ("pago: " + p, p + "/modelo", "De pago (" + p + "): solo con cupo en pasarelas-informe.json",
         "pago:" + p, None) for p in DE_PAGO
    ]
    return principal + fallbacks + pago


def _cupo_ok(clave, modelo, ctx):
    """PURA: ¿tiene cupo esta opción según el contexto?"""
    if clave == "ag":
        info = (ctx.get("cupo_ag") or {}).get(modelo) if isinstance(ctx.get("cupo_ag"), dict) else None
        return bool(info is None or info.get("disponible", True))
    if clave == "claude":
        return bool(ctx.get("cupo_claude_ok"))
    if clave == "explabs":
        return bool(ctx.get("cupo_explabs"))
    if clave == "codex":
        return bool(ctx.get("codex_habilitado"))
    if clave.startswith("pago:"):
        prov = clave.split(":", 1)[1]
        return bool((ctx.get("cupos_pago") or {}).get(prov))
    return False


def _coste(clave, modelo, ctx):
    """PURA: coste estimado legible de la opción."""
    if clave == "ag":
        return COSTE_AG
    if clave == "claude":
        return COSTE_CLAUDE
    if clave == "explabs":
        return COSTE_EXPLABS
    if clave == "codex":
        return COSTE_CODEX
    if clave.startswith("pago:"):
        return "$/token (pago: " + clave.split(":", 1)[1] + ")"
    return ""


def _cupo_texto(clave, modelo, ctx):
    """PURA: texto del cupo que queda para la opción."""
    if clave == "ag":
        info = (ctx.get("cupo_ag") or {}).get(modelo) if isinstance(ctx.get("cupo_ag"), dict) else None
        if info is None:
            return "sin registro de uso de Antigravity"
        hoy = info.get("disponible_hoy")
        if isinstance(hoy, (int, float)):
            return "%.0f llamada(s) hoy disponibles" % hoy
        return "disponible (Antigravity)"
    if clave == "claude":
        return "semana %s%% · sesión %s%%" % (
            ctx.get("semana_pct") or "?", ctx.get("sesion_pct") or "?")
    if clave == "explabs":
        return ctx.get("cupo_explabs_texto", "cupo según pasarelas-informe.json")
    if clave == "codex":
        return "su propia suscripción (Codex)"
    if clave.startswith("pago:"):
        return "cupo según pasarelas-informe.json (" + clave.split(":", 1)[1] + ")"
    return ""


def elegir_agente(tipo, ctx):
    """PURA: (agente, modelo, motivo, coste, cupo_texto) o None si no hay cupo en ninguna opción."""
    for agente, modelo, motivo, clave, _ in _opciones(tipo):
        if _cupo_ok(clave, modelo, ctx):
            return agente, modelo, motivo, _coste(clave, modelo, ctx), _cupo_texto(clave, modelo, ctx)
    return None


def sugerir(tarea, entrada, ctx, ahora, modo="plan"):
    """PURA: una sugerencia para la tarea, o None si ningún agente tiene cupo.

    `modo` es «plan» (deja un plan en la tarea; lo escribe el enjambre gratuito)
    o «escribir» (el potente escribe en el worktree).
    """
    tipo = clasificar_tarea(tarea, entrada)
    elegido = elegir_agente(tipo, ctx)
    if elegido is None:
        return None
    agente, modelo, motivo, coste, cupo = elegido
    return {
        "id": str(tarea.get("id") or ""),
        "titulo": str(tarea.get("titulo") or ""),
        "tipo": tipo,
        "agente": agente,
        "modelo": modelo,
        "motivo": motivo,
        "coste_estimado": coste,
        "cupo_queda": cupo,
        "modo": modo,
        "prioridad": UT.prioridad_de_tarea(tarea),
        "visto": datetime.fromtimestamp(ahora, tz=timezone.utc).isoformat(),
    }


def sugerencias(colas, progreso, ctx, ahora, modo="plan"):
    """PURA: ([sugerencias], [sin_cupo]) para todas las candidatas de las colas.

    `sin_cupo`: candidatas a las que ningún agente con cupo puede atenderse.
    """
    sugs, sin_cupo = [], []
    ctx = ctx if isinstance(ctx, dict) else {}
    for tarea, entrada in candidatas(colas, progreso, ahora):
        s = sugerir(tarea, entrada, ctx, ahora, modo)
        if s is None:
            sin_cupo.append({
                "id": str(tarea.get("id") or ""),
                "titulo": str(tarea.get("titulo") or ""),
                "tipo": clasificar_tarea(tarea, entrada),
                "prioridad": UT.prioridad_de_tarea(tarea),
            })
        else:
            sugs.append(s)
    return sugs, sin_cupo


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta, datos):
    carpeta = os.path.dirname(ruta) or "."
    os.makedirs(carpeta, exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def contexto_desde_disco(ahora=None):
    """Lee los cupos de disco y devuelve el contexto para `elegir_agente`/`sugerir`.

    Nunca lanza: falta de archivo o de lectura se trata como «sin cupo» salvo
    Antigravity (sin registro de uso = disponible).
    """
    ahora = time.time() if ahora is None else ahora
    ahora_dt = datetime.fromtimestamp(ahora, tz=timezone.utc)
    ctx = {"ahora": ahora}

    # Claude: límite 85 % semanal (regla de la tarea).
    limites = _leer_json(RUTA_LIMITES_CLAUDE, {})
    lecturas = limites.get("lecturas") if isinstance(limites, dict) else []
    ok, _msg = AL.cupo_claude(lecturas, ahora_dt, tope_semana=85)
    ctx["cupo_claude_ok"] = bool(ok)
    ultima = lecturas[-1] if isinstance(lecturas, list) and lecturas else {}
    ctx["semana_pct"] = ultima.get("semana_pct")
    ctx["sesion_pct"] = ultima.get("sesion_pct")

    # Antigravity: reserva del 20 % por modelo.
    try:
        import antigravity_flota as AG  # noqa: E402
        cupo_ag = {}
        for modelo in MODELO_AG.values():
            try:
                en_reserva = AG.en_reserva(modelo)
            except Exception:  # noqa: BLE001
                en_reserva = False
            try:
                disponible_hoy = AG.estimar_cuota_diaria(modelo).get("disponible_hoy")
            except Exception:  # noqa: BLE001
                disponible_hoy = None
            cupo_ag[modelo] = {"disponible": not en_reserva, "disponible_hoy": disponible_hoy}
        ctx["cupo_ag"] = cupo_ag
    except Exception:  # noqa: BLE001 — sin Antigravity instalado
        ctx["cupo_ag"] = {}

    # Pasarelas de pago / explabs: solo con cupo declarado.
    pas = _leer_json(RUTA_PASARELAS, {}) or {}
    ctx["cupo_explabs"] = bool(pas.get("explabs"))
    ctx["cupo_explabs_texto"] = str(pas.get("explabs_texto") or "cupo según pasarelas-informe.json")
    pago = pas.get("pago") if isinstance(pas.get("pago"), dict) else {}
    ctx["cupos_pago"] = {prov: bool(pago.get(prov)) for prov in DE_PAGO}

    # Codex: escritor salvo que esté apagado (PUENTE-DE-MANDO).
    ctx["codex_habilitado"] = os.environ.get("STARSEED_CODEX_ESCRITOR", "1") != "0"
    return ctx


def sugerencias_de_olas(olas_dir, progreso_path, ctx, ahora=None, modo="plan"):
    """Lee colas y progreso de disco y devuelve ([sugerencias], [sin_cupo])."""
    ahora = time.time() if ahora is None else ahora
    import asignar_huecos as AH  # noqa: E402

    prev_olas = AH.OLAS
    AH.OLAS = olas_dir
    try:
        from asignar_huecos import _colas_fuente  # noqa: E402
        colas = _colas_fuente()
    finally:
        AH.OLAS = prev_olas
    progreso = _leer_json(progreso_path, {})
    return sugerencias(colas, progreso, ctx, ahora, modo)


def guardar_sugerencias(ruta, sugs, sin_cupo):
    """Escribe el fichero de sugerencias (sobreescribe, escritura atómica)."""
    datos = {
        "visto": datetime.now(tz=timezone.utc).isoformat(),
        "regla": "prioridad ≥ 90 y (alta capacidad o ≥ 2 fallos o horas sin turno); nada se lanza sin aprobación",
        "sugerencias": sugs,
        "sin_cupo": sin_cupo,
        "total": len(sugs),
    }
    _escribir_json(ruta, datos)
    return datos


def texto_linea(sugs, sin_cupo):
    """PURA: la línea que enseña el medidor para este paso."""
    if not sugs and not sin_cupo:
        return "Agentes potentes: sin candidatas con prioridad ≥ 90"
    partes = ["Agentes potentes: %d sugerencia(s)" % len(sugs)]
    if sugs:
        detalle = " · ".join("%s→%s (%s)" % (s["tipo"], s["modelo"], s["modo"]) for s in sugs[:5])
        partes.append(detalle)
    if sin_cupo:
        partes.append("%d sin cupo (%s)" % (len(sin_cupo), ", ".join(s["id"] for s in sin_cupo[:5])))
    return partes[0] + (" (" + "; ".join(partes[1:]) + ")" if len(partes) > 1 else "")


def main(argv=None):
    import argparse

    parser = argparse.ArgumentParser(description="Sugerencias de agentes potentes por tarea.")
    parser.add_argument("--olas", default=None)
    parser.add_argument("--progreso", default=None)
    parser.add_argument("--modo", default="plan")
    parser.add_argument("--salida", default=RUTA_SUGERENCIAS)
    args = parser.parse_args(argv)

    ahora = time.time()
    ctx = contexto_desde_disco(ahora)
    olas = args.olas or os.path.join(os.path.dirname(os.path.dirname(DIRECTORIO)), "starseed_memory_root", "olas")
    progreso = args.progreso or os.path.join(olas, "progreso.json")
    sugs, sin_cupo = sugerencias_de_olas(olas, progreso, ctx, ahora, args.modo)
    guardar_sugerencias(args.salida, sugs, sin_cupo)
    print(texto_linea(sugs, sin_cupo))
    return 0


if __name__ == "__main__":
    sys.exit(main())


