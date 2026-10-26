import { detectar, reenviar, estado } from './voicestudio-proxy.mjs';

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ruta = url.pathname.replace('/voicestudio', '');

  if (ruta === '/salud') {
    res.setHeader('Content-Type', 'text/plain');
    return res.end(await estado());
  }

  if (req.method === 'POST') {
    const cuerpo = await req.json();
    const resultado = await reenviar(ruta, cuerpo);
    return res.status(resultado.status).json(resultado.data || { error: resultado.error });
  }

  res.status(404).end();
}
