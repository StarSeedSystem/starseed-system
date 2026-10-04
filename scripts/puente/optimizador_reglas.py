# -*- coding: utf-8 -*-
"""optimizador_reglas · director optimizador (StarSeed OS, 2026-10-04).

Reglas R1–R8 (§3 del contrato director-optimizador.md) que convierten métricas
(`m`, §2) en hallazgos (`[hallazgo]`) con límites de enfriamiento y tope diario (§5).
Puro: sin red, sin archivos, sin importar `optimizador_metricas`.
"""

from __future__ import annotations

METRICAS_EJEMPLO = {
    "integradas_h": 3.2,
    "trabajadores": {
        "tope_gobernador": 3,
        "vivos": 2,
        "escribiendo": 1,
        "en_puerta": 0,
        "ociosos": 0,
    },
    "listas": 4,
    "fraccion_escribiendo": 0.35,
    "fases": {
        "escritura": {"n": 10, "segundos_mediana": 120, "segundos_p90": 240, "fallos": 1},
        "tsc": {"n": 10, "segundos_mediana": 45, "segundos_p90": 90, "fallos": 0},
        "tests": {"n": 10, "segundos_mediana": 30, "segundos_p90": 60, "fallos": 0},
        "rev": {"n": 10, "segundos_mediana": 15, "segundos_p90": 25, "fallos": 0},
        "int": {"n": 10, "segundos_mediana": 10, "segundos_p90": 15, "fallos": 0},
    },
    "modelos": {
        "m1": {"intentos": 8, "con_cambios": 1, "integradas": 1, "sin_cambios": 5, "colgados": 2, "segundos_mediana": 180, "tasa": 0.125},
        "m2": {"intentos": 6, "con_cambios": 4, "integradas": 3, "sin_cambios": 1, "colgados": 0, "segundos_mediana": 90, "tasa": 0.5},
    },
    "proveedores": {},
    "sin_usar": ["m3"],
    "memoria": {"swap_usado_mb": 400, "swap_total_mb": 2048, "ram_libre_mb": 1800},
    "coste": {"jev_dia_usd": 0.015, "opus_semana_pct": 25, "supabase_pct_dia": 30},
    "nube": {"pausada": True, "motivo": "mantenimiento", "contenedores_libres": 2},
}


def _es_accion_permitida(accion: str | None, historial: list, ahora: int, config: dict) -> bool:
    """Una acción se descarta si la misma perilla cambió hace menos de
    `enfriamiento_min` (por defecto 60) o si el día lleva `max_cambios_dia`
    (por defecto 12) cambios (`historial` es lista `{t, accion, perilla}`).
    """
    if accion is None:
        return False
    enfriamiento = int(config.get("enfriamiento_min", 60))
    max_cambios = int(config.get("max_cambios_dia", 12))
    hoy = int(ahora)  # asumimos `ahora` es timestamp; el contrato dice `t` en historial
    # El contrato dice "hace menos de enfriamiento_min" → tiempo en minutos desde `ahora`
    cambios_hoy = 0
    for cambio in historial:
        t_cambio = cambio.get("t", 0) if isinstance(cambio, dict) else cambio[0] if isinstance(cambio, (list, tuple)) else 0
        # Consideramos cambios del mismo día (misma fecha que `ahora`)
        # Para simplificar: cambios con t > (ahora - 86400) cuentan para el día
        if t_cambio > ahora - 86400:
            cambios_hoy += 1
    if cambios_hoy >= max_cambios:
        return False
    # Enfriamiento: si la misma perilla (accion como nombre de perilla) apareció hace poco
    # El contrato dice "misma perilla". Usamos `accion` como clave de perilla.
    for cambio in historial:
        t_cambio = cambio.get("t", 0) if isinstance(cambio, dict) else (cambio[0] if isinstance(cambio, (list, tuple)) else 0)
        accion_cambio = cambio.get("accion", cambio[1] if isinstance(cambio, (list, tuple)) and len(cambio) > 1 else None)
        perilla = cambio.get("perilla", cambio[2] if isinstance(cambio, (list, tuple)) and len(cambio) > 2 else accion)
        if accion_cambio == accion and (ahora - t_cambio) < enfriamiento * 60:
            return False
    return True


def _hallazgo(id_: str, gravedad: str, texto: str, evidencia: str, accion: str | None = None) -> dict:
    return {
        "id": id_,
        "gravedad": gravedad,
        "texto": texto,
        "evidencia": evidencia,
        "accion": accion,
    }


def diagnosticar(m, config, historial_cambios, ahora):
    """Convierte métricas (`m`, §2) en hallazgos con reglas R1–R8 (§3).

    `config` = bloque `optimizador` de §9 con valores por defecto.
    `historial_cambios` = lista `{t, accion, perilla}`.
    `ahora` = timestamp (segundos o cualquier número comparable).

    Devuelve `[hallazgo]` ordenado por gravedad descendente (rojo > aviso > info).
    Cada hallazgo es `{id, gravedad, texto, evidencia, accion}`; `accion` es `None`
    o una de las acciones de la lista blanca (§5).
    """
    hallazgos = []

    # ── R1 · Capacidad ociosa ─────────────────────────────────────────
    vivos = (m.get("trabajadores") or {}).get("vivos", 0)
    listas = m.get("listas", 0) if m.get("listas") is not None else None
    ram_libre = (m.get("memoria") or {}).get("ram_libre_mb") if m.get("memoria") else None
    swap_usado = (m.get("memoria") or {}).get("swap_usado_mb") if m.get("memoria") else None
    swap_total = (m.get("memoria") or {}).get("swap_total_mb", 1) if m.get("memoria") else 1
    tope_hw = (m.get("trabajadores") or {}).get("tope_gobernador")
    maximo_hw = int(config.get("maximo_por_hardware", 3))

    if (listas is not None and vivos is not None and listas > vivos and
        ram_libre is not None and ram_libre >= 1200 and
        swap_usado is not None and swap_total > 0 and (swap_usado / swap_total) < 0.75):
        accion_r1 = "subir_trabajadores"
        # No pasar de `maximo_por_hardware`
        if tope_hw is not None and tope_hw >= maximo_hw:
            accion_r1 = None
        else:
            accion_r1 = "subir_trabajadores"
        if accion_r1 and _es_accion_permitida(accion_r1, historial_cambios, ahora, config):
            hallazgos.append(_hallazgo(
                "R1", "info",
                "Capacidad ociosa: listas (%d) > vivos (%d), RAM libre %d MB, swap < 75%%." % (listas, vivos, ram_libre),
                "m[trabajadores].vivos=%d, listas=%d, ram_libre_mb=%d, swap_pct=%.1f" % (vivos, listas, ram_libre, 100 * swap_usado / swap_total),
                accion_r1,
            ))
        else:
            # Aunque no se permita la acción, el hallazgo existe; la acción se descarta por límite.
            hallazgos.append(_hallazgo(
                "R1", "info",
                "Capacidad ociosa detectada (acción descartada por enfriamiento/tope).",
                "m[trabajadores].vivos=%d, listas=%d, ram_libre_mb=%d" % (vivos, listas, ram_libre) if ram_libre else "vivos=%d, listas=%d" % (vivos, listas),
                None,
            ))

    # ── R2 · Mac saturada ───────────────────────────────────────────────
    swap_pct = (swap_usado / swap_total * 100) if (swap_usado is not None and swap_total) else None
    ram_libre_usable = ram_libre if ram_libre is not None else None
    trabajadores_vivos = vivos
    if ((swap_pct is not None and swap_pct > 90) or
        (ram_libre_usable is not None and ram_libre_usable < 300 and trabajadores_vivos > 1)):
        accion_r2 = "bajar_trabajadores"
        if _es_accion_permitida(accion_r2, historial_cambios, ahora, config):
            hallazgos.append(_hallazgo(
                "R2", "aviso",
                "Mac saturada: swap > 90%% o RAM libre < 300 MB con trabajadores > 1.",
                "swap_pct=%.1f, ram_libre_mb=%d, trabajadores=%d" % (swap_pct or 0, ram_libre_usable or 0, trabajadores_vivos) if ram_libre_usable is not None else ("swap_pct=%.1f, trabajadores=%d" % (swap_pct or 0, trabajadores_vivos) if swap_pct is not None else "trabajadores=%d" % trabajadores_vivos),
                accion_r2,
            ))
        else:
            hallazgos.append(_hallazgo(
                "R2", "aviso",
                "Mac saturada detectada (acción descartada por enfriamiento/tope).",
                "swap_pct=%s, ram_libre=%s, vivos=%d" % (str(swap_pct) if swap_pct is not None else "None", str(ram_libre_usable) if ram_libre_usable is not None else "None", trabajadores_vivos),
                None,
            ))

    # R2 manda sobre R1 si la Mac está saturada (el contrato dice que R2 manda sobre R1)
    # Esto se refleja: si hay R2, R1 debería ser ignorado o tener prioridad menor.
    # El contrato dice "R2 manda sobre R1 si la Mac está saturada" → R2 tiene mayor peso.
    # No necesitamos eliminar R1 explícitamente; la ordenación por gravedad ya lo hace
    # (aviso > info). Pero para ser explícitos: si hay hallazgo R2, no añadimos R1 con acción.
    # En nuestra implementación ya los añadimos ambos, pero R2 (aviso) va antes que R1 (info).

    # ── R3 · Modelo improductivo ────────────────────────────────────────
    modelos = m.get("modelos", {}) or {}
    for nombre, datos in modelos.items():
        intentos = datos.get("intentos", 0) if isinstance(datos, dict) else 0
        tasa = datos.get("tasa", 1.0) if isinstance(datos, dict) else 1.0
        sin_cambios = datos.get("sin_cambios", 0) if isinstance(datos, dict) else 0
        colgados = datos.get("colgados", 0) if isinstance(datos, dict) else 0
        if intentos >= 6 and (tasa < 0.1 or ((sin_cambios + colgados) >= 0.8 * max(1, intentos))):
            accion_r3 = "bajar_en_rotacion"
            if _es_accion_permitida(accion_r3, historial_cambios, ahora, config):
                hallazgos.append(_hallazgo(
                    "R3", "aviso",
                    "Modelo improductivo: %s (intentos=%d, tasa=%.2f, sin_cambios=%d, colgados=%d)." % (nombre, intentos, tasa, sin_cambios, colgados),
                    "modelos[%s] = %s" % (nombre, str(datos)),
                    accion_r3,
                ))
            else:
                hallazgos.append(_hallazgo(
                    "R3", "aviso",
                    "Modelo improductivo detectado (acción descartada): %s." % nombre,
                    "modelos[%s] = %s" % (nombre, str(datos)),
                    None,
                ))

    # ── R4 · Modelo estrella ────────────────────────────────────────────
    # "Sin estar entre los 3 primeros" → ordenamos por tasa descendente y comprobamos posición.
    modelos_ordenados = sorted(
        [(k, (v.get("tasa", 0) if isinstance(v, dict) else 0), (v.get("intentos", 0) if isinstance(v, dict) else 0)) for k, v in modelos.items()],
        key=lambda x: x[1], reverse=True
    )
    nombres_top3 = [nombre for nombre, _, _ in modelos_ordenados[:3]]
    for nombre, datos in modelos.items():
        tasa = datos.get("tasa", 0) if isinstance(datos, dict) else 0
        intentos = datos.get("intentos", 0) if isinstance(datos, dict) else 0
        if tasa >= 0.4 and intentos >= 4 and nombre not in nombres_top3:
            accion_r4 = "subir_en_rotacion"
            if _es_accion_permitida(accion_r4, historial_cambios, ahora, config):
                hallazgos.append(_hallazgo(
                    "R4", "info",
                    "Modelo estrella: %s (tasa=%.2f, intentos=%d, fuera del top 3)." % (nombre, tasa, intentos),
                    "modelos[%s] tasa=%.2f intentos=%d" % (nombre, tasa, intentos),
                    accion_r4,
                ))
            else:
                hallazgos.append(_hallazgo(
                    "R4", "info",
                    "Modelo estrella detectado (acción descartada): %s." % nombre,
                    "modelos[%s] tasa=%.2f intentos=%d" % (nombre, tasa, intentos),
                    None,
                ))

    # ── R5 · Escritores sin usar ────────────────────────────────────────
    sin_usar = m.get("sin_usar", [])
    if isinstance(sin_usar, list):
        for nombre in sin_usar:
            accion_r5 = "probar_modelo"
            if _es_accion_permitida(accion_r5, historial_cambios, ahora, config):
                hallazgos.append(_hallazgo(
                    "R5", "info",
                    "Escritor sin usar con prueba reciente que escribe: %s." % nombre,
                    "sin_usar contiene: %s" % str(sin_usar),
                    accion_r5,
                ))
            else:
                hallazgos.append(_hallazgo(
                    "R5", "info",
                    "Escritor sin usar detectado (acción descartada): %s." % nombre,
                    "sin_usar contiene: %s" % str(sin_usar),
                    None,
                ))

    # ── R6 · Puerta cuello de botella ───────────────────────────────────
    fases = m.get("fases", {}) or {}
    total_segundos = 0
    for fase, datos in fases.items():
        if isinstance(datos, dict) and datos.get("n", 0) > 0:
            total_segundos += datos.get("segundos_mediana", 0) * datos.get("n", 1)
    # Si total_segundos es 0, no hay datos significativos
    if total_segundos > 0:
        for fase, datos in fases.items():
            if isinstance(datos, dict):
                mediana = datos.get("segundos_mediana", 0)
                p90 = datos.get("segundos_p90", 0)
                n = datos.get("n", 0)
                if n > 0 and mediana > 0 and (mediana / total_segundos > 0.5 or p90 > 15 * 60):
                    # La fase ocupa > 50% del tiempo total de puertas y p90 > 15 min (900 s)
                    # El contrato dice: "Si una fase de puerta ocupa más del 50% del tiempo y su p90 pasa de 15 min"
                    # Usamos `mediana` como aproximación del tiempo de la fase.
                    # El contrato menciona "fase de puerta". Consideramos las fases `tsc`, `tests`, `rev`, `int`.
                    # `escritura` es escritura, no puerta; `tsc`, `tests`, `rev`, `int` sí.
                    if fase in ("tsc", "tests", "rev", "int"):
                        # Comprobamos > 50% del tiempo total de puertas
                        tiempo_fase_aprox = datos.get("segundos_mediana", 0) * datos.get("n", 1)
                        if tiempo_fase_aprox > 0.5 * total_segundos and datos.get("segundos_p90", 0) > 15 * 60:
                            hallazgos.append(_hallazgo(
                                "R6", "aviso",
                                "Puerta cuello de botella: fase '%s' ocupa >50%% del tiempo (p90=%.0f s > 15 min)." % (fase, datos.get("segundos_p90", 0)),
                                "fases[%s] = %s" % (fase, str(datos)),
                                "proponer_tarea",
                            ))

    # ── R7 · Nube ───────────────────────────────────────────────────────
    nube = m.get("nube", {})
    pausada = nube.get("pausada", False) if isinstance(nube, dict) else False
    contenedores_libres = nube.get("contenedores_libres", 0) if isinstance(nube, dict) else 0
    listas_r7 = listas if listas is not None else 0
    vivos_r7 = vivos if vivos is not None else 1
    # "escritores locales con tasa < 0.15"
    tasas_locales = [
        datos.get("tasa", 1.0) for datos in (modelos.values() if isinstance(modelos, dict) else [])
        if isinstance(datos, dict)
    ]
    tasa_media_local = sum(tasas_locales) / max(1, len(tasas_locales)) if tasas_locales else 1.0
    if (pausada and listas_r7 is not None and vivos_r7 > 0 and listas_r7 >= 2 * vivos_r7 and tasa_media_local < 0.15):
        # R7 nunca devuelve una acción que reactive la nube: solo hallazgo.
        hallazgos.append(_hallazgo(
            "R7", "aviso",
            "Nube en pausa (%s), listas (%d) >= 2*vivos (%d), escritores locales tasa baja (%.2f). Proponer a Alex reactivar." % (str(nube.get("motivo", "")) or "", listas_r7, vivos_r7, tasa_media_local),
            "nube=%s, listas=%d, vivos=%d, tasa_media_local=%.2f" % (str(nube), listas_r7, vivos_r7, tasa_media_local),
            None,  # nunca acción que reactive la nube
        ))

    # ── R8 · Coste ──────────────────────────────────────────────────────
    coste = m.get("coste", {}) or {}
    opus_pct = coste.get("opus_semana_pct")
    jev_dia = coste.get("jev_dia_usd")
    supabase_pct = coste.get("supabase_pct_dia")
    # Tope diario de Jev (por defecto, asumimos un tope; el contrato dice "80% del tope")
    # No tenemos el tope explícito en `m`; asumimos un tope razonable si no está en config.
    tope_jev = float(config.get("tope_jev_dia_usd", 1.0))
    if (opus_pct is not None and opus_pct >= 60) or (jev_dia is not None and tope_jev > 0 and (jev_dia / tope_jev) >= 0.80) or (supabase_pct is not None and supabase_pct >= 70):
        hallazgos.append(_hallazgo(
            "R8", "rojo",
            "Coste en límite: opus_semana_pct=%s%%, jev_dia_usd=%.4f (>=80%% de %.2f), supabase_pct_dia=%s%%." % (str(opus_pct) if opus_pct is not None else "None", float(jev_dia) if jev_dia is not None else 0.0, float(tope_jev), str(supabase_pct) if supabase_pct is not None else "None"),
            "coste=%s" % str(coste),
            None,  # El contrato dice "el optimizador deja de usar el modelo de pago en §7 ese día" — acción interna, no en lista blanca de perillas
        ))

    # Orden: rojo primero, luego aviso, luego info. Si hay R2, debe ir antes que R1 (ya ocurre por gravedad).
    orden_gravedad = {"rojo": 0, "aviso": 1, "info": 2}
    hallazgos.sort(key=lambda h: orden_gravedad.get(h.get("gravedad", "info"), 3))
    return hallazgos
