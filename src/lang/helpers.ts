//Solution copied from obsidian-kanban: https://github.com/mgmeyers/obsidian-kanban/blob/44118e25661bff9ebfe54f71ae33805dc88ffa53/src/lang/helpers.ts

import { LOCALE } from "src/constants/constants";
import en from "./locale/en";

declare const PLUGIN_LANGUAGES: Record<string, string>;
declare var LZString: any;

let locale: Partial<typeof en> | null = null;

/**
 * Safely parse locale data without using eval
 * @param decompressed The decompressed locale string
 * @returns Parsed locale object
 */
function safeParseLocale(decompressed: string): Partial<typeof en> | null {
  if (!decompressed || typeof decompressed !== 'string') {
    return null;
  }

  // Try JSON.parse first (preferred method)
  try {
    // Check if it looks like JSON
    const trimmed = decompressed.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed) as Partial<typeof en>;
    }
  } catch (jsonError) {
    // JSON parsing failed, try alternative method
    console.warn('Locale JSON parse failed, trying alternative method:', jsonError);
  }

  // Alternative: Use Function constructor (safer than eval)
  // This creates an isolated scope for the code execution
  try {
    const fn = new Function(`
      "use strict";
      const result = {};
      const exports = result;
      const module = { exports: result };
      ${decompressed}
      return result;
    `);
    return fn() as Partial<typeof en>;
  } catch (fnError) {
    console.error('Failed to parse locale data safely:', fnError);
    return null;
  }
}

/**
 * Load locale with proper error handling and fallback
 * @param lang Language code
 * @returns Locale object
 */
function loadLocale(lang: string): Partial<typeof en> {
  // Normalize Chinese language code
  if (lang === "zh") {
    lang = "zh-cn"; // https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/2247
  }

  // Check if the language is available
  if (!Object.keys(PLUGIN_LANGUAGES).includes(lang)) {
    console.log(`Locale "${lang}" not found, falling back to English`);
    return en;
  }

  try {
    // Decompress the locale data
    const decompressed = LZString.decompressFromBase64(PLUGIN_LANGUAGES[lang]);
    
    if (!decompressed) {
      console.warn(`Failed to decompress locale data for "${lang}"`);
      return en;
    }

    // Safely parse the locale data
    const parsed = safeParseLocale(decompressed);
    
    if (parsed && Object.keys(parsed).length > 0) {
      console.log(`Loaded locale "${lang}" with ${Object.keys(parsed).length} translations`);
      return parsed;
    }

    console.warn(`Parsed locale "${lang}" is empty, falling back to English`);
    return en;
  } catch (error) {
    console.error(`Error loading locale "${lang}":`, error);
    return en;
  }
}

/**
 * Get translated string with fallback to English
 * @param str Translation key
 * @returns Translated string
 */
export function t(str: keyof typeof en): string {
  // Lazy load locale on first call
  if (!locale) {
    locale = loadLocale(LOCALE);
  }

  // Get translation with proper fallback
  const translated = locale?.[str];
  
  // Only fallback for undefined/null, preserve empty strings
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
 * @param lang Optional new language code
 */
export function reloadLocale(lang?: string): void {
  locale = null;
  if (lang) {
    // If a new language is specified, we'd need to update LOCALE
    // This would require changes to the constants module
  }
  // Trigger lazy reload on next t() call
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