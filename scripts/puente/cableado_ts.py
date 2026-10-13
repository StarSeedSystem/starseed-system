"""cableado_ts · lo que una tarea exporta nuevo, ¿lo llama alguien?

Por qué existe (2026-09-16). La tarea PR2 añadió `avanceCombinado()` a
`src/lib/mando/medidores.ts`: sesenta líneas, pruebas propias en verde, tsc en cero, la
revisión conforme, integrada en `main` (c2caf189). Y **nadie la llamaba**. El medidor
siguió calculando el porcentaje como antes y Alex siguió viendo «17 %» clavado, después
de que le dijeran que estaba arreglado.

Integrado no es aplicado. Una función exportada que solo aparece en su propia prueba es
código muerto con aspecto de trabajo terminado, y las puertas de entonces —alcance por
archivos tocados, tsc, pruebas— no podían verlo: las tres pasan perfectamente.

Este módulo mira el diff de la tarea, saca los símbolos que EXPORTA por primera vez y deja
que quien llame compruebe si alguien los usa. No ejecuta nada ni lee el disco.

Módulo PURO: entra texto, salen nombres.
"""

import re

# `export function x`, `export const x`, `export class x`, `export type x`, `export interface x`.
# Se ignoran los `export default` (no tienen nombre propio que buscar) y los re-exports.
_EXPORTADO = re.compile(
    r"^\+\s*export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+"
    r"([A-Za-z_$][A-Za-z0-9_$]*)"
)
# Un tipo o interfaz puede usarse sin «llamarse»; se comprueban igual, pero quien llama
# puede querer distinguirlos.
_SOLO_TIPO = re.compile(
    r"^\+\s*export\s+(?:type|interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)"
)


def exportados_nuevos(diff, incluir_tipos=False):
    """Nombres que el diff añade como exportados, sin repetir y en orden de aparición.

    `diff` es la salida de `git diff` (solo se miran las líneas que empiezan por «+»).
    Los tipos e interfaces se dejan fuera por defecto: un tipo puede existir para
    documentar una forma y no «usarse» en el sentido de llamarse.
    """
    solo_tipos = set()
    nombres = []
    for linea in (diff or "").splitlines():
        if linea.startswith("+++"):
            continue
        m = _SOLO_TIPO.match(linea)
        if m:
            solo_tipos.add(m.group(1))
        m = _EXPORTADO.match(linea)
        if not m:
            continue
        nombre = m.group(1)
        if nombre in nombres:
            continue
        if nombre in solo_tipos and not incluir_tipos:
            continue
        nombres.append(nombre)
    return nombres


def es_prueba(ruta):
    """¿Esta ruta es un archivo de pruebas? Ahí no cuenta como «usado»."""
    r = (ruta or "").replace("\\", "/")
    return ("__tests__/" in r or r.endswith(".test.ts") or r.endswith(".test.tsx")
            or r.endswith(".spec.ts") or r.endswith(".spec.tsx"))


def sin_cablear(nombres, usos, propias=()):
    """Los nombres que NADIE usa fuera de su propio archivo y de las pruebas.

    `usos`: dict nombre -> lista de rutas donde aparece.
    `propias`: los archivos que la tarea tocó — aparecer solo ahí no es estar cableado
    si además es donde se declara.

    Devuelve la lista de nombres huérfanos, en el orden que llegaron.
    """
    dentro = set(propias or ())
    fuera = []
    for nombre in nombres or []:
        rutas = [r for r in (usos or {}).get(nombre, []) if not es_prueba(r)]
        ajenas = [r for r in rutas if r not in dentro]
        if not ajenas:
            fuera.append(nombre)
    return fuera


def aviso(nombres):
    """La frase que se le dice al agente cuando su trabajo no está conectado."""
    if not nombres:
        return ""
    lista = ", ".join(nombres)
    return (
        "exportas %s y no lo llama nadie fuera de sus pruebas: está integrado pero NO "
        "aplicado. Conéctalo donde tenga que usarse antes de darte por terminado."
        % lista
    )


#: Estados con los que una tarea ya no va a escribir nada más.
_CERRADAS = ("commit", "hecho", "sustituida", "descartada", "rechazada", "informe")


def dependientes_abiertos(tid, colas, progreso=None):
    """Las tareas AÚN ABIERTAS que dependen de `tid` (en cualquier cola viva). PURA.

    (2026-10-13, medido) La Ola 1012Q se escribe de abajo arriba por contrato: MC1012A crea
    los tipos de la malla y MC1012F, H, I… los usan después. La puerta de cableado veía
    «exportas MEDIOS, coordinacionDe… y no lo llama nadie» y le pedía al MISMO modelo que lo
    conectara: metió imports sin uso en cinco archivos de `src/ai/astraura/mesh/` y cambió
    cómo se calcula la calidad de LoRa (sin medida ponía 0,3 en vez de «sin dato»), todo
    fuera de la lista de la tarea. Si hay tareas abiertas que dependen de esta, el cableado
    es trabajo SUYO, no un olvido: la puerta lo anota y no pide nada.

    `colas`: lista de listas de tareas (dicts con `id` y `depende`); `progreso`: {id: {estado}}.
    """
    tid = str(tid or "")
    progreso = progreso or {}
    salida = []
    for tareas in colas or []:
        for t in tareas or []:
            if not isinstance(t, dict) or not t.get("id"):
                continue
            deps = t.get("depende") or t.get("depende_de") or []
            deps = deps if isinstance(deps, list) else [deps]
            if tid not in [str(d) for d in deps]:
                continue
            e = progreso.get(str(t["id"]))
            if isinstance(e, dict) and e.get("estado") in _CERRADAS:
                continue
            if str(t["id"]) not in salida:
                salida.append(str(t["id"]))
    return salida
