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
  'nav.group.play': 'Mission Hub',
  'nav.group.rewards': 'Rewards Hub',
  'nav.group.progression': 'Evolution Hub',
  'nav.group.trade': 'Market Hub',
  'nav.group.store': 'Store',
  'nav.group.account': 'Profile Hub',
  'hub.blurb.play': 'Launch runs — every other system feeds on what you fight for.',
  'hub.blurb.rewards': 'Everything you have earned, in one place: claim it, crack it, bank it.',
  'hub.blurb.progression': 'Spend what runs earned into permanent power — towers, heroes, genes, the Hive.',
  'hub.blurb.trade': 'Trade, outfit, and admire the arsenal: markets, gear, cosmetics.',
  'hub.blurb.store': 'The premium wing — deliberately separate from progression.',
  'hub.blurb.account': 'Your record: identity, codex, help, and the machine settings.',
  'hub.landing.attention': 'Needs attention',
  'hub.landing.recommended': 'Recommended now',
  'hub.landing.recent': 'Recently unlocked',
  'hub.landing.complete': 'complete',
  'hub.landing.quiet': 'All quiet here — nothing is waiting on you.',
  'hub.landing.stillReady': 'Earned rewards below are still waiting — the glowing doors hold them.',
  'nav.home': 'Home', // the rail's Home DOOR (chrome) — screen names live in the feature registry (see SCREEN_NAMES)
  // ── Portrait tab shell (docs/RESPONSIVE-DESIGN.md §mobile-shell) ──
  'mnav.home': 'Home',
  'mnav.battle': 'Battle',
  'mnav.rewards': 'Rewards',
  'mnav.evolve': 'Evolve',
  'mnav.more': 'More',
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
  // ── The Commissioning (post-tutorial account creation — docs/PROFILE.md §commissioning) ──
  'commission.eyebrow': '◈ COMMISSIONING ◈',
  'commission.step.rewards': 'GRADUATION',
  'commission.step.name': 'DESIGNATION',
  'commission.step.identity': 'IDENTITY',
  'commission.step.account': 'SAFEGUARD',
  'commission.rewards.title': 'Assimilation Protocol',
  'commission.rewards.sub': 'The lesson is over. Here is your starter payout — now the hive learns your name.',
  'commission.rewards.next': 'Begin Commissioning ▸',
  'commission.name.title': 'Designate your Commander',
  'commission.name.sub': 'The hive — and the daily standings — will know you by this name.',
  'commission.name.suggest': 'Suggest a callsign',
  'commission.name.confirm': 'Confirm designation',
  'commission.name.skip': 'Decide later',
  'commission.identity.title': 'Take your mark',
  'commission.identity.sub': 'A sigil you can change any time. A founding title you can never re-choose.',
  'commission.identity.sigil': 'SIGIL — worn beside your name',
  'commission.identity.titles': 'FOUNDING TITLE — a one-time oath',
  'commission.identity.none': 'None',
  'commission.identity.oath': 'The founding titles you decline are gone forever — that is what makes yours yours.',
  'commission.identity.next': 'Swear it ▸',
  'commission.account.title': 'Safeguard your progress',
  'commission.account.sub': 'Your save lives on this device. An account keeps it — play here, continue anywhere.',
  'commission.account.guest': 'Continue as Guest',
  'commission.account.create': 'Create Account',
  'commission.account.signin': 'I have an account',
  'commission.account.offline': 'Offline — guest play works fully; create an account any time later.',
  'commission.account.guestmode': 'Guest Mode: this session is not saved — create an account (or sign in) now to keep everything you just earned.',
  'commission.account.guest.hint': 'Your hive stays saved on this device. Create an account any time from Profile to carry it everywhere.',
  'commission.account.back': '← Back',
  // ── Update toast / LiveOps chrome ──
  'sw.ready': 'A new version of ASSIMILATION is ready.',
  'sw.refresh': '↻ Refresh',
  'sw.dismiss': 'Dismiss update notification',
  'liveops.title': '◉ LIVE OPERATIONS',
  'liveops.utc': 'all times UTC',
  'liveops.endsIn': 'ends {left}',
  'liveops.startsIn': 'in {left}',
  'liveops.upNext': 'UP NEXT',
  // ── Replay Theater (docs/REPLAY-SHARE.md) ──
  'spectate.title': '▶ REPLAY THEATER',
  'spectate.line': 'Wave {wave} · {kills} kills · Integrity {integrity}%',
  'spectate.claim': 'Claim: wave {wave} · {kills} kills',
  'spectate.exit': '✕ Exit',
  'spectate.pause': '⏸ Pause',
  'spectate.resume': '▶ Resume',
  'spectate.skip': '⤑ Outcome',
  'spectate.verified': '✓ VERIFIED — this replay reproduces its claim.',
  'spectate.diverged': '✗ DIVERGED — this recording does not reproduce its claim.',
  'spectate.outcome': 'Reached wave {wave} with {kills} kills.',
  'daily.theater.title': 'Replay Theater',
  'daily.theater.watch': '▶ Watch today’s best',
  'daily.theater.share': '⧉ Copy share code',
  'daily.theater.copied': '✓ Copied — paste it anywhere',
  'daily.theater.copying': 'Preparing replay…',
  'spectate.progress': 'Replay progress',
  'daily.theater.manualCopy': 'Clipboard unavailable. Select and copy the replay below.',
  'daily.theater.copyValue': 'Replay link or code',
  'daily.theater.copyFailed': 'Could not prepare the replay. Try again.',
  'daily.theater.empty': 'Set a daily best today to record a shareable replay.',
  'daily.theater.paste': 'Paste a replay code…',
  'daily.theater.watchCode': '▶ Watch',
  'daily.theater.bad': 'That code did not decode — check you copied the whole thing.',
  'results.shareReplay': '⧉ Share replay',
  // ── Phenotype Lab (docs/COSMETICS.md) ──
  'pheno.title': 'Phenotype Lab',
  'pheno.sub': 'Express your strains — visual phenotypes for every tower and hero. Pure expression: no stats change.',
  'pheno.cultivate': '⌬ Cultivate a phenotype',
  'pheno.owned': '{owned}/{total} expressed',
  'pheno.grown': 'A new phenotype expressed —',
  'pheno.default': 'Default',
  'pheno.towers': 'TOWER STRAINS',
  'pheno.heroes': 'CHAMPION STRAINS',
  'pheno.src.cultivate': 'grown in the Lab (Cultivate)',
  'pheno.src.contract': 'Champion Contract exclusive',
  'pheno.src.nemesis': 'Nemesis revenge exclusive',
  'pheno.bonus.tip': 'The Phenotypes codex pays a hive-wide bonus as it fills — like every collection.',
} as const;

export type MsgKey = keyof typeof EN;

/** Every message key — for catalog-hygiene tests and tooling (not hot-path code). */
export const EN_KEYS = Object.keys(EN) as MsgKey[];

const ES: Record<MsgKey, string> = {
  'nav.group.play': 'Centro de Misión',
  'nav.group.rewards': 'Centro de Premios',
  'nav.group.progression': 'Centro de Evolución',
  'nav.group.trade': 'Centro de Mercado',
  'nav.group.store': 'Tienda',
  'nav.group.account': 'Centro de Perfil',
  'hub.blurb.play': 'Lanza partidas: todos los demás sistemas se alimentan de lo que conquistas.',
  'hub.blurb.rewards': 'Todo lo que has ganado, en un solo lugar: reclámalo, ábrelo, guárdalo.',
  'hub.blurb.progression': 'Convierte lo ganado en poder permanente: torres, héroes, genes, la Colmena.',
  'hub.blurb.trade': 'Comercia, equipa y admira el arsenal: mercados, equipo, cosméticos.',
  'hub.blurb.store': 'El ala premium, deliberadamente separada de la progresión.',
  'hub.blurb.account': 'Tu historial: identidad, códice, ayuda y ajustes de la máquina.',
  'hub.landing.attention': 'Requiere atención',
  'hub.landing.recommended': 'Recomendado ahora',
  'hub.landing.recent': 'Desbloqueado recientemente',
  'hub.landing.complete': 'completado',
  'hub.landing.quiet': 'Todo tranquilo: nada espera por ti.',
  'hub.landing.stillReady': 'Las recompensas ganadas siguen esperando — las puertas iluminadas las guardan.',
  'nav.home': 'Inicio',
  'mnav.home': 'Inicio',
  'mnav.battle': 'Batalla',
  'mnav.rewards': 'Premios',
  'mnav.evolve': 'Evolución',
  'mnav.more': 'Más',
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
  // ── La Comisión (creación de cuenta tras el tutorial) ──
  'commission.eyebrow': '◈ COMISIÓN ◈',
  'commission.step.rewards': 'GRADUACIÓN',
  'commission.step.name': 'DESIGNACIÓN',
  'commission.step.identity': 'IDENTIDAD',
  'commission.step.account': 'SALVAGUARDA',
  'commission.rewards.title': 'Protocolo de Asimilación',
  'commission.rewards.sub': 'La lección terminó. Aquí está tu pago inicial — ahora la colmena aprende tu nombre.',
  'commission.rewards.next': 'Comenzar la Comisión ▸',
  'commission.name.title': 'Designa a tu Comandante',
  'commission.name.sub': 'La colmena — y la clasificación diaria — te conocerán por este nombre.',
  'commission.name.suggest': 'Sugerir un alias',
  'commission.name.confirm': 'Confirmar designación',
  'commission.name.skip': 'Decidir más tarde',
  'commission.identity.title': 'Toma tu marca',
  'commission.identity.sub': 'Un sigilo que puedes cambiar cuando quieras. Un título fundacional que nunca podrás re-elegir.',
  'commission.identity.sigil': 'SIGILO — junto a tu nombre',
  'commission.identity.titles': 'TÍTULO FUNDACIONAL — un juramento único',
  'commission.identity.none': 'Ninguno',
  'commission.identity.oath': 'Los títulos fundacionales que rechaces desaparecen para siempre — eso hace tuyo al tuyo.',
  'commission.identity.next': 'Júralo ▸',
  'commission.account.title': 'Protege tu progreso',
  'commission.account.sub': 'Tu partida vive en este dispositivo. Una cuenta la conserva — juega aquí, continúa donde sea.',
  'commission.account.guest': 'Continuar como invitado',
  'commission.account.create': 'Crear cuenta',
  'commission.account.signin': 'Ya tengo una cuenta',
  'commission.account.offline': 'Sin conexión — el modo invitado funciona por completo; crea una cuenta más tarde.',
  'commission.account.guestmode': 'Modo invitado: esta sesión no se guarda — crea una cuenta (o inicia sesión) ahora para conservar todo lo que acabas de ganar.',
  'commission.account.guest.hint': 'Tu colmena queda guardada en este dispositivo. Crea una cuenta cuando quieras desde Perfil para llevarla a todas partes.',
  'commission.account.back': '← Volver',
  'sw.ready': 'Hay una nueva versión de ASSIMILATION lista.',
  'sw.refresh': '↻ Actualizar',
  'sw.dismiss': 'Cerrar aviso de actualización',
  'liveops.title': '◉ OPERACIONES EN VIVO',
  'liveops.utc': 'horario UTC',
  'liveops.endsIn': 'termina {left}',
  'liveops.startsIn': 'en {left}',
  'liveops.upNext': 'PRÓXIMOS',
  'spectate.title': '▶ TEATRO DE REPETICIONES',
  'spectate.line': 'Oleada {wave} · {kills} bajas · Integridad {integrity}%',
  'spectate.claim': 'Marca: oleada {wave} · {kills} bajas',
  'spectate.exit': '✕ Salir',
  'spectate.pause': '⏸ Pausa',
  'spectate.resume': '▶ Reanudar',
  'spectate.skip': '⤑ Resultado',
  'spectate.verified': '✓ VERIFICADA — esta repetición reproduce su marca.',
  'spectate.diverged': '✗ DIVERGENTE — esta grabación no reproduce su marca.',
  'spectate.outcome': 'Alcanzó la oleada {wave} con {kills} bajas.',
  'daily.theater.title': 'Teatro de repeticiones',
  'daily.theater.watch': '▶ Ver la mejor de hoy',
  'daily.theater.share': '⧉ Copiar código',
  'daily.theater.copied': '✓ Copiado — pégalo donde quieras',
  'daily.theater.copying': 'Preparando repetición…',
  'spectate.progress': 'Progreso de la repetición',
  'daily.theater.manualCopy': 'Portapapeles no disponible. Selecciona y copia la repetición de abajo.',
  'daily.theater.copyValue': 'Enlace o código de repetición',
  'daily.theater.copyFailed': 'No se pudo preparar la repetición. Inténtalo de nuevo.',
  'daily.theater.empty': 'Logra una marca diaria hoy para grabar una repetición compartible.',
  'daily.theater.paste': 'Pega un código de repetición…',
  'daily.theater.watchCode': '▶ Ver',
  'daily.theater.bad': 'Ese código no se pudo decodificar — comprueba que copiaste todo.',
  'results.shareReplay': '⧉ Compartir repetición',
  'pheno.title': 'Laboratorio de Fenotipos',
  'pheno.sub': 'Expresa tus cepas — fenotipos visuales para cada torre y héroe. Pura expresión: sin cambios de stats.',
  'pheno.cultivate': '⌬ Cultivar un fenotipo',
  'pheno.owned': '{owned}/{total} expresados',
  'pheno.grown': 'Nuevo fenotipo expresado —',
  'pheno.default': 'Original',
  'pheno.towers': 'CEPAS DE TORRES',
  'pheno.heroes': 'CEPAS DE CAMPEONES',
  'pheno.src.cultivate': 'se cultiva en el Laboratorio',
  'pheno.src.contract': 'exclusivo de Contratos de Campeón',
  'pheno.src.nemesis': 'exclusivo de venganza Némesis',
  'pheno.bonus.tip': 'El códice de Fenotipos paga un bono global al completarse — como toda colección.',
};

const PT: Record<MsgKey, string> = {
  'nav.group.play': 'Centro de Missão',
  'nav.group.rewards': 'Centro de Prêmios',
  'nav.group.progression': 'Centro de Evolução',
  'nav.group.trade': 'Centro de Mercado',
  'nav.group.store': 'Loja',
  'nav.group.account': 'Centro de Perfil',
  'hub.blurb.play': 'Lance partidas: todos os outros sistemas se alimentam do que você conquista.',
  'hub.blurb.rewards': 'Tudo o que você ganhou, em um só lugar: resgate, abra, guarde.',
  'hub.blurb.progression': 'Converta o que ganhou em poder permanente: torres, heróis, genes, a Colmeia.',
  'hub.blurb.trade': 'Negocie, equipe e admire o arsenal: mercados, equipamento, cosméticos.',
  'hub.blurb.store': 'A ala premium, deliberadamente separada da progressão.',
  'hub.blurb.account': 'Seu registro: identidade, códice, ajuda e ajustes da máquina.',
  'hub.landing.attention': 'Requer atenção',
  'hub.landing.recommended': 'Recomendado agora',
  'hub.landing.recent': 'Desbloqueado recentemente',
  'hub.landing.complete': 'concluído',
  'hub.landing.quiet': 'Tudo calmo: nada espera por você.',
  'hub.landing.stillReady': 'Recompensas ganhas ainda aguardam — as portas iluminadas as guardam.',
  'nav.home': 'Início',
  'mnav.home': 'Início',
  'mnav.battle': 'Batalha',
  'mnav.rewards': 'Prêmios',
  'mnav.evolve': 'Evolução',
  'mnav.more': 'Mais',
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
  // ── A Comissão (criação de conta após o tutorial) ──
  'commission.eyebrow': '◈ COMISSÃO ◈',
  'commission.step.rewards': 'GRADUAÇÃO',
  'commission.step.name': 'DESIGNAÇÃO',
  'commission.step.identity': 'IDENTIDADE',
  'commission.step.account': 'SALVAGUARDA',
  'commission.rewards.title': 'Protocolo de Assimilação',
  'commission.rewards.sub': 'A lição acabou. Aqui está seu pagamento inicial — agora a colmeia aprende seu nome.',
  'commission.rewards.next': 'Iniciar a Comissão ▸',
  'commission.name.title': 'Designe seu Comandante',
  'commission.name.sub': 'A colmeia — e o ranking diário — vão conhecê-lo por este nome.',
  'commission.name.suggest': 'Sugerir um codinome',
  'commission.name.confirm': 'Confirmar designação',
  'commission.name.skip': 'Decidir depois',
  'commission.identity.title': 'Tome sua marca',
  'commission.identity.sub': 'Um sigilo que você pode trocar quando quiser. Um título fundador que nunca poderá re-escolher.',
  'commission.identity.sigil': 'SIGILO — ao lado do seu nome',
  'commission.identity.titles': 'TÍTULO FUNDADOR — um juramento único',
  'commission.identity.none': 'Nenhum',
  'commission.identity.oath': 'Os títulos fundadores que você recusar somem para sempre — é isso que torna o seu, seu.',
  'commission.identity.next': 'Jure ▸',
  'commission.account.title': 'Proteja seu progresso',
  'commission.account.sub': 'Seu save vive neste dispositivo. Uma conta o preserva — jogue aqui, continue em qualquer lugar.',
  'commission.account.guest': 'Continuar como convidado',
  'commission.account.create': 'Criar conta',
  'commission.account.signin': 'Já tenho uma conta',
  'commission.account.offline': 'Offline — o modo convidado funciona totalmente; crie uma conta quando quiser.',
  'commission.account.guestmode': 'Modo convidado: esta sessão não é salva — crie uma conta (ou entre) agora para manter tudo o que acabou de ganhar.',
  'commission.account.guest.hint': 'Sua colmeia fica salva neste dispositivo. Crie uma conta quando quiser pelo Perfil para levá-la a qualquer lugar.',
  'commission.account.back': '← Voltar',
  'sw.ready': 'Uma nova versão de ASSIMILATION está pronta.',
  'sw.refresh': '↻ Atualizar',
  'sw.dismiss': 'Fechar aviso de atualização',
  'liveops.title': '◉ OPERAÇÕES AO VIVO',
  'liveops.utc': 'horários em UTC',
  'liveops.endsIn': 'termina {left}',
  'liveops.startsIn': 'em {left}',
  'liveops.upNext': 'A SEGUIR',
  'spectate.title': '▶ TEATRO DE REPLAYS',
  'spectate.line': 'Onda {wave} · {kills} abates · Integridade {integrity}%',
  'spectate.claim': 'Marca: onda {wave} · {kills} abates',
  'spectate.exit': '✕ Sair',
  'spectate.pause': '⏸ Pausar',
  'spectate.resume': '▶ Retomar',
  'spectate.skip': '⤑ Resultado',
  'spectate.verified': '✓ VERIFICADO — este replay reproduz sua marca.',
  'spectate.diverged': '✗ DIVERGENTE — esta gravação não reproduz sua marca.',
  'spectate.outcome': 'Alcançou a onda {wave} com {kills} abates.',
  'daily.theater.title': 'Teatro de replays',
  'daily.theater.watch': '▶ Assistir à melhor de hoje',
  'daily.theater.share': '⧉ Copiar código',
  'daily.theater.copied': '✓ Copiado — cole onde quiser',
  'daily.theater.copying': 'Preparando replay…',
  'spectate.progress': 'Progresso do replay',
  'daily.theater.manualCopy': 'Área de transferência indisponível. Selecione e copie o replay abaixo.',
  'daily.theater.copyValue': 'Link ou código do replay',
  'daily.theater.copyFailed': 'Não foi possível preparar o replay. Tente novamente.',
  'daily.theater.empty': 'Faça uma marca diária hoje para gravar um replay compartilhável.',
  'daily.theater.paste': 'Cole um código de replay…',
  'daily.theater.watchCode': '▶ Assistir',
  'daily.theater.bad': 'Esse código não pôde ser decodificado — confira se copiou tudo.',
  'results.shareReplay': '⧉ Compartilhar replay',
  'pheno.title': 'Laboratório de Fenótipos',
  'pheno.sub': 'Expresse suas cepas — fenótipos visuais para cada torre e herói. Pura expressão: sem mudanças de stats.',
  'pheno.cultivate': '⌬ Cultivar um fenótipo',
  'pheno.owned': '{owned}/{total} expressos',
  'pheno.grown': 'Novo fenótipo expresso —',
  'pheno.default': 'Original',
  'pheno.towers': 'CEPAS DE TORRES',
  'pheno.heroes': 'CEPAS DE CAMPEÕES',
  'pheno.src.cultivate': 'cultivado no Laboratório',
  'pheno.src.contract': 'exclusivo de Contratos de Campeão',
  'pheno.src.nemesis': 'exclusivo de vingança Nêmesis',
  'pheno.bonus.tip': 'O códice de Fenótipos paga um bônus global ao completar — como toda coleção.',
};

const CATALOGS: Record<Locale, Record<MsgKey, string>> = { en: EN, es: ES, pt: PT };

// ── Screen names (docs/UI-STANDARDS.md §naming — ONE name per screen) ──
// A hub screen's ENGLISH name lives in exactly one place: the feature registry
// (state/unlocks.ts FEATURES[].name). The rail, breadcrumb, sibling chips, hub cards, advice and
// page titles all read it there (ui/navModel.ts derives its labels from it). Other locales
// translate it HERE, keyed by the screen id; a missing row falls back to the registry English, and
// navModel.test.ts asserts every locale covers every nav screen.
export const SCREEN_NAMES: Record<Exclude<Locale, 'en'>, Readonly<Record<string, string>>> = {
  es: {
    home: 'Centro de Mando', campaign: 'Campaña', infinite: 'Infinito', bossrush: 'Asalto de Jefes',
    daily: 'Reto Diario', arena: 'Campo de Pruebas', infestation: 'El Frente', quests: 'Tablón de Misiones',
    season: 'Pase de Temporada', vault: 'Bóveda Genética', towers: 'Laboratorio de Torres', heroes: 'Salón de Héroes',
    evolution: 'Cuartel de Evolución', bonds: 'Vínculos de Clase', adaptation: 'Cámara de Adaptación', genes: 'Archivo Genético',
    mulligans: 'Laboratorio Mulligan', hive: 'La Colmena', harvest: 'Producción de Colmena', expeditions: 'Mando de Expediciones',
    metabolism: 'Hitos', market: 'Mercado de Empalmes', auction: 'Casa de Subastas', equipment: 'Armería',
    gearcodex: 'Códex de Equipo', phenotypes: 'Laboratorio de Fenotipos', specimens: 'Gabinete de Especímenes',
    store: 'Tienda Premium', profile: 'Perfil del Jugador', collection: 'Bio-Dex', help: 'Ayuda', settings: 'Ajustes',
  },
  pt: {
    home: 'Centro de Comando', campaign: 'Campanha', infinite: 'Infinito', bossrush: 'Investida de Chefes',
    daily: 'Desafio Diário', arena: 'Campo de Provas', infestation: 'A Frente', quests: 'Quadro de Missões',
    season: 'Passe de Temporada', vault: 'Cofre Genético', towers: 'Laboratório de Torres', heroes: 'Salão dos Heróis',
    evolution: 'Central de Evolução', bonds: 'Vínculos de Classe', adaptation: 'Câmara de Adaptação', genes: 'Arquivo Genético',
    mulligans: 'Laboratório Mulligan', hive: 'A Colmeia', harvest: 'Produção da Colmeia', expeditions: 'Comando de Expedições',
    metabolism: 'Marcos', market: 'Mercado de Enxertos', auction: 'Casa de Leilões', equipment: 'Arsenal',
    gearcodex: 'Códex de Equipamento', phenotypes: 'Laboratório de Fenótipos', specimens: 'Gabinete de Espécimes',
    store: 'Loja Premium', profile: 'Perfil do Jogador', collection: 'Bio-Dex', help: 'Ajuda', settings: 'Opções',
  },
};

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

/** A screen's name in the CURRENT locale — `english` is the feature-registry name (the single
 *  source); other locales read SCREEN_NAMES by id and fall back to it. */
export function screenName(id: string, english: string): string {
  return current === 'en' ? english : SCREEN_NAMES[current][id] ?? english;
}
