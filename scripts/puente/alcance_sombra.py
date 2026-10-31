# -*- coding: utf-8 -*-
"""Modo SOMBRA del «envío automático inteligente» (INV1025Q · §4 · R2).
Para cada propuesta que Alex ya decidió, calcula qué HABRÍA hecho el automático
con la regla del piloto (nivel bajo, solo correo-propio, 3 al día, sin supresión;
Jev solo veta con p ≥ 0,8) SIN enviar nada y SIN función de envío, y lo anota en
`~/.starseed/alcance/sombra.jsonl`. `informe(ahora)` compara con las decisiones
reales y escribe `validacion.json`; `validado: true` SOLO marca el informe: el
ajuste lo activa Alex tras leerlo escribiendo ACTIVAR — nada enciende ni apaga.
"""
from __future__ import annotations
import json, os
import agente_referencias_diseno as R, alcance_objetivos as AO

NOMBRES = {"sombra": "sombra.jsonl", "validacion": "validacion.json"}
PILOTO = {"tope_dia": 3, "nivel": "bajo", "medio": "correo-propio", "retencion_horas": 2,
          "aviso_cancelar": True, "interruptor_general": True}
MIN_MUESTRAS, DIAS_VENTANA, DIAS_SIN_FP = 30, 21, 30
PCT_REESCRITA, ACIERTO_MIN = 25.0, 95.0
APROBADO = "aprobada-sin-cambios"


def decidir(p, enviados_hoy=0, suprimido=False, ajuste=None, veto=False):
    """Qué HABRÍA hecho el automático con la regla del piloto. PURA; nunca envía."""
    a = dict(PILOTO if ajuste is None else ajuste); p = p if isinstance(p, dict) else {}; motivos = []
    if R._norm(p.get("medio")) != a["medio"]: motivos.append("solo %s en el piloto" % a["medio"])
    if R._norm(p.get("nivel")) != a["nivel"]: motivos.append("solo nivel %s" % a["nivel"])
    if suprimido: motivos.append("destino suprimido")
    if int(enviados_hoy or 0) >= int(a["tope_dia"]): motivos.append("tope de %d al día" % int(a["tope_dia"]))
    if R._norm(p.get("estado")) != "aprobada": motivos.append("sin aprobación del texto")
    respuesta = {"habria": not motivos, "motivo": "; ".join(motivos) or "todo en regla"}
    if veto: respuesta = {"habria": False, "motivo": "%s; Jev vetó (p ≥ 0,8)" % respuesta["motivo"]}
    return respuesta


def linea(f, v, ahora):
    """Una clave de sombra.jsonl: cálculo + decisión real de Alex. PURA."""
    f = f if isinstance(f, dict) else {}
    return {"t": R._iso(ahora), "id": R._limpio(f.get("id"), 120), "medio": R._norm(f.get("medio")),
            "nivel": R._norm(f.get("nivel")), "habria": v["habria"], "motivo": v["motivo"],
            "decision_alex": R._norm(f.get("decision_alex") or "esperando"),
            "reescrita_pct": float(f.get("reescrita_pct") or 0),
            "respondio": None if f.get("respondio") is None else bool(f["respondio"]),
            "incidencia": None if not f.get("incidencia") else R._limpio(f["incidencia"], 200)}


def anotar(filas, ahora=None, home=None, escribir=True):
    """Calcula y apunta cada cálculo de sombra en sombra.jsonl (600). Disco inyectable con `escribir=False`."""
    momento, calc = AO._fecha(ahora), []
    for f in filas or []:
        if not isinstance(f, dict): continue
        v = decidir(f, int(f.get("enviados_hoy") or 0), bool(f.get("suprimido")), veto=bool(f.get("veto")))
        calc.append(linea(f, v, momento))
    if escribir and calc:
        ruta = os.path.join(AO.ruta_almacen(home), NOMBRES["sombra"])
        os.makedirs(os.path.dirname(ruta), mode=0o700, exist_ok=True)
        with open(os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600), "a", encoding="utf-8") as fh:
            for l in calc: fh.write(json.dumps(l, ensure_ascii=False) + "\n")
        os.chmod(ruta, 0o600)
    return {"ok": True, "anotadas": len(calc), "calculadas": calc}


def validar(lineas, ahora):
    """El informe COMPLETO a partir de las claves de sombra. PURA; incumbe solo el informe."""
    momento = AO._fecha(ahora)
    con_fecha = [(l, AO._fecha(l.get("t"))) for l in lineas or [] if isinstance(l, dict) and l.get("t")]
    con_fecha = [(l, f) for l, f in con_fecha if f and f <= momento]
    dias = lambda f: (momento - f).days
    muestras = [l for l, f in con_fecha if dias(f) <= DIAS_VENTANA and R._norm(l.get("decision_alex")) != "esperando"]
    hace30 = [l for l, f in con_fecha if dias(f) <= DIAS_SIN_FP]
    falsos = [l for l in hace30 if l.get("habria") and (R._norm(l.get("decision_alex")) == "rechazada" or float(l.get("reescrita_pct") or 0) > PCT_REESCRITA)]
    sin_cambios = [l for l in muestras if R._norm(l.get("decision_alex")) == APROBADO]
    aciertos = [l for l in sin_cambios if l.get("habria")]
    acierto = 100.0 * len(aciertos) / len(sin_cambios) if sin_cambios else 0.0
    incidencias = [l for l, _ in con_fecha if l.get("incidencia")]
    def tasa(sel):
        informada = [l for l in muestras if bool(l.get("habria")) == sel and l.get("respondio") is not None]
        return round(100.0 * sum(1 for l in informada if l["respondio"]) / len(informada), 1) if informada else None
    auto, manual = tasa(True), tasa(False)
    no_peor = None if auto is None else (True if manual is None else auto >= manual)
    validado = bool(len(muestras) >= MIN_MUESTRAS and not falsos and acierto >= ACIERTO_MIN
                    and not incidencias and no_peor is True)
    return {"ok": True, "fecha": momento.date().isoformat(), "validado": validado,
            "validez": {"muestras_21d": len(muestras), "min": MIN_MUESTRAS, "dias": DIAS_VENTANA},
            "falsos_positivos": {"ultimos_30d": len(falsos), "max": 0, "ids": [l.get("id") for l in falsos]},
            "acierto_sin_cambios": {"pct": round(acierto, 1), "min": ACIERTO_MIN, "muestras": len(sin_cambios), "aciertos": len(aciertos)},
            "incidencias": {"total": len(incidencias), "max": 0, "ids": [l.get("id") for l in incidencias]},
            "tasa_respuesta": {"automatica_pct": auto, "manual_pct": manual, "no_peor": no_peor},
            "piloto": dict(PILOTO),
            "nota": "«validado» solo marca este informe: activar el ajuste lo hace Alex escribiendo ACTIVAR. Nada se envía en sombra."}


def informe(ahora=None, home=None, escribir=True):
    """Lee sombra.jsonl, valida y deja validacion.json (600) en el almacén. Único toque de disco."""
    momento = AO._fecha(ahora); ruta = os.path.join(AO.ruta_almacen(home), NOMBRES["sombra"])
    try:
        with open(ruta, encoding="utf-8") as fh: lineas = [json.loads(x) for x in fh if x.strip()]
    except OSError:
        lineas = []
    v = validar(lineas, momento)
    if escribir:
        destino = os.path.join(AO.ruta_almacen(home), NOMBRES["validacion"])
        os.makedirs(os.path.dirname(destino), mode=0o700, exist_ok=True)
        AO._volcar(destino, v)
    return v


def main(argv=None):
    import argparse, sys
    p = argparse.ArgumentParser(description="Sombra del envío automático de alcance (puro informe)")
    p.add_argument("--seco", action="store_true", help="no escribe validacion.json")
    p.add_argument("--home", default=None)
    a = p.parse_args(argv)
    print(json.dumps(informe(home=a.home, escribir=not a.seco), ensure_ascii=False, indent=1), file=sys.stdout)
    return 0


if __name__ == "__main__":
    main()
