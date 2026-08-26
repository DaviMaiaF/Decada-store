"""Normalização de texto do domínio.

Usado pelo seed para preencher `Product.normalized_name` e, na etapa 3, pelo
casamento item–produto. As duas coisas precisam da MESMA normalização: se cada
uma tivesse a sua, o texto do catálogo e o texto do plano nunca bateriam.
"""

import re
import unicodedata

# Palavras que aparecem em plano alimentar e em nome de produto sem ajudar a
# identificar o item. "sem pele", "cru" e afins são ruído para a comparação.
CULINARY_STOPWORDS = frozenset(
    {
        "a",
        "as",
        "com",
        "da",
        "das",
        "de",
        "do",
        "dos",
        "e",
        "em",
        "na",
        "no",
        "o",
        "os",
        "para",
        "pele",
        "sem",
        "tipo",
        "cru",
        "crua",
        "crus",
        "cruas",
        "cozido",
        "cozida",
    }
)

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


def strip_accents(text: str) -> str:
    """Remove acentos preservando as letras: "abóbora" vira "abobora"."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def tokenize(text: str) -> list[str]:
    """Quebra o texto em palavras minúsculas, sem acento e sem pontuação."""
    cleaned = _NON_ALPHANUMERIC.sub(" ", strip_accents(text.lower()))
    return cleaned.split()


def normalize_text(text: str) -> str:
    """Forma canônica usada na comparação: sem acento, sem pontuação, sem stopword.

    Se o texto for só stopword ("de", "com"), devolve as palavras originais em
    vez de string vazia — string vazia casaria com qualquer coisa.
    """
    tokens = tokenize(text)
    meaningful = [token for token in tokens if token not in CULINARY_STOPWORDS]
    return " ".join(meaningful or tokens)


def slugify(*parts: str | None) -> str:
    """Identificador estável a partir das partes informadas.

    Diferente de `normalize_text`, aqui as stopwords são mantidas: o slug serve
    para identificar unicamente uma linha, não para comparar semelhança.
    """
    joined = " ".join(part for part in parts if part)
    return _NON_ALPHANUMERIC.sub("-", strip_accents(joined.lower())).strip("-")
