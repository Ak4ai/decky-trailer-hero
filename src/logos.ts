// Lógica pura da logo no lugar do nome do jogo (tela de seleção).

/** appid de uma imagem da Steam: `/assets/<id>/...`, `/customimages/<id>...` ou `/apps/<id>/...` (CDN). */
export function appIdFromImageSrc(src: string): string | null {
  return /\/(?:assets|customimages|apps)\/(\d+)p?(?:[/_.]|$)/.exec(src)?.[1] ?? null;
}

const LOOPBACK = 'https://steamloopback.host';

/**
 * Endereços onde a logo de um jogo pode estar, do mais confiável ao menos. Os locais (steamloopback.host) cobrem
 * logos personalizadas e o cache da biblioteca, inclusive de jogos fora da Steam; o CDN é o último recurso.
 */
export function logoCandidates(appId: string): string[] {
  if (!/^\d+$/.test(appId)) return [];
  return [
    `${LOOPBACK}/customimages/${appId}_logo.png`,
    `${LOOPBACK}/assets/${appId}/logo.png`,
    `${LOOPBACK}/assets/${appId}/library_logo.png`,
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/logo.png`,
  ];
}
