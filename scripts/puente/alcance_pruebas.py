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

# Guardas del paquete del NAVEGADOR (2026-10-11). S1010-MGR3b hizo que un componente de
# cliente importara un VALOR de un módulo con `node:child_process`: su tsc y sus pruebas
# hermanas pasaron, se integró a las 07:40 y `next build` quedó roto. Estas guardas lo ven
# en ~0,2 s cada una, pero viven fuera de BASE y ninguna tarea las «tocaba»: main pasó
# horas en rojo y el nodo de MetaGenesis de la A1 dejó de tomar tareas. Ahora toda tarea
# que cambie código de la app (src/**.ts/.tsx) las corre.
GUARDAS_CLIENTE = (
    "src/lib/genesis/__tests__/sin-node-en-cliente.test.ts",
    "src/lib/mando/__tests__/sin-node-en-cliente.test.ts",
)


def toca_la_app(ruta):
    """¿Es código de la app que puede acabar en el paquete del navegador?"""
    return bool(ruta) and ruta.startswith("src/") and ruta.endswith(SUFIJOS_FUENTE) and not es_prueba(ruta)


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
    rutas = [(r or "").strip() for r in (rutas or [])]
    if any(toca_la_app(r) for r in rutas):
        encontradas.update(g for g in GUARDAS_CLIENTE if not g.startswith(base + "/") and existe(g))
    for ruta in rutas:
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
