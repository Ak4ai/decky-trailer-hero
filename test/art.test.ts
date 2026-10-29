import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteUrl, recentApps, trimOldest, uniqueUrls } from '../src/art.ts';

test('jogos recentes: jogados primeiro, do mais novo ao mais antigo; o resto depois, na ordem da Steam', () => {
  const apps = [
    { appid: 1 },
    { appid: 2, rt_last_time_played: 100 },
    { appid: 3, rt_last_time_played: 300 },
    { appid: 4, rt_last_time_played: 0 },
    { appid: 5, rt_last_time_played: 200 },
  ];
  assert.deepEqual(recentApps(apps, 10).map(app => app.appid), [3, 5, 2, 1, 4]);
  assert.deepEqual(recentApps(apps, 2).map(app => app.appid), [3, 5]);
  assert.deepEqual(recentApps(apps, 0), []);
  assert.deepEqual(apps.map(app => app.appid), [1, 2, 3, 4, 5], 'não reordena a lista da Steam');
});

test('endereços relativos viram completos; vazios e outros tipos saem', () => {
  assert.equal(absoluteUrl('/assets/1/library_hero.jpg'), 'https://steamloopback.host/assets/1/library_hero.jpg');
  assert.equal(absoluteUrl('https://steamloopback.host/customimages/1p.png?v=2'), 'https://steamloopback.host/customimages/1p.png?v=2');
  assert.equal(absoluteUrl(''), null);
  assert.equal(absoluteUrl(undefined), null);
  assert.equal(absoluteUrl(42), null);
});

test('lista de endereços: ordem mantida, sem repetidos nem vazios, aceita listas ausentes', () => {
  assert.deepEqual(
    uniqueUrls(['/a.png', '/b.png'], undefined, [null, '/a.png', 'https://x/c.png']),
    ['https://steamloopback.host/a.png', 'https://steamloopback.host/b.png', 'https://x/c.png'],
  );
  assert.deepEqual(uniqueUrls(), []);
});

test('trimOldest descarta as mais antigas primeiro', () => {
  const map = new Map([['a', 1], ['b', 2], ['c', 3]]);
  trimOldest(map, 2);
  assert.deepEqual([...map.keys()], ['b', 'c']);
  trimOldest(map, 0);
  assert.equal(map.size, 0);
});
