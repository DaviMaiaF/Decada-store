# Ícones do app

Fontes, em SVG, dos ícones em `mobile/assets/`. Todos saem do selo de
[`../logo-decada.svg`](../logo-decada.svg) — o "D" terracota com o ponto sálvia —
sem o nome, que não se lê em 48 px.

| Fonte | Vira | Tamanho | Observação |
|---|---|---|---|
| `icone.svg` | `icon.png` | 1024 | Quadrado cheio: o iOS arredonda os cantos sozinho. |
| `android-frente.svg` | `android-icon-foreground.png` | 512 | Fundo transparente e folga em volta: o Android recorta até um terço da borda. |
| `android-fundo.svg` | `android-icon-background.png` | 512 | Só o verde da marca. |
| `android-monocromatico.svg` | `android-icon-monochrome.png` | 432 | Uma cor só: o sistema pinta com a cor do tema. |
| `favicon.svg` | `favicon.png` | 48 | Versão web; com os cantos arredondados do selo. |

Para exportar de novo depois de mexer num SVG (o `cairosvg` não é dependência do
projeto; instale num venv à parte):

```bash
python3 -m pip install cairosvg
cd docs/design/marca/icones
python3 -m cairosvg icone.svg -o ../../../../mobile/assets/icon.png -W 1024 -H 1024
```

Ícone não chega pela EAS Update: só aparece num APK novo.
