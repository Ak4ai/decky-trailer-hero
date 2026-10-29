// Lógica pura da logo no lugar do nome do jogo (tela de seleção).

/** appid de uma imagem da Steam: `/assets/<id>/...`, `/customimages/<id>...` ou `/apps/<id>/...` (CDN). */
export function appIdFromImageSrc(src: string): string | null {
  return /\/(?:assets|customimages|apps)\/(\d+)p?(?:[/_.]|$)/.exec(src)?.[1] ?? null;
}

/**
 * Muda quando a arte do jogo muda (logo trocada pelo SteamGridDB, atualização da loja, cache novo da biblioteca).
 * É a mesma data que a Steam põe no `?v=` dos endereços, então serve para saber se uma logo guardada ficou velha.
 */
export function versionKey(overview: { rt_custom_image_mtime?: number; rt_store_asset_mtime?: number; local_cache_version?: number } | null | undefined): string {
  if (!overview) return '';
  return `${overview.rt_custom_image_mtime ?? 0}|${overview.rt_store_asset_mtime ?? 0}|${overview.local_cache_version ?? 0}`;
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
