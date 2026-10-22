"""Lógica pura del carril de alta capacidad (ALT1021Ab).

Solo funciones puras (sin leer disco ni red), docstrings en español.
Regla del área: gratis primero, relevo automático ante 429/402.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple, Dict, Any


def necesita_alta(tarea: Dict[str, Any], entrada: Optional[Dict[str, Any]]) -> bool:
    """True si la tarea pendiente requiere el carril de alta capacidad."""
    # Si la entrada indica que ya está cerrada, no aplica.
    if entrada is not None:
        cerradas = {"integrada", "sustituida", "no_aplica", "en_curso"}
        estado = entrada.get("estado") or entrada.get("paso") or entrada.get("resultado") or ""
        if isinstance(estado, str) and estado.lower() in cerradas:
            return False
        # Si el paso/estado explícito indica cierre.
        if entrada.get("integrada") is True or entrada.get("sustituida") is True:
            return False
        if entrada.get("estado") == "no_aplica":
            return False
        if entrada.get("en_curso") is True:
            return False
        # Si la entrada es bloqueante con alta_capacidad true.
        bloqueante = entrada.get("bloqueante") is True or str(entrada.get("estado", "")).lower() == "bloqueante"
        if bloqueante and entrada.get("alta_capacidad") is True:
            return True
    # Regla de la tarea en sí.
    capacidad = (tarea.get("capacidad") or tarea.get("dificultad") or "")
    if isinstance(capacidad, str) and capacidad == "alta":
        return True
    if tarea.get("capacidad") == "alta" or tarea.get("dificultad") == "alta":
        return True
    # Nota del director: escalada agotada.
    notas = [tarea.get("nota"), tarea.get("nota_director"), tarea.get("notas")]
    if entrada is not None:
        notas.append(entrada.get("nota"))
    for nota in notas:
        if isinstance(nota, str) and nota.strip().startswith("director: escalada agotada"):
            return True
    # Tarea pendiente normal → False.
    return False


def cupo_claude(lecturas: List[Dict[str, Any]], ahora: datetime,
                tope_semana: int = 80, tope_sesion: int = 70,
                frescura_h: int = 6) -> Tuple[bool, str]:
    """Revisa si hay cupo de Claude según `~/.starseed/limites-claude.json`.

    Devuelve (bool, mensaje_explicativo).
    """
    # Sin lecturas → lectura vieja.
    if not lecturas:
        return False, "lectura vieja: mira claude.ai/settings/usage"
    ultima = lecturas[-1]
    t_str = ultima.get("t")
    if not t_str:
        return False, "lectura vieja: mira claude.ai/settings/usage"
    # Parseo defensivo del campo t (ISO con zona).
    try:
        if isinstance(t_str, str):
            # Normaliza sufijo Z si falta zona.
            t_str_norm = t_str.replace("Z", "+00:00")
            t_lectura = datetime.fromisoformat(t_str_norm)
        else:
            t_lectura = datetime.fromisoformat(str(t_str))
        # Asegura zona horaria.
        if t_lectura.tzinfo is None:
            t_lectura = t_lectura.replace(tzinfo=timezone.utc)
    except Exception:
        return False, "lectura vieja: mira claude.ai/settings/usage"
    # Asegura `ahora` con zona.
    if ahora.tzinfo is None:
        ahora = ahora.replace(tzinfo=timezone.utc)
    diferencia = ahora - t_lectura
    if diferencia > timedelta(hours=frescura_h) or diferencia < timedelta(hours=-frescura_h):
        return False, "lectura vieja: mira claude.ai/settings/usage"
    # Extrae porcentajes.
    semana_pct = ultima.get("semana_pct")
    sesion_pct = ultima.get("sesion_pct")
    try:
        semana = float(semana_pct) if semana_pct is not None else None
        sesion = float(sesion_pct) if sesion_pct is not None else None
    except Exception:
        return False, "lectura vieja: mira claude.ai/settings/usage"
    if semana is None or sesion is None:
        return False, "lectura vieja: mira claude.ai/settings/usage"
    # Tope justo en 80 o 70 debe rechazar.
    if semana >= tope_semana or sesion >= tope_sesion:
        return False, f"semana {semana:g} % · sesión {sesion:g} % (tope superado)"
    return True, f"semana {semana:g} % · sesión {sesion:g} %"


def elegir(candidatas: List[Dict[str, Any]], en_marcha: int, max_agentes: int = 2) -> List[Dict[str, Any]]:
    """Selecciona como mucho `max_agentes - en_marcha` candidatas.

    Orden: pedidas por Alex (`adelantar` texto no vacío), luego importancia
    "capacidad", luego más `intentos_auto`, luego id ascendente.
    Nunca devuelve cantidad negativa.
    """
    disponibles = max(0, max_agentes - en_marcha)
    if disponibles <= 0:
        return []
    # Copia defensiva para no mutar la lista original.
    orden = list(candidatas)
    # Clave de ordenación.
    def clave(c: Dict[str, Any]) -> tuple:
        adelantar = 1 if (c.get("adelantar") and str(c.get("adelantar", "")).strip()) else 0
        importancia = 1 if (c.get("importancia") == "capacidad") else 0
        intentos = int(c.get("intentos_auto", 0) or 0)
        # id como cadena para orden lexicográfico estable.
        id_val = str(c.get("id", ""))
        return (-adelantar, -importancia, -intentos, id_val)
    orden.sort(key=clave)
    return orden[:disponibles]
