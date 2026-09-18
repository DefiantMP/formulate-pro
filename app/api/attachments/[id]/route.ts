import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Serves an uploaded original back to the app, inline, so the reviewer can
 * compare a transcription against the page it came from.
 *
 * Internal like the notes it belongs to. nosniff + a sandboxing CSP so an
 * uploaded file can never run as part of the app, whatever it contains.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const a = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const safeName = a.filename.replace(/["\\\r\n]/g, '_');
  return new NextResponse(Buffer.from(a.data), {
    headers: {
      'Content-Type': a.mediaType,
      'Content-Length': String(a.sizeBytes),
      'Content-Disposition': `inline; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
