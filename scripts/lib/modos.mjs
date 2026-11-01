// Chaves que liberam ações reais. Ficam em GitHub → Settings → Secrets and
// variables → Actions → aba "Variables". Sem o valor exato, tudo é simulação.
import { credenciaisDoAmbiente } from "./youtube-api.mjs";

export const CHAVES = {
  publicacao: { variavel: "YOUTUBE_PUBLICACAO", valor: "ligada", oQueFaz: "envia vídeos ao YouTube (sempre como privados)" },
  respostas: { variavel: "YOUTUBE_RESPOSTAS", valor: "ligadas", oQueFaz: "envia as respostas que você aprovou" },
  automatica: { variavel: "YOUTUBE_RESPOSTA_AUTOMATICA", valor: "ligada", oQueFaz: "responde sozinho só comentários simples (elogios curtos)" },
};

/** Texto que você digita numa execução manual para autorizar o envio (sempre privado) só daquela vez. */
export const CONFIRMACAO = "ENVIAR-PRIVADO";
/**
 * Usado só pelo workflow "Vídeos do dia" (diario.yml): o Patrick autorizou em 2026-10-31
 * publicar um vídeo e um Short por dia, PÚBLICOS, sem aprovação. Desliga com a
 * Variable PUBLICACAO_DIARIA = desligada.
 */
export const CONFIRMACAO_DIARIA = "PUBLICACAO-DIARIA";
const autorizado = (env) => [CONFIRMACAO, CONFIRMACAO_DIARIA].includes(env.CONFIRMACAO_ENVIO?.trim());

export function modos(env = process.env, cfg = {}) {
  const cred = credenciaisDoAmbiente(env);
  const ligada = (k) => env[CHAVES[k].variavel]?.trim().toLowerCase() === CHAVES[k].valor;
  const respostas = Boolean(cred) && ligada("respostas");
  return {
    credenciais: Boolean(cred),
    // Também vale a confirmação digitada numa execução manual (só para aquela execução).
    publicacao: Boolean(cred) && (ligada("publicacao") || autorizado(env)),
    // Só a pauta diária pode subir vídeo direto como público.
    publicoDireto: Boolean(cred) && env.CONFIRMACAO_ENVIO?.trim() === CONFIRMACAO_DIARIA,
    leitura: Boolean(cred),
    respostas,
    automatica: respostas && ligada("automatica") && cfg.comentarios?.respostaAutomatica?.habilitada === true,
    pedidos: { ...Object.fromEntries(Object.keys(CHAVES).map((k) => [k, ligada(k)])), ...(autorizado(env) ? { publicacao: true } : {}) },
  };
}

/** Texto curto explicando por que algo ficou em simulação. */
export function motivoSimulacao(m, chave) {
  if (!m.credenciais) return "sem credenciais do YouTube nos Secrets (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)";
  if (!m.pedidos[chave])
    return chave === "publicacao"
      ? `variável ${CHAVES[chave].variavel} não está como "${CHAVES[chave].valor}" e a execução não trouxe a confirmação ${CONFIRMACAO}`
      : `variável ${CHAVES[chave].variavel} não está como "${CHAVES[chave].valor}"`;
  if (chave === "automatica" && !m.pedidos.respostas) return `precisa também de ${CHAVES.respostas.variavel}=${CHAVES.respostas.valor}`;
  if (chave === "automatica") return "respostaAutomatica.habilitada está false em config/publicacao.json";
  return "";
}
