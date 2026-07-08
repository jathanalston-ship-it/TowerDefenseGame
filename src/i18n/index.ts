// LOCALIZATION CORE (docs/I18N.md) — typed keys, three locales, zero dependencies.
//
// The English catalog is the SOURCE OF TRUTH: its literal keys define `MsgKey`, and
// every other locale is `Record<MsgKey, string>` — a missing translation is a
// COMPILE error, not a runtime fallback surprise. `t()` interpolates `{var}` slots.
//
// Migration convention (the beachhead): ALL NEW user-facing chrome strings go through
// `t()`; existing screens migrate opportunistically (hub nav, settings, commander
// prompt, update toast and the LiveOps chrome are done). CONTENT strings (tower/card
// names…) stay registry English for now — the registries can grow optional `nameKey`
// columns later without touching this core.

import { useSyncExternalStore } from 'react';

export const LOCALES = ['en', 'es', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];

const EN = {
  // ── Hub navigation (groups + items) ──
  'nav.group.play': 'Play',
  'nav.group.progression': 'Progression',
  'nav.group.collection': 'Collection',
  'nav.group.store': 'Store',
  'nav.group.account': 'Account',
  'nav.home': 'Home',
  'nav.campaign': 'Campaign',
  'nav.infinite': 'Infinite',
  'nav.bossrush': 'Boss Rush',
  'nav.daily': 'Daily Run',
  'nav.towers': 'Towers',
  'nav.heroes': 'Heroes',
  'nav.evolution': 'Evolution',
  'nav.genes': 'Gene Archive',
  'nav.vault': 'Genetic Vault',
  'nav.market': 'Splice Market',
  'nav.equipment': 'Equipment',
  'nav.collection': 'Collection',
  'nav.store': 'Premium Store',
  'nav.profile': 'Profile',
  'nav.help': 'Help',
  'nav.settings': 'Settings',
  // ── Settings ──
  'settings.title': 'Preferences',
  'settings.sub': 'Stored in this browser.',
  'settings.language': 'Language',
  'settings.language.sub': 'Interface language (game content stays English for now).',
  'settings.help.title': 'Help',
  'settings.help.sub': 'Re-learn the basics any time.',
  'settings.replayTutorial': '▶ Replay Combat Tutorial',
  'settings.replayTour': '▶ Replay Field Orientation',
  'settings.replayIntro': '▶ Replay Initialization',
  'settings.cloud.title': 'Cloud Backup',
  'settings.danger.title': 'Danger Zone',
  'settings.danger.sub': 'Permanently erase all progress on this device.',
  'settings.reset': 'Reset Save',
  // ── Commander designation ──
  'cmdname.eyebrow': '◈ FIELD COMMAND REGISTRY',
  'cmdname.title': 'Designate your Commander',
  'cmdname.sub': 'You fight as {name} — make it yours. This is how you appear on the daily standings, and it links your save to the cloud.',
  'cmdname.placeholder': 'Commander name (2–20)',
  'cmdname.hint.rules': 'Letters, numbers, spaces — 2 to 20 characters.',
  'cmdname.hint.short': 'Too short after cleanup — 2 characters minimum.',
  'cmdname.hint.preview': 'Will appear as “{name}”',
  'cmdname.confirm': 'Confirm designation',
  'cmdname.later': 'Later',
  'cmdname.cloud': '☁ Cloud backup arms automatically once designated.',
  // ── Update toast / LiveOps chrome ──
  'sw.ready': 'A new version of ASSIMILATE is ready.',
  'sw.refresh': '↻ Refresh',
  'liveops.title': '◉ LIVE OPERATIONS',
  'liveops.weekendIn': 'Weekend Surge in {days}d',
} as const;

export type MsgKey = keyof typeof EN;

/** Every message key — for catalog-hygiene tests and tooling (not hot-path code). */
export const EN_KEYS = Object.keys(EN) as MsgKey[];

const ES: Record<MsgKey, string> = {
  'nav.group.play': 'Jugar',
  'nav.group.progression': 'Progresión',
  'nav.group.collection': 'Colección',
  'nav.group.store': 'Tienda',
  'nav.group.account': 'Cuenta',
  'nav.home': 'Inicio',
  'nav.campaign': 'Campaña',
  'nav.infinite': 'Infinito',
  'nav.bossrush': 'Asalto de Jefes',
  'nav.daily': 'Reto Diario',
  'nav.towers': 'Torres',
  'nav.heroes': 'Héroes',
  'nav.evolution': 'Evolución',
  'nav.genes': 'Archivo Génico',
  'nav.vault': 'Bóveda Genética',
  'nav.market': 'Mercado de Empalmes',
  'nav.equipment': 'Equipo',
  'nav.collection': 'Colección',
  'nav.store': 'Tienda Premium',
  'nav.profile': 'Perfil',
  'nav.help': 'Ayuda',
  'nav.settings': 'Ajustes',
  'settings.title': 'Preferencias',
  'settings.sub': 'Guardadas en este navegador.',
  'settings.language': 'Idioma',
  'settings.language.sub': 'Idioma de la interfaz (el contenido del juego sigue en inglés por ahora).',
  'settings.help.title': 'Ayuda',
  'settings.help.sub': 'Repasa lo básico cuando quieras.',
  'settings.replayTutorial': '▶ Repetir tutorial de combate',
  'settings.replayTour': '▶ Repetir orientación de campo',
  'settings.replayIntro': '▶ Repetir inicialización',
  'settings.cloud.title': 'Copia en la nube',
  'settings.danger.title': 'Zona de peligro',
  'settings.danger.sub': 'Borra permanentemente todo el progreso en este dispositivo.',
  'settings.reset': 'Restablecer partida',
  'cmdname.eyebrow': '◈ REGISTRO DE MANDO DE CAMPO',
  'cmdname.title': 'Designa a tu Comandante',
  'cmdname.sub': 'Luchas como {name} — hazlo tuyo. Así aparecerás en la clasificación diaria, y vincula tu partida a la nube.',
  'cmdname.placeholder': 'Nombre de comandante (2–20)',
  'cmdname.hint.rules': 'Letras, números y espacios — de 2 a 20 caracteres.',
  'cmdname.hint.short': 'Demasiado corto tras la limpieza — mínimo 2 caracteres.',
  'cmdname.hint.preview': 'Aparecerá como «{name}»',
  'cmdname.confirm': 'Confirmar designación',
  'cmdname.later': 'Más tarde',
  'cmdname.cloud': '☁ La copia en la nube se activa al designarte.',
  'sw.ready': 'Hay una nueva versión de ASSIMILATE lista.',
  'sw.refresh': '↻ Actualizar',
  'liveops.title': '◉ OPERACIONES EN VIVO',
  'liveops.weekendIn': 'Oleada de fin de semana en {days}d',
};

const PT: Record<MsgKey, string> = {
  'nav.group.play': 'Jogar',
  'nav.group.progression': 'Progressão',
  'nav.group.collection': 'Coleção',
  'nav.group.store': 'Loja',
  'nav.group.account': 'Conta',
  'nav.home': 'Início',
  'nav.campaign': 'Campanha',
  'nav.infinite': 'Infinito',
  'nav.bossrush': 'Investida de Chefes',
  'nav.daily': 'Desafio Diário',
  'nav.towers': 'Torres',
  'nav.heroes': 'Heróis',
  'nav.evolution': 'Evolução',
  'nav.genes': 'Arquivo Genético',
  'nav.vault': 'Cofre Genético',
  'nav.market': 'Mercado de Emendas',
  'nav.equipment': 'Equipamento',
  'nav.collection': 'Coleção',
  'nav.store': 'Loja Premium',
  'nav.profile': 'Perfil',
  'nav.help': 'Ajuda',
  'nav.settings': 'Opções',
  'settings.title': 'Preferências',
  'settings.sub': 'Guardadas neste navegador.',
  'settings.language': 'Idioma',
  'settings.language.sub': 'Idioma da interface (o conteúdo do jogo continua em inglês por enquanto).',
  'settings.help.title': 'Ajuda',
  'settings.help.sub': 'Revise o básico quando quiser.',
  'settings.replayTutorial': '▶ Repetir tutorial de combate',
  'settings.replayTour': '▶ Repetir orientação de campo',
  'settings.replayIntro': '▶ Repetir inicialização',
  'settings.cloud.title': 'Backup na nuvem',
  'settings.danger.title': 'Zona de perigo',
  'settings.danger.sub': 'Apaga permanentemente todo o progresso neste dispositivo.',
  'settings.reset': 'Redefinir progresso',
  'cmdname.eyebrow': '◈ REGISTRO DE COMANDO DE CAMPO',
  'cmdname.title': 'Designe seu Comandante',
  'cmdname.sub': 'Você luta como {name} — faça dele o seu. É assim que você aparece no ranking diário, e vincula seu progresso à nuvem.',
  'cmdname.placeholder': 'Nome do comandante (2–20)',
  'cmdname.hint.rules': 'Letras, números e espaços — de 2 a 20 caracteres.',
  'cmdname.hint.short': 'Curto demais após a limpeza — mínimo de 2 caracteres.',
  'cmdname.hint.preview': 'Aparecerá como “{name}”',
  'cmdname.confirm': 'Confirmar designação',
  'cmdname.later': 'Depois',
  'cmdname.cloud': '☁ O backup na nuvem é ativado ao se designar.',
  'sw.ready': 'Uma nova versão de ASSIMILATE está pronta.',
  'sw.refresh': '↻ Atualizar',
  'liveops.title': '◉ OPERAÇÕES AO VIVO',
  'liveops.weekendIn': 'Onda de fim de semana em {days}d',
};

const CATALOGS: Record<Locale, Record<MsgKey, string>> = { en: EN, es: ES, pt: PT };

// ── Locale store (tiny external store; React re-renders via useLocale) ──
const KEY = 'assimilate.locale';
const listeners = new Set<() => void>();

function detect(): Locale {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
    const nav = navigator.language?.slice(0, 2).toLowerCase();
    if (nav && (LOCALES as readonly string[]).includes(nav)) return nav as Locale;
  } catch {
    /* SSR/tests/storage-off → English */
  }
  return 'en';
}

let current: Locale = detect();

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale): void {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage unavailable — the session still switches */
  }
  for (const fn of listeners) fn();
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLocale,
    getLocale,
  );
}

/** Translate a key in the CURRENT locale, interpolating `{var}` slots. */
export function t(key: MsgKey, vars?: Record<string, string | number>): string {
  let out: string = CATALOGS[current][key] ?? EN[key];
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}
