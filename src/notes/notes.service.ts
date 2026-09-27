import type { Note, Prisma } from '@prisma/client';

export interface UpdateNoteInput {
  title?: string;
  content?: string | null;
}

type NoteDelegate = {
  update(args: {
    where: { id: string; userId: string };
    data: Prisma.NoteUpdateInput;
  }): Promise<Note>;
};

export interface NotesPrismaClient {
  note: NoteDelegate;
}

export class InvalidNoteUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNoteUpdateError';
  }
}

export class NoteNotFoundError extends Error {
  constructor() {
    super('Note not found');
    this.name = 'NoteNotFoundError';
  }
}

function isPrismaRecordNotFound(error: unknown): error is { code: 'P2025' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  );
}

export class NotesService {
  constructor(private readonly prisma: NotesPrismaClient) {}

  async updateNote(
    userId: string,
    noteId: string,
    input: UpdateNoteInput,
  ): Promise<Note> {
    const data: Prisma.NoteUpdateInput = {};

    if (input.title !== undefined) {
      const title = input.title.trim();

      if (title.length === 0) {
        throw new InvalidNoteUpdateError('Title must not be empty');
      }

      if (title.length > 200) {
        throw new InvalidNoteUpdateError(
          'Title must contain at most 200 characters',
        );
      }

      data.title = title;
    }

    if (input.content !== undefined) {
      data.content = input.content;
    }

    if (Object.keys(data).length === 0) {
      throw new InvalidNoteUpdateError(
        'At least one of title or content must be provided',
      );
    }

    try {
      // The ownership condition is part of the UPDATE itself. This avoids a
      // check-then-update race and never performs an update by note id alone.
      return await this.prisma.note.update({
        where: { id: noteId, userId },
        data,
      });
    } catch (error: unknown) {
      if (isPrismaRecordNotFound(error)) {
        // Missing and foreign notes deliberately look identical to callers.
        throw new NoteNotFoundError();
      }

      throw error;
    }
  }
}
