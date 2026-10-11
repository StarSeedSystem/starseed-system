// src/app/api/mando/tunel-metagenesis/route.ts
import { guardianMando } from '@/lib/mando/guardian';
import { estadoTunelMetaGenesis } from '@/lib/mando/tunel-metagenesis-estado';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const veto = await guardianMando(request);
  if (veto) return veto;

  const estado = await estadoTunelMetaGenesis();
  return Response.json(estado);
}