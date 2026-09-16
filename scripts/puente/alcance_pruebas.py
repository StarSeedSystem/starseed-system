"""alcance_pruebas · qué pruebas tiene que correr la puerta, además de las de siempre.

Por qué existe (2026-09-16). La puerta de pruebas del enjambre corre, fija:

    npx vitest run src/lib/__tests__

Eso son 87 archivos de los 164 que tiene el repo. Todo lo que vive fuera de esa
carpeta —`src/lib/network/*.test.ts`, `src/components/**/__tests__/*`— NO es
puerta: puede entrar en rojo y nadie se entera. Pasó: PS8 (commit 8e6d37f2,
15/09 23:33) integró `src/lib/network/culture-discovery.test.ts` con una
aserción en rojo, y esa prueba bloqueó TODAS las publicaciones durante quince
horas sin que ninguna puerta lo dijera.

La regla que sale de ahí: **una tarea tiene que pasar por las pruebas que ella
misma toca.** Este módulo no ejecuta nada; solo dice qué archivos de prueba hay
que sumar al comando, mirando el diff de la tarea.

Módulo PURO: entran rutas y una función `existe`, sale una lista de rutas.
"""

BASE = "src/lib/__tests__"
SUFIJOS_PRUEBA = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")
# Fuentes de las que tiene sentido buscar una prueba hermana.
SUFIJOS_FUENTE = (".ts", ".tsx")


def es_prueba(ruta):
    """¿Esta ruta es un archivo de pruebas?"""
    return bool(ruta) and ruta.endswith(SUFIJOS_PRUEBA)


def _hermanas(ruta):
    """Rutas donde suele vivir la prueba de una fuente, de la más probable abajo.

    Convenciones del repo: `c.test.ts` al lado, o `__tests__/c.test.ts` dentro de
    la misma carpeta.
    """
    for sufijo in SUFIJOS_FUENTE:
        if not ruta.endswith(sufijo):
            continue
        tronco = ruta[: -len(sufijo)]
        carpeta, _, nombre = tronco.rpartition("/")
        salida = [tronco + ".test.ts", tronco + ".test.tsx"]
        if carpeta:
            salida += [
                "%s/__tests__/%s.test.ts" % (carpeta, nombre),
                "%s/__tests__/%s.test.tsx" % (carpeta, nombre),
            ]
        return salida
    return []


def pruebas_a_sumar(rutas, existe, base=BASE):
    """Archivos de prueba que la puerta debe correr ADEMÁS de `base`.

    `rutas`: lo que devuelve `git diff --name-only main...HEAD`.
    `existe`: función ruta → bool (para no pasarle a vitest lo que no está).

    Se omite lo que ya cae dentro de `base`: correrlo dos veces no añade nada.
    El resultado va ordenado y sin repetidos, para que el comando sea estable y
    dos ejecuciones iguales se parezcan en el registro.
    """
    encontradas = set()
    for ruta in rutas or []:
        ruta = (ruta or "").strip()
        if not ruta or ruta.startswith(base + "/") or ruta == base:
            continue
        if es_prueba(ruta):
            if existe(ruta):
                encontradas.add(ruta)
            continue
        for candidata in _hermanas(ruta):
            if candidata.startswith(base + "/"):
                continue
            if existe(candidata):
                encontradas.add(candidata)
    return sorted(encontradas)


def orden_vitest(extras, base=BASE):
    """El comando completo de la puerta: siempre `base`, más lo que toque la tarea."""
    return "npx vitest run " + " ".join([base] + list(extras))
