#!/usr/bin/env python3
"""StarSeed SmartRouter — Enrutador inteligente con auto-detección de APIs vivas.

Prueba automáticamente todas las APIs configuradas y usa la primera que responda.
Soporta: xKiro, TokenRouter, OpenRouter, Groq, NVIDIA, Ollama local.
"""

import json
import os
import time
import threading
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# ── Configuración ─────────────────────────────────────────────────────────────
RAIZ = Path(os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main"))
LOG = RAIZ / "starseed_memory_root/logs/smartrouter.log"
SALUD = RAIZ / "starseed_memory_root/olas/salud-proveedores.json"

PROVIDERS = [
    {
        "name": "ollama",
        "base_url": "http://localhost:11434",
        "models": {"default": "qwen2.5:1.5b", "qwen": "qwen2.5:1.5b"},
        "headers": {},
    },
    {
        "name": "xkiro",
        "base_url": "https://api.xkiro.com/v1",
        "key_env": "XKIRO_API_KEY",
        "models": {"default": "qwen/qwen3-coder-plus:free", "qwen": "qwen/qwen3-coder-plus:free"},
        "headers": {"User-Agent": "hermes-agent"},
    },
    {
        "name": "tokenrouter",
        "base_url": "https://api.tokenrouter.com/v1",
        "key_env": "TOKENROUTER_API_KEY",
        "models": {"default": "z-ai/glm-5.3-free", "glm": "z-ai/glm-5.3-free"},
        "headers": {},
    },
    {
        "name": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "key_env": "OPENROUTER_API_KEY",
        "models": {"default": "meta-llama/llama-3.1-70b-instruct:free", "llama": "meta-llama/llama-3.1-70b-instruct:free"},
        "headers": {},
    },
    {
        "name": "groq",
        "base_url": "https://api.groq.com/openai/v1",
        "key_env": "GROQ_API_KEY",
        "models": {"default": "llama-3.1-70b-versatile", "llama": "llama-3.1-70b-versatile"},
        "headers": {},
    },
    {
        "name": "nvidia",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "key_env": "NVIDIA_API_KEY",
        "models": {"default": "deepseek-ai/deepseek-v4-flash-0731", "deepseek": "deepseek-ai/deepseek-v4-flash-0731"},
        "headers": {},
    },
]

health = {}
health_lock = threading.Lock()

def cargar_env():
    for path in [os.path.expanduser("~/.hermes/.env"), os.path.expanduser("~/.starseed/env")]:
        if not os.path.exists(path):
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and value and key.replace("_", "").isalnum():
                    os.environ[key] = value

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def probar_provider(provider):
    """Prueba si un provider está vivo. Retorna True/False."""
    name = provider["name"]
    
    # Ollama: GET /api/tags
    if name == "ollama":
        try:
            req = urllib.request.Request(f"{provider['base_url']}/api/tags")
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())
                return len(data.get("models", [])) > 0
        except Exception:
            return False
    
    # OpenAI-compatible: POST /chat/completions con max_tokens=1
    api_key = os.environ.get(provider.get("key_env", ""))
    if not api_key:
        return False
    
    url = f"{provider['base_url']}/chat/completions"
    payload = {
        "model": list(provider["models"].values())[0],
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        **provider["headers"],
    }
    
    try:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=8) as resp:
            result = json.loads(resp.read())
            return "choices" in result
    except Exception:
        return False

def sondear_todos():
    """Sondea todos los providers y actualiza salud"""
    for provider in PROVIDERS:
        name = provider["name"]
        vivo = probar_provider(provider)
        with health_lock:
            health[name] = {
                "vivo": vivo,
                "t": time.time(),
            }
        estado = "✅" if vivo else "❌"
        log(f"  {estado} {name}")
    # Guardar salud
    SALUD.parent.mkdir(parents=True, exist_ok=True)
    with open(SALUD, "w") as f:
        json.dump(health, f, indent=2)

def obtener_provider_vivo():
    """Retorna el primer provider vivo, o None"""
    with health_lock:
        for provider in PROVIDERS:
            name = provider["name"]
            h = health.get(name, {})
            if h.get("vivo"):
                return provider
    return None

def llamar_ollama(messages, model="qwen2.5:1.5b"):
    """Llama a Ollama local"""
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request("http://localhost:11434/api/chat", data=data, 
                                headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            return result.get("message", {}).get("content", ""), None
    except Exception as e:
        return None, str(e)

def llamar_openai_compatible(provider, model, messages):
    """Llama a API OpenAI-compatible"""
    api_key = os.environ.get(provider.get("key_env", ""))
    if not api_key:
        return None, "Sin API key"
    
    url = f"{provider['base_url']}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": 4096,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        **provider["headers"],
    }
    
    try:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return result["choices"][0]["message"]["content"], None
    except Exception as e:
        return None, str(e)

def generar_respuesta(provider, messages):
    """Genera respuesta usando el provider indicado"""
    model = provider["models"]["default"]
    
    if provider["name"] == "ollama":
        return llamar_ollama(messages, model)
    else:
        return llamar_openai_compatible(provider, model, messages)

# ── HTTP Server ───────────────────────────────────────────────────────────────
class SmartRouterHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {
                "service": "smartrouter",
                "vivo": obtener_provider_vivo() is not None,
                "providers": {name: h.get("vivo", False) for name, h in health.items()},
            })
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path == "/v1/chat/completions":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                self.send_json(400, {"error": "Invalid JSON"})
                return

            messages = payload.get("messages", [])
            provider = obtener_provider_vivo()
            
            if not provider:
                self.send_json(503, {"error": "Ningún provider vivo", "detail": "Todas las APIs están caídas"})
                return

            contenido, error = generar_respuesta(provider, messages)
            
            if error:
                self.send_json(502, {"error": "Error del provider", "detail": str(error)[:300]})
                return

            response = {
                "id": "chatcmpl-smartrouter",
                "object": "chat.completion",
                "model": provider["models"]["default"],
                "choices": [{"index": 0, "message": {"role": "assistant", "content": contenido}, "finish_reason": "stop"}],
                "_smartrouter": {"provider": provider["name"]},
            }
            self.send_json(200, response)
            return

        self.send_json(404, {"error": "Not found"})

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

def main():
    cargar_env()
    log("🧪 Sondeando providers...")
    sondear_todos()
    
    provider = obtener_provider_vivo()
    if provider:
        log(f"✅ Provider activo: {provider['name']}")
    else:
        log("❌ Ningún provider vivo")
        return
    
    port = int(os.environ.get("SMARTROUTER_PORT", "9800"))
    server = HTTPServer(("127.0.0.1", port), SmartRouterHandler)
    log(f"SmartRouter en http://127.0.0.1:{port}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()

if __name__ == "__main__":
    main()
