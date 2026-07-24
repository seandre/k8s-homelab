import { readFile, rename, writeFile } from 'node:fs/promises';
import type { ActionPersistence } from './indoor-actions.js';

export class FileActionPersistence implements ActionPersistence {
  constructor(private readonly path: string) {}

  async load(): Promise<unknown> {
    try { return JSON.parse(await readFile(this.path, 'utf8')); } catch { return []; }
  }

  async save(actions: unknown[]) {
    const temporary = `${this.path}.new`;
    await writeFile(temporary, JSON.stringify(actions), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }
}
