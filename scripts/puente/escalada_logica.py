#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escalera de reintentos para tareas estancadas: lógica pura sin I/O.

Módulo puro (sin red, sin disco, sin procesos) para decidir el siguiente
paso cuando una tarea cae en un estado recuperable. La escalera sube desde
reintentos gratis (libre) a modelos de pago (haiku, sonnet) con topes diarios.

Regla del área (memoria §0): flota gratuita → si no lo logra, modelos más
potentes hasta llegar a los de pago; nunca agotar cupos; nunca quedarse con
0 en curso habiendo pendientes.
"""

from datetime import datetime

# Estados que se pueden reintentar automáticamente
ESTADOS_RECUPERABLES = {"sin_cambios", "fallo", "fallo_tsc", "fallo_tests", "conflicto", "interrumpida"}

# Escalera de modelos: cada intento sube un nivel
# n=0 (intento original de la cola) es nivel 0 "libre"
# n=1 primer reintento automático es nivel 1 "libre" (segunda vez gratis)
# n=2 es haiku, n=3 haiku, n=4 sonnet, n>=5 bloqueante
NIVELES = ("libre", "libre", "haiku", "haiku", "sonnet")


def niveles_de(config):
    """Escalera efectiva. Manda config['escalada']['niveles']; si no, NIVELES.

    Regla del area (memoria): el trabajo lo hace la flota gratuita. Los
    niveles de pago solo se pisan si la persona los pone en la configuracion,
    y ademas requieren escalada.activa.
    """
    niveles = (config or {}).get("escalada", {}).get("niveles")
    if isinstance(niveles, (list, tuple)) and niveles:
        return tuple(str(x) for x in niveles)
    return NIVELES


def siguiente_paso(entrada, gasto, config, hoy, modelos_anthropic, ahora=None):
    """Calcula el siguiente paso para reintentar una tarea estancada.

    Args:
        entrada: dict del progreso.json de la tarea
        gasto: dict {fecha: 'YYYY-MM-DD', haiku: N, sonnet: N, ...}
        config: dict de config_director.cargar() con claves escalada.*
        hoy: str 'YYYY-MM-DD'
        modelos_anthropic: list de ids de modelos [haiku, sonnet, ...] para Anthropic
        ahora: str 'YYYY-MM-DD HH:MM:SS' (por defecto: se ignora y se genera si es None)

    Devuelve:
        dict con campos {estado, modelo, cuenta, motivo}
        o None si el estado no es recuperable.

    El estado devuelto puede ser 'pendiente' (seguir reintentando) o
    'bloqueante' (requiere una persona).
    """
    if not isinstance(entrada, dict) or entrada.get("estado") not in ESTADOS_RECUPERABLES:
        return None

    niveles = niveles_de(config)
    n = entrada.get("intentos_auto", 0)
    if n >= len(niveles):
        resumen = ", ".join("%s×%d" % (x, niveles.count(x)) for x in sorted(set(niveles), key=niveles.index))
        return {
            "estado": "bloqueante",
            "modelo": None,
            "cuenta": None,
            "motivo": "escalada agotada tras %d intentos (%s): requiere una persona" % (n, resumen),
        }

    nivel = niveles[n]

    # Nivel "libre": reintentar con el modelo original (None significa que lo elige el orquestador)
    if nivel == "libre":
        return {
            "estado": "pendiente",
            "modelo": None,
            "cuenta": None,
            "motivo": "reintento gratuito %d/%d" % (n + 1, niveles.count("libre")),
        }

    # Nivel "haiku" o "sonnet": escalada a pago
    if not config.get("escalada", {}).get("activa"):
        return {
            "estado": "bloqueante",
            "modelo": None,
            "cuenta": None,
            "motivo": "escalada desactivada: requiere una persona",
        }

    if not modelos_anthropic:
        return {
            "estado": "bloqueante",
            "modelo": None,
            "cuenta": None,
            "motivo": "sin proveedor anthropic: requiere una persona",
        }

    # Revisar cupos diarios
    gasto_hoy = gasto.get("fecha") == hoy and gasto or {"fecha": hoy, "haiku": 0, "sonnet": 0}
    tope_haiku = config.get("escalada", {}).get("tope_haiku_dia", 20)
    tope_sonnet = config.get("escalada", {}).get("tope_sonnet_dia", 5)

    haiku_gasto = gasto_hoy.get("haiku", 0)
    sonnet_gasto = gasto_hoy.get("sonnet", 0)

    # Si estamos en haiku y se alcanzó el cupo, intentar sonnet
    if nivel == "haiku":
        if haiku_gasto >= tope_haiku:
            # Intenta sonnet si lo hay
            if sonnet_gasto >= tope_sonnet:
                return {
                    "estado": "bloqueante",
                    "modelo": None,
                    "cuenta": None,
                    "motivo": "tope diario de escalada alcanzado (haiku %d/%d, sonnet %d/%d): requiere una persona o mañana"
                    % (haiku_gasto, tope_haiku, sonnet_gasto, tope_sonnet),
                }
            # Hay cupo en sonnet
            modelo = "anthropic/" + modelos_anthropic[1] if len(modelos_anthropic) > 1 else "anthropic/" + modelos_anthropic[0]
            return {
                "estado": "pendiente",
                "modelo": modelo,
                "cuenta": "sonnet",
                "motivo": "escalada a sonnet (intento %d)" % (n + 1),
            }
        # Hay cupo en haiku
        modelo = "anthropic/" + modelos_anthropic[0]
        return {
            "estado": "pendiente",
            "modelo": modelo,
            "cuenta": "haiku",
            "motivo": "escalada a haiku (intento %d)" % (n + 1),
        }

    # Nivel "sonnet"
    if nivel == "sonnet":
        if sonnet_gasto >= tope_sonnet:
            return {
                "estado": "bloqueante",
                "modelo": None,
                "cuenta": None,
                "motivo": "tope diario de sonnet alcanzado (%d/%d): requiere una persona o mañana"
                % (sonnet_gasto, tope_sonnet),
            }
        modelo = "anthropic/" + modelos_anthropic[1] if len(modelos_anthropic) > 1 else "anthropic/" + modelos_anthropic[0]
        return {
            "estado": "pendiente",
            "modelo": modelo,
            "cuenta": "sonnet",
            "motivo": "escalada a sonnet (intento %d)" % (n + 1),
        }

    return None


def aplicar(progreso, tid, paso, ahora):
    """Actualiza el progreso con el resultado de siguiente_paso.

    Args:
        progreso: dict original (no se muta)
        tid: id de la tarea
        paso: dict devuelto por siguiente_paso()
        ahora: str 'YYYY-MM-DD HH:MM:SS'

    Devuelve:
        dict nuevo (copia) con la entrada actualizada
    """
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in progreso.items()}
    entrada = p[tid]

    entrada["estado"] = paso["estado"]
    entrada["intentos_auto"] = entrada.get("intentos_auto", 0) + 1
    entrada["nota"] = "director: " + paso["motivo"]
    entrada["t"] = ahora

    if paso["modelo"] is not None:
        entrada["modelo_siguiente"] = paso["modelo"]
    elif "modelo_siguiente" in entrada:
        del entrada["modelo_siguiente"]

    # Si es bloqueante, no incrementar intentos_auto
    if paso["estado"] == "bloqueante":
        entrada["intentos_auto"] -= 1

    return p


def contar_gasto(gasto, paso, hoy):
    """Actualiza el gasto de la cuenta según el paso.

    Args:
        gasto: dict {fecha: 'YYYY-MM-DD', haiku: N, sonnet: N, ...}
        paso: dict devuelto por siguiente_paso()
        hoy: str 'YYYY-MM-DD'

    Devuelve:
        dict nuevo con el gasto actualizado
    """
    if gasto.get("fecha") != hoy:
        g = {"fecha": hoy, "haiku": 0, "sonnet": 0}
    else:
        g = {k: v for k, v in gasto.items()}

    if paso.get("cuenta"):
        g[paso["cuenta"]] = g.get(paso["cuenta"], 0) + 1

    return g


def en_asuntos(tid, asuntos):
    """Reutiliza vigilante_logica.id_en_asuntos para no duplicar lógica."""
    import re
    patron = re.compile(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(tid))
    return any(patron.search(asunto) for asunto in asuntos)
