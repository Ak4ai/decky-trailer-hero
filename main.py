import decky


class Plugin:
    # Todo o trabalho acontece no frontend: a Steam já deixa a interface ler a loja e o CDN de vídeo.
    async def _main(self):
        decky.logger.info("Trailer Hero carregado")

    async def _unload(self):
        decky.logger.info("Trailer Hero descarregado")
