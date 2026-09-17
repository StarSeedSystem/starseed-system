# -*- coding: utf-8 -*-
"""¿Puede esta tarea resolverse sola, o tiene que verla Alex?

QUÉ PIDIÓ ALEX (2026-09-16, 23:30)
----------------------------------
«En "Esperando tu visto bueno", agrega un ajuste de un switch para resolución
automática con la supervisión del director y verificadores (encendido por
defecto).»

Las dos supervisiones no son adorno: son las CONDICIONES. Una tarea se resuelve
sola solo si las tres cosas se cumplen a la vez:

  1. el interruptor está encendido (y lo está por defecto);
  2. los VERIFICADORES no pusieron ninguna pega — la revisión no es bloqueante
     y no falta ningún archivo del alcance;
  3. el DIRECTOR (el analista de aprobación) dice «aprobar» con confianza alta.

Si cualquiera falla, la tarea se queda esperando a Alex, exactamente como hoy.
El interruptor solo puede hacer que una tarea LIMPIA no tenga que esperar seis
horas a que alguien mire; nunca puede colar una sucia.

UNA COSA QUE CONVIENE SABER
---------------------------
`analisis_aprobacion.py` —el director que emite ese veredicto— existe desde la
Ola 320, con sus pruebas… y NO LO LLAMABA NADIE. Un `grep` lo dice en una
línea: solo aparecía en sus propios tests y en archivos `.pyc`. Es la tercera
pieza que encuentro hoy escrita, probada y sin cablear (antes fueron
`_liberar_429` y el salvavidas de las ramas). Escribir la pieza es la mitad del
trabajo; la otra mitad es enchufarla, y es la que se olvida.

POR QUÉ ENCENDIDO POR DEFECTO
-----------------------------
Porque el coste de los dos errores no es el mismo. Si se queda esperando algo
que podía pasar, se pierden horas de una rama lista. Si aprueba algo que no
debía, se revierte con un commit — y para llegar ahí tiene que haber engañado
al revisor Y al analista Y haber pasado las cuatro puertas. El estado por
defecto debe ser el que menos trabajo bueno tira.

Todo aquí es puro: diccionarios y texto, sin disco, sin red, sin reloj.
"""

#: La llave del interruptor en `~/.starseed/enjambre.json`.
LLAVE = "resolucionAutomatica"

#: Quién consta como autor de la decisión. No se dice «desde el Mando»: el que
#: lea esto mañana tiene que poder distinguir a Alex de un automatismo.
QUIEN = "director y verificadores"


def encendida(ajustes):
    """¿Está encendido el interruptor? Por defecto SÍ.

    Un archivo que no existe, no se entiende o no menciona la llave cuenta como
    encendido: es el estado por defecto, no una ausencia de opinión.
    """
    if not isinstance(ajustes, dict):
        return True
    valor = ajustes.get(LLAVE)
    if valor is None:
        return True
    return bool(valor)


def verificadores_conformes(ficha):
    """¿Dejaron pasar los verificadores esta rama, sin peros?

    Dos peros posibles, y los dos pesan igual:
      · la revisión es BLOQUEANTE — alguien vio algo que rompe;
      · el alcance está incompleto — la tarea no tocó lo que prometía.

    Un «respondio» del revisor no es un «aprobó», pero tampoco es una pega:
    basta con que no haya marcado bloqueante. Quedarse sin revisor vivo tampoco
    bloquea; eso ya lo decidió el flujo de siempre.
    """
    if not isinstance(ficha, dict):
        return False
    if ficha.get("bloqueante"):
        return False
    if (ficha.get("revisor") or "") == "bloqueante":
        return False
    if list(ficha.get("faltan") or []):
        return False
    return True


def decidir(ajustes, ficha, veredicto, puede_aprobar_solo):
    """(accion, motivo) — «aprobar» o «esperar», y por qué, en una frase.

    `puede_aprobar_solo` es la función de `analisis_aprobacion`, que se pasa
    como argumento para que esto siga siendo puro y comprobable sin importar
    nada. Ahí vive la regla del director: aprobar + confianza alta + ficha verde.
    """
    if not encendida(ajustes):
        return "esperar", "resolución automática apagada en Ajustes: decide Alex"

    if not verificadores_conformes(ficha):
        if (ficha or {}).get("bloqueante") or (ficha or {}).get("revisor") == "bloqueante":
            return "esperar", "los verificadores marcaron la revisión como bloqueante"
        faltan = list((ficha or {}).get("faltan") or [])
        if faltan:
            return "esperar", "alcance incompleto: faltan " + ", ".join(str(x) for x in faltan[:4])
        return "esperar", "los verificadores no dieron su conformidad"

    if not isinstance(veredicto, dict):
        return "esperar", "el director no devolvió un veredicto legible"

    if puede_aprobar_solo(veredicto, True):
        razones = [str(r) for r in (veredicto.get("razones") or [])][:2]
        cola = (": " + "; ".join(razones)) if razones else ""
        return "aprobar", "director y verificadores conformes, confianza alta" + cola

    v = veredicto.get("veredicto") or "?"
    c = veredicto.get("confianza") or "?"
    return "esperar", "el director dice «%s» con confianza %s: la mira Alex" % (v, c)


def nota(accion, motivo):
    """La línea que verá Alex en el Mando, que no se hace pasar por él."""
    if accion == "aprobar":
        return "resuelta automáticamente por %s — %s" % (QUIEN, motivo)
    return "esperando tu visto bueno — %s" % motivo
