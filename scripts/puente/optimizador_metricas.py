#!/usr/bin/env python3
"""§2 del director optimizador: métricas PURAS de todo el proceso.

`medir(fuentes, ahora, ventana_h=6)` no toca disco ni red: recibe las fuentes ya
cargadas (`cargar_fuentes` es la única función con E/S) y devuelve exactamente las
claves de la tabla §2 de `architecture/director-optimizador.md`. Cada métrica que
no se pueda calcular sale `null` y el motivo va en `m["faltan"][clave]`.

Tiempos: los `t` de pasos/eventos van en "%Y-%m-%d %H:%M:%S" local. `ahora` admite
epoch (float), datetime o esa cadena.
"""

import json
import os
from datetime import datetime

VENTANA_EVENTOS_H = 24
FASES_PUERTA = ("tsc", "tests", "revision", "integracion", "integrando", "aprobacion")


def _epoch(v, ahora_ref=None):
    """Cadena/datetime/float → epoch; lo que no se entiende devuelve None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, datetime):
        return v.timestamp()
    if isinstance(v, str):
        txt = v.strip()[:32]
        try:
            return datetime.fromisoformat(txt).timestamp()
        except ValueError:
            pass
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(txt[:19], fmt).timestamp()
            except ValueError:
                continue
    return None


def _mediana(nums):
    """Mediana de una lista (None si está vacía). PURA."""
    lista = sorted(n for n in nums if isinstance(n, (int, float)))
    if not lista:
        return None
    n = len(lista)
    mitad = n // 2
    if n % 2:
        return float(lista[mitad])
    return (lista[mitad - 1] + lista[mitad]) / 2.0


def _p90(nums):
    """Percentil 90 aproximado (método del más cercano), None si vacía. PURA."""
    lista = sorted(n for n in nums if isinstance(n, (int, float)))
    if not lista:
        return None
    return float(lista[min(len(lista) - 1, int(0.9 * (len(lista) - 1) + 0.9999))])


def _filas_en_ventana(filas, desde, hasta):
    return [f for f in filas or [] if (f.get("_t") or 0) >= desde and (f.get("_t") or 0) <= hasta]


def _integradas_h(fuentes, desde, hasta, ventana_h):
    ev = fuentes.get("eventos")
    if not ev:
        return None, "sin eventos.jsonl"
    n = sum(1 for f in ev if f.get("tipo") == "commit" and desde <= (f.get("_t") or 0) <= hasta)
    return round(n / max(0.01, float(ventana_h)), 2), None


def _trabajadores(fuentes, ahora):
    lat = fuentes.get("latidos")
    if not lat:
        return None, "sin latidos-*.json"
    vivos = escribiendo = en_puerta = 0
    for latido in lat:
        for t in (latido.get("tareas") or {}).values():
            if not isinstance(t, dict):
                continue
            if t.get("fase") == "hecho" or (t.get("hasta") or 0) <= ahora:
                continue
            vivos += 1
            if t.get("fase") == "escribiendo":
                escribiendo += 1
            elif t.get("fase") in FASES_PUERTA:
                en_puerta += 1
    gov = fuentes.get("gobernador") or {}
    tope = gov.get("trabajadores")
    return {
        "tope_gobernador": tope,
        "vivos": vivos,
        "escribiendo": escribiendo,
        "en_puerta": en_puerta,
        "ociosos": max(0, vivos - escribiendo - en_puerta),
    }, None


def _listas(fuentes):
    prog = fuentes.get("progreso")
    if not isinstance(prog, dict) or not prog:
        return None, "sin progreso.json"
    return sum(1 for e in prog.values() if isinstance(e, dict) and e.get("estado") == "pendiente"), None


def _fraccion_escribiendo(fuentes, desde, hasta):
    pasos = fuentes.get("pasos")
    if not pasos:
        return None, "sin pasos en la ventana"
    escr = total = 0.0
    for tid, filas in pasos.items():
        ven = _filas_en_ventana(filas, desde, hasta)
        if not ven:
            continue
        ts = [f["_t"] for f in ven if f.get("_t")]
        if len(ts) < 2:
            continue
        total += max(ts) - min(ts)
        escr += sum(float(f.get("segundos") or 0) for f in ven if f.get("paso") == "escritura")
    if total <= 0:
        return None, "pasos de la ventana sin duración"
    return round(min(1.0, escr / total), 4), None


def _falla(fila, paso):
    if fila.get("resultado") in ("falla", "fallo", "error"):
        return True
    if paso == "tsc" and isinstance(fila.get("errores_despues"), (int, float)):
        return fila["errores_despues"] > 0
    return False


def _fases(fuentes, desde, hasta):
    pasos = fuentes.get("pasos")
    if not pasos:
        return None, "sin pasos en la ventana"
    datos = {}
    for tid, filas in pasos.items():
        for f in _filas_en_ventana(filas, desde, hasta):
            paso = f.get("paso")
            if not paso:
                continue
            d = datos.setdefault(paso, {"n": 0, "fallos": 0, "segundos": []})
            d["n"] += 1
            if _falla(f, paso):
                d["fallos"] += 1
            seg = f.get("segundos", f.get("segundos_total"))
            if isinstance(seg, (int, float)):
                d["segundos"].append(float(seg))
    if not datos:
        return None, "sin pasos en la ventana"
    return {
        p: {
            "n": d["n"],
            "segundos_mediana": _mediana(d["segundos"]),
            "segundos_p90": _p90(d["segundos"]),
            "fallos": d["fallos"],
        }
        for p, d in sorted(datos.items())
    }, None


def _estado_tarea(tid, fuentes, desde, hasta, prog):
    """Resultado de la tarea en la ventana: commit|sin_cambios|colgada|otro. PURA."""
    for f in fuentes.get("eventos") or []:
        if f.get("tarea") != tid or not (desde <= (f.get("_t") or 0) <= hasta):
            continue
        if f.get("tipo") == "commit":
            return "commit"
        if f.get("tipo") == "sin_cambios":
            return "sin_cambios"
        if f.get("tipo") == "estancado" and "colgado" in (f.get("texto") or "").lower():
            return "colgada"
    e = (prog or {}).get(tid)
    if isinstance(e, dict):
        est = e.get("estado")
        if est in ("commit", "hecho", "integrada"):
            return "commit"
        if est == "sin_cambios":
            return "sin_cambios"
        if est in ("estancada", "colgada"):
            return "colgada"
    return "otro"


def _modelos(fuentes, desde, hasta):
    pasos = fuentes.get("pasos")
    if not pasos:
        return None, "sin pasos en la ventana"
    prog = fuentes.get("progreso") or {}
    por = {}
    uso = {}
    for tid, filas in pasos.items():
        ven = _filas_en_ventana(filas, desde, hasta)
        escrituras = [f for f in ven if f.get("paso") == "escritura" and f.get("modelo")]
        if not escrituras:
            continue
        ultimo = str(escrituras[-1]["modelo"])  # último de la ventana
        for f in escrituras:
            uso.setdefault(str(f["modelo"]), []).append(float(f.get("segundos") or 0))
        estado = _estado_tarea(tid, fuentes, desde, hasta, prog)
        d = por.setdefault(ultimo, {"intentos": 0, "integradas": 0, "sin_cambios": 0, "colgados": 0})
        d["intentos"] += 1
        if estado == "commit":
            d["integradas"] += 1
        elif estado == "sin_cambios":
            d["sin_cambios"] += 1
        elif estado == "colgada":
            d["colgados"] += 1
    if not por:
        return None, "sin pasos de escritura en la ventana"
    out = {}
    for modelo, d in sorted(por.items()):
        con_cambios = d["intentos"] - d["sin_cambios"] - d["colgados"]
        out[modelo] = {
            "intentos": d["intentos"],
            "con_cambios": max(0, con_cambios),
            "integradas": d["integradas"],
            "sin_cambios": d["sin_cambios"],
            "colgados": d["colgados"],
            "segundos_mediana": _mediana(uso.get(modelo) or []),
            "tasa": round(d["integradas"] / d["intentos"], 3) if d["intentos"] else None,
        }
    return out, None


def _rotacion_en_uso(modelos_metrica):
    """La rotación visible para este módulo: modelos que escribieron en la ventana."""
    return set((modelos_metrica or {}).keys())


def _modelos_utiles_informe(informe):
    """Útil según pasarelas-informe: el sondeado si «escribe» o los `modelos_extra`
    de una pasarela utilizable. Devuelve {clave_pasarela: [modelo_completo, …]}. PURA."""
    utiles = {}
    for fila in (informe or {}).get("pasarelas") or []:
        clave, estado = fila.get("clave"), fila.get("estado")
        if not clave:
            continue
        lista = []
        if estado == "escribe" and fila.get("modelo"):
            lista.append("%s/%s" % (clave, fila["modelo"]))
        if estado in ("escribe", "lenta", "sin_herramientas"):
            lista += ["%s/%s" % (clave, m) for m in (fila.get("modelos_extra") or []) if m]
        if lista:
            utiles[clave] = lista
    return utiles


def _proveedores(fuentes, rotacion):
    salud, informe = fuentes.get("salud_proveedores"), fuentes.get("pasarelas")
    if salud is None and informe is None:
        return None, "sin salud-proveedores ni pasarelas-informe"
    utiles = _modelos_utiles_informe(informe)
    claves = set((salud or {}).keys()) | set(utiles.keys())
    out = {}
    for clave in sorted(claves):
        s = (salud or {}).get(clave)
        s = s if isinstance(s, dict) else {}
        estado = s.get("estado")
        sin_cupo = s.get("sin_cupo_hasta")
        if informe is not None:
            for fila in informe.get("pasarelas") or []:
                if fila.get("clave") == clave:
                    estado = estado or fila.get("estado")
                    break
        modelos_p = [m for m in utiles.get(clave) or []]
        out[clave] = {
            "estado": estado,
            "sin_cupo_hasta": sin_cupo,
            "modelos_utiles": len(modelos_p),
            "en_rotacion": sum(1 for m in modelos_p if m in rotacion),
        }
    return out, None


def _sin_usar(fuentes, rotacion):
    informe = fuentes.get("pasarelas")
    if informe is None:
        return None, "sin pasarelas-informe.json"
    utiles = _modelos_utiles_informe(informe)
    return sorted({m for lista in utiles.values() for m in lista} - set(rotacion)), None


def _memoria(fuentes):
    gov = fuentes.get("gobernador")
    if not isinstance(gov, dict) or not gov:
        return None, "sin gobernador.json"
    swap_usado = gov.get("swap_mb")
    swap_total = gov.get("swap_total_mb")
    if swap_total is None and isinstance(swap_usado, (int, float)) and gov.get("swap_pct") is not None:
        pct = gov.get("swap_pct")
        swap_total = round(swap_usado / (pct / 100.0), 1) if pct else None
    return {
        "swap_usado_mb": swap_usado,
        "swap_total_mb": swap_total,
        "ram_libre_mb": gov.get("ram_libre_mb"),
    }, None


def _coste(fuentes, ahora):
    jev, limites, consumo = fuentes.get("jev_uso"), fuentes.get("limites_claude"), fuentes.get("consumo")
    if jev is None and limites is None and consumo is None:
        return None, "sin fuentes de coste"
    jev_dia = None
    if isinstance(jev, dict):
        dia = datetime.fromtimestamp(ahora).strftime("%Y-%m-%d")
        d = (jev.get("dias") or {}).get(dia) or {}
        if isinstance(d.get("coste_usd"), (int, float)):
            jev_dia = float(d["coste_usd"])
    opus_pct = None
    if isinstance(limites, dict):
        lecturas = limites.get("lecturas") or []
        if lecturas:
            ultima = lecturas[-1]
            opus_pct = ultima.get("opus_pct", ultima.get("semana_pct"))
    supa_pct = None
    if isinstance(consumo, dict):
        pct = (consumo.get("presupuesto") or {}).get("pct")
        if isinstance(pct, (int, float)):
            supa_pct = round(pct * 100.0, 2)
    return {"jev_dia_usd": jev_dia, "opus_semana_pct": opus_pct, "supabase_pct_dia": supa_pct}, None


def _nube(fuentes, ahora):
    pausada_info, cont = fuentes.get("nube_pausada"), fuentes.get("contenedores")
    if pausada_info is None and cont is None:
        return None, "sin nube-pausada ni contenedores"
    pausada, motivo = False, None
    if isinstance(pausada_info, dict) and pausada_info:
        hasta = _epoch(pausada_info.get("hasta"))
        pausada = hasta is None or hasta > ahora
        motivo = pausada_info.get("motivo")
    libres = None
    if isinstance(cont, dict) and isinstance(cont.get("contenedores"), list):
        libres = sum(
            c.get("agentes_libres") or 0
            for c in cont["contenedores"]
            if isinstance(c, dict)
        )
    return {"pausada": pausada, "motivo": motivo, "contenedores_libres": libres}, None


def _tasa_reversion_modelos(fuentes, ahora):
    historial = fuentes.get("produccion_historial")
    if not historial:
        return None, "sin produccion_historial"
    ahora_ep = _epoch(ahora) or 0.0
    desde = ahora_ep - 7 * 24 * 3600
    lotes = [f for f in historial if (f.get("_t") or 0) >= desde]
    por_modelo = {}
    for lote in lotes:
        modelos = lote.get("modelos") or []
        if isinstance(modelos, str):
            modelos = [modelos]
        revertido = bool(lote.get("revertido") or lote.get("resultado") == "revertido" or lote.get("resultado") == "reversion")
        for m in modelos:
            if not isinstance(m, str):
                continue
            d = por_modelo.setdefault(m, {"total": 0, "reversiones": 0})
            d["total"] += 1
            if revertido:
                d["reversiones"] += 1
    out = {}
    for m, d in por_modelo.items():
        if d["total"] >= 3:
            tasa = d["reversiones"] / d["total"] if d["total"] else None
            out[m] = {"total": d["total"], "reversiones": d["reversiones"], "tasa": round(tasa, 3) if tasa is not None else None}
    if not out:
        return {}, None
    return out, None


def _latencia_peticion_publicacion(fuentes, ahora):
    historial = fuentes.get("produccion_historial")
    if not historial:
        return None, "sin produccion_historial"
    ahora_ep = _epoch(ahora) or 0.0
    desde = ahora_ep - 7 * 24 * 3600
    vals = []
    for f in historial:
        if (f.get("_t") or 0) < desde:
            continue
        v = f.get("latencia_peticion_publicacion") or f.get("latencia")
        if isinstance(v, (int, float)):
            vals.append(float(v))
    if not vals:
        return None, "sin latencias en ventana"
    return {"mediana": _mediana(vals), "p90": _p90(vals)}, None


CLAVES = ("integradas_h", "trabajadores", "listas", "fracción_escribiendo", "fases",
          "modelos", "proveedores", "sin_usar", "memoria", "coste", "nube")


def medir(fuentes, ahora, ventana_h=6):
    """PURA. `fuentes`: dict nombre→contenido ya cargado (todo opcional). Devuelve
    exactamente las claves de la tabla §2 más `faltan` (clave→motivo de los null)."""
    ahora_ep = _epoch(ahora) or 0.0
    desde = ahora_ep - float(ventana_h) * 3600
    fuentes = fuentes or {}
    m = {}
    faltan = {}

    m["integradas_h"], e = _integradas_h(fuentes, desde, ahora_ep, ventana_h)
    if e:
        faltan["integradas_h"] = e
    m["trabajadores"], e = _trabajadores(fuentes, ahora_ep)
    if e:
        faltan["trabajadores"] = e
    m["listas"], e = _listas(fuentes)
    if e:
        faltan["listas"] = e
    m["fracción_escribiendo"], e = _fraccion_escribiendo(fuentes, desde, ahora_ep)
    if e:
        faltan["fracción_escribiendo"] = e
    m["fases"], e = _fases(fuentes, desde, ahora_ep)
    if e:
        faltan["fases"] = e
    m["modelos"], e = _modelos(fuentes, desde, ahora_ep)
    if e:
        faltan["modelos"] = e

    rotacion = _rotacion_en_uso(m["modelos"])
    m["proveedores"], e = _proveedores(fuentes, rotacion)
    if e:
        faltan["proveedores"] = e
    m["sin_usar"], e = _sin_usar(fuentes, rotacion)
    if e:
        faltan["sin_usar"] = e
    m["memoria"], e = _memoria(fuentes)
    if e:
        faltan["memoria"] = e
    m["coste"], e = _coste(fuentes, ahora_ep)
    if e:
        faltan["coste"] = e
    m["nube"], e = _nube(fuentes, ahora_ep)
    if e:
        faltan["nube"] = e

    m["tasa_reversion_por_modelo"], e = _tasa_reversion_modelos(fuentes, ahora_ep)
    if e:
        faltan["tasa_reversion_por_modelo"] = e
    m["latencia_peticion_publicacion"], e = _latencia_peticion_publicacion(fuentes, ahora_ep)
    if e:
        faltan["latencia_peticion_publicacion"] = e

    m["faltan"] = faltan
    return m


def _leer_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _leer_jsonl_desde_el_final(ruta, hace_s):
    """Solo las líneas con `t` dentro de las últimas `hace_s` segundos (epoch de corte),
    leyendo el archivo desde el final en bloques para no cargar un log de meses."""
    nuevas = []
    try:
        with open(ruta, "rb") as f:
            f.seek(0, os.SEEK_END)
            pos = f.tell()
            resto = b""
            parar = False
            while pos > 0 and not parar:
                salto = min(1 << 16, pos)
                pos -= salto
                f.seek(pos)
                trozo = f.read(salto) + resto
                partes = trozo.split(b"\n")
                resto = partes[0]  # línea a medias (la primera del trozo)
                for linea in reversed(partes[1:]):
                    if not linea.strip():
                        continue
                    try:
                        d = json.loads(linea.decode("utf-8", "replace"))
                    except ValueError:
                        continue
                    t = _epoch(d.get("t") or d.get("timestamp"))
                    if t is None:
                        continue
                    if t < hace_s:
                        parar = True
                        break
                    d["_t"] = t
                    nuevas.append(d)
        if not parar and resto.strip():
            try:
                d = json.loads(resto.decode("utf-8", "replace"))
                t = _epoch(d.get("t") or d.get("timestamp"))
                if t is not None and t >= hace_s:
                    d["_t"] = t
                    nuevas.append(d)
            except ValueError:
                pass
    except OSError:
        return None
    nuevas.reverse()
    return nuevas


def _cargar_pasos(dir_pasos, desde):
    """Pasos de los archivos *.jsonl modificados en la ventana, con `_t` en epoch."""
    salida = {}
    try:
        nombres = [n for n in os.listdir(dir_pasos) if n.endswith(".jsonl")]
    except OSError:
        return salida
    for nombre in nombres:
        ruta = os.path.join(dir_pasos, nombre)
        try:
            if os.path.getmtime(ruta) < desde:
                continue
        except OSError:
            continue
        tid = nombre[:-6]
        filas = []
        try:
            with open(ruta, encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea:
                        continue
                    try:
                        d = json.loads(linea)
                    except ValueError:
                        continue
                    d["_t"] = _epoch(d.get("t")) or 0.0
                    filas.append(d)
        except OSError:
            continue
        if filas:
            salida[tid] = filas
    return salida


def cargar_fuentes(raiz, home, ahora=None, ventana_h=6):
    """La ÚNICA función con E/S. Lee las fuentes de §2 sin reventar si faltan o
    están rotas: devuelve solo lo que se pudo cargar. `eventos.jsonl`, solo las
    últimas 24 h (leyendo desde el final); `pasos/*.jsonl`, solo los modificados
    dentro de la ventana."""
    ahora_ep = _epoch(ahora) if ahora is not None else None
    if not ahora_ep:
        ahora_ep = datetime.now().timestamp()
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    dotstarseed = os.path.join(home, ".starseed")
    mando = os.path.join(raiz, "starseed_memory_root", "mando")
    fuentes = {}

    d = _leer_json(os.path.join(olas, "progreso.json"))
    if isinstance(d, dict):
        fuentes["progreso"] = d
    d = _leer_json(os.path.join(olas, "medios.json"))
    if isinstance(d, dict):
        fuentes["medios"] = d
    ev = _leer_jsonl_desde_el_final(
        os.path.join(olas, "eventos.jsonl"), ahora_ep - VENTANA_EVENTOS_H * 3600
    )
    if ev:
        fuentes["eventos"] = ev
    pasos = _cargar_pasos(
        os.path.join(olas, "pasos"), ahora_ep - float(ventana_h) * 3600
    )
    if pasos:
        fuentes["pasos"] = pasos

    latidos = []
    try:
        for nombre in os.listdir(olas):
            if nombre.startswith("latidos-") and nombre.endswith(".json"):
                d = _leer_json(os.path.join(olas, nombre))
                if isinstance(d, dict):
                    latidos.append(d)
    except OSError:
        pass
    if latidos:
        fuentes["latidos"] = latidos

    pares = (
        ("gobernador", os.path.join(dotstarseed, "gobernador.json")),
        ("salud_proveedores", os.path.join(dotstarseed, "salud-proveedores.json")),
        ("pasarelas", os.path.join(dotstarseed, "pasarelas-informe.json")),
        ("consumo", os.path.join(dotstarseed, "consumo.json")),
        ("jev_uso", os.path.join(dotstarseed, "jev-uso.json")),
        ("limites_claude", os.path.join(dotstarseed, "limites-claude.json")),
        ("nube_pausada", os.path.join(dotstarseed, "nube-pausada.json")),
        ("tokens", os.path.join(mando, "tokens-por-segundo.json")),
        ("contenedores", os.path.join(mando, "contenedores.json")),
    )
    for clave, ruta in pares:
        d = _leer_json(ruta)
        if d is not None:
            fuentes[clave] = d

    hist_path = os.path.expanduser("~/.starseed/produccion/historial.jsonl")
    hist = _leer_jsonl_desde_el_final(hist_path, ahora_ep - 7 * 24 * 3600)
    if hist:
        fuentes["produccion_historial"] = hist

    return fuentes
