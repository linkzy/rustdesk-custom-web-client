/**
 * The catalogue contract. Kept apart from en.ts so a translator can copy that
 * file verbatim, rename its export and translate the values — if the types lived
 * there, the copy would reference its own name and fail to compile.
 */
import { en } from './en';

export type MessageKey = keyof typeof en;
export type Catalogue = Record<MessageKey, string>;

/** What every catalogue module must export: its messages and its own name. */
export interface LocaleModule {
  catalogue: Catalogue;
  /** The language's endonym, shown in the picker. Never translated. */
  label: string;
}
