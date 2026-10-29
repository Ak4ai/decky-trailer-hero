// Lógica pura da pré-carga das artes da biblioteca (sem tocar na Steam, para poder testar).

export interface AppLike {
  appid: number;
  rt_last_time_played?: number;
}

/** Os `limit` jogos jogados mais recentemente; quem nunca foi jogado entra depois, na ordem em que a Steam listou. */
export function recentApps<T extends AppLike>(apps: readonly T[], limit: number): T[] {
  const played = apps.filter(app => (app.rt_last_time_played ?? 0) > 0)
    .sort((a, b) => (b.rt_last_time_played ?? 0) - (a.rt_last_time_played ?? 0));
  const rest = apps.filter(app => !((app.rt_last_time_played ?? 0) > 0));
  return [...played, ...rest].slice(0, Math.max(0, limit));
}

/** A Steam devolve alguns caminhos relativos (`/assets/...`); o carregamento precisa do endereço completo. */
export function absoluteUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  return url.startsWith('/') ? `https://steamloopback.host${url}` : url;
}

/** Junta listas de endereços na ordem dada, sem vazios nem repetidos. */
export function uniqueUrls(...lists: ReadonlyArray<ReadonlyArray<unknown> | undefined>): string[] {
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list ?? []) {
      const url = absoluteUrl(item);
      if (url) seen.add(url);
    }
  }
  return [...seen];
}

/** Mantém no máximo `max` entradas, descartando as mais antigas (a ordem do Map é a de inserção). */
export function trimOldest<K, V>(map: Map<K, V>, max: number) {
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done) return;
    map.delete(oldest.value);
  }
}
