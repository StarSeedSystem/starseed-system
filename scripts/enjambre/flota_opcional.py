# -*- coding: utf-8 -*-
"""flota_opcional · Módulo puro para añadir proveedores opcionales a la flota de análisis.

Este módulo NO hace red, ni reloj, ni entorno: todo se inyecta por parámetros.
"""

from __future__ import annotations

from typing import Any


ROLES_ESCRITURA = {"escritor", "revisor"}
ROLES_ANALISIS = {"sueno-mapa", "sueno-reduce", "sueno-contraste", "sintesis", "direccion"}
TODOS_ROLES = ROLES_ESCRITURA | ROLES_ANALISIS


def agregar_opcionales(
    lista: list[tuple[str, str]],
    rol: str,
    entorno: dict[str, str],
    estado_abliteration: dict[str, Any] | None,
    estado_privado: dict[str, Any] | None,
    ahora_iso: str,
) -> tuple[list[tuple[str, str]], list[str]]:
    """Devuelve la lista con opcionales AL FINAL y los motivos de los que se quedaron fuera.

    Args:
        lista: Pares (proveedor, modelo) base (p. ej. MAP_RAPIDOS). NO se muta.
        rol: Uno de "sueno-mapa", "sueno-reduce", "sueno-contraste", "sintesis", "direccion",
             "escritor", "revisor".
        entorno: Variables de entorno relevantes (p. ej. {"STARSEED_ABLITERATION": "1"}).
        estado_abliteration: Dict con clave "permitido" (bool) y opcionalmente "motivo" (str),
                             o None si no se pudo leer.
        estado_privado: Dict con claves "vivo" (bool), "lectura_iso" (str|None), "etiqueta" (str),
                        o None si no hay modelo privado.
        ahora_iso: Instante actual en ISO 8601 (UTC) para comparar la antigüedad de la lectura.

    Returns:
        Tupla (lista_con_opcionales, motivos_fuera).
        - lista_con_opcionales: lista original + opcionales que cumplen condiciones, al final.
        - motivos_fuera: una entrada por opcional que NO entró, con el motivo.
    """
    if rol not in TODOS_ROLES:
        return list(lista), [f"rol desconocido: {rol}"]

    # Roles de escritura/revisión de código: nunca añaden opcionales
    if rol in ROLES_ESCRITURA:
        return list(lista), []

    fuera: list[str] = []
    resultado = list(lista)

    # Opcional 1: abliteration.ai
    ablit_flag = entorno.get("STARSEED_ABLITERATION", "0") == "1"
    ablit_permitido = False
    ablit_motivo = "sin estado"
    if estado_abliteration is not None:
        ablit_permitido = bool(estado_abliteration.get("permitido", False))
        ablit_motivo = str(estado_abliteration.get("motivo", "permitido=false"))
    if ablit_flag and ablit_permitido:
        resultado.append(("abliteration", "abliterated-model"))
    else:
        motivos = []
        if not ablit_flag:
            motivos.append("STARSEED_ABLITERATION!=1")
        if not ablit_permitido:
            motivos.append(f"creditos: {ablit_motivo}")
        fuera.append("abliteration: " + "; ".join(motivos))

    # Opcional 2: modelo privado del A1
    privado_vivo = False
    privado_etiqueta = "privado"
    privado_lectura_iso = None
    privado_motivo = "sin estado"
    if estado_privado is not None:
        privado_vivo = bool(estado_privado.get("vivo", False))
        privado_etiqueta = str(estado_privado.get("etiqueta", "privado"))
        privado_lectura_iso = estado_privado.get("lectura_iso")
        privado_motivo = str(estado_privado.get("motivo", "vivo=false"))

    if privado_vivo and privado_lectura_iso:
        # Verificar que la lectura es de menos de 10 minutos (600 segundos)
        try:
            from datetime import datetime, timezone

            ahora = datetime.fromisoformat(ahora_iso.replace("Z", "+00:00"))
            lectura = datetime.fromisoformat(privado_lectura_iso.replace("Z", "+00:00"))
            diff_s = (ahora - lectura).total_seconds()
            reciente = diff_s < 600
        except Exception:
            reciente = False
            privado_motivo = "lectura_iso inválida"
    else:
        reciente = False

    if rol != "direccion" and privado_vivo and reciente:
        resultado.append(("privado", privado_etiqueta))
    else:
        motivos = []
        if rol == "direccion":
            motivos.append("rol=direccion (no puede esperar minutos)")
        if not privado_vivo:
            motivos.append(f"privado: {privado_motivo}")
        if not reciente:
            motivos.append("lectura > 10 min o inválida")
        fuera.append("privado: " + "; ".join(motivos))

    return resultado, fuera


def _parse_iso(iso: str):
    """Helper para tests: parsea ISO 8601 a datetime aware UTC."""
    from datetime import datetime, timezone

    return datetime.fromisoformat(iso.replace("Z", "+00:00"))