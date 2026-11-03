#!/usr/bin/env python3
"""Gera amostras de várias vozes neurais gratuitas (Edge) com o mesmo texto.

Resultado em amostras-voz/<n>-<voz>.mp3 e amostras-voz/lista.json.
"""
import asyncio, json, os
from pathlib import Path

import edge_tts

TEXTO = (
    "Pegar o seu décimo terceiro e investir pode ser o pior negócio do seu ano. "
    "Parece loucura, né? Imagina a Ana. Ela recebeu três mil reais, mas também deve três mil no cartão de crédito. "
    "Fica até o final que eu te mostro a conta."
)
# vozes multilíngues que também falam português, além das brasileiras
EXTRAS = ["MultilingualNeural"]
VARIACOES = {"pt-BR-AntonioNeural": [("+0%", "+0Hz"), ("+8%", "-4Hz")]}
OUT = Path("amostras-voz")


async def main():
    OUT.mkdir(exist_ok=True)
    vozes = await edge_tts.list_voices()
    escolhidas = [v for v in vozes if v["Locale"] == "pt-BR" or any(e in v["ShortName"] for e in EXTRAS)]
    # das multilíngues, só as mais conhecidas (para não virar uma lista enorme)
    preferidas = ("Andrew", "Brian", "Ava", "Emma", "Florian", "Remy", "Seraphina", "Vivienne", "Macerio", "Thalita")
    escolhidas = [v for v in escolhidas if v["Locale"] == "pt-BR" or any(p in v["ShortName"] for p in preferidas)]
    lista, n = [], 0
    for v in escolhidas:
        for rate, pitch in VARIACOES.get(v["ShortName"], [("+0%", "+0Hz")]):
            n += 1
            nome = f"{n:02d}-{v['ShortName']}{'' if rate == '+0%' else '-ritmo-rapido'}.mp3"
            try:
                await edge_tts.Communicate(TEXTO, v["ShortName"], rate=rate, pitch=pitch).save(str(OUT / nome))
                lista.append({"arquivo": nome, "voz": v["ShortName"], "genero": v["Gender"], "idioma": v["Locale"], "rate": rate, "pitch": pitch})
                print("ok", nome)
            except Exception as e:
                print("falhou", v["ShortName"], e)
    (OUT / "lista.json").write_text(json.dumps(lista, ensure_ascii=False, indent=2), encoding="utf-8")


def gemini():
    """Amostra da voz do Gemini, se houver chave."""
    import os, subprocess, sys, wave

    chave = os.environ.get("GEMINI_API_KEY", "").strip()
    if not chave:
        print("sem GEMINI_API_KEY")
        return
    sys.path.insert(0, "scripts")
    from voz_gemini import pedir_audio

    cfg = json.loads(Path("config/channel.json").read_text(encoding="utf-8"))["voice"]["gemini"]
    import numpy as np

    for voz in [cfg["voz"]] + [v for v in os.environ.get("GEMINI_VOZES_EXTRA", "").split(",") if v]:
        try:
            audio = pedir_audio(TEXTO, {**cfg, "voz": voz}, chave)
        except Exception as e:
            print("falhou", voz, e)
            continue
        wav = OUT / f"gemini-{voz}.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
            w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-b:a", "128k", str(OUT / f"gemini-{voz}.mp3")], check=True)
        wav.unlink()
        print("ok gemini", voz)


if os.environ.get("SO_GEMINI"):
    gemini()
else:
    asyncio.run(main())
    gemini()
