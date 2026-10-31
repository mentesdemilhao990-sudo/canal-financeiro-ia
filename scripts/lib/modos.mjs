// Chaves que liberam ações reais. Ficam em GitHub → Settings → Secrets and
// variables → Actions → aba "Variables". Sem o valor exato, tudo é simulação.
import { credenciaisDoAmbiente } from "./youtube-api.mjs";

export const CHAVES = {
  publicacao: { variavel: "YOUTUBE_PUBLICACAO", valor: "ligada", oQueFaz: "envia vídeos ao YouTube (sempre como privados)" },
  respostas: { variavel: "YOUTUBE_RESPOSTAS", valor: "ligadas", oQueFaz: "envia as respostas que você aprovou" },
  automatica: { variavel: "YOUTUBE_RESPOSTA_AUTOMATICA", valor: "ligada", oQueFaz: "responde sozinho só comentários simples (elogios curtos)" },
};

export function modos(env = process.env, cfg = {}) {
  const cred = credenciaisDoAmbiente(env);
  const ligada = (k) => env[CHAVES[k].variavel]?.trim().toLowerCase() === CHAVES[k].valor;
  const respostas = Boolean(cred) && ligada("respostas");
  return {
    credenciais: Boolean(cred),
    publicacao: Boolean(cred) && ligada("publicacao"),
    leitura: Boolean(cred),
    respostas,
    automatica: respostas && ligada("automatica") && cfg.comentarios?.respostaAutomatica?.habilitada === true,
    pedidos: Object.fromEntries(Object.keys(CHAVES).map((k) => [k, ligada(k)])),
  };
}

/** Texto curto explicando por que algo ficou em simulação. */
export function motivoSimulacao(m, chave) {
  if (!m.credenciais) return "sem credenciais do YouTube nos Secrets (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)";
  if (!m.pedidos[chave]) return `variável ${CHAVES[chave].variavel} não está como "${CHAVES[chave].valor}"`;
  if (chave === "automatica" && !m.pedidos.respostas) return `precisa também de ${CHAVES.respostas.variavel}=${CHAVES.respostas.valor}`;
  if (chave === "automatica") return "respostaAutomatica.habilitada está false em config/publicacao.json";
  return "";
}
