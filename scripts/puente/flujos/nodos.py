"""Nodos de acción de los Flujos de Genesis (contrato §3).

Cada nodo es una función ``(params, items, ctx) -> items``. Todo lo externo
llega por ``ctx``: ``http``, ``telegram``, ``chat``, ``llamar_modelo``,
``consultar_lote``, ``conocimiento``, ``env`` (nombres de variable → valor),
``nodos`` (salidas por id, para ``$nodo``), ``ahora`` y ``dormir``.
Las credenciales son SIEMPRE nombres de variables de ``~/.starseed/env``;
nunca un valor.
"""

from __future__ import annotations

from typing import Any

from .expresiones import evaluar, resolver

Items = list[dict[str, Any]]
Params = dict[str, Any]
Ctx = dict[str, Any]


def _contexto(item: dict[str, Any], ctx: Ctx) -> dict[str, Any]:
    return {
        "$json": item,
        "$nodo": ctx.get("nodos", {}),
        "$ahora": ctx.get("ahora", ""),
    }


def _resolver_item(valor: Any, item: dict[str, Any], ctx: Ctx) -> Any:
    return resolver(valor, _contexto(item, ctx))


def _requerido(ctx: Ctx, nombre: str) -> Any:
    funcion = ctx.get(nombre)
    if not callable(funcion):
        raise ValueError(f"El nodo necesita ctx[{nombre!r}] para hablar con el exterior")
    return funcion


def _cabeceras_con_credencial(params: Params, item: dict[str, Any], ctx: Ctx) -> dict[str, Any]:
    cabeceras = dict(_resolver_item(params.get("cabeceras", {}), item, ctx) or {})
    credencial = params.get("credencial")
    if credencial:
        valor = (ctx.get("env") or {}).get(credencial)
        if not valor:
            raise ValueError(f"La variable de entorno {credencial!r} no tiene valor")
        cabeceras.setdefault("Authorization", f"Bearer {valor}")
    return cabeceras


def nodo_http(params: Params, items: Items, ctx: Ctx) -> Items:
    """HTTP genérico: método, url, cabeceras, cuerpo; credencial por nombre."""
    http = _requerido(ctx, "http")
    salida: Items = []
    for item in items:
        metodo = str(_resolver_item(params.get("metodo", "GET"), item, ctx)).upper()
        url = _resolver_item(params.get("url", ""), item, ctx)
        respuesta = http(metodo, url, cabeceras=_cabeceras_con_credencial(params, item, ctx),
                         cuerpo=_resolver_item(params.get("cuerpo"), item, ctx))
        salida.append({**item, "respuesta": respuesta})
    return salida


def nodo_ntfy(params: Params, items: Items, ctx: Ctx) -> Items:
    """Aviso a ntfy con el mismo cliente http (sin dependencias nuevas)."""
    http = _requerido(ctx, "http")
    salida: Items = []
    for item in items:
        tema = _resolver_item(params.get("tema", ""), item, ctx)
        servidor = (ctx.get("env") or {}).get(params.get("servidor_env", "")) or "https://ntfy.sh"
        cabeceras = {k: v for k, v in {
            "Title": _resolver_item(params.get("titulo", ""), item, ctx),
            "Priority": str(params.get("prioridad", "")),
        }.items() if v}
        http("POST", f"{servidor}/{tema}", cabeceras=cabeceras,
             cuerpo=_resolver_item(params.get("mensaje", ""), item, ctx))
        salida.append(item)
    return salida


def nodo_telegram(params: Params, items: Items, ctx: Ctx) -> Items:
    """Mensaje de Telegram por telegram-puente.py, inyectado como ctx['telegram']."""
    telegram = _requerido(ctx, "telegram")
    for item in items:
        telegram(chat_id=_resolver_item(params.get("chat_id", ""), item, ctx),
                 texto=_resolver_item(params.get("texto", ""), item, ctx))
    return items


def nodo_chat_director(params: Params, items: Items, ctx: Ctx) -> Items:
    """Publica en el Chat Director a través de ctx['chat'] (director_chat.publicar)."""
    chat = _requerido(ctx, "chat")
    for item in items:
        chat(texto=_resolver_item(params.get("texto", ""), item, ctx),
             de=params.get("de", "flujos"), canal=params.get("canal", "mando"),
             tipo=params.get("tipo", "informe"))
    return items


def nodo_ia(params: Params, items: Items, ctx: Ctx) -> Items:
    """Modelo de IA por pasarela gratuita.

    - Sin ``tipado``: llama a ``ctx['llamar_modelo'](prompt)`` y guarda el texto.
    - Con ``tipado`` (dict id → {tipo, pregunta, opciones?, niveles?}): UNA llamada
      a ``decidir.consultar_lote`` por ítem; cada respuesta va a ``item[id]`` y las
      no contestadas por Jev NO aparecen (quien llama aplica su regla).
    """
    tipado = params.get("tipado")
    salida: Items = []
    if tipado:
        consultar = ctx.get("consultar_lote")
        if not callable(consultar):
            from scripts.puente import decidir
            consultar = decidir.consultar_lote
        for item in items:
            estado = {k: resolver(v, _contexto(item, ctx)) for k, v in params.get("estado", {}).items()}
            preguntas = {qid: {**q, "pregunta": _resolver_item(q.get("pregunta", ""), item, ctx)}
                         for qid, q in tipado.items()}
            resultado = consultar(estado, preguntas, quien=params.get("quien", "flujos"))
            salida.append({**item, **(resultado or {}).get("respuestas", {})})
        return salida
    llamar = _requerido(ctx, "llamar_modelo")
    campo = params.get("campo", "respuesta_ia")
    for item in items:
        salida.append({**item, campo: llamar(_resolver_item(params.get("prompt", ""), item, ctx))})
    return salida


def nodo_conocimiento(params: Params, items: Items, ctx: Ctx) -> Items:
    """Recupera fragmentos de una base de conocimiento (FLU1005E)."""
    conocimiento = _requerido(ctx, "conocimiento")
    base = params.get("base", "")
    k = int(params.get("k", 5))
    campo = params.get("campo", "fragmentos")
    return [{**item, campo: conocimiento(base, _resolver_item(params.get("consulta", ""), item, ctx), k)}
            for item in items]


def nodo_si(params: Params, items: Items, ctx: Ctx) -> Items:
    """Condición: devuelve solo los ítems cuya expresión es verdadera."""
    condicion = params.get("condicion", "cierto")
    return [item for item in items
            if bool(evaluar(str(condicion), _contexto(item, ctx)))]


def nodo_switch(params: Params, items: Items, ctx: Ctx) -> Items:
    """Switch: anota cada ítem con el caso que coincide ('por_defecto' si ninguno)."""
    expresion = str(params.get("expresion", ""))
    casos = params.get("casos", {})
    campo = params.get("campo", "caso")
    salida: Items = []
    for item in items:
        valor = evaluar(expresion, _contexto(item, ctx))
        salida.append({**item, campo: casos.get(str(valor), casos.get("por_defecto", "por_defecto"))
                       if isinstance(casos, dict) else "por_defecto"})
    return salida


def nodo_fusion(params: Params, items: Items, ctx: Ctx) -> Items:
    """Fusión: 'concatenar' deja los ítems como llegan; 'parear' une de dos en dos."""
    if params.get("modo", "concatenar") == "parear":
        return [{**a, **b} for a, b in zip(items[::2], items[1::2])]
    return items


def nodo_set(params: Params, items: Items, ctx: Ctx) -> Items:
    """Set: fija campos con plantillas; 'conservar' mantiene el ítem original."""
    campos = params.get("campos", {})
    conservar = bool(params.get("conservar", False))
    salida: Items = []
    for item in items:
        nuevos = {k: _resolver_item(v, item, ctx) for k, v in campos.items()}
        salida.append({**item, **nuevos} if conservar else nuevos)
    return salida


def nodo_esperar(params: Params, items: Items, ctx: Ctx) -> Items:
    """Espera 'ms' milisegundos con ctx['dormir'] (inyectable) o time.sleep."""
    ms = int(params.get("ms", 0))
    if ms > 0:
        dormir = ctx.get("dormir")
        if callable(dormir):
            dormir(ms)
        else:
            import time
            time.sleep(ms / 1000)
    return items


NODOS: dict[str, Any] = {
    "http": nodo_http,
    "ntfy": nodo_ntfy,
    "telegram": nodo_telegram,
    "chat_director": nodo_chat_director,
    "ia": nodo_ia,
    "conocimiento": nodo_conocimiento,
    "si": nodo_si,
    "switch": nodo_switch,
    "fusion": nodo_fusion,
    "set": nodo_set,
    "esperar": nodo_esperar,
}
