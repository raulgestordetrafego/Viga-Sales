#!/usr/bin/env python3
"""
Ferramenta de busca inteligente no Cérebro de Tráfego Pago.
Uso: python3 scripts/query_brain.py "<pergunta>"
     python3 scripts/query_brain.py --keywords "campanha pesquisa google"
     python3 scripts/query_brain.py --topic google-ads
     python3 scripts/query_brain.py --list
"""

import os
import sys
import json
import re

BRAIN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "brain")
INDEX_PATH = os.path.join(BRAIN_DIR, "search_index.json")

def load_index():
    with open(INDEX_PATH, encoding='utf-8') as f:
        return json.load(f)

def list_topics():
    index = load_index()
    print(json.dumps({"topics": {k: v["descricao"] for k, v in index["topicos"].items()}, "rotas": index.get("rotas_inteligentes", {})}, ensure_ascii=False, indent=2))

def get_topic(topic_name):
    index = load_index()
    if topic_name not in index["topicos"]:
        print(json.dumps({"error": f"Tópico '{topic_name}' não encontrado", "disponiveis": list(index["topicos"].keys())}, ensure_ascii=False))
        sys.exit(1)

    arquivo_rel = index["topicos"][topic_name]["arquivo"]
    # Remove 'brain/' prefix if present since we're already in brain dir
    if arquivo_rel.startswith("brain/"):
        arquivo_rel = arquivo_rel[6:]
    arquivo = os.path.join(BRAIN_DIR, arquivo_rel)
    if not os.path.exists(arquivo):
        print(json.dumps({"error": f"Arquivo {arquivo} não encontrado"}, ensure_ascii=False))
        sys.exit(1)

    with open(arquivo, encoding='utf-8') as f:
        content = f.read()

    # Extract just the Quick Summary and section headers for fast scanning
    summary = ""
    match = re.search(r'## Quick Summary\n(.*?)(?=\n## |\n---)', content, re.DOTALL)
    if match:
        summary = match.group(1).strip()

    sections = re.findall(r'^###?\s+(.+)$', content, re.MULTILINE)
    keywords = re.findall(r'<!-- KEYWORDS:\s*(.+?)\s*-->', content)

    return {
        "topico": topic_name,
        "descricao": index["topicos"][topic_name]["descricao"],
        "summary": summary,
        "secoes": sections,
        "keywords": keywords[0].split(", ") if keywords else [],
        "conteudo_completo": content,
        "arquivo": arquivo
    }

def search_keywords(query):
    index = load_index()
    query_lower = query.lower()
    words = re.findall(r'\w+', query_lower)

    scores = {}
    for topic_name, topic_data in index["topicos"].items():
        score = 0
        all_keywords = " ".join(topic_data["keywords"]).lower()
        desc = topic_data["descricao"].lower()

        for word in words:
            if word in all_keywords:
                score += 2
            if word in desc:
                score += 1

        if score > 0:
            scores[topic_name] = score

    # Check smart routes
    matched_routes = []
    if "rotas_inteligentes" in index:
        for route_desc, route_topics in index["rotas_inteligentes"].items():
            route_words = re.findall(r'\w+', route_desc.lower())
            if any(w in query_lower for w in route_words):
                matched_routes.append(route_desc)

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    results = []
    for topic_name, score in ranked:
        topic = get_topic(topic_name)
        results.append({
            "topico": topic_name,
            "score": score,
            "descricao": topic["descricao"],
            "summary": topic["summary"],
            "secoes": topic["secoes"],
            "keywords": topic["keywords"][:10],
            "arquivo": topic["arquivo"]
        })

    return {
        "query": query,
        "results": results,
        "routes_matched": matched_routes,
        "total_topics": len(index["topicos"])
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: query_brain.py '<pergunta>' | --list | --topic <nome> | --keywords <termos>"}, ensure_ascii=False))
        sys.exit(1)

    arg = sys.argv[1]

    if arg == "--list":
        list_topics()
    elif arg == "--topic":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "--topic requer nome do tópico"}, ensure_ascii=False))
            sys.exit(1)
        result = get_topic(sys.argv[2])
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif arg == "--keywords":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "--keywords requer termos de busca"}, ensure_ascii=False))
            sys.exit(1)
        query = " ".join(sys.argv[2:])
        result = search_keywords(query)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        query = " ".join(sys.argv[1:])
        result = search_keywords(query)
        print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
