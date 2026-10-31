# Instagram e TikTok: estrutura preparada

O YouTube está implementado. Instagram e TikTok já têm o lugar pronto no código, mas **ainda não enviam nada**.

## O que já existe

| Peça | Onde | Situação |
| --- | --- | --- |
| Contrato comum das plataformas | `scripts/platforms/index.mjs` | pronto |
| Legendas e hashtags do Instagram (até 2.200 caracteres, até 30 hashtags) | `scripts/platforms/instagram.mjs` → `metadados()` | pronto |
| Legenda do TikTok | `scripts/platforms/tiktok.mjs` → `metadados()` | pronto |
| Agenda por plataforma no episódio | `publicacao.instagram.enviarEm`, `publicacao.tiktok.enviarEm` (e `legenda`) | aceito pelo validador |
| Registro sem duplicação | `data/publicacoes.json` guarda `plataforma` em cada item | pronto para várias plataformas |
| Painel | seção "Plataformas" do `PAINEL.md` | mostra a situação de cada uma |
| Envio, comentários e respostas | `publicar()`, `comentarios()`, `responder()` | lançam "não implementado" |

## As mesmas regras valem para todas

1. Credenciais só em GitHub Actions Secrets.
2. Uma Variable com valor exato liga o envio real (`INSTAGRAM_PUBLICACAO=ligada`, `TIKTOK_PUBLICACAO=ligada`). Sem ela, simulação.
3. Primeiro envio sempre privado ou rascunho.
4. Registro em `data/publicacoes.json` antes e depois do envio, para nunca duplicar.
5. Perguntas financeiras nunca recebem resposta automática.

## Instagram (Reels), quando for implementar

- **API:** Instagram Graph API, publicação de conteúdo (gratuita).
- **Precisa de:** conta Instagram Profissional (Criador ou Empresa) ligada a uma Página do Facebook, e um app no Meta for Developers com as permissões de publicação e de comentários.
- **Secrets previstos:** `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN` (token de longa duração, renovado antes de vencer em ~60 dias).
- **Particularidade:** a API busca o vídeo por uma URL pública. Caminho gratuito: anexar o MP4 a um Release do GitHub (repositório público) e passar o link.
- **Primeiro envio privado:** o Instagram não tem Reel "privado" pela API. A forma segura é a etapa de aprovação acontecer antes: o workflow prepara o contêiner de mídia e só publica depois da sua aprovação.
- **Comentários:** a API permite ler e responder comentários dos seus posts, então dá para reaproveitar `scripts/lib/comentarios.mjs` e a issue de aprovação.

## TikTok, quando for implementar

- **API:** TikTok Content Posting API (gratuita), com app no TikTok for Developers e login do criador.
- **Secrets previstos:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`.
- **Primeiro envio privado:** enquanto o app não passa pela auditoria do TikTok, tudo que é postado pela API fica visível só para você (`SELF_ONLY`), o que já cumpre a regra.
- **Comentários:** a API pública não permite responder comentários. O painel pode só listar o que for possível ler.

## Como implementar uma plataforma nova

1. Preencher `publicar`, `comentarios` e `responder` no arquivo da plataforma, usando só `fetch` e passando cada chamada pelo controle de limites.
2. Criar um teste com a API falsa, no mesmo modelo de `tests/helpers/youtube-falso.mjs`.
3. Criar o workflow copiando `publicar.yml` e trocando os Secrets e a Variable.
4. Escrever o tutorial de conexão no mesmo formato de `docs/tutorial-youtube.md`.

Antes de implementar, confira os limites e regras atuais na documentação oficial de cada plataforma: elas mudam com frequência.
