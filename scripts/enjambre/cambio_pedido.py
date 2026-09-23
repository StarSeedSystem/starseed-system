# -*- coding: utf-8 -*-
"""El cambio que se pide desde el Puente LLEGA al agente. Puro, sin IO.

(2026-09-23) Alex: «en el medidor de bloqueadas falta la opción de reintentar con cambios
automáticamente». Al ir a probarlo apareció algo peor: el Mando escribía `cambio_pedido` en
progreso.json con «Reintentar con un cambio»… y NADIE lo leía. Ni el orquestador ni el
reparto a la nube. La tarea volvía a la cola con su prompt de siempre —exactamente lo que
el botón decía que NO iba a pasar— y, si esperaba a una dependencia muerta, el orquestador
la volvía a bloquear en la primera vuelta. El botón existía desde hacía días y nunca había
cambiado nada.

Aquí se aplica, en un solo sitio y para los dos caminos (Mac y nube):
  · `cambio_pedido` → se añade al final del prompt, marcado, una sola vez;
  · `quitar_dependencias` → esas dependencias salen de `depende` (las que el Puente ya
    comprobó que no van a llegar).
La tarea original no se toca: se devuelve una copia.
"""

MARCA = "CAMBIO PEDIDO DESDE EL PUENTE"


def aplicar_cambio_pedido(tarea, entrada):
    """Devuelve la tarea con el cambio pedido aplicado (o la misma si no hay nada que aplicar)."""
    if not isinstance(tarea, dict):
        return tarea
    entrada = entrada if isinstance(entrada, dict) else {}
    cambio = str(entrada.get("cambio_pedido") or "").strip()
    quitar = [str(d) for d in (entrada.get("quitar_dependencias") or []) if str(d).strip()]
    if not cambio and not quitar:
        return tarea
    nueva = dict(tarea)
    if cambio:
        prompt = str(nueva.get("prompt") or "")
        if MARCA not in prompt:
            nueva["prompt"] = (
                prompt.rstrip()
                + "\n\n%s (este intento es un reintento; lo que falló la vez anterior se "
                "corrige así):\n%s" % (MARCA, cambio)
            ).lstrip()
    if quitar:
        for clave in ("depende", "dependencias"):
            if isinstance(nueva.get(clave), list):
                nueva[clave] = [d for d in nueva[clave] if str(d) not in quitar]
    return nueva


def aplicar_a_todas(tareas, progreso):
    """La misma regla sobre una lista: lo que usan el orquestador y el reparto a la nube."""
    progreso = progreso if isinstance(progreso, dict) else {}
    return [
        aplicar_cambio_pedido(t, progreso.get(t.get("id"))) if isinstance(t, dict) else t
        for t in (tareas or [])
    ]
