import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const findManyMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    run: { findMany: (...args: unknown[]) => findManyMock(...args) },
  },
}));

// GET /api/runs must import after the mock above is registered.
const { GET } = await import('./route');

describe('GET /api/runs', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);
  });

  it('excludes archived (deletedAt set) runs by default', async () => {
    await GET(new NextRequest('http://localhost/api/runs'));
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) })
    );
  });

  it('still scopes to a product when ?product= is given, alongside the deletedAt filter', async () => {
    await GET(new NextRequest('http://localhost/api/runs?product=OGS'));
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, product: 'OGS' }) })
    );
  });
});
