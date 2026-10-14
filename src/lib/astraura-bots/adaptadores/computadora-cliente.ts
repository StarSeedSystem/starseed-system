'use client';

/**
 * Bots/dots de Astraura · COMPUTADORA CLIENTE (BOT1011K).
 * Adaptador para interactuar con la computadora del bot en el servidor.
 */

export async function estadoComputadora(botId: string): Promise<{estado: string}> {
  try {
    const res = await fetch(`/api/bots/computadora/${botId}/estado`);
    if (!res.ok) {
      if (res.status === 404) {
        return { estado: "desconocido" };
      }
      return { estado: "error" };
    }
    const data = await res.json();
    return { estado: data.estado ?? "desconocido" };
  } catch (e) {
    return { estado: "error" };
  }
}

export async function encender(botId: string): Promise<{ok: boolean; motivo?: string}> {
  try {
    const res = await fetch(`/api/bots/computadora/${botId}/encender`, {
      method: 'POST',
    });
    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, motivo: "próximamente: falta la computadora del bot (BOT1011L, visto bueno de Alex)" };
      }
      return { ok: false, motivo: "Error al encender la computadora" };
    }
    const data = await res.json();
    return { ok: data.ok ?? true, motivo: data.motivo };
  } catch (e) {
    return { ok: false, motivo: "Error de red al encender la computadora" };
  }
}

export async function apagar(botId: string): Promise<{ok: boolean; motivo?: string}> {
  try {
    const res = await fetch(`/api/bots/computadora/${botId}/apagar`, {
      method: 'POST',
    });
    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, motivo: "próximamente: falta la computadora del bot (BOT1011L, visto bueno de Alex)" };
      }
      return { ok: false, motivo: "Error al apagar la computadora" };
    }
    const data = await res.json();
    return { ok: data.ok ?? true, motivo: data.motivo };
  } catch (e) {
    return { ok: false, motivo: "Error de red al apagar la computadora" };
  }
}

export async function ejecutar(
  botId: string,
  orden: string
): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const res = await fetch(`/api/bots/computadora/${botId}/ejecutar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orden }),
    });
    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, motivo: "próximamente: falta la computadora del bot (BOT1011L, visto bueno de Alex)" };
      }
      return { ok: false, motivo: "Error al ejecutar la orden" };
    }
    const data = await res.json();
    return { ok: data.ok ?? true, motivo: data.motivo };
  } catch (e) {
    return { ok: false, motivo: "Error de red al ejecutar la orden" };
  }
}