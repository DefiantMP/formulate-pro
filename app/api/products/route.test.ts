import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    run: { findMany: (...args: unknown[]) => findManyMock(...args) },
  },
}));

const { GET } = await import('./route');

describe('GET /api/products', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);
  });

  it('excludes archived runs from product suggestions', async () => {
    await GET();
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } })
    );
  });
});
