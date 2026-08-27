import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    savedFormulation: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

const { GET, DELETE } = await import('./route');

describe('GET /api/saved-formulations/[id]', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it('still returns an archived formulation by direct id — archiving hides it from the list, not from a direct link', async () => {
    findUniqueMock.mockResolvedValue({ id: 'f1', name: 'Old draft', deletedAt: new Date() });
    const res = await GET(new Request('http://localhost/api/saved-formulations/f1'), { params: { id: 'f1' } });
    expect(res.status).toBe(200);
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });

  it('404s when the formulation truly does not exist', async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/saved-formulations/missing'), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/saved-formulations/[id]', () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it('soft-deletes by stamping deletedAt, not removing the row', async () => {
    updateMock.mockResolvedValue({ id: 'f1', deletedAt: new Date() });
    const res = await DELETE(new Request('http://localhost/api/saved-formulations/f1'), { params: { id: 'f1' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('returns 404 when the formulation does not exist', async () => {
    updateMock.mockRejectedValue(new Error('Record to update not found'));
    const res = await DELETE(new Request('http://localhost/api/saved-formulations/missing'), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });
});
