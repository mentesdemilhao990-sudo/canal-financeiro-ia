#!/usr/bin/env python3
"""Estuda os vídeos mais vistos dos canais de referência (só estilo, não conteúdo).

Para cada canal: pega os vídeos longos e Shorts mais vistos, salva título,
duração, visualizações, capítulos, a transcrição (legenda automática) e alguns
quadros pequenos do começo do vídeo. Resultado em referencias/<canal>/.
"""
import json, re, subprocess, sys
from pathlib import Path

import yt_dlp

ROOT = Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "pedidos/referencias.json").read_text(encoding="utf-8"))
OUT = ROOT / "referencias"
OUT.mkdir(exist_ok=True)
BASE = {"quiet": True, "no_warnings": True, "ignoreerrors": True}


def listar(url, n):
    with yt_dlp.YoutubeDL({**BASE, "extract_flat": True, "playlistend": 60}) as y:
        info = y.extract_info(url, download=False) or {}
    vids = [e for e in info.get("entries") or [] if e and e.get("id")]
    vids.sort(key=lambda e: e.get("view_count") or 0, reverse=True)
    return vids[:n]


def vtt_para_texto(p: Path) -> str:
    linhas, ult = [], None
    for l in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "-->" in l or not l.strip() or l.startswith(("WEBVTT", "Kind:", "Language:")):
            continue
        l = re.sub(r"<[^>]+>", "", l).strip()
        if l and l != ult:
            linhas.append(l)
            ult = l
    return " ".join(linhas)


def estudar(vid, pasta: Path, tipo: str):
    vid_id = vid["id"]
    alvo = pasta / f"{tipo}-{vid_id}"
    alvo.mkdir(parents=True, exist_ok=True)
    opts = {
        **BASE,
        "skip_download": False,
        "format": "worst[height>=240][ext=mp4]/worst[ext=mp4]/worst",
        "outtmpl": str(alvo / "video.%(ext)s"),
        "writeautomaticsub": True,
        "writesubtitles": True,
        "subtitleslangs": ["pt", "pt-BR", "pt-orig"],
        "subtitlesformat": "vtt",
        "download_ranges": yt_dlp.utils.download_range_func(None, [(0, 75)]),
    }
    with yt_dlp.YoutubeDL(opts) as y:
        info = y.extract_info(f"https://www.youtube.com/watch?v={vid_id}", download=True) or {}
    meta = {k: info.get(k) for k in ["id", "title", "duration", "view_count", "like_count", "upload_date", "description", "chapters", "tags"]}
    subs = sorted(alvo.glob("*.vtt"))
    meta["transcricao"] = vtt_para_texto(subs[0]) if subs else ""
    for s in subs:
        s.unlink()
    videos = [p for p in alvo.glob("video.*")]
    if videos:
        # um quadro a cada 3 s do começo (gancho), pequeno
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(videos[0]), "-t", "60", "-vf", "fps=1/3,scale=320:-2", "-q:v", "6", str(alvo / "q%02d.jpg")])
        for v in videos:
            v.unlink()
    (alvo / "info.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  ok {tipo} {vid_id} {meta['title']!r} views={meta['view_count']} dur={meta['duration']} transc={len(meta['transcricao'])}")


for canal in cfg["canais"]:
    pasta = OUT / canal.lstrip("@")
    print(f"== {canal}")
    try:
        longos = listar(f"https://www.youtube.com/{canal}/videos", cfg["videosPorCanal"])
        shorts = listar(f"https://www.youtube.com/{canal}/shorts", cfg["shortsPorCanal"])
    except Exception as e:
        print(f"  falhou ao listar: {e}")
        continue
    (pasta).mkdir(parents=True, exist_ok=True)
    (pasta / "lista.json").write_text(json.dumps([{k: v.get(k) for k in ["id", "title", "view_count", "duration"]} for v in longos + shorts], ensure_ascii=False, indent=2), encoding="utf-8")
    for tipo, lst in (("longo", longos), ("short", shorts)):
        for v in lst:
            try:
                estudar(v, pasta, tipo)
            except Exception as e:
                print(f"  falhou {v.get('id')}: {e}")
