"""Analista de pruebas, etapa 1 (BAP1127N · §6.5). PURO: reglas deterministas sobre la evidencia de una prueba.

reglas(evidencia) → hallazgos; propuesta(hallazgo, id_prueba) → JSON tipado.
Entrada: {"logs": {aparato: [líneas]}, "censo": {aparato: {"disco_libre_mb", "ram_libre_mb"}}, "humo": {aparato: bool}}.
Nunca propone tocar archivos protegidos (§8) ni rutas con «..» o absolutas.
"""
from __future__ import annotations

import re
from typing import Any

PROTEGIDOS = (
    "scripts/puente/autopublicar.py", "scripts/puente/produccion_puertas.py", "scripts/puente/commit-seguro.py",
    "scripts/puente/libro_firmas.py", "scripts/puente/evaluador_pruebas_logica.py",
    "scripts/puente/lanzamientos_logica.py", "scripts/puente/jev_reservadas.py",
    "scripts/puente/bap_bucle_logica.py", "config/firmantes.json", ".github/workflows/",
    "starseed_memory_root/pruebas/bateria-", "config/umbrales-pruebas.json",
)
DISCO_MIN_MB = 1024
RAM_MIN_MB = 150
TIPOS = ("arreglo", "ajuste", "investigar")

#: (regex, síntoma, causa probable, archivos sospechosos, tipo, confianza)
PATRONES = (
    (r"webrtc.*(timeout|timed out)|ice.*(failed|timeout)", "Timeout de WebRTC",
     "la negociación ICE no cierra entre las neuronas", ["src/lib/network/malla-neuronas.ts"], "arreglo", 0.7),
    (r"sin ruta|no route|ruta no disponible", "Sin ruta al aparato",
     "el router de transportes no halla camino", ["src/ai/astraura/mesh/synaptic-router.ts"], "investigar", 0.6),
    (r"capa .*(cay[oó]|caída|down|lost)|layer .*(down|lost)", "Caída de una capa",
     "una capa de la malla se cae y no se recupera", ["src/ai/astraura/mesh/sync.ts"], "arreglo", 0.6),
    (r"permission denied|permiso denegado|notallowederror|eacces", "Permiso negado",
     "el aparato no concedió el permiso pedido", ["src/lib/neurons/presencia.ts"], "ajuste", 0.65),
)


def _ruta_segura(ruta: str) -> bool:
    if not isinstance(ruta, str) or not ruta or ruta.startswith(("/", "~")) or ".." in ruta.split("/"):
        return False
    return not any(ruta.startswith(p) or ruta == p.rstrip("/") for p in PROTEGIDOS)


def _hallazgo(aparato: str, sintoma: str, causa: str, archivos: list[str], tipo: str, confianza: float,
              evidencia: list[str]) -> dict[str, Any]:
    return {"aparato": aparato, "sintoma": sintoma, "causa_probable": causa, "archivos_sospechosos": archivos,
            "tipo": tipo, "confianza": confianza, "evidencia": evidencia[:5]}


def _por_patrones(aparato: str, lineas: list[str]) -> list[dict[str, Any]]:
    hallazgos = []
    for regex, sintoma, causa, archivos, tipo, confianza in PATRONES:
        citadas = [x.strip()[:200] for x in lineas if re.search(regex, x, re.I)]
        if citadas:
            hallazgos.append(_hallazgo(aparato, sintoma, causa, archivos, tipo, confianza, citadas))
    return hallazgos


def _por_censo(aparato: str, censo: dict[str, Any], humo: Any) -> list[dict[str, Any]]:
    hallazgos = []
    disco, ram = censo.get("disco_libre_mb"), censo.get("ram_libre_mb")
    if isinstance(disco, (int, float)) and disco < DISCO_MIN_MB:
        hallazgos.append(_hallazgo(aparato, "Disco bajo", "poco espacio libre en el aparato", [], "investigar",
                                   0.9, [f"disco_libre_mb={disco}"]))
    if isinstance(ram, (int, float)) and ram < RAM_MIN_MB:
        hallazgos.append(_hallazgo(aparato, "Memoria baja", "poca RAM libre en el aparato", [], "investigar",
                                   0.9, [f"ram_libre_mb={ram}"]))
    if humo is False:
        hallazgos.append(_hallazgo(aparato, "Humo malo", "la comprobación de humo falló", [], "investigar",
                                   0.8, ["humo=false"]))
    return hallazgos


def reglas(evidencia: dict[str, Any]) -> list[dict[str, Any]]:
    """Hallazgos deterministas de toda la evidencia, un aparato tras otro."""
    ev = evidencia if isinstance(evidencia, dict) else {}
    logs, censo, humo = ev.get("logs") or {}, ev.get("censo") or {}, ev.get("humo") or {}
    salida: list[dict[str, Any]] = []
    for aparato in sorted(set(logs) | set(censo) | set(humo)):
        salida += _por_patrones(aparato, [str(x) for x in logs.get(aparato) or []])
        salida += _por_censo(aparato, censo.get(aparato) or {}, humo.get(aparato))
    return salida


def propuesta(hallazgo: dict[str, Any], id_prueba: str) -> dict[str, Any]:
    """JSON tipado §6.5. Quita archivos protegidos o inseguros; sin archivos, el tipo baja a «investigar»."""
    archivos = [a for a in hallazgo.get("archivos_sospechosos") or [] if _ruta_segura(a)]
    tipo = hallazgo.get("tipo") if hallazgo.get("tipo") in TIPOS else "investigar"
    if not archivos:
        tipo = "investigar"
    confianza = hallazgo.get("confianza")
    return {"id_prueba": id_prueba, "aparato": hallazgo.get("aparato", ""), "sintoma": hallazgo.get("sintoma", ""),
            "causa_probable": hallazgo.get("causa_probable", ""), "archivos_sospechosos": archivos,
            "confianza": min(1.0, max(0.0, float(confianza))) if isinstance(confianza, (int, float)) else 0.0,
            "evidencia": list(hallazgo.get("evidencia") or [])[:5], "tipo": tipo}
