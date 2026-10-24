#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía descubridor de modelos por área (Ola 1016M · VGM1016B).

`descubrir(area, catalogo_ids, http_get, ahora)` busca en la API pública de Hugging Face
los modelos que merecen entrar en el catálogo de un área, usando cuatro fuentes:
  1. tendencia por etiqueta (`sort=trendingScore`, nunca solo `sort=likes`);
  2. familias vigiladas por autor (`sort=createdAt`, solo los últimos 60 días);
  3. hermanos de lo que ya está en el catálogo (`Qwen-Image-2.1` → `-Turbo`, `-Edit`);
  4. cuantizados de cada candidato (unsloth, city96, QuantStack…).

Los detalles de archivos salen de `models/<id>?blobs=true` (tamaño y `lfs.sha256`).
Reglas duras: máximo 120 peticiones por pasada, pausa de 1 s entre ellas, sin claves
salvo el NOMBRE `HF_TOKEN` (se lee del entorno en cada petición, nunca se escribe) y
fuera los re-subidos «uncensored»/«abliterated»/NSFW o sin autor reconocible.
Red, reloj y pausa son inyectables para probar sin conexión.
"""

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode

API = "https://huggingface.co/api"
LIMITE_PETICIONES = 120
PAUSA_S = 1.0
DIAS_AUTOR = 60
MAX_HERMANOS = 12
CUANTIZADORES = ("unsloth", "city96", "QuantStack", "bartowski",
                 "lmstudio-community", "mlx-community", "onnx-community", "Comfy-Org")
# Re-subidas de terceros que nunca entran (§3 del contrato).
_PROHIBIDO = re.compile(r"uncensored|abliterated|nsfw|not[-_ ]for[-_ ]all[-_ ]audiences", re.I)


class _Cliente:
    """Cuenta las peticiones, respeta el tope y la pausa, y añade `HF_TOKEN` si existe."""

    def __init__(self, http_get, dormir, limite):
        self.http_get = http_get
        self.dormir = dormir
        self.limite = max(0, int(limite))
        self.peticiones = 0

    @property
    def restantes(self):
        return max(0, self.limite - self.peticiones)

    @property
    def agotado(self):
        return self.restantes == 0

    def json(self, ruta):
        """GET a `API + ruta`; devuelve el JSON ya leído o None (error, tope o cuerpo roto)."""
        if self.agotado:
            return None
        if self.peticiones and self.dormir:
            self.dormir(PAUSA_S)
        self.peticiones += 1
        token = (os.environ.get("HF_TOKEN") or "").strip()
        cabeceras = {"Authorization": "Bearer " + token} if token else {}
        try:
            cuerpo = self.http_get(API + ruta, headers=cabeceras, timeout=30)
        except Exception:  # noqa: BLE001 - una fuente caída no tumba la pasada
            return None
        return _json(cuerpo)


def _json(cuerpo):
    """Parsea el cuerpo (str o bytes) de Hugging Face; None si no es JSON."""
    if cuerpo is None:
        return None
    if isinstance(cuerpo, (bytes, bytearray)):
        cuerpo = cuerpo.decode("utf-8", "replace")
    try:
        return json.loads(cuerpo)
    except (TypeError, ValueError):
        return None


def _lista(datos):
    """Normaliza una respuesta de HF a lista de objetos."""
    if isinstance(datos, list):
        return [m for m in datos if isinstance(m, dict)]
    if isinstance(datos, dict):
        for clave in ("results", "objects", "siblings"):
            if isinstance(datos.get(clave), list):
                return [m for m in datos[clave] if isinstance(m, dict)]
    return []


def _nombre(modelo_id):
    """Parte final del id: `Qwen/Qwen-Image-2.1` → `Qwen-Image-2.1`."""
    return str(modelo_id or "").rsplit("/", 1)[-1]


def _autor(modelo, modelo_id=""):
    """Autor declarado o deducido del prefijo del id; vacío si no se reconoce."""
    autor = modelo.get("author") if isinstance(modelo, dict) else None
    if isinstance(autor, str) and autor.strip():
        return autor.strip()
    modelo_id = str(modelo_id or "")
    return modelo_id.split("/", 1)[0] if "/" in modelo_id else ""


def _aceptable(modelo_id, autor):
    """Fuera re-subidas «uncensored/abliterated/NSFW» y modelos sin autor reconocible."""
    return bool(modelo_id) and bool(autor) and not _PROHIBIDO.search(str(modelo_id))


def _licencia(modelo):
    """Licencia según `cardData`, campo directo o etiqueta `license:*`."""
    card = modelo.get("cardData")
    if isinstance(card, dict) and card.get("license"):
        return str(card["license"])
    if modelo.get("license"):
        return str(modelo["license"])
    for etiqueta in modelo.get("tags") or []:
        if isinstance(etiqueta, str) and etiqueta.startswith("license:"):
            return etiqueta.split(":", 1)[1]
    return ""


def _gated(valor):
    """HF devuelve bool o «auto»/«manual»; normaliza a booleano."""
    if isinstance(valor, bool):
        return valor
    return str(valor).strip().lower() not in ("", "false", "no", "none")


def _archivos(siblings):
    """[{nombre, bytes?, sha256?}] a partir de `siblings` de `models/<id>?blobs=true`."""
    archivos = []
    for f in siblings or []:
        if not isinstance(f, dict):
            continue
        lfs = f.get("lfs") if isinstance(f.get("lfs"), dict) else {}
        archivo = {"nombre": str(f.get("rfilename") or f.get("filename") or "")}
        bytes_ = f.get("size", lfs.get("size"))
        if isinstance(bytes_, int) and bytes_ >= 0:
            archivo["bytes"] = bytes_
        sha = lfs.get("sha256") or f.get("sha256")
        if sha:
            archivo["sha256"] = str(sha)
        archivos.append(archivo)
    return archivos


def _fecha(texto):
    """ISO 8601 de HF → datetime UTC; None si no se entiende."""
    if not texto:
        return None
    try:
        fecha = datetime.fromisoformat(str(texto).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return fecha if fecha.tzinfo else fecha.replace(tzinfo=timezone.utc)


def _a_utc(ahora):
    """El reloj inyectado, siempre con zona UTC."""
    if ahora is None:
        return datetime.now(timezone.utc)
    if isinstance(ahora, datetime):
        return ahora if ahora.tzinfo else ahora.replace(tzinfo=timezone.utc)
    fecha = _fecha(ahora)
    return fecha or datetime.now(timezone.utc)


def _ruta(**parametros):
    """Ruta relativa con parámetros en el orden recibido (la URL se lee tal cual)."""
    return "/models?" + urlencode(parametros)


def _detalle(id_):
    """Ruta del detalle con blobs; el id conserva su barra."""
    return "/models/" + quote(str(id_), safe="/") + "?blobs=true"


def _candidato(modelo, etiqueta=""):
    """Contrato de candidato común a las cuatro fuentes (los archivos llegan del detalle)."""
    id_ = str(modelo.get("id") or "")
    return {
        "id": id_,
        "autor": _autor(modelo, id_),
        "creado": modelo.get("created_at"),
        "modificado": modelo.get("last_modified"),
        "pipeline_tag": modelo.get("pipeline_tag") or etiqueta,
        "likes": int(modelo.get("likes") or 0),
        "trending": float(modelo.get("trendingScore") or modelo.get("trending_score") or 0),
        "licencia_hf": _licencia(modelo),
        "gated": _gated(modelo.get("gated", False)),
        "archivos": _archivos(modelo.get("siblings") or modelo.get("files")),
    }


def _completar(candidato, detalle):
    """Vuelca en el candidato licencia, estado y archivos del detalle `?blobs=true`."""
    if not isinstance(detalle, dict):
        return
    candidato["modificado"] = detalle.get("last_modified") or candidato["modificado"]
    candidato["pipeline_tag"] = detalle.get("pipeline_tag") or candidato["pipeline_tag"]
    candidato["licencia_hf"] = _licencia(detalle) or candidato["licencia_hf"]
    candidato["gated"] = _gated(detalle.get("gated", candidato["gated"]))
    archivos = _archivos(detalle.get("siblings"))
    if archivos:
        candidato["archivos"] = archivos


def _es_hermano(modelo_id, base):
    """`Qwen-Image-2.1` → sí para `-Turbo`, `-Edit`; no para el propio ni `-2.1x`."""
    nombre, raiz = _nombre(modelo_id), _nombre(base)
    return bool(raiz) and nombre != raiz and nombre.startswith(raiz) and nombre[len(raiz)] in "-_."


def _mismo_tronco(modelo_id, nombre):
    """El cuantizado comparte el nombre del candidato (`…-Turbo-GGUF` sí cuelga de `…-Turbo`)."""
    return bool(nombre) and _nombre(modelo_id).startswith(nombre)


def _del_area(modelo, etiquetas):
    """En familias por autor solo interesa lo que pertenece a las etiquetas del área."""
    if not etiquetas:
        return True
    etiqueta = modelo.get("pipeline_tag")
    return not etiqueta or etiqueta in etiquetas


def _reciente(modelo, limite):
    """Dentro de los últimos 60 días; si HF no da fecha, no se descarta a ciegas."""
    creado = _fecha(modelo.get("created_at"))
    return creado is None or creado >= limite


def _bases_de_catalogo(catalogo_ids):
    """Pares (id, nombre) únicos del catálogo para buscar hermanos, sin repetir nombre."""
    bases, vistos = [], set()
    for cid in sorted(str(c) for c in (catalogo_ids or ())):
        nombre = _nombre(cid)
        if nombre and nombre not in vistos:
            vistos.add(nombre)
            bases.append((cid, nombre))
    return bases


def descubrir(area, catalogo_ids, http_get, ahora=None, dormir=None,
              limite_peticiones=LIMITE_PETICIONES):
    """Descubre candidatos para un área con las cuatro fuentes del contrato.

    area:         dict del área (`pipeline_tags`, `autores`, `cuantizadores` opcional)
    catalogo_ids: ids que el catálogo ya tiene (se usan para hermanos y para no repetirlos)
    http_get:     función (url, headers=, timeout=) → cuerpo str/bytes | None; inyectable
    ahora:        datetime UTC del reloj inyectado (por defecto, ahora mismo)
    dormir:       función de pausa inyectable (por defecto, `time.sleep`)
    Devuelve la lista de candidatos, sin duplicados y como mucho con 120 peticiones.
    """
    reloj = _a_utc(ahora)
    cliente = _Cliente(http_get, time.sleep if dormir is None else dormir, limite_peticiones)
    etiquetas = [str(t) for t in (area.get("pipeline_tags") or [])]
    autores = [str(a) for a in (area.get("autores") or [])]
    cuantizadores = area.get("cuantizadores")
    cuantizadores = [str(q) for q in (CUANTIZADORES if cuantizadores is None else cuantizadores)]
    conocidos = {str(c) for c in (catalogo_ids or ())}
    nombres_conocidos = {_nombre(c) for c in conocidos}
    candidatos, vistos = [], set()

    def añadir(modelo, etiqueta="", posicion=None):
        """Añade si pasa los filtros duros; devuelve el candidato o None."""
        cand = _candidato(modelo, etiqueta)
        if not _aceptable(cand["id"], cand["autor"]):
            return None
        if cand["id"] in vistos or cand["id"] in conocidos or _nombre(cand["id"]) in nombres_conocidos:
            return None
        if posicion is not None and not cand["trending"]:
            cand["trending"] = round(max(0.0, 30.0 - posicion), 1)
        vistos.add(cand["id"])
        candidatos.append(cand)
        return cand

    # 1. Tendencia por etiqueta (NUNCA solo por «me gusta»).
    for etiqueta in etiquetas:
        datos = cliente.json(_ruta(pipeline_tag=etiqueta, sort="trendingScore",
                                   direction=-1, limit=30))
        for posicion, modelo in enumerate(_lista(datos)):
            añadir(modelo, etiqueta, posicion)
        if cliente.agotado:
            break

    # 2. Familias vigiladas: lo creado en los últimos 60 días y del área.
    limite_autor = reloj - timedelta(days=DIAS_AUTOR)
    for autor in autores:
        datos = cliente.json(_ruta(author=autor, sort="createdAt", direction=-1, limit=20))
        for modelo in _lista(datos):
            if _reciente(modelo, limite_autor) and _del_area(modelo, etiquetas):
                añadir(modelo)
        if cliente.agotado:
            break

    # 3. Hermanos del catálogo (Qwen-Image-2.1 → Qwen-Image-2.1-Turbo).
    for _, base in _bases_de_catalogo(conocidos)[:MAX_HERMANOS]:
        if cliente.agotado:
            break
        for modelo in _lista(cliente.json(_ruta(search=base, limit=50))):
            if _es_hermano(modelo.get("id"), base):
                añadir(modelo)

    # 4. Cuantizados; se reserva una petición de detalle por cada candidato vivo.
    for cand in list(candidatos):
        nombre = _nombre(cand["id"])
        for cuantizador in cuantizadores:
            if cliente.restantes <= len(candidatos) + 1:
                break
            datos = cliente.json(_ruta(search=nombre, author=cuantizador, limit=10))
            for modelo in _lista(datos):
                if _mismo_tronco(modelo.get("id"), nombre):
                    añadir(modelo, cand["pipeline_tag"])
        if cliente.restantes <= len(candidatos) + 1:
            break

    # Detalle con blobs: tamaño real y `lfs.sha256` de cada archivo.
    for cand in candidatos:
        if cliente.agotado:
            break
        _completar(cand, cliente.json(_detalle(cand["id"])))

    return candidatos


def _http_get_real(url, headers=None, timeout=30):
    """Cliente real mínimo para la demo; la red se inyecta en pruebas."""
    import urllib.request
    peticion = urllib.request.Request(url, headers=dict(headers or {}))
    with urllib.request.urlopen(peticion, timeout=timeout) as respuesta:
        return respuesta.read().decode("utf-8", "replace")


if __name__ == "__main__":
    import sys
    area = {
        "id": "imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen", "Tongyi-MAI", "black-forest-labs"],
        "cuantizadores": ["unsloth", "city96", "Comfy-Org"],
    }
    salida = descubrir(area, {"Qwen/Qwen-Image-2.1"}, _http_get_real, dormir=time.sleep)
    json.dump(salida, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
