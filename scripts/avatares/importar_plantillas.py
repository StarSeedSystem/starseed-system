#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Importador de plantillas de avatares 3D (AV1011L · architecture/astraura-avatares-3d.md §9-L).

Fuente con licencia CC0 COMPROBADA: Numinia Digital Goods
(repo PabloFMM/numinia-digital-goods-data, LICENSE = CC0-1.0, verificado 2026-10-13
vía API oficial de GitHub y texto del propio LICENSE).
100Avatars de Polygonal Mind quedó DESCARTADA: su README oficial dice
«puedes usarlos de base pero NO venderlos directamente» (restricción que CC0 no tiene)
y su web (100avatars.com) devuelve 404; sin CC0 verificable, no entra.

Solo descarga SI se pasa --descargar. Solo publica en la Biblioteca pública SI se
pasa --publicar (vía REST de Supabase: bucket `os-files` + tabla `library_public_items`,
la misma vía del OS). Claves SOLO por entorno: NOMBRES, nunca valores:
  STARSEED_SUPABASE_URL y STARSEED_SUPABASE_SECRET_KEY (service role).
"""

import json
import os
import sys
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / "scripts" / "avatares" / "descargas"
MAX_PLANTILLAS = 10
MAX_TOTAL_BYTES = 30 * 1024 * 1024          # 30 MB en total (plan gratis de Supabase)
MAX_FICHERO_BYTES = 12 * 1024 * 1024        # ninguna malla suelta pasa de 12 MB
MIME_VRM = "model/gltf-binary"
LICENCIA_URL = "https://github.com/PabloFMM/numinia-digital-goods-data/blob/main/LICENSE"
RAW = "https://raw.githubusercontent.com/PabloFMM/numinia-digital-goods-data/main/content"


@dataclass(frozen=True)
class Plantilla:
    """Una plantilla VRM de la colección, con su procedencia."""
    id: str
    nombre: str
    autor: str
    archivo: str            # nombre del .vrm en la colección
    miniatura: str          # nombre del .png en la colección
    bytes_vrm: int


# Juego inicial: 6 modelos (~24,6 MB) dentro de los límites 10 modelos / 30 MB.
COLECCION: tuple[Plantilla, ...] = (
    Plantilla("inicio-01", "Numinia Starter 01", "PabloFMM", "starter-avatar-01.vrm", "starter-avatar-01.png", 3928908),
    Plantilla("arla", "Avatar Arla", "PabloFMM", "avatar-arla-mncdhz3l.vrm", "avatar-arla-mncdhz3l.png", 3908872),
    Plantilla("procyon", "Avatar Procyon", "VIPE - Numen", "ndg-019d3ded-a1dd-7e0e-aeff-cb155bdff3d8.vrm", "ndg-019d3ded-a1dd-7e0e-aeff-cb155bdff3d8.png", 2608148),
    Plantilla("senet", "Avatar Senet 2026", "Numinia", "ndg-019d4060-770e-777c-ab25-aa7f2f198825.vrm", "ndg-019d4060-770e-777c-ab25-aa7f2f198825.png", 8906412),
    Plantilla("avocado", "Avocado", "Numinia", "ndg-019d4075-9ece-7d3e-aafa-41f81370eb63.vrm", "ndg-019d4075-9ece-7d3e-aafa-41f81370eb63.png", 1253352),
    Plantilla("aii", "Avatar AII Surprise", "Numinia", "ndg-019d4090-1aa3-7e61-ba8d-7c7d6ef532c3.vrm", "ndg-019d4090-1aa3-7e61-ba8d-7c7d6ef532c3.png", 3972524),
)

# --- funciones puras (probables sin red) ---


def es_glb(data: bytes) -> bool:
    """Un .vrm es un GLB: magia «glTF» y versión 2 en los 12 primeros bytes."""
    return len(data) >= 12 and data[0:4] == b"glTF" and int.from_bytes(data[4:8], "little") == 2


def ref_biblioteca(id_plantilla: str) -> str:
    """Referencia interna del ADN (contrato §2: nunca una URL externa suelta)."""
    return f"biblioteca:avatares/plantillas/{id_plantilla}.vrm"


def url_fuente(p: Plantilla, archivo: str) -> str:
    return f"{RAW}/{('avatars' if archivo.endswith('.vrm') else 'thumbnails')}/{archivo}"


def cabe_en_limites(tamanios: list[int]) -> tuple[bool, str]:
    """Comprueba el presupuesto: cuántas mallas y cuántos bytes cabe esperar."""
    if len(tamanios) > MAX_PLANTILLAS:
        return False, f"hay {len(tamanios)} plantillas y el límite es {MAX_PLANTILLAS}"
    total = sum(tamanios)
    if total > MAX_TOTAL_BYTES:
        return False, f"suman {total} bytes y el límite es {MAX_TOTAL_BYTES}"
    if any(t > MAX_FICHERO_BYTES for t in tamanios):
        return False, f"alguna malla supera {MAX_FICHERO_BYTES} bytes"
    return True, f"{len(tamanios)} plantillas, {total} bytes: dentro de los límites"


def procedencia_de(p: Plantilla) -> dict:
    """Procedencia que acompaña a cada archivo (licencia, autor, enlace)."""
    return {
        **asdict(p),
        "coleccion": "Numinia Digital Goods",
        "licencia": "CC0-1.0",
        "enlace_licencia": LICENCIA_URL,
        "enlace_modelo": url_fuente(p, p.archivo),
        "ref": ref_biblioteca(p.id),
    }


# --- descarga y publicación (solo con orden explícita) ---


def _descargar(url: str, destino: Path, limite: int) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": "starseed-avatares/1.0"})
    datos = urllib.request.urlopen(req, timeout=60).read(limite + 1)
    if len(datos) > limite:
        raise ValueError(f"{url} supera el límite de {limite} bytes")
    destino.write_bytes(datos)
    return len(datos)


def descargar_todo() -> None:
    ok, motivo = cabe_en_limites([p.bytes_vrm for p in COLECCION])
    if not ok:
        sys.exit(f"Plan de descarga rechazado: {motivo}")
    SALIDA.mkdir(parents=True, exist_ok=True)
    for p in COLECCION:
        destino = SALIDA / p.archivo
        n = _descargar(url_fuente(p, p.archivo), destino, MAX_FICHERO_BYTES)
        if not es_glb(destino.read_bytes()[:12]):
            destino.unlink()
            sys.exit(f"Formato no VRM/GLB válido: {p.archivo}")
        _descargar(url_fuente(p, p.miniatura), SALIDA / p.miniatura, 2 * 1024 * 1024)
        print(f"✔ {p.id}: {n} bytes verificados")
    (SALIDA / "procedencia.json").write_text(
        json.dumps([procedencia_de(p) for p in COLECCION], ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Procedencia guardada en {SALIDA / 'procedencia.json'}")


def publicar_todo() -> None:
    """Sube por REST a Supabase: storage `os-files` + `public.library_public_items`."""
    base = os.environ.get("STARSEED_SUPABASE_URL", "").rstrip("/")
    clave = os.environ.get("STARSEED_SUPABASE_SECRET_KEY", "")
    if not base or not clave:
        sys.exit("Faltan STARSEED_SUPABASE_URL / STARSEED_SUPABASE_SECRET_KEY en el entorno (solo nombres).")
    dueño = os.environ.get("STARSEED_OWNER_UID", "")
    if not dueño:
        sys.exit("Falta STARSEED_OWNER_UID (usuario dueño del ítem público).")
    for p in COLECCION:
        ruta_fichero = SALIDA / p.archivo
        if not ruta_fichero.exists():
            sys.exit(f"Primero descarga (--descargar): falta {p.archivo}")
        ruta = f"plantillas-avatares/{p.archivo}"
        req = urllib.request.Request(
            f"{base}/storage/v1/object/os-files/{ruta}", data=ruta_fichero.read_bytes(), method="POST",
            headers={"Authorization": f"Bearer {clave}", "Content-Type": MIME_VRM, "x-upsert": "true"})
        urllib.request.urlopen(req, timeout=120)
        fila = {"owner": dueño, "category": "design", "folder": "avatares/plantillas", "kind": "file",
                "name": p.nombre, "payload": {"url": f"{base}/storage/v1/object/public/os-files/{ruta}",
                "mime": MIME_VRM, "description": f"{p.nombre} · {p.autor} · CC0-1.0"},
                "tags": ["avatar", "vrm", "plantilla", "cc0"]}
        req = urllib.request.Request(f"{base}/rest/v1/library_public_items", method="POST",
            data=json.dumps(fila).encode(), headers={"Authorization": f"Bearer {clave}",
            "apikey": clave, "Content-Type": "application/json", "Prefer": "return=minimal"})
        urllib.request.urlopen(req, timeout=30)
        print(f"✔ publicado {p.id} → {ruta}")


def main() -> None:
    args = set(sys.argv[1:])
    if "--publicar" in args:
        publicar_todo()
    elif "--descargar" in args:
        descargar_todo()
    else:
        ok, motivo = cabe_en_limites([p.bytes_vrm for p in COLECCION])
        print(f"Plan (sin red): {motivo}")
        for p in COLECCION:
            print(f"  · {p.id} · {p.nombre} · {p.autor} · {p.bytes_vrm / 1048576:.1f} MB · CC0-1.0")
        print("Ordenes: --descargar (baja y verifica) · --publicar (sube a la Biblioteca pública)")
        if not ok:
            sys.exit(1)


if __name__ == "__main__":
    main()
