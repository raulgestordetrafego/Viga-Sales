"""
Extrai texto de todos os PDFs do Curso Subido de Tráfego.
Uso: python3 scripts/extract_pdfs.py
"""

import os
import sys
import json
import pdfplumber

PDF_DIR = os.path.expanduser("~/Downloads/PDFs curso subido de tráfego")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "brain", "raw")
SUMMARY_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "brain", "index.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

def extract_pdf(filepath):
    text_parts = []
    try:
        with pdfplumber.open(filepath) as pdf:
            for i, page in enumerate(pdf.pages):
                txt = page.extract_text()
                if txt:
                    text_parts.append(f"--- Página {i+1} ---\n{txt}")
                tables = page.extract_tables()
                if tables:
                    for j, table in enumerate(tables):
                        if table:
                            text_parts.append(f"\n[ Tabela {j+1} na página {i+1} ]")
                            for row in table:
                                row_str = " | ".join([str(cell or "") for cell in row])
                                text_parts.append(row_str)
        return "\n\n".join(text_parts)
    except Exception as e:
        return f"[ERRO AO EXTRAIR: {e}]"

def parse_module_info(filename):
    name = filename.replace(".pdf", "")
    parts = name.split("_")
    modulo = ""
    aula = ""
    titulo_parts = []
    for part in parts:
        if part.startswith("m") and len(part) >= 3 and part[1].isdigit():
            modulo = part.upper()
            continue
        if "a" in part and any(c.isdigit() for c in part) and not part.startswith("cst"):
            aula = part.upper()
            continue
        if part in ("cst", "curso", "subido", "de", "trafego", "tráfego",
                     "prospecção", "e", "vendas", "material", "extra"):
            continue
        titulo_parts.append(part)
    titulo = " ".join(titulo_parts).replace("_", " ").strip()
    return modulo, aula, titulo

def main():
    pdfs = sorted([f for f in os.listdir(PDF_DIR) if f.endswith(".pdf")])
    print(f"Encontrados {len(pdfs)} PDFs")

    index = {"modulos": {}, "total_pdfs": len(pdfs), "arquivos": []}

    for i, filename in enumerate(pdfs):
        filepath = os.path.join(PDF_DIR, filename)
        modulo, aula, titulo = parse_module_info(filename)
        print(f"[{i+1}/{len(pdfs)}] Extraindo: {filename[:80]}...")

        texto = extract_pdf(filepath)
        char_count = len(texto)

        safe_name = filename.replace(".pdf", ".txt")
        out_path = os.path.join(OUTPUT_DIR, safe_name)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(texto)

        entry = {
            "arquivo": filename,
            "txt": safe_name,
            "modulo": modulo,
            "aula": aula,
            "titulo": titulo,
            "caracteres": char_count,
            "paginas_extraidas": texto.count("--- Página"),
        }
        index["arquivos"].append(entry)

        if modulo and modulo not in index["modulos"]:
            index["modulos"][modulo] = {"aulas": [], "total_caracteres": 0}
        if modulo:
            index["modulos"][modulo]["aulas"].append(entry)
            index["modulos"][modulo]["total_caracteres"] += char_count

    with open(SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    total_chars = sum(e["caracteres"] for e in index["arquivos"])
    print(f"\nFinalizado!")
    print(f"  PDFs processados: {len(pdfs)}")
    print(f"  Total de caracteres extraídos: {total_chars:,}")
    print(f"  Textos salvos em: {OUTPUT_DIR}")
    print(f"  Índice salvo em: {SUMMARY_PATH}")

if __name__ == "__main__":
    main()
