#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Parte diario de MetaGenesis para la síntesis de Claude nube (BZN1108C).

El LÍDER de dirección (`lider_direccion.soy_lider()`), una vez al día a las
07:30 de America/Mexico_City (y con `--ahora`), arma un parte compacto en JSON
(≤ 38.000 caracteres) con lo que la síntesis de Claude nube no ve sin la Mac:
- Foto de los medidores (tareas en curso, pendientes por ola, proveedores y
  cupos sin claves, salud de neuronas y contenedores)
- Colas activas y lo integrado en 24 h
- Salidas NUEVAS del agente Imaginación de referencias de diseño
  (`starseed_memory_root/imaginacion/agentes/referencias-diseno-*.json` de las
  últimas 24 h: título, enlace, por qué, área)
- Informes nuevos de directores y sueños (título y una línea)
- Estado por área del OS si el Mando lo tiene

Lo guarda como UNA fila de `metagenesis_buzon` con clase='parte',
estado='archivado', de='metagenesis-parte-diario', asunto='parte AAAA-MM-DD',
destino null y el JSON en `texto` (no va a Telegram).

Funciones puras: armar el parte a partir de diccionarios y recortarlo
conservando lo más reciente. Pruebas sin red. Nada personal ni de la lente de
seguridad-privacidad en el parte.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Añadir scripts/puente al path para importar módulos locales
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import lider_direccion
import nodo_metagenesis_medio as Nm
import nodo_metagenesis_logica as L

RAIZ = Path(__file__).resolve().parent.parent.parent
MAX_CHARS = 38000
ZONA_HORARIA = "America/Mexico_City"
HORA_PARTE = 7 * 3600 + 30 * 60  # 07:30 en segundos desde medianoche


# ─── Funciones puras ─────────────────────────────────────────────────────────────

def _ahora_local() -> datetime:
    """Hora actual en America/Mexico_City (sin dependencias externas)."""
    # UTC-6 o UTC-5 según horario de verano; usamos offset fijo -6h como aproximación
    # La precisión exacta no es crítica para la ventana de 24 h
    return datetime.now(timezone.utc).astimezone()


def _inicio_dia(ahora: datetime) -> datetime:
    """Inicio del día (00:00) en la zona horaria local."""
    return ahora.replace(hour=0, minute=0, second=0, microsecond=0)


def _es_ventana_parte(ahora: datetime) -> bool:
    """¿Estamos en la ventana del parte (07:30 ± 30 min)?"""
    segundos = ahora.hour * 3600 + ahora.minute * 60 + ahora.second
    return abs(segundos - HORA_PARTE) <= 1800


def _leer_json(ruta: Path, defecto: Any = None) -> Any:
    """Lee un JSON de disco; cualquier fallo devuelve el defecto."""
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return defecto


def _escribir_json_atomico(ruta: Path, datos: Any) -> None:
    """Escribe JSON atómicamente (tmp + replace)."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(ruta)


def _recortar_json(obj: Any, max_chars: int = MAX_CHARS) -> Any:
    """Recorta un objeto JSON conservando lo más reciente (claves con timestamps)."""
    texto = json.dumps(obj, ensure_ascii=False)
    if len(texto) <= max_chars:
        return obj
    # Estrategia: si es dict con lista, recortar la lista por timestamp
    if isinstance(obj, dict):
        resultado = {}
        for k, v in obj.items():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                # Ordenar por timestamp descendente si hay campo 't' o 'ts'
                v_ordenado = sorted(
                    v,
                    key=lambda x: (
                        x.get("ts") or x.get("t") or x.get("fecha") or ""
                    ),
                    reverse=True,
                )
                # Ir añadiendo hasta llenar
                for item in v_ordenado:
                    prueba = dict(resultado)
                    prueba[k] = resultado.get(k, []) + [item]
                    if len(json.dumps(prueba, ensure_ascii=False)) > max_chars:
                        break
                    resultado.setdefault(k, []).append(item)
            else:
                resultado[k] = v
        return resultado
    return obj


def _normalizar_proveedores(proveedores: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Quita claves y deja solo nombre, tipo, cupo, usado, disponible."""
    salida = []
    for p in proveedores or []:
        if not isinstance(p, dict):
            continue
        salida.append({
            "nombre": str(p.get("nombre") or p.get("id") or "")[:80],
            "tipo": str(p.get("tipo") or "")[:40],
            "cupo": p.get("cupo"),
            "usado": p.get("usado"),
            "disponible": p.get("disponible"),
        })
    return salida[:20]


def _normalizar_neuronas(neuronas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deja solo medio, modo, puntos, salud resumida, en_curso, contenedor."""
    salida = []
    for n in neuronas or []:
        if not isinstance(n, dict):
            continue
        salud = n.get("salud") or {}
        salida.append({
            "medio": str(n.get("medio") or "")[:20],
            "modo": str(n.get("modo") or "")[:20],
            "puntos": int(n.get("puntos") or 0),
            "ram_libre_mb": salud.get("ram_libre_mb"),
            "disco_gb": salud.get("disco_gb"),
            "carga": salud.get("carga"),
            "en_curso": n.get("en_curso"),
            "contenedor": n.get("contenedor"),
        })
    return salida[:15]


def _leer_referencias_imaginacion(raiz: Path, desde: float) -> List[Dict[str, Any]]:
    """Lee referencias-diseno-*.json de las últimas 24 h: título, enlace, por qué, área."""
    carpeta = raiz / "starseed_memory_root" / "imaginacion" / "agentes"
    if not carpeta.exists():
        return []
    salida = []
    for ruta in sorted(carpeta.glob("referencias-diseno-*.json"), reverse=True):
        try:
            mtime = ruta.stat().st_mtime
        except OSError:
            continue
        if mtime < desde:
            break
        datos = _leer_json(ruta, [])
        items = datos if isinstance(datos, list) else (datos or {}).get("referencias", [])
        for item in items or []:
            if not isinstance(item, dict):
                continue
            salida.append({
                "titulo": str(item.get("titulo") or item.get("title") or "")[:160],
                "enlace": str(item.get("enlace") or item.get("url") or "")[:300],
                "por_que": str(item.get("por_que") or item.get("why") or "")[:240],
                "area": str(item.get("area") or item.get("categoria") or "")[:60],
            })
    return salida[:30]


def _leer_informes_directores(raiz: Path, desde: float) -> List[Dict[str, str]]:
    """Lee informes de directores y sueños (título y una línea)."""
    carpeta = raiz / "starseed_memory_root" / "directores"
    if not carpeta.exists():
        return []
    salida = []
    for ruta in sorted(carpeta.glob("*.json"), reverse=True):
        try:
            mtime = ruta.stat().st_mtime
        except OSError:
            continue
        if mtime < desde:
            break
        datos = _leer_json(ruta, {})
        if not isinstance(datos, dict):
            continue
        titulo = str(datos.get("titulo") or datos.get("title") or ruta.stem)[:120]
        resumen = str(datos.get("resumen") or datos.get("summary") or "")[:200]
        salida.append({"titulo": titulo, "resumen": resumen})
    return salida[:20]


def _estado_areas_mando(raiz: Path) -> Dict[str, Any]:
    """Estado por área del OS si el Mando lo tiene (vigia-areas.json)."""
    ruta = raiz / "starseed_memory_root" / "mando" / "vigia-areas.json"
    datos = _leer_json(ruta, {})
    if not isinstance(datos, dict):
        return {}
    areas = datos.get("areas") if isinstance(datos.get("areas"), dict) else {}
    return {k: str(v)[:160] for k, v in areas.items()}


def _medidores_snapshot(raiz: Path, ahora: float) -> Dict[str, Any]:
    """Foto de los medidores (lo que ve Alex en Genesis)."""
    ruta = raiz / "starseed_memory_root" / "mando" / "vigia-medidores.json"
    datos = _leer_json(ruta, {})
    med = datos.get("medidores") if isinstance(datos, dict) else None
    if not isinstance(med, dict):
        return {}
    # Extraer solo resúmenes, sin datos extensos
    return {k: str(v.get("resumen") if isinstance(v, dict) else v)[:160] for k, v in med.items()}


def _colas_activas_y_integradas(raiz: Path, ahora: float) -> Dict[str, Any]:
    """Colas activas y lo integrado en 24 h."""
    olas = raiz / "starseed_memory_root" / "olas"
    progreso = _leer_json(olas / "progreso.json", {})
    if not isinstance(progreso, dict):
        return {"activas": [], "integradas_24h": 0}

    # Integradas en 24 h (commits en main con patrón "Ola … · ID:")
    try:
        import subprocess
        rc, out = subprocess.run(
            ["git", "log", "main", "--since=24 hours ago", "--format=%s"],
            cwd=raiz, capture_output=True, text=True, timeout=20
        )
        asuntos = out.splitlines() if rc == 0 else []
    except Exception:
        asuntos = []

    integradas = sum(1 for a in asuntos if L.es_integracion(a))

    # Colas fuente vivas
    colas = []
    fuente = raiz / "starseed_memory_root" / "colas-fuente"
    if fuente.exists():
        for n in sorted(fuente.glob("cola-*.json"), reverse=True):
            if n.name.startswith(("cola-auto-", "cola-suenos")):
                continue
            d = _leer_json(n, [])
            lista = d if isinstance(d, list) else (d or {}).get("tareas", [])
            pendientes = [t for t in lista or [] if isinstance(t, dict) and t.get("estado", "pendiente") == "pendiente"]
            if pendientes:
                colas.append({"cola": n.name[:-5], "pendientes": len(pendientes)})

    return {"activas": colas[:10], "integradas_24h": integradas}


def _armar_parte(
    medidores: Dict[str, Any],
    colas: Dict[str, Any],
    referencias: List[Dict[str, Any]],
    informes: List[Dict[str, str]],
    areas: Dict[str, Any],
    neuronas: List[Dict[str, Any]],
    proveedores: List[Dict[str, Any]],
    fecha: str,
) -> Dict[str, Any]:
    """Arma el parte completo como diccionario (función pura)."""
    return {
        "fecha": fecha,
        "medidores": medidores,
        "colas": colas,
        "referencias_imaginacion": referencias,
        "informes_directores": informes,
        "areas_os": areas,
        "neuronas": neuronas,
        "proveedores": proveedores,
    }


# ─── Acceso a Supabase (service_role) ────────────────────────────────────────────

def _credenciales_supabase() -> Optional[Tuple[str, str]]:
    """(url_base, service_role_key) desde archivos de entorno; None si falta."""
    for ruta in (
        Path.home() / ".starseed" / "env",
        RAIZ / ".env.local",
        Path("/etc/starseed/env"),
    ):
        if not ruta.exists():
            continue
        try:
            with open(ruta, encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    if linea.startswith("export "):
                        linea = linea[7:]
                    k, v = linea.split("=", 1)
                    k = k.strip().replace("export ", "")
                    if k == "NEXT_PUBLIC_SUPABASE_URL":
                        url = v.strip().strip('"').strip("'").rstrip("/")
                    elif k == "SUPABASE_SERVICE_ROLE_KEY":
                        clave = v.strip().strip('"').strip("'")
        except OSError:
            continue
    # También leer del entorno del proceso
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    clave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if url.startswith("https://") and clave:
        return (url, clave)
    return None


def _insertar_parte_supabase(texto: str, fecha: str, cred: Tuple[str, str]) -> bool:
    """Inserta la fila 'parte' en metagenesis_buzon. True si OK."""
    url_base, clave = cred
    fila = {
        "clase": "parte",
        "de": "metagenesis-parte-diario",
        "destino": None,
        "asunto": f"parte {fecha}",
        "texto": texto,
        "estado": "archivado",
    }
    req = urllib.request.Request(
        f"{url_base}/rest/v1/metagenesis_buzon?on_conflict=id",
        json.dumps(fila).encode("utf-8"),
        {
            "apikey": clave,
            "Authorization": f"Bearer {clave}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
            "User-Agent": "starseed-parte-diario/1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        return False


# ─── Principal ───────────────────────────────────────────────────────────────────

def construir_parte(raiz: Optional[Path] = None, ahora: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """Construye el parte (función pura salvo lectura de archivos)."""
    raiz = raiz or RAIZ
    ahora = ahora or time.time()
    dt_ahora = datetime.fromtimestamp(ahora, tz=timezone.utc).astimezone()
    fecha = dt_ahora.strftime("%Y-%m-%d")
    inicio_dia_ts = _inicio_dia(dt_ahora).timestamp()
    hace_24h = ahora - 86400

    # 1. Medidores
    medidores = _medidores_snapshot(raiz, ahora)

    # 2. Colas activas e integradas
    colas = _colas_activas_y_integradas(raiz, ahora)

    # 3. Referencias de imaginación (últimas 24 h)
    referencias = _leer_referencias_imaginacion(raiz, hace_24h)

    # 4. Informes de directores y sueños
    informes = _leer_informes_directores(raiz, hace_24h)

    # 5. Estado por áreas del Mando
    areas = _estado_areas_mando(raiz)

    # 6. Neuronas (desde el último latido guardado en la puerta o archivo local)
    neuronas = []
    # TODO: leer de la foto más reciente si está disponible

    # 7. Proveedores (sin claves)
    proveedores = []

    parte = _armar_parte(medidores, colas, referencias, informes, areas, neuronas, proveedores, fecha)
    return _recortar_json(parte)


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(prog="parte_diario_metagenesis", description="Parte diario MetaGenesis → Supabase")
    p.add_argument("--ahora", action="store_true", help="fuerza la generación aunque no sea la hora")
    p.add_argument("--seco", action="store_true", help="solo construye y muestra el JSON, no escribe en Supabase")
    args = p.parse_args(argv)

    # Verificar si somos líder
    lider = lider_direccion.soy_lider()
    if not lider.get("soy"):
        print(f"No soy líder: {lider.get('motivo')}", file=sys.stderr)
        return 0  # No es error, solo no toca

    ahora = time.time()
    dt_ahora = datetime.fromtimestamp(ahora, tz=timezone.utc).astimezone()

    if not args.ahora and not _es_ventana_parte(dt_ahora):
        print("Fuera de ventana (07:30 ± 30 min). Usa --ahora para forzar.", file=sys.stderr)
        return 0

    parte = construir_parte(ahora=ahora)
    if not parte:
        print("No se pudo construir el parte", file=sys.stderr)
        return 1

    texto = json.dumps(parte, ensure_ascii=False)
    if len(texto) > MAX_CHARS:
        print(f"Parte demasiado largo ({len(texto)} > {MAX_CHARS})", file=sys.stderr)
        return 1

    if args.seco:
        print(texto)
        return 0

    cred = _credenciales_supabase()
    if not cred:
        print("Faltan credenciales de Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)", file=sys.stderr)
        return 1

    fecha = dt_ahora.strftime("%Y-%m-%d")
    ok = _insertar_parte_supabase(texto, fecha, cred)
    if not ok:
        print("Falló la inserción en Supabase", file=sys.stderr)
        return 1

    print(f"Parte {fecha} guardado en metagenesis_buzon")
    return 0


if __name__ == "__main__":
    sys.exit(main())