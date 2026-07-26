"""
Limpa transcrições do YouTube: remove [música], caracteres não-PT, silêncios, linhas curtas.
"""
import os
import re

RAW_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "brain", "raw")
CLEAN_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "brain", "clean")
os.makedirs(CLEAN_DIR, exist_ok=True)

def is_mostly_non_pt(text, threshold=0.3):
    """Remove linhas com muitos caracteres não-portugueses"""
    pt_chars = len(re.findall(r'[a-zA-ZáéíóúãõâêôàèìòùçÁÉÍÓÚÃÕÂÊÔÀÈÌÒÙÇ0-9\s.,;:!?()\-"\'/%$@#&*+=<>\[\]{}|~^]', text))
    total = len(text)
    if total == 0:
        return True
    return pt_chars / total < (1 - threshold)

def clean_transcript(filepath):
    lines = []
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    cleaned_lines = []
    music_block = False

    for line in content.split('\n'):
        # Remove timestamp
        text = re.sub(r'^\[\d+\.\d+s\]\s*', '', line).strip()
        
        if not text:
            continue
        
        # Remove music and sound markers
        if text in ('[música]', '[Música]', '[Music]', '[music]', '[Aplausos]', '[Applause]', '[Risadas]'):
            continue
        
        # Remove music blocks (consecutive music)
        if '[música]' in text.lower() or '[music]' in text.lower():
            continue

        # Remove non-PT content
        if is_mostly_non_pt(text):
            continue

        # Remove very short lines (likely noise)
        if len(text) < 3:
            continue

        # Clean up text
        text = re.sub(r'\s+', ' ', text).strip()
        
        if text:
            cleaned_lines.append(text)

    return '\n'.join(cleaned_lines)

def main():
    files = sorted([f for f in os.listdir(RAW_DIR) if f.startswith('youtube_')])
    stats = {'total_chars_before': 0, 'total_chars_after': 0, 'files': 0}
    
    for fname in files:
        raw_path = os.path.join(RAW_DIR, fname)
        clean_path = os.path.join(CLEAN_DIR, fname)
        
        cleaned = clean_transcript(raw_path)
        
        with open(raw_path) as f:
            before = len(f.read())
        after = len(cleaned)
        
        with open(clean_path, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        
        reduction = (1 - after/before) * 100 if before > 0 else 0
        print(f"  {fname}: {before:,} → {after:,} chars ({reduction:.0f}% limpo)")
        stats['total_chars_before'] += before
        stats['total_chars_after'] += after
        stats['files'] += 1
    
    total_reduction = (1 - stats['total_chars_after']/stats['total_chars_before']) * 100
    print(f"\nTOTAL: {stats['total_chars_before']:,} → {stats['total_chars_after']:,} chars ({total_reduction:.0f}% limpo)")
    print(f"Arquivos limpos: {stats['files']}")

if __name__ == '__main__':
    main()
