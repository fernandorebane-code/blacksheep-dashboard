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

def silhueta(caminho):
    """Extrai a silhueta de uma arte clara sobre fundo escuro.

    O logo da marca e feito de palavras: no tamanho de uma aba (16px) os vaos
    entre letras viram ruido. Um fechamento morfologico funde as palavras numa
    massa solida, que e o que se reconhece nesse tamanho.
    """
    from PIL import ImageFilter, ImageOps
    img = Image.open(caminho).convert('L')
    lado = max(img.size)
    if lado > 1200:                       # normaliza para o fechamento ser previsivel
        img = img.resize((int(img.width * 1200 / lado), int(img.height * 1200 / lado)), Image.LANCZOS)
    bin_ = img.point(lambda v: 255 if v > 110 else 0)
    fecha = max(3, int(min(img.size) * 0.022)) | 1     # impar, ~2% do lado menor
    bin_ = bin_.filter(ImageFilter.MaxFilter(fecha))   # une as palavras
    bin_ = bin_.filter(ImageFilter.MinFilter(fecha))   # devolve o contorno
    caixa = bin_.getbbox()
    return bin_.crop(caixa) if caixa else bin_


def de_arquivo(caminho, tamanho, solida=True):
    """Monta o icone: silhueta preta sobre o verde da marca."""
    marca = silhueta(caminho) if solida else Image.open(caminho).convert('L')
    margem = int(tamanho * 0.14)
    alvo = tamanho - 2 * margem
    esc = min(alvo / marca.width, alvo / marca.height)
    marca = marca.resize((max(1, int(marca.width * esc)), max(1, int(marca.height * esc))), Image.LANCZOS)

    img = Image.new('RGBA', (tamanho, tamanho), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, tamanho - 1, tamanho - 1], radius=int(6 * tamanho / 32), fill=VERDE)
    preto = Image.new('RGBA', marca.size, PRETO + (255,))
    img.paste(preto, ((tamanho - marca.width) // 2, (tamanho - marca.height) // 2), marca)
    return img

def datauri(img):
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

origem = sys.argv[1] if len(sys.argv) > 1 else None
faz = (lambda t: de_arquivo(origem, t)) if origem else desenhar

print('<link rel="icon" type="image/png" sizes="32x32" href="%s">' % datauri(faz(32)))
print('<link rel="apple-touch-icon" sizes="180x180" href="%s">' % datauri(faz(180)))
