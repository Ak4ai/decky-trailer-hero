# Trailer Hero

Plugin do Decky Loader que toca o trailer do jogo (mudo, em loop) em dois lugares da biblioteca (Big Picture):

- **Página do jogo**: no lugar do hero, depois de 4 s (ajustável).
- **Seleção de jogos** (Home): no fundo, para o jogo em foco, depois de 8 s com o **mesmo jogo** em foco (ajustável).
  Trocar de jogo reinicia a contagem e tira o vídeo.
- **Logo no lugar do nome** (Home): o nome do jogo em foco dá lugar à logo dele. Sem logo, ou se ela não carregar, o nome
  continua. Opção própria no painel (ligada por padrão).
  Ajustes no painel: tamanho, sombra preta difusa, ajuste fino horizontal/vertical (px), esconder "última vez jogado" e fixar no canto esquerdo
  (acima do primeiro card). Com temas que centralizam o texto (ex.: "Centered game text" do CSS Loader) a logo centraliza
  no card sozinha, a não ser que "fixar no canto esquerdo" esteja ligado.

## Como funciona

1. Na página `/library/app/<id>`, depois de alguns segundos (padrão 4 s), o plugin consulta a API da loja
   (`appdetails?filters=movies`) e pega o manifesto DASH H.264 do primeiro trailer.
2. A loja não publica mais MP4. O trailer é fMP4 em pedaços de ~3 s, então o plugin baixa `init + 30 s de pedaços`,
   concatena num `Blob` e toca num `<video>` mudo, sem hls.js nem MSE.
3. Página do jogo: o `<video>` entra logo depois de `.ImgContainer` (a imagem do hero), sobre a imagem e sob a logo.
   Seleção: entra no fim de `.RecentGamesBackgroundImages`, sobre as imagens e sob o resto da Home. O jogo em foco é o da
   imagem com classe `Visible` e sem `OffScreen`.
4. O vídeo é destruído (não só pausado) quando a janela da Steam fica oculta ou o hero sai da tela, e some ao sair da
   página. Os trechos ficam em cache (4 jogos).
5. Logo: o appid vem da capa do tile (`customimages/<id>p.png`). A logo é a primeira que carrega entre
   `steamloopback.host/customimages/<id>_logo.png`, `.../assets/<id>/logo.png`, `.../library_logo.png` e o CDN da loja.
   As logos que carregam ficam guardadas no `localStorage` (`trailer-hero:logos`: webp de até 200 px de altura, 60 jogos,
   renovadas após 7 dias), então das próximas vezes aparecem sem esperar o servidor local da Steam, que é lento logo ao
   iniciar. Logos que só existem no CDN (sem CORS) não são guardadas.
   O texto é escondido (`opacity:0`) e a imagem entra no bloco `.Message`, que a Steam só mostra para o tile em foco.

Tudo roda no contexto da janela da Steam (`SteamUIWindows[0].m_BrowserWindow`), que enxerga a loja e o CDN sem CORS.

## Desenvolvimento

```
npm install
npm test          # lógica pura (src/trailers.ts)
npm run build     # gera dist/index.js
```

Instalar: copiar `plugin.json`, `main.py`, `package.json` e `dist/index.js` para `homebrew\plugins\TrailerHero\`.
Para atualizar, copie o `dist` e reinicie a Steam (a recarga do plugin também funciona, mas evite recargas seguidas).

**Travamento conhecido da Steam:** ocultar e mostrar a janela do Big Picture com um `<video>` ativo travou o processo
 principal do `steamwebhelper` em testes. Por isso o plugin remove o vídeo assim que `visibilityState` deixa de ser `visible`.
 Com essa correção, uma ocultação de 30 s com o trailer tocando não travou (1 rodada). Não testei ocultar a janela sem o
 plugin, então não se sabe se o plugin é condição necessária.

Diagnóstico no `SharedJSContext`: `__trailerHero.status` e `__trailerLogos.status`. `__trailerHero.assumeVisible = true` ignora a checagem de
visibilidade da janela (o vídeo não toca com a janela oculta, mas baixa e posiciona).

## Limites

- Os nomes `.TopCapsule` e `.ImgContainer` vêm da interface da Steam e podem mudar numa atualização.
- Jogos sem trailer na loja ficam com a imagem do hero; nova tentativa após 60 s.
