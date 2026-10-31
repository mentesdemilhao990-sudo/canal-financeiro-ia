# Mente de Milhão · fábrica de vídeos financeiros

Gera vídeos verticais (1080x1920, 30 a 60 s) para um canal dark de educação financeira, com narração em português, legendas sincronizadas, gráficos animados e capa. Tudo roda de graça no GitHub Actions, só com CPU.

| Peça | Ferramenta |
| --- | --- |
| Animação e composição | Remotion + React/TypeScript |
| Narração | Piper TTS, voz `pt_BR-faber-medium` |
| Áudio, codificação e testes | FFmpeg / ffprobe |
| Renderização | GitHub Actions (`ubuntu-latest`) |

## Gerar um vídeo pelo navegador

1. **Criar o episódio.** Abra a pasta `episodes/`, clique no episódio de exemplo, copie todo o texto. Volte em `episodes/`, clique em **Add file → Create new file**, dê um nome como `juros-compostos.json`, cole e edite. O campo `"id"` precisa ser igual ao nome do arquivo (sem `.json`), só com letras minúsculas, números e hífen. Clique em **Commit changes**.
2. **Rodar.** Aba **Actions → Gerar vídeo → Run workflow**. No campo, digite o nome do episódio (ex.: `juros-compostos`). Também aceita vários separados por vírgula, ou `todos`. Clique em **Run workflow**.
3. **Baixar.** Espere o círculo ficar verde (uns 5 a 10 minutos). Clique na execução e role até **Artifacts**. Baixe o arquivo com o nome do episódio: é um `.zip` com o MP4, o roteiro, o SRT e a capa.

Se ficar vermelho, clique na etapa com ❌ para ver o motivo. Os erros de episódio dizem o campo exato que está errado.

## Formato do episódio

```json
{
  "id": "meu-episodio",
  "title": "Título que aparece na capa e no roteiro",
  "description": "Descrição para postar",
  "tags": ["finanças"],
  "targetDurationSeconds": 40,
  "disclaimer": "Conteúdo educativo. Não é recomendação de investimento.",
  "scenes": [
    { "id": "abertura", "template": "hook", "narration": "Texto falado...", "data": { ... } }
  ]
}
```

A duração vem da narração. Como referência, a voz fala cerca de 15 caracteres por segundo: 40 s são uns 600 caracteres somando todas as cenas. Escreva números por extenso na narração (`"quatro e meio por cento"`) e com algarismos nos campos visuais (`"4,5%"`).

### Modelos de cena (`template`)

| template | Para que serve | campos em `data` |
| --- | --- | --- |
| `hook` | abertura impactante | `title`, `kicker`?, `subtitle`? |
| `split` | comparação lado a lado | `left` e `right`: `label`, `icon` (`safe`, `growth`, `piggy`, `chart`, `coin`, `warning`), `points` |
| `counter` | número que sobe ou desce | `label`, `from`, `to`, `prefix`?, `suffix`?, `decimals`?, `trend` (`up`/`down`), `caption`?, `badge`? |
| `lineChart` | gráfico de linhas | `title`, `xLabels`, `series` (`label`, `color`: `green`/`gold`/`red`/`white`, `values`), `valuePrefix`?, `caption`? |
| `bars` | gráfico de barras | `title`, `items` (`label`, `value`, `color`), `valuePrefix`?, `caption`? |
| `list` | lista numerada | `title`, `items` |
| `outro` | fechamento e chamada | `title` (use `\n` para quebrar linha), `points`?, `cta`? |

Campos com `?` são opcionais. O episódio de exemplo usa cinco desses modelos.

Nome do canal, @, velocidade da voz e volume da trilha ficam em `config/channel.json`.

## O que sai em cada execução

- `<id>.mp4`: vídeo H.264 + AAC, 1080x1920, 30 fps, com legendas na tela
- `<id>.srt`: legendas separadas, para subir na plataforma
- `<id>-roteiro.md`: título, descrição, tags e roteiro com os tempos de cada cena
- `<id>-capa.png`: capa vertical 1080x1920
- `<id>-youtube.json`: título, descrição, hashtags e tags prontos para o YouTube

## Testes automáticos

Cada execução valida os episódios e, depois de renderizar, confere com ffprobe/ffmpeg:

- vídeo H.264, 1080x1920, 30 fps, entre 30 e 60 s e até 20% longe da meta
- narração gerada pelo Piper com a voz faber
- faixa AAC com a mesma duração do vídeo, volume adequado, sem silêncio maior que 1,5 s
- nenhum trecho preto e nenhuma imagem congelada por mais de 3 s
- SRT válido, em ordem, sem sobreposição e dentro da duração
- capa 1080x1920

Pull requests também rodam tudo isso com o episódio de exemplo.

## Como funciona

1. `scripts/tts.py` sintetiza cada frase com o Piper e usa o alinhamento de fonemas do modelo para saber quando cada palavra é falada. Normaliza a narração em -16 LUFS e cria uma trilha ambiente grave gerada do zero com FFmpeg (sem direitos autorais de terceiros).
2. `scripts/build-episode.mjs` passa narração, tempos e episódio para o Remotion, que renderiza o vídeo e a capa, e grava SRT e roteiro.
3. `src/` tem as cenas (`src/scenes/`), o fundo, o cabeçalho e as legendas (`src/components/`).

Para mexer no visual com pré-visualização ao vivo, é preciso rodar localmente (`npm ci && npm run studio`), mas isso é opcional.

## Publicação no YouTube e comentários

Tudo começa **desligado**: sem as credenciais e sem as chaves abaixo, os workflows só simulam e mostram o que fariam. O passo a passo para conectar o canal está em **[docs/tutorial-youtube.md](docs/tutorial-youtube.md)**.

| Workflow (aba Actions) | Quando roda | O que faz |
| --- | --- | --- |
| **Publicar no YouTube** | todo dia às 9h e manual | renderiza, testa e envia **como privado** os episódios com data vencida; nunca envia o mesmo episódio ou arquivo duas vezes |
| **Mudar visibilidade no YouTube** | manual | depois de você conferir: público, não listado ou agendado |
| **Comentários do YouTube** | a cada 3 h, manual e quando você marca a issue | lê comentários novos, classifica, sugere respostas e envia as que você aprovou |
| **Testar conexão com o YouTube** | manual | só confere o login |

| Chave (Settings → Secrets and variables → Actions → **Variables**) | Valor | Libera |
| --- | --- | --- |
| `YOUTUBE_PUBLICACAO` | `ligada` | envio de vídeos (sempre privados) |
| `YOUTUBE_RESPOSTAS` | `ligadas` | envio das respostas aprovadas por você |
| `YOUTUBE_RESPOSTA_AUTOMATICA` | `ligada` | resposta sozinha só para elogios curtos (também exige `habilitada: true` em `config/publicacao.json`) |

As credenciais (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`) ficam **só** em **Secrets**.

- **Metadados automáticos:** título (até 100 caracteres), descrição com aviso legal e hashtags, tags do nicho achadas na narração. Saem em `out/<id>/<id>-youtube.json` e na seção "YouTube" do roteiro. Ajustes em `config/publicacao.json`.
- **Agenda:** no episódio, `"publicacao": { "youtube": { "enviarEm": "2026-11-05T10:00" } }` (horário de Brasília). Também aceita `"titulo"` e `"hashtags"`.
- **Comentários:** cada um vira `simples`, `financeira`, `pergunta`, `negativo`, `spam` ou `outro`. Perguntas sobre dinheiro (💰) sempre esperam a sua revisão. Você aprova marcando caixas na issue **💬 Comentários para aprovar**.
- **Painel:** [PAINEL.md](PAINEL.md) mostra chaves, cota do dia, vídeos com status e números, fila de episódios e comentários. Cada execução também deixa o painel em HTML para download.
- **Registro:** `data/publicacoes.json` (envios), `data/comentarios.json`, `data/estatisticas.json` e `data/cota.json`, atualizados pelos workflows.
- **Limites:** respeita a cota gratuita do YouTube (10.000 unidades/dia e 100 envios/dia), com parada de segurança antes.
- **Instagram e TikTok:** estrutura pronta, envio ainda não implementado. Veja [docs/plataformas-futuras.md](docs/plataformas-futuras.md).

## Licenças

Fontes Montserrat e Bebas Neue sob SIL OFL (em `public/fonts/`). A voz `pt_BR-faber-medium` vem do projeto Piper (veja o cartão do modelo em huggingface.co/rhasspy/piper-voices). O Remotion é gratuito para pessoas físicas e empresas de até 3 pessoas; acima disso exige licença da empresa.
