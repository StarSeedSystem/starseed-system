#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aprobador automático: qué hacer con una rama que espera un visto bueno (DSB1010, 2026-10-10).

Módulo PURO (sin red, sin disco, sin procesos), como `aprobacion_logica.py` y
`revisor_bloqueadas_logica.py`: su puerta lo mide sin efectos. Lo usa `aprobador_automatico.py`
desde cada pasada del director de orquestación.

Por qué existe. Alex (2026-10-10): «hay muchas bloqueadas, fallidas y sin publicar que no se
procesaron automáticamente… que se procesen automáticamente con todos los directores». Medido
ese día en `eventos.jsonl`: de las últimas 40 ramas que llegaron a la puerta de visto bueno,
las 40 con `tsc 0 · tests ok`; 29 por «revisión bloqueante» y 11 con la revisión en verde. Cada
una retenía un trabajador hasta 20 min (`STARSEED_ESPERA_APROBACION_S`) aunque su sucesora ya
estuviera escribiendo, y al agotar la cadena sus reparaciones quedaba en
`pendiente_aprobacion` sin nadie que decidiera (S1010-TU-LL1c, PM1010F2F, CNS1010Mb…).

La regla, en una frase: **decide la máquina con lo que ya sabe —dictamen del revisor, puertas,
radio de impacto, intento de la cadena— y Jev solo puede VETAR (p ≥ 0,8, nunca convierte un
«no» en «sí»); a Alex solo le llega lo que cambia dependencias de producción, migraciones,
claves o la publicación de las apps nativas.**

  · reservada para Alex ......... dependencias de producción (salvo AÑADIR paquetes con licencia
                                   libre en un diff que solo toca package.json/package-lock),
                                   migraciones, claves (.env o posible secreto), publicación nativa
  · sucesora ya escribiendo ...... «liberar»: se rechaza ESTA copia para soltar su trabajador
  · revisión en verde ........... «aprobar» (Jev puede vetar → «reparar»)
  · revisión bloqueante, < 3 ..... «esperar»: la repara el desatascador con la objeción
  · revisión bloqueante, ≥ 3 ..... «aprobar_con_seguimiento» si las puertas pasaron y el impacto
    intentos de la cadena          es bajo (lo verde entra; la objeción sale como tarea); si no,
                                   o si Jev veta, «rechazar» con la objeción a la vista
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional

ESPERA_MIN = 8            # el desatascador repara a los 6 min: se le deja actuar primero
TOPE_INTENTOS = 3         # mismo tope que el desatascador (TOPE_INTENTOS_REPARACION)
ESPERA_REPARACION_MIN = 45  # rama suelta sin sucesora: pasado esto, se decide aunque sea intento 1-2
UMBRAL_JEV = 0.8          # mismo umbral que el revisor de bloqueadas
EN_APROBACION = ("esperando_aprobacion", "pendiente_aprobacion")

#: Impacto «alto»: no se integra solo algo bloqueado por el revisor si además toca mucho.
MAX_ARCHIVOS_BAJO = 6
MAX_LINEAS_BAJO = 600
RIESGO_ALTO = ("high", "critical", "alto", "critico", "crítico")
#: Rutas que, tocadas, hacen alto el radio de impacto (todo el OS o la publicación cuelgan de ellas).
NUCLEO = (
    "src/app/layout.tsx", "src/middleware.ts", "middleware.ts", "next.config.ts", "next.config.js",
    "src/components/providers/", "src/utils/supabase/", "src/app/(app)/layout.tsx",
    "scripts/puente/autopublicar.py", "scripts/puente/produccion_puertas.py",
    "scripts/puente/commit-seguro.py", "scripts/puente/publicar.py",
    "tsconfig.json", "vitest.config.ts",
)

_MIGRACION = re.compile(r"^supabase/migrations/|^supabase/.*\.sql$|(^|/)migrations?/.*\.sql$")
_ENV = re.compile(r"(^|/)\.env(\.[A-Za-z0-9_-]+)?$")
_ENV_PLANTILLA = re.compile(r"(^|/)\.env\.(example|sample|template|dist)$")
_PUBLICACION_NATIVA = re.compile(
    r"^native/src-tauri/tauri(\.[A-Za-z0-9_-]+)?\.conf\.json$"
    r"|^native/.*/(Info\.plist|AndroidManifest\.xml|build\.gradle(\.kts)?)$"
    r"|^\.github/workflows/[^/]*(nativ|release|tauri|android|ios|apk|dmg|msi|appimage|publicar)[^/]*\.ya?ml$",
    re.I)
_DEPENDENCIAS_NATIVAS = re.compile(r"^native/.*Cargo\.(toml|lock)$")
_PAQUETES = ("package.json", "package-lock.json")
_PRUEBA = re.compile(r"(^|/)(__tests__/|test_[^/]*\.py$|[^/]*\.(test|spec)\.[cm]?[jt]sx?$)")

#: Licencias libres PERMISIVAS (SPDX). Una expresión «A OR B» vale si alguna de sus partes lo es.
#: La GPL/AGPL también es libre, pero obliga a todo el OS: esa la decide Alex.
LICENCIAS_LIBRES = frozenset({
    "MIT", "MIT-0", "ISC", "APACHE-2.0", "BSD-2-CLAUSE", "BSD-3-CLAUSE", "0BSD", "MPL-2.0",
    "UNLICENSE", "CC0-1.0", "BLUEOAK-1.0.0", "ZLIB", "PYTHON-2.0", "CC-BY-4.0", "WTFPL",
    "LGPL-2.1", "LGPL-2.1-ONLY", "LGPL-2.1-OR-LATER", "LGPL-3.0", "LGPL-3.0-ONLY",
    "LGPL-3.0-OR-LATER", "BSL-1.0", "ARTISTIC-2.0",
})


def licencia_libre(licencia: Any) -> bool:
    texto = str(licencia or "").strip().strip("()").upper()
    if not texto:
        return False
    partes = [p.strip().strip("()") for p in re.split(r"\s+OR\s+|/", texto) if p.strip()]
    return any(p in LICENCIAS_LIBRES for p in partes)


def intento_de_cadena(tid: str) -> int:
    """«PM1010F2F» → 1, «CNS1010Mb» → 2, «S1010-TU-LL1c» → 3: la letra minúscula final es el
    eslabón (misma convención que `_base_id` del desatascador y `obtenerBaseId` de Genesis)."""
    tid = str(tid or "")
    if len(tid) > 1 and tid[-1] in "bcdefghijklmnopqrstuvwxyz" and tid[-2].isalnum() and not tid[-2].islower():
        return 1 + ord(tid[-1]) - ord("a")
    return 1


def cambios_de_dependencias(antes: Optional[Dict[str, Any]], despues: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Compara dos package.json. Devuelve {anadidas, cambiadas, quitadas} de `dependencies`
    (producción) y {dev_anadidas, dev_cambiadas, dev_quitadas} de `devDependencies`."""
    def _de(pj, clave):
        d = (pj or {}).get(clave) if isinstance(pj, dict) else None
        return d if isinstance(d, dict) else {}

    salida: Dict[str, Any] = {}
    for clave, pref in (("dependencies", ""), ("devDependencies", "dev_")):
        a, d = _de(antes, clave), _de(despues, clave)
        salida[pref + "anadidas"] = sorted(k for k in d if k not in a)
        salida[pref + "cambiadas"] = sorted(k for k in d if k in a and str(d[k]) != str(a[k]))
        salida[pref + "quitadas"] = sorted(k for k in a if k not in d)
    return salida


def reserva_para_alex(archivos: Iterable[str], deps: Optional[Dict[str, Any]] = None,
                      licencias: Optional[Dict[str, Any]] = None, secretos: int = 0) -> str:
    """"" si la rama puede decidirse sola; si no, POR QUÉ es de Alex (una frase).

    `deps` sale de `cambios_de_dependencias`; `licencias` es {paquete: licencia} de los AÑADIDOS
    (del package-lock); `secretos` = hallazgos del escáner de `produccion_puertas`."""
    archivos = [str(a) for a in (archivos or []) if str(a).strip()]
    if secretos:
        return "el diff lleva %d posible(s) clave(s)" % secretos
    mig = [a for a in archivos if _MIGRACION.search(a)]
    if mig:
        return "trae una migración de base de datos (%s)" % ", ".join(mig[:2])
    env = [a for a in archivos if _ENV.search(a) and not _ENV_PLANTILLA.search(a)]
    if env:
        return "toca un archivo de claves (%s)" % ", ".join(env[:2])
    nat = [a for a in archivos if _PUBLICACION_NATIVA.search(a)]
    if nat:
        return "cambia la publicación de las apps nativas (%s)" % ", ".join(nat[:2])
    cargo = [a for a in archivos if _DEPENDENCIAS_NATIVAS.search(a)]
    if cargo:
        return "cambia dependencias de la app nativa (%s)" % ", ".join(cargo[:2])
    paquetes = [a for a in archivos if a in _PAQUETES]
    if not paquetes:
        return ""
    deps = deps or {}
    if "package.json" not in paquetes:
        return "cambia el package-lock sin package.json: puede subir dependencias de producción por debajo"
    if deps.get("cambiadas") or deps.get("quitadas"):
        return "cambia o quita dependencias de producción (%s)" % ", ".join(
            (list(deps.get("cambiadas") or []) + list(deps.get("quitadas") or []))[:4])
    anadidas = list(deps.get("anadidas") or []) + list(deps.get("dev_anadidas") or [])
    otros = [a for a in archivos if a not in _PAQUETES and not _PRUEBA.search(a)]
    if anadidas and otros:
        return "añade dependencias junto con código (%s): van en una tarea propia" % ", ".join(otros[:2])
    licencias = licencias or {}
    no_libres = [p for p in anadidas if not licencia_libre(licencias.get(p))]
    if no_libres:
        return "licencia no permisiva o desconocida: %s" % ", ".join(
            "%s (%s)" % (p, licencias.get(p) or "sin licencia") for p in no_libres[:4])
    return ""


def radio_de_impacto(archivos: Iterable[str], lineas: int = 0, riesgo: Optional[str] = None) -> str:
    """«bajo» o «alto (motivo)». El grafo del código (riesgo) manda si lo hay."""
    archivos = [str(a) for a in (archivos or [])]
    if str(riesgo or "").strip().lower() in RIESGO_ALTO:
        return "alto (grafo del código: %s)" % riesgo
    nucleo = [a for a in archivos if any(a == n or (n.endswith("/") and a.startswith(n)) for n in NUCLEO)]
    if nucleo:
        return "alto (toca el núcleo: %s)" % ", ".join(nucleo[:2])
    if len(archivos) > MAX_ARCHIVOS_BAJO:
        return "alto (%d archivos)" % len(archivos)
    if int(lineas or 0) > MAX_LINEAS_BAJO:
        return "alto (%d líneas)" % int(lineas)
    return "bajo"


def jev_veta(jev: Optional[Dict[str, Any]]) -> bool:
    """Jev solo VETA: respuesta «no», con p ≥ 0,8 y de un motor de verdad (no la regla)."""
    if not isinstance(jev, dict) or jev.get("medio") in (None, "", "regla") or jev.get("ocupado"):
        return False
    try:
        p = float(jev.get("p") or 0)
    except (TypeError, ValueError):
        return False
    return str(jev.get("respuesta") or "").strip().lower() == "no" and p >= UMBRAL_JEV


def _accion(accion: str, motivo: str, **extra: Any) -> Dict[str, Any]:
    d = {"accion": accion, "motivo": motivo}
    d.update(extra)
    return d


def decidir(c: Dict[str, Any]) -> Dict[str, Any]:
    """UNA rama en la puerta → {accion, motivo, pide_jev?}.

    Claves de `c`: tid, estado, minutos, revisor, faltan, puertas_ok, archivos, lineas, riesgo,
    reserva, sucesora, hermana_en_curso, objecion, jev. Acciones: nada · esperar · reservar_alex · liberar ·
    aprobar · aprobar_con_seguimiento · rechazar. `pide_jev` = la acción es integrar y falta
    preguntar a Jev si la veta (la segunda llamada trae `jev`)."""
    tid = str(c.get("tid") or "")
    estado = str(c.get("estado") or "")
    if estado not in EN_APROBACION:
        return _accion("nada", "no espera un visto bueno")
    viva = estado == "esperando_aprobacion"
    if viva and float(c.get("minutos") or 0) < ESPERA_MIN:
        return _accion("esperar", "lleva menos de %d min en la puerta: primero actúan el revisor y el "
                                  "desatascador" % ESPERA_MIN)
    if c.get("reserva"):
        return _accion("reservar_alex", "la decide Alex: %s" % c["reserva"])
    if c.get("sucesora"):
        if viva:
            return _accion("liberar", "su sucesora %s ya lleva el encargo: suelto este trabajador "
                                      "(la rama se conserva)" % c["sucesora"])
        return _accion("nada", "su sucesora %s ya lleva el encargo" % c["sucesora"])
    if c.get("hermana_en_curso"):
        # (medido: S1010-TU-LL1, LL1b y LL1c con los mismos archivos a la vez) Integrar esta
        # mientras otra copia de la cadena escribe los mismos archivos es pedir un conflicto.
        return _accion("esperar", "%s, de su misma cadena, está escribiendo: si entra, esta sobra; "
                                  "si no, decido al acabar" % c["hermana_en_curso"])
    if c.get("faltan"):
        return _accion("nada", "alcance parcial: lo integra con seguimiento el desatascador")
    if c.get("puertas_ok") is not True:
        return _accion("esperar", "no consta que tsc y las pruebas pasaran: no se integra a ciegas")

    revisor = str(c.get("revisor") or "")
    impacto = radio_de_impacto(c.get("archivos") or [], int(c.get("lineas") or 0), c.get("riesgo"))
    veto = jev_veta(c.get("jev"))
    preguntado = "jev" in c

    if revisor == "bloqueante":
        intento = intento_de_cadena(tid)
        objecion = str(c.get("objecion") or "revisión bloqueante confirmada")[:400]
        # Una rama SUELTA que lleva demasiado sin sucesora no espera más al desatascador: su
        # contador de reparaciones sube en cada pasada y escala antes de tiempo, y entonces
        # nadie la recogía (medido: CNS1010Mb, 5 «intentos» en una sola puerta).
        abandonada = (not viva) and float(c.get("minutos") or 0) >= ESPERA_REPARACION_MIN
        if intento < TOPE_INTENTOS and not abandonada:
            return _accion("esperar", "revisión bloqueante en el intento %d de %d: la repara el "
                                      "desatascador con la objeción" % (intento, TOPE_INTENTOS))
        if impacto != "bajo":
            return _accion("rechazar", "intento %d con la objeción sin resolver e impacto %s: no se "
                                       "integra; objeción: %s" % (intento, impacto, objecion))
        if not preguntado:
            return _accion("aprobar_con_seguimiento", "intento %d, puertas en verde e impacto bajo"
                           % intento, pide_jev=True)
        if veto:
            return _accion("rechazar", "Jev veta integrarla (p=%s); objeción: %s"
                           % (c["jev"].get("p"), objecion))
        return _accion("aprobar_con_seguimiento", "intento %d de la cadena con tsc y pruebas en verde e "
                                                  "impacto bajo: entra lo verde y la objeción sale como "
                                                  "tarea de seguimiento" % intento, objecion=objecion)

    # Revisión en verde («respondio») o sin revisor (todos los revisores sin cupo): las puertas
    # deterministas ya pasaron; el impacto alto solo se dice, y Jev puede vetar.
    sin_revisor = revisor not in ("respondio",)
    if not preguntado:
        return _accion("aprobar", "puertas en verde%s; impacto %s"
                       % (" (sin revisor disponible)" if sin_revisor else " y revisión sin pegas", impacto),
                       pide_jev=True)
    if veto:
        return _accion("rechazar", "Jev veta integrarla (p=%s) aunque las puertas pasaron" % c["jev"].get("p"))
    if sin_revisor and impacto != "bajo":
        return _accion("esperar", "sin revisor disponible e impacto %s: espero a que vuelva un revisor" % impacto)
    return _accion("aprobar", "puertas en verde%s; impacto %s"
                   % (" (sin revisor disponible)" if sin_revisor else " y revisión sin pegas", impacto))


def tarea_seguimiento(tid: str, tarea: Dict[str, Any], sha: str, objecion: str) -> Dict[str, Any]:
    """La tarea pequeña que resuelve la objeción del revisor sobre lo que ya entró en main."""
    base = dict(tarea or {})
    titulo = str(base.get("titulo") or tid)
    encargo = (
        "SEGUIMIENTO de %s, ya integrada%s tras %d intentos con tsc y pruebas en verde. El revisor "
        "puso esta objeción y no se resolvió en la cadena:\n\n%s\n\nTu encargo es SOLO resolver esa "
        "objeción sobre el código que ya está en main (léelo primero), con su prueba. Tarea original: %s"
        % (tid, (" (sha %s)" % sha[:12]) if sha else "", intento_de_cadena(tid), objecion[:1200], titulo))
    if base.get("prompt"):
        encargo += "\n\n--- encargo original, como contexto ---\n%s" % str(base["prompt"])[:1500]
    base.update({
        "id": "%sobj" % tid,
        "titulo": "%s · objeción del revisor" % titulo,
        "prompt": encargo,
        "depende_de": [],
        "origen": "seguimiento de objeción (aprobador automático)",
    })
    base.pop("aprobacion", None)
    return base


def resumen(decisiones: List[Dict[str, Any]]) -> Dict[str, int]:
    cuenta: Dict[str, int] = {}
    for d in decisiones or []:
        cuenta[d.get("accion", "?")] = cuenta.get(d.get("accion", "?"), 0) + 1
    return cuenta
