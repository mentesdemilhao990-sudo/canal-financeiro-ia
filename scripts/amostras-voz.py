#!/usr/bin/env python3
"""Gera amostras de várias vozes neurais gratuitas (Edge) com o mesmo texto.

Resultado em amostras-voz/<n>-<voz>.mp3 e amostras-voz/lista.json.
"""
import asyncio, json
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


asyncio.run(main())
