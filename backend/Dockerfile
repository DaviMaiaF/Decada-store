# Imagem de DESENVOLVIMENTO da API. O código vem por volume (ver docker-compose.yml).
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Dependências antes do código: o pip só roda de novo quando o pyproject.toml
# muda. O pacote `app` vazio basta para o install editável achar o que instalar;
# o código de verdade chega no COPY abaixo e, em desenvolvimento, pelo volume.
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py && pip install --no-cache-dir -e ".[dev]"

COPY . .

EXPOSE 8000
# `exec` deixa o uvicorn no lugar do shell: é ele quem recebe o sinal de parada
# do Docker, e o container para na hora em vez de esperar os 10 s do limite.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
