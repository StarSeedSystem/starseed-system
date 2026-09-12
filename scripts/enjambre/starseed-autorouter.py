#!/usr/bin/env python3
"""StarSeed AutoRouter — Proxy local de enrutamiento inteligente de APIs LLM.

Enruta automáticamente requests /v1/chat/completions al primer proveedor vivo.
Mantiene salud de cada proveedor y rota ante fallos.

Uso: python3 starseed-autorouter.py
Endpoint local: http://127.0.0.1:9800/v1/chat/completions
"""

import json
import os
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# ── Configuración de proveedores ─────────────────────────────────────────────
# Orden de prioridad (el primero que responda 200 gana)
PROVIDERS = [
    {
        "name": "xkiro",
        "base_url": "https://api.xkiro.com/v1",
        "key_env": "XKIRO_API_KEY",
        "models": {
            "default": "qwen/qwen3-coder-plus:free",
            "qwen-coder": "qwen/qwen3-coder-plus:free",
            "qwen-3.7": "qwen/qwen3.7-plus",
            "minimax": "minimax/minimax-m3",
            "deepseek-pro": "deepseek-ai/deepseek-v4-pro",
            "devstral": "mistralai/devstral-medium",
        },
        "headers": {"User-Agent": "hermes-agent"},
    },
    {
        "name": "tokenrouter",
        "base_url": "https://api.tokenrouter.com/v1",
        "key_env": "TOKENROUTER_API_KEY",
        "models": {
            "default": "z-ai/glm-5.3-free",
            "glm-free": "z-ai/glm-5.3-free",
            "nemotron": "nvidia/llama-3.1-nemotron-70b-instruct",
            "llama": "meta-llama/llama-3.1-70b-instruct",
        },
        "headers": {},
    },
    {
        "name": "apinex",
        "base_url": "https://apinex.bond/v1",
        "key_env": "STARSEED_PASARELA_APINEX_KEY",
        "models": {
            "default": "free/gpt-5.6-luna",
            "gpt-luna": "free/gpt-5.6-luna",
            "gemini-flash": "free/gemini-3.8-flash",
            "deepseek-flash": "free/deepseek-v4-flash-0731",
            "deepseek-pro": "free/deepseek-v4-pro-0813",
            "qwen-max": "free/qwen-3.8-max",
            "muse": "free/muse-spark-1.3",
        },
        "headers": {},
    },
    {
        "name": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "key_env": "OPENROUTER_API_KEY",
        "models": {
            "default": "google/gemini-2.0-flash-001",
            "gemini": "google/gemini-2.0-flash-001",
            "llama-free": "meta-llama/llama-3.1-70b-instruct:free",
            "gpt-oss": "openai/gpt-oss-120b:free",
        },
        "headers": {},
    },
    {
        "name": "groq",
        "base_url": "https://api.groq.com/openai/v1",
        "key_env": "GROQ_API_KEY",
        "models": {
            "default": "llama-3.1-70b-versatile",
            "llama": "llama-3.1-70b-versatile",
            "gpt-oss": "openai/gpt-oss-120b",
            "qwen": "qwen/qwen3.8-27b",
        },
        "headers": {},
    },
    {
        "name": "nvidia",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "key_env": "NVIDIA_API_KEY",
        "models": {
            "default": "deepseek-ai/deepseek-v4-flash-0731",
            "deepseek-flash": "deepseek-ai/deepseek-v4-flash-0731",
            "deepseek-pro": "deepseek-ai/deepseek-v4-pro-0813",
            "kimi": "moonshotai/kimi-k3",
            "gemma": "google/gemma-4-31b-it",
        },
        "headers": {},
    },
    {
        "name": "aihubmix",
        "base_url": "https://aihubmix.com/v1",
        "key_env": "AIHUBMIX_API_KEY",
        "models": {
            "default": "z-ai/glm-5.3-free",
            "glm-free": "z-ai/glm-5.3-free",
            "deepseek": "deepseek-ai/deepseek-v4-flash-0731",
            "gemma": "google/gemma-3-27b-it",
        },
        "headers": {},
    },
]

# ── Estado de salud ───────────────────────────────────────────────────────────
health = {}
health_lock = threading.Lock()


def load_env():
    """Carga variables desde ~/.hermes/.env y ~/.starseed/env"""
    env_paths = [
        os.path.expanduser("~/.hermes/.env"),
        os.path.expanduser("~/.starseed/env"),
    ]
    for path in env_paths:
        if not os.path.exists(path):
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and value:
                        os.environ.setdefault(key, value)


def resolve_model(provider, requested_model):
    """Resuelve el modelo real según el proveedor."""
    mapping = provider["models"]
    if requested_model in mapping:
        return mapping[requested_model]
    if requested_model in mapping.values():
        return requested_model
    return mapping.get("default", requested_model)


def call_provider(provider, model, messages, temperature=0.7, max_tokens=4096):
    """Llama a un proveedor. Retorna (response_body, status_code) o lanza excepción."""
    api_key = os.environ.get(provider["key_env"])
    if not api_key:
        raise ValueError(f"Clave {provider['key_env']} no configurada")

    url = f"{provider['base_url']}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        **provider["headers"],
    }

    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers=headers, method="POST")

    try:
        with urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return body, resp.status
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise Exception(f"HTTP {e.code}: {body[:200]}")
    except URLError as e:
        raise Exception(f"URL error: {e.reason}")


def try_providers(payload):
    """Prueba cada proveedor en orden hasta que uno responda."""
    requested_model = payload.get("model", "default")
    messages = payload.get("messages", [])
    temperature = payload.get("temperature", 0.7)
    max_tokens = payload.get("max_tokens", 4096)

    errors = []
    for provider in PROVIDERS:
        name = provider["name"]
        with health_lock:
            h = health.get(name, {})
            if h.get("dead_until", 0) > time.time():
                continue

        try:
            model = resolve_model(provider, requested_model)
            body, status = call_provider(provider, model, messages, temperature, max_tokens)
            with health_lock:
                health[name] = {
                    "last_ok": time.time(),
                    "dead_until": 0,
                    "fail_count": 0,
                    "last_model": model,
                }
            return body, status, name, model
        except Exception as e:
            errors.append(f"{name}: {e}")
            with health_lock:
                h = health.get(name, {"fail_count": 0})
                h["fail_count"] = h.get("fail_count", 0) + 1
                h["last_error"] = str(e)[:100]
                if h["fail_count"] >= 3:
                    h["dead_until"] = time.time() + 300  # 5 min cooldown
                health[name] = h

    error_detail = "; ".join(errors)
    raise Exception(f"Todos los proveedores fallaron: {error_detail}")


# ── HTTP Server ───────────────────────────────────────────────────────────────
class RouterHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silencioso

    def do_GET(self):
        if self.path == "/health" or self.path == "/":
            self.send_json(200, {
                "service": "starseed-autorouter",
                "status": "ok",
                "providers": {
                    name: {
                        "dead": h.get("dead_until", 0) > time.time(),
                        "fail_count": h.get("fail_count", 0),
                        "last_ok": h.get("last_ok"),
                        "last_error": h.get("last_error"),
                    }
                    for name, h in health.items()
                },
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

            stream = payload.get("stream", False)

            try:
                if stream:
                    self.handle_streaming(payload)
                else:
                    self.handle_non_streaming(payload)
            except Exception as e:
                self.send_json(503, {
                    "error": "All providers failed",
                    "detail": str(e)[:500],
                })
            return

        self.send_json(404, {"error": "Not found"})

    def handle_non_streaming(self, payload):
        requested_model = payload.get("model", "default")
        messages = payload.get("messages", [])
        temperature = payload.get("temperature", 0.7)
        max_tokens = payload.get("max_tokens", 4096)

        response_body, status, provider_name, model_used = try_providers(payload)
        response = json.loads(response_body)
        response["_autorouter"] = {
            "provider": provider_name,
            "model": model_used,
        }
        self.send_json(200, response)

    def handle_streaming(self, payload):
        requested_model = payload.get("model", "default")
        messages = payload.get("messages", [])
        temperature = payload.get("temperature", 0.7)
        max_tokens = payload.get("max_tokens", 4096)

        # Para streaming, necesitamos que el proveedor soporte SSE
        # Por ahora, respondemos con un chunk final (no streaming real)
        response_body, status, provider_name, model_used = try_providers(payload)
        response = json.loads(response_body)

        # Enviar como SSE
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Autorouter-Provider", provider_name)
        self.end_headers()

        # Enviar chunk de respuesta
        chunk = {
            "id": response.get("id", "chatcmpl-autorouter"),
            "object": "chat.completion.chunk",
            "model": model_used,
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "content": response["choices"][0]["message"]["content"],
                    },
                    "finish_reason": "stop",
                }
            ],
            "_autorouter": {
                "provider": provider_name,
                "model": model_used,
            },
        }
        try:
            self.wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("X-Autorouter-Provider", "starseed")
        self.end_headers()
        try:
            self.wfile.write(body)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    load_env()
    port = int(os.environ.get("AUTOROUTER_PORT", "9800"))
    server = HTTPServer(("127.0.0.1", port), RouterHandler)
    print(f"StarSeed AutoRouter en http://127.0.0.1:{port}")
    print(f"Proveedores: {[p['name'] for p in PROVIDERS]}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nParando...")
        server.shutdown()


if __name__ == "__main__":
    main()
