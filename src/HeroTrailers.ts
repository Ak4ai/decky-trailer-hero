import { pickDashUrl, planClip } from './trailers';
import type { Settings } from './settings';

const LOG = '[TrailerHero]';
const MAX_CLIP_SECONDS = 30;
const CLIPS_KEPT = 4;
const RETRY_AFTER_MS = 60_000;
const FADE_MS = 800;
const TICK_MS = 500;

type SteamWindow = Window & typeof globalThis;

type Kind = 'details' | 'selection';

/** Onde um trailer pode tocar: o hero da página do jogo ou o fundo da tela de seleção (Home). */
interface Target {
  host: HTMLElement;
  appId: string;
  kind: Kind;
  delaySeconds: number;
}

interface Session {
  appId: string;
  kind: Kind;
  since: number;
  video?: HTMLVideoElement;
  /** Remove o ouvinte de visibilidade criado junto com o vídeo. */
  dispose?: () => void;
  loading?: boolean;
  retryAt?: number;
}

const steamWindows = () => (window as any).SteamUIStore?.m_WindowStore?.SteamUIWindows?.[0];

/** Janela principal do Big Picture / biblioteca (a que contém a página do jogo). */
function mainWindow(): SteamWindow | null {
  try { return steamWindows()?.m_BrowserWindow ?? null; } catch { return null; }
}

const currentPath = (): string => {
  try { return steamWindows()?.m_history?.location?.pathname ?? ''; } catch { return ''; }
};

const currentAppId = (): string | null => /^\/library\/app\/(\d+)/.exec(currentPath())?.[1] ?? null;

/**
 * O fundo da Home empilha uma imagem hero por jogo recente. A do jogo em foco é a que está visível e dentro
 * da tela; a anterior fica com `OffScreen` enquanto sai e as demais têm tamanho zero.
 */
function focusedBackgroundApp(host: Element): string | null {
  for (const img of host.querySelectorAll('img')) {
    if (!img.classList.contains('Visible') || img.classList.contains('OffScreen')) continue;
    if (!img.getBoundingClientRect().width) continue;
    const id = /\/(?:customimages|assets)\/(\d+)[_/]/.exec(img.currentSrc || img.src)?.[1];
    if (id) return id;
  }
  return null;
}

/**
 * Cuida do hero das páginas de jogo: depois de alguns segundos na página, baixa um trecho do trailer e o
 * toca por cima da imagem do hero (entre a imagem e a logo do título). Sai ao deixar a página, ao rolar o
 * hero para fora da tela ou quando a janela fica oculta.
 */
export class HeroTrailers {
  private sessions = new Map<Element, Session>();
  private clips = new Map<string, Promise<string | null>>();
  private timer?: ReturnType<typeof setInterval>;
  status = 'parado';
  /** Só para diagnóstico: trata a janela como visível mesmo oculta (o vídeo não toca, mas baixa e posiciona). */
  assumeVisible = false;

  constructor(private settings: () => Settings) {}

  start() {
    this.stop();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const session of this.sessions.values()) this.removeVideo(session, true);
    this.sessions.clear();
    for (const clip of this.clips.values()) void clip.then(url => url && URL.revokeObjectURL(url));
    this.clips.clear();
  }

  private findTargets(win: SteamWindow, settings: Settings): Target[] {
    const targets: Target[] = [];
    const routeApp = currentAppId();
    if (settings.enabled && routeApp) {
      for (const host of win.document.querySelectorAll<HTMLElement>('.TopCapsule')) {
        if (host.closest('.ExitActive')) continue; // página que está saindo da tela
        targets.push({ host, appId: routeApp, kind: 'details', delaySeconds: settings.delaySeconds });
      }
    }
    if (settings.selectionEnabled && currentPath().startsWith('/library/home')) {
      for (const host of win.document.querySelectorAll<HTMLElement>('.RecentGamesBackgroundImages')) {
        const appId = host.closest('.ExitActive') ? null : focusedBackgroundApp(host);
        if (appId) targets.push({ host, appId, kind: 'selection', delaySeconds: settings.selectionDelaySeconds });
      }
    }
    return targets;
  }

  private tick() {
    const win = mainWindow();
    const settings = this.settings();
    if (!win?.document) { this.status = 'janela da Steam indisponível'; return; }
    if (!this.assumeVisible && win.document.visibilityState !== 'visible') {
      // Janela oculta: nenhum elemento de mídia fica vivo e o DOM dela não é consultado. Vídeos que só ficavam
      // pausados coincidiram com o travamento do processo principal da Steam (ver README).
      for (const session of this.sessions.values()) this.resetSession(session);
      this.status = 'janela oculta';
      return;
    }
    const targets = new Map<Element, Target>(this.findTargets(win, settings).map(target => [target.host, target]));

    for (const [host, session] of this.sessions) {
      const target = targets.get(host);
      if (!target || !host.isConnected || target.appId !== session.appId || target.kind !== session.kind) {
        this.removeVideo(session, !host.isConnected);
        this.sessions.delete(host);
      }
    }
    if (!targets.size) { this.status = settings.enabled || settings.selectionEnabled ? 'fora de página de jogo ou seleção' : 'desativado'; return; }

    for (const target of targets.values()) {
      let session = this.sessions.get(target.host);
      if (!session) { session = { appId: target.appId, kind: target.kind, since: Date.now() }; this.sessions.set(target.host, session); }
      this.update(win, target, session, settings);
    }
  }

  private update(win: SteamWindow, target: Target, session: Session, settings: Settings) {
    const rect = target.host.getBoundingClientRect();
    const visible = (this.assumeVisible || win.document.visibilityState === 'visible') && rect.height > 0 && rect.bottom > 160 && rect.top < win.innerHeight;
    if (session.video && !session.video.isConnected) session.video = undefined; // a Steam refez a lista
    const video = session.video;
    const label = `${session.kind === 'selection' ? 'seleção' : 'página'} ${session.appId}`;
    if (video) {
      if (!visible) { this.resetSession(session); this.status = `fora da tela (${label})`; return; }
      video.muted = !settings.sound;
      if (video.paused) void video.play().catch(() => {});
      this.status = `tocando (${label})`;
      return;
    }
    if (!visible || session.loading) return;
    if (session.retryAt && Date.now() < session.retryAt) return;
    if (Date.now() - session.since < target.delaySeconds * 1000) { this.status = `aguardando (${label})`; return; }
    session.loading = true;
    this.status = `baixando trailer (${label})`;
    void this.clip(win, session.appId).then(url => {
      session.loading = false;
      if (this.sessions.get(target.host) !== session || !target.host.isConnected) return;
      if (!this.assumeVisible && win.document.visibilityState !== 'visible') return; // ocultou durante o download
      if (!url) { session.retryAt = Date.now() + RETRY_AFTER_MS; this.status = `sem trailer (${label})`; return; }
      this.attach(win, target, session, url);
    });
  }

  private attach(win: SteamWindow, target: Target, session: Session, url: string) {
    const art = target.kind === 'details' ? target.host.querySelector('.ImgContainer') : null;
    if (target.kind === 'details' && !art?.parentElement) { session.retryAt = Date.now() + RETRY_AFTER_MS; console.warn(LOG, 'hero não encontrado na página'); return; }
    const video = win.document.createElement('video');
    video.dataset.trailerHero = session.appId;
    video.dataset.trailerKind = target.kind;
    video.muted = !this.settings().sound;
    video.loop = true;
    video.playsInline = true;
    video.disablePictureInPicture = true;
    video.setAttribute('aria-hidden', 'true');
    const position = target.kind === 'selection' ? 'center 35%' : 'center top';
    video.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${position};opacity:0;pointer-events:none;transition:opacity ${FADE_MS}ms ease`;
    video.addEventListener('playing', () => { video.style.opacity = '1'; }, { once: true });
    video.addEventListener('error', () => { session.retryAt = Date.now() + RETRY_AFTER_MS; this.removeVideo(session, true); });
    // Ao ocultar a janela o vídeo é destruído na hora, sem esperar o próximo ciclo do plugin.
    const onVisibility = () => { if (win.document.visibilityState !== 'visible') this.resetSession(session); };
    win.document.addEventListener('visibilitychange', onVisibility);
    session.dispose = () => win.document.removeEventListener('visibilitychange', onVisibility);
    video.src = url;
    if (art) art.after(video); else target.host.appendChild(video); // seleção: por cima das imagens, abaixo do resto da Home
    session.video = video;
    void video.play().catch(error => console.warn(LOG, 'play() recusado', error));
  }

  /** Tira o vídeo e recomeça a contagem de espera: ao voltar, o trailer só entra depois do atraso normal. */
  private resetSession(session: Session) {
    this.removeVideo(session, true);
    session.since = Date.now();
    session.retryAt = undefined;
  }

  private removeVideo(session: Session, immediate: boolean) {
    session.dispose?.();
    session.dispose = undefined;
    const video = session.video;
    session.video = undefined;
    if (!video) return;
    video.pause();
    const drop = () => { video.removeAttribute('src'); video.load(); video.remove(); };
    if (immediate) { drop(); return; }
    video.style.opacity = '0';
    setTimeout(drop, FADE_MS);
  }

  /** URL (blob:) de um trecho MP4 do trailer, ou null quando o jogo não tem. Fica em cache por jogo. */
  private clip(win: SteamWindow, appId: string): Promise<string | null> {
    const known = this.clips.get(appId);
    if (known) return known;
    const request = this.download(win, appId).catch(error => {
      console.warn(LOG, 'falha ao obter trailer', appId, error);
      this.clips.delete(appId);
      return null;
    });
    this.clips.set(appId, request);
    while (this.clips.size > CLIPS_KEPT) {
      const [oldest, clip] = this.clips.entries().next().value!;
      this.clips.delete(oldest);
      void clip.then(url => url && URL.revokeObjectURL(url));
    }
    return request;
  }

  private async download(win: SteamWindow, appId: string): Promise<string | null> {
    // Tudo roda no contexto da janela da Steam: é ela que enxerga a loja e o CDN sem bloqueio.
    const get = (url: string) => win.fetch(url).then(response => {
      if (!response.ok) throw new Error(`${response.status} em ${url}`);
      return response;
    });
    const details = await (await get(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=movies`)).json();
    const mpdUrl = pickDashUrl(details, appId);
    if (!mpdUrl) return null;
    const plan = planClip(mpdUrl, await (await get(mpdUrl)).text(), MAX_CLIP_SECONDS);
    if (!plan) return null;
    const parts = await Promise.all([plan.init, ...plan.chunks].map(async url => (await get(url)).arrayBuffer()));
    return win.URL.createObjectURL(new win.Blob(parts, { type: 'video/mp4' }));
  }
}
