"""
Consolida todos os conteúdos extraídos (PDFs + YouTube) em um JSON estruturado
e gera prompts otimizados para processamento com IA.
"""
import os
import json
import re

RAW_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "brain", "raw")
BRAIN_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "brain")
INDEX_PATH = os.path.join(BRAIN_DIR, "index.json")
CONSOLIDATED_PATH = os.path.join(BRAIN_DIR, "consolidated.json")

MODULO_TEMAS = {
    "M2": "Fundamentos e Conceitos Universais do Tráfego Pago",
    "M3": "Meta Ads (Facebook/Instagram) - Configuração e Estrutura",
    "M4": "Google Ads - Configuração e Estrutura",
    "M5": "Otimização de Campanhas e Métricas",
    "M6": "Estratégia Avançada e Planejamento",
    "M10": "Informações Importantes",
}

def normalize_title(filename):
    name = filename.replace(".pdf", "").replace(".txt", "")
    name = re.sub(r'cst_curso_subido_d[e_]\w+\s?d[e_]?\s?\w+\s?', '', name)
    name = name.replace("_", " ").strip()
    name = re.sub(r'm(\d+)a(\d+)', r'M\1 A\2', name)
    name = re.sub(r'\s+', ' ', name)
    return name

def get_modulo_group(modulo_str):
    if not modulo_str:
        return "Outros"
    match = re.match(r'(M\d+)', modulo_str.upper())
    if match:
        m = match.group(1)
        return MODULO_TEMAS.get(m, f"Módulo {m} - Tema não mapeado")
    return modulo_str

def main():
    with open(INDEX_PATH) as f:
        index = json.load(f)

    modulos = {}
    youtube_file = os.path.join(RAW_DIR, "youtube_google_ads_2026_live365.txt")
    youtube_content = ""
    if os.path.exists(youtube_file):
        with open(youtube_file) as f:
            youtube_content = f.read()

    for entry in index["arquivos"]:
        txt_path = os.path.join(RAW_DIR, entry["txt"])
        if not os.path.exists(txt_path):
            continue

        with open(txt_path) as f:
            content = f.read()

        grupo = get_modulo_group(entry["modulo"])
        if grupo not in modulos:
            modulos[grupo] = {
                "tema": grupo,
                "aulas": [],
                "total_caracteres": 0,
                "total_paginas": 0,
            }

        aula_info = {
            "arquivo": entry["arquivo"],
            "titulo": normalize_title(entry["arquivo"]),
            "caracteres": entry["caracteres"],
            "paginas": entry["paginas_extraidas"],
            "conteudo": content,
        }
        modulos[grupo]["aulas"].append(aula_info)
        modulos[grupo]["total_caracteres"] += entry["caracteres"]
        modulos[grupo]["total_paginas"] += entry["paginas_extraidas"]

    consolidated = {
        "fonte": "Curso Subido de Tráfego + Live Google Ads 2026",
        "total_caracteres": sum(m["total_caracteres"] for m in modulos.values()),
        "total_aulas": sum(len(m["aulas"]) for m in modulos.values()),
        "youtube_live": {
            "titulo": "Google Ads 2026: como anunciar | Live #365",
            "url": "https://www.youtube.com/watch?v=IBOEc4ynCSA",
            "duracao": "84 minutos",
            "caracteres": len(youtube_content),
            "conteudo": youtube_content,
        },
        "modulos": modulos,
    }

    with open(CONSOLIDATED_PATH, "w", encoding="utf-8") as f:
        json.dump(consolidated, f, ensure_ascii=False, indent=2)

    print("=== CONSOLIDAÇÃO ===")
    for grupo, data in sorted(modulos.items()):
        print(f"  {grupo}: {len(data['aulas'])} aulas | {data['total_caracteres']:,} chars")
    print(f"  YouTube Live: {len(youtube_content):,} chars")
    print(f"  TOTAL: {consolidated['total_caracteres'] + len(youtube_content):,} chars")
    print(f"\nSalvo em: {CONSOLIDATED_PATH}")

if __name__ == "__main__":
    main()
