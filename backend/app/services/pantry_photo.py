"""Despensa por foto: o que aparece na imagem vira proposta de item.

A pessoa fotografa a prateleira, a geladeira ou as compras em cima da mesa, e o
app diz o que viu. Nada entra sozinho na despensa (decisão 11): este módulo só
**propõe** — nomes de alimentos e, para cada um, os produtos do catálogo mais
parecidos. Quem confirma é a pessoa, item a item, pela rota de sempre.

A imagem não é guardada. Ela é reduzida em memória, sai do aparelho só para o
reconhecimento e é descartada; não há coluna, arquivo nem log com ela
(decisão 5, minimização).
"""

import base64
import io
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

import anthropic
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

from app.models import Product
from app.services.matching import MINIMUM_SCORE, ScoredProduct, rank_products
from app.services.text import normalize_text

# Foto de celular passa fácil de 5 MB; acima de 10 MB é outra coisa.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Lado maior da imagem enviada. 1280 px ainda mostra o rótulo de um pacote numa
# prateleira e mantém a foto perto de 1.600 tokens — o custo é por pixel.
MAX_EDGE = 1280

ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP"}

# Uma foto de despensa cheia não passa disso; mais que isso é ruído.
MAX_FOODS = 30

# Candidatos por alimento: os mesmos cinco do cadastro manual.
MAX_CANDIDATES = 5


class InvalidImageError(ValueError):
    """O arquivo não é uma imagem que dê para ler."""


class ImageTooLargeError(ValueError):
    """A imagem passa do tamanho aceito."""


class RecognitionUnavailableError(RuntimeError):
    """O reconhecimento não respondeu ou não está configurado.

    Não é erro de quem enviou: a foto pode ser perfeita e o serviço estar fora.
    """


class FoodRecognizer(Protocol):
    """Quem olha a foto e diz que alimentos há nela."""

    def recognize(self, jpeg: bytes) -> list[str]: ...


@dataclass(frozen=True)
class PhotoProposal:
    """Um alimento visto na foto e os produtos do catálogo que podem ser ele."""

    name: str
    # Falso quando nenhum produto do catálogo chega perto do nome: a tela
    # mostra o item à parte, esperando a pessoa decidir.
    identified: bool
    candidates: list[ScoredProduct]


def prepare_image(data: bytes) -> bytes:
    """A foto pronta para o reconhecimento: JPEG, reduzida e sem metadados.

    Regravar a imagem do zero é o que tira o EXIF — e com ele a localização
    que o celular costuma carimbar na foto. O formato é conferido pelo conteúdo,
    não pelo tipo que o cliente declarou.
    """
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImageTooLargeError(f"a foto passa de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as erro:
        raise InvalidImageError("o arquivo enviado não é uma imagem") from erro

    if image.format not in ACCEPTED_FORMATS:
        raise InvalidImageError("envie a foto em JPEG, PNG ou WebP")

    # Foto de celular vem deitada com uma marca de "gire 90°" no EXIF; sem
    # aplicar a marca antes de descartá-la, a imagem chegaria de lado.
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((MAX_EDGE, MAX_EDGE))

    saida = io.BytesIO()
    image.save(saida, format="JPEG", quality=85)
    return saida.getvalue()


def clean_names(names: Sequence[str]) -> list[str]:
    """Nomes sem repetição nem vazios, na ordem em que vieram.

    "Banana" e "banana " são o mesmo alimento; fica a primeira grafia.
    """
    seen: set[str] = set()
    cleaned: list[str] = []
    for name in names:
        name = " ".join(name.split())
        key = normalize_text(name)
        if not key or key in seen:
            continue
        seen.add(key)
        cleaned.append(name)
    return cleaned[:MAX_FOODS]


def name_variants(name: str) -> list[str]:
    """O nome normalizado, no singular e no plural da primeira palavra.

    A foto devolve "ovo" e o catálogo vende "Ovos de galinha"; a foto devolve
    "banana" e o catálogo vende "Banana prata". O motor de casamento compara
    texto e não sabe que as duas formas são o mesmo alimento, então a busca é
    feita com as duas. Regras simples do português bastam aqui: a forma que não
    existir no catálogo não casa com nada e só fica de fora.
    """
    normalized = normalize_text(name)
    if not normalized:
        return []
    first, _, rest = normalized.partition(" ")
    rest = f" {rest}" if rest else ""

    if first.endswith("oes") or first.endswith("aes"):
        forms = [first[:-3] + "ao"]  # pães → pão
    elif first.endswith("es") and first[-3:-2] in ("r", "z"):
        forms = [first[:-2]]  # colheres → colher
    elif first.endswith("s"):
        forms = [first[:-1]]  # ovos → ovo
    elif first.endswith("ao"):
        forms = [first[:-2] + "oes", first[:-2] + "aes"]  # limão → limões
    elif first.endswith(("r", "z")):
        forms = [first + "es"]  # noz → nozes
    else:
        forms = [first + "s"]  # ovo → ovos

    return [normalized] + [form + rest for form in forms]


def _starts_with(product: Product, variants: Sequence[str]) -> bool:
    """O nome do produto começa pelo alimento, como palavra inteira.

    "Tomate italiano" começa por "tomate"; "Molho de tomate" não — é outro
    produto feito de tomate.
    """
    return any(
        product.normalized_name == variant or product.normalized_name.startswith(variant + " ")
        for variant in variants
    )


def rank_for_photo(name: str, catalog: Sequence[Product]) -> list[ScoredProduct]:
    """Os produtos que podem ser o alimento visto na foto, do mais provável ao menos.

    Duas correções sobre `rank_products`, só para a foto — o casamento do plano
    alimentar continua como está:

    - busca com o singular e o plural (`name_variants`) e fica com a melhor
      nota de cada produto;
    - entre os que passam do corte, o produto cujo nome **começa** pelo
      alimento vem antes. O motor dá a mesma nota a todo produto que contém a
      palavra, e sem isso "tomate" propunha "Molho de tomate" antes de
      "Tomate italiano".

    Um produto que começa pelo alimento como palavra inteira sempre passa do
    corte (o comparador por palavras dá nota cheia), então a preferência nunca
    põe um produto fraco na frente de um bom.
    """
    variants = name_variants(name)
    best: dict[int, ScoredProduct] = {}
    for variant in variants:
        for scored in rank_products(variant, catalog, len(catalog)):
            atual = best.get(id(scored.product))
            if atual is None or scored.score > atual.score:
                best[id(scored.product)] = scored

    ranked = sorted(
        best.values(),
        key=lambda scored: (
            scored.score < MINIMUM_SCORE,
            not _starts_with(scored.product, variants),
            -scored.score,
            scored.product.name,
        ),
    )
    return ranked[:MAX_CANDIDATES]


def propose_items(names: Sequence[str], catalog: Sequence[Product]) -> list[PhotoProposal]:
    """Para cada nome, os produtos do catálogo mais parecidos.

    É o mesmo motor da busca do cadastro manual, com as correções de
    `rank_for_photo`, e o mesmo corte do casamento do plano (`MINIMUM_SCORE`).
    Função pura: não conhece o banco nem a foto.
    """
    proposals = []
    for name in clean_names(names):
        candidates = rank_for_photo(name, catalog)
        identified = bool(candidates) and candidates[0].score >= MINIMUM_SCORE
        proposals.append(PhotoProposal(name, identified, candidates))
    return proposals


def recognize_photo(
    data: bytes, recognizer: FoodRecognizer, catalog: Sequence[Product]
) -> list[PhotoProposal]:
    """Da foto enviada às propostas de item. Não grava nada."""
    return propose_items(recognizer.recognize(prepare_image(data)), catalog)


# --- Reconhecimento pelo Claude ------------------------------------------------

_SYSTEM_PROMPT = """\
Você ajuda a montar a despensa de um app de compras de supermercado brasileiro.
Recebe a foto de uma prateleira, geladeira, armário ou de compras sobre a mesa e
lista os alimentos e bebidas que aparecem nela.

Cada nome deve ser o alimento genérico, em português do Brasil, como se procura
no mercado: "banana", "arroz", "ovos", "leite", "feijão preto". Sem marca, sem
quantidade, sem tamanho de embalagem. Se a embalagem diz o tipo, use-o: "arroz
integral", "leite desnatado".

Liste só o que dá para ver de fato. Na dúvida sobre o que é, deixe de fora:
um item a menos a pessoa acrescenta à mão; um item inventado entra na despensa
dela como se existisse. Ignore utensílios, móveis, embalagens vazias e produtos
que não são comida. Se não houver alimento na foto, devolva a lista vazia."""


class _RecognizedFoods(BaseModel):
    foods: list[str]


class ClaudeFoodRecognizer:
    """Reconhecimento pela API do Claude, com saída estruturada."""

    def __init__(self, client: anthropic.Anthropic, model: str) -> None:
        self._client = client
        self._model = model

    def recognize(self, jpeg: bytes) -> list[str]:
        try:
            response = self._client.messages.parse(
                model=self._model,
                max_tokens=2048,
                # Listar o que está à vista não pede raciocínio longo, e o
                # esforço baixo é o que mantém a foto barata e rápida.
                output_config={"effort": "low"},
                system=_SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": base64.standard_b64encode(jpeg).decode("ascii"),
                                },
                            },
                            {"type": "text", "text": "Que alimentos aparecem nesta foto?"},
                        ],
                    }
                ],
                output_format=_RecognizedFoods,
            )
        except (anthropic.APIConnectionError, anthropic.APIStatusError) as erro:
            raise RecognitionUnavailableError(
                "o reconhecimento da foto não respondeu; tente de novo"
            ) from erro

        # Recusa ou resposta cortada não trazem a lista. Devolver vazio diria
        # "não há comida na foto", o que seria mentira: é falha, não resultado.
        if response.stop_reason != "end_turn" or response.parsed_output is None:
            raise RecognitionUnavailableError(
                "o reconhecimento não conseguiu ler esta foto; tente outra"
            )
        return response.parsed_output.foods


def build_recognizer(api_key: str | None, model: str) -> FoodRecognizer:
    """O reconhecedor configurado, ou indisponível se não houver chave."""
    if not api_key:
        raise RecognitionUnavailableError("o reconhecimento por foto não está configurado")
    # Uma nova tentativa só: a pessoa está olhando para a tela esperando.
    client = anthropic.Anthropic(api_key=api_key, max_retries=1, timeout=60.0)
    return ClaudeFoodRecognizer(client, model)
