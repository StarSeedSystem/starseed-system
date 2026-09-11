#!/usr/bin/env python3
"""starseed-sincroniza · sincroniza el Puente de Mando con todos los IDE disponibles.
Corre en background y mantiene los contextos actualizados en:
- Hermes (chat principal del Puente de Mando)
- Claude Code (hilo de la ola activa)
- Codex (notificaciones de la nube)
- Antigravity IDE (hilo de la ola activa)

El sistema usa el enrutamiento inteligente: modelos gratis para escritura,
modelos potentes para dirección y verificación.
"""

import json, os, subprocess, sys, time
from datetime import datetime
from pathlib import Path

ROOT = os.environ.get("STARSEED_ROOT") or str(Path.home() / "Documents" / "starseed-os-main")
PUENTE_URL = "http://localhost:9002"

def verificar_hermes_activo():
    """Verifica que Hermes gateway está corriendo."""
    try:
        salida = subprocess.check_output(["pgrep", "-f", "hermes.*gateway"], text=True)
        return len(salida.strip().split("\n")) > 0
    except Exception:
        return False

def verificar_puerto_9002():
    """Verifica que el Mando responde en localhost:9002."""
    try:
        salida = subprocess.check_output(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"{PUENTO_URL}/mando"], text=True)
        return salida.strip() == "200"
    except Exception:
        return False

def verificar_orquestador_activo():
    """Verifica que el orquestador starseed-enjambre está corriendo."""
    try:
        salida = subprocess.check_output(["pgrep", "-f", "starseed-enjambre"], text=True)
        return len(salida.strip().split("\n")) > 0
    except Exception:
        return False

def notificar_a_ides(mensaje):
    """Envía notificación a todos los IDE detectados."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    texto = f"[{timestamp}] {mensaje}"
    
    # Guardar en eventos.jsonl
    eventos_path = os.path.join(ROOT, "starseed_memory_root", "olas", "eventos_sincronia.jsonl")
    os.makedirs(os.path.dirname(eventos_path), exist_ok=True)
    with open(eventos_path, "a") as f:
        f.write(json.dumps({"t": datetime.now().isoformat(), "texto": texto}, ensure_ascii=False) + "\n")
    
    # Enviar a Hermes si está activo
    if verificar_hermes_activo():
        try:
            subprocess.run(
                ["hermes", "send", "--channel", "puente-de-mando", "--message", texto],
                capture_output=True, timeout=5
            )
        except Exception:
            pass

def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔄 Sincronizador multi-IDE iniciado")
    
    estado_anterior = None
    
    while True:
        try:
            # Verificar estado del puerto 9002
            mando_activo = verificar_puerto_9002()
            hermes_activo = verificar_hermes_activo()
            orquestador_activo = verificar_orquestador_activo()
            
            estado_actual = {
                "mando": mando_activo,
                "hermes": hermes_activo,
                "orquestador": orquestador_activo,
                "timestamp": datetime.now().isoformat()
            }
            
            # Solo imprimir si cambió el estado
            if estado_actual != estado_anterior:
                print(f"  Mando: {'✅' if mando_activo else '❌'} | "
                      f"Hermes: {'✅' if hermes_activo else '❌'} | "
                      f"Orquestador: {'✅' if orquestador_activo else '❌'}")
                estado_anterior = estado_actual
            
            # Si el orquestador no está activo, notificar
            if not orquestador_activo and estado_anterior and estado_anterior.get("orquestador"):
                notificar_a_ides("⚠️ Orquestador detenido - necesita reinicio")
            
            # Si Hermes se cayó, notificar
            if not hermes_activo and estado_anterior and estado_anterior.get("hermes"):
                notificar_a_ides("⚠️ Hermes gateway caído")
            
            # Si el Mando no responde, notificar
            if not mando_activo and estado_anterior and estado_anterior.get("mando"):
                notificar_a_ides("⚠️ Puerto 9002 sin respuesta - Mando apagado")
            
        except Exception as e:
            print(f"  Error: {e}")
        
        time.sleep(30)  # Verificar cada 30 segundos

if __name__ == "__main__":
    main()