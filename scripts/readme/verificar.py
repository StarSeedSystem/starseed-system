#!/usr/bin/env python3
"""
scripts/readme/verificar.py

Verificación de la portada del README (RDM1113, §5):
- Enlaces (descargas con 200/302 y anclas internas)
- Textos alternativos
- Peso de los recursos
- Términos internos en el primer pantallazo

Salida: informe en starseed_memory_root/revision/readme-1113/
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

RAIZ = Path(__file__).parent.parent.parent

@dataclass
class Enlace:
    texto: str
    url: str
    tipo: str
    es_interna: bool = False

@dataclass
class Recurso:
    archivo: str
    tipo: str
    peso_bytes: int
    peso_kb: float = field(init=False)
    es_valido: bool = True
    errores: list[str] = field(default_factory=list)

    def __post_init__(self):
        self.peso_kb = self.peso_bytes / 1024

@dataclass
class Verificacion:
    enlaces_validos: list[Enlace]
    enlaces_rotos: list[Enlace]
    anclas_faltantes: list[str]
    recursos: list[Recurso]
    terminos_internos: list[str]
    errores: list[str] = field(default_factory=list)

def extraer_enlaces(contenido: str) -> list[Enlace]:
    """Extrae enlaces del markdown/HTML."""
    enlaces = []
    for match in re.finditer(r'\[([^\]]+)\]\(([^)]+)\)', contenido):
        texto, url = match.groups()
        if not url.startswith('(') and not url.startswith('#'):
            es_interna = url.startswith('#') or url.startswith('/')
            tipo = "descarga" if any(x in url for x in [".dmg", ".exe", ".msi", ".AppImage", ".deb", ".rpm", ".apk"]) else "web"
            if not es_interna and url.startswith("http"):
                enlaces.append(Enlace(texto=texto or url, url=url, tipo=tipo, es_interna=es_interna))
    return enlaces

def extraer_anclas(contenido: str) -> set[str]:
    """Extrae IDs de anclas del markdown/HTML."""
    ids = set()
    ids.update(re.findall(r'^#\s+(.+)$', contenido, re.MULTILINE))
    ids.update(re.findall(r'id="([^"]+)"', contenido))
    ids.update(re.findall(r'\[([^\]]+)\]\(#([^)]+)\)', contenido))
    return ids

def extraer_textos_alternativos(contenido: str) -> dict[str, str]:
    """Extrae pares alt=texto de imágenes."""
    textos = {}
    for match in re.finditer(r'!\[([^\]]*)\]\(([^)]+)\)', contenido):
        alt, url = match.groups()
        if alt:
            textos[url] = alt
    return textos

def extraer_terminos_internos(contenido: str) -> list[str]:
    """Busca términos internos del StarSeed sin explicar en el primer pantallazo."""
    terminos = [
        "SOSD", "Trinidad", "Astraura", "Ontocracia", "Ciberdelia",
        "Transhumanismo Comunista", "Exocórtex", "Malla Neural",
        "Supabase Realtime", "Syncthing", "LoRa", "Meshtastic",
        "AGPL-3.0", "Next.js", "React", "TypeScript", "Tauri"
    ]
    return [t for t in terminos if t in contenido]

def verificar_recurso(ruta: Path) -> Recurso:
    """Verifica un recurso SVG/WebP."""
    if not ruta.exists():
        return Recurso(archivo=ruta.name, tipo=ruta.suffix, peso_bytes=0, es_valido=False, errores=["Archivo no encontrado"])
    stat = ruta.stat()
    recurso = Recurso(archivo=ruta.name, tipo=ruta.suffix, peso_bytes=stat.st_size)
    if ruta.suffix == ".svg":
        if stat.st_size > 150 * 1024:
            recurso.es_valido = False
            recurso.errores.append(f"Peso {stat.st_size/1024:.1f} KB > 150 KB")
    return recurso

async def fetch_url(url: str) -> tuple[int, int]:
    """Devuelve (status_code, size_bytes). 200 o 302 son válidos."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "StarSeed-README-verifier/1.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            contenido = await asyncio.to_thread(response.read)
            return response.status, len(contenido)
    except urllib.error.HTTPError as e:
        return e.code, 0
    except Exception:
        return 0, 0

async def verificar_enlaces(enlaces: list[Enlace]) -> tuple[list[Enlace], list[Enlace]]:
    """Verifica enlaces devolviendo válidos y rotos."""
    validos = []
    rotos = []
    for enlace in enlaces:
        if enlace.es_interna:
            validos.append(enlace)
            continue
        status, _ = await fetch_url(enlace.url)
        if status in (200, 302):
            validos.append(enlace)
        else:
            rotos.append(enlace)
    return validos, rotos

def verificar_anclas(contenido: str) -> list[str]:
    """Verifica anclas internas."""
    enlaces = extraer_enlaces(contenido)
    enlaces_internos = [e for e in enlaces if e.es_interna]
    anclas_definidas = extraer_anclas(contenido)
    faltantes = []
    for enlace in enlaces_internos:
        id_ancla = enlace.url.lstrip('#')
        if id_ancla not in anclas_definidas:
            faltantes.append(enlace.url)
    return faltantes

async def main() -> int:
    readme_es = RAIZ / "README.md"
    if not readme_es.exists():
        print("ERROR: README.md no encontrado", file=sys.stderr)
        return 1
    contenido_es = readme_es.read_text(encoding="utf-8")
    if (RAIZ / "README.en.md").exists():
        contenido_en = (RAIZ / "README.en.md").read_text(encoding="utf-8")
    else:
        contenido_en = contenido_es

    enlaces = extraer_enlaces(contenido_es)
    enlaces_validos, enlaces_rotos = await verificar_enlaces(enlaces)
    anclas_faltantes = verificar_anclas(contenido_es)
    textos_alternativos = extraer_textos_alternativos(contenido_es)
    terminos_internos = extraer_terminos_internos(contenido_es[:2000])

    assets_dir = RAIZ / "assets" / "readme"
    recursos = []
    for ext in ["svg", "webp", "png", "jpg", "gif"]:
        for ruta in assets_dir.glob(f"**/*.{ext}"):
            recursos.append(verificar_recurso(ruta))

    destino = RAIZ / "starseed_memory_root" / "revision" / "readme-1113"
    destino.mkdir(parents=True, exist_ok=True)
    informe = {
        "fecha": datetime.now().isoformat(),
        "enlaces": {
            "validos": len(enlaces_validos),
            "rotos": len(enlaces_rotos),
        },
        "anclas": {
            "faltantes": anclas_faltantes,
        },
        "recursos": [
            {"archivo": r.archivo, "tipo": r.tipo, "peso_kb": r.peso_kb, "ok": r.es_valido, "errores": r.errores}
            for r in recursos
        ],
        "terminos_internos": terminos_internos,
    }
    (destino / "informe.json").write_text(json.dumps(informe, indent=2), encoding="utf-8")
    print(f"Verificación completada. Informe: {destino / 'informe.json'}")
    return 0 if not enlaces_rotos and not anclas_faltantes else 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))