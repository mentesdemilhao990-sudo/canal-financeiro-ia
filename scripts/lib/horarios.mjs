// Horários de publicação sorteados: cada dia os vídeos saem numa hora diferente,
// dentro de uma janela (horário de Brasília). O sorteio usa o dia e o episódio
// como semente, então rodar de novo no mesmo dia dá o mesmo horário.
import { createHash } from "node:crypto";

const BRT = -3; // Brasília não tem horário de verão desde 2019

/** Número entre 0 e 1 a partir de um texto (sempre o mesmo para o mesmo texto). */
function sorteio(texto) {
  return parseInt(createHash("sha256").update(texto).digest("hex").slice(0, 12), 16) / 2 ** 48;
}

/** Date para AAAA-MM-DD + minutos desde a meia-noite de Brasília. */
function emBrasilia(dia, minutos) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 0, minutos - BRT * 60));
}

/** "AAAA-MM-DD" de hoje em Brasília. */
export function hojeEmBrasilia(agora = new Date()) {
  return new Date(agora.getTime() + BRT * 3600e3).toISOString().slice(0, 10);
}

/** "14:37" em Brasília. */
export function horaBrasilia(data) {
  return new Date(data.getTime() + BRT * 3600e3).toISOString().slice(11, 16);
}

/**
 * Sorteia um horário por episódio, em ordem, dentro da janela [inicio, fim] (horas de Brasília),
 * com pelo menos `intervaloMin` minutos entre um e outro e nunca antes de `agora + antecedenciaMin`.
 * Devolve { [id]: Date | null }; null = a janela já passou, publique na hora.
 */
export function horariosAleatorios(ids, { dia, inicio = 10, fim = 21, intervaloMin = 120, antecedenciaMin = 20, agora = new Date() } = {}) {
  const resultado = {};
  let minimo = Math.ceil((agora.getTime() + antecedenciaMin * 60e3 - emBrasilia(dia, 0).getTime()) / 60e3);
  minimo = Math.max(minimo, inicio * 60);
  const limite = fim * 60;
  ids.forEach((id, i) => {
    // Deixa espaço para os próximos episódios caberem depois deste.
    const teto = limite - intervaloMin * (ids.length - 1 - i);
    if (minimo > teto) {
      resultado[id] = null;
      return;
    }
    const min = Math.round(minimo + sorteio(`${dia}|${id}`) * (teto - minimo));
    resultado[id] = emBrasilia(dia, min);
    minimo = min + intervaloMin;
  });
  return resultado;
}
