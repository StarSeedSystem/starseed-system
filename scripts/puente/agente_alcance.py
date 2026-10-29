#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""agente_alcance · el agente de alcance de MetaGenesis (INV1025M · Ola 1025R).

Contrato: `architecture/repos-libreria-1025.md` §7 (R1–R10). Cruza Agent-Reach, ScrapeGraphAI,
OpenRefine, Inbox Zero y el almacén privado. Se IMPORTA lo reutilizable de
`agente_referencias_diseno.py` (mismo formato de imaginación, podas y estados) y de
`alcance_plan.py`; nada se copia. La lógica es pura: disco, reloj, Jev y encargo inyectables; nunca
toca el repo. Nada escribe en `src/` ni ejecuta envíos (R2): este módulo se queda en borradores.

  - `ciclo(raiz, ahora, encargar=…, jev=…, home=…, seco=…)`: cada CADA_HORAS, ≤ 2 objetivos y
    funde los encargos en `starseed_memory_root/olas/cola-suenos-alcance.json` (el prefijo
    `cola-suenos-` aparta a los orquestadores de código; nunca lanza un orquestador). Sin carta,
    encarga CERO y deja la propuesta «Falta la carta de StarSeed».
  - `recoger_salidas(...)` NORMALIZA y VALIDA lo que la flota devolvió: título ≤ 200, cuerpo
    ≤ 8000 y mensaje ≤ 220 palabras; referencias solo https de dominios de la ficha o StarSeed;
    cada afirmación sobre el destinatario con su `fuente_url` presente en la ficha (si no, se
    descarta la propuesta); sin adjuntos ni píxeles de seguimiento y SIN dirección de correo
    (R5); `importancia` forzada a «alta» y `estado` a «esperando-aprobacion» (R2, R7, R8).
  - Estado en `starseed_memory_root/imaginacion/agente-alcance/estado.json`: SOLO ids y fechas
    (nunca contenido de terceros).

  python3 scripts/puente/agente_alcance.py plan | ciclo [--seco] | estado
"""
import argparse
import json
import os
import re
import sys
from datetime import timedelta
from urllib.parse import urlparse

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import agente_referencias_diseno as D  # noqa: E402
import alcance_plan as P  # noqa: E402
import alcance_objetivos as AO  # noqa: E402
import alcance_fichas as AF  # noqa: E402

AGENTE = P.AGENTE
QUIEN = P.QUIEN
REL_ESTADO = "starseed_memory_root/imaginacion/agente-alcance/estado.json"
SITIOS_STARSEED = ("starseed", "astraura", "star.seed", "stara.seed")
#: R7: adjuntos y píxeles de seguimiento al barrer (se descarta la propuesta si los trae).
RE_SEGUIMIENTO = re.compile(r"utm_|pixel|beacon|1x1|tracking|adjunt|attach", re.I)
_APLICA = re.compile(r"^alcance-(\d{4}-\d{2}-\d{2})-(\d+)\.json$")


# ─────────────────────────────── utilidades puras ───────────────────────────────

def _palabras(texto):
    return len(re.findall(r"[A-Za-zÀ-ÿ0-9]+", str(texto or "")))


def _dominio(url):
    try:
        host = urlparse(str(url or "")).hostname or ""
    except ValueError:
        host = ""
    host = host.lower()
    return host[4:] if host.startswith("www.") else host


def _nuestro(host):
    return any(clave in host for clave in SITIOS_STARSEED)


def _valida(p, ficha):
    """La propuesta de la flota, normalizada y validada (R5, R7, R8). PURA. None si se descarta."""
    crudo = p if isinstance(p, dict) else None
    if crudo is None:
        return None
    cuerpo = D._bloque(crudo.get("cuerpo") or "", D.MAX_CUERPO)
    titulo = D._limpio(crudo.get("titulo") or D._limpio(cuerpo, 80), D.MAX_TITULO)
    destino_bruto = crudo.get("destino")
    destino = destino_bruto if isinstance(destino_bruto, dict) else {}
    todo = " %s %s %s" % (titulo, cuerpo, str(destino.get("asunto") or ""))
    if P.RE_MAIL.search(todo) or RE_SEGUIMIENTO.search(todo) or _palabras(cuerpo) > P.MAX_MENSAJE:
        return None
    ficha_dict = ficha if isinstance(ficha, dict) else {}
    urls_ficha = P._urls_ficha(ficha_dict)
    brutas = crudo.get("afirmaciones") or []
    afirmaciones = [a for a in brutas if isinstance(a, dict)]
    for a in afirmaciones:
        url = a.get("fuente_url")
        if not str(a.get("texto") or "") or not D._https(url) or url not in urls_ficha:
            return None  # cada afirmación sobre el destinatario con su fuente de la ficha
    dominios = P._dominios_ficha(ficha_dict)
    referencias = [r for r in D.referencias_validas(crudo.get("referencias"))
                   if _dominio(r["url"]) in dominios or _nuestro(_dominio(r["url"]))]
    medio = str(destino.get("medio") or "correo-propio")
    return {
        "titulo": titulo, "tipo": "contenido", "cuerpo": cuerpo, "referencias": referencias,
        "destino": {"objetivo": D._limpio(ficha_dict.get("obj_id") or destino.get("objetivo") or "", 120),
                    "medio": medio if medio in P.MEDIOS else "correo-propio",
                    "asunto": D._limpio(destino.get("asunto") or "", 200)},
        "afirmaciones": [{"texto": D._limpio(a.get("texto"), 300), "fuente_url": a["fuente_url"]}
                         for a in afirmaciones],
    }


def normalizar_salida(dato, fecha, n, ahora, ficha=None):
    """El archivo `alcance-<fecha>-<n>.json` en el formato del contrato: SOLO propuestas válidas
    (las descartadas iban), importancia «alta» y estado «esperando-aprobacion» forzados. PURA."""
    crudo = dato if isinstance(dato, dict) else None
    if crudo is not None and crudo.get("formato") == P.FORMATO_SALIDA and crudo.get("agente") == AGENTE:
        lista = crudo.get("propuestas") or []
    elif crudo is not None and isinstance(crudo.get("propuestas"), list):
        lista = crudo.get("propuestas") or []
    else:
        lista = dato if isinstance(dato, list) else []
    origen = [x for x in lista if isinstance(x, (dict, str))][:20]
    propuestas = []
    for i, p in enumerate(origen, 1):
        v = _valida(p, ficha)
        if v is None:
            continue
        v.update({"id": P.id_doc(fecha, n, i), "fuente": P.FUENTE, "agente": AGENTE, "ambito": "metagenesis",
                  "importancia": "alta", "estado": "esperando-aprobacion", "t": D._iso(ahora), "version": 1})
        propuestas.append(v)
    return {"formato": P.FORMATO_SALIDA, "version": P.VERSION_SALIDA, "fuente": P.FUENTE, "agente": AGENTE,
            "fecha": fecha, "n": int(n), "tarea": crudo.get("tarea") if crudo is not None else None,
            "objetivo": str(crudo.get("contexto") or "") if crudo is not None else "",
            "generado": D._iso(ahora), "propuestas": propuestas}


# ─────────────────────────────── estado (SOLO ids y fechas) ───────────────────────────────

def estado_vacio():
    return {"version": 1, "ultimo_ciclo": None, "ciclos": 0, "objetivos": {}, "salidas": {},
            "encargos": [], "n_por_fecha": {}, "sin_carta": None}


def cargar_estado(raiz):
    d = D._json(D.disco(raiz)[0](REL_ESTADO) or "", None)
    base = estado_vacio()
    if isinstance(d, dict):
        base.update({k: v for k, v in d.items() if k in base and isinstance(v, type(base[k]))})
    return base


def recoger_salidas(raiz, estado, ahora, fichas=None, leer=None, listar=None, escribir=True):
    """Lo que la flota devolvió en `imaginacion/agentes/alcance-…json`: se NORMALIZA y VALIDA
    (se reescribe si cambió) y se registra en `estado` (copia en mano). PURA con listas inyectables."""
    l, ls, _ = D.disco(raiz)
    leer, listar = leer or l, listar or ls
    fichas = fichas if isinstance(fichas, dict) else {}
    fuera = {"procesadas": 0, "propuestas": 0, "descartadas": 0, "reescritas": 0}
    for nombre in listar(P.REL_SALIDAS):
        m = _APLICA.match(nombre)
        if not m:
            continue
        fecha, n = m.group(1), int(m.group(2))
        npf = estado.setdefault("n_por_fecha", {})
        npf[fecha] = max(int(npf.get(fecha) or 0), n)
        if nombre in (estado.get("salidas") or {}):
            continue
        texto = leer("%s/%s" % (P.REL_SALIDAS, nombre))
        dato = D._json(texto, None)
        if dato is None:
            continue  # ilegible o a medio escribir: se mira en el próximo ciclo
        crudo = dato if isinstance(dato, dict) else None
        objetivo_id = str(crudo.get("objetivo") or crudo.get("contexto") or "") if crudo is not None else ""
        doc = normalizar_salida(dato, fecha, n, ahora, fichas.get(objetivo_id))
        crudas = len((crudo.get("propuestas") if crudo is not None and isinstance(crudo.get("propuestas"), list)
                      else (dato if isinstance(dato, list) else [])) or [])
        fuera["descartadas"] += max(0, crudas - len(doc["propuestas"]))
        if escribir and (not isinstance(dato, dict) or dato != doc):
            D._escribir_json(os.path.join(raiz, P.REL_SALIDAS, nombre), doc)
            fuera["reescritas"] += 1
        estado.setdefault("salidas", {})[nombre] = {"procesada": D._iso(ahora), "propuestas": len(doc["propuestas"])}
        fuera["procesadas"] += 1
        fuera["propuestas"] += len(doc["propuestas"])
    return fuera


# ─────────────────────────────── encargo a la flota (vía suenos.py) ───────────────────────────────

def encargar_por_flota(raiz, tareas, fecha=None, ahora=None, vivos=None, apto=None, libre=None):
    """Encarga a la flota GRATUITA la misma vía que el agente de diseño (suenos.fundir_tareas,
    escritura atómica) y NUNCA lanza un orquestador. `vivos`/`apto`/`libre` inyectables (pruebas)."""
    import suenos as S  # noqa: WPS433
    momento = D._como_fecha(ahora)
    r = S.rutas(raiz)
    ruta_cola = os.path.join(r["olas"], P.NOMBRE_COLA)
    previas = S._leer_json(ruta_cola, [])
    lista = previas if isinstance(previas, list) else (previas.get("tareas") or [] if isinstance(previas, dict) else [])
    propio_viejo = D._iso(momento - timedelta(days=P.DIAS_COLA))
    propia = [t for t in lista if isinstance(t, dict) and t.get("agente") == AGENTE
              and str(t.get("creada") or "") < propio_viejo]
    lista = [t for t in lista if t not in propia]
    S._escribir_json(ruta_cola, S.fundir_tareas(lista, tareas))
    fuera = {"ok": True, "cola": "%s/%s" % (P.REL_OLAS, P.NOMBRE_COLA), "tareas": [t["id"] for t in tareas]}
    vivos = S.orquestadores_vivos() if vivos is None else vivos
    apto_orq, mtime_orq = S.orquestador_instalado_apto() if apto is None else apto
    sabe_libre, mtime_libre = D.analista_libre_instalado() if libre is None else libre
    propio = [o for o in vivos if o.get("cola") == P.NOMBRE_COLA]
    otros = [o for o in vivos if o.get("cola") != P.NOMBRE_COLA]
    if not apto_orq:
        fuera.update(accion="cola_lista", motivo="sin_orquestador_apto", mensaje=(
            "El orquestador instalado no sabe analizar (bash scripts/enjambre/instalar.sh): %d encargo(s) "
            "quedan listos en %s y nada se mete en una cola viva." % (len(tareas), fuera["cola"])))
    elif not sabe_libre:
        fuera.update(accion="cola_lista", motivo="sin_analisis_libre", mensaje=(
            "La flota aún no sabe hacer análisis libres: %d encargo(s) quedan listos en %s." % (len(tareas), fuera["cola"])))
    elif propio:
        fuera.update(accion="releida", pid=propio[0].get("pid"),
                     mensaje="Un orquestador ya corre esta cola: la releerá al quedar un hueco.")
    elif otros:
        o = otros[0]
        if S.puede_sonar(o, max(float(mtime_orq or 0), float(mtime_libre or 0)),
                         ahora=D._como_fecha(ahora).timestamp()):
            viva = os.path.join(r["olas"], o["cola"])
            prev = S._leer_json(viva, [])
            vl = prev if isinstance(prev, list) else (prev.get("tareas") or [] if isinstance(prev, dict) else [])
            S._escribir_json(viva, S.fundir_tareas(vl, tareas) if isinstance(prev, list)
                             else dict(prev, tareas=S.fundir_tareas(vl, tareas)))
            fuera.update(accion="tanda_viva", pid=o.get("pid"), cola_viva=o["cola"], mensaje=(
                "Un solo orquestador: %d encargo(s) añadidos a su cola viva (%s)." % (len(tareas), o["cola"])))
        else:
            fuera.update(accion="esperar", pid=o.get("pid"), mensaje=(
                "Hay un orquestador vivo que arrancó antes: la regla es UNO; la cola queda lista en %s." % fuera["cola"]))
    else:
        fuera.update(accion="cola_lista", motivo="sin_orquestador", mensaje=(
            "No hay orquestador vivo: %d encargo(s) listos en %s (se lanzan desde Genesis; este agente "
            "nunca arranca un orquestador)." % (len(tareas), fuera["cola"])))
    return fuera


# ─────────────────────────────── el ciclo ───────────────────────────────

def _ficha_de(obj_id, home):
    """La ficha pública del almacén privado (R5: vive en ~/.starseed/alcance/fichas, no en la espejada)."""
    if not obj_id:
        return None
    try:
        ruta = os.path.join(AO.ruta_almacen(home), "fichas", str(obj_id).replace("/", "_") + ".json")
        with open(ruta, encoding="utf-8") as f:
            ficha = json.load(f)
    except (OSError, ValueError):
        return None
    return ficha if isinstance(ficha, dict) else None


def ciclo(raiz, ahora=None, encargar=None, jev=None, home=None, seco=False, forzar=False, fichas=None):
    """Un ciclo del agente de alcance: recogida → (20 h) → elegir objetivos → fichas → encargos.
    Todo inyectable: `encargar` (None = encargar_por_flota; False = no encargar), `jev` (None =
    decidir.consultar_lote; False = callado), `home` (del almacén 700/600), `fichas` {id: ficha}.
    `seco`: nada de escrituras, ni encargos, ni Jev. Devuelve un resumen (dict)."""
    momento = D._como_fecha(ahora)
    fecha = momento.date().isoformat()
    leer, listar, _ = D.disco(raiz)
    estado = cargar_estado(raiz)
    resumen = {"ok": True, "agente": AGENTE, "fecha": fecha, "seco": bool(seco), "toca": True, "tareas": []}
    recogida = recoger_salidas(raiz, estado, momento, fichas, escribir=not seco)
    resumen.update(recogidas=recogida["procesadas"], propuestas=recogida["propuestas"])
    if not forzar and D._dentro(estado.get("ultimo_ciclo"), momento, horas=P.CADA_HORAS):
        resumen.update(toca=False, motivo="ya hubo ciclo hace menos de %d h (%s)"
                       % (P.CADA_HORAS, estado.get("ultimo_ciclo")))
        if not seco and (recogida["procesadas"] or recogida["reescritas"]):
            D._escribir_json(os.path.join(raiz, REL_ESTADO), estado)
        return resumen

    carta = leer(P.REL_CARTA)
    if not (isinstance(carta, str) and carta.strip()):
        resumen.update(toca=False, carta_falta=True,
                       mensaje="Falta la carta de StarSeed (memory/alcance/carta-starseed.md): no se encarga nada.",
                       encargo={"accion": "nada",
                                "mensaje": "Falta la carta de StarSeed: no se encarga ningún borrador."})
        n = int((estado.get("n_por_fecha") or {}).get(fecha) or 0) + 1
        nombre = "alcance-%s-%d.json" % (fecha, n)
        if not seco and n <= 99 and nombre not in (estado.get("salidas") or {}):
            doc = P.sin_carta_doc(fecha, n, momento)
            D._escribir_json(os.path.join(raiz, P.REL_SALIDAS, nombre), doc)
            estado.setdefault("salidas", {})[nombre] = {"procesada": D._iso(momento), "propuestas": 1}
            estado["sin_carta"] = doc["generado"]
            npf = estado.setdefault("n_por_fecha", {})
            npf[fecha] = max(int(npf.get(fecha) or 0), n)
            D._escribir_json(os.path.join(raiz, REL_ESTADO), estado)
        return resumen

    objetivos = AO.leer("objetivos", home)
    registros = AO.leer("registro", home)
    registros = registros if isinstance(registros, dict) else {}
    for o in objetivos:
        if isinstance(o, dict) and o.get("id") and isinstance(registros.get(o["id"]), dict):
            o["registro"] = registros[o["id"]]
    elegidos, vetos = P.elegir_objetivos(objetivos, estado, momento, P.TOPE_CICLO, False if seco else jev)

    mapa = fichas if isinstance(fichas, dict) else {}
    tareas, n = [], int((estado.get("n_por_fecha") or {}).get(fecha) or 0) + 1
    for o in elegidos:
        ficha = mapa.get(o["id"]) or _ficha_de(o["id"], home)
        if not ficha or AF.esta_caducada(ficha, momento):
            continue
        tareas.append(P.tarea_de(o, ficha, carta, momento, n))
        n += 1

    if seco:
        encargo = {"accion": "seco", "mensaje": "(seco) nada se escribe ni se encarga"}
    elif encargar is False or not tareas:
        encargo = {"accion": "nada", "mensaje": "Sin encargos de alcance hoy."}
    else:
        try:
            encargo = (encargar or encargar_por_flota)(raiz, tareas, fecha=fecha, ahora=momento)
        except Exception as e:  # noqa: BLE001 — el ciclo dice qué pasó, nunca muere en silencio
            encargo = {"ok": False, "accion": "error", "mensaje": "No se pudo encargar: %s" % type(e).__name__}

    if not seco:
        t = D._iso(momento)
        for o in elegidos:
            estado.setdefault("objetivos", {})[o["id"]] = {"ultima": t}
        estado["encargos"] = (list(estado.get("encargos") or []) + [
            {"t": t, "tareas": [x["id"] for x in tareas], "accion": encargo.get("accion"),
             "cola": encargo.get("cola")}])[-30:]
        estado["ultimo_ciclo"] = t
        estado["ciclos"] = int(estado.get("ciclos") or 0) + 1
        estado["sin_carta"] = None
        D._escribir_json(os.path.join(raiz, REL_ESTADO), estado)

    resumen.update(vetos=vetos, elegidos=[o["id"] for o in elegidos],
                   tareas=[{"id": x["id"], "contexto": x["contexto"], "salida": x["salida"]} for x in tareas],
                   encargo=encargo,
                   mensaje="Alcance %s: %d encargo(s) de borrador · %d veto(s) · %s" % (
                       fecha, len(tareas), len(vetos), encargo.get("mensaje") or ""))
    return resumen


# ─────────────────────────────── CLI ───────────────────────────────

def cmd_plan(a, raiz, home):
    """El plan de HOY sin tocar nada: objetivos elegidos por la regla y si hay carta (seco)."""
    momento = D._como_fecha(None)
    leer, _, _ = D.disco(raiz)
    estado = cargar_estado(raiz)
    objetivos = AO.leer("objetivos", home)
    elegidos, vetos = P.elegir_objetivos(objetivos, estado, momento, P.TOPE_CICLO, False if a.seco else None)
    carta = leer(P.REL_CARTA)
    con_carta = bool(isinstance(carta, str) and carta.strip())
    lista = [{"id": o["id"], "nombre": o.get("nombre_publico"), "nivel": o.get("nivel"),
              "ficha": "si" if _ficha_de(o["id"], home) else "no"} for o in elegidos if isinstance(o, dict)]
    return 0, {"ok": True, "fecha": momento.date().isoformat(), "carta": "si" if con_carta else "falta",
               "elegidos": lista,
               "vetos": vetos,
               "nota": "" if con_carta else "Sin carta no se encarga nada (propuesta «Falta la carta de StarSeed»)."}


def cmd_ciclo(a, raiz, home):
    r = ciclo(raiz, None, jev=False if a.sin_jev else None, home=home, seco=a.seco, forzar=a.forzar)
    return (0 if r.get("ok") else 1), r


def cmd_estado(a, raiz, home):
    estado = cargar_estado(raiz)
    cola = D._json(D.disco(raiz)[0]("%s/%s" % (P.REL_OLAS, P.NOMBRE_COLA)) or "", [])
    lista = cola if isinstance(cola, list) else (cola.get("tareas") or [] if isinstance(cola, dict) else [])
    cuentas = {}
    for t in lista:
        if isinstance(t, dict) and t.get("agente") == AGENTE:
            cuentas[t.get("id")] = str(t.get("creada") or "")[:10]
    return 0, {"ok": True, "ultimo_ciclo": estado.get("ultimo_ciclo"), "ciclos": estado.get("ciclos"),
               "objetivos_tocados": len(estado.get("objetivos") or {}),
               "salidas_recogidas": len(estado.get("salidas") or {}),
               "sin_carta": estado.get("sin_carta"), "cola": "%s/%s" % (P.REL_OLAS, P.NOMBRE_COLA),
               "cola_tareas": cuentas, "ultimo_encargo": (estado.get("encargos") or [None])[-1]}


def pintar(orden, d, salida):
    w = salida.write
    if orden == "plan":
        w("Plan de alcance %s · carta %s%s\n" % (d["fecha"], d["carta"], (": " + d["nota"]) if d["nota"] else ""))
        for o in d["elegidos"]:
            w("  %s  %s (nivel %s, ficha %s)\n" % (o["id"], o["nombre"], o.get("nivel"), o.get("ficha")))
        if d.get("vetos"):
            w("  vetos de Jev: %s\n" % ", ".join(d["vetos"]))
    elif orden == "ciclo":
        w(("(seco) " if d.get("seco") else "") + (d.get("mensaje") or "") + "\n")
        for t in d.get("tareas") or []:
            w("  %-9s %s → %s\n" % (t["id"], t["contexto"], t["salida"]))
    elif orden == "estado":
        w("Agente de alcance · último ciclo %s · %s ciclos · %d objetivos tocados · %d salidas recogidas\n"
          % (d.get("ultimo_ciclo") or "nunca", d.get("ciclos"), d.get("objetivos_tocados"), d.get("salidas_recogidas")))
        if d.get("sin_carta"):
            w("  ÚLTIMA PROPUESTA «Falta la carta de StarSeed»: %s\n" % d["sin_carta"])
        w("  cola %s: %s\n" % (d.get("cola"), ", ".join("%s (%s)" % (k, v) for k, v in d.get("cola_tareas").items()) or "vacía"))
        if d.get("ultimo_encargo"):
            w("  último encargo: %s · %s\n" % (d["ultimo_encargo"].get("t"), d["ultimo_encargo"].get("accion")))


def parser():
    ap = argparse.ArgumentParser(prog="agente_alcance.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--home", default=None, help=argparse.SUPPRESS)
    sub = ap.add_subparsers(dest="orden", required=True)
    for nombre in ("plan", "ciclo", "estado"):
        p = sub.add_parser(nombre)
        p.add_argument("--json", action="store_true")
        p.add_argument("--seco", action="store_true", help="no escribe, no pregunta a Jev, no encarga")
        # SUPPRESS: así el valor del subcomando no pisa la --raiz ni la --home puestas antes de la orden.
        p.add_argument("--raiz", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
        p.add_argument("--home", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
        if nombre == "ciclo":
            p.add_argument("--forzar", action="store_true", help="aunque hoy ya hubiera ciclo")
            p.add_argument("--sin-jev", action="store_true", help="solo la regla determinista")
    return ap


ORDENES = {"plan": cmd_plan, "ciclo": cmd_ciclo, "estado": cmd_estado}


def main(argv=None, salida=None):
    salida = salida or sys.stdout
    a = parser().parse_args(argv)
    raiz = getattr(a, "raiz", None) or (os.environ.get("STARSEED_ROOT")
                                        or os.path.dirname(os.path.dirname(DIRECTORIO)))
    home = getattr(a, "home", None)
    codigo, datos = ORDENES[a.orden](a, raiz, home)
    if getattr(a, "json", False):
        salida.write(json.dumps(datos, ensure_ascii=False, indent=1, default=list) + "\n")
    else:
        pintar(a.orden, datos, salida)
    return codigo


if __name__ == "__main__":
    sys.exit(main())
