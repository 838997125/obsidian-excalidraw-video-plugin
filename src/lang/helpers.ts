//Solution copied from obsidian-kanban: https://github.com/mgmeyers/obsidian-kanban/blob/44118e25661bff9ebfe54f71ae33805dc88ffa53/src/lang/helpers.ts

import { LOCALE } from "src/constants/constants";
import en from "./locale/en";

declare const PLUGIN_LANGUAGES: Record<string, string>;
declare var LZString: any;

let locale: Partial<typeof en> | null = null;

function loadLocale(lang: string): Partial<typeof en> {
  if(lang === "zh") lang = "zh-cn"; //https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/2247
  if (Object.keys(PLUGIN_LANGUAGES).includes(lang)) {
    try {
      const decompressed = LZString.decompressFromBase64(PLUGIN_LANGUAGES[lang]);
      if (!decompressed) {
        console.warn(`Failed to decompress locale data for "${lang}"`);
        return en;
      }
      let x = {};
      // The locale data is JavaScript code that populates the x object
      // This is safe because the locale data comes from the plugin itself
      eval(decompressed);
      if (Object.keys(x).length > 0) {
        return x;
      }
      console.warn(`Parsed locale "${lang}" is empty, falling back to English`);
      return en;
    } catch (error) {
      console.error(`Error loading locale "${lang}":`, error);
      return en;
    }
  } else {
    return en;
  }
}

export function t(str: keyof typeof en): string {
  if (!locale) {
    locale = loadLocale(LOCALE);
  }
  // Only fallback for undefined/null, preserve empty strings
  const translated = locale?.[str];
  if (translated !== undefined && translated !== null) {
    return translated;
  }
  return en[str];
}

/**
 * Check if a translation key exists
 * @param str Translation key
 * @returns Whether the key exists in current locale
 */
export function hasTranslation(str: keyof typeof en): boolean {
  if (!locale) {
    locale = loadLocale(LOCALE);
  }
  return locale?.[str] !== undefined || en[str] !== undefined;
}

/**
 * Get all translation keys
 * @returns Array of translation keys
 */
export function getTranslationKeys(): (keyof typeof en)[] {
  return Object.keys(en) as (keyof typeof en)[];
}

/**
 * Get current locale code
 * @returns Current locale code
 */
export function getCurrentLocale(): string {
  return LOCALE;
}

/**
 * Force reload locale (useful for language switching)
 */
export function reloadLocale(): void {
  locale = null;
}

/*
import ar from "./locale/ar";
import cz from "./locale/cz";
import da from "./locale/da";
import de from "./locale/de";
import en from "./locale/en";
import enGB from "./locale/en-gb";
import es from "./locale/es";
import fr from "./locale/fr";
import hi from "./locale/hi";
import id from "./locale/id";
import it from "./locale/it";
import ja from "./locale/ja";
import ko from "./locale/ko";
import nl from "./locale/nl";
import no from "./locale/no";
import pl from "./locale/pl";
import pt from "./locale/pt";
import ptBR from "./locale/pt-br";
import ro from "./locale/ro";
import ru from "./locale/ru";
import tr from "./locale/tr";
import zhCN from "./locale/zh-cn";
import zhTW from "./locale/zh-tw";
import { LOCALE } from "src/constants/constants";

const localeMap: { [k: string]: Partial<typeof en> } = {
  ar,
  cs: cz,
  da,
  de,
  en,
  "en-gb": enGB,
  es,
  fr,
  hi,
  id,
  it,
  ja,
  ko,
  nl,
  nn: no,
  pl,
  pt,
  "pt-br": ptBR,
  ro,
  ru,
  tr,
  "zh-cn": zhCN,
  "zh-tw": zhTW,
};*/