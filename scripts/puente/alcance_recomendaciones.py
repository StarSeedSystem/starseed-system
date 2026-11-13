# -*- coding: utf-8 -*-
"""Recomendaciones técnicas para StarSeed OS desde fichas GitHub (ALC1113C).
Núcleo PURO: E/S inyectable, sin red real en tests. Escribe propuesta-<fecha>.json en esperando-aprobacion.
"""
from __future__ import annotations
from datetime import date, datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from collections.abc import Callable

import json
import jsonschema

# ─── Dependencia opcional: flota gratuita ───────────────────────────────────

try:
    from agente_referencias_diseno import encargar_por_flota as _encargar_por_flota_real
except Exception:
    _encargar_por_flota_real = None


# ─── Constantes ──────────────────────────────────────────────────────────────

TOP_RECOMENDACIONES = 5

ESFUERZOS_VALIDOS = ("S", "M", "L")
RIESGOS_VALIDOS = ("bajo", "medio", "alto")

LICENCIAS_COMPATIBLES = {
    "MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "ISC", "Unlicense",
    "MPL-2.0", "LGPL-2.1", "LGPL-3.0", "Zlib", "Python-2.0",
}

# Schema de validación de una recomendación individual
RECOMENDACION_SCHEMA = {
    "type": "object",
    "required": ["area_sistema", "que_adoptar", "por_que", "licencia_compatible", "esfuerzo", "riesgo"],
    "properties": {
        "area_sistema": {"type": "string", "minLength": 1},
        "que_adoptar": {"type": "string", "minLength": 1, "maxLength": 120},
        "por_que": {"type": "string", "minLength": 1, "maxLength": 300},
        "licencia_compatible": {"type": "boolean"},
        "esfuerzo": {"type": "string", "enum": list(ESFUERZOS_VALIDOS)},
        "riesgo": {"type": "string", "enum": list(RIESGOS_VALIDOS)},
    },
    "additionalProperties": False,
}

# ─── Funciones puras de análisis ────────────────────────────────────────────

def _licencia_compatible(licencia: str | None) -> bool:
    """True si la licencia es compatible con MIT/Apache-2.0 de StarSeed OS."""
    if not licencia:
        return False
    lic = licencia.strip()
    return lic in LICENCIAS_COMPATIBLES


def _esfuerzo_desde_actividad(ficha: dict) -> str:
    """Estima esfuerzo (S/M/L) según actividad reciente del repo."""
    contenido = ficha.get("contenido_reciente") or []
    n = len(contenido)
    if n >= 8:
        return "S"  # Muy activo → fácil adoptar / patrón claro
    if n >= 3:
        return "M"
    return "L"  # Poco activo → más riesgo / investigación


def _riesgo_desde_licencia_y_actividad(ficha: dict) -> str:
    """Riesgo: bajo/medio/alto según licencia y actividad."""
    lic_ok = _licencia_compatible(ficha.get("licencia"))
    contenido = ficha.get("contenido_reciente") or []
    activo = len(contenido) >= 3

    if lic_ok and activo:
        return "bajo"
    if lic_ok and not activo:
        return "medio"
    return "alto"  # Licencia incompatible o desconocida


def _area_desde_ficha(ficha: dict) -> str:
    """Área de StarSeed OS desde la ficha (mapeo directo)."""
    area = ficha.get("area_starseed") or "otro"
    # Mapear áreas conocidas; desconocidas → "otro"
    areas_conocidas = {
        "fediverso", "nostr", "matrix", "red-social", "ia-local",
        "gobernanza", "economia", "red-mesh", "comunicaciones",
        "regenerativo", "sistema-operativo", "red-descentralizada",
        "local-first",
    }
    return area if area in areas_conocidas else "otro"


def _que_adoptar_desde_ficha(ficha: dict) -> str:
    """Qué adoptar: patrón, función, biblioteca o idea (≤120 chars)."""
    que_hacen = (ficha.get("que_hacen") or "").strip()
    nombre = ficha.get("nombre_publico") or ""
    licencia = ficha.get("licencia") or ""

    # Heurística simple basada en palabras clave
    qh = que_hacen.lower()
    if any(p in qh for p in ("patrón", "pattern", "framework", "marco", "arquitectura")):
        base = f"Patrón de {que_hacen[:80]}"
    elif any(p in qh for p in ("biblioteca", "library", "librería", "lib", "sdk", "cliente")):
        base = f"Biblioteca: {que_hacen[:80]}"
    elif any(p in qh for p in ("función", "function", "api", "servicio", "microservicio")):
        base = f"Función: {que_hacen[:80]}"
    else:
        base = f"Idea de {nombre}: {que_hacen[:80]}"

    # Añadir licencia si es relevante
    if licencia and licencia in LICENCIAS_COMPATIBLES:
        base += f" ({licencia})"

    return base[:120]


def _por_que_desde_ficha(ficha: dict) -> str:
    """Por qué adoptar para StarSeed OS (≤300 chars)."""
    que_hacen = (ficha.get("que_hacen") or "").strip()
    area = ficha.get("area_starseed") or "el sistema"
    resonancias = ficha.get("resonancias") or []
    razon_resonancia = ""
    for r in resonancias:
        if isinstance(r, dict) and r.get("con") == "StarSeed OS":
            razon_resonancia = r.get("por_que", "")
            break

    base = f"StarSeed OS necesita {area}: {que_hacen[:180]}"
    if razon_resonancia:
        base += f". Resonancia: {razon_resonancia}"

    return base[:300]


def recomendacion_desde_ficha(ficha: dict) -> dict:
    """Construye una recomendación completa validada desde una ficha GitHub."""
    area = _area_desde_ficha(ficha)
    que_adoptar = _que_adoptar_desde_ficha(ficha)
    por_que = _por_que_desde_ficha(ficha)
    licencia_compatible = _licencia_compatible(ficha.get("licencia"))
    esfuerzo = _esfuerzo_desde_actividad(ficha)
    riesgo = _riesgo_desde_licencia_y_actividad(ficha)

    rec = {
        "area_sistema": area,
        "que_adoptar": que_adoptar,
        "por_que": por_que,
        "licencia_compatible": licencia_compatible,
        "esfuerzo": esfuerzo,
        "riesgo": riesgo,
    }

    # Validar contra schema
    jsonschema.validate(instance=rec, schema=RECOMENDACION_SCHEMA)
    return rec


def mejores_recomendaciones(fichas: list[dict]) -> list[dict]:
    """Selecciona las mejores recomendaciones (hasta TOP_RECOMENDACIONES).
    Prioridad: licencia compatible → esfuerzo S → riesgo bajo → actividad alta.
    """
    recomendaciones = []
    for f in fichas:
        try:
            rec = recomendacion_desde_ficha(f)
            rec["_ficha_obj_id"] = f.get("obj_id", "")
            rec["_ficha_nombre"] = f.get("nombre_publico", "")
            rec["_ficha_licencia"] = f.get("licencia", "")
            rec["_actividad"] = len(f.get("contenido_reciente") or [])
            recomendaciones.append(rec)
        except jsonschema.ValidationError:
            continue  # Saltar fichas que no producen recomendación válida

    # Ordenar por prioridad
    def prioridad(r: dict) -> tuple:
        # Tupla para sort: (licencia_ok, esfuerzo_S, riesgo_bajo, actividad_alta)
        # False < True, así que invertimos: queremos True primero
        lic = r["licencia_compatible"]
        esf_s = r["esfuerzo"] == "S"
        riesgo_bajo = r["riesgo"] == "bajo"
        act = r["_actividad"]
        return (not lic, not esf_s, not riesgo_bajo, -act)

    recomendaciones.sort(key=prioridad)

    # Filtrar solo compatibles y tomar top N
    mejores = [r for r in recomendaciones if r["licencia_compatible"]]
    return mejores[:TOP_RECOMENDACIONES]


# ─── Escritura de propuesta en formato Librería ─────────────────────────────

def _pkg_id_desde_ficha(ficha: dict) -> str:
    """Genera id de paquete tipo lib-xxx desde obj_id de ficha."""
    obj_id = ficha.get("obj_id", "gh-desconocido")
    if obj_id.startswith("gh-"):
        return f"lib-{obj_id[3:].replace('/', '-').replace('_', '-')}"
    return f"lib-{obj_id.replace('/', '-').replace('_', '-')}"


def _repo_url_desde_ficha(ficha: dict) -> str:
    """URL del repo GitHub desde la ficha."""
    nombre = ficha.get("nombre_publico", "")
    if nombre and "/" in nombre:
        return f"https://github.com/{nombre}"
    fuentes = ficha.get("fuentes") or []
    for fu in fuentes:
        if isinstance(fu, dict) and fu.get("url", "").startswith("https://github.com/"):
            return fu["url"]
    return "https://github.com/desconocido/desconocido"


def _icono_por_area(area: str) -> str:
    """Icono Lucide según área."""
    iconos = {
        "fediverso": "Globe",
        "nostr": "Key",
        "matrix": "MessageSquare",
        "red-social": "Users",
        "ia-local": "Brain",
        "gobernanza": "Scale",
        "economia": "Coins",
        "red-mesh": "Network",
        "comunicaciones": "Mail",
        "regenerativo": "Leaf",
        "sistema-operativo": "Cpu",
        "red-descentralizada": "GitBranch",
        "local-first": "HardDrive",
        "otro": "Package",
    }
    return iconos.get(area, "Package")


def _grupo_por_area(area: str) -> str:
    """Grupo de Librería según área."""
    grupos = {
        "fediverso": "federacion",
        "nostr": "nostr",
        "matrix": "matrix",
        "red-social": "red-social",
        "ia-local": "ia",
        "gobernanza": "gobernanza",
        "economia": "economia",
        "red-mesh": "red-mesh",
        "comunicaciones": "comunicaciones",
        "regenerativo": "regenerativo",
        "sistema-operativo": "sistema",
        "red-descentralizada": "descentralizacion",
        "local-first": "local-first",
        "otro": "otros",
    }
    return grupos.get(area, "otros")


def _kind_por_esfuerzo(esfuerzo: str) -> str:
    """Kind según esfuerzo: S=tool (patrón/lib), M=tool, L=app/servicio."""
    if esfuerzo == "S":
        return "tool"
    if esfuerzo == "M":
        return "tool"
    return "app"


def _estado_por_riesgo(riesgo: str) -> str:
    """Estado en Librería: esperando-aprobacion (siempre para propuestas nuevas)."""
    return "esperando-aprobacion"


def _canal_por_licencia(licencia: str) -> str:
    """Canal de actualizaciones según licencia."""
    if licencia in ("MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "ISC"):
        return "releases"
    return "commits"


def _patron_tag_por_canal(canal: str) -> str | None:
    """Patrón de tag según canal."""
    if canal == "releases":
        return r"^v\d+\.\d+\.\d+$"
    return None


def _version_desde_ficha(ficha: dict) -> tuple[str, str]:
    """Versión actual y fecha desde la ficha (aproximación)."""
    # Buscar en contenido_reciente algo que parezca versión
    for item in ficha.get("contenido_reciente") or []:
        titulo = (item.get("titulo") or "").lower()
        if "v" in titulo and any(c.isdigit() for c in titulo):
            # Extraer versión simple
            import re
            m = re.search(r"v?(\d+\.\d+\.\d+)", titulo)
            if m:
                return m.group(1), (item.get("fecha") or "")[:10]
    # Fallback: fecha de generación
    gen = ficha.get("generada", "")
    return "desconocida", gen[:10] if gen else date.today().isoformat()


def _actividad_texto(ficha: dict) -> str:
    """Texto de actividad para la ficha de librería."""
    n = len(ficha.get("contenido_reciente") or [])
    if n == 0:
        return "Sin actividad reciente visible"
    return f"{n} elementos recientes; último push {ficha.get('fuentes', [{}])[0].get('fecha', '')[:10] if ficha.get('fuentes') else 'desconocido'}"


def _gratis_motivo(licencia: str, esfuerzo: str) -> str:
    """Motivo de gratuidad."""
    if licencia in LICENCIAS_COMPATIBLES:
        return f"Licencia {licencia} compatible; esfuerzo {esfuerzo}; corre con modelos gratuitos del OS"
    return "Licencia no verificada; revisar antes de usar"


def _corre_aqui(esfuerzo: str, area: str) -> bool:
    """Si corre en el OS (patrones/librerías sí, apps pesadas no)."""
    if esfuerzo == "L" and area not in ("ia-local", "federacion", "nostr", "matrix"):
        return False
    return True


def _requisitos_por_area(area: str, esfuerzo: str) -> dict:
    """Requisitos estimados según área y esfuerzo."""
    base = {
        "ram_gb": 2 if esfuerzo == "L" else None,
        "vram_gb": None,
        "gpu": "no",
        "docker": "opcional" if esfuerzo == "L" else "no",
        "arquitecturas": ["arm64", "amd64"],
        "so": ["macos", "windows", "linux"],
        "fuente": "Estimación desde ficha GitHub",
    }
    if area in ("ia-local",):
        base["ram_gb"] = 4
        base["vram_gb"] = 4
        base["gpu"] = "recomendada"
    return base


def _construir_paquete_lib(ficha: dict, recomendacion: dict) -> dict:
    """Construye un paquete en formato config/repos-libreria-*.json desde ficha + recomendación."""
    licencia = ficha.get("licencia") or "Desconocida"
    area = recomendacion["area_sistema"]
    esfuerzo = recomendacion["esfuerzo"]
    riesgo = recomendacion["riesgo"]
    version, fecha_version = _version_desde_ficha(ficha)
    canal = _canal_por_licencia(licencia)
    patron = _patron_tag_por_canal(canal)

    pkg = {
        "id": _pkg_id_desde_ficha(ficha),
        "repo": _repo_url_desde_ficha(ficha),
        "nombre": ficha.get("nombre_publico", "").split("/")[-1] if "/" in ficha.get("nombre_publico", "") else "desconocido",
        "titulo": recomendacion["que_adoptar"],
        "kind": _kind_por_esfuerzo(esfuerzo),
        "icono": _icono_por_area(area),
        "grupo": _grupo_por_area(area),
        "canal": canal,
        "licencia": licencia,
        "version_actual": version,
        "fecha_version": fecha_version,
        "estado": _estado_por_riesgo(riesgo),
        "actividad": _actividad_texto(ficha),
        "area": [area],
        "efecto": "HERRAMIENTA-AGENTE" if esfuerzo in ("S", "M") else "FUNCIONAL",
        "preinstalar": "siempre" if esfuerzo == "S" else "opcional",
        "claude": "no",
        "gratis": True,
        "gratis_motivo": _gratis_motivo(licencia, esfuerzo),
        "corre_aqui": _corre_aqui(esfuerzo, area),
        "que_es": ficha.get("que_hacen", "")[:400],
        "nota": f"Propuesta automática desde GitHub (ALC1113C). Riesgo: {riesgo}. Esfuerzo: {esfuerzo}. {recomendacion['por_que'][:200]}",
        "aviso": "SOLO guarda el enlace en la Librería (esperando-aprobacion). No instala ni ejecuta nada. Requiere aprobación manual en Genesis.",
        "requisitos": _requisitos_por_area(area, esfuerzo),
    }
    if patron:
        pkg["patron_tag"] = patron
    return pkg


def escribir_propuesta(fecha: date, recomendaciones: list[dict], salida_dir: str | Path) -> str:
    """Escribe propuesta-<fecha>.json con paquetes en esperando-aprobacion.
    No instala nada; solo genera el archivo de propuesta.
    """
    salida_dir = Path(salida_dir)
    salida_dir.mkdir(parents=True, exist_ok=True)

    # Leer fichas originales para construir paquetes completos
    # (En producción vienen del mismo proceso; aquí asumimos que recomendaciones traen _ficha_*)
    paquetes = []
    for rec in recomendaciones:
        # Reconstruir ficha mínima desde los campos guardados en la recomendación
        ficha_min = {
            "obj_id": rec.get("_ficha_obj_id", ""),
            "nombre_publico": rec.get("_ficha_nombre", ""),
            "licencia": rec.get("_ficha_licencia", ""),
            "que_hacen": rec.get("por_que", ""),
            "contenido_reciente": [{} for _ in range(rec.get("_actividad", 0))],
            "fuentes": [{"fecha": date.today().isoformat()}],
            "area_starseed": rec["area_sistema"],
        }
        pkg = _construir_paquete_lib(ficha_min, rec)
        paquetes.append(pkg)

    propuesta = {
        "ola": f"ALC1113C · Propuesta Librería {fecha.isoformat()}",
        "fecha": fecha.isoformat(),
        "principio": "Propuesta automática de alcance GitHub (ALC1113C). Instalar en la Librería SOLO registra el enlace (cero descarga, cero ejecución, cero clave). Estado 'esperando-aprobacion': requiere revisión y aprobación manual en Genesis antes de integrar.",
        "fusionadas": {},
        "duplicadas": {},
        "decisiones": [
            f"Generadas {len(paquetes)} recomendaciones desde fichas GitHub del {fecha.isoformat()}. "
            f"Todas con licencia compatible y riesgo bajo/medio. "
            f"Pendientes de aprobación en Genesis."
        ],
        "licencias_verificadas": {},
        "paquetes": paquetes,
    }

    archivo = salida_dir / f"propuesta-{fecha.isoformat()}.json"
    archivo.write_text(json.dumps(propuesta, ensure_ascii=False, indent=1), encoding="utf-8")
    return str(archivo)


# ─── Orquestación diaria ────────────────────────────────────────────────────

def _leer_fichas_dia(entrada_dir: Path, fecha: date) -> list[dict]:
    """Lee el archivo de fichas GitHub del día."""
    archivo = entrada_dir / f"{fecha.isoformat()}.json"
    if not archivo.exists():
        return []
    try:
        with open(archivo, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def procesar_dia(
    fecha: date,
    entrada_dir: str | Path,
    salida_dir: str | Path,
    *,
    encargar: Callable[..., Any] | None = None,
    seco: bool = False,
) -> dict:
    """Procesa las fichas del día, genera recomendaciones y escribe propuesta.
    
    Args:
        fecha: Día a procesar.
        entrada_dir: Directorio con fichas GitHub (starseed_memory_root/alcance/github/).
        salida_dir: Directorio donde escribir propuesta-<fecha>.json.
        encargar: Función `encargar_por_flota` inyectable (default: import real).
        seco: Si True, no escribe en disco ni encarga a la flota.
    
    Returns:
        Dict con ok, propuesta_archivo, recomendaciones, mensaje.
    """
    entrada_dir = Path(entrada_dir)
    salida_dir = Path(salida_dir)

    fichas = _leer_fichas_dia(entrada_dir, fecha)
    if not fichas:
        return {"ok": True, "mensaje": "Sin fichas para ese día", "recomendaciones": 0, "propuesta_archivo": None}

    # Generar recomendaciones
    recomendaciones = []
    for f in fichas:
        try:
            rec = recomendacion_desde_ficha(f)
            # Guardar metadatos de la ficha para construir paquete después
            rec["_ficha_obj_id"] = f.get("obj_id", "")
            rec["_ficha_nombre"] = f.get("nombre_publico", "")
            rec["_ficha_licencia"] = f.get("licencia", "")
            rec["_actividad"] = len(f.get("contenido_reciente") or [])
            recomendaciones.append(rec)
        except jsonschema.ValidationError:
            continue

    mejores = mejores_recomendaciones(fichas)

    if seco:
        return {"ok": True, "mensaje": "Seco: no escribe", "recomendaciones": len(mejores), "propuesta_archivo": None}

    # Escribir propuesta
    salida_dir.mkdir(parents=True, exist_ok=True)
    propuesta_archivo = escribir_propuesta(fecha, mejores, salida_dir)

    # Encargar a la flota gratuita para revisión/validación adicional (modo libre)
    if encargar is not None and mejores:
        try:
            # Crear tarea para la flota: validar la propuesta generada
            tarea_validacion = {
                "id": f"ALC1113C-VAL-{fecha.isoformat()}",
                "ola": "ALC1113C",
                "titulo": f"Validar propuesta Librería {fecha.isoformat()}",
                "archivos": [str(propuesta_archivo)],
                "depende": [],
                "prompt": f"Revisa la propuesta de librería en {propuesta_archivo}. Verifica: "
                          f"1) Todos los paquetes tienen licencia compatible con MIT/Apache-2.0. "
                          f"2) Formato correcto según config/repos-libreria-*.json. "
                          f"3) URLs https válidas. "
                          f"4) Esfuerzo y riesgo coherentes. "
                          f"5) No hay duplicados con librería actual. "
                          f"Devuelve JSON con 'ok': true/false y 'observaciones': [...].",
            }
            encargar(
                raiz=Path(__file__).parent.parent.parent,
                tareas=[tarea_validacion],
                fecha=fecha.isoformat(),
                ahora=datetime.now(timezone.utc),
                libre=(True, 100.0),  # Modo libre: análisis gratuito
            )
        except Exception:
            pass  # No bloquear si la flota no está disponible

    return {
        "ok": True,
        "mensaje": f"{len(mejores)} recomendaciones → propuesta escrita",
        "recomendaciones": len(mejores),
        "propuesta_archivo": str(propuesta_archivo),
    }


# ─── CLI ────────────────────────────────────────────────────────────────────

def main(argv=None):
    import argparse
    import sys

    ap = argparse.ArgumentParser(description="ALC1113C · Recomendaciones técnicas desde GitHub")
    ap.add_argument("orden", choices=["procesar", "estado"])
    ap.add_argument("--fecha", help="YYYY-MM-DD (default: hoy UTC)")
    ap.add_argument("--entrada", default="starseed_memory_root/alcance/github")
    ap.add_argument("--salida", default="starseed_memory_root/alcance/propuestas")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args(argv)

    if a.fecha:
        fecha = date.fromisoformat(a.fecha)
    else:
        fecha = datetime.now(timezone.utc).date()

    if a.orden == "procesar":
        # Usar la función importada al nivel de módulo
        encargar_fn = _encargar_por_flota_real if not a.seco else None
        r = procesar_dia(fecha, a.entrada, a.salida, encargar=encargar_fn, seco=a.seco)
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 0 if r["ok"] else 1

    # estado
    prop_file = Path(a.salida) / f"propuesta-{fecha.isoformat()}.json"
    if prop_file.exists():
        with open(prop_file, encoding="utf-8") as f:
            data = json.load(f)
        print(json.dumps({"ok": True, "existe": True, "paquetes": len(data.get("paquetes", []))}, ensure_ascii=False, indent=1))
    else:
        print(json.dumps({"ok": True, "existe": False}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())