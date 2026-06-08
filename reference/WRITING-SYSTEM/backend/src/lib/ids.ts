import { nanoid } from 'nanoid';

/** `<prefix>_<nanoid21>` — portable text IDs, never integers. */
export function newId(prefix: string): string {
  return `${prefix}_${nanoid(21)}`;
}
