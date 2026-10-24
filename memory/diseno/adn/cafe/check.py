#!/usr/bin/env python3
import json
import re
import sys


def dictamen(metricas):
    salida = []

    def emitir(pid, ok=None, motivo="métrica no disponible"):
        estado = "manual" if ok is None else "aprobado" if ok else "suspenso"
        salida.append((pid, estado, motivo))

    cobertura = {c.get("hex", "").upper(): c.get("pct") for c in metricas.get("coberturaColor", []) if isinstance(c, dict)}
    for pid, hex_color, minimo, maximo, nombre in (
        ("p1", "#FDF7EA", 40, 101, "pergamino"),
        ("p2", "#C05C3B", 10, 20, "terracota"),
    ):
        pct = cobertura.get(hex_color)
        ok = None if pct is None else pct > minimo if pid == "p1" else minimo <= pct <= maximo
        rango = "más de 40%" if pid == "p1" else "10–20% inclusive"
        emitir(pid, ok, f"{nombre}: {pct}% ({rango})" if pct is not None else f"sin cobertura medida para {nombre}")

    estilos = [e for e in metricas.get("estilos", []) if isinstance(e, dict)]
    titular = [e for e in estilos if e.get("tag") == "h1"]
    familias = [str(e.get("fontFamily", "")).lower() for e in titular]
    emitir("p3", None if not titular else any("fraunces" in f for f in familias), "Fraunces en h1" if titular else "sin estilos medidos para h1")

    contraste = metricas.get("contraste")
    emitir("p4", None if not isinstance(contraste, (int, float)) else contraste >= 4.5, f"contraste {contraste}:1 (mínimo 4.5:1)" if isinstance(contraste, (int, float)) else "sin pares de texto y fondo medidos")

    botones = [e for e in estilos if e.get("tag") == "button" and e.get("borderRadius")]
    radios = [re.findall(r"\d+(?:\.\d+)?", e["borderRadius"]) for e in botones]
    valores = [float(v) for grupo in radios for v in grupo]
    emitir("p5", None if not botones or not valores else all(abs(v - 12) < 0.1 for v in valores), f"radios de botón medidos: {valores}px; objetivo 12px" if valores else "sin radios medidos en botones")

    longitud = metricas.get("longitudMaximaLinea")
    emitir("p6", None if not isinstance(longitud, (int, float)) else longitud <= 65, f"línea máxima {longitud} caracteres (máximo 65)" if isinstance(longitud, (int, float)) else "la anchura aproximada no mide caracteres reales")
    emitir("p7", None, "la jugada rara requiere revisión visual")
    neon = metricas.get("coloresNeon")
    emitir("p8", None if not isinstance(neon, bool) else not neon, "se detectó neón" if neon else "sin neón detectado" if neon is False else "sin clasificador de neón en las métricas")
    return salida


if __name__ == "__main__":
    resultados = dictamen(json.load(sys.stdin))
    for pid, estado, motivo in resultados:
        print(f"{pid}: manual ({motivo})" if estado == "manual" else f"{pid}: {estado} · {motivo}")
    raise SystemExit(int(any(estado != "aprobado" for _, estado, _ in resultados)))
