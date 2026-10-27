export const detectar = async (fetcher = fetch) => {
  try {
    const res = await fetcher('http://127.0.0.1:3900/health');
    return res.ok;
  } catch {
    return false;
  }
};

export const reenviar = async (ruta, cuerpo, fetcher = fetch) => {
  const permitidas = ['/v1/audio/speech', '/v1/audio/transcriptions', '/v1/audio/voices'];
  if (!permitidas.includes(ruta)) {
    return { status: 404, error: 'No encontrado' };
  }
  
  try {
    const res = await fetcher(`http://127.0.0.1:3900${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    return { status: res.status, data: await res.json() };
  } catch {
    return { status: 502, error: 'Error de conexión' };
  }
};

export const estado = async (fetcher = fetch) => {
  const vivo = await detectar(fetcher);
  return `voicestudio: ${vivo ? 'vivo' : 'ausente'}`;
};
