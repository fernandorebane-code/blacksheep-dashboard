# -*- coding: utf-8 -*-
"""Gera o favicon de um evento a partir de duas ou tres letras.

    python3 assets/gerar-favicon-texto.py CT '#000000' '#EE0F14' ctstorm
                                          letras  fundo      letras   nome

Grava assets/<nome>-favicon-32.png e -180.png. O build embute os dois no HTML
como data URI (ver build-paginas.py), que e o que deixa a pagina viajar como
arquivo unico.

Por que texto e nao o logo: numa aba de 16px um logo com arco, raio e nome da
academia vira mancha. Duas letras em alto contraste ainda se leem — e e assim
que alguem acha a aba certa entre quinze abertas no dia do evento.
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

texto = (sys.argv[1] if len(sys.argv) > 1 else 'CT').upper()
fundo = sys.argv[2] if len(sys.argv) > 2 else '#000000'
letra = sys.argv[3] if len(sys.argv) > 3 else '#EE0F14'
nome  = sys.argv[4] if len(sys.argv) > 4 else 'evento'
FONTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def desenhar(lado, raio_rel=0.18):
    # Desenha grande e reduz: a borda arredondada e as letras saem limpas, sem
    # o serrilhado que aparece ao desenhar direto em 32px.
    esc = 8
    L = lado * esc
    img = Image.new('RGBA', (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, L - 1, L - 1], radius=int(L * raio_rel), fill=fundo)
    # maior corpo que ainda cabe com uma folga de 12% de cada lado
    alvo = L * 0.76
    tam = int(L * 0.6)
    while tam > 4:
        f = ImageFont.truetype(FONTE, tam)
        caixa = d.textbbox((0, 0), texto, font=f)
        if (caixa[2] - caixa[0]) <= alvo and (caixa[3] - caixa[1]) <= alvo:
            break
        tam -= 2
    caixa = d.textbbox((0, 0), texto, font=f)
    x = (L - (caixa[2] - caixa[0])) / 2 - caixa[0]
    y = (L - (caixa[3] - caixa[1])) / 2 - caixa[1]
    d.text((x, y), texto, font=f, fill=letra)
    return img.resize((lado, lado), Image.LANCZOS)

for lado in (32, 180):
    caminho = os.path.join('assets', '%s-favicon-%d.png' % (nome, lado))
    desenhar(lado).save(caminho, optimize=True)
    print('%s  %d bytes' % (caminho, os.path.getsize(caminho)))
