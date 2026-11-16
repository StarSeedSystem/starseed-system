# -*- coding: utf-8 -*-
"""flota_opcional · módulo puro para agregar modelos opcionales a la flota
(abliteration.ai y modo privado), siempre al final, nunca al principio.

(2026-11-16, MOD1116 · PROPUESTA) Alex: «agregar abliteration.ai y el modelo
privado siempre al final de la rotación; nunca como escritor ni revisor de código».
"""

from __future__ import annotations

from datetime import datetime


def agregar_opcionales(lista, rol, entorno, estado_abliteration, estado_privado, ahora_iso):
    """Agrega modelos opcionales al final de la lista si las condiciones lo permiten.

    La lista de entrada nunca se muta. Se devuelve (nueva_lista, motivos) donde
    motivos es una lista de razones de los opcionales que no se agregaron.

    Roles permitidos para opcionales: sueno-mapa, sueno-reduce, sueno-contraste,
    sintesis, direccion. Ningún opcional entra en roles 'escritor' o 'revisor'.

    Rules:
    - ("abliteration","abliterated-model"): entra solo si STARSEED_ABLITERATION=1
      y abliteration_creditos.permitido da ok.
    - ("privado",etiqueta): entra solo si estado_privado.vivo es True y la lectura
      es de menos de 10 minutos, y NUNCA en el rol "direccion".
    """
    # --- Roles de escritura/revisión: nunca aceptan opcionales ---
    if rol in ("escritor", "revisor"):
        return list(lista), ["rol de escritura/revisión: no se agregan opcionales"]

    # --- Roles que sí pueden recibir opcionales ---
    roles_permitidos = {
        "sueno-mapa",
        "sueno-reduce",
        "sueno-contraste",
        "sintesis",
        "direccion",
    }
    if rol not in roles_permitidos:
        return list(lista), [f"rol {rol} no acepta opcionales"]

    nueva_lista = list(lista)
    motivos = []

    # ---------------------------
    # 1. Verificar abliteration
    # ---------------------------
    starseed_ablit = (
        isinstance(entorno, dict) and entorno.get("STARSEED_ABLITERATION", "0") == "1"
    )

    ablit_permitido = (
        isinstance(estado_abliteration, dict)
        and estado_abliteration.get("permitido", False) is True
    )

    if starseed_ablit and ablit_permitido:
        nueva_lista.append(("abliteration", "abliterated-model"))
    else:
        razones = []
        if not starseed_ablit:
            razones.append("STARSEED_ABLITERATION=no activo")
        if not ablit_permitido:
            razones.append("créditos abliteration no permitidos")
        if razones:
            motivos.append("abliteration: " + "; ".join(razones))
        else:
            motivos.append("abliteration: condiciones no satisfechas")

    # ---------------------------
    # 2. Verificar privado
    # ---------------------------
    # NUNCA en rol "direccion"
    if rol == "direccion":
        motivos.append("privado: no permitido en rol direccion")
    else:
        vivo = (
            isinstance(estado_privado, dict) and estado_privado.get("vivo", False) is True
        )
        if vivo:
            ultima = (
                estado_privado.get("ultima_lectura")
                if isinstance(estado_privado, dict)
                else None
            )
            if ultima:
                try:
                    ahora_dt = datetime.fromisoformat(ahora_iso)
                    lectura_dt = datetime.fromisoformat(ultima)
                    diferencia = (ahora_dt - lectura_dt).total_seconds()
                    if diferencia < 600:  # 10 minutos = 600 seg
                        nueva_lista.append(("privado", "lectura"))
                    else:
                        motivos.append("privado: lectura vieja (más de 10 min)")
                except Exception:
                    motivos.append("privado: error al parsear fechas")
            else:
                motivos.append("privado: sin registro de lectura")
        else:
            motivos.append("privado: estado no vivo")

    return nueva_lista, motivos