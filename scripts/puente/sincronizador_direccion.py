#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sincronización en tiempo real de los 3 canales especializados de dirección de MetaGenesis.

Separa bots, sesiones Hermes y puentes Astraura sin mezclarlos ni duplicar polling Telegram:
  1. `principal` («Dirección principal»):
     - Hermes `local-1daf85ca...` («Dirección MetaGenesis») + Telegram Maggacortex
       (`@starseed_neurocortex_bot`, ÚNICO bot con polling `getUpdates` permitido aquí) +
       MetaGenesis (`director/chat.jsonl`) + Antigravity + Astraura › Genesis.
  2. `general` («Dirección general»):
     - Hermes `20260909_210504_867626` + `@starseed_puente_bot` (`TELEGRAM_BOT_TOKEN`,
       propiedad del gateway Hermes: jamás `getUpdates` aquí, solo `sendMessage` si aplica)
       + `director/general.jsonl` + Astraura `puente:hermes-avisos`.
  3. `audiovisual` («Producción audiovisual, diseño y promoción»):
     - Hermes `local-a1bb42b2...` + `@StarSeed_Design_bot` (`TELEGRAM_SINTESIS_BOT_TOKEN`,
       propiedad de Oracle A1 `peticiones_telegram.py`: jamás `getUpdates` aquí, solo
       `sendMessage`) + `director/audiovisual.jsonl` + Astraura `puente:peticiones`.

Nunca guarda ni imprime claves, tokens ni ids secretos. Solo biblioteca estándar.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import director_chat
import director_presidente

ARCHIVOS_ENV_DEFECTO = ("~/.starseed/env", "~/.hermes/.env")
DB_HERMES_DEFECTO = os.path.expanduser("~/.hermes/state.db")
RUTA_CANALES_DEFECTO = os.path.expanduser("~/.starseed/canales-direccion.json")
CANALES_ESPECIALIZADOS = ("principal", "general", "audiovisual")

_ENV_TELEGRAM_POR_CANAL: Dict[str, Tuple[Tuple[str, str], ...]] = {
    "principal": (
        ("TELEGRAM_MAGGACORTEX_BOT_TOKEN", "TELEGRAM_MAGGACORTEX_CHAT_ID"),
        ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"),
    ),
    "general": (("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"),),
    "audiovisual": (("TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID"),),
}

_PREFIJOS_ECO_INTERNO = (
    "eres el director presidente de genesis",
    "nota: esta es una sesión nueva de hermes",
    "nota: esta es una sesion nueva de hermes",
    "modo headless sin permisos interactivos",
    "responde solo ok y confirma capacidad activa",
    "confirma solo con ok que quedas registrada como sesión dedicada",
    "[context compaction",
    "[metagenesis ·",
    "[dirección ·",
    "[general ·",
    "[audiovisual ·",
)

_ETIQUETAS_CANAL = {
    "director-presidente": "Director presidente",
    "metagenesis": "MetaGenesis",
    "hermes": "Hermes",
    "antigravity": "Antigravity",
    "claude-cowork": "Claude Cowork",
    "claude-mac": "Claude Mac",
    "chatgpt": "ChatGPT",
    "mando": "Genesis",
}


def cargar_canales_direccion(ruta: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """Lee `~/.starseed/canales-direccion.json` de forma segura (sin lanzar excepciones)."""
    objetivo = Path(os.path.expanduser(ruta or RUTA_CANALES_DEFECTO))
    if not objetivo.exists():
        return {}
    try:
        crudo = json.loads(objetivo.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(crudo, dict):
        return {}
    return {
        str(k): dict(v)
        for k, v in crudo.items()
        if isinstance(v, dict)
    }


def _leer_archivos_env(archivos: Iterable[str] = ARCHIVOS_ENV_DEFECTO) -> Dict[str, str]:
    datos: Dict[str, str] = {}
    for archivo in archivos:
        ruta = Path(os.path.expanduser(archivo))
        if not ruta.exists():
            continue
        try:
            for linea in ruta.read_text(encoding="utf-8", errors="replace").splitlines():
                l = linea.strip()
                if not l or l.startswith("#") or "=" not in l:
                    continue
                if l.startswith("export "):
                    l = l[7:].strip()
                k, _, v = l.partition("=")
                k_limpia = k.strip()
                if k_limpia and k_limpia not in datos:
                    datos[k_limpia] = v.strip().strip('"').strip("'")
        except OSError:
            continue
    return datos


def leer_telegram_canal(
    canal_clave: str,
    archivos: Iterable[str] = ARCHIVOS_ENV_DEFECTO,
    canales_cfg: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Tuple[str, str]:
    """Devuelve `(token, chat_id)` para `principal` (Maggacortex), `general` o `audiovisual`."""
    datos = _leer_archivos_env(archivos)
    cfg = canales_cfg if canales_cfg is not None else (
        cargar_canales_direccion() if tuple(archivos) == ARCHIVOS_ENV_DEFECTO else {}
    )
    pares: List[Tuple[str, str]] = []
    entrada = cfg.get(canal_clave) if isinstance(cfg, dict) else None
    if isinstance(entrada, dict):
        k_tok = str(entrada.get("telegram_env_token") or "").strip()
        k_cid = str(entrada.get("telegram_env_chat_id") or "").strip()
        if k_tok and k_cid:
            pares.append((k_tok, k_cid))
    pares.extend(_ENV_TELEGRAM_POR_CANAL.get(canal_clave, ()))

    for k_tok, k_cid in pares:
        tok = (datos.get(k_tok) or os.environ.get(k_tok) or "").strip()
        cid = (datos.get(k_cid) or os.environ.get(k_cid) or "").strip()
        if tok and cid:
            return tok, cid
    return "", ""


def leer_telegram_direccion(archivos: Iterable[str] = ARCHIVOS_ENV_DEFECTO) -> Tuple[str, str]:
    """Devuelve `(token, chat_id)` del bot de dirección principal (Maggacortex o respaldo general)."""
    return leer_telegram_canal("principal", archivos=archivos)


def es_eco_interno(texto: str) -> bool:
    """PURA. True si el texto es un prompt interno de enrutado o ya salió de nuestro espejo."""
    norm = " ".join(str(texto or "").split()).strip().lower()
    if not norm:
        return True
    return any(norm.startswith(p) for p in _PREFIJOS_ECO_INTERNO)


def _norm_dedupe(texto: str) -> str:
    return " ".join(str(texto or "").split()).strip()[:160].lower()


def _cortar_trozos(texto: str, tope: int = 3800) -> List[str]:
    texto = str(texto or "").strip()
    if not texto:
        return []
    if len(texto) <= tope:
        return [texto]
    trozos: List[str] = []
    resto = texto
    while resto:
        if len(resto) <= tope:
            trozos.append(resto)
            break
        corte = resto.rfind("\n", 0, tope)
        if corte < tope // 3:
            corte = resto.rfind(" ", 0, tope)
        if corte < tope // 3:
            corte = tope
        trozos.append(resto[:corte].rstrip())
        resto = resto[corte:].lstrip()
    return trozos


def enviar_telegram_canal(
    canal_clave: str,
    texto: str,
    prefijo: str = "",
    token: Optional[str] = None,
    chat_id: Optional[str] = None,
    enviar_fn: Optional[Callable[[str, str, str], Tuple[bool, str]]] = None,
    archivos: Iterable[str] = ARCHIVOS_ENV_DEFECTO,
) -> Tuple[bool, str]:
    """Envía texto limpio (`sendMessage`, jamás `getUpdates`) al bot de `canal_clave`."""
    limpio = director_chat.tachar(str(texto or "").strip())
    if not limpio:
        return False, "mensaje vacío"
    encabezado = f"[{prefijo}] " if prefijo else ""
    if enviar_fn is None:
        if director_chat.en_pruebas():
            return False, "bloqueado en pruebas sin inyección"
        tok_cfg, cid_cfg = leer_telegram_canal(canal_clave, archivos=archivos)
        tok = (token or tok_cfg).strip()
        cid = (chat_id or cid_cfg).strip()
        if not tok or not cid:
            return False, f"faltan credenciales Telegram para canal '{canal_clave}'"

        def _http_send(t: str, c: str, cuerpo_txt: str) -> Tuple[bool, str]:
            payload = json.dumps({"chat_id": str(c), "text": cuerpo_txt}).encode("utf-8")
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{t}/sendMessage",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "starseed-director/1.0"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    d = json.loads(resp.read().decode("utf-8", "replace") or "{}")
                if d.get("ok"):
                    return True, "ok"
                return False, str(d.get("description") or "error telegram")[:160]
            except urllib.error.HTTPError as err:
                return False, f"HTTP {err.code}"
            except Exception as err:  # noqa: BLE001
                return False, type(err).__name__

        enviar_fn = _http_send
    else:
        tok = token or f"test-token-{canal_clave}"
        cid = chat_id or f"test-chat-{canal_clave}"

    for i, trozo in enumerate(_cortar_trozos(encabezado + limpio)):
        ok, detalle = enviar_fn(tok, cid, trozo)
        if not ok:
            return False, f"trozo {i + 1}: {detalle}"
    return True, "ok"


def enviar_telegram_direccion(
    texto: str,
    prefijo: str = "",
    token: Optional[str] = None,
    chat_id: Optional[str] = None,
    enviar_fn: Optional[Callable[[str, str, str], Tuple[bool, str]]] = None,
) -> Tuple[bool, str]:
    """Compatibilidad: envía al bot de dirección principal (Maggacortex)."""
    return enviar_telegram_canal(
        "principal",
        texto,
        prefijo=prefijo,
        token=token,
        chat_id=chat_id,
        enviar_fn=enviar_fn,
    )


def recoger_maggacortex_telegram(
    estado: Dict[str, Any],
    cfg: Optional[Dict[str, Any]] = None,
    get_updates_fn: Optional[Callable[[int], List[Dict[str, Any]]]] = None,
    publicar_fn: Optional[Callable[..., Any]] = None,
    raiz: Optional[Path] = None,
    chat_id_autorizado: Optional[str] = None,
    archivos: Iterable[str] = ARCHIVOS_ENV_DEFECTO,
) -> int:
    """Recoge mensajes entrantes de Maggacortex (`@starseed_neurocortex_bot`) hacia `director_chat`.

    REGLA DE POLLER ÚNICO: solo consulta `getUpdates` usando `TELEGRAM_MAGGACORTEX_BOT_TOKEN`
    y rechaza ejecutarse si dicho token coincide con `@starseed_puente_bot` (`TELEGRAM_BOT_TOKEN`)
    o `@StarSeed_Design_bot` (`TELEGRAM_SINTESIS_BOT_TOKEN`). En la primera corrida real sin
    `maggacortex_tg_offset`, siembra el cursor sin re-importar historial antiguo.
    """
    sync_cfg = (cfg or {}).get("sincronizar_canales") or {}
    if not sync_cfg.get("telegram", True):
        return 0

    cid_aut = str(chat_id_autorizado or "").strip()
    if get_updates_fn is None:
        if director_chat.en_pruebas() or raiz is not None:
            return 0
        env = _leer_archivos_env(archivos)
        tok = (env.get("TELEGRAM_MAGGACORTEX_BOT_TOKEN") or os.environ.get("TELEGRAM_MAGGACORTEX_BOT_TOKEN") or "").strip()
        cid_env = (env.get("TELEGRAM_MAGGACORTEX_CHAT_ID") or os.environ.get("TELEGRAM_MAGGACORTEX_CHAT_ID") or "").strip()
        tok_puente = (env.get("TELEGRAM_BOT_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
        tok_sintesis = (env.get("TELEGRAM_SINTESIS_BOT_TOKEN") or os.environ.get("TELEGRAM_SINTESIS_BOT_TOKEN") or "").strip()
        if not tok or not (cid_aut or cid_env):
            return 0
        # Guardia de aislamiento: nunca hacer polling al bot de Hermes ni al del A1.
        if tok == tok_puente or tok == tok_sintesis:
            return 0
        cid_aut = cid_aut or cid_env

        def _http_updates(offset: int) -> List[Dict[str, Any]]:
            qs = urllib.parse.urlencode({"timeout": 0, "limit": 20, **({"offset": offset} if offset > 0 else {})})
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{tok}/getUpdates?{qs}",
                headers={"User-Agent": "starseed-director/1.0"},
                method="GET",
            )
            try:
                with urllib.request.urlopen(req, timeout=8) as resp:
                    d = json.loads(resp.read().decode("utf-8", "replace") or "{}")
                if d.get("ok") and isinstance(d.get("result"), list):
                    return [x for x in d["result"] if isinstance(x, dict)]
            except Exception:  # noqa: BLE001
                return []
            return []

        get_updates_fn = _http_updates

    inicial = "maggacortex_tg_offset" not in estado
    offset_actual = int(estado.get("maggacortex_tg_offset") or 0)
    updates = get_updates_fn(offset_actual)
    if not isinstance(updates, list):
        updates = []

    if inicial:
        max_uid = max((int(u.get("update_id") or 0) for u in updates), default=-1)
        estado["maggacortex_tg_offset"] = (max_uid + 1) if max_uid >= 0 else 0
        corte_reciente = time.time() - 86400
        updates = [
            u for u in updates
            if isinstance(u, dict)
            and float(((u.get("message") or u.get("edited_message")) or {}).get("date") or 0) >= corte_reciente
        ]
        if not updates:
            return 0

    if not updates:
        return 0

    recientes = director_chat.leer(limite=50, raiz=raiz)
    huellas_recientes = {
        (r.get("rol"), _norm_dedupe(r.get("texto") or ""))
        for r in recientes
        if isinstance(r, dict) and r.get("rol") in ("alex", "director")
    }
    pub = publicar_fn or director_chat.publicar
    importados = 0

    for upd in sorted(updates, key=lambda u: int(u.get("update_id") or 0)):
        uid = int(upd.get("update_id") or 0)
        estado["maggacortex_tg_offset"] = max(int(estado.get("maggacortex_tg_offset") or 0), uid + 1)
        msg = upd.get("message") or upd.get("edited_message")
        if not isinstance(msg, dict):
            continue
        remitente = msg.get("from") or {}
        if isinstance(remitente, dict) and remitente.get("is_bot"):
            continue
        chat = msg.get("chat") or {}
        chat_id_msg = str(chat.get("id") or "").strip()
        if cid_aut and chat_id_msg != cid_aut:
            continue
        texto = str(msg.get("text") or msg.get("caption") or "").strip()
        if not texto or es_eco_interno(texto):
            continue
        if ("alex", _norm_dedupe(texto)) in huellas_recientes:
            continue
        pub(
            texto,
            de="alex",
            rol="alex",
            tipo="mensaje",
            canal="telegram",
            canales=["director-presidente", "antigravity", "claude-cowork"],
            raiz=raiz,
            sintesis=False,
        )
        huellas_recientes.add(("alex", _norm_dedupe(texto)))
        importados += 1
    return importados


def _archivo_canal_jsonl(canal_clave: str, raiz: Optional[Path] = None) -> Path:
    nombre = "chat.jsonl" if canal_clave == "principal" else f"{canal_clave}.jsonl"
    return director_chat._directorio(raiz) / nombre


def _leer_jsonl_canal(ruta: Path, limite: int = 80) -> List[Dict[str, Any]]:
    if not ruta.exists():
        return []
    salida: List[Dict[str, Any]] = []
    try:
        for linea in ruta.read_text(encoding="utf-8", errors="replace").splitlines()[-limite * 2:]:
            if not linea.strip():
                continue
            try:
                reg = json.loads(linea)
            except json.JSONDecodeError:
                continue
            if isinstance(reg, dict):
                salida.append(reg)
    except OSError:
        return []
    return salida[-limite:]


def _escribir_jsonl_canal(canal_clave: str, registro: Dict[str, Any], raiz: Optional[Path] = None) -> None:
    if raiz is None and director_chat.en_pruebas():
        return
    ruta = _archivo_canal_jsonl(canal_clave, raiz=raiz)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(registro, ensure_ascii=False) + "\n")


def sincronizar_desde_hermes(
    estado: Dict[str, Any],
    sesion_hermes: Optional[str],
    cfg: Optional[Dict[str, Any]] = None,
    db_path: Optional[str] = None,
    chat_id_telegram: Optional[str] = None,
    raiz: Optional[Path] = None,
    publicar_fn: Optional[Callable[..., Any]] = None,
) -> int:
    """Importa mensajes nuevos de la sesión Hermes principal a `director_chat`.

    En la primera ejecución sin cursor (`hermes_sync_ultimo_id`) solo fija el cursor al máximo
    actual para no re-inundar Genesis con historial antiguo.
    """
    sync_cfg = (cfg or {}).get("sincronizar_canales") or {}
    if not sync_cfg.get("hermes", True):
        return 0
    if db_path is None and (director_chat.en_pruebas() or raiz is not None):
        return 0
    ruta_db = Path(db_path or DB_HERMES_DEFECTO)
    if not ruta_db.exists():
        return 0

    if chat_id_telegram is None and db_path is None:
        _, cid = leer_telegram_canal("general")
    else:
        cid = str(chat_id_telegram or "").strip()
    incluir_tg = bool(cid) and bool(sync_cfg.get("telegram", True))
    sid = str(sesion_hermes or "").strip()
    if not sid and not incluir_tg:
        return 0

    conds: List[str] = []
    params: List[Any] = []
    if sid:
        conds.append("s.id = ?")
        params.append(sid)
    if incluir_tg:
        conds.append("(s.source = 'telegram' AND CAST(s.chat_id AS TEXT) = ?)")
        params.append(cid)
    where_sesiones = "(" + " OR ".join(conds) + ")"

    try:
        con = sqlite3.connect(f"file:{ruta_db}?mode=ro", uri=True, timeout=2.0)
    except sqlite3.Error:
        return 0

    try:
        con.row_factory = sqlite3.Row
        if estado.get("hermes_sync_ultimo_id") is None:
            fila_max = con.execute(
                f"SELECT COALESCE(MAX(m.id), 0) AS max_id FROM messages m "
                f"JOIN sessions s ON m.session_id = s.id WHERE {where_sesiones}",
                params,
            ).fetchone()
            estado["hermes_sync_ultimo_id"] = int(fila_max["max_id"] if fila_max else 0)
            return 0

        ultimo_id = int(estado.get("hermes_sync_ultimo_id") or 0)
        cols_msg = {
            str(r[1])
            for r in con.execute("PRAGMA table_info(messages)").fetchall()
        }
        filtro_tools = (
            "AND (m.role = 'user' OR m.tool_calls IS NULL OR TRIM(CAST(m.tool_calls AS TEXT)) IN ('', '[]', 'null')) "
            if "tool_calls" in cols_msg
            else ""
        )
        filas = con.execute(
            f"SELECT m.id, m.session_id, m.role, m.content, s.source, s.model "
            f"FROM messages m JOIN sessions s ON m.session_id = s.id "
            f"WHERE m.id > ? AND {where_sesiones} AND m.role IN ('user', 'assistant') "
            f"{filtro_tools}"
            f"ORDER BY m.id ASC LIMIT 30",
            [ultimo_id, *params],
        ).fetchall()
    except sqlite3.Error:
        return 0
    finally:
        con.close()

    if not filas:
        return 0

    recientes = director_chat.leer(limite=50, raiz=raiz)
    huellas_recientes = {
        (r.get("rol"), _norm_dedupe(r.get("texto") or ""))
        for r in recientes
        if isinstance(r, dict) and r.get("rol") in ("alex", "director")
    }
    pub = publicar_fn or director_chat.publicar
    importados = 0
    for f in filas:
        estado["hermes_sync_ultimo_id"] = max(int(estado.get("hermes_sync_ultimo_id") or 0), int(f["id"]))
        contenido = str(f["content"] or "").strip()
        if not contenido or es_eco_interno(contenido):
            continue
        es_user = f["role"] == "user"
        rol = "alex" if es_user else "director"
        if (rol, _norm_dedupe(contenido)) in huellas_recientes:
            continue
        canal_origen = "telegram" if f["source"] == "telegram" else "hermes"
        modelo = None if es_user else ("hermes/" + str(f["model"] or "predeterminado").split("/", 1)[-1])
        pub(
            contenido,
            de="alex" if es_user else canal_origen,
            rol=rol,
            tipo="mensaje" if es_user else "respuesta",
            canal=canal_origen,
            canales=["antigravity", "claude-cowork"] if es_user else None,
            modelo=modelo,
            raiz=raiz,
            sintesis=not es_user,
        )
        huellas_recientes.add((rol, _norm_dedupe(contenido)))
        importados += 1
    return importados


def sincronizar_canal_secundario_hermes(
    canal_clave: str,
    sesion_hermes: Optional[str],
    estado: Dict[str, Any],
    cfg: Optional[Dict[str, Any]] = None,
    db_path: Optional[str] = None,
    chat_id_telegram: Optional[str] = None,
    raiz: Optional[Path] = None,
    enviar_tg: bool = False,
    enviar_fn: Optional[Callable[[str, str, str], Tuple[bool, str]]] = None,
) -> int:
    """Sincroniza la sesión Hermes de `general` o `audiovisual` hacia `director/<canal>.jsonl`."""
    if canal_clave not in ("general", "audiovisual"):
        return 0
    sync_cfg = (cfg or {}).get("sincronizar_canales") or {}
    if not sync_cfg.get("hermes", True):
        return 0
    if db_path is None and (director_chat.en_pruebas() or raiz is not None):
        return 0
    ruta_db = Path(db_path or DB_HERMES_DEFECTO)
    if not ruta_db.exists():
        return 0

    sid = str(sesion_hermes or "").strip()
    cid = str(chat_id_telegram or "").strip()
    if not sid and not cid:
        return 0

    conds: List[str] = []
    params: List[Any] = []
    if sid:
        conds.append("s.id = ?")
        params.append(sid)
    if cid:
        conds.append("(s.source = 'telegram' AND CAST(s.chat_id AS TEXT) = ?)")
        params.append(cid)
    where_sesiones = "(" + " OR ".join(conds) + ")"
    cursor_key = f"hermes_sync_{canal_clave}_ultimo_id"

    try:
        con = sqlite3.connect(f"file:{ruta_db}?mode=ro", uri=True, timeout=2.0)
    except sqlite3.Error:
        return 0

    try:
        con.row_factory = sqlite3.Row
        if estado.get(cursor_key) is None:
            fila_max = con.execute(
                f"SELECT COALESCE(MAX(m.id), 0) AS max_id FROM messages m "
                f"JOIN sessions s ON m.session_id = s.id WHERE {where_sesiones}",
                params,
            ).fetchone()
            estado[cursor_key] = int(fila_max["max_id"] if fila_max else 0)
            return 0

        ultimo_id = int(estado.get(cursor_key) or 0)
        cols_msg = {
            str(r[1])
            for r in con.execute("PRAGMA table_info(messages)").fetchall()
        }
        filtro_tools = (
            "AND (m.role = 'user' OR m.tool_calls IS NULL OR TRIM(CAST(m.tool_calls AS TEXT)) IN ('', '[]', 'null')) "
            if "tool_calls" in cols_msg
            else ""
        )
        filas = con.execute(
            f"SELECT m.id, m.session_id, m.role, m.content, s.source, s.model "
            f"FROM messages m JOIN sessions s ON m.session_id = s.id "
            f"WHERE m.id > ? AND {where_sesiones} AND m.role IN ('user', 'assistant') "
            f"{filtro_tools}"
            f"ORDER BY m.id ASC LIMIT 30",
            [ultimo_id, *params],
        ).fetchall()
    except sqlite3.Error:
        return 0
    finally:
        con.close()

    if not filas:
        return 0

    ruta_jsonl = _archivo_canal_jsonl(canal_clave, raiz=raiz)
    recientes = _leer_jsonl_canal(ruta_jsonl, limite=60)
    huellas = {
        (r.get("rol"), _norm_dedupe(r.get("texto") or ""))
        for r in recientes
    }
    importados = 0
    for f in filas:
        estado[cursor_key] = max(int(estado.get(cursor_key) or 0), int(f["id"]))
        contenido = director_chat.tachar(str(f["content"] or "").strip())
        if not contenido or es_eco_interno(contenido):
            continue
        es_user = f["role"] == "user"
        rol = "alex" if es_user else "director"
        if (rol, _norm_dedupe(contenido)) in huellas:
            continue
        origen = "telegram" if f["source"] == "telegram" else "hermes"
        registro = {
            "id": f"{canal_clave[:3]}-h{f['id']}",
            "t": round(time.time(), 3),
            "de": "alex" if es_user else origen,
            "rol": rol,
            "tipo": "mensaje" if es_user else "respuesta",
            "canal": origen,
            "modelo": None if es_user else ("hermes/" + str(f["model"] or "predeterminado").split("/", 1)[-1]),
            "texto": contenido,
        }
        _escribir_jsonl_canal(canal_clave, registro, raiz=raiz)
        huellas.add((rol, _norm_dedupe(contenido)))
        importados += 1

        if enviar_tg and not es_user and sync_cfg.get("telegram", True):
            pref = "Audiovisual · Hermes" if canal_clave == "audiovisual" else "General · Hermes"
            enviar_telegram_canal(canal_clave, contenido, prefijo=pref, enviar_fn=enviar_fn)
    return importados


def publicar_en_canal_especializado(
    canal_clave: str,
    texto: str,
    de: str = "alex",
    origen: str = "metagenesis",
    enviar_telegram: bool = True,
    raiz: Optional[Path] = None,
    enviar_fn: Optional[Callable[[str, str, str], Tuple[bool, str]]] = None,
) -> Dict[str, Any]:
    """Publica un mensaje en `principal`, `general` o `audiovisual` y lo espeja al bot respectivo."""
    if canal_clave not in CANALES_ESPECIALIZADOS:
        return {"ok": False, "canal": canal_clave, "detalle": "Canal no válido"}
    limpio = director_chat.tachar(str(texto or "").strip())
    if not limpio:
        return {"ok": False, "canal": canal_clave, "detalle": "Mensaje vacío"}

    rol = "alex" if de == "alex" else "director"
    tipo = "mensaje" if rol == "alex" else "respuesta"
    prefijo = "MetaGenesis · Dirección" if canal_clave == "principal" else f"MetaGenesis · {origen}"

    if canal_clave == "principal":
        canal_pub = origen if origen in director_chat.CANALES else "metagenesis"
        canal_val = canal_pub if canal_pub in director_chat.CANALES else "mando"
        reg = director_chat.publicar(
            limpio,
            de=de,
            rol=rol,
            tipo=tipo,
            canal=canal_val,
            canales=["director-presidente", "antigravity", "claude-cowork"],
            raiz=raiz,
        )
        msg_id = str((reg or {}).get("id") or "")
    else:
        msg_id = f"{canal_clave[:3]}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
        reg = {
            "id": msg_id,
            "t": round(time.time(), 3),
            "de": de,
            "rol": rol,
            "tipo": tipo,
            "canal": origen,
            "texto": limpio,
        }
        _escribir_jsonl_canal(canal_clave, reg, raiz=raiz)

    tg_ok = False
    tg_det = "envío a Telegram desactivado"
    if enviar_telegram:
        tg_ok, tg_det = enviar_telegram_canal(canal_clave, limpio, prefijo=prefijo, enviar_fn=enviar_fn)

    return {
        "ok": True,
        "id": msg_id,
        "canal": canal_clave,
        "telegram_ok": tg_ok,
        "detalle": tg_det,
    }


def sincronizar_todos_los_canales(
    estado: Dict[str, Any],
    cfg: Optional[Dict[str, Any]] = None,
    raiz: Optional[Path] = None,
    db_path: Optional[str] = None,
    canales_cfg: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, int]:
    """Ejecuta una pasada de sincronización para `principal`, `general` y `audiovisual`."""
    mapa = canales_cfg if canales_cfg is not None else cargar_canales_direccion()
    ses_principal = (mapa.get("principal") or {}).get("hermes_sesion")
    ses_general = (mapa.get("general") or {}).get("hermes_sesion") or "20260828_130104_dc6d43f0"
    ses_audiovisual = (mapa.get("audiovisual") or {}).get("hermes_sesion")

    # Canal 1 (`principal`): Hermes `Dirección MetaGenesis` + Maggacortex (polling exclusivo).
    # Pasa `chat_id_telegram=""` para no mezclar `@starseed_puente_bot` (que va en `general`).
    n_hermes_prin = sincronizar_desde_hermes(
        estado,
        ses_principal,
        cfg,
        db_path=db_path,
        chat_id_telegram="",
        raiz=raiz,
    )
    n_magga = recoger_maggacortex_telegram(estado, cfg, raiz=raiz)

    # Canal 2 (`general`): Hermes chat oficial + sesión gateway Telegram de `@starseed_puente_bot`.
    _, cid_general = leer_telegram_canal("general", canales_cfg=mapa)
    n_general = sincronizar_canal_secundario_hermes(
        "general",
        ses_general,
        estado,
        cfg=cfg,
        db_path=db_path,
        chat_id_telegram=cid_general,
        raiz=raiz,
        enviar_tg=False,
    )

    # Canal 3 (`audiovisual`): Hermes dedicado; respuestas se envían por sendMessage a @StarSeed_Design_bot.
    n_audiovisual = sincronizar_canal_secundario_hermes(
        "audiovisual",
        ses_audiovisual,
        estado,
        cfg=cfg,
        db_path=db_path,
        chat_id_telegram=None,
        raiz=raiz,
        enviar_tg=True,
    )
    return {
        "principal_hermes": n_hermes_prin,
        "principal_maggacortex": n_magga,
        "general": n_general,
        "audiovisual": n_audiovisual,
    }


def _etiqueta_origen(r: Dict[str, Any]) -> str:
    de = str(r.get("de") or "").strip().lower()
    canal = str(r.get("canal") or "").strip().lower()
    if de == "alex":
        return f"Alex · {_ETIQUETAS_CANAL.get(canal, canal or 'MetaGenesis')}"
    return _ETIQUETAS_CANAL.get(de) or _ETIQUETAS_CANAL.get(canal) or (r.get("de") or "Dirección")


def es_mensaje_direccion_para_telegram(r: Dict[str, Any], por_id: Optional[Dict[str, Dict[str, Any]]] = None) -> bool:
    """PURA. True si el mensaje de dirección debe espejarse hacia Telegram dirección principal."""
    if not isinstance(r, dict) or r.get("tipo") == "entrega":
        return False
    if r.get("rol") not in ("alex", "director"):
        return False
    canal = str(r.get("canal") or "").lower()
    de = str(r.get("de") or "").lower()
    if canal == "telegram" or de in ("telegram", "cartero", "telegram-puente"):
        return False
    if "no pude entregar en telegram" in str(r.get("texto") or "").lower():
        return False
    return director_presidente.es_direccion(r, por_id)


def espejar_a_telegram_direccion(
    registros: List[Dict[str, Any]],
    estado: Dict[str, Any],
    cfg: Optional[Dict[str, Any]] = None,
    enviar_fn: Optional[Callable[[str, str], Tuple[bool, str]]] = None,
) -> int:
    """Espeja nuevos mensajes/respuestas de dirección principal hacia Maggacortex (`principal`).

    Mantiene `telegram_dir_vistos` en ORDEN CRONOLÓGICO ESTRICTO (hasta 2500 IDs, nunca `list(set)`
    que desalojaba IDs antiguos al azar y los reenviaba horas después) y guarda marca de agua
    temporal `telegram_dir_ultimo_epoch` para jamás reenviar mensajes antiguos.
    """
    sync_cfg = (cfg or {}).get("sincronizar_canales") or {}
    if not sync_cfg.get("telegram", True):
        return 0

    def _a_segundos(val: float) -> float:
        return (val / 1000.0) if val > 1e11 else val

    def _epoch_reg(reg: Dict[str, Any]) -> float:
        try:
            return _a_segundos(float(director_chat._epoch_de(reg) or 0.0))
        except Exception:
            return 0.0

    if "telegram_dir_vistos" not in estado:
        vistos_inicial: List[str] = []
        vistos_set_init = set()
        max_ep = 0.0
        for r in registros:
            if not isinstance(r, dict):
                continue
            ident = str(r.get("id") or "")
            if ident and ident not in vistos_set_init:
                vistos_set_init.add(ident)
                vistos_inicial.append(ident)
            ep = _epoch_reg(r)
            if ep > max_ep:
                max_ep = ep
        estado["telegram_dir_vistos"] = vistos_inicial[-2500:]
        if max_ep > 0:
            estado["telegram_dir_ultimo_epoch"] = max_ep
        return 0

    vistos_ordenados: List[str] = []
    vistos: set[str] = set()
    for x in estado.get("telegram_dir_vistos") or []:
        s = str(x or "")
        if s and s not in vistos:
            vistos.add(s)
            vistos_ordenados.append(s)

    def _marcar_visto(ident_msg: str) -> None:
        if ident_msg and ident_msg not in vistos:
            vistos.add(ident_msg)
            vistos_ordenados.append(ident_msg)

    fallos: Dict[str, int] = dict(estado.get("telegram_dir_fallos") or {})
    por_id = {r.get("id"): r for r in registros if isinstance(r, dict) and r.get("id")}
    ultimo_epoch = _a_segundos(float(estado.get("telegram_dir_ultimo_epoch") or 0.0))
    # En producción real (sin enviar_fn inyectada), si aún no había marca de agua temporal,
    # nunca reenviar mensajes con más de 10 minutos de antigüedad que hubieran sido desalojados por el set antiguo.
    corte_antiguedad = (time.time() - 600.0) if enviar_fn is None else 0.0
    enviados = 0

    for r in registros:
        if not isinstance(r, dict):
            continue
        ident = str(r.get("id") or "")
        if not ident or ident in vistos:
            continue
        if not es_mensaje_direccion_para_telegram(r, por_id):
            _marcar_visto(ident)
            continue
        ep = _epoch_reg(r)
        if (ultimo_epoch > 0 and ep > 0 and ep < ultimo_epoch - 2.0) or (corte_antiguedad > 0 and 0 < ep < corte_antiguedad):
            _marcar_visto(ident)
            continue
        texto = str(r.get("texto") or "").strip()
        if not texto:
            _marcar_visto(ident)
            continue
        etiqueta = _etiqueta_origen(r)
        if enviar_fn is not None:
            ok, _ = enviar_fn(etiqueta, texto)
        else:
            ok, _ = enviar_telegram_canal("principal", texto, prefijo=f"MetaGenesis · {etiqueta}")
        if ok:
            _marcar_visto(ident)
            if ep > ultimo_epoch:
                ultimo_epoch = ep
            fallos.pop(ident, None)
            enviados += 1
        else:
            intentos = int(fallos.get(ident) or 0) + 1
            if intentos >= 3:
                _marcar_visto(ident)
                fallos.pop(ident, None)
            else:
                fallos[ident] = intentos

    estado["telegram_dir_vistos"] = vistos_ordenados[-2500:]
    if ultimo_epoch > 0:
        estado["telegram_dir_ultimo_epoch"] = ultimo_epoch
    estado["telegram_dir_fallos"] = fallos
    return enviados


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="sincronizador_direccion")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_pub = sub.add_parser("publicar-canal", help="Publica en uno de los 3 canales especializados")
    p_pub.add_argument("--canal", choices=CANALES_ESPECIALIZADOS, required=True)
    p_pub.add_argument("--texto", required=True)
    p_pub.add_argument("--de", default="alex")
    p_pub.add_argument("--origen", default="metagenesis")
    p_pub.add_argument("--sin-telegram", action="store_true")

    args = parser.parse_args(argv)
    if args.cmd == "publicar-canal":
        res = publicar_en_canal_especializado(
            args.canal,
            args.texto,
            de=args.de,
            origen=args.origen,
            enviar_telegram=not args.sin_telegram,
        )
        print(json.dumps(res, ensure_ascii=False))
        return 0 if res.get("ok") else 1
    return 1


if __name__ == "__main__":
    sys.exit(main())
