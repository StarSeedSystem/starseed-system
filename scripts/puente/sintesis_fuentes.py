# -*- coding: utf-8 -*-
"""Fuentes del contexto común de la síntesis diaria (SDP1111A · §3.2).
Dada `raiz`, reúne del DISCO (sin red, todo inyectable): las 3 últimas síntesis con su
sección «Mañana» (y la rotación que de ellas sale: 2 vídeos de los 15, 2-3 contactos y
1 categoría, sin repetir lo de las 3 últimas), las salidas de Imaginación de 24 h, los
informes de directores y sueños, y el resumen de actividad si existe (privado)."""
from __future__ import annotations
import json, os, re, time
from datetime import datetime
from typing import Any, Dict, List, Optional

REL_SINTESIS = "starseed_memory_root/produccion-audiovisual/sintesis"
REL_IMAGINACION = "starseed_memory_root/imaginacion/agentes"
REL_DIRECTORES = "starseed_memory_root/directores"
REL_SUENOS = "starseed_memory_root/dream/profundo"
CONTACTOS_INICIALES = ["Cole Hastings", "Sunseed", "Damanhur"]
INDICE_VIDEOS = [str(i) for i in range(1, 16)]  # el índice: 15 vídeos, por posición
VENTANA_S = 86400.0  # 24 h
RE_SINTESIS = re.compile(r"\d{4}-\d{2}-\d{2}\.md")
RE_MAÑANA = re.compile(r"^#{1,3}\s*Mañana\s*$", re.M)
RE_TROZO = re.compile(r"[^\W\d_]+|\d+", re.UNICODE)

def _leer(ruta: str, tipo: str = "texto") -> Any:
    """Lee un archivo del disco: texto o JSON; ante fallo, cadena vacía o None."""
    try:
        with open(ruta, "r", encoding="utf-8") as f: return json.load(f) if tipo == "json" else f.read()
    except (OSError, ValueError):
        return None if tipo == "json" else ""

def _mtime(ruta: str) -> float:
    try: return os.stat(ruta).st_mtime
    except OSError: return 0.0

def seccion_manana(texto: str) -> str:
    """Lo que la síntesis pasada dejó para «Mañana», hasta el siguiente encabezado. PURA."""
    m = RE_MAÑANA.search(texto or "")
    if not m: return ""
    resto = texto[m.end():]
    corte = re.search(r"^#{1,3}\s+\S", resto, re.M)
    return (resto[:corte.start()] if corte else resto).strip("\n")

def sintesis_previas(raiz: str, limite: int = 3) -> List[Dict[str, str]]:
    """Las últimas síntesis (AAAA-MM-DD.md), la más reciente al final."""
    carpeta = os.path.join(raiz, REL_SINTESIS)
    try: nombres = sorted(n for n in os.listdir(carpeta) if RE_SINTESIS.fullmatch(n))
    except OSError: return []
    salidas: List[Dict[str, str]] = []
    for nombre in nombres[-max(0, limite):]:
        ruta = os.path.join(carpeta, nombre); texto = str(_leer(ruta) or "")
        salidas.append({"fecha": nombre[:-3], "ruta": ruta, "texto": texto, "manana": seccion_manana(texto)})
    return salidas

def rotacion(mananas: List[str], indice_videos: Optional[List[str]] = None,
             contactos: Optional[List[str]] = None, categorias: Optional[List[str]] = None) -> Dict[str, Any]:
    """2 vídeos de los 15, 2-3 contactos y 1 categoría, sin repetir lo de las 3 últimas. PURA."""
    videos = list(indice_videos) if indice_videos else list(INDICE_VIDEOS)
    contactos = list(contactos) if contactos else list(CONTACTOS_INICIALES)
    # Se quitan fechas y años antes de trocear: «2026-11-11» no es el vídeo 11.
    usados = {t for manana in (mananas or []) for t in RE_TROZO.findall(re.sub(r"\d{4}-\d{2}-\d{2}|\b\d{4}\b", " ", manana))}
    texto = "\n".join(mananas or []).lower()
    # La rotación avanza: sigue al último vídeo usado (o arranca en el 4 si no hay previas).
    pos = [i for i, v in enumerate(videos) if v in usados]
    inicio = (pos[-1] + 1) % len(videos) if pos else 3 % max(1, len(videos))
    orden = videos[inicio:] + videos[:inicio]
    return {"videos": [v for v in orden if v not in usados][:2],
            "contactos": [c for c in contactos if c.lower() not in texto][:3],
            "categoria": next((c for c in (categorias or []) if c.lower() not in texto), None)}

def _recientes(carpeta: str, ahora: float, ventana_s: float, patron: str) -> List[str]:
    """Nombres del patrón modificados dentro de la ventana, del viejo al nuevo."""
    dentro = []
    for n in sorted(os.listdir(carpeta)) if os.path.isdir(carpeta) else []:
        if re.fullmatch(patron, n) and _mtime(os.path.join(carpeta, n)) >= ahora - ventana_s: dentro.append(n)
    return dentro

def salidas_imaginacion(raiz: str, ahora: float, ventana_s: float = VENTANA_S) -> List[Dict[str, Any]]:
    """Lo que la flota de Imaginación devolvió en las últimas 24 h (agentes/*.json)."""
    carpeta = os.path.join(raiz, REL_IMAGINACION)
    salidas: List[Dict[str, Any]] = []
    for nombre in _recientes(carpeta, ahora, ventana_s, r".+\.json"):
        datos = _leer(os.path.join(carpeta, nombre), "json")
        salidas.append({"archivo": nombre, "agente": datos.get("agente") if isinstance(datos, dict) else None,
                        "datos": datos})
    return salidas[:30]

def informes_directores(raiz: str, ahora: float, ventana_s: float = VENTANA_S) -> List[Dict[str, str]]:
    """Informes de directores nuevos (directores/*.json): título y una línea."""
    carpeta = os.path.join(raiz, REL_DIRECTORES)
    salidas = []
    for nombre in _recientes(carpeta, ahora, ventana_s, r".+\.json"):
        datos = _leer(os.path.join(carpeta, nombre), "json")
        if not isinstance(datos, dict): continue
        salidas.append({"titulo": str(datos.get("titulo") or nombre[:-5])[:160], "resumen": str(datos.get("resumen") or "")[:240]})
    return salidas[:20]

def informes_suenos(raiz: str, ahora: float, ventana_s: float = VENTANA_S) -> List[Dict[str, str]]:
    """Informes de sueños profundos nuevos: dream/profundo/<sesión>/INFORME.md."""
    carpeta = os.path.join(raiz, REL_SUENOS)
    sesiones = sorted(n for n in os.listdir(carpeta) if os.path.isdir(os.path.join(carpeta, n))) \
        if os.path.isdir(carpeta) else []
    return [{"sesion": s, "ruta": os.path.join(carpeta, s, "INFORME.md")}
            for s in sesiones if _mtime(os.path.join(carpeta, s, "INFORME.md")) >= ahora - ventana_s][:10]

def resumen_actividad(ahora: Optional[float] = None, carpeta: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """El resumen de actividad personal del día, si existe (privado, fuera de la raíz)."""
    dt = datetime.fromtimestamp(ahora if ahora is not None else time.time())
    carpeta = carpeta or os.path.join(os.path.expanduser("~"), ".starseed", "actividad")
    datos = _leer(os.path.join(carpeta, "resumen-%s.json" % dt.strftime("%Y-%m-%d")), "json")
    return datos if isinstance(datos, dict) else None

def contexto_comun(raiz: str, ahora: Optional[float] = None, indice_videos: Optional[List[str]] = None,
                   contactos: Optional[List[str]] = None, categorias: Optional[List[str]] = None,
                   carpeta_actividad: Optional[str] = None) -> Dict[str, Any]:
    """Todo el contexto común de §3.2 en un dict: previas, rotación y fuentes del día."""
    t = time.time() if ahora is None else ahora
    previas = sintesis_previas(raiz)
    return {"fecha": datetime.fromtimestamp(t).strftime("%Y-%m-%d"), "sintesis_previas": previas,
            "rotacion": rotacion([p["manana"] for p in previas], indice_videos, contactos, categorias),
            "imaginacion": salidas_imaginacion(raiz, t), "informes_directores": informes_directores(raiz, t),
            "informes_suenos": informes_suenos(raiz, t), "actividad": resumen_actividad(t, carpeta_actividad)}
