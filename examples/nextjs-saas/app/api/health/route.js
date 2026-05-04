// GET /api/health — liveness probe.
export async function GET() {
  return Response.json({ status: 'ok' });
}
