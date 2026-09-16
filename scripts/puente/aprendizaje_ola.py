# -*- coding: utf-8 -*-
"""Qué se aprendió en una ola, dicho para que la siguiente sea mejor.

Módulo PURO: no toca disco, ni git, ni red. Recibe los hechos y devuelve el
texto. Por eso se puede probar entero sin un repo delante.

POR QUÉ EXISTE. Cada ola deja un informe de cierre («12 de 15 integradas») que
se lee una vez y no se vuelve a abrir. Lo que de verdad valdría para la próxima
—que un modelo falló tres de tres en tareas de interfaz, que media ola murió por
la misma causa, que un encargo era demasiado grande— se queda en el registro y
se olvida. Aquí eso se destila en unas pocas líneas que SÍ se releen, porque se
escriben en las memorias principales del proyecto, junto a las reglas.

La regla al escribir: solo se afirma lo que se puede contar. «kimi-k3 falló 3 de
3» es un hecho; «kimi-k3 es malo para interfaces» es una opinión inventada a
partir de tres casos. Aquí se escriben hechos con su número, y se deja que quien
lo lea saque la conclusión.
"""

import re

#: Estados que significan «esto entró en main».
INTEGRADAS = ("commit", "hecho")

#: Familias de causa de fallo, en orden de precedencia. La primera que encaja
#: manda: un `index.lock` dentro de un mensaje de commit fallido es un cerrojo,
#: no un «fallo genérico», y agruparlo mal es lo que hace que el mismo problema
#: parezca cinco problemas distintos cinco días seguidos.
CAUSAS = (
    ("cerrojo de git", r"index\.lock|a git process may have crashed"),
    ("se quedó sin alcance", r"alcance incompleto|faltan "),
    ("no escribió nada", r"sin_cambios|sin cambios"),
    ("los tipos no compilan", r"fallo_tsc|tsc"),
    ("pruebas en rojo", r"fallo_tests|vitest|unittest"),
    ("conflicto al integrar", r"conflicto|conflict"),
    ("el proveedor dijo que no", r"\b4(0[123]|29)\b|cuota|quota|rate.?limit"),
    ("la revisión lo rechazó", r"rechazad|bloqueante|revisión"),
    ("se colgó", r"colgado|timeout|se pasó de"),
)


def causa_de(nota, estado=""):
    """La familia a la que pertenece este fallo, dicha en llano."""
    texto = "%s %s" % (estado or "", nota or "")
    for etiqueta, patron in CAUSAS:
        if re.search(patron, texto, re.I):
            return etiqueta
    return "otra cosa"


def _plural(n, singular, plural=None):
    return "%d %s" % (n, singular if n == 1 else (plural or singular + "s"))


def resumir_ola(nombre, tareas, progreso):
    """Los números de la ola: qué entró, qué no, y por qué no.

    `tareas` son las de la cola (dicts con id/titulo); `progreso` es el
    progreso.json. Devuelve un dict con todo ya contado.
    """
    ids = [t.get("id", "") for t in (tareas or []) if t.get("id")]
    dentro, fuera = [], []
    por_causa = {}
    por_modelo = {}
    for tid in ids:
        e = (progreso or {}).get(tid) or {}
        estado = e.get("estado", "") if isinstance(e, dict) else ""
        modelo = (e.get("modelo") or "") if isinstance(e, dict) else ""
        nota = (e.get("nota") or "") if isinstance(e, dict) else ""
        # Un guion es lo que escribe el orquestador cuando la tarea murió antes de
        # elegir modelo. Tratarlo como un nombre daba la línea absurda
        # «- no integró ninguna de sus 4 tareas».
        if modelo.strip() in ("", "-", "—"):
            modelo = "sin modelo anotado"
        marca = por_modelo.setdefault(modelo, {"dentro": 0, "fuera": 0})
        if estado in INTEGRADAS:
            dentro.append(tid)
            marca["dentro"] += 1
        else:
            fuera.append({"id": tid, "estado": estado, "nota": nota, "causa": causa_de(nota, estado)})
            marca["fuera"] += 1
            por_causa.setdefault(causa_de(nota, estado), []).append(tid)
    return {
        "nombre": nombre,
        "total": len(ids),
        "dentro": dentro,
        "fuera": fuera,
        "por_causa": por_causa,
        "por_modelo": por_modelo,
    }


def observaciones(resumen, minimo_repeticiones=2):
    """Los hechos que merecen releerse, con su número al lado.

    Solo se escribe lo que se puede contar. Nada de conclusiones: si una causa
    se llevó media ola, eso se dice; qué hacer al respecto lo decide quien lee.
    """
    salida = []
    total = resumen["total"] or 1
    for causa, ids in sorted(resumen["por_causa"].items(), key=lambda kv: -len(kv[1])):
        if len(ids) < minimo_repeticiones:
            continue
        salida.append(
            "%s se fueron por lo mismo — %s (%s). Es %d %% de la ola."
            % (_plural(len(ids), "tarea"), causa, ", ".join(ids[:6]), round(100 * len(ids) / total))
        )
    for modelo, m in sorted(resumen["por_modelo"].items(), key=lambda kv: -kv[1]["fuera"]):
        intentos = m["dentro"] + m["fuera"]
        if intentos >= minimo_repeticiones and m["dentro"] == 0:
            salida.append("%s no integró ninguna de sus %s." % (modelo, _plural(intentos, "tarea")))
        elif intentos >= minimo_repeticiones and m["fuera"] == 0:
            salida.append("%s integró %s sin fallar una." % (modelo, _plural(intentos, "tarea")))
    return salida


def entrada(resumen, fecha, pedido="", notas_humanas=()):
    """La sección en markdown que se añade a la memoria de aprendizaje."""
    l = ["## %s · %s" % (fecha, resumen["nombre"]), ""]
    if pedido:
        l += ["**Lo que se pidió.** %s" % pedido.strip(), ""]
    dentro, fuera = len(resumen["dentro"]), len(resumen["fuera"])
    l.append(
        "**Resultado.** %d de %d integradas.%s"
        % (dentro, resumen["total"], "" if not fuera else " %s se quedaron fuera." % _plural(fuera, "tarea"))
    )
    l.append("")
    obs = observaciones(resumen)
    if obs:
        l.append("**Lo que se repitió** (hechos, con su número; la conclusión la sacas tú):")
        l += ["- %s" % o for o in obs]
        l.append("")
    if fuera:
        l.append("**Lo que quedó fuera, una por una:**")
        for f in resumen["fuera"]:
            detalle = (f["nota"] or "").strip().replace("\n", " ")[:140]
            l.append("- `%s` — %s%s" % (f["id"], f["causa"], (": %s" % detalle) if detalle else ""))
        l.append("")
    for n in notas_humanas or ():
        if n and n.strip():
            l.append("**Nota.** %s" % n.strip())
            l.append("")
    return "\n".join(l).rstrip() + "\n"
