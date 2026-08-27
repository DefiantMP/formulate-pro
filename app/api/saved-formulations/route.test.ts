import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    savedFormulation: { findMany: (...args: unknown[]) => findManyMock(...args) },
  },
}));

const { GET } = await import('./route');

describe('GET /api/saved-formulations', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);
  });

  it('excludes archived (deletedAt set) formulations by default', async () => {
    await GET();
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } })
    );
  });
});
