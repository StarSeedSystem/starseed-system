"""Exportadores de servicios externos (n8n y Dify) al repo.

CLI:
  python3 -m flujos.exportar_externos n8n --carpeta ~/Downloads
  python3 -m flujos.exportar_externos dify
  python3 -m flujos.exportar_externos estado

Reglas: nunca se guardan valores de credenciales, solo nombres de
variables. Todo cliente HTTP es inyectable para probar sin red.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib import request as _urlrequest

from . import importar_n8n

RAIZ_EXPORTS = Path("memory/aprendizaje-externos")
ESTADO_JSON = RAIZ_EXPORTS / "estado.json"

HttpGet = Callable[[str, Dict[str, str]], Dict[str, Any]]


def _http_get_urllib(url: str, cabeceras: Dict[str, str]) -> Dict[str, Any]:
    """Cliente HTTP real (una petición GET con JSON de respuesta)."""
    req = _urlrequest.Request(url, headers=cabeceras, method="GET")
    with _urlrequest.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fecha_hoy(ahora: Optional[datetime] = None) -> str:
    return (ahora or datetime.now()).strftime("%Y-%m-%d")


def es_workflow_n8n(datos: Any) -> bool:
    return (
        isinstance(datos, dict)
        and isinstance(datos.get("nodes"), list)
        and isinstance(datos.get("connections"), dict)
    )


def limpiar_credenciales(datos: Dict[str, Any]) -> Dict[str, Any]:
    """Sustituye el bloque `credentials` por una lista de nombres."""
    limpio = json.loads(json.dumps(datos))
    for nodo in limpio.get("nodes", []):
        creds = nodo.pop("credentials", None)
        if creds:
            nombres = []
            for valor in creds.values():
                if isinstance(valor, dict) and valor.get("name"):
                    nombres.append(valor["name"])
                elif isinstance(valor, str):
                    nombres.append(valor)
            if nombres:
                nodo["credenciales_nombres"] = sorted(set(nombres))
    return limpio


def _slug(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-") or "flujo"


def _escribir_informe_n8n(carpeta: Path, nombre: str, informe: Dict[str, Any]) -> Path:
    """Informe de traducción de un flujo, en markdown junto al JSON."""
    res = informe.get("resumen", {})
    lineas = [
        f"# Informe de traducción: {nombre}",
        "",
        f"- Nodos totales: {res.get('nodos_totales', 0)}",
        f"- Traducidos: {res.get('traducidos', 0)}",
        f"- Aproximados: {res.get('aproximados', 0)}",
        f"- No traducidos: {res.get('no_traducidos', 0)}",
        "",
    ]
    for clave, titulo in (
        ("traducidos", "Traducidos"),
        ("aproximados", "Aproximados"),
        ("no_traducidos", "No traducidos"),
    ):
        items = informe.get(clave, [])
        if not items:
            continue
        lineas.append(f"## {titulo}")
        lineas.append("")
        for it in items:
            extra = f" → `{it.get('tipo_genesis')}`" if it.get("tipo_genesis") else ""
            lineas.append(f"- `{it.get('nombre')}` ({it.get('tipo_n8n')}){extra}")
        lineas.append("")
    ruta = carpeta / f"{_slug(nombre)}.informe.md"
    ruta.write_text("\n".join(lineas), encoding="utf-8")
    return ruta


def _registrar_estado(clave: str, entrada: Dict[str, Any],
                      raiz_exports: Path = RAIZ_EXPORTS) -> None:
    ruta = raiz_exports / "estado.json"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    estado: Dict[str, Any] = {}
    if ruta.exists():
        try:
            estado = json.loads(ruta.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            estado = {}
    historial = estado.setdefault(clave, [])
    historial.append(entrada)
    ruta.write_text(
        json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def exportar_n8n(
    carpeta_entrada: Path,
    raiz_exports: Path = RAIZ_EXPORTS,
    ahora: Optional[datetime] = None,
    guardar_flujo_fn: Optional[Callable[[Any], Any]] = None,
) -> Dict[str, Any]:
    """Copia los workflows n8n de `carpeta_entrada`, los limpia e importa."""
    fecha = fecha_hoy(ahora)
    destino = raiz_exports / "n8n-export" / fecha
    destino.mkdir(parents=True, exist_ok=True)
    resultado: Dict[str, Any] = {"fecha": fecha, "destino": str(destino),
                                 "flujos": [], "ignorados": []}
    for archivo in sorted(Path(carpeta_entrada).glob("*.json")):
        try:
            datos = json.loads(archivo.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            resultado["ignorados"].append({"archivo": archivo.name,
                                           "motivo": "no es JSON válido"})
            continue
        if not es_workflow_n8n(datos):
            resultado["ignorados"].append({"archivo": archivo.name,
                                           "motivo": "sin nodes/connections"})
            continue
        limpio = limpiar_credenciales(datos)
        nombre = limpio.get("name", archivo.stem)
        ruta_json = destino / f"{_slug(nombre)}.json"
        ruta_json.write_text(
            json.dumps(limpio, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        flujo, informe = importar_n8n.importar(limpio)
        try:
            from .modelo import guardar_flujo as _guardar_por_defecto
            ruta_flujo = str((guardar_flujo_fn or _guardar_por_defecto)(flujo))
        except Exception as exc:  # el informe no se pierde por un fallo al guardar
            ruta_flujo = f"error al guardar: {exc}"
        ruta_informe = _escribir_informe_n8n(destino, nombre, informe)
        resultado["flujos"].append({
            "nombre": nombre,
            "json": str(ruta_json),
            "informe": str(ruta_informe),
            "flujo_genesis": ruta_flujo,
            "resumen": informe.get("resumen", {}),
        })
    resultado["total"] = len(resultado["flujos"])
    _registrar_estado("n8n", {"fecha": fecha, "total": resultado["total"],
                              "destino": str(destino)}, raiz_exports)
    return resultado


def _paginar_dify(http_get: HttpGet, url_base: str, ruta: str,
                  cabeceras: Dict[str, str]) -> List[Dict[str, Any]]:
    """Recorre la paginación de la API de Dify (page/page_size)."""
    items: List[Dict[str, Any]] = []
    pagina = 1
    while True:
        datos = http_get(f"{url_base}{ruta}?page={pagina}&limit=100", cabeceras)
        lote = datos.get("data") or datos.get("documents") or []
        items.extend(lote)
        if not datos.get("has_more", False):
            break
        pagina += 1
    return items


def exportar_dify(
    http_get: Optional[HttpGet] = None,
    raiz_exports: Path = RAIZ_EXPORTS,
    ahora: Optional[datetime] = None,
    cargar_conocimiento: bool = True,
) -> Dict[str, Any]:
    """Exporta bases y documentos de Dify al repo y al conocimiento propio.

    Usa DIFY_URL y DIFY_CLAVE (nombres de variables, nunca valores en disco).
    """
    url_base = os.environ.get("DIFY_URL", "").rstrip("/")
    clave = os.environ.get("DIFY_CLAVE", "")
    if not url_base or not clave:
        return {"error": "faltan DIFY_URL o DIFY_CLAVE en el entorno",
                "bases": [], "total_documentos": 0}
    http_get = http_get or _http_get_urllib
    cabeceras = {"Authorization": f"Bearer {clave}"}
    fecha = fecha_hoy(ahora)
    destino = raiz_exports / "dify-export" / fecha
    destino.mkdir(parents=True, exist_ok=True)

    conocimiento = None
    if cargar_conocimiento:
        try:
            from .. import conocimiento  # type: ignore
        except Exception:
            try:
                import scripts.puente.conocimiento as conocimiento  # type: ignore
            except Exception:
                conocimiento = None

    resultado: Dict[str, Any] = {"fecha": fecha, "destino": str(destino),
                                 "bases": [], "total_documentos": 0}
    bases = _paginar_dify(http_get, url_base, "/v1/datasets", cabeceras)
    for base in bases:
        base_id = base.get("id", "")
        nombre_base = base.get("name", base_id or "sin-nombre")
        dir_base = destino / _slug(nombre_base)
        dir_base.mkdir(parents=True, exist_ok=True)
        (dir_base / "base.json").write_text(
            json.dumps(base, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        docs = _paginar_dify(
            http_get, url_base, f"/v1/datasets/{base_id}/documents", cabeceras
        )
        nombres_docs: List[str] = []
        for doc in docs:
            nombre_doc = doc.get("name", doc.get("id", "documento"))
            nombres_docs.append(nombre_doc)
            (dir_base / f"{_slug(nombre_doc)}.json").write_text(
                json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            if conocimiento is not None:
                texto = doc.get("text") or doc.get("content") or ""
                if texto:
                    base_propia = conocimiento.crear_base(nombre_base)
                    conocimiento.agregar_documento(
                        base_propia.get("id"), nombre_doc, texto
                    )
        resultado["bases"].append({
            "id": base_id, "nombre": nombre_base,
            "documentos": len(docs), "nombres": nombres_docs,
        })
        resultado["total_documentos"] += len(docs)
    _registrar_estado("dify", {
        "fecha": fecha, "bases": len(resultado["bases"]),
        "documentos": resultado["total_documentos"], "destino": str(destino),
    }, raiz_exports)
    return resultado


def leer_estado(raiz_exports: Path = RAIZ_EXPORTS) -> Dict[str, Any]:
    ruta = raiz_exports / "estado.json"
    if not ruta.exists():
        return {"n8n": [], "dify": []}
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"n8n": [], "dify": [], "error": "estado.json corrupto"}
    return {"n8n": datos.get("n8n", []), "dify": datos.get("dify", [])}


def main(argv: Optional[List[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        description="Exportar flujos de n8n y conocimiento de Dify al repo"
    )
    sub = parser.add_subparsers(dest="comando", required=True)
    p_n8n = sub.add_parser("n8n", help="Exportar workflows n8n desde una carpeta")
    p_n8n.add_argument("--carpeta", required=True,
                       help="Carpeta con los JSON descargados de n8n")
    sub.add_parser("dify", help="Exportar bases y documentos de Dify por API")
    sub.add_parser("estado", help="Qué se exportó y cuándo")
    args = parser.parse_args(argv)

    if args.comando == "n8n":
        salida = exportar_n8n(Path(args.carpeta).expanduser())
    elif args.comando == "dify":
        salida = exportar_dify()
    else:
        salida = leer_estado()
    print(json.dumps(salida, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
