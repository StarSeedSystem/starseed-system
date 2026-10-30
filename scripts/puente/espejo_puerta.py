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

(IND1029E) Publica también el estado compartido (progreso, colas, chat y medidores resumidos) si es líder, cada minuto, con `tachar`.
"""
import json
import os
import time

LATIDO_S = 30 * 60

ESTADO_CLASE, ESTADO_ID, ESTADO_LATIDO_S, ESTADO_CHAT, ESTADO_TEXTO, ESTADO_ABIERTAS = "director", "estado.compartido", 60, 4, 120, 12


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


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto

def _tachado(valor):
    """Copia de `valor` con TODO texto pasado por `director_chat.tachar` (la regla del chat)."""
    from director_chat import tachar  # noqa: PLC0415 — mismo directorio
    if isinstance(valor, dict):
        return {k: _tachado(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [_tachado(v) for v in valor]
    return tachar(valor) if isinstance(valor, str) else valor

def estado_compartido(progreso, colas, chat, medidores, ahora=0):
    """PURA. Lo que ve cualquier neurona: progreso, colas, chat y medidores resumidos."""
    prog = progreso if isinstance(progreso, dict) else {}
    cuenta, abiertas = {}, []
    for t, e in prog.items():
        e = e if isinstance(e, dict) else {}
        est = str(e.get("estado") or "pendiente")
        cuenta[est] = cuenta.get(est, 0) + 1
        if est not in ("commit", "hecho"):
            abiertas.append({"id": str(t), "estado": est, "t": str(e.get("t") or ""),
                             "modelo": str(e.get("modelo") or ""), "nota": str(e.get("nota") or "")[:ESTADO_TEXTO]})
    abiertas.sort(key=lambda x: x["t"], reverse=True)
    lista = []
    for c in colas if isinstance(colas, list) else []:
        crudas = c.get("tareas") if isinstance(c, dict) else []
        tareas = [t for t in crudas if isinstance(t, dict) and t.get("id")] if isinstance(crudas, list) else []
        estado = {}
        for t in tareas:
            e = prog.get(t["id"]) if isinstance(prog.get(t["id"]), dict) else {}
            est = str(e.get("estado") or "pendiente")
            estado[est] = estado.get(est, 0) + 1
        lista.append({"cola": str(c.get("nombre") or ""), "tareas": len(tareas), "por_estado": estado})
    med = medidores if isinstance(medidores, dict) else {}
    latidos = med.get("latidos") if isinstance(med.get("latidos"), list) else []
    return {"generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora)),
            "progreso": {"total": len(prog), "por_estado": dict(sorted(cuenta.items())),
                         "abiertas": abiertas[:ESTADO_ABIERTAS]},
            "colas": sorted(lista, key=lambda x: x["cola"])[:20],
            "chat": [{"id": str(r.get("id") or ""), "t": str(r.get("t") or ""), "de": str(r.get("de") or ""),
                      "rol": str(r.get("rol") or ""), "tipo": str(r.get("tipo") or ""), "canal": str(r.get("canal") or ""),
                      "tarea": str(r.get("tarea") or ""), "texto": str(r.get("texto") or "")[:ESTADO_TEXTO]}
                     for r in (chat if isinstance(chat, list) else [])[-ESTADO_CHAT:] if isinstance(r, dict)],
            "medidores": {"agentes": len(latidos), "ola_activa": str(med.get("olaActiva") or ""),
                          "proveedores": {str(p["id"]): str(p.get("estado") or "") for p in (med.get("proveedores") or [])[:40] if isinstance(p, dict) and p.get("id")}}}

def recoger_estado(raiz=None, medidores=None, ahora=None):
    """El estado compartido listo para publicar. Lee del repo; no habla con la red."""
    raiz = raiz or os.environ.get("STARSEED_ROOT") or os.path.join(os.path.expanduser("~"), "Documents", "starseed-os-main")
    ahora = time.time() if ahora is None else ahora
    carpeta = os.path.join(raiz, "starseed_memory_root", "olas")
    progreso = _leer_json(os.path.join(carpeta, "progreso.json"), {})
    colas = []
    try:
        nombres = sorted(n for n in os.listdir(carpeta) if n.startswith("cola-") and n.endswith(".json"))
    except OSError:
        nombres = []
    for nombre in nombres:
        d = _leer_json(os.path.join(carpeta, nombre), None)
        tareas = d if isinstance(d, list) else (d.get("tareas") if isinstance(d, dict) else None)
        if isinstance(tareas, list):
            colas.append({"nombre": nombre[5:-5], "tareas": tareas})
    import director_chat  # noqa: PLC0415 — mismo directorio
    chat = director_chat.leer(limite=ESTADO_CHAT, raiz=raiz)
    return estado_compartido(progreso, colas, chat, medidores, ahora)

def publicar_estado(raiz=None, medidores=None, puerta=None, lider=None, estado_ruta=None, ahora=None):
    """Publica el estado compartido si esta neurona es líder y toca (cada minuto). Nunca lanza.
    Devuelve `puerta`, `sin-cambios`, `no-lider`, `sin-puerta` o `fallo`."""
    ahora = time.time() if ahora is None else ahora
    estado_ruta = estado_ruta or ruta_estado("estado-compartido")
    previo = _leer_json(estado_ruta, {})
    try:
        toca = "t" not in previo or ahora - float(previo.get("t") or 0) >= ESTADO_LATIDO_S
    except (TypeError, ValueError):
        toca = True
    if not toca:
        return "sin-cambios"
    try:
        if lider is None:
            import lider_direccion  # noqa: PLC0415 — depende del nodo; solo se importa aquí
            r = lider_direccion.soy_lider()
        else:
            r = lider() if callable(lider) else lider
        soy = bool(r.get("soy")) if isinstance(r, dict) else bool(r)
    except Exception:  # noqa: BLE001
        return "no-lider"
    if not soy:
        return "no-lider"
    try:
        if puerta is None:
            from puerta_datos_cliente import Puerta  # noqa: PLC0415 — mismo directorio
            puerta = Puerta.desde_entorno(rol="enjambre")
        if not puerta.configurada():
            return "sin-puerta"
        r = puerta.latido(ESTADO_CLASE, ESTADO_ID, _tachado(recoger_estado(raiz, medidores, ahora)),
                          respaldo=lambda _c: None)
        if (r or {}).get("via") != "puerta" or (r or {}).get("error"):
            return "fallo"
    except Exception:  # noqa: BLE001
        return "fallo"
    try:
        os.makedirs(os.path.dirname(estado_ruta), exist_ok=True)
        with open(estado_ruta + ".tmp", "w", encoding="utf-8") as f:
            json.dump(dict(previo, t=ahora), f)
        os.chmod(estado_ruta + ".tmp", 0o600)
        os.replace(estado_ruta + ".tmp", estado_ruta)
    except OSError:
        pass
    return "puerta"

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
