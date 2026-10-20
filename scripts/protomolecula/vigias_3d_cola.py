#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigías de la Biblioteca (AV1011G) · la tarea del enjambre que nace cuando una herramienta publica su código.

Una cola fuente del enjambre es una lista JSON de tareas `{id, ola, titulo, archivos, depende, prompt, aprobacion?, reservada?}`
en `starseed_memory_root/olas/cola-<nombre>.json` (carpeta que no se versiona). Reglas que replican las de
`validarCola` (src/lib/mando/colas.ts): id de ≤ 9 caracteres alfanuméricos, ≤ 3 archivos, prompt de 20 a 12000
caracteres, rutas relativas sin «..», un `id` solo puede vivir en UNA cola, nombre «mmdd-palabras».

Idempotente: el `id` de la tarea es fijo por herramienta (`VG<COD>A`). Si ya consta en cualquier cola viva, en
`colas-fuente/` o en el estado del vigía, no se crea otra. Nada se pisa: una cola con ese nombre se respeta.

Visto bueno humano REAL (2026-10-20). `aprobacion: true` solo retiene la rama en la puerta del orquestador, y
la resolución automática o el aprobador pueden soltarla si la revisión sale en verde; la nube ni la mira. Por eso,
cuando los pesos no son de uso libre (o no se pudo leer su licencia), la tarea NO entra en ninguna cola viva: se
deja como PROPUESTA en `olas/propuestas/cola-<nombre>.json` (esa carpeta no la lee nadie del enjambre) con su
`reservada: "<motivo>"`, y el aviso dice cómo encolarla. Encolarla es decisión de Alex: moverla a `olas/`.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parent))
from actualizar_catalogo import _escribir_atomico as escribir_atomico  # noqa: E402
from vigias_3d_datos import Vigia  # noqa: E402

PATRON_ID = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,8}$")
PATRON_NOMBRE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
CODIGOS = {"unimate": "UNI", "filigree3d": "FIL", "btc3d": "BTC"}
USOS_QUE_PIDEN_PERSONA = ("no-comercial", "condicionado", "restringido-region", None)  # None = licencia sin comprobar


def id_de_tarea(v: Vigia) -> str:
    return f"VG{CODIGOS.get(v.id) or re.sub(r'[^A-Za-z0-9]', '', v.id).upper()[:3]}A"


def nombre_de_cola(v: Vigia, ahora: datetime) -> str:
    return f"{ahora.strftime('%m%d')}-vigia-3d-{re.sub(r'[^a-z0-9]+', '-', v.id.lower()).strip('-')}"


def necesita_aprobacion(uso_pesos: str | None) -> bool:
    """Los pesos con licencia no comercial, con condiciones o sin comprobar no se integran sin que una persona los vea."""
    return uso_pesos in USOS_QUE_PIDEN_PERSONA


def motivo_de_reserva(v: Vigia, obs: dict) -> str:
    """Por qué la decide Alex: la licencia de los pesos tal como se leyó (o que no se pudo leer)."""
    licencia = obs.get("licencia_pesos")
    uso = obs.get("uso_pesos")
    if licencia:
        return f"los pesos de {v.nombre} declaran {licencia} (uso {uso or 'sin clasificar'}): decide Alex antes de integrar el adaptador"
    return f"no se pudo leer la licencia de los pesos de {v.nombre}: decide Alex antes de integrar el adaptador"


def _archivos_de(v: Vigia) -> list[str]:
    """Adaptador, sus pruebas y su README: tres archivos, uno al lado del otro (el límite de una tarea)."""
    p = PurePosixPath(v.adaptador)
    return [str(p), str(p.with_name(f"test_{p.name}")), str(p.with_name(f"README-{p.stem}.md"))]


def _hechos(obs: dict) -> str:
    origen = {"contrato": "el contrato del proyecto", "huggingface": "Hugging Face", "arxiv": "el resumen de arXiv"}.get(obs.get("repo_origen"), "el contrato del proyecto")
    lineas = [f"- Repositorio: https://github.com/{obs['repo']} (lo da {origen})."]
    if obs.get("licencia_codigo"):
        lineas.append(f"- Licencia del código: {obs['licencia_codigo']}.")
    if obs.get("comando_inferencia"):
        lineas.append(f"- Comando de inferencia que da su README: `{obs['comando_inferencia']}`.")
    if obs.get("fecha_codigo"):
        lineas.append(f"- Su README anuncia el código como publicado el {obs['fecha_codigo']}.")
    if obs.get("modelos_oficiales"):
        pesos = ", ".join(f"{m} ({(obs.get('licencias_pesos') or {}).get(m) or 'licencia sin declarar'})" for m in obs["modelos_oficiales"])
        lineas.append(f"- Pesos oficiales en Hugging Face: {pesos}.")
    else:
        lineas.append("- Pesos oficiales: ninguno confirmado todavía.")
    if obs.get("modelos_otros"):
        lineas.append("- Modelos de terceros que citan su artículo (pista, no dependencia): " + ", ".join(obs["modelos_otros"][:6]) + ".")
    return "\n".join(lineas)


def construir_tarea(v: Vigia, obs: dict, ahora: datetime) -> dict:
    """La tarea de escribir el adaptador local. Parte de hechos LEÍDOS hoy en la red; lo que no se leyó se dice."""
    aprobacion = necesita_aprobacion(obs.get("uso_pesos"))
    licencia = obs.get("licencia_pesos")
    regla_licencia = (
        f"Los pesos declaran la licencia «{licencia}»: el motor expone `licencia_pesos` y `uso_pesos` ({obs.get('uso_pesos') or 'sin comprobar'}) "
        "y NO se activa por defecto; el catálogo y el elegidor solo lo ofrecen donde ese uso lo permite (núcleo: USOS_LICENCIA)."
        if licencia
        else "Los pesos no declaran licencia que se haya podido leer: el motor lo dice así (`licencia_pesos: null`) y no se activa por defecto."
    )
    adaptador, pruebas, lee_me = _archivos_de(v)
    prompt = (
        f"El vigía de la Biblioteca (scripts/protomolecula/vigias_3d.py) detectó el {ahora.strftime('%Y-%m-%d')} que {v.nombre} ya publicó su código. "
        f"Escribe su adaptador local para el taller 3D, igual que el de PixelArtistry.\n\n"
        f"HECHOS LEÍDOS HOY EN LA RED (no los des por buenos sin releer el README del repositorio):\n{_hechos(obs)}\n\n"
        f"CONTEXTO: etapa «{v.etapa}» del taller (contrato architecture/astraura-avatares-3d.md §4, §8 y §11; léelo entero antes de empezar). {v.integracion}\n\n"
        f"HAZ: 1) `{adaptador}` con `disponible()` HONESTO (dice por qué no si falta GPU, pesos o dependencias; nada de fingir), "
        "la orden que se lanza SIN descargar nada sola (los pesos pesan decenas de GB: los baja una persona) y una función que prepara la entrada. "
        "Sigue la forma de servicios/taller-3d/motores/pixelartistry.py. "
        f"2) {pruebas} con pruebas que NO necesitan GPU ni red (lo que haga falta se inyecta). "
        f"3) {lee_me} con el paso a paso de instalación y la licencia.\n\n"
        f"LICENCIA: {regla_licencia}\n\n"
        "REGLAS: comentarios y textos en español; nada simulado ni que finja hacer algo; no instales paquetes ni descargues pesos; "
        "no toques src/lib/avatares/adn/motores.ts (su estado se actualiza aparte, cuando el adaptador esté integrado). Máximo 120 líneas por archivo."
        + ("\n\nTAREA RESERVADA PARA ALEX: nació como propuesta porque los pesos no son de uso libre; si estás leyendo esto es que él la encoló, y encolarla fue su visto bueno: la integración sigue el camino normal del enjambre." if aprobacion else "")
    )
    tarea = {
        "id": id_de_tarea(v),
        "ola": f"Ola {ahora.strftime('%m%d')}V · Vigía 3D: {v.nombre} publicó su código",
        "titulo": f"Taller 3D · adaptador local de {v.nombre} ({v.etapa}) ahora que su código es público",
        "archivos": _archivos_de(v),
        "depende": [],
        "prompt": prompt,
    }
    if aprobacion:
        tarea["aprobacion"] = True
        tarea["reservada"] = motivo_de_reserva(v, obs)
    return tarea


def errores_de_forma(tareas: list[dict]) -> list[str]:
    """Replica de las reglas de `validarCola` para la forma de lo que este módulo escribe."""
    errores: list[str] = []
    ids: set[str] = set()
    todos = {str(t.get("id", "")) for t in tareas}
    for t in tareas:
        i = str(t.get("id", ""))
        if not PATRON_ID.match(i):
            errores.append(f"id «{i}» no válido")
        if i in ids:
            errores.append(f"id repetido: {i}")
        ids.add(i)
        if not str(t.get("titulo", "")).strip():
            errores.append(f"{i}: falta el título")
        p = str(t.get("prompt", "")).strip()
        if t.get("aprobacion") and not str(t.get("reservada") or "").strip():
            errores.append(f"{i}: pide visto bueno sin decir por qué (`reservada`): Alex no sabría qué decide")
        if not 20 <= len(p) <= 12000:
            errores.append(f"{i}: prompt de {len(p)} caracteres (debe tener entre 20 y 12000)")
        archivos = t.get("archivos") or []
        if not 1 <= len(archivos) <= 3:
            errores.append(f"{i}: {len(archivos)} archivos (la regla es de 1 a 3)")
        for a in archivos:
            if ".." in a or a.startswith("/") or re.search(r"\s", a):
                errores.append(f"{i}: ruta no permitida «{a}»")
        for d in t.get("depende") or []:
            if d not in todos:
                errores.append(f"{i}: depende de «{d}», que no está en la cola")
            if d == i:
                errores.append(f"{i}: no puede depender de sí misma")
    return errores


def ids_existentes(olas: Path) -> set[str]:
    """Ids de tarea de toda cola fuente viva y de `colas-fuente/` (las colas combinadas que ya se retiraron)."""
    ids: set[str] = set()
    for carpeta in (olas, olas / "propuestas", olas.parent / "colas-fuente"):
        if not carpeta.is_dir():
            continue
        for ruta in sorted(carpeta.glob("*.json")):
            try:
                datos = json.loads(ruta.read_text("utf-8"))
            except (OSError, ValueError):
                continue
            for t in datos if isinstance(datos, list) else []:
                if isinstance(t, dict) and isinstance(t.get("id"), str):
                    ids.add(t["id"])
    return ids


def propuesta_escrita(olas: Path, tid: str) -> Path | None:
    """La propuesta de `tid` que ya espera en `olas/propuestas/`, si la hay (para volver a dar la orden de encolarla)."""
    carpeta = olas / "propuestas"
    for ruta in sorted(carpeta.glob("cola-*.json")) if carpeta.is_dir() else []:
        try:
            datos = json.loads(ruta.read_text("utf-8"))
        except (OSError, ValueError):
            continue
        if any(isinstance(t, dict) and t.get("id") == tid for t in (datos if isinstance(datos, list) else [])):
            return ruta
    return None


def orden_encolar(ruta: str | Path) -> str:
    """La orden exacta para encolar una propuesta: rutas absolutas y entrecomilladas, y `-n` para no pisar nada."""
    import shlex
    ruta = Path(ruta).resolve()
    return f"mv -n {shlex.quote(str(ruta))} {shlex.quote(str(ruta.parent.parent))}/"


def crear_cola(olas: Path, v: Vigia, obs: dict, ahora: datetime, ya_conocidas: set[str] | None = None, escribir: bool = True) -> dict:
    """{estado: creada|propuesta|ya-existe|invalida, cola, tarea, ruta?, motivo?}. Con escribir=False calcula sin
    tocar el disco y lo dice (`escrita: False`). Una tarea reservada para Alex es «propuesta»: va a `olas/propuestas/`."""
    tarea = construir_tarea(v, obs, ahora)
    previa = propuesta_escrita(olas, tarea["id"])
    if previa is not None:  # sigue esperando a Alex: se vuelve a dar la orden (si el aviso anterior se perdió, este la trae)
        return {"estado": "propuesta", "cola": previa.stem.removeprefix("cola-"), "tarea": tarea["id"], "ruta": str(previa),
                "escrita": False, "ya_estaba": True, "aprobacion": bool(tarea.get("aprobacion")), "reservada": tarea.get("reservada")}
    if tarea["id"] in ids_existentes(olas) | set(ya_conocidas or ()):
        return {"estado": "ya-existe", "cola": None, "tarea": tarea["id"]}
    errores = errores_de_forma([tarea])
    nombre = nombre_de_cola(v, ahora)
    if not PATRON_NOMBRE.match(nombre):
        errores.append(f"nombre de cola «{nombre}» no válido")
    if errores:
        return {"estado": "invalida", "cola": None, "tarea": tarea["id"], "motivo": "; ".join(errores)}
    reservada = bool(tarea.get("reservada"))
    carpeta = olas / "propuestas" if reservada else olas
    ruta = carpeta / f"cola-{nombre}.json"
    if ruta.exists() or (olas / f"cola-{nombre}.json").exists():
        return {"estado": "ya-existe", "cola": nombre, "tarea": tarea["id"]}
    if escribir:
        carpeta.mkdir(parents=True, exist_ok=True)
        escribir_atomico(ruta, json.dumps([tarea], ensure_ascii=False, indent=2) + "\n")
    return {"estado": "propuesta" if reservada else "creada", "cola": nombre, "tarea": tarea["id"],
            "ruta": str(ruta), "escrita": bool(escribir), "aprobacion": bool(tarea.get("aprobacion")),
            "reservada": tarea.get("reservada")}
