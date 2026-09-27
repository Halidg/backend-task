import type { Note, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  InvalidNoteUpdateError,
  NoteNotFoundError,
  NotesService,
  type NotesPrismaClient,
} from './notes.service.js';

const userId = '990f27ad-143b-4026-91ca-f019fe7d05ba';
const noteId = 'fd71f403-aa83-4537-8aca-88dd56d00073';

const existingNote: Note = {
  id: noteId,
  userId,
  title: 'Updated title',
  content: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

function createSubject() {
  const update = vi.fn<
    (args: {
      where: { id: string; userId: string };
      data: Prisma.NoteUpdateInput;
    }) => Promise<Note>
  >();

  const prisma: NotesPrismaClient = { note: { update } };

  return { service: new NotesService(prisma), update };
}

describe('NotesService.updateNote', () => {
  it('updates only the note owned by the authenticated user', async () => {
    const { service, update } = createSubject();
    update.mockResolvedValue(existingNote);

    await expect(
      service.updateNote(userId, noteId, {
        title: '  Updated title  ',
        content: null,
      }),
    ).resolves.toEqual(existingNote);

    expect(update).toHaveBeenCalledWith({
      where: { id: noteId, userId },
      data: { title: 'Updated title', content: null },
    });
  });

  it('does not pass forbidden runtime fields to Prisma', async () => {
    const { service, update } = createSubject();
    update.mockResolvedValue(existingNote);

    await service.updateNote(userId, noteId, {
      title: 'Updated title',
      userId: 'another-user',
      updatedAt: new Date(0),
    } as never);

    expect(update).toHaveBeenCalledWith({
      where: { id: noteId, userId },
      data: { title: 'Updated title' },
    });
  });

  it('maps a missing or foreign note to the same not-found error', async () => {
    const { service, update } = createSubject();
    update.mockRejectedValue({ code: 'P2025' });

    await expect(
      service.updateNote(userId, noteId, { title: 'Updated title' }),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  it.each([
    [{}, 'At least one of title or content must be provided'],
    [{ title: '   ' }, 'Title must not be empty'],
    [
      { title: 'x'.repeat(201) },
      'Title must contain at most 200 characters',
    ],
  ])('rejects invalid update data %#', async (input, message) => {
    const { service, update } = createSubject();

    await expect(service.updateNote(userId, noteId, input)).rejects.toEqual(
      new InvalidNoteUpdateError(message),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('does not hide unexpected database errors', async () => {
    const { service, update } = createSubject();
    const databaseError = new Error('database unavailable');
    update.mockRejectedValue(databaseError);

    await expect(
      service.updateNote(userId, noteId, { content: 'New content' }),
    ).rejects.toBe(databaseError);
  });
});
