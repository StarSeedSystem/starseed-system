#!/usr/bin/env python3
"""Relevo de medios (RES1121A) — CLI y máquina de estado.

Órdenes:
  latido --medio ID           Medio late (actualiza su latido).
  estado [--json]             Estado de todos los medios y arriendos.
  replicar --medio ID --json  Réplica de estado hacia un medio.
  relevar --medio ID          Fuerza relevo de un medio (para pruebas).
  recuperar --medio ID        Medio recupera arriendo al volver.
  simulacro                   Ejecuta simulacro documentado: Mac cae → A1 responde en General < N+2 min → Mac vuelve.
  daemon                      Bucle: cada 30 s revisa latidos y releva si toca (para systemd).

Archivo de estado: starseed_memory_root/olas/relevo-medios.json
"""
from __future__ import annotations
 
import argparse
import json
import os
import sys
import time
from datetime import datetime
 
DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
ESTADO = os.path.join(OLAS, "relevo-medios.json")
UMBRAL_MIN = float(os.environ.get("STARSEED_RELEVO_MEDIOS_MIN") or "10")
INTERVALO_DAEMON = 30  # segundos
 
sys.path.insert(0, DIRECTORIO)
import relevo_medios_logica as L  # noqa: E402
 
 
def ahora() -> datetime:
    return datetime.now().astimezone()
 
 
def leer(ruta: str = ESTADO) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return L.registro_defecto()
 
 
def guardar(datos: dict, ruta: str = ESTADO) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)
 
 
def cmd_latido(args) -> int:
    reg = leer()
    reg = L.actualizar_latido(reg, args.medio, ahora())
    guardar(reg)
    print(f"latido actualizado: {args.medio}")
    return 0
 
 
def cmd_estado(args) -> int:
    reg = leer()
    m = ahora()
    resumen = L.estado_general(reg, m)
    if args.json:
        print(json.dumps(resumen, ensure_ascii=False, indent=1))
    else:
        print(f"=== Estado relevo-medios ({m.strftime('%H:%M:%S')}) ===")
        for mid, info in resumen["medios"].items():
            lat = info["latido_hace_min"]
            lat_str = f"{lat} min" if lat is not None else "nunca"
            print(f"  {mid:15} ({info['nombre']})  latido: {lat_str:>8}  relevo: {info['relevo']:>12}  {'⚠ RELEVAR' if info['tocaria_relevar'] else 'OK'}")
            if info["tiene_arriendo"]:
                print(f"    arriendo: {', '.join(info['tiene_arriendo'])}")
        print("\nArriendos actuales:")
        for canal, medio in resumen["arriendos"].items():
            print(f"  {canal:12} → {medio}")
        if resumen["replicas"]:
            print(f"\nRéplicas activas: {', '.join(resumen['replicas'])}")
    return 0
 
 
def cmd_replicar(args) -> int:
    reg = leer()
    m = ahora()
    # Estado a replicar: canales + olas (simplificado)
    estado = {
        "canales": {c: {"ultimo_mensaje": "...", "ts": m.isoformat()} for c in L.CANALES_DIRECCION},
        "olas": {"cola": "cola-actual", "pendientes": 0, "en_curso": 0},
    }
    if args.con_secretos:
        estado["secretos"] = {"token": "ejemplo"}
    reg = L.replicar_estado(reg, args.medio, estado, m)
    guardar(reg)
    print(f"estado replicado a {args.medio}")
    return 0
 
 
def cmd_relevar(args) -> int:
    reg = leer()
    m = ahora()
    toca, quien = L.debe_relevar(reg, args.medio, m, UMBRAL_MIN)
    if not toca:
        print(f"{args.medio} no necesita relevo (latido fresco)")
        return 0
    if quien is None:
        print(f"{args.medio} no tiene relevo definido")
        return 1
    print(f"Relevando {args.medio} → {quien}")
    reg = L.relevar_y_tomar_arriendo(reg, args.medio, quien, m)
    guardar(reg)
    print(f"{quien} tomó el arriendo de los 3 canales")
    return 0
 
 
def cmd_recuperar(args) -> int:
    reg = leer()
    m = ahora()
    print(f"{args.medio} recupera arriendo")
    reg = L.recuperar_arriendo(reg, args.medio, m)
    guardar(reg)
    for c in L.CANALES_DIRECCION:
        print(f"  {c} → {L.quien_tiene_arriendo(reg, c)}")
    return 0
 
 
def cmd_simulacro(args) -> int:
    """Simulacro documentado: Mac cae → A1 responde en General < N+2 min → Mac vuelve."""
    reg = leer()
    m = ahora()
    N = 15  # minutos de umbral
 
    print(f"\n=== SIMULACRO RES1121A (umbral N={N} min) ===")
    print("1. Estado inicial: Mac tiene arriendo de los 3 canales")
    reg = L.tomar_arriendo(reg, "mac", m)
    reg = L.actualizar_latido(reg, "mac", m)
    guardar(reg)
    for c in L.CANALES_DIRECCION:
        print(f"   {c}: {L.quien_tiene_arriendo(reg, c)}")
 
    print(f"\n2. Mac deja de latir... esperando {N} min (simulado)")
    momento_caida = m + timedelta(minutes=N)
    toca, quien = L.debe_relevar(reg, "mac", momento_caida, UMBRAL_MIN)
    assert toca and quien == "a1", "debe relevar a A1"
    print(f"   → Mac caído detectado, releva: {quien}")
 
    print(f"\n3. A1 toma relevo y arriendo en momento {momento_caida.strftime('%H:%M:%S')}")
    reg = L.relevar_y_tomar_arriendo(reg, "mac", "a1", momento_caida)
    for c in L.CANALES_DIRECCION:
        print(f"   {c}: {L.quien_tiene_arriendo(reg, c)}")
 
    print(f"\n4. A1 responde en canal 'General' (menos de N+2 = {N+2} min)")
    respuesta = L.responder_en_canal(reg, "a1", "general", "Mac caído, A1 activo", momento_caida + timedelta(minutes=1))
    assert respuesta["ok"], "A1 debe tener arriendo de General"
    assert respuesta["minutos_desde_caida"] <= N + 2, f"respondió en {respuesta['minutos_desde_caida']} min, límite {N+2}"
    print(f"   ✓ Respondió en {respuesta['minutos_desde_caida']} min: '{respuesta['texto']}'")
 
    print(f"\n5. Mac vuelve y recupera arriendo sin perder mensajes")
    momento_vuelta = momento_caida + timedelta(minutes=20)
    reg = L.actualizar_latido(reg, "mac", momento_vuelta)
    # Llega un mensaje mientras A1 tiene arriendo
    reg = L.recibir_mensaje(reg, "general", {"id": "msg-simulacro", "texto": "prueba durante relevo", "ts": (momento_caida + timedelta(minutes=5)).isoformat()})
    reg = L.recuperar_arriendo(reg, "mac", momento_vuelta)
    for c in L.CANALES_DIRECCION:
        print(f"   {c}: {L.quien_tiene_arriendo(reg, c)}")
    mensajes = L.mensajes_pendientes(reg, "general")
    assert any(msg["id"] == "msg-simulacro" for msg in mensajes), "mensaje no debe perderse"
    print(f"   ✓ Mensaje durante relevo conservado: {len(mensajes)} mensaje(s) en General")
 
    print("\n=== SIMULACRO OK ===")
    return 0
 
 
def cmd_daemon(args) -> int:
    """Bucle daemon: cada 30 s revisa latidos y releva si toca."""
    print(f"Daemon relevo-medios iniciado (intervalo {INTERVALO_DAEMON}s, umbral {UMBRAL_MIN} min)")
    try:
        while True:
            m = ahora()
            reg = leer()
            cambios = False
            for medio in L.todos_los_medios(reg):
                mid = medio["id"]
                toca, quien = L.debe_relevar(reg, mid, m, UMBRAL_MIN)
                if toca and quien:
                    print(f"[{m.strftime('%H:%M:%S')}] RELEVO: {mid} → {quien} (sin latido)")
                    reg = L.relevar_y_tomar_arriendo(reg, mid, quien, m)
                    cambios = True
            if cambios:
                guardar(reg)
            time.sleep(INTERVALO_DAEMON)
    except KeyboardInterrupt:
        print("\nDaemon detenido")
    return 0
 
 
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
 
    l = sub.add_parser("latido", help="Actualiza latido de un medio")
    l.add_argument("--medio", required=True, choices=["mac", "a1", "maggabox", "nubes-efimeras"])
 
    e = sub.add_parser("estado", help="Muestra estado de todos los medios")
    e.add_argument("--json", action="store_true")
 
    r = sub.add_parser("replicar", help="Réplica estado a un medio")
    r.add_argument("--medio", required=True, choices=["a1", "maggabox", "nubes-efimeras"])
    r.add_argument("--con-secretos", action="store_true", help="Incluye secretos (solo para a1)")
 
    v = sub.add_parser("relevar", help="Fuerza relevo de un medio")
    v.add_argument("--medio", required=True, choices=["mac", "a1", "maggabox", "nubes-efimeras"])
 
    rc = sub.add_parser("recuperar", help="Medio recupera arriendo al volver")
    rc.add_argument("--medio", required=True, choices=["mac", "a1", "maggabox", "nubes-efimeras"])
 
    sub.add_parser("simulacro", help="Ejecuta simulacro documentado completo")
 
    sub.add_parser("daemon", help="Bucle de vigilancia para systemd")
 
    a = p.parse_args(argv)
    if a.orden == "latido":
        return cmd_latido(a)
    elif a.orden == "estado":
        return cmd_estado(a)
    elif a.orden == "replicar":
        return cmd_replicar(a)
    elif a.orden == "relevar":
        return cmd_relevar(a)
    elif a.orden == "recuperar":
        return cmd_recuperar(a)
    elif a.orden == "simulacro":
        return cmd_simulacro(a)
    elif a.orden == "daemon":
        return cmd_daemon(a)
    return 1
 
 
if __name__ == "__main__":
    from datetime import timedelta  # noqa: E402
    raise SystemExit(main())