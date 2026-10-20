"""Testes da despensa por foto: preparo da imagem, reconhecimento e proposta.

Nenhum teste fala com a API do Claude. O reconhecedor de verdade é exercitado
com um cliente falso, que confere o pedido montado e devolve o que o teste
quer; o resto do fluxo recebe a lista de nomes pronta.
"""

import io
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from PIL import Image

from app.services.pantry_photo import (
    MAX_EDGE,
    MAX_FOODS,
    MAX_UPLOAD_BYTES,
    ClaudeFoodRecognizer,
    ImageTooLargeError,
    InvalidImageError,
    RecognitionUnavailableError,
    build_recognizer,
    clean_names,
    prepare_image,
    propose_items,
    recognize_photo,
)

# Tag EXIF da localização (GPSInfo).
_GPS_TAG = 0x8825
# Tag EXIF da orientação: 6 é "gire 90° para ver em pé".
_ORIENTATION_TAG = 0x0112


def foto(formato: str = "JPEG", tamanho: tuple[int, int] = (64, 48), exif=None) -> bytes:
    """Uma imagem de teste no formato pedido."""
    imagem = Image.new("RGB", tamanho, (200, 180, 40))
    saida = io.BytesIO()
    if exif is not None:
        imagem.save(saida, format=formato, exif=exif)
    else:
        imagem.save(saida, format=formato)
    return saida.getvalue()


# --- Preparo da imagem --------------------------------------------------------


@pytest.mark.parametrize("formato", ["JPEG", "PNG", "WEBP"])
def test_aceita_os_formatos_de_foto_e_devolve_jpeg(formato):
    preparada = prepare_image(foto(formato))

    assert Image.open(io.BytesIO(preparada)).format == "JPEG"


def test_reduz_a_foto_grande_mantendo_a_proporcao():
    preparada = Image.open(io.BytesIO(prepare_image(foto(tamanho=(4000, 3000)))))

    assert preparada.size == (MAX_EDGE, MAX_EDGE * 3 // 4)


def test_foto_pequena_nao_e_ampliada():
    preparada = Image.open(io.BytesIO(prepare_image(foto(tamanho=(64, 48)))))

    assert preparada.size == (64, 48)


def test_descarta_a_localizacao_da_foto():
    exif = Image.Exif()
    exif[_GPS_TAG] = {1: "S", 2: (15.0, 47.0, 0.0)}

    preparada = Image.open(io.BytesIO(prepare_image(foto(exif=exif))))

    assert _GPS_TAG not in preparada.getexif()
    assert len(preparada.getexif()) == 0


def test_aplica_a_rotacao_do_celular_antes_de_descartar_o_exif():
    exif = Image.Exif()
    exif[_ORIENTATION_TAG] = 6

    preparada = Image.open(io.BytesIO(prepare_image(foto(tamanho=(64, 48), exif=exif))))

    # Deitada no arquivo, em pé na foto que sai.
    assert preparada.size == (48, 64)


def test_arquivo_que_nao_e_imagem_e_recusado():
    with pytest.raises(InvalidImageError):
        prepare_image(b"%PDF-1.7 isto nao e uma foto")


def test_imagem_em_formato_nao_aceito_e_recusada():
    with pytest.raises(InvalidImageError):
        prepare_image(foto("GIF"))


def test_arquivo_grande_demais_e_recusado_antes_de_ser_lido():
    with pytest.raises(ImageTooLargeError):
        prepare_image(b"\0" * (MAX_UPLOAD_BYTES + 1))


# --- Limpeza dos nomes ----------------------------------------------------------


def test_nomes_repetidos_e_vazios_saem():
    assert clean_names(["Banana", "banana ", "", "  ", "Arroz", "BANANA"]) == [
        "Banana",
        "Arroz",
    ]


def test_acento_nao_faz_dois_alimentos():
    assert clean_names(["feijão", "feijao"]) == ["feijão"]


def test_espacos_internos_sao_normalizados():
    assert clean_names(["  feijão    preto "]) == ["feijão preto"]


def test_lista_enorme_e_cortada():
    assert len(clean_names([f"alimento {i}" for i in range(100)])) == MAX_FOODS


# --- Proposta de itens -----------------------------------------------------------


def test_alimento_da_foto_encontra_o_produto_do_catalogo(catalogo):
    [banana] = propose_items(["banana"], catalogo)

    assert banana.name == "banana"
    assert banana.identified is True
    assert banana.candidates[0].product.name.startswith("Banana")


def test_varios_alimentos_na_ordem_em_que_vieram(catalogo):
    propostas = propose_items(["ovos", "arroz integral"], catalogo)

    assert [p.name for p in propostas] == ["ovos", "arroz integral"]
    assert propostas[0].candidates[0].product.name == "Ovos de galinha"
    assert propostas[1].candidates[0].product.name == "Arroz integral"


def test_alimento_fora_do_catalogo_fica_nao_identificado(catalogo):
    [proposta] = propose_items(["kiwi"], catalogo)

    assert proposta.identified is False


def test_catalogo_vazio_deixa_tudo_nao_identificado():
    [proposta] = propose_items(["banana"], [])

    assert proposta.identified is False
    assert proposta.candidates == []


def test_foto_sem_alimento_nao_propoe_nada(catalogo):
    assert propose_items([], catalogo) == []


def test_fluxo_completo_com_reconhecedor_falso(catalogo):
    class Reconhecedor:
        recebido: bytes | None = None

        def recognize(self, jpeg: bytes) -> list[str]:
            self.recebido = jpeg
            return ["banana", "Banana"]

    reconhecedor = Reconhecedor()
    propostas = recognize_photo(foto("PNG"), reconhecedor, catalogo)

    # O reconhecedor recebe a foto já preparada, nunca o arquivo original.
    assert Image.open(io.BytesIO(reconhecedor.recebido)).format == "JPEG"
    assert [p.name for p in propostas] == ["banana"]


# --- Reconhecimento pelo Claude --------------------------------------------------


class ClienteFalso:
    """Imita `anthropic.Anthropic` no único ponto que o reconhecedor usa."""

    def __init__(self, resposta=None, erro: Exception | None = None):
        self.pedidos: list[dict] = []
        self.messages = SimpleNamespace(parse=self._parse)
        self._resposta = resposta
        self._erro = erro

    def _parse(self, **pedido):
        self.pedidos.append(pedido)
        if self._erro is not None:
            raise self._erro
        return self._resposta


def resposta(foods=None, stop_reason="end_turn"):
    parsed = None if foods is None else SimpleNamespace(foods=foods)
    return SimpleNamespace(stop_reason=stop_reason, parsed_output=parsed)


def test_claude_recebe_a_foto_e_devolve_os_nomes():
    cliente = ClienteFalso(resposta(["banana", "arroz"]))

    nomes = ClaudeFoodRecognizer(cliente, "claude-haiku-5-5").recognize(b"jpeg")

    assert nomes == ["banana", "arroz"]
    [pedido] = cliente.pedidos
    assert pedido["model"] == "claude-haiku-5-5"
    assert pedido["output_config"] == {"effort": "low"}
    imagem = pedido["messages"][0]["content"][0]
    assert imagem["type"] == "image"
    assert imagem["source"]["media_type"] == "image/jpeg"
    assert imagem["source"]["data"] == "anBlZw=="  # base64 de b"jpeg"


def test_claude_sem_alimento_na_foto_devolve_lista_vazia():
    cliente = ClienteFalso(resposta([]))

    assert ClaudeFoodRecognizer(cliente, "m").recognize(b"jpeg") == []


@pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
def test_resposta_sem_lista_e_falha_e_nao_foto_vazia(stop_reason):
    cliente = ClienteFalso(resposta(None, stop_reason=stop_reason))

    with pytest.raises(RecognitionUnavailableError):
        ClaudeFoodRecognizer(cliente, "m").recognize(b"jpeg")


def test_servico_fora_do_ar_vira_indisponivel():
    pedido = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    cliente = ClienteFalso(erro=anthropic.APIConnectionError(request=pedido))

    with pytest.raises(RecognitionUnavailableError):
        ClaudeFoodRecognizer(cliente, "m").recognize(b"jpeg")


def test_erro_da_api_vira_indisponivel():
    pedido = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    erro = anthropic.RateLimitError(
        "limite", response=httpx2.Response(429, request=pedido), body=None
    )
    cliente = ClienteFalso(erro=erro)

    with pytest.raises(RecognitionUnavailableError):
        ClaudeFoodRecognizer(cliente, "m").recognize(b"jpeg")


@pytest.mark.parametrize("chave", [None, ""])
def test_sem_chave_o_reconhecimento_fica_indisponivel(chave):
    with pytest.raises(RecognitionUnavailableError):
        build_recognizer(chave, "claude-haiku-5-5")
