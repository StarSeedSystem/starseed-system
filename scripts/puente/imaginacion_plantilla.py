# -*- coding: utf-8 -*-
"""imaginacion_plantilla · la MISMA plantilla de propuesta para todos los agentes de Imaginación (IMG1102B).

Medido el 2026-11-01: de 728 propuestas, 0 aprobadas. Las mejores (agentes/diaria, utilidad 0,6-0,83) citaban
archivos que no existen (3 de 12 existían), repetían familias («Candidata al catálogo…» ×20, «Publicar los N
commits» ×6) o venían sin criterio de aceptación. Aquí van la plantilla y los helpers puros; el contexto medido
que la acompaña lo arma `imaginacion_contexto.py`. Sin disco, sin red, sin dependencias."""
import re

PLANTILLA = (
    "## Plantilla de propuesta (la misma para todos; úsala como estructura del `cuerpo`)\n"
    "1. Título: concreto (qué cambia y dónde), ≤ 90 caracteres.\n"
    "2. Problema: lo medido (cifra y fecha) o la petición de Alex que lo origina.\n"
    "3. Evidencia: `archivo:línea` que veas o la medida con su fuente; nada citado de memoria.\n"
    "4. Archivos: solo los que existen (ver «Archivos» del contexto); los que crearías, marcados «(nuevo)».\n"
    "5. Criterio de aceptación: una comprobación verificable (prueba, comando o resultado visible).\n"
    "6. Coste: ≤ 3 archivos y ≤ 120 líneas por archivo; si es más, pártela.\n"
    "7. Riesgo: qué puede romper y cómo se deshace.\n"
    "NO propongas si ya existe la familia (ver «Familias ya propuestas»), si la cita ya no sigue en el código "
    "o si solo Alex puede hacerlo (publicar, pagar, claves).")
#: Misma plantilla en una línea numerada: el Dream escribe «N. **Título** — cuerpo» y `dream_a_cola.puntos` lo lee así.
PLANTILLA_LINEA = (
    "FORMATO DE CADA ÍTEM (una línea numerada; la misma plantilla en todas las propuestas): "
    "«N. **Título concreto** — problema medido o petición de Alex; evidencia archivo:línea real; archivos que existen "
    "((nuevo) si los crearías); aceptación: comprobación verificable; coste: ≤ 3 archivos y ≤ 120 líneas por archivo; "
    "riesgo y cómo se deshace; impacto N · esfuerzo N». No propongas lo que ya figure en «Familias ya propuestas» "
    "ni lo que solo Alex pueda hacer (publicar, pagar, claves).")


def limpio(texto, n):
    return " ".join(str(texto or "").split())[:n]


def familia(titulo):
    """Las 3 primeras palabras del título antes de «:» o «(»: «Publicar los 59 commits…» y «…140 commits…» son una."""
    t = re.split(r"[:(]", re.sub(r"[`'\"“”]", "", str(titulo or "").lower()))[0]
    return " ".join(re.findall(r"[a-záéíóúñü]+", t)[:3])


def area_de(tarea):
    """El área de una tarea de cola: su campo `area` o, si no, la carpeta de su primer archivo."""
    p = str(((tarea or {}).get("archivos") or ["sin-archivos"])[0]).split("/")
    return str((tarea or {}).get("area") or (p[2] if p[0] == "src" and len(p) > 3 else p[0]))


def fecha_de(propuesta):
    return (propuesta.get("origen") or {}).get("fecha") or str(propuesta.get("t") or "")[:10]


def distintas(ps, clave, n=3):
    """Hasta `n` con `clave` distinta, en el orden dado."""
    vistas = {}
    for p in ps:
        vistas.setdefault(clave(p), p)
    return list(vistas.values())[:n]


def archivos_reales(crudas, existe, topes=(10, 5)):
    """(existen, no existen) entre las rutas citadas; los guiones tipográficos (‑ – —) cuentan como «-» y las URL no son rutas."""
    citadas = dict.fromkeys(re.sub(r"[‐-―−]", "-", str(r).strip().lstrip("./")) for r in crudas if r and "://" not in str(r))
    return [r for r in citadas if existe(r)][:topes[0]], [r for r in citadas if not existe(r)][:topes[1]]
