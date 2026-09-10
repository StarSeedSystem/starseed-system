#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vuelca lo que dice el orquestador en el canal común de los cuatro entornos.

El enjambre ya narraba lo que hacía —«inicio zN4», «commit · integrado en main»,
«sin cambios con …»— pero solo en su propio log, que nadie mira. Esto lo traduce
al canal, así que el avance real aparece en el chat principal de Claude, Codex,
Hermes y Antigravity a la vez, sin que nadie tenga que resumirlo.

  python3 scripts/puente/eco-enjambre.py /tmp/enjambre.log
"""
import os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py"))
_p = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_p)

# El orquestador escribe:  [20:14:03] tipo tarea · texto
LINEA = re.compile(r"^\[(\d\d:\d\d:\d\d)\]\s+(\S+)\s+(\S*)\s*·\s*(.*)$")
TIPO = {"fallo": "error", "error": "error", "aviso": "aviso", "conflicto": "error",
        "commit": "hecho", "integrado": "hecho", "arranque": "aviso"}
# El latido se repite cada 20 s: no inunda el canal.
RUIDO = ("latido", "proveedor_recuperado", "paso")


def main(ruta):
    print("Eco del enjambre → canal común (%s)" % ruta)
    while not os.path.exists(ruta):
        time.sleep(2)
    with open(ruta, encoding="utf-8", errors="replace") as f:
        f.seek(0, os.SEEK_END)
        while True:
            l = f.readline()
            if not l:
                time.sleep(1); continue
            m = LINEA.match(l.strip())
            if not m:
                continue
            _, tipo, tarea, texto = m.groups()
            if tipo in RUIDO:
                continue
            _p.decir(texto[:400], quien="enjambre", tipo=TIPO.get(tipo, "mensaje"),
                     tarea=tarea or None)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/enjambre.log")
