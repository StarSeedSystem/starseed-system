#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Medidor «Laya en cada medio» (LAY1127D).
Mide si Laya está viva y cargada en la Mac y el A1, y las decisiones de Jev de hoy por Laya; lo no medido es «sin dato». Deja ~/.starseed/medidor-laya.json con {t, ...resumen}.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

URL_MAC = "http://127.0.0.1:4470/"
SALIDA = os.path.expanduser("~/.starseed/medidor-laya.json")
USO = os.path.expanduser("~/.starseed/jev-uso.json")

def _medio(nombre, servicio, cargado, motivo):
    return {"medio": nombre, "servicio": bool(servicio), "cargado": cargado,
            "motivo": " ".join(str(motivo).split())}

def _mac(d):
    if not isinstance(d, dict):
        return _medio("mac", False, None, "sin dato: la Mac no respondió en 127.0.0.1:4470")
    carga = d.get("cargado") if isinstance(d.get("cargado"), bool) else None
    return _medio("mac", True, carga, str(d.get("motivo") or ("cargado" if carga else "responde, sin decir si cargó")))

def _a1(d):
    if not isinstance(d, dict):
        return _medio("a1", False, None, "sin dato: no se pudo medir el A1")
    sc = str(d.get("systemctl") or "").strip().lower()
    http = d.get("http") if isinstance(d.get("http"), dict) else None
    if http is not None:
        carga = http.get("cargado") if isinstance(http.get("cargado"), bool) else None
        return _medio("a1", True, carga, str(http.get("motivo") or "responde en 4470"))
    if sc in ("inactive", "failed"):
        return _medio("a1", False, False, "systemd dice %s" % sc)
    return _medio("a1", sc == "active", None, str(d.get("error") or ("systemd dice %s" % (sc or "nada"))))

def _llamadas(uso, hoy):
    dias = uso.get("dias") if isinstance(uso, dict) else None
    dia = dias.get(hoy) if isinstance(dias, dict) else None
    if not isinstance(dia, dict):
        return None, None
    bruto = dia.get("por_medio")
    pm: dict = bruto if isinstance(bruto, dict) else {}

    def llamadas(clave):
        v = pm.get(clave)
        return int(v.get("llamadas") or 0) if isinstance(v, dict) else 0

    laya = sum(llamadas(k) for k in ("laya-local", "laya"))
    total = dia.get("llamadas")
    if not isinstance(total, (int, float)) or isinstance(total, bool):
        total = sum(int((v or {}).get("llamadas") or 0) for v in pm.values() if isinstance(v, dict))
    return laya, max(0, int(total) - laya)

def resumen(mac_raiz, a1_estado, jev_uso, hoy):
    """PURA: medios de Laya y llamadas de Jev de hoy; lo no medido es None y «sin dato»."""
    medios = [_mac(mac_raiz), _a1(a1_estado)]
    laya, otros = _llamadas(jev_uso, hoy)
    if laya is None or otros is None:
        hoy_txt = "hoy, Jev por Laya: sin dato"
    else:
        hoy_txt = "hoy, Jev por Laya %d de %d (otros medios %d)" % (laya, laya + otros, otros)
    partes = []
    for m in medios:
        nombre = "A1" if m["medio"] == "a1" else "Mac"
        estado = ("servicio vivo y modelo cargado" if m["cargado"] is True else
                  "servicio vivo, modelo sin cargar" if m["cargado"] is False else
                  "sin dato de carga" if m["servicio"] else "servicio parado")
        partes.append("%s: %s (%s)" % (nombre, estado, m["motivo"]))
    partes.append(hoy_txt)
    return {"medios": medios, "llamadas_hoy": {"jev_laya": laya, "jev_otros": otros},
            "texto": " · ".join(partes)}

def _json(fuente, timeout=3):
    try:
        if fuente.startswith("http"):
            with urllib.request.urlopen(fuente, timeout=timeout) as r:
                d = json.loads(r.read().decode("utf-8"))
        else:
            with open(os.path.expanduser(fuente), encoding="utf-8") as f:
                d = json.load(f)
        return d if isinstance(d, dict) else None
    except Exception:
        return None

def _estado_a1():
    try:
        import oracle_nodo as ON
    except Exception:
        return {"error": "sin contexto de A1 (oracle_nodo no disponible)"}
    estado = {}
    for clave, orden in (("systemctl", "systemctl is-active starseed-laya"),
                         ("http", "curl -sS --max-time 2 http://127.0.0.1:4470/")):
        try:
            _rc, salida = ON.ssh(orden, timeout=8)
            texto = str(salida or "").strip()
            estado[clave] = json.loads(texto) if clave == "http" and texto.startswith("{") else texto
        except Exception:
            estado[clave] = None
    return estado


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    doc = {"t": time.strftime("%Y-%m-%d %H:%M:%S"),
           **resumen(_json(URL_MAC), _estado_a1(), _json(USO), time.strftime("%Y-%m-%d"))}
    try:
        os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
        with open(SALIDA, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
    except OSError:
        pass
    print(json.dumps(doc, ensure_ascii=False) if "--json" in argv else doc["texto"])
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
