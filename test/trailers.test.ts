import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, pickDashUrl, planClip } from '../src/trailers.ts';

const MPD = `<?xml version='1.0'?><MPD mediaPresentationDuration="PT1M45.6S" maxSegmentDuration="PT3.0S"><Period>
<AdaptationSet id="0" contentType="video"><Representation id="0" mimeType="video/mp4" width="940">
<SegmentTemplate timescale="1000000" duration="3000000" initialization="dash_h264/init-stream$RepresentationID$.m4s" media="dash_h264/chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1"></SegmentTemplate></Representation>
<Representation id="1" width="640"><SegmentTemplate timescale="1000000" duration="3000000" initialization="x" media="y" startNumber="1"></SegmentTemplate></Representation></AdaptationSet>
<AdaptationSet id="1" contentType="audio"><Representation id="3"><SegmentTemplate timescale="1000000" duration="3000000" initialization="a" media="b" startNumber="1"></SegmentTemplate></Representation></AdaptationSet>
</Period></MPD>`;
const URL = 'https://video.akamai.steamstatic.com/store_trailers/620/3746/abc/1750108721/dash_h264.mpd?t=1';

test('duração ISO 8601', () => {
  assert.equal(parseDuration('PT1M45.6S'), 105.6);
  assert.equal(parseDuration('PT3.0S'), 3);
  assert.equal(parseDuration('PT1H0M1S'), 3601);
  assert.equal(parseDuration('lixo'), 0);
});

test('escolhe o primeiro manifesto DASH em domínio da Steam', () => {
  const body = { 620: { data: { movies: [
    { dash_h264: 'https://evil.example.com/a.mpd' },
    { dash_h264: 'https://steamstatic.com.evil.io/a.mpd' },
    { hls_h264: 'https://video.akamai.steamstatic.com/h.m3u8' },
    { dash_h264: URL },
  ] } } };
  assert.equal(pickDashUrl(body, '620'), URL);
  assert.equal(pickDashUrl({ 7: { success: false } }, '7'), null);
  assert.equal(pickDashUrl({ 7: { data: [] } }, '7'), null);
});

test('monta init + pedaços da primeira variante de vídeo, limitando a duração', () => {
  const plan = planClip(URL, MPD, 30)!;
  const base = 'https://video.akamai.steamstatic.com/store_trailers/620/3746/abc/1750108721/dash_h264/';
  assert.equal(plan.init, base + 'init-stream0.m4s');
  assert.equal(plan.chunks.length, 10);
  assert.equal(plan.chunks[0], base + 'chunk-stream0-00001.m4s');
  assert.equal(plan.chunks[9], base + 'chunk-stream0-00010.m4s');
  assert.equal(plan.seconds, 30);
});

test('trailer curto não pede pedaços além do fim', () => {
  const short = MPD.replace('PT1M45.6S', 'PT7S');
  const plan = planClip(URL, short, 30)!;
  assert.equal(plan.chunks.length, 3);
  assert.equal(plan.seconds, 7);
});

test('recusa manifesto fora da Steam ou malformado', () => {
  assert.equal(planClip('https://evil.example.com/dash.mpd', MPD, 30), null);
  assert.equal(planClip(URL, '<MPD></MPD>', 30), null);
});
