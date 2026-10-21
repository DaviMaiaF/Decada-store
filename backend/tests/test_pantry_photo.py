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

from app.services.pantry import name_variants
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


@pytest.mark.parametrize(
    ("nome", "esperadas"),
    [
        ("ovo", ["ovo", "ovos"]),
        ("Ovos", ["ovos", "ovo"]),
        ("pão", ["pao", "paes", "poes"]),
        ("pães", ["paes", "pao"]),
        ("limões", ["limoes", "limao"]),
        ("noz", ["noz", "nozes"]),
        ("colheres", ["colheres", "colher"]),
        ("feijão preto", ["feijao preto", "feijoes preto", "feijaes preto"]),
    ],
)
def test_variantes_de_singular_e_plural_da_primeira_palavra(nome, esperadas):
    assert sorted(name_variants(nome)) == sorted(esperadas)


def test_nome_vazio_nao_tem_variante():
    assert name_variants("  ") == []


def test_singular_encontra_o_produto_vendido_no_plural(catalogo):
    [ovo] = propose_items(["ovo"], catalogo)

    assert ovo.identified is True
    assert ovo.candidates[0].product.name == "Ovos de galinha"


def test_plural_encontra_o_produto_vendido_no_singular(catalogo):
    [bananas] = propose_items(["bananas"], catalogo)

    assert bananas.candidates[0].product.name.startswith("Banana")


def test_o_alimento_vem_antes_do_produto_feito_dele(catalogo):
    # O motor dá nota maior a "Molho de tomate"; quem fotografou tomates quer o tomate.
    [tomate] = propose_items(["tomate"], catalogo)

    assert tomate.candidates[0].product.name == "Tomate italiano"
    assert {c.product.name for c in tomate.candidates} >= {"Molho de tomate", "Tomate italiano"}


def test_o_produto_feito_do_alimento_continua_vencendo_quando_e_ele_na_foto(catalogo):
    [molho] = propose_items(["molho de tomate"], catalogo)

    assert molho.candidates[0].product.name == "Molho de tomate"


def test_a_nota_mostrada_e_a_da_melhor_forma_do_nome(catalogo):
    [ovo] = propose_items(["ovo"], catalogo)
    [ovos] = propose_items(["ovos"], catalogo)

    assert ovo.candidates[0].score == ovos.candidates[0].score


def test_cada_produto_aparece_uma_vez_so(catalogo):
    [ovo] = propose_items(["ovo"], catalogo)

    nomes = [c.product.name for c in ovo.candidates]
    assert len(nomes) == len(set(nomes))


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


# --- Rota POST /pantry/photo -----------------------------------------------------


class ReconhecedorFalso:
    """Devolve nomes fixos e conta quantas fotos recebeu."""

    def __init__(self, nomes: list[str] | None = None, erro: Exception | None = None):
        self.nomes = nomes or []
        self.erro = erro
        self.chamadas = 0

    def recognize(self, jpeg: bytes) -> list[str]:
        self.chamadas += 1
        if self.erro is not None:
            raise self.erro
        return self.nomes


@pytest.fixture
def reconhecedor(client):
    """Troca o reconhecedor da rota por um falso; nenhum teste chama o Claude."""
    from app.api.routes.pantry import get_food_recognizer
    from app.main import app

    falso = ReconhecedorFalso(["banana", "ovos", "kiwi"])
    app.dependency_overrides[get_food_recognizer] = lambda: falso
    return falso


def enviar_foto(client, user, conteudo: bytes | None = None, consentimento: bool = True):
    from tests.helpers import auth_headers

    return client.post(
        "/pantry/photo",
        headers=auth_headers(user),
        files={"file": ("foto.jpg", conteudo if conteudo is not None else foto(), "image/jpeg")},
        data={"consent_accepted": "true" if consentimento else "false"},
    )


@pytest.mark.db
def test_rota_propoe_os_alimentos_da_foto(client, marina, reconhecedor):
    resposta = enviar_foto(client, marina)

    assert resposta.status_code == 200
    itens = resposta.json()["items"]
    assert [item["name"] for item in itens] == ["banana", "ovos", "kiwi"]
    assert itens[0]["identified"] is True
    assert itens[0]["candidates"][0]["product"]["name"].startswith("Banana")
    assert itens[1]["candidates"][0]["product"]["name"] == "Ovos de galinha"
    assert itens[2]["identified"] is False


@pytest.mark.db
def test_rota_nao_grava_nada_na_despensa(client, db_session, marina, reconhecedor):
    from sqlalchemy import func, select

    from app.models import PantryItem

    antes = db_session.scalar(select(func.count()).select_from(PantryItem))
    enviar_foto(client, marina)

    assert db_session.scalar(select(func.count()).select_from(PantryItem)) == antes


@pytest.mark.db
def test_sem_consentimento_a_foto_nem_e_enviada(client, marina, reconhecedor):
    resposta = enviar_foto(client, marina, consentimento=False)

    assert resposta.status_code == 422
    assert reconhecedor.chamadas == 0


@pytest.mark.db
def test_foto_sem_alimento_devolve_lista_vazia(client, marina, reconhecedor):
    reconhecedor.nomes = []

    resposta = enviar_foto(client, marina)

    assert resposta.status_code == 200
    assert resposta.json() == {"items": []}


@pytest.mark.db
def test_arquivo_que_nao_e_imagem_responde_400(client, marina, reconhecedor):
    resposta = enviar_foto(client, marina, b"%PDF-1.7 nao e foto")

    assert resposta.status_code == 400
    assert reconhecedor.chamadas == 0


@pytest.mark.db
def test_foto_grande_demais_responde_413(client, marina, reconhecedor):
    resposta = enviar_foto(client, marina, b"\0" * (MAX_UPLOAD_BYTES + 1))

    assert resposta.status_code == 413
    assert reconhecedor.chamadas == 0


@pytest.mark.db
def test_reconhecimento_fora_do_ar_responde_503(client, marina, reconhecedor):
    reconhecedor.erro = RecognitionUnavailableError("fora do ar")

    resposta = enviar_foto(client, marina)

    assert resposta.status_code == 503


@pytest.mark.db
def test_sem_chave_configurada_responde_503(client, marina, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "anthropic_api_key", None)

    resposta = enviar_foto(client, marina)

    assert resposta.status_code == 503


@pytest.mark.db
def test_nutricionista_nao_tem_despensa(client, camila, reconhecedor):
    resposta = enviar_foto(client, camila)

    assert resposta.status_code == 404
    assert reconhecedor.chamadas == 0


@pytest.mark.db
def test_sem_login_responde_401(client, reconhecedor):
    resposta = client.post(
        "/pantry/photo",
        files={"file": ("foto.jpg", foto(), "image/jpeg")},
        data={"consent_accepted": "true"},
    )

    assert resposta.status_code == 401
