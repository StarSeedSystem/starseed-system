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

(2026-10-20, AV1011G-d1) Lo mismo para Python: `pruebas_python_a_sumar` (al final).
"""

import re

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


# ───────────────────────────────── Python ─────────────────────────────────
#
# (2026-10-20, AV1011G-d1) La puerta de Python (`_puerta_python`, p321Jc) corría SIEMPRE
# `unittest discover` sobre TODA la carpeta scripts/puente con 120 s de plazo. MEDIDO: esa
# carpeta son 188 archivos de prueba y 2813 pruebas que tardan ~373 s, así que con un cambio de
# UNA línea en un .py la puerta daba rc=124 «TIMEOUT 120s» a los 120 s y la nota que quedaba era
# la primera línea de ruido de pruebas AJENAS («disco lleno»), que el revisor leía como fallo de
# la tarea. Ninguna tarea de Python podía pasar la puerta en la nube (AV1011G-d1 se quedó en
# Bloqueadas tras tres intentos), y scripts/protomolecula ni siquiera tenía puerta.
# Mismo principio que arriba: una tarea pasa por las pruebas que ELLA toca (la hermana de cada
# módulo y las que lo importan), no por las de media carpeta. La carpeta entera solo corre si lo
# tocado lo importan muchas pruebas (el orquestador, `publicar`…): ahí un cambio sí puede romper
# a cualquiera.

#: Más pruebas que importen el módulo que esto → la carpeta entera (regresión probable).
UMBRAL_IMPORTADORES = 12


def es_prueba_py(ruta):
    """¿Este archivo es una prueba de Python? (`test_x.py` o `x_test.py`)"""
    nombre = (ruta or "").rsplit("/", 1)[-1]
    return nombre.endswith(".py") and (nombre.startswith("test_") or nombre.endswith("_test.py"))


def _nombres_de(modulo):
    """Un módulo con guiones se importa con guiones bajos (y al revés): se prueban los dos."""
    return {modulo, modulo.replace("-", "_"), modulo.replace("_", "-")}


def _importa(texto, modulo):
    """¿Esta prueba carga ese módulo? Cuenta `import x`, `from x import …`, `from p import x`,
    `import_module("x")` y cualquier mención de la ruta `x.py` (así se cargan los de nombre con
    guiones). `import x` y `from x import …` solo cuentan si la línea empieza por ellos (un
    `# import x` no); `import_module("x")` y la mención de `x.py` cuentan DONDE estén, también en
    un comentario o en un docstring: SOBREINCLUYE a propósito (una prueba de más cuesta décimas
    de segundo; una de menos es una regresión que nadie ve)."""
    for n in _nombres_de(modulo):
        n = re.escape(n)
        if re.search(
            r"(?m)^[ \t]*(?:import[ \t]+[\w.,\t ]*\b%s\b"
            r"|from[ \t]+(?:[\w.]+[ \t]+import[ \t]+[\w.,\t ()]*\b%s\b|%s\b[ \t]+import\b))" % (n, n, n),
            texto,
        ):
            return True
        if re.search(r"import_module\(\s*[\"']%s[\"']" % n, texto):
            return True
        if re.search(r"(?<![\w-])%s\.py\b" % n, texto):
            return True
    return False


def pruebas_python_a_sumar(rutas, listar, leer, umbral=UMBRAL_IMPORTADORES):
    """Qué pruebas de Python tiene que correr la puerta para los .py que cambió la tarea.

    `rutas`: lo que devuelve `_tocados_por_la_tarea` (relativas a la raíz del repo).
    `listar`: carpeta → nombres de archivo que hay en ella (`[]` si no existe). Solo se busca en la
    MISMA carpeta del módulo: uno cuyas pruebas viven en una subcarpeta (`tests/`) sale como «sin
    prueba» y la puerta lo dice en su salida en vez de fingir cobertura.
    `leer`: ruta → texto del archivo (`""` si no se puede leer).

    Devuelve `{"por_carpeta": {carpeta: [pruebas]}, "completas": [carpetas], "sin_prueba": [.py]}`:
    las pruebas a correr en cada carpeta; las carpetas que deben correr ENTERAS (porque más de
    `umbral` pruebas importan lo que se tocó); y los .py que no tienen ninguna prueba (la puerta
    solo puede comprobar que compilan, y lo dice). Todo ordenado y sin repetidos.
    """
    por_carpeta, completas, sin_prueba, textos = {}, set(), [], {}

    def texto(ruta):
        if ruta not in textos:
            textos[ruta] = leer(ruta) or ""
        return textos[ruta]

    for ruta in sorted({(r or "").strip() for r in (rutas or [])}):
        carpeta, _, nombre = ruta.rpartition("/")
        if not carpeta or not nombre.endswith(".py") or nombre.startswith("__") or nombre == "conftest.py":
            continue
        pruebas = [n for n in listar(carpeta) if es_prueba_py(n)]
        if es_prueba_py(nombre):
            if nombre in pruebas:
                por_carpeta.setdefault(carpeta, set()).add(ruta)
            continue
        modulo = nombre[:-3]
        propias = {
            n for n in pruebas
            if any(n in ("test_%s.py" % v, "%s_test.py" % v) for v in _nombres_de(modulo))
        }
        importan = {n for n in pruebas if n not in propias and _importa(texto(carpeta + "/" + n), modulo)}
        if not (propias or importan):
            sin_prueba.append(ruta)
            continue
        por_carpeta.setdefault(carpeta, set()).update(carpeta + "/" + n for n in propias | importan)
        if len(importan) > umbral:
            completas.add(carpeta)
    return {
        "por_carpeta": {c: sorted(v) for c, v in sorted(por_carpeta.items())},
        "completas": sorted(completas),
        "sin_prueba": sorted(sin_prueba),
    }


#: Lo que solo pytest entiende: funciones `def test_…` sueltas, `import pytest`, `@pytest.…`.
_PIDE_PYTEST = re.compile(r"(?m)^(?:async[ \t]+)?def[ \t]+test_|^[ \t]*(?:import|from)[ \t]+pytest\b|@pytest\.")


def necesita_pytest(texto):
    """¿Esta prueba hay que correrla con pytest y no con unittest?

    MEDIDO (2026-10-20): `python3 -m unittest test_registro.py` sobre una prueba con funciones
    `def test_…` sueltas (scripts/puente/flujos/test_registro.py, native/astraura-voice/chatterbox/
    test_servidor.py) carga el archivo sin error y dice «Ran 0 tests … OK»: un verde que no comprobó
    nada. pytest, en cambio, corre esas funciones Y las clases `unittest.TestCase`."""
    return bool(_PIDE_PYTEST.search(texto or ""))


def repartir_por_corredor(pruebas, leer):
    """Parte las rutas de prueba entre sus dos corredores: `{"unittest": […], "pytest": […]}`.

    `leer`: ruta → texto (`""` si no se puede leer; entonces va a unittest, el corredor de siempre
    de estas carpetas). Cada lista sale ordenada y sin repetidos."""
    salida = {"unittest": [], "pytest": []}
    for ruta in sorted(set(pruebas or [])):
        salida["pytest" if necesita_pytest(leer(ruta)) else "unittest"].append(ruta)
    return salida
