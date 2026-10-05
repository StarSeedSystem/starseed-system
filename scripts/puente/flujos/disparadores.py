"""Disparadores de los Flujos del Mando (§3 del contrato, sin red).

Cuatro fuentes:
- `webhook`: la ruta `POST /api/flujos/gancho/[ruta]` verifica la firma y deja
  el cuerpo en `<raiz>/entrada/<ts>-<ruta>.json`; aquí se consume esa carpeta.
  La ruta NUNCA ejecuta Python: es solo la puerta de entrada firmada.
- `cron`: expresión de cinco campos (minuto hora día mes día-semana) evaluada
  en Python puro; se dispara una vez por minuto que coincida.
- `bus`: eventos de `starseed_memory_root/olas/canal.jsonl` filtrados por tipo
  (`commit`, `rechazada`, `publicada`…), con cursor por flujo.
- `chat`: mensajes de `starseed_memory_root/mando/canal.jsonl` que empiezan
  por «/flujo <id>».

`pendientes()` devuelve una lista de `(flujo, entrada)` para el motor, donde
`entrada` es la lista de ítems con la que hay que ejecutar el flujo.
"""

from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
from typing import Any, Iterable

from .modelo import Flujo, Nodo, RAIZ_FLUJOS, cargar_flujo, escribir_json

TIPOS_DISPARADOR = ("webhook", "cron", "bus", "chat")
ARCHIVO_ESTADO = "disparadores-estado.json"

# ── cron puro: cinco campos «valor, a-b, */n, lista» ──────────────────────

_RANGOS = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))  # semana: 0 y 7 = domingo


def _campo(expr: str, minimo: int, maximo: int) -> set[int] | None:
    """Conjunto de valores que cubre el campo; None si es «*» puro."""
    valores: set[int] = set()
    for parte in expr.split(","):
        parte = parte.strip()
        if not parte:
            return None
        trozo, _, paso_txt = parte.partition("/")
        paso = int(paso_txt) if paso_txt else 1
        if trozo in ("*", ""):
            valores.update(range(minimo, maximo + 1, paso))
            continue
        ini, _, fin_txt = trozo.partition("-")
        inicio, fin = int(ini), int(fin_txt) if fin_txt else int(ini)
        if not (minimo <= inicio <= fin <= maximo) or paso < 1:
            raise ValueError(f"Campo de cron fuera de rango: {expr}")
        valores.update(range(inicio, fin + 1, paso))
    return valores


def coincide_cron(expr: str, momento: datetime) -> bool:
    """True si los cinco campos de `expr` cubren `momento`. Como cron clásico,
    «día» y «día-semana» se unen con OR cuando ambos restringen."""
    campos = expr.split()
    if len(campos) != 5:
        raise ValueError("El cron debe tener cinco campos")
    valores = [momento.minute, momento.hour, momento.day, momento.month,
               momento.isoweekday() % 7]  # semana: 0 y 7 = domingo
    conjuntos = [_campo(c, lo, hi) for c, (lo, hi) in zip(campos, _RANGOS)]
    for indice in (0, 1, 3):  # minuto, hora y mes: siempre AND
        if conjuntos[indice] is not None and valores[indice] not in conjuntos[indice]:
            return False
    dia, semana = conjuntos[2], conjuntos[4]
    if dia is not None and semana is not None:
        return valores[2] in dia or valores[4] in semana
    if dia is not None:
        return valores[2] in dia
    if semana is not None:
        return valores[4] in semana
    return True


# ── chat y bus puros: parsear y filtrar sin tocar disco ──────────────────────

def parsear_orden_chat(texto: str) -> tuple[str, str] | None:
    """«/flujo <id> resto…» → (id, resto); otra cosa → None."""
    if not texto or not texto.startswith("/flujo"):
        return None
    resto = texto[len("/flujo"):].strip()
    if not resto:
        return None
    trozos = resto.split(None, 1)
    flujo_id = trozos[0]
    return flujo_id, trozos[1] if len(trozos) > 1 else ""


def filtrar_eventos(filas: Iterable[dict[str, Any]], tipos: set[str],
                    desde_epoch: float = 0.0) -> list[dict[str, Any]]:
    """Eventos de `olas/canal.jsonl` cuyo `tipo` interesa y son posteriores."""
    return [fila for fila in filas
            if fila.get("tipo") in tipos
            and float(fila.get("epoch") or 0) > desde_epoch]


def _leer_jsonl(ruta: Path) -> list[dict[str, Any]]:
    try:
        lineas = ruta.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    filas: list[dict[str, Any]] = []
    for linea in lineas:
        try:
            fila = json.loads(linea)
        except ValueError:
            continue
        if isinstance(fila, dict):
            filas.append(fila)
    return filas


def _ultimo_epoch(filas: Iterable[dict[str, Any]], actual: float) -> float:
    for fila in filas:
        actual = max(actual, float(fila.get("epoch") or 0))
    return actual


def disparador_de(flujo: Flujo) -> Nodo | None:
    """El primer nodo disparador del flujo, si tiene."""
    return next((n for n in flujo.nodos if n.tipo in TIPOS_DISPARADOR), None)


# ── consumo de las fuentes (disco, pero nunca red ni procesos) ───────────────

def _estado(raiz: Path) -> dict[str, dict[str, Any]]:
    ruta = raiz / ARCHIVO_ESTADO
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        return datos if isinstance(datos, dict) else {}
    except (OSError, ValueError):
        return {}


def _consumir_gancho(raiz: Path, ruta_gancho: str) -> list[dict[str, Any]]:
    """Lee y BORRA los archivos `*-ruta.json` dejados en `entrada/`."""
    carpeta = raiz / "entrada"
    if not carpeta.is_dir():
        return []
    cuerpos: list[dict[str, Any]] = []
    for archivo in sorted(carpeta.glob(f"*-{ruta_gancho}.json")):
        try:
            datos = json.loads(archivo.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        try:
            archivo.unlink()
        except OSError:
            pass
        cuerpo = datos.get("cuerpo") if isinstance(datos, dict) else None
        item = cuerpo if isinstance(cuerpo, dict) else {"cuerpo": cuerpo}
        item["disparador"] = "webhook"
        item["ruta"] = ruta_gancho
        cuerpos.append(item)
    return cuerpos


def pendientes(raiz: Path = RAIZ_FLUJOS, ahora: datetime | None = None
               ) -> list[tuple[Flujo, list[dict[str, Any]]]]:
    """Parejas (flujo, entrada) que hay que ejecutar AHORA, de todas las
    fuentes. Idempotente: lo consumido no se vuelve a entregar."""
    raiz = Path(raiz)
    momento = ahora or datetime.now()
    estado = _estado(raiz)
    resultado: list[tuple[Flujo, list[dict[str, Any]]] ] = []
    sucio = False
    for archivo in sorted(raiz.glob("*.json")):
        if archivo.name == ARCHIVO_ESTADO:
            continue
        try:
            flujo = cargar_flujo(archivo.stem, raiz)
        except Exception:
            continue  # un flujo roto nunca frena a los demás
        nodo = disparador_de(flujo)
        if nodo is None:
            continue
        config = dict(nodo.configuracion)
        entrada: list[dict[str, Any]] = []
        if nodo.tipo == "webhook" and config.get("ruta"):
            entrada = _consumir_gancho(raiz, str(config["ruta"]))
        elif nodo.tipo == "cron" and config.get("expresion"):
            marca = momento.strftime("%Y-%m-%dT%H:%M")
            cron_estado = estado.setdefault("cron", {})
            if cron_estado.get(flujo.id) != marca and coincide_cron(
                    str(config["expresion"]), momento):
                cron_estado[flujo.id] = marca
                sucio = True
                entrada = [{"disparador": "cron", "marca": marca,
                            "expresion": str(config["expresion"])}]
        elif nodo.tipo == "bus" and config.get("tipos"):
            cursor = estado.setdefault("bus", {})
            desde = float(cursor.get(flujo.id) or 0)
            filas = _leer_jsonl(raiz.parent / "olas" / "canal.jsonl")
            tipos = {str(t) for t in config["tipos"]}
            eventos = filtrar_eventos(filas, tipos, desde)
            cursor[flujo.id] = _ultimo_epoch(filas, desde)
            sucio = True
            for evento in eventos:
                evento["disparador"] = "bus"
            entrada = eventos
        elif nodo.tipo == "chat":
            cursor = estado.setdefault("chat", {})
            desde = float(cursor.get(flujo.id) or 0)
            filas = _leer_jsonl(raiz.parent / "mando" / "canal.jsonl")
            cursor[flujo.id] = _ultimo_epoch(filas, desde)
            sucio = True
            for fila in filas:
                orden = parsear_orden_chat(str(fila.get("texto") or ""))
                if (orden and orden[0] == flujo.id
                        and float(fila.get("epoch") or 0) > desde):
                    entrada.append({"disparador": "chat", "texto": orden[1],
                                    "quien": fila.get("quien", ""),
                                    "epoch": fila.get("epoch")})
        if entrada:
            resultado.append((flujo, entrada))
    if sucio:
        escribir_json(raiz / ARCHIVO_ESTADO, estado)
    return resultado
