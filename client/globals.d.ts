type OsmoLanguageCode = import("../shared/i18n").LanguageCode;
type OsmoI18nCore = import("../shared/i18n").I18nCore;
type OsmoCompiledDictionary = import("../shared/i18n").CompiledDictionary;
type OsmoTranslationDictionary = import("../shared/i18n").TranslationDictionary;

interface OsmoI18n {
  lang: string;
  locale: string;
  ativo: boolean;
  langs: import("../shared/i18n").LanguageEntry[];
  ready: Promise<void>;
  t(key: string, ...args: unknown[]): string;
  tx(text: string): string;
  flush(): void;
  set(language: string): void;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}
interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
  appinstalled: Event;
}
interface Navigator {
  readonly standalone?: boolean;
}

interface OsmoLottieAnimation {
  readonly isLoaded: boolean;
  addEventListener(name: "DOMLoaded", listener: () => void): void;
  goToAndPlay(value: number, isFrame?: boolean): void;
  destroy(): void;
}
interface OsmoLottie {
  loadAnimation(options: {
    container: Element;
    renderer: "svg";
    loop: boolean | number;
    autoplay: boolean;
    path: string;
  }): OsmoLottieAnimation;
}

interface OsmoRemoteState {
  screen: string;
  eyebrow: string;
  title: string;
  playing: boolean;
  t: number;
  d: number;
  hasHome: boolean;
  casa: boolean;
}
interface OsmoCatalogItem {
  id: string;
  title: string;
  eyebrow?: string;
  meta?: string | number;
  overview?: string;
  poster?: string;
  orig?: boolean;
}
interface OsmoCatalog {
  rows: { title: string; items: OsmoCatalogItem[] }[];
}
interface OsmoRemote {
  handlers: Record<string, (id?: string) => void>;
  on(command: string, handler: (id?: string) => void): void;
  link(url: string, play?: string): string;
  catalog(catalog: OsmoCatalog): void;
  pending: string;
  leaving: boolean;
}
interface Window {
  OsmoI18nCore: OsmoI18nCore;
  I18N?: OsmoI18n;
  lottie?: OsmoLottie;
  OsmoRemote?: OsmoRemote;
  OsmoTV?: { homeServer(): string | null | undefined };
  webkitAudioContext?: typeof AudioContext;
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
}
interface OsmoQRCode {
  addData(data: string, mode?: "Numeric" | "Alphanumeric" | "Byte" | "Kanji"): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
declare const qrcode: ((typeNumber: number, correction: "L" | "M" | "Q" | "H") => OsmoQRCode) | undefined;
