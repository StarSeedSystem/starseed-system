"""Importador de flujos n8n a Flujos de Genesis.

CLI: python3 -m flujos.importar_n8n <archivo.json> [--guardar]
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .modelo import Conexion, Flujo, Nodo

TYPE_MAP = {
    "n8n-nodes-base.webhook": "webhook",
    "n8n-nodes-base.scheduleTrigger": "cron",
    "n8n-nodes-base.cron": "cron",
    "n8n-nodes-base.httpRequest": "http",
    "n8n-nodes-base.if": "si",
    "n8n-nodes-base.switch": "switch",
    "n8n-nodes-base.set": "set",
    "n8n-nodes-base.merge": "fusion",
    "n8n-nodes-base.respondToWebhook": "set",
    "n8n-nodes-base.telegram": "telegram",
    "n8n-nodes-base.googleDrive": "pendiente",
    "n8n-nodes-base.code": "pendiente",
}

OP_MAP = {
    "equal": "==",
    "notEqual": "!=",
    "contains": "contiene",
    "lessThan": "<",
    "greaterThan": ">",
}

def sugerir_variable(nombre: str) -> str:
    nombre = re.sub(r"[^A-Za-z0-9]", "_", nombre).upper()
    return f"{nombre}_SECRET"

def normalizar_expresion(valor: Any) -> Any:
    if isinstance(valor, str):
        return valor
    return valor

def mapear_webhook(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    params = node.get("parameters", {})
    cfg = {}
    if "path" in params:
        cfg["ruta"] = params["path"]
    if "httpMethod" in params:
        cfg["metodo"] = params["httpMethod"]
    creds = node.get("credentials", {})
    if creds:
        for k, v in creds.items():
            nombre = v.get("name") if isinstance(v, dict) else ""
            if nombre:
                cfg["credencial"] = sugerir_variable(nombre)
                break
    return cfg, "traducido"

def mapear_cron(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    params = node.get("parameters", {})
    cfg = {}
    # n8n scheduleTrigger usa triggerTimes o rule; lo aproximamos
    if "triggerTimes" in params:
        cfg["expresion"] = "*/5 * * * *"
        return cfg, "aproximado"
    if "rule" in params:
        cfg["expresion"] = params["rule"].get("interval", "*/5 * * * *")
        return cfg, "aproximado"
    cfg["expresion"] = "*/5 * * * *"
    return cfg, "aproximado"

def mapear_http(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    params = node.get("parameters", {})
    cfg = {}
    cfg["url"] = normalizar_expresion(params.get("url", ""))
    cfg["metodo"] = params.get("method", "GET")
    # credenciales
    creds = node.get("credentials", {})
    if creds:
        for k, v in creds.items():
            nombre = v.get("name") if isinstance(v, dict) else ""
            if nombre:
                cfg["credencial"] = sugerir_variable(nombre)
                break
    return cfg, "traducido"

def mapear_set(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    params = node.get("parameters", {})
    asignaciones = params.get("assignments", {}).get("assignments", [])
    campos = {}
    for a in asignaciones:
        nombre = a.get("name")
        valor = a.get("value")
        if nombre:
            campos[nombre] = valor
    return {"campos": campos, "conservar": True}, "traducido"

def mapear_if(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    params = node.get("parameters", {})
    condiciones = params.get("conditions", {})
    exprs = []
    for c in condiciones.get("conditions", []):
        left = c.get("leftValue")
        op = OP_MAP.get(c.get("operator"), "==")
        right = c.get("rightValue")
        # quitar {{ }} si existen
        left_s = str(left) if left else "cierto"
        right_s = str(right) if right else "''"
        exprs.append(f"{left_s} {op} {right_s}")
    if not exprs:
        exprs.append("cierto")
    condicion = " y ".join(exprs)
    return {"condicion": condicion}, "aproximado"

def mapear_switch(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    params = node.get("parameters", {})
    expr = params.get("value") or params.get("rules", {}).get("value", "")
    cfg = {"expresion": expr, "casos": {}, "campo": "caso"}
    return cfg, "aproximado"

def mapear_fusion(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    return {"modo": "concatenar"}, "traducido"

def mapear_telegram(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    params = node.get("parameters", {})
    cfg = {
        "chat_id": params.get("chatId") or params.get("chat_id"),
        "texto": params.get("text") or params.get("message"),
    }
    creds = node.get("credentials", {})
    if creds:
        for k, v in creds.items():
            nombre = v.get("name") if isinstance(v, dict) else ""
            if nombre:
                cfg["credencial"] = sugerir_variable(nombre)
                break
    return cfg, "traducido"

def mapear_pendiente(node: Dict[str, Any]) -> Tuple[Dict[str,Any], str]:
    codigo = ""
    params = node.get("parameters", {})
    if "jsCode" in params:
        codigo = params["jsCode"]
    return {"codigo_original": codigo, "nodo_n8n": node.get("type")}, "no_traducido"

MAPPING_FUNCS = {
    "webhook": mapear_webhook,
    "cron": mapear_cron,
    "http": mapear_http,
    "si": mapear_if,
    "switch": mapear_switch,
    "set": mapear_set,
    "fusion": mapear_fusion,
    "telegram": mapear_telegram,
}

def importar(json_n8n: Dict[str, Any]) -> Tuple[Flujo, Dict[str, Any]]:
    nombre = json_n8n.get("name", "Flujo importado")
    nodos_n8n = json_n8n.get("nodes", [])
    conexiones_n8n = json_n8n.get("connections", {})

    nombre_a_id: Dict[str, str] = {}
    nodos: List[Nodo] = []

    informe = {
        "traducidos": [],
        "aproximados": [],
        "no_traducidos": [],
    }

    for n in nodos_n8n:
        nid = n.get("id")
        nname = n.get("name")
        ntype = n.get("type")
        if not nid:
            continue
        nombre_a_id[nname] = nid
        tipo_genesis = TYPE_MAP.get(ntype, "pendiente")
        if tipo_genesis == "pendiente":
            cfg, estado = mapear_pendiente(n)
            nodos.append(Nodo(id=nid, tipo="pendiente", configuracion=cfg))
            informe["no_traducidos"].append({"id": nid, "nombre": nname, "tipo_n8n": ntype})
            continue
        func = MAPPING_FUNCS.get(tipo_genesis)
        if not func:
            cfg, estado = {}, "no_traducido"
        else:
            cfg, estado = func(n)
        nodos.append(Nodo(id=nid, tipo=tipo_genesis, configuracion=cfg))
        if estado == "traducido":
            informe["traducidos"].append({"id": nid, "nombre": nname, "tipo_n8n": ntype, "tipo_genesis": tipo_genesis})
        elif estado == "aproximado":
            informe["aproximados"].append({"id": nid, "nombre": nname, "tipo_n8n": ntype, "tipo_genesis": tipo_genesis})
        else:
            informe["no_traducidos"].append({"id": nid, "nombre": nname, "tipo_n8n": ntype})

    conexiones: List[Conexion] = []
    for nombre_origen, salidas in conexiones_n8n.items():
        id_origen = nombre_a_id.get(nombre_origen)
        if not id_origen:
            continue
        for rama in salidas.get("main", []):
            for conn in rama:
                nombre_dest = conn.get("node")
                id_dest = nombre_a_id.get(nombre_dest)
                if id_dest:
                    conexiones.append(Conexion(origen=id_origen, destino=id_dest))

    flujo_id = re.sub(r"[^a-z0-9]+", "-", nombre.lower()).strip("-") or "flujo"
    flujo = Flujo(id=flujo_id, nombre=nombre, nodos=nodos, conexiones=conexiones)

    informe["resumen"] = {
        "nodos_totales": len(nodos),
        "traducidos": len(informe["traducidos"]),
        "aproximados": len(informe["aproximados"]),
        "no_traducidos": len(informe["no_traducidos"]),
    }
    return flujo, informe

def main():
    parser = argparse.ArgumentParser(description="Importar flujo n8n a Genesis")
    parser.add_argument("archivo", help="Archivo JSON de n8n")
    parser.add_argument("--guardar", action="store_true", help="Guardar flujo en starseed_memory_root/flujos")
    args = parser.parse_args()

    data = json.loads(Path(args.archivo).read_text(encoding="utf-8"))
    flujo, informe = importar(data)

    print(json.dumps(informe, ensure_ascii=False, indent=2))
    if args.guardar:
        from .modelo import guardar_flujo
        ruta = guardar_flujo(flujo)
        print(f"Guardado en {ruta}")

if __name__ == "__main__":
    main()
