import { appIdFromImageSrc, logoCandidates } from './logos';
import type { Settings } from './settings';

const TICK_MS = 120;
const LOAD_TIMEOUT_MS = 8000;
/** Falha curta: logo que a Steam ainda não tinha pronta (ex.: logo da biblioteca baixando) é tentada de novo logo. */
const NOT_FOUND_RETRY_MS = 8_000;
const FADE_MS = 150;
const FADE_OUT_MS = 120;
/** O texto conta como centralizado no card quando o centro dele cai a menos disto do centro do card. */
const CENTERED_TOLERANCE_PX = 6;
const STYLE_ID = 'trailer-hero-logo-style';
const HIDDEN_CLASS = 'trailer-hero-name-hidden';

const STORE_KEY = 'trailer-hero:logos';
const STORE_MAX = 60;
const STORE_REFRESH_MS = 7 * 24 * 3600_000;
/** Cópia guardada em disco: no máximo esta altura (a logo na tela passa de 200 px só com zoom extremo). */
const STORE_HEIGHT_PX = 200;

type Stored = Record<string, { data: string; at: number }>;

function loadStored(): Stored {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') ?? {}; } catch { return {}; }
}

type SteamWindow = Window & typeof globalThis;

interface Swap {
  appId: string;
  message: HTMLElement;
  /** Contêiner onde a logo mora: acima da grade de tiles, que corta tudo que passa do seu topo. */
  layer: HTMLElement;
  img: HTMLImageElement;
}

/** Endereços que a própria Steam usa para a logo (inclui o hash do arquivo, que não dá para deduzir do appid). */
function steamLogoUrls(appId: string): string[] {
  try {
    const found: string[] = (window as any).appDetailsStore?.GetLogoImagesForAppId?.(Number(appId))?.rgLogoImages ?? [];
    return found.map(url => url.startsWith('/') ? `https://steamloopback.host${url}` : url);
  } catch { return []; }
}

const steamWindows = () => (window as any).SteamUIStore?.m_WindowStore?.SteamUIWindows?.[0];
const mainWindow = (): SteamWindow | null => { try { return steamWindows()?.m_BrowserWindow ?? null; } catch { return null; } };
const currentPath = (): string => { try { return steamWindows()?.m_history?.location?.pathname ?? ''; } catch { return ''; } };

/** O bloco de texto de cada tile fica dentro dele: o appid vem da primeira imagem (capa) que o envolve. */
function tileAppId(message: Element): string | null {
  let node: Element | null = message;
  for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
    const img = node.querySelector('img');
    if (img) return appIdFromImageSrc(img.currentSrc || img.src);
  }
  return null;
}

/** Duas sombras pretas sobrepostas (uma curta, uma larga) seguem o contorno da logo; `strength` vai de 0 a 100. */
function shadowFilter(strength: number): string {
  if (strength <= 0) return 'none';
  const alpha = (0.4 + strength / 100 * 0.6).toFixed(2);
  return `drop-shadow(0 0 ${(6 + strength * 0.14).toFixed(1)}px rgba(0,0,0,${alpha})) drop-shadow(0 0 ${(14 + strength * 0.4).toFixed(1)}px rgba(0,0,0,${alpha}))`;
}

/**
 * Borda esquerda (na tela) do primeiro card, mesmo com a grade rolada ou o primeiro card fora da lista renderizada:
 * os cards estão a uma distância fixa um do outro, então o recuo do primeiro é o resto da posição de qualquer card
 * pela distância entre eles.
 */
function firstCardLeft(message: Element): number | null {
  const grid = message.closest('.ReactVirtualized__Grid');
  if (!grid) return null;
  const gridLeft = grid.getBoundingClientRect().left;
  const xs = [...grid.querySelectorAll('.BasicGameCarouselItem')]
    .map(card => Math.round(card.getBoundingClientRect().left - gridLeft + grid.scrollLeft))
    .sort((a, b) => a - b);
  const pitch = Math.min(...xs.slice(1).map((x, i) => x - xs[i]).filter(gap => gap > 20));
  if (!xs.length) return null;
  const pad = Number.isFinite(pitch) ? ((xs[0] % pitch) + pitch) % pitch : xs[0];
  // O texto fica uns pixels fora da borda do card dele; o mesmo recuo vale para o primeiro.
  const own = message.closest('.BasicGameCarouselItem');
  const inset = own ? message.getBoundingClientRect().left - own.getBoundingClientRect().left : 0;
  return gridLeft + pad + inset;
}

/**
 * Na tela de seleção (Home), troca o nome do jogo em foco pela logo dele. O nome é só escondido: se o jogo não tem
 * logo, ou a logo não carrega, o texto continua lá. A Steam mostra o bloco de texto apenas do tile em foco
 * (os demais ficam com `visibility:hidden`), então basta tratar os blocos visíveis.
 *
 * A grade de tiles tem `overflow:hidden`, então a logo não vive nela: fica no contêiner da seção, acima da grade, e
 * acompanha a posição do bloco de texto a cada quadro (a grade rola enquanto o foco anda).
 */
export class NameLogos {
  private swaps = new Map<Element, Swap>();
  /** Resultado por jogo: a imagem já carregada (reaproveitada na tela, o servidor local leva ~0,5 s por arquivo) ou null. */
  private logos = new Map<string, { img: HTMLImageElement | null; at: number }>();
  private loading = new Set<string>();
  /** Logos guardadas entre sessões (data URLs): aparecem na hora, sem esperar o servidor local da Steam. */
  private stored = loadStored();
  private refreshing = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private frame = 0;
  status = 'parado';

  constructor(private settings: () => Settings) {}

  start() {
    this.stop();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.restoreAll();
    mainWindow()?.document.getElementById(STYLE_ID)?.remove();
  }

  /** Devolve o texto na hora e some com a logo; sem `fade` ela sai de uma vez (desligar, parar, janela oculta). */
  private restore(message: Element, fade = false) {
    const swap = this.swaps.get(message);
    if (!swap) return;
    if (fade) {
      const { img } = swap;
      img.style.transition = `opacity ${FADE_OUT_MS}ms ease`;
      img.style.opacity = '0';
      img.dataset.leaving = '1';
      // A mesma imagem pode voltar à tela antes do fim do fade (foco indo e voltando): aí ela fica.
      setTimeout(() => { if (img.dataset.leaving) img.remove(); }, FADE_OUT_MS + 30);
    } else swap.img.remove();
    swap.message.classList.remove(HIDDEN_CLASS);
    this.swaps.delete(message);
  }

  private restoreAll() {
    for (const message of [...this.swaps.keys()]) this.restore(message);
  }

  private tick() {
    const win = mainWindow();
    const settings = this.settings();
    if (!win?.document) { this.status = 'janela da Steam indisponível'; return; }
    // Janela oculta ou fora da Home: nada de consultas ao DOM da Steam.
    if (win.document.visibilityState !== 'visible' || !currentPath().startsWith('/library/home')) {
      this.restoreAll();
      this.status = 'inativo';
      return;
    }
    this.syncStyle(win, settings);
    if (!settings.selectionLogo) { this.restoreAll(); this.status = 'logo desativada'; return; }

    const seen = new Set<Element>();
    for (const message of win.document.querySelectorAll('.Message')) {
      if (!message.querySelector('.Content') || message.closest('.ExitActive')) continue;
      const appId = tileAppId(message);
      if (!appId) continue;
      this.fromStore(win, appId);
      if (win.getComputedStyle(message).visibility !== 'visible') { this.prefetch(win, appId); continue; }
      seen.add(message);
      const swap = this.swaps.get(message);
      if (swap && swap.appId === appId && swap.img.isConnected) continue;
      if (swap) this.restore(message, true); // a Steam reaproveitou o bloco para outro jogo ou o refez
      const loaded = this.logos.get(appId)?.img;
      if (loaded) this.apply(win, message as HTMLElement, appId, loaded); else this.prefetch(win, appId);
    }
    for (const message of [...this.swaps.keys()]) if (!seen.has(message)) this.restore(message, true);
    this.status = this.swaps.size ? `logo em ${[...this.swaps.values()].map(swap => swap.appId).join(', ')}` : 'sem logo em foco';
  }

  /** Regras que dependem das opções: o subtítulo ("Últimas duas semanas…") some sob demanda. */
  private syncStyle(win: SteamWindow, settings: Settings) {
    let style = win.document.getElementById(STYLE_ID);
    if (!style) {
      style = win.document.createElement('style');
      style.id = STYLE_ID;
      win.document.head.appendChild(style);
    }
    const css = `.${HIDDEN_CLASS}{opacity:0 !important}${settings.hideLastPlayed ? '.CarouselGameLabel .SubMessage{opacity:0 !important}' : ''}`;
    if (style.textContent !== css) style.textContent = css;
  }

  /** Descobre a logo dos tiles antes de receberem o foco, para a troca ser imediata. */
  private prefetch(win: SteamWindow, appId: string) {
    if (this.loading.has(appId) || this.known(appId)) return;
    this.loading.add(appId);
    void this.resolve(win, appId).finally(() => this.loading.delete(appId));
  }

  private apply(win: SteamWindow, message: HTMLElement, appId: string, loaded: HTMLImageElement) {
    const layer = message.closest<HTMLElement>('.RecentGamesContainer') ?? message.parentElement;
    if (!layer) return;

    // Reaproveita a imagem já carregada; se outro bloco já a usa, leva uma cópia.
    const inUse = [...this.swaps.values()].some(swap => swap.img === loaded);
    const img = inUse ? loaded.cloneNode() as HTMLImageElement : loaded;
    img.alt = '';
    img.draggable = false;
    delete img.dataset.leaving;
    img.style.cssText = `position:absolute;left:0;top:0;width:auto;height:auto;object-fit:contain;object-position:left bottom;opacity:0;pointer-events:none;z-index:10;transition:opacity ${FADE_MS}ms ease`;
    if (win.getComputedStyle(layer).position === 'static') layer.style.position = 'relative';
    layer.appendChild(img);
    message.classList.add(HIDDEN_CLASS);
    this.swaps.set(message, { appId, message, layer, img });
    this.place();
    win.requestAnimationFrame(() => { img.style.opacity = '1'; });
    if (!this.frame) this.frame = win.requestAnimationFrame(() => this.follow(win));
  }

  /** Mantém cada logo em cima do bloco de texto dela enquanto a grade rola. */
  private follow(win: SteamWindow) {
    this.frame = 0;
    if (!this.swaps.size) return;
    this.place();
    this.frame = win.requestAnimationFrame(() => this.follow(win));
  }

  private place() {
    const settings = this.settings();
    for (const swap of this.swaps.values()) {
      // Foco saiu do jogo (ou o bloco foi refeito): a logo antiga sai ali mesmo, sem acompanhar o bloco que se afasta.
      if (!swap.message.isConnected || swap.message.closest('.ExitActive') || getComputedStyle(swap.message).visibility !== 'visible') {
        this.restore(swap.message, true);
        continue;
      }
      const text = swap.message.getBoundingClientRect();
      const layer = swap.layer.getBoundingClientRect();
      // Com o subtítulo à mostra a logo termina no nome; sem ele, desce até o fim do bloco.
      const bottom = settings.hideLastPlayed ? (swap.message.parentElement ?? swap.message).getBoundingClientRect().bottom : text.bottom;
      const { style } = swap.img;
      style.filter = shadowFilter(settings.logoShadow);
      style.maxHeight = `${settings.logoHeight}px`;
      style.maxWidth = `${settings.logoHeight * 4}px`;
      let left = settings.logoFixedLeft ? firstCardLeft(swap.message) ?? text.left : text.left;
      // Temas que centralizam o texto do jogo (ex.: "Centered game text", do CSS Loader): a logo centraliza também.
      const media = swap.message.closest('.BasicGameCarouselItemMediaContainer')?.getBoundingClientRect();
      if (!settings.logoFixedLeft && media && Math.abs(text.left + text.width / 2 - (media.left + media.width / 2)) < CENTERED_TOLERANCE_PX) {
        left = media.left + media.width / 2 - swap.img.getBoundingClientRect().width / 2;
      }
      style.left = `${left + settings.logoOffsetX - layer.left}px`;
      style.top = `${bottom + settings.logoOffsetY - layer.top}px`;
      style.transform = 'translateY(-100%)';
    }
  }

  private known(appId: string): boolean {
    const known = this.logos.get(appId);
    return !!known && (!!known.img || Date.now() - known.at < NOT_FOUND_RETRY_MS);
  }

  /** Imagem da primeira logo que carrega para o jogo, ou null. O resultado (inclusive "não tem") fica em cache. */
  private async resolve(win: SteamWindow, appId: string): Promise<HTMLImageElement | null> {
    if (this.known(appId)) return this.logos.get(appId)!.img;
    const found = await this.fetchLogo(win, appId);
    this.logos.set(appId, { img: found, at: Date.now() });
    if (found) this.save(win, appId, found);
    return found;
  }

  /** Imagem da primeira logo que carrega, tentando os endereços um de cada vez: o servidor local da Steam deixa de responder quando recebe vários pedidos juntos. */
  private async fetchLogo(win: SteamWindow, appId: string): Promise<HTMLImageElement | null> {
    for (const url of [...steamLogoUrls(appId), ...logoCandidates(appId)]) {
      const img = await this.loads(win, url);
      if (img) return img;
    }
    return null;
  }

  /** Usa a cópia guardada, se houver e ainda não houver imagem em memória; cópia velha é renovada em segundo plano. */
  private fromStore(win: SteamWindow, appId: string) {
    const saved = this.stored[appId];
    if (!saved || this.logos.get(appId)?.img) return;
    const img = new win.Image();
    img.src = saved.data;
    this.logos.set(appId, { img, at: Date.now() });
    if (Date.now() - saved.at > STORE_REFRESH_MS && !this.refreshing.has(appId)) {
      this.refreshing.add(appId);
      void this.fetchLogo(win, appId).then(fresh => {
        if (fresh) { this.logos.set(appId, { img: fresh, at: Date.now() }); this.save(win, appId, fresh); }
      }).finally(() => this.refreshing.delete(appId));
    }
  }

  private save(win: SteamWindow, appId: string, img: HTMLImageElement) {
    try {
      const scale = Math.min(1, STORE_HEIGHT_PX / img.naturalHeight);
      const canvas = win.document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL('image/webp', 0.92);
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/png');
      this.stored[appId] = { data, at: Date.now() };
      const oldest = Object.keys(this.stored).sort((a, b) => this.stored[a].at - this.stored[b].at);
      for (const key of oldest.slice(0, Math.max(0, oldest.length - STORE_MAX))) delete this.stored[key];
      localStorage.setItem(STORE_KEY, JSON.stringify(this.stored));
    } catch { /* imagem de outra origem (canvas bloqueado) ou sem armazenamento: só não guarda */ }
  }

  private loads(win: SteamWindow, url: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
      const probe = new win.Image();
      const timer = setTimeout(() => { probe.src = ''; resolve(null); }, LOAD_TIMEOUT_MS);
      probe.onload = () => { clearTimeout(timer); resolve(probe.naturalWidth > 0 ? probe : null); };
      probe.onerror = () => { clearTimeout(timer); resolve(null); };
      probe.src = url;
    });
  }
}
