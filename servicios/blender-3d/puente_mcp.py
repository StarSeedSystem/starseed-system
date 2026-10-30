#!/usr/bin/env python3
"""Puente MCP opcional de Blender: SOLO CANDIDATO (contrato `architecture/blender-3d.md` §1.6; BLD1025K).

No es el camino por defecto del OS (el normal es el trabajo 3D como dato, §4): esto solo PREPARA, con
tres seguros, lo que una persona activará a mano. Nada se ejecuta aquí (sin `uvx`, sin `pip`, sin
`curl`); no se abren puertos y no se toca la configuración real de un cliente MCP: se deja un `.json`
candidato con permisos 600 en `~/.starseed/blender-3d/`."""
import json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import taller as T  # noqa: E402

PUERTO = 9876
LECTURA = ("get_scene_info", "look", "get_addon_status")


def seguros_de(entorno):
    """El entorno que DEBE llevar el servidor MCP: telemetría APAGADA, modo seguro y solo bucle local."""
    e = dict(entorno or {})
    e["DISABLE_TELEMETRY"] = "true"       # en blender-mcp la telemetría va ENCENDIDA: aquí jamás
    e["BLENDER_MCP_SAFE_MODE"] = "1"      # el modo seguro del complemento: filtra operaciones peligrosas
    e["BLENDER_MCP_HOST"] = "127.0.0.1"   # nunca «localhost»: otra pila podría resolverlo a una interfaz externa
    return e


def herramientas_para_agentes(lista):
    """Lista blanca, no negra: queda SOLO lo de lectura; lo desconocido y lo grave no pasan."""
    return [t for t in (lista or []) if t in LECTURA]


def puerto_solo_local(s, puerto=PUERTO):
    """El socket del complemento debe escuchar SOLO en 127.0.0.1. Devuelve (ok, motivo)."""
    n = int(puerto)
    cola = f":{n}"
    orden = (["lsof", "-nP", f"-iTCP:{n}", "-sTCP:LISTEN"] if getattr(s, "plataforma", "Linux") == "Darwin"
             else ["ss", "-ltn"])
    try:
        r = s.ejecutar(orden, capture_output=True, text=True, timeout=10)
        salida = r.stdout if getattr(r, "returncode", 0) == 0 else None
    except (OSError, AttributeError, ValueError):
        salida = None
    if salida is None:
        return False, f"no se pudo comprobar el puerto {n} (lsof/ss no está o dio error)"
    escucha = [t[: -len(cola)] for l in salida.splitlines() for t in l.split() if t.endswith(cola)]
    if not escucha:
        return False, f"el puerto {n} no está en escucha: activa el complemento en Blender (o no hay servidor)"
    fuera = sorted({d for d in escucha if d != "127.0.0.1"})
    if fuera:
        return False, (f"el puerto {n} escucha también FUERA del bucle local ({', '.join(fuera)}): el socket no "
                       "lleva autenticación y cualquiera que lo alcance ejecutaría código en Blender; no continúa")
    return True, f"el puerto {n} escucha solo en 127.0.0.1"


def plan_puente(s=None):
    """El plan para la persona: qué es, por qué y cómo, con los avisos de licencia y telemetría."""
    ok, motivo = puerto_solo_local(s or T.Sistema())
    return {
        "v": 1,
        "titulo": "Complemento MCP de Blender · CANDIDATO (requiere el visto bueno de una persona)",
        "es": ("MCP es el protocolo con el que un agente habla con herramientas externas. El puente de blender-mcp son "
               "dos piezas: un complemento que abre un socket local dentro del Blender del escritorio (puerto 9876) "
               "y un servidor pequeño (uvx mcp-for-blender) que traduce las herramientas del agente a mensajes JSON."),
        "por_que": ("Da a los agentes datos en vivo de la escena (get_scene_info, look, get_addon_status). NO es el "
                    "camino por defecto del OS: lo normal es el trabajo 3D como dato (§4); es opcional y solo con persona delante."),
        "seguros_obligatorios": [
            "El socket escucha SOLO en 127.0.0.1: sin autenticación, si escucha fuera del bucle cualquiera de la red ejecutaría código en Blender.",
            "Arrancar el servidor con DISABLE_TELEMETRY=true y BLENDER_MCP_SAFE_MODE=1 (sin telemetría, filtro de operaciones peligrosas).",
            "execute_blender_code (Python arbitrario) JAMÁS se expone a un agente: la quita herramientas_para_agentes; la usa solo una persona delante de la pantalla.",
        ],
        "comprobacion_puerto": {"ok": ok, "detalles": motivo},
        "pasos": [
            {"que": "Instalar el complemento", "por_que": "es un programa ajeno (MIT) que abre el socket dentro de Blender",
             "como": "se descarga addon.py del repositorio original (github.com/ahujasid/blender-mcp) y en Blender: Editar · "
                     "Preferencias · Complementos · Instalar…, eligiendo addon.py"},
            {"que": "Activar el complemento", "por_que": "así arranca el socket del puerto 9876 en el Blender abierto",
             "como": "se marca addon.py en la lista de Complementos; su panel aparece en la barra lateral de la vista 3D"},
            {"que": "Arrancar el servidor MCP con los seguros", "por_que": "traduce las herramientas del agente hacia el socket",
             "como": "uvx mcp-for-blender, llevando el entorno exacto de «seguros_obligatorios»"},
            {"que": "Comprobar el puerto", "por_que": "sin este seguro el puente no debe quedarse vivo ni un minuto",
             "como": f"puerto_solo_local (ahora: {motivo}) o a mano: lsof -nP -iTCP:9876 -sTCP:LISTEN (macOS) / ss -ltn (Linux)"},
            {"que": "Aceptar la configuración a mano", "por_que": "el OS jamás toca la configuración real de un cliente MCP",
             "como": "se copia el bloque «candidato_para_cliente_mcp» al cliente MCP que uses, con la mano"},
        ],
        "candidato_para_cliente_mcp": {"command": "uvx", "args": ["mcp-for-blender"], "env": seguros_de({})},
        "herramientas_para_agentes": list(LECTURA),
        "avisos": [
            "Licencia del puente: MIT. Blender es GPL y corre como programa aparte: no se enlaza ni empaqueta.",
            "Los servicios de terceros (Poly Haven, Sketchfab, Poly Pizza, Meshy, Tripo, Hyper3D) piden cuentas y claves aparte: fuera del puente.",
            "Hunyuan3D (Tencent Cloud): su licencia EXCLUYE la Unión Europea: no usarlo.",
            "Telemetría: va ENCENDIDA por defecto en el puente; con DISABLE_TELEMETRY=true queda apagada (se fija en cada arranque).",
            "No probado con Blender 5: el complemento declara «3.0 o más» y aún no está verificado con 5.2.",
        ],
    }


def escribir_candidato(plan=None, raiz=None):
    """Guarda el plan como CANDIDATO (permisos 600). NUNCA toca la configuración real de un cliente MCP."""
    datos = dict(plan or plan_puente())
    base = Path(raiz) if raiz else Path(os.environ.get("HOME") or Path.home()) / ".starseed"
    ruta = base / "blender-3d" / "puente-mcp.candidato.json"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_name(ruta.name + ".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, sort_keys=True, indent=2), encoding="utf-8")
    os.chmod(tmp, 0o600); os.replace(tmp, ruta)
    return ruta


def main(argv=None):
    """Imprime el plan; con --escribir deja el candidato. Una persona lo revisa y lo acepta: nada más."""
    plan = plan_puente(T.Sistema())
    if "--escribir" in (sys.argv[1:] if argv is None else argv):
        escribir_candidato(plan)
        print("Candidato escrito con permisos 600. Nada queda activado: lo revisa y acepta una persona.")
    print(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
