"""Voz do Gemini (ex.: Sadaltager) para a narração inteira, com tempo de cada palavra.

O plano grátis do Gemini aceita poucos pedidos por dia, então a narração vai em
poucos blocos (várias cenas por pedido). O Gemini não diz quando cada palavra é
falada; quem descobre é o Whisper (reconhecimento de fala gratuito, no próprio
computador do Actions), e depois cortamos o áudio de volta em cenas.
"""

from __future__ import annotations

import base64
import difflib
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request

import numpy as np

RATE = 24000
API = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"


def _norm(w: str) -> str:
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", w)


def blocos(textos: list[str], limite: int = 2600) -> list[list[int]]:
    """Agrupa cenas em blocos de até `limite` caracteres (cena nunca é partida)."""
    out, atual, n = [], [], 0
    for i, t in enumerate(textos):
        if atual and n + len(t) > limite:
            out.append(atual)
            atual, n = [], 0
        atual.append(i)
        n += len(t) + 2
    if atual:
        out.append(atual)
    return out


def pedir_audio(texto: str, cfg: dict, chave: str) -> np.ndarray:
    corpo = {
        "contents": [{"parts": [{"text": f"{cfg.get('estilo', '').strip()}\n\n{texto}".strip()}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cfg.get("voz", "Sadaltager")}}},
        },
    }
    url = API.format(modelo=cfg.get("modelo", "gemini-2.5-flash-preview-tts"))
    ultimo = None
    for tentativa in range(5):
        req = urllib.request.Request(url, data=json.dumps(corpo).encode(), headers={"content-type": "application/json", "x-goog-api-key": chave})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                j = json.loads(r.read())
            parte = j["candidates"][0]["content"]["parts"][0]["inlineData"]
            pcm = base64.b64decode(parte["data"])
            return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf8", "ignore")[:300]
            ultimo = f"HTTP {e.code}: {msg}"
            if e.code in (400, 401, 403):
                break  # chave errada ou pedido inválido: não adianta repetir
        except Exception as e:  # rede, resposta sem áudio
            ultimo = f"{type(e).__name__}: {e}"
        time.sleep(25 * (tentativa + 1))  # o plano grátis aceita ~3 pedidos por minuto
    raise RuntimeError(f"Gemini não gerou o áudio ({ultimo})")


_whisper = None


def tempos_das_palavras(audio: np.ndarray, palavras: list[str]) -> list[tuple[float, float]]:
    """Tempo (início, fim) de cada palavra do texto, achado pelo Whisper e alinhado ao texto."""
    global _whisper
    from faster_whisper import WhisperModel

    if _whisper is None:
        _whisper = WhisperModel(os.environ.get("WHISPER_MODELO", "small"), device="cpu", compute_type="int8")
    a16 = np.interp(np.arange(0, len(audio), RATE / 16000), np.arange(len(audio)), audio).astype(np.float32)
    segs, _ = _whisper.transcribe(a16, language="pt", word_timestamps=True, vad_filter=False, beam_size=1)
    ouvidas = [(w.word, w.start, w.end) for s in segs for w in (s.words or [])]
    return alinhar(palavras, ouvidas, len(audio) / RATE)


def alinhar(palavras: list[str], ouvidas: list[tuple[str, float, float]], dur: float) -> list[tuple[float, float]]:
    """Casa as palavras do roteiro com as reconhecidas; as que faltarem são interpoladas."""
    a = [_norm(p) for p in palavras]
    b = [_norm(w) for w, _, _ in ouvidas]
    tempos: list[tuple[float, float] | None] = [None] * len(palavras)
    for bloco in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(bloco.size):
            _, s, e = ouvidas[bloco.b + k]
            tempos[bloco.a + k] = (float(s), float(e))
    # preenche buracos dividindo o tempo entre vizinhos conhecidos
    i = 0
    while i < len(tempos):
        if tempos[i] is not None:
            i += 1
            continue
        j = i
        while j < len(tempos) and tempos[j] is None:
            j += 1
        ini = tempos[i - 1][1] if i > 0 else 0.0
        fim = tempos[j][0] if j < len(tempos) else dur
        passo = max(0.0, fim - ini) / (j - i)
        for k in range(i, j):
            tempos[k] = (ini + passo * (k - i), ini + passo * (k - i + 1))
        i = j
    return [(round(s, 3), round(max(e, s + 0.05), 3)) for s, e in tempos]  # type: ignore[misc]


def narrar_cenas(textos: list[str], cfg: dict, chave: str, split_words, log=print) -> list[tuple[np.ndarray, list[dict]]]:
    """Devolve, para cada cena, (áudio a 24 kHz, palavras com tempo relativo ao começo da cena)."""
    resultado: list[tuple[np.ndarray, list[dict]] | None] = [None] * len(textos)
    grupos = blocos(textos, int(cfg.get("caracteresPorPedido", 2600)))
    for gi, grupo in enumerate(grupos):
        if gi:
            time.sleep(21)  # respeita o limite por minuto do plano grátis
        texto = "\n\n".join(textos[i] for i in grupo)
        audio = pedir_audio(texto, cfg, chave)
        dur = len(audio) / RATE
        esperado = len(texto) / 17.0
        if dur < esperado * 0.55:
            raise RuntimeError(f"áudio curto demais ({dur:.0f}s para ~{esperado:.0f}s de texto); o Gemini pode ter cortado a fala")
        palavras_por_cena = [split_words(textos[i]) for i in grupo]
        todas = [w for ws in palavras_por_cena for w in ws]
        tempos = tempos_das_palavras(audio, todas)
        log(f"  bloco {gi + 1}/{len(grupos)}: {dur:.1f}s, {len(todas)} palavras")
        # corta entre a última palavra de uma cena e a primeira da próxima
        k = 0
        limites = []
        for ws in palavras_por_cena:
            limites.append((k, k + len(ws)))
            k += len(ws)
        cortes = [0.0]
        for (a0, a1), (b0, _) in zip(limites, limites[1:]):
            fim_cena = tempos[a1 - 1][1] if a1 > a0 else cortes[-1]
            ini_prox = tempos[b0][0]
            cortes.append((fim_cena + ini_prox) / 2 if ini_prox > fim_cena else ini_prox)
        cortes.append(dur)
        for ci, (i, (a0, a1)) in enumerate(zip(grupo, limites)):
            c0, c1 = cortes[ci], cortes[ci + 1]
            seg = audio[int(c0 * RATE) : int(c1 * RATE)]
            words = [{"text": todas[x], "start": round(max(0.0, tempos[x][0] - c0), 3), "end": round(max(0.05, tempos[x][1] - c0), 3)} for x in range(a0, a1)]
            resultado[i] = (seg, words)
    return resultado  # type: ignore[return-value]
