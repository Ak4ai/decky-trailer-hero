import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appIdFromImageSrc, logoCandidates } from '../src/logos.ts';

test('appid vem de imagens locais e do CDN', () => {
  assert.equal(appIdFromImageSrc('https://steamloopback.host/assets/1985820/library_600x900.jpg?c=837834888'), '1985820');
  assert.equal(appIdFromImageSrc('https://steamloopback.host/customimages/105600_hero.jpg?v=1790909688'), '105600');
  assert.equal(appIdFromImageSrc('https://steamloopback.host/customimages/105600p.png'), '105600');
  assert.equal(appIdFromImageSrc('https://steamloopback.host/customimages/105600px.png'), null);
  assert.equal(appIdFromImageSrc('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/logo.png'), '620');
  assert.equal(appIdFromImageSrc('https://steamloopback.host/custom_fonts/clientui.uifont'), null);
});

test('candidatos de logo: locais primeiro, CDN por último', () => {
  const urls = logoCandidates('105600');
  assert.equal(urls[0], 'https://steamloopback.host/customimages/105600_logo.png');
  assert.ok(urls.at(-1)!.startsWith('https://shared.fastly.steamstatic.com/'));
  assert.equal(new Set(urls).size, urls.length);
});

test('appid inválido não gera endereços', () => {
  assert.deepEqual(logoCandidates('../etc'), []);
  assert.deepEqual(logoCandidates(''), []);
});
