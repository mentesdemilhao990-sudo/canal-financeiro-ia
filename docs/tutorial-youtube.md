# Tutorial: conectar o canal do YouTube pelo Google Cloud

Tudo pelo navegador, sem instalar nada e sem pagar nada. Leva uns 30 minutos.
No fim, o GitHub Actions consegue enviar vídeos (sempre como **privados**) e ler e responder comentários, mas **só depois que você ligar cada chave** (passos 9 a 11).

> Use a mesma conta Google que é dona do canal. Se o canal é uma "conta de marca", você vai escolher o canal no passo 6.

---

## 1. Criar o projeto no Google Cloud

1. Abra <https://console.cloud.google.com/> e entre com a conta do canal. Se pedir, aceite os termos. **Não precisa cadastrar cartão nem ativar faturamento.**
2. No topo, clique no seletor de projeto (ao lado do logo) → **Novo projeto**.
3. Nome: `mente-de-milhao` → **Criar**. Espere a notificação e selecione o projeto novo no seletor.

## 2. Ativar a YouTube Data API v3

1. Menu ☰ → **APIs e serviços** → **Biblioteca**.
2. Busque `YouTube Data API v3`, clique nela → **Ativar**.

## 3. Configurar a tela de consentimento (OAuth)

1. Menu ☰ → **APIs e serviços** → **Tela de permissão OAuth** (em algumas contas o nome é **Google Auth Platform**). Clique em **Começar** se aparecer.
2. **Informações do app:** nome `Mente de Milhão Automação`, e-mail de suporte = seu e-mail → Avançar.
3. **Público-alvo:** escolha **Externo** → Avançar.
4. **Dados de contato:** seu e-mail → Avançar → aceite a política → **Criar**.
5. Vá em **Acesso a dados** (ou **Escopos**) → **Adicionar ou remover escopos**. No campo "Adicionar escopos manualmente", cole:

   ```
   https://www.googleapis.com/auth/youtube.force-ssl
   ```

   Clique em **Adicionar à tabela** → **Atualizar** → **Salvar**. Esse único escopo permite enviar vídeos, mudar visibilidade e ler/responder comentários do seu canal.

## 4. Publicar o app (importante)

Em **Público-alvo**, o status começa como **Teste**. Nesse modo o Google **cancela o acesso a cada 7 dias** e a automação para de funcionar.

1. Clique em **Publicar app** → **Confirmar**. O status fica **Em produção**.
2. O Google pode dizer que o app "precisa de verificação". **Para uso só seu não precisa**: o único efeito é aparecer o aviso "O Google não verificou este app" no passo 6 (limite de 100 usuários, e você é o único).

## 5. Criar a credencial OAuth

1. Vá em **Clientes** (ou **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**).
2. Tipo de aplicativo: **Aplicativo da Web**. Nome: `GitHub Actions`.
3. Em **URIs de redirecionamento autorizados**, clique em **Adicionar URI** e cole exatamente:

   ```
   https://developers.google.com/oauthplayground
   ```

4. **Criar**. Copie o **ID do cliente** e a **Chave secreta do cliente** para um bloco de notas temporário. (Se a chave não aparecer depois, crie uma nova no mesmo cliente.)

## 6. Gerar o refresh token (OAuth 2.0 Playground)

1. Abra <https://developers.google.com/oauthplayground>.
2. Clique na engrenagem ⚙️ (canto superior direito) → marque **Use your own OAuth credentials** → cole o **ID do cliente** e a **chave secreta** → feche.
3. À esquerda, em **Step 1**, no campo **Input your own scopes**, cole:

   ```
   https://www.googleapis.com/auth/youtube.force-ssl
   ```

   → **Authorize APIs**.
4. Escolha a conta Google. **Se aparecer a lista de canais, escolha o canal Mente de Milhão.**
5. Aparece "O Google não verificou este app": clique em **Avançado** → **Acessar Mente de Milhão Automação (não seguro)** → **Continuar/Permitir**. (É o seu próprio app; o aviso é esperado.)
6. De volta ao Playground, em **Step 2**, clique em **Exchange authorization code for tokens**.
7. Copie o valor de **Refresh token** (começa com `1//`).

> O refresh token dá acesso ao canal. Não mande para ninguém, não coloque em arquivo do repositório nem em issue. Ele vai **só** nos Secrets do passo 7.

## 7. Guardar as credenciais no GitHub (Secrets)

No repositório: **Settings → Secrets and variables → Actions → aba Secrets → New repository secret**. Crie três:

| Nome | Valor |
| --- | --- |
| `YOUTUBE_CLIENT_ID` | ID do cliente (passo 5) |
| `YOUTUBE_CLIENT_SECRET` | Chave secreta do cliente (passo 5) |
| `YOUTUBE_REFRESH_TOKEN` | Refresh token (passo 6) |

Depois apague o bloco de notas temporário.

## 8. Testar a conexão (não envia nada)

**Actions → Testar conexão com o YouTube → Run workflow**. Ficando verde, o resumo mostra "Conexão OK com o canal …". Se der erro, veja "Problemas comuns" no fim.

Até aqui **nada foi publicado**. Os workflows de publicação e comentários continuam em simulação.

## 9. Ligar a publicação (sua autorização inicial)

Na mesma tela, aba **Variables** → **New repository variable**:

| Nome | Valor | O que libera |
| --- | --- | --- |
| `YOUTUBE_PUBLICACAO` | `ligada` | enviar vídeos, **sempre como privados** |

Depois: **Actions → Publicar no YouTube → Run workflow**, digite o episódio (ex.: `guardar-nao-e-investir`). O workflow renderiza, roda todos os testes de áudio e vídeo e só então envia. O link aparece no resumo da execução e no [PAINEL.md](../PAINEL.md).

Confira o vídeo no YouTube Studio. Quando estiver bom: **Actions → Mudar visibilidade no YouTube** → escolha `publico`, `nao_listado` ou `agendado` (com data e hora de Brasília).

### Atenção: auditoria do YouTube

Pela política do YouTube, vídeos enviados pela API por projetos que ainda **não passaram pela auditoria** podem ficar **travados como privados** (aparece "Privado (bloqueado)" no Studio), e aí nem a troca de visibilidade funciona. A auditoria é gratuita:

1. Preencha o formulário **YouTube API Services – Audit and Quota Extension Form** (busque esse nome no Google; fica em support.google.com/youtube).
2. Diga que é uma ferramenta interna para enviar os vídeos do seu próprio canal e moderar comentários. Informe o número do projeto (página inicial do Google Cloud).
3. A resposta pode levar algumas semanas.

Enquanto isso, se precisar publicar: baixe o `.zip` do episódio na execução (Artifacts), suba o MP4 pelo app do YouTube ou pelo Studio e copie título, descrição e tags do arquivo `<episodio>-youtube.json` (ou da seção "YouTube" do roteiro). Leitura e resposta de comentários funcionam normalmente.

## 10. Ligar as respostas aos comentários

O workflow **Comentários do YouTube** roda a cada 3 horas assim que os Secrets existem: lê comentários novos, classifica e sugere respostas. Para aprovar, abra a issue **💬 Comentários para aprovar** (aba Issues) e marque **Aprovar** ou **Ignorar**. Dá para editar o texto da resposta antes (lápis ✏️).

As respostas aprovadas só são enviadas com:

| Nome (Variables) | Valor |
| --- | --- |
| `YOUTUBE_RESPOSTAS` | `ligadas` |

Sem ela, o que você aprova fica guardado e sai quando você ligar.

**Perguntas sobre dinheiro** (investimentos, dívidas, quanto rende, etc.) aparecem primeiro e marcadas com 💰: elas **nunca** recebem resposta sem você aprovar.

## 11. (Opcional) Resposta automática para comentários simples

Só elogios e agradecimentos curtos ("Top!", "Muito bom", emojis), no máximo 1 por pessoa por dia e 10 por execução. São precisas três coisas:

1. `YOUTUBE_RESPOSTAS` = `ligadas` (passo 10)
2. Variable `YOUTUBE_RESPOSTA_AUTOMATICA` = `ligada`
3. Em `config/publicacao.json`, `"respostaAutomatica": { "habilitada": true, ... }`

## 12. Agendar envios

No arquivo do episódio, acrescente:

```json
"publicacao": {
  "youtube": { "enviarEm": "2026-11-05T10:00" }
}
```

Todo dia às 9h (Brasília) o workflow **Publicar no YouTube** envia, como privado, o que já passou da data e ainda não foi enviado (até 2 por dia, ajustável em `config/publicacao.json`). Hora sem fuso vale como horário de Brasília. Também dá para trocar o título (`"titulo"`) e as hashtags (`"hashtags"`).

## Desligar tudo

- Para parar na hora: apague (ou mude o valor de) as Variables `YOUTUBE_PUBLICACAO`, `YOUTUBE_RESPOSTAS` e `YOUTUBE_RESPOSTA_AUTOMATICA`.
- Para cortar o acesso de vez: <https://myaccount.google.com/permissions> → **Mente de Milhão Automação** → **Remover acesso**, e apague os Secrets.

## Limites gratuitos (por que não estoura)

| Item | Limite do YouTube | Uso aqui |
| --- | --- | --- |
| Cota diária | 10.000 unidades | parada de segurança em 9.000 (`config/publicacao.json`) |
| Envios de vídeo | 100 por dia (limite separado) | até 10 por dia e 2 por execução |
| Ler comentários | 1 unidade por página de 100 | a cada 3 horas: ~10 unidades |
| Responder | 50 unidades cada | 10 respostas = 500 |

O uso do dia fica em `data/cota.json` e no painel. A cota zera à meia-noite do Pacífico (4h ou 5h em Brasília). O GitHub Actions é gratuito em repositório público; em privado, o plano grátis dá 2.000 minutos por mês (cada vídeo gasta uns 10).

## Problemas comuns

| Mensagem | O que fazer |
| --- | --- |
| `invalid_grant` | O token expirou ou foi revogado. Confira o passo 4 (app **Em produção**) e gere um novo no passo 6. |
| `redirect_uri_mismatch` | O URI do passo 5 está diferente. Tem que ser exatamente `https://developers.google.com/oauthplayground`. |
| `access_denied` / app bloqueado | No passo 3, adicione seu e-mail como usuário de teste ou faça o passo 4. |
| `youtubeSignupRequired` / "não tem canal" | No passo 6 você escolheu a conta, não o canal. Refaça escolhendo o canal. |
| `quotaExceeded` / `uploadLimitExceeded` | Limite do dia. Espere zerar (4h–5h de Brasília). |
| `forbidden` ao mudar visibilidade | Vídeo travado como privado: veja "Auditoria do YouTube" no passo 9. |
| Workflow agendado parou de rodar | O GitHub pausa agendamentos após 60 dias sem atividade no repositório. Em **Actions**, clique no workflow → **Enable workflow**. |
| "envio foi interrompido" | Uma execução caiu no meio do envio. Confira no Studio se o vídeo subiu e edite `data/publicacoes.json`: troque o `status` daquele item para `privado` (com o `videoId`) ou `erro` (se não subiu). |
