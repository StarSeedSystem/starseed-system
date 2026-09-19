"""importancia · qué merece sonar en el móvil de Alex y qué no.

Por qué existe (2026-09-16). Alex: «reduce las notificaciones del de telegram que son
demasiadas, y que solo envíe las más importantes inteligentemente». Tenía razón: el puente
reenviaba CADA línea del canal común, y el canal es la contabilidad interna del enjambre.
En una hora normal eso son decenas de «sin cambios con X → sigo con otro proveedor»,
«reenrutado», «estancado», «worktree y rama conservados»… ruido que además ENTIERRA lo que
sí importa. Una notificación que nunca se lee es peor que ninguna: enseña a ignorarlas.

La regla: **suena lo que exige una decisión o cambia el rumbo.** El resto se resume o se
calla. Nada se pierde — todo sigue en el canal, que se puede leer cuando se quiera.

Módulo PURO: entra una línea del canal, sale un veredicto.
"""

# Suena siempre: o pide algo de Alex, o es un hecho que cambia el estado del mundo.
SIEMPRE = (
    # (2026-09-19) Alex: «solo mensajes importantes y funcionales: avisos de
    # nuevas olas, procesos que requieran aprobación o sugerencias relevantes,
    # siempre con el contexto actualizado». Esto es esa lista, y nada más.
    "trabajadores · medios sincronizados",   # arranca una ola nueva
    "espera tu visto bueno",                 # le toca decidir a él
    "resuelta automáticamente por",          # el director decidió por él: que lo sepa
    "rechazo automático",                    # el desatascador ejecutó un veredicto
    "publicado",                             # salió a origin
    "dream",                                 # sugerencias del análisis nocturno
    "sugerencia",
    "ninguna pasarela escribe",              # el enjambre no puede trabajar
    "no arranco",                            # el orquestador se plantó
    "integrado pero no aplicado",            # trabajo que parece hecho y no lo está
)

# No suena nunca: contabilidad del enjambre. Sigue en el canal.
NUNCA = (
    "integrado en main",             # una tarea más: va al resumen de media hora
    "sin cupo hasta",                # el enjambre ya lo aparta solo; no hace falta avisar
    "latido",
    "sin cambios con",
    "reenrutado",
    "estancado",
    "worktree y rama conservados",
    "empiezo por otro modelo",
    "arriendo tomado",
    "revisores saltados",
    "cerrojo huérfano",
    "aprendizaje de la ola",
    "entró a la tanda",
    "recogí mi propia contabilidad",
    "aparto por estado de la pasarela",
)

# Tipos de evento que, por sí solos, merecen sonar.
TIPOS_FUERTES = ("error", "fallo", "publicacion", "aprobacion")


def _texto(linea):
    return str((linea or {}).get("texto") or "").lower()


def suena(linea):
    """¿Esta línea del canal merece una notificación en el móvil?

    El orden importa: SIEMPRE gana sobre NUNCA, porque una frase puede llevar las dos
    («sin cupo hasta…» dentro de un aviso de rotación) y en la duda manda lo que pide
    una decisión.
    """
    t = _texto(linea)
    if not t:
        return False
    for clave in SIEMPRE:
        if clave in t:
            return True
    for clave in NUNCA:
        if clave in t:
            return False
    return str((linea or {}).get("tipo") or "").lower() in TIPOS_FUERTES


def resumir_callados(lineas):
    """Una sola frase para todo lo que se calló, o cadena vacía si no hubo nada.

    Que no suene no significa que no haya pasado. Cada cierto rato conviene decir
    «han pasado estas cosas y ninguna te necesitaba», que es información y no ruido.
    """
    cuenta = {}
    for l in lineas or []:
        if suena(l):
            continue
        t = _texto(l)
        for clave in NUNCA:
            if clave in t:
                cuenta[clave] = cuenta.get(clave, 0) + 1
                break
    if not cuenta:
        return ""
    partes = ["%d × %s" % (n, c) for c, n in sorted(cuenta.items(), key=lambda kv: -kv[1])[:4]]
    total = sum(cuenta.values())
    return "En silencio: %d avisos de rutina (%s)." % (total, ", ".join(partes))


def filtrar(lineas):
    """(las_que_suenan, resumen_de_las_calladas)."""
    fuertes = [l for l in (lineas or []) if suena(l)]
    return fuertes, resumir_callados(lineas)
