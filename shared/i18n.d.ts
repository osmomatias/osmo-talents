export type LanguageCode = "pt-BR" | "en-US" | "es-419" | "fr-CA";
export type LanguageEntry = [LanguageCode, string];
export type TranslationDictionary = Record<string, string>;
export interface TranslationPattern {
  re: RegExp;
  v: string;
  order: string[];
  fixed: number;
}
export interface CompiledDictionary {
  exact: Map<string, string>;
  pats: TranslationPattern[];
  keys: Map<string, string>;
}
export interface I18nCore {
  compile(dict: TranslationDictionary | null | undefined): CompiledDictionary;
  tr(compiled: CompiledDictionary, text: string, depth?: number): string | null;
  translateText(compiled: CompiledDictionary, text: string): string | null;
  format(compiled: CompiledDictionary | null, key: string, args: readonly unknown[]): string;
  norm(value: unknown): string;
  LANGS: LanguageEntry[];
  pick(languages: readonly string[] | null | undefined): LanguageCode | null;
}
