#!/usr/bin/env python3
"""
Atualiza o cérebro de tráfego com novos conteúdos do YouTube.
Busca vídeos recentes sobre tópicos de tráfego pago, transcreve e adiciona.
Uso: python3 scripts/update_brain.py
     python3 scripts/update_brain.py --topics "google ads 2026" "meta ads criativos" --max 3
"""

import os
import sys
import json
import subprocess
import re
from datetime import datetime

BRAIN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "brain")
CLEAN_DIR = os.path.join(BRAIN_DIR, "clean")
RAW_DIR = os.path.join(BRAIN_DIR, "raw")
os.makedirs(CLEAN_DIR, exist_ok=True)
os.makedirs(RAW_DIR, exist_ok=True)

# Tópicos para busca semanal
DEFAULT_TOPICS = [
    "trafego pago google ads 2026 novidades",
    "meta ads campanhas vantagens novidades 2026",
    "otimizacao campanhas trafego pago metricas",
    "anuncios online estrategia criativos converters",
    "performance max PMax google ads tutorial",
    "facebook ads segmentacao publicos lookalike",
    "copywriting anuncios ganchos vender mais",
    "trafego pago iniciante passo a passo",
]

def clean_text(text):
    """Remove [música], caracteres não-PT, linhas muito curtas"""
    lines = []
    for line in text.split('\n'):
        line = re.sub(r'^\[\d+\.\d+s\]\s*', '', line).strip()
        if not line:
            continue
        if '[música]' in line.lower() or '[music]' in line.lower():
            continue
        if '[aplausos]' in line.lower():
            continue
        pt_chars = len(re.findall(r'[a-zA-ZáéíóúãõâêôàèìòùçÁÉÍÓÚÃÕÂÊÔÀÈÌÒÙÇ0-9\s.,;:!?()\-"\'/%$@#&*+=<>\[\]{}|~^]', line))
        if len(line) > 0 and pt_chars / len(line) < 0.7:
            continue
        if len(line) < 3:
            continue
        line = re.sub(r'\s+', ' ', line).strip()
        if line:
            lines.append(line)
    return '\n'.join(lines)

def search_youtube(query, max_results=3):
    """Busca vídeos no YouTube usando yt-dlp e retorna URLs"""
    try:
        cmd = ['yt-dlp', f'ytsearch{max_results}:{query}', '--get-id', '--get-title', '--get-duration', '--no-playlist', '--flat-playlist']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return []

        lines = result.stdout.strip().split('\n')
        videos = []
        for i in range(0, len(lines), 3):
            if i + 2 < len(lines):
                video_id = lines[i].strip()
                title = lines[i+1].strip() if i+1 < len(lines) else ''
                duration = lines[i+2].strip() if i+2 < len(lines) else ''
                if video_id and len(video_id) == 11:  # YouTube ID has 11 chars
                    videos.append({
                        'id': video_id,
                        'title': title,
                        'duration': duration,
                        'url': f'https://www.youtube.com/watch?v={video_id}'
                    })
        return videos
    except Exception as e:
        print(f"  Erro busca: {e}")
        return []

def transcribe_video(video_id):
    """Transcreve um vídeo usando youtube-transcript-api"""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()
        t = api.fetch(video_id, languages=['pt', 'pt-BR', 'en'])
        lines = [f'[{line.start:.1f}s] {line.text}' for line in t]
        return '\n'.join(lines), t[-1].start + t[-1].duration
    except Exception as e:
        print(f"    Transcrição falhou: {e}")
        return None, 0

def update_brain(topics=None, max_per_topic=2):
    """Busca, transcreve e adiciona novos vídeos ao cérebro"""
    topics = topics or DEFAULT_TOPICS[:4]  # 4 tópicos por semana
    new_videos = []
    processed = set()

    # Carrega IDs já processados
    existing = set()
    for f in os.listdir(RAW_DIR):
        if f.startswith('youtube_') and f.endswith('.txt'):
            existing.add(f.replace('youtube_', '').replace('.txt', ''))

    for topic in topics:
        print(f"\n🔍 Buscando: {topic}")
        videos = search_youtube(topic, max_per_topic + 1)

        for v in videos:
            if v['id'] in existing or v['id'] in processed:
                continue
            processed.add(v['id'])

            print(f"  📹 {v['title'][:80]}...")
            text, duration = transcribe_video(v['id'])

            if text is None:
                continue

            # Salva raw
            raw_path = os.path.join(RAW_DIR, f'youtube_{v["id"]}.txt')
            with open(raw_path, 'w', encoding='utf-8') as f:
                f.write(text)

            # Salva limpo
            clean_path = os.path.join(CLEAN_DIR, f'youtube_{v["id"]}.txt')
            cleaned = clean_text(text)
            with open(clean_path, 'w', encoding='utf-8') as f:
                f.write(cleaned)

            new_videos.append({
                'id': v['id'],
                'title': v['title'],
                'url': v['url'],
                'duration_min': round(duration / 60, 1),
                'topic': topic,
                'added_at': datetime.now().isoformat(),
                'chars_raw': len(text),
                'chars_clean': len(cleaned),
            })

            print(f"    ✅ {duration/60:.1f}min | {len(text):,}→{len(cleaned):,} chars")

    # Atualiza o log de atualizações
    log_path = os.path.join(BRAIN_DIR, "updates_log.json")
    log = []
    if os.path.exists(log_path):
        with open(log_path) as f:
            try:
                log = json.load(f)
            except:
                log = []

    if new_videos:
        log.append({
            'date': datetime.now().isoformat(),
            'videos_added': len(new_videos),
            'topics_searched': topics,
            'videos': new_videos
        })

    with open(log_path, 'w', encoding='utf-8') as f:
        json.dump(log, f, ensure_ascii=False, indent=2)

    return new_videos

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Atualiza o cérebro de tráfego')
    parser.add_argument('--topics', nargs='+', help='Tópicos para buscar')
    parser.add_argument('--max', type=int, default=2, help='Máx vídeos por tópico')
    parser.add_argument('--full', action='store_true', help='Busca todos os tópicos padrão')
    args = parser.parse_args()

    topics = args.topics if args.topics else (DEFAULT_TOPICS if args.full else DEFAULT_TOPICS[:4])
    max_per = args.max

    print(f"🧠 Atualizando Cérebro de Tráfego")
    print(f"   Tópicos: {len(topics)}")
    print(f"   Máx por tópico: {max_per}")
    print(f"   Data: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    new = update_brain(topics, max_per)

    print(f"\n📊 RESULTADO:")
    print(f"   Vídeos novos: {len(new)}")
    if new:
        for v in new:
            print(f"   • {v['title'][:70]} ({v['duration_min']}min)")
    print(f"   Total raw: {len(os.listdir(RAW_DIR))} arquivos")
    print(f"   Próxima atualização: próxima semana")

if __name__ == '__main__':
    main()
