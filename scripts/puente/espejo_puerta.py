# -*- coding: utf-8 -*-
"""Copia en la puerta de datos del A1 lo que los publicadores de Astraura dejan en Supabase.

(PDA1012 · fase 2, architecture/puerta-datos-a1.md §10.1.5) El servidor de Next resolvía el
destino de la nube leyendo `astraura_state` en Supabase (8–10 lecturas cada 30 min, medido el
10-10). Ahora lo lee primero de la puerta (`GET /v1/astraura/estado/<clave>`, ficha `astraura`)
y, para que esté allí, `publicar_tunel_astraura.py` y `publicar_destino_astraura.py` lo copian
con `PUT` tras escribir Supabase, que sigue siendo la verdad.

Solo se copia si cambió o cada 30 min (la puerta cuenta cada petición servida como «ahorrada»:
copiar cada 5 min inflaría esa cifra sin ahorrar nada). Sin puerta configurada no hace nada.
Nunca imprime la URL de la puerta ni la ficha. Solo biblioteca estándar.
"""
import json
import os
import time
import urllib.request

LATIDO_S = 30 * 60


def ruta_estado(clave):
    """Marca de la última copia de `clave` en la puerta (archivo propio: los publicadores reescriben el suyo)."""
    return os.path.join(os.path.expanduser("~"), ".starseed", "puerta-espejo-%s.json" % clave)


def decidir_espejo(url, previo, ahora, latido_s=LATIDO_S):
    """PURA. ¿Hay que copiar `url` (o su retirada, `None`) en la puerta? (sí/no, motivo)."""
    previo = previo if isinstance(previo, dict) else {}
    if "puerta_t" not in previo:
        return True, "nunca copiado"
    if (previo.get("puerta_url") or None) != (url or None):
        return True, "cambió"
    try:
        if ahora - float(previo.get("puerta_t") or 0) >= latido_s:
            return True, "latido"
    except (TypeError, ValueError):
        return True, "marca ilegible"
    return False, "sin cambios"


def espejar(clave, url, estado_ruta=None, maquina="", puerta=None, ahora=None):
    """Copia `{url, maquina, publicado}` en la puerta bajo `clave` si toca. Devuelve la vía
    (`puerta`, `sin-puerta`, `sin-cambios`, `fallo`). Nunca lanza."""
    ahora = time.time() if ahora is None else ahora
    estado_ruta = estado_ruta or ruta_estado(clave)
    try:
        with open(estado_ruta, encoding="utf-8") as f:
            previo = json.load(f)
    except (OSError, ValueError):
        previo = {}
    toca, _ = decidir_espejo(url, previo, ahora)
    if not toca:
        return "sin-cambios"
    try:
        if puerta is None:
            from puerta_datos_cliente import Puerta  # noqa: PLC0415 — mismo directorio

            puerta = Puerta.desde_entorno(rol="astraura")
        if not puerta.configurada():
            return "sin-puerta"
        datos = {"url": url or None, "maquina": maquina or None,
                 "publicado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora))}
        # Respaldo nulo: Supabase ya lo tiene; si la puerta no responde, no se encola nada viejo.
        r = puerta.astraura_poner(clave, datos, respaldo=lambda _c: None)
    except Exception:  # noqa: BLE001
        return "fallo"
    if (r or {}).get("via") != "puerta" or (r or {}).get("error"):
        return "fallo"
    nuevo = dict(previo, puerta_url=url or None, puerta_t=ahora)
    try:
        os.makedirs(os.path.dirname(estado_ruta), exist_ok=True)
        tmp = estado_ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(nuevo, f)
        os.chmod(tmp, 0o600)
        os.replace(tmp, estado_ruta)
    except OSError:
        pass
    return "puerta"


# ── Estado compartido de MetaGenesis (IND1029E) ─────────────────────────────────
# El líder de dirección (IND1029B) copia cada minuto a la puerta lo que toda neurona debe
# ver igual: `starseed_memory_root/olas/progreso.json`, la lista de colas con su estado, el
# feed del chat del director y una foto de /api/mando/medidores (resumen, sin rutas ni
# claves). Viaja como latidos de clase `metagenesis` con ids `estado.*`; quien quiera leerlo
# pide `GET /v1/latidos?clase=metagenesis` (`leer_estado`) desde cualquier aparato. Todo se
# tacha con la misma regla que el chat del director (`director_chat.tachar`); sin líder o
# sin puerta no se copia nada.

CLASE_ESTADO, ESTADO_S = "metagenesis", 60
CHAT_MAX, PROGRESO_MAX = 12, 120


def tachar_valor(valor, tope=400):
    """PURA. `director_chat.tachar` en cualquier dict/lista/cadena anidados."""
    from director_chat import tachar  # noqa: PLC0415 — mismo directorio

    if isinstance(valor, str):
        return tachar(valor)[:tope]
    if isinstance(valor, list):
        return [tachar_valor(x, tope) for x in valor]
    if isinstance(valor, dict):
        return {str(k): tachar_valor(x, tope) for k, x in list(valor.items())[:200]}
    return valor


def resumir_progreso(progreso):
    """PURA. Hasta `PROGRESO_MAX` tareas con su estado y nota, lo más nuevo primero."""
    salidas = []
    for id_, v in (progreso if isinstance(progreso, dict) else {}).items():
        if not isinstance(v, dict):
            continue
        salidas.append({"id": str(id_), "estado": str(v.get("estado") or ""), "t": str(v.get("t") or ""),
                        "medio": str(v.get("medio") or ""), "nota": tachar_valor(str(v.get("nota") or ""), 300)})
    salidas.sort(key=lambda e: e["t"], reverse=True)
    return salidas[:PROGRESO_MAX]


def resumir_colas(colas, progreso):
    """PURA. {nombre: ids} → [{nombre, tareas, estados}] con la cuenta por estado."""
    p = progreso if isinstance(progreso, dict) else {}
    fuera = []
    for nombre, ids in sorted((colas if isinstance(colas, dict) else {}).items()):
        estados = {}
        for id_ in ids or []:
            v = p.get(id_) if isinstance(p.get(id_), dict) else {}
            estado = str(v.get("estado") or "desconocido")
            estados[estado] = estados.get(estado, 0) + 1
        fuera.append({"nombre": str(nombre), "tareas": len(ids or []), "estados": estados})
    return fuera


def resumen_medidores(foto):
    """PURA. Resumen de una foto de /api/mando/medidores: cifras, sin rutas ni claves."""
    foto = foto if isinstance(foto, dict) else {}
    detalle = foto.get("detalle") if isinstance(foto.get("detalle"), dict) else {}
    cuenta = {}
    for v in (detalle.get("progreso") if isinstance(detalle.get("progreso"), dict) else {}).values():
        if isinstance(v, dict) and v.get("estado"):
            cuenta[str(v["estado"])] = cuenta.get(str(v["estado"]), 0) + 1
    es_lista = lambda x: x if isinstance(x, list) else []  # noqa: E731
    return {
        "generado_en": str(foto.get("generadoEn") or ""),
        "obsoleto": bool(foto.get("obsoleto")),
        "enjambre_vivo": bool(detalle.get("enjambreVivo")),
        "enjambre_pausado": bool(detalle.get("enjambrePausado")),
        "agentes": len(es_lista(detalle.get("latidos"))),
        "fila": len(es_lista(detalle.get("fila"))),
        "estados": cuenta,
    }


def decidir_espejar_estado(previo, ahora, latido_s=ESTADO_S):
    """PURA. ¿Toca copiar el estado compartido? Cada minuto, cambie o no el contenido."""
    previo = previo if isinstance(previo, dict) else {}
    try:
        t = float(previo.get("t") or 0)
    except (TypeError, ValueError):
        t = 0.0
    if not t:
        return True, "primera vez"
    if ahora - t >= latido_s:
        return True, "latido"
    return False, "sin cambios"


def _raiz(raiz=None):
    return str(raiz or os.environ.get("STARSEED_ROOT")
               or os.path.join(os.path.expanduser("~"), "Documents", "starseed-os-main"))


def leer_progreso(raiz=None):
    """El `progreso.json` de olas (dict) o {}, sin lanzar."""
    try:
        with open(os.path.join(_raiz(raiz), "starseed_memory_root", "olas", "progreso.json"),
                  encoding="utf-8") as f:
            j = json.load(f)
        return j if isinstance(j, dict) else {}
    except (OSError, ValueError):
        return {}


def leer_colas(raiz=None):
    """{nombre: ids} de `starseed_memory_root/olas/cola-*.json`."""
    salida = {}
    carpeta = os.path.join(_raiz(raiz), "starseed_memory_root", "olas")
    try:
        nombres = sorted(os.listdir(carpeta))
    except OSError:
        return salida
    for nombre in nombres:
        if not (nombre.startswith("cola-") and nombre.endswith(".json")):
            continue
        try:
            with open(os.path.join(carpeta, nombre), encoding="utf-8") as f:
                j = json.load(f)
            tareas = j if isinstance(j, list) else (j.get("tareas") if isinstance(j, dict) else None)
            salida[nombre] = [t.get("id") for t in tareas or [] if isinstance(t, dict) and t.get("id")]
        except (OSError, ValueError):
            continue
    return salida


def leer_chat(raiz=None):
    """Últimos `CHAT_MAX` mensajes del feed del chat del director (sin entregas), tachados."""
    from director_chat import leer, tachar  # noqa: PLC0415 — mismo directorio

    fuera = []
    for m in leer(limite=CHAT_MAX, raiz=raiz) or []:
        if not (isinstance(m, dict) and "texto" in m):
            continue
        fuera.append({"t": str(m.get("t") or ""), "de": str(m.get("de") or ""),
                      "rol": str(m.get("rol") or ""), "tipo": str(m.get("tipo") or ""),
                      "texto": tachar(str(m.get("texto") or ""))})
    return fuera


def leer_medidores(pedir=None):
    """Foto de /api/mando/medidores del Genesis local (o {} si no responde). Sin fichas impresas."""
    if pedir is not None:
        try:
            return pedir() if isinstance(pedir(), dict) else {}
        except Exception:  # noqa: BLE001
            return {}
    url = os.environ.get("STARSEED_GENESIS_URL", "http://127.0.0.1:9002").rstrip("/")
    try:
        peticion = urllib.request.Request(url + "/api/mando/medidores",
                                          headers={"Accept": "application/json"})
        with urllib.request.urlopen(peticion, timeout=6) as r:
            j = json.loads(r.read().decode("utf-8", "replace"))
        return j if isinstance(j, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _latir_estado(puerta, id_, datos):
    r = puerta.latido(CLASE_ESTADO, id_, datos, respaldo=lambda _c: None)
    return isinstance(r, dict) and r.get("via") == "puerta" and not r.get("error")


def espejar_estado(raiz=None, puerta=None, ahora=None, pedir_medidores=None,
                   lider=None, estado_ruta=None):
    """Copia el estado compartido a la puerta SOLO si el arriendo de dirección vigente es mío,
    cada minuto. Devuelve "no-lider" | "sin-cambios" | "sin-puerta" | "fallo" | "puerta".
    Nunca lanza."""
    ahora = time.time() if ahora is None else ahora
    if lider is None:
        try:
            import lider_direccion  # noqa: PLC0415 — mismo directorio
            lider = lider_direccion.soy_lider()
        except Exception:  # noqa: BLE001
            lider = {}
    if not (isinstance(lider, dict) and lider.get("soy")):
        return "no-lider"
    estado_ruta = estado_ruta or ruta_estado("compartido")
    try:
        with open(estado_ruta, encoding="utf-8") as f:
            previo = json.load(f)
    except (OSError, ValueError):
        previo = {}
    toca, _ = decidir_espejar_estado(previo, ahora)
    if not toca:
        return "sin-cambios"
    completo = False
    try:
        if puerta is None:
            from puerta_datos_cliente import Puerta  # noqa: PLC0415 — mismo directorio
            puerta = Puerta.desde_entorno(rol="enjambre")
        if not puerta.configurada():
            return "sin-puerta"
        progreso = resumir_progreso(leer_progreso(raiz))
        paquetes = (
            ("estado.progreso", tachar_valor(progreso)),
            ("estado.colas", resumir_colas(leer_colas(raiz), progreso)),
            ("estado.chat", leer_chat(raiz)),
            ("estado.medidores", resumen_medidores(leer_medidores(pedir_medidores))),
        )
        copiados = [id_ for id_, datos in paquetes if _latir_estado(puerta, id_, datos)]
        completo = len(copiados) == len(paquetes)
    except Exception:  # noqa: BLE001
        completo = False
    if not completo:
        return "fallo"
    try:
        os.makedirs(os.path.dirname(estado_ruta), exist_ok=True)
        tmp = estado_ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"t": ahora}, f)
        os.chmod(tmp, 0o600)
        os.replace(tmp, estado_ruta)
    except OSError:
        pass
    return "puerta"


def leer_estado(puerta=None, max_s=7200):
    """Lo que dejó el líder en la puerta, para cualquier neurona: {"progreso":…, "colas":…,
    "chat":…, "medidores":…} o None si la puerta no está disponible."""
    if puerta is None:
        from puerta_datos_cliente import Puerta  # noqa: PLC0415 — mismo directorio
        puerta = Puerta.desde_entorno(rol="enjambre")
    if not (puerta.configurada() and puerta.disponible()):
        return None
    estado, j = puerta._pedir("GET", "/v1/latidos?clase=%s&vivos_s=%d" % (CLASE_ESTADO, int(max_s)))
    if estado != 200:
        return None
    fuera = {}
    for l in (j or {}).get("latidos") or []:
        if isinstance(l, dict) and str(l.get("id") or "").startswith("estado."):
            fuera[str(l.get("id"))[7:]] = l.get("datos")
    return fuera or None
