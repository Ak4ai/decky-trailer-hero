// Lógica pura do trailer: achar o vídeo na API da loja e montar a lista de pedaços DASH.
// O CDN da Steam só publica vídeo segmentado (fMP4 em pedaços de ~3 s). Como o trailer toca mudo,
// "init + pedaços" concatenados formam um MP4 comum que o <video> reproduz sem hls.js nem MSE.

export interface ClipPlan {
  init: string;
  chunks: string[];
  seconds: number;
}

const isSteamCdn = (url: string) => {
  const match = /^https:\/\/([^/@]+)\//.exec(url);
  return !!match && match[1].endsWith('.steamstatic.com');
};

/** Manifesto DASH H.264 do primeiro trailer do jogo, ou null. */
export function pickDashUrl(body: any, appId: string): string | null {
  const movies = body?.[appId]?.data?.movies;
  if (!Array.isArray(movies)) return null;
  for (const movie of movies) {
    const url = movie?.dash_h264;
    if (typeof url === 'string' && isSteamCdn(url) && url.includes('.mpd')) return url;
  }
  return null;
}

/** "PT1M45.6S" -> 105.6 */
export function parseDuration(value: string | undefined): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(value ?? '');
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

const attr = (source: string, name: string) => new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(source)?.[1];

/** Primeira variante de vídeo do manifesto, limitada a `maxSeconds` de duração. */
export function planClip(mpdUrl: string, mpd: string, maxSeconds: number): ClipPlan | null {
  if (!isSteamCdn(mpdUrl)) return null;
  const set = /<AdaptationSet\b[^>]*contentType="video"[^>]*>([\s\S]*?)<\/AdaptationSet>/.exec(mpd)?.[1];
  const rep = set && /<Representation\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/Representation>/.exec(set);
  const template = rep && /<SegmentTemplate\b[^>]*>/.exec(rep[2])?.[0];
  if (!rep || !template) return null;
  const initPattern = attr(template, 'initialization');
  const mediaPattern = attr(template, 'media');
  const timescale = Number(attr(template, 'timescale') ?? 1);
  const segmentSeconds = Number(attr(template, 'duration') ?? 0) / timescale;
  const start = Number(attr(template, 'startNumber') ?? 1);
  const total = parseDuration(attr(mpd, 'mediaPresentationDuration'));
  if (!initPattern || !mediaPattern || !(segmentSeconds > 0) || !(total > 0)) return null;
  const count = Math.max(1, Math.ceil(Math.min(total, maxSeconds) / segmentSeconds));
  const base = mpdUrl.split('?')[0].replace(/[^/]*$/, '');
  const fill = (pattern: string, number?: number) => base + pattern
    .replace(/\$RepresentationID\$/g, rep[1])
    .replace(/\$Number(?:%0(\d+)d)?\$/g, (_all, width) => String(number ?? 0).padStart(Number(width ?? 0), '0'));
  return {
    init: fill(initPattern),
    chunks: Array.from({ length: count }, (_unused, index) => fill(mediaPattern, start + index)),
    seconds: Math.min(total, count * segmentSeconds),
  };
}
