export interface Settings {
  /** Trailer no hero da página do jogo. */
  enabled: boolean;
  /** Segundos parado na página do jogo antes de o trailer entrar. */
  delaySeconds: number;
  /** Trailer no fundo da tela de seleção de jogos (Home da biblioteca). */
  selectionEnabled: boolean;
  /** Segundos com o mesmo jogo em foco na seleção antes de o trailer entrar. */
  selectionDelaySeconds: number;
  /** Logo do jogo no lugar do nome, na tela de seleção. */
  selectionLogo: boolean;
  /** Logo fixa no canto esquerdo, alinhada ao primeiro card, em vez de sobre o card em foco. */
  logoFixedLeft: boolean;
  /** Ajuste fino da posição da logo, em pixels (positivo = para a direita / para baixo). */
  logoOffsetX: number;
  logoOffsetY: number;
  /** Sombra preta difusa atrás da logo, de 0 (sem sombra) a 100. */
  logoShadow: number;
  /** Altura da logo em pixels. */
  logoHeight: number;
  /** Esconde o "Últimas duas semanas…" sob o nome do jogo em foco. */
  hideLastPlayed: boolean;
  sound: boolean;
}

const KEY = 'trailer-hero:settings';
const DEFAULTS: Settings = { enabled: true, delaySeconds: 4, selectionEnabled: true, selectionDelaySeconds: 8, selectionLogo: true, logoFixedLeft: false, logoOffsetX: 0, logoOffsetY: 0, logoShadow: 0, logoHeight: 80, hideLastPlayed: false, sound: false };

const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const seconds = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(30, Math.max(1, value)) : fallback;

const pixels = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(200, Math.max(30, value)) : fallback;

const offset = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.min(300, Math.max(-300, Math.round(value))) : 0;

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      enabled: flag(saved.enabled, DEFAULTS.enabled),
      delaySeconds: seconds(saved.delaySeconds, DEFAULTS.delaySeconds),
      selectionEnabled: flag(saved.selectionEnabled, DEFAULTS.selectionEnabled),
      selectionDelaySeconds: seconds(saved.selectionDelaySeconds, DEFAULTS.selectionDelaySeconds),
      selectionLogo: flag(saved.selectionLogo, DEFAULTS.selectionLogo),
      logoFixedLeft: flag(saved.logoFixedLeft, DEFAULTS.logoFixedLeft),
      logoOffsetX: offset(saved.logoOffsetX),
      logoOffsetY: offset(saved.logoOffsetY),
      logoShadow: typeof saved.logoShadow === 'number' && Number.isFinite(saved.logoShadow) ? Math.min(100, Math.max(0, Math.round(saved.logoShadow))) : DEFAULTS.logoShadow,
      logoHeight: pixels(saved.logoHeight, DEFAULTS.logoHeight),
      hideLastPlayed: flag(saved.hideLastPlayed, DEFAULTS.hideLastPlayed),
      sound: flag(saved.sound, DEFAULTS.sound),
    };
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(settings: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* sem armazenamento: vale só nesta sessão */ }
}
