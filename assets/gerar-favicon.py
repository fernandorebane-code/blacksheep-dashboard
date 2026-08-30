# -*- coding: utf-8 -*-
"""Gera o favicon da marca e imprime as tags <link> com o PNG embutido.

As paginas viajam como arquivo unico (o leaderboard publico e copiado para o
repositorio blacksheep-invitational), entao o icone nao pode ser um arquivo
separado — vai embutido como data URI.

Uso:
    python3 assets/gerar-favicon.py            # marca desenhada (BS)
    python3 assets/gerar-favicon.py logo.png   # a partir de um logo pronto
"""
import base64, io, sys
from PIL import Image, ImageDraw, ImageFont

VERDE = (212, 255, 0)
PRETO = (10, 10, 10)
FONTE = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'

def desenhar(tamanho):
    esc = tamanho / 32
    img = Image.new('RGBA', (tamanho, tamanho), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, tamanho - 1, tamanho - 1], radius=int(6 * esc), fill=VERDE)
    f = ImageFont.truetype(FONTE, int(19 * esc))
    texto = 'BS'
    cx, cy, cx2, cy2 = d.textbbox((0, 0), texto, font=f)
    d.text(((tamanho - (cx2 - cx)) / 2 - cx, (tamanho - (cy2 - cy)) / 2 - cy),
           texto, font=f, fill=PRETO)
    return img

def de_arquivo(caminho, tamanho):
    img = Image.open(caminho).convert('RGBA')
    img.thumbnail((tamanho, tamanho), Image.LANCZOS)
    fundo = Image.new('RGBA', (tamanho, tamanho), (0, 0, 0, 0))
    fundo.paste(img, ((tamanho - img.width) // 2, (tamanho - img.height) // 2), img)
    return fundo

def datauri(img):
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

origem = sys.argv[1] if len(sys.argv) > 1 else None
faz = (lambda t: de_arquivo(origem, t)) if origem else desenhar

print('<link rel="icon" type="image/png" sizes="32x32" href="%s">' % datauri(faz(32)))
print('<link rel="apple-touch-icon" sizes="180x180" href="%s">' % datauri(faz(180)))
