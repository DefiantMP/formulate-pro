import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const updateMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    run: { update: (...args: unknown[]) => updateMock(...args) },
  },
}));

vi.mock('@/lib/runFormulationSync', () => ({
  syncFormulationFromRun: vi.fn(),
}));

const { DELETE } = await import('./route');

describe('DELETE /api/runs/[id]', () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it('soft-deletes by stamping deletedAt, not removing the row', async () => {
    updateMock.mockResolvedValue({ id: 'run-1', deletedAt: new Date() });
    const res = await DELETE(new NextRequest('http://localhost/api/runs/run-1'), { params: { id: 'run-1' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('returns 404 when the run does not exist', async () => {
    updateMock.mockRejectedValue(new Error('Record to update not found'));
    const res = await DELETE(new NextRequest('http://localhost/api/runs/missing'), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });
});
