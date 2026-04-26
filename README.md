# Notion → Instagram Publisher

Publica automaticamente conteúdo do seu banco de dados Notion no Instagram.

## Como funciona

1. Você cadastra posts no Notion com imagem, legenda e hashtags
2. Marca o status como **"Pronto para publicar"**
3. O script lê os posts, publica no Instagram e atualiza o status para **"Publicado"**

Suporta imagem única e carrossel (2–10 imagens).

---

## Pré-requisitos

- Python 3.11+
- Conta no [Notion](https://notion.so) com uma integração criada
- Conta Business no Instagram conectada a uma Página do Facebook
- App no [Meta for Developers](https://developers.facebook.com/) com permissão `instagram_basic` e `instagram_content_publish`

---

## Configuração

### 1. Instalar dependências

```bash
pip install -r requirements.txt
```

### 2. Criar o arquivo `.env`

```bash
cp .env.example .env
```

Preencha as variáveis:

| Variável | Como obter |
|---|---|
| `NOTION_API_KEY` | [notion.so/my-integrations](https://www.notion.so/my-integrations) → criar integração |
| `NOTION_DATABASE_ID` | ID da URL do seu banco: `notion.so/{ID}?v=...` |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Graph API Explorer → `/me/accounts` → `/PAGE_ID?fields=instagram_business_account` |
| `FACEBOOK_ACCESS_TOKEN` | Graph API Explorer com as permissões necessárias |

### 3. Estrutura do banco de dados no Notion

Crie um banco com estas propriedades:

| Propriedade | Tipo | Descrição |
|---|---|---|
| **Nome** | Título | Título do post (interno) |
| **Legenda** | Texto | Texto da legenda |
| **Hashtags** | Texto | Hashtags (ex: `#marketing #socialmedia`) |
| **Imagens** | Arquivos | URLs públicas das imagens |
| **Status** | Seleção | `Rascunho` / `Pronto para publicar` / `Publicado` / `Erro` |
| **Data de publicação** | Data | Data/hora desejada (opcional) |
| **Erro** | Texto | Preenchido automaticamente em caso de falha |

> **Importante:** As imagens devem ser URLs públicas acessíveis (ex: Cloudinary, S3, Imgur). URLs privadas do Notion expiram e não funcionam com a API do Instagram.

---

## Uso

### Publicar uma vez

```bash
python main.py
```

### Publicar automaticamente a cada 60 minutos

```bash
python main.py --schedule 60
```

---

## Fluxo de publicação

```
Notion (Status: "Pronto para publicar")
    ↓
Lê posts prontos
    ↓
1 imagem → post simples
N imagens → carrossel
    ↓
Cria container no Instagram
    ↓
Aguarda processamento
    ↓
Publica
    ↓
Notion (Status: "Publicado" ou "Erro")
```

---

## Limitações da API do Instagram

- Máximo de **25 publicações por 24 horas** por conta
- Carrossel: **2 a 10 imagens**
- Imagens devem ser **JPG** e acessíveis publicamente via HTTPS
- Vídeos requerem permissão adicional (`video_url` no lugar de `image_url`)
