"""Relevo de medios (RES1121A) · lógica pura, sin disco ni red.

Cada medio tiene su especialidad y un relevo designado. Si un medio deja de latir,
el siguiente toma el relevo con ARRENDAMIENTO (un solo lector por bot de Telegram).
Las claves que el A1 necesite para relevar viajan SOLO por oracle_nodo.py claves.
"""
from __future__ import annotations
 
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
 
# Umbral en minutos sin latido para considerar que un medio ha caído
UMBRAL_LATIDO_MIN = 10
 
# Orden de relevo: cada medio releva al siguiente
ORDEN_RELEVO = ["mac", "a1", "maggabox", "nubes-efimeras", "mac"]
 
# Los tres canales de dirección (fuente única: ~/.starseed/canales-direccion.json)
CANALES_DIRECCION = ["principal", "general", "audiovisual"]
 
 
def _fecha(valor: Any) -> Optional[datetime]:
    if not isinstance(valor, str) or not valor:
        return None
    try:
        d = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.astimezone()
 
 
def registro_defecto() -> Dict[str, Any]:
    """Registro base con los 4 medios, sus especialidades y relevo.
    Los latidos empiezan en None para que las pruebas de 'sin latido' funcionen.
    """
    return {
        "medios": [
            {
                "id": "mac",
                "nombre": "Mac M1",
                "especialidad": "orquestador, puertas, cartero, presidente, bot Principal",
                "relevo": "a1",
                "canales": CANALES_DIRECCION.copy(),
                "latido": None,
                "nota_claves": "origen de claves; las que el A1 necesite viajan SOLO por oracle_nodo.py claves",
            },
            {
                "id": "a1",
                "nombre": "A1 Oracle",
                "especialidad": "siempre encendido, bot de diseño, guardián de main, cola de respaldo, nube",
                "relevo": "maggabox",
                "canales": CANALES_DIRECCION.copy(),
                "latido": None,
                "nota_claves": "claves que necesita para relevar viajan SOLO por oracle_nodo.py claves (archivo 600 del servicio), nunca al Maggabox ni a nubes efímeras",
            },
            {
                "id": "maggabox",
                "nombre": "Maggabox Linux",
                "especialidad": "almacén (espejo de GitHub cada 15 min, versiones, respaldos cifrados), sin claves en claro por ser nodo público",
                "relevo": "nubes-efimeras",
                "canales": CANALES_DIRECCION.copy(),
                "latido": None,
                "nota_claves": "no recibe claves; solo réplica de estado sin secretos",
            },
            {
                "id": "nubes-efimeras",
                "nombre": "Nubes efímeras (GitHub Actions, Cloudroom)",
                "especialidad": "GitHub Actions, Cloudroom: solo trabajo sin secretos de Alex",
                "relevo": "mac",
                "canales": CANALES_DIRECCION.copy(),
                "latido": None,
                "nota_claves": "no reciben claves ni secretos; solo trabajo sin secretos",
            },
        ],
        "arriendos": {canal: {"medio": "mac", "desde": datetime.now().astimezone().isoformat()} for canal in CANALES_DIRECCION},
        "replicas": {},
        "mensajes": {canal: [] for canal in CANALES_DIRECCION},
        "version": 1,
    }
 
 
def actualizar_latido(registro: Dict[str, Any], medio_id: str, ahora: datetime) -> Dict[str, Any]:
    """Actualiza el latido de un medio. Devuelve registro nuevo (no muta)."""
    medios = []
    for m in registro.get("medios", []):
        if m["id"] == medio_id:
            medios.append({**m, "latido": ahora.isoformat()})
        else:
            medios.append(m)
    return {**registro, "medios": medios}
 
 
def edad_latido_min(registro: Dict[str, Any], medio_id: str, ahora: datetime) -> Optional[float]:
    """Minutos desde el último latido del medio; None si nunca hubo latido."""
    medio = next((m for m in registro.get("medios", []) if m["id"] == medio_id), None)
    if not medio:
        return None
    d = _fecha(medio.get("latido"))
    if d is None:
        return None
    return max(0.0, (ahora - d).total_seconds() / 60)
 
 
def quien_releva(medio_id: str) -> Optional[str]:
    """Devuelve el medio que releva al dado, según ORDEN_RELEVO."""
    try:
        idx = ORDEN_RELEVO.index(medio_id)
        return ORDEN_RELEVO[(idx + 1) % len(ORDEN_RELEVO)]
    except ValueError:
        return None
 
 
def debe_relevar(registro: Dict[str, Any], medio_id: str, ahora: datetime, umbral_min: float = UMBRAL_LATIDO_MIN) -> Tuple[bool, Optional[str]]:
    """¿Hay que relevar este medio? Devuelve (sí/no, quién_releva_si_sí)."""
    edad = edad_latido_min(registro, medio_id, ahora)
    if edad is None:
        return True, quien_releva(medio_id)
    if edad >= umbral_min:
        return True, quien_releva(medio_id)
    return False, None
 
 
def tomar_arriendo(registro: Dict[str, Any], medio_id: str, ahora: datetime) -> Dict[str, Any]:
    """El medio toma el arriendo de los tres canales. Devuelve registro nuevo."""
    arriendos = dict(registro.get("arriendos", {}))
    for canal in CANALES_DIRECCION:
        arriendos[canal] = {"medio": medio_id, "desde": ahora.isoformat()}
    return {**registro, "arriendos": arriendos}
 
 
def quien_tiene_arriendo(registro: Dict[str, Any], canal: str) -> Optional[str]:
    """Qué medio tiene el arriendo del canal."""
    arriendo = registro.get("arriendos", {}).get(canal)
    if isinstance(arriendo, dict):
        return arriendo.get("medio")
    return None
 
 
def relevar_y_tomar_arriendo(registro: Dict[str, Any], medio_caido: str, medio_relevo: str, ahora: datetime) -> Dict[str, Any]:
    """El medio caído es relevado por el siguiente, que toma el arriendo."""
    reg = tomar_arriendo(registro, medio_relevo, ahora)
    # Marcar el medio caído como sin latido (opcional, para auditoría)
    medios = []
    for m in reg.get("medios", []):
        if m["id"] == medio_caido:
            medios.append({**m, "estado": "caido", "relevado_por": medio_relevo, "relevado_en": ahora.isoformat()})
        else:
            medios.append(m)
    return {**reg, "medios": medios}
 
 
def recuperar_arriendo(registro: Dict[str, Any], medio_id: str, ahora: datetime) -> Dict[str, Any]:
    """El medio original recupera el arriendo al volver."""
    return tomar_arriendo(registro, medio_id, ahora)
 
 
def replicar_estado(registro: Dict[str, Any], medio_destino: str, estado: Dict[str, Any], ahora: datetime) -> Dict[str, Any]:
    """Réplica del estado de canales y olas al medio destino.
    Maggabox y nubes efímeras reciben SIN secretos.
    """
    replicas = dict(registro.get("replicas", {}))
    # Filtrar secretos si el destino no es mac ni a1
    if medio_destino in ("maggabox", "nubes-efimeras"):
        estado_limpio = {k: v for k, v in estado.items() if k != "secretos"}
    else:
        estado_limpio = estado
    replicas[medio_destino] = {**estado_limpio, "replicado_en": ahora.isoformat()}
    return {**registro, "replicas": replicas}
 
 
def recibir_mensaje(registro: Dict[str, Any], canal: str, mensaje: Dict[str, Any]) -> Dict[str, Any]:
    """Añade un mensaje al canal (cola de mensajes pendientes)."""
    mensajes = dict(registro.get("mensajes", {}))
    if canal not in mensajes:
        mensajes[canal] = []
    mensajes[canal].append(mensaje)
    return {**registro, "mensajes": mensajes}
 
 
def mensajes_pendientes(registro: Dict[str, Any], canal: str) -> List[Dict[str, Any]]:
    """Mensajes pendientes en un canal."""
    return list(registro.get("mensajes", {}).get(canal, []))
 
 
def responder_en_canal(registro: Dict[str, Any], medio_id: str, canal: str, texto: str, ahora: datetime) -> Dict[str, Any]:
    """Simula una respuesta del medio en un canal (para el simulacro)."""
    # Verificar que el medio tiene el arriendo del canal
    if quien_tiene_arriendo(registro, canal) != medio_id:
        return {"ok": False, "motivo": f"{medio_id} no tiene arriendo de {canal}"}
    # Calcular minutos desde la caída del medio anterior (simplificado)
    arriendo = registro.get("arriendos", {}).get(canal, {})
    desde_str = arriendo.get("desde")
    minutos_desde_caida = 0
    if desde_str:
        try:
            desde = _fecha(desde_str)
            if desde:
                minutos_desde_caida = (ahora - desde).total_seconds() / 60
        except Exception:
            pass
    return {
        "ok": True,
        "canal": canal,
        "medio": medio_id,
        "texto": texto,
        "ts": ahora.isoformat(),
        "minutos_desde_caida": round(minutos_desde_caida, 1),
    }
 
 
# Funciones de utilidad para tests y CLI
 
def medio_por_id(registro: Dict[str, Any], medio_id: str) -> Optional[Dict[str, Any]]:
    return next((m for m in registro.get("medios", []) if m["id"] == medio_id), None)
 
 
def todos_los_medios(registro: Dict[str, Any]) -> List[Dict[str, Any]]:
    return list(registro.get("medios", []))
 
 
def estado_general(registro: Dict[str, Any], ahora: datetime) -> Dict[str, Any]:
    """Resumen legible del estado de todos los medios."""
    resumen = {}
    for m in registro.get("medios", []):
        mid = m["id"]
        edad = edad_latido_min(registro, mid, ahora)
        toca, quien = debe_relevar(registro, mid, ahora)
        resumen[mid] = {
            "nombre": m["nombre"],
            "especialidad": m["especialidad"],
            "relevo": m["relevo"],
            "latido_hace_min": round(edad, 1) if edad is not None else None,
            "tocaria_relevar": toca,
            "relevo_por": quien,
            "tiene_arriendo": [c for c in CANALES_DIRECCION if quien_tiene_arriendo(registro, c) == mid],
        }
    return {
        "medios": resumen,
        "arriendos": {c: registro.get("arriendos", {}).get(c, {}).get("medio") for c in CANALES_DIRECCION},
        "replicas": list(registro.get("replicas", {}).keys()),
    }