#!/usr/bin/env python3
"""Gera a narração de um episódio com Piper TTS e a linha do tempo palavra a palavra.

Uso:
  python scripts/tts.py --episode episodes/x.json --out build/x --voice-dir voices
  python scripts/tts.py --episode episodes/x.json --out build/x --mock   # sem voz (só para testar o visual)

Saídas em --out:
  narration.wav   narração completa (48 kHz, mono, loudness normalizada)
  ambient.wav     trilha ambiente sintetizada (opcional, sem direitos autorais)
  timeline.json   início/fim de cada cena e de cada palavra, em segundos
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_RATE = 48000

SENTENCE_RE = re.compile(r"[^.!?…]+[.!?…]*", re.UNICODE)


def split_sentences(text: str) -> list[str]:
    parts = [p.strip() for p in SENTENCE_RE.findall(text.replace("\n", " "))]
    return [p for p in parts if p]


def split_words(text: str) -> list[str]:
    return [w for w in text.split() if re.search(r"\w", w)]


def proportional_words(words: list[str], start: float, end: float) -> list[dict]:
    """Distribui o tempo da frase entre as palavras pelo tamanho de cada uma."""
    weights = [len(re.sub(r"\W", "", w)) + 1.5 for w in words]
    total = sum(weights)
    out, t = [], start
    for w, wt in zip(words, weights):
        d = (end - start) * wt / total
        out.append({"text": w, "start": round(t, 3), "end": round(t + d, 3)})
        t += d
    return out


def trim_silence(audio: np.ndarray, rate: int, thresh: float = 0.01) -> tuple[np.ndarray, int]:
    """Remove silêncio no começo e no fim. Retorna (áudio, amostras cortadas no início)."""
    idx = np.where(np.abs(audio) > thresh)[0]
    if len(idx) == 0:
        return audio, 0
    pad = int(0.04 * rate)
    a = max(0, idx[0] - pad)
    b = min(len(audio), idx[-1] + pad)
    return audio[a:b], a


class PiperEngine:
    def __init__(self, model_path: Path, length_scale: float):
        from piper import PiperVoice, SynthesisConfig

        self.voice = PiperVoice.load(str(model_path), include_alignments=True)
        self.rate = self.voice.config.sample_rate
        self.cfg = SynthesisConfig(length_scale=length_scale)

    def sentence(self, text: str) -> tuple[np.ndarray, list[dict], bool]:
        """Sintetiza uma frase. Retorna (áudio float32, palavras com tempo, alinhamento_real)."""
        words = split_words(text)
        chunks = list(self.voice.synthesize(text, syn_config=self.cfg, include_alignments=True))
        audio = np.concatenate([c.audio_float_array for c in chunks]) if chunks else np.zeros(1, np.float32)

        # Fronteiras de palavra a partir dos alinhamentos de fonemas (o espaço separa palavras).
        spans: list[tuple[int, int]] = []
        offset = 0
        ok = all(c.phoneme_alignments for c in chunks)
        if ok:
            for c in chunks:
                pos = offset
                cur_start = None
                for al in c.phoneme_alignments:
                    ph = al.phoneme
                    is_sound = ph not in ("^", "$", "_", " ") and re.search(r"\w", ph) is not None
                    if ph == " ":
                        if cur_start is not None:
                            spans.append((cur_start, pos))
                            cur_start = None
                    elif is_sound and cur_start is None:
                        cur_start = pos
                    pos += al.num_samples
                if cur_start is not None:
                    spans.append((cur_start, pos))
                offset += len(c.audio_float_array)

        trimmed, cut = trim_silence(audio, self.rate)
        dur = len(trimmed) / self.rate
        if ok and len(spans) == len(words):
            timed = []
            for w, (a, b) in zip(words, spans):
                s = max(0.0, (a - cut) / self.rate)
                e = min(dur, (b - cut) / self.rate)
                timed.append({"text": w, "start": round(s, 3), "end": round(max(e, s + 0.05), 3)})
            return trimmed, timed, True
        return trimmed, proportional_words(words, 0.0, dur), False


class MockEngine:
    """Gera um 'murmúrio' sintético com a duração aproximada da fala. Só para pré-visualizar."""

    rate = 22050

    def sentence(self, text: str) -> tuple[np.ndarray, list[dict], bool]:
        words = split_words(text)
        dur = max(0.6, len(text) / 15.0)
        n = int(dur * self.rate)
        t = np.arange(n) / self.rate
        env = (0.55 + 0.45 * np.sin(2 * np.pi * 4.5 * t)) * np.minimum(1, np.minimum(t, dur - t) * 20)
        rng = np.random.default_rng(len(text))
        sig = 0.5 * np.sin(2 * np.pi * 140 * t) + 0.25 * np.sin(2 * np.pi * 280 * t) + 0.1 * rng.standard_normal(n)
        return (0.6 * env * sig).astype(np.float32), proportional_words(words, 0.0, dur), False


def resample(audio: np.ndarray, src: int, dst: int) -> np.ndarray:
    if src == dst:
        return audio
    n = int(round(len(audio) * dst / src))
    x_old = np.linspace(0, 1, len(audio), endpoint=False)
    x_new = np.linspace(0, 1, n, endpoint=False)
    return np.interp(x_new, x_old, audio).astype(np.float32)


def write_wav(path: Path, audio: np.ndarray, rate: int) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def make_ambient(path: Path, duration: float) -> None:
    """Trilha ambiente escura: drone grave + ruído filtrado. Gerada do zero, sem licença de terceiros."""
    d = f"{duration:.3f}"
    fade_out = max(0.0, duration - 2.0)
    ffmpeg(
        "-f", "lavfi", "-i", f"sine=frequency=55:duration={d}:sample_rate={OUT_RATE}",
        "-f", "lavfi", "-i", f"sine=frequency=82.41:duration={d}:sample_rate={OUT_RATE}",
        "-f", "lavfi", "-i", f"sine=frequency=110:duration={d}:sample_rate={OUT_RATE}",
        "-f", "lavfi", "-i", f"anoisesrc=color=brown:amplitude=0.25:duration={d}:sample_rate={OUT_RATE}",
        "-filter_complex",
        "[0]volume=0.5[a];[1]volume=0.3,tremolo=f=0.15:d=0.6[b];[2]volume=0.12,tremolo=f=0.23:d=0.8[c];"
        "[3]lowpass=f=400,volume=0.35[n];"
        f"[a][b][c][n]amix=inputs=4:normalize=0,lowpass=f=900,afade=t=in:d=2,afade=t=out:st={fade_out:.3f}:d=2,"
        "loudnorm=I=-30:TP=-6:LRA=7",
        "-ar", str(OUT_RATE), "-ac", "1", str(path),
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice-dir", default=str(ROOT / "voices"))
    ap.add_argument("--channel", default=str(ROOT / "config" / "channel.json"))
    ap.add_argument("--mock", action="store_true", help="não usa Piper (pré-visualização sem voz)")
    args = ap.parse_args()

    episode = json.loads(Path(args.episode).read_text(encoding="utf-8"))
    channel = json.loads(Path(args.channel).read_text(encoding="utf-8"))
    voice_cfg = {**channel.get("voice", {}), **episode.get("voice", {})}
    model = voice_cfg.get("model", "pt_BR-faber-medium")
    length_scale = float(voice_cfg.get("lengthScale", 1.0))
    sentence_pause = float(voice_cfg.get("sentencePause", 0.22))
    scene_pause = float(voice_cfg.get("scenePause", 0.4))
    lead_in, tail = 0.35, 0.9

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.mock:
        engine = MockEngine()
        print("AVISO: modo --mock, a narração é sintética (sem voz).", file=sys.stderr)
    else:
        model_path = Path(args.voice_dir) / f"{model}.onnx"
        if not model_path.exists():
            print(f"Voz não encontrada: {model_path}. Rode: python -m piper.download_voices {model} --data-dir {args.voice_dir}", file=sys.stderr)
            return 2
        engine = PiperEngine(model_path, length_scale)

    pieces: list[np.ndarray] = [np.zeros(int(lead_in * OUT_RATE), np.float32)]
    t = lead_in
    scenes_out = []
    aligned_sentences = total_sentences = 0

    for si, scene in enumerate(episode["scenes"]):
        scene_start = t if si > 0 else 0.0
        words_out = []
        sentences = split_sentences(scene["narration"])
        for k, sent in enumerate(sentences):
            audio, words, aligned = engine.sentence(sent)
            total_sentences += 1
            aligned_sentences += int(aligned)
            audio = resample(audio, engine.rate, OUT_RATE)
            for w in words:
                words_out.append({"text": w["text"], "start": round(t + w["start"], 3), "end": round(t + w["end"], 3)})
            pieces.append(audio)
            t += len(audio) / OUT_RATE
            if k < len(sentences) - 1:
                pieces.append(np.zeros(int(sentence_pause * OUT_RATE), np.float32))
                t += sentence_pause
        is_last = si == len(episode["scenes"]) - 1
        pause = tail if is_last else scene_pause
        pieces.append(np.zeros(int(pause * OUT_RATE), np.float32))
        t += pause
        scenes_out.append({"id": scene["id"], "start": round(scene_start, 3), "end": round(t, 3), "words": words_out})

    audio = np.concatenate(pieces)
    raw = out / "narration_raw.wav"
    write_wav(raw, audio * 0.9, OUT_RATE)
    # Loudness padrão para redes sociais (-16 LUFS), sem alterar a duração.
    ffmpeg("-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(OUT_RATE), "-ac", "1", str(out / "narration.wav"))
    raw.unlink()

    duration = len(audio) / OUT_RATE
    music = {**channel.get("music", {}), **episode.get("music", {})}
    has_music = bool(music.get("enabled", True))
    if has_music:
        make_ambient(out / "ambient.wav", duration)

    timeline = {
        "duration": round(duration, 3),
        "engine": "mock" if args.mock else f"piper:{model}",
        "alignment": f"{aligned_sentences}/{total_sentences}",
        "music": {"enabled": has_music, "volume": float(music.get("volume", 0.09))},
        "scenes": scenes_out,
    }
    (out / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Narração: {duration:.2f}s | cenas: {len(scenes_out)} | frases alinhadas por fonema: {aligned_sentences}/{total_sentences}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
