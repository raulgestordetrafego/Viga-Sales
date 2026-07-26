const pptxgen = require("pptxgenjs");

// ─── CORES OFICIAIS ───────────────────────────────────────────
const NAVY    = "1B365D";
const ORANGE  = "E8910D";
const GRAY    = "8E8E8E";
const CREAM   = "F4F4F4";
const WHITE   = "FFFFFF";
const BLACK   = "1A1A1A";

// ─── HELPERS ──────────────────────────────────────────────────
const makeShadow = () => ({ type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.12 });

function addSlideHeader(slide, title) {
  // Orange top bar
  slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.07, fill: { color: ORANGE }, line: { color: ORANGE } });
  // Section label
  slide.addText(title.toUpperCase(), {
    x: 0.5, y: 0.15, w: 9, h: 0.4,
    fontSize: 9, fontFace: "Arial", bold: true,
    color: ORANGE, charSpacing: 4, margin: 0,
  });
}

function addSlideNumber(slide, num) {
  slide.addText(String(num).padStart(2, "0"), {
    x: 9.2, y: 5.1, w: 0.6, h: 0.35,
    fontSize: 10, fontFace: "Arial", color: GRAY, align: "right", margin: 0,
  });
}

// ──────────────────────────────────────────────────────────────
let pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "Manual de Identidade Visual — Viga Sales";

// ═══════════════════════════════════════════════════════════════
// SLIDE 1 — CAPA
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: NAVY };

  // Accent left stripe
  s.addShape("rect", { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: ORANGE }, line: { color: ORANGE } });

  // Decorative grid lines (blueprint feel)
  for (let i = 0; i < 6; i++) {
    s.addShape("line", {
      x: 0.5, y: 0.5 + i * 0.9, w: 9, h: 0,
      line: { color: WHITE, width: 0.3, transparency: 85 },
    });
  }
  for (let i = 0; i < 11; i++) {
    s.addShape("line", {
      x: 0.5 + i * 0.9, y: 0.5, w: 0, h: 4.6,
      line: { color: WHITE, width: 0.3, transparency: 85 },
    });
  }

  // Logo icon — isometric blocks (simplified with shapes)
  // Base pillar (navy dark)
  s.addShape("rect", { x: 1.55, y: 1.5, w: 0.22, h: 0.7, fill: { color: "142849" }, line: { color: "142849" } });
  // Top block orange
  s.addShape("rect", { x: 1.48, y: 1.3, w: 0.36, h: 0.25, fill: { color: ORANGE }, line: { color: ORANGE } });
  // Upper block
  s.addShape("rect", { x: 1.48, y: 1.05, w: 0.36, h: 0.28, fill: { color: "1E4A7B" }, line: { color: "1E4A7B" } });

  // VIGA  SALES wordmark
  s.addText("VIGA", {
    x: 1.9, y: 1.0, w: 3.5, h: 0.7,
    fontSize: 48, fontFace: "Arial Black", bold: true,
    color: WHITE, margin: 0,
  });
  s.addText("SALES", {
    x: 1.9, y: 1.65, w: 3.5, h: 0.5,
    fontSize: 30, fontFace: "Arial Black", bold: true,
    color: ORANGE, margin: 0,
  });

  // Divider line
  s.addShape("line", {
    x: 1.55, y: 2.35, w: 6.2, h: 0,
    line: { color: ORANGE, width: 1.5 },
  });

  // Document title
  s.addText("MANUAL DE IDENTIDADE VISUAL", {
    x: 1.55, y: 2.5, w: 7, h: 0.55,
    fontSize: 20, fontFace: "Arial", bold: true,
    color: WHITE, charSpacing: 3, margin: 0,
  });

  // Version / year
  s.addText("Versão 1.0  |  2026  |  Uso Exclusivo Viga Sales", {
    x: 1.55, y: 3.1, w: 7, h: 0.35,
    fontSize: 11, fontFace: "Arial", color: GRAY, margin: 0,
  });

  // Bottom bar
  s.addShape("rect", { x: 0, y: 5.3, w: 10, h: 0.325, fill: { color: "142849" }, line: { color: "142849" } });
  s.addText("PRECISÃO NA CONSTRUÇÃO — SOLIDEZ NOS RESULTADOS", {
    x: 0.5, y: 5.32, w: 9, h: 0.28,
    fontSize: 8, fontFace: "Arial", color: GRAY, charSpacing: 2,
    align: "center", margin: 0,
  });
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 2 — SUMÁRIO
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: CREAM };
  addSlideHeader(s, "Sumário");

  s.addText("O QUE VOCÊ ENCONTRA AQUI", {
    x: 0.5, y: 0.7, w: 9, h: 0.55,
    fontSize: 26, fontFace: "Arial Black", bold: true,
    color: NAVY, margin: 0,
  });

  const items = [
    { n: "01", label: "O Logotipo",                 sub: "Conceito, área de proteção e usos corretos" },
    { n: "02", label: "Paleta de Cores",            sub: "Especificações técnicas para tela e impressão" },
    { n: "03", label: "Tipografia",                 sub: "Fontes oficiais, tamanhos e hierarquia" },
    { n: "04", label: "Iconografia e Grafismos",    sub: "Estilo de ícones e elementos gráficos" },
    { n: "05", label: "Aplicação em Uniformes",     sub: "Polo azul e camisa social — regras de uso" },
    { n: "06", label: "Documentos Oficiais",        sub: "Memorial Descritivo e relatórios de Medição" },
  ];

  items.forEach((item, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const x = col === 0 ? 0.5 : 5.3;
    const y = 1.5 + row * 1.15;

    // Number badge
    s.addShape("rect", {
      x, y, w: 0.55, h: 0.55,
      fill: { color: NAVY }, line: { color: NAVY },
    });
    s.addText(item.n, {
      x, y, w: 0.55, h: 0.55,
      fontSize: 14, fontFace: "Arial Black", bold: true,
      color: WHITE, align: "center", valign: "middle", margin: 0,
    });

    // Label
    s.addText(item.label, {
      x: x + 0.65, y: y, w: 3.8, h: 0.28,
      fontSize: 13, fontFace: "Arial", bold: true,
      color: NAVY, margin: 0,
    });
    s.addText(item.sub, {
      x: x + 0.65, y: y + 0.27, w: 3.8, h: 0.28,
      fontSize: 9, fontFace: "Arial", color: GRAY, margin: 0,
    });

    // Separator line
    s.addShape("line", {
      x: x, y: y + 0.65, w: 4.4, h: 0,
      line: { color: "DDDDDD", width: 0.5 },
    });
  });

  addSlideNumber(s, 2);
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 3 — O LOGOTIPO
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: WHITE };
  addSlideHeader(s, "01 — O Logotipo");

  s.addText("A VIGA MESTRA DA MARCA", {
    x: 0.5, y: 0.7, w: 9, h: 0.5,
    fontSize: 24, fontFace: "Arial Black", bold: true,
    color: NAVY, margin: 0,
  });

  // Left column — description
  s.addText([
    { text: "CONCEITO\n", options: { bold: true, color: ORANGE, fontSize: 11, breakLine: true } },
    { text: "O ícone combina blocos isométricos e um pilar de sustentação — geometria que remete à precisão da engenharia e à solidez estrutural.\n\n", options: { fontSize: 11, color: BLACK, breakLine: true } },
    { text: "MALHA CONSTRUTIVA\n", options: { bold: true, color: ORANGE, fontSize: 11, breakLine: true } },
    { text: "O logo deve sempre respeitar ângulos retos (90°). Nunca distorça, incline ou aplique efeitos sobre o símbolo.\n\n", options: { fontSize: 11, color: BLACK, breakLine: true } },
    { text: "ÁREA DE PROTEÇÃO\n", options: { bold: true, color: ORANGE, fontSize: 11, breakLine: true } },
    { text: "Mantenha sempre um espaço livre ao redor do logo equivalente a altura da letra V. Isso garante legibilidade em qualquer suporte.", options: { fontSize: 11, color: BLACK } },
  ], { x: 0.5, y: 1.35, w: 4.0, h: 3.8, valign: "top", fontFace: "Arial" });

  // Right column — logo display area
  s.addShape("rect", {
    x: 5.0, y: 1.15, w: 4.4, h: 2.4,
    fill: { color: NAVY }, line: { color: NAVY },
    shadow: makeShadow(),
  });

  // Logo on dark bg
  s.addShape("rect", { x: 5.7, y: 1.55, w: 0.18, h: 0.55, fill: { color: "142849" }, line: { color: "142849" } });
  s.addShape("rect", { x: 5.65, y: 1.37, w: 0.28, h: 0.2, fill: { color: ORANGE }, line: { color: ORANGE } });
  s.addShape("rect", { x: 5.65, y: 1.18, w: 0.28, h: 0.21, fill: { color: "3A6FAA" }, line: { color: "3A6FAA" } });
  s.addText("VIGA", {
    x: 6.0, y: 1.17, w: 2.8, h: 0.5,
    fontSize: 30, fontFace: "Arial Black", bold: true, color: WHITE, margin: 0,
  });
  s.addText("SALES", {
    x: 6.0, y: 1.65, w: 2.8, h: 0.35,
    fontSize: 18, fontFace: "Arial Black", bold: true, color: ORANGE, margin: 0,
  });

  // Logo on light bg
  s.addShape("rect", {
    x: 5.0, y: 3.7, w: 4.4, h: 1.65,
    fill: { color: CREAM }, line: { color: CREAM },
  });
  s.addShape("rect", { x: 5.7, y: 4.0, w: 0.18, h: 0.55, fill: { color: NAVY }, line: { color: NAVY } });
  s.addShape("rect", { x: 5.65, y: 3.82, w: 0.28, h: 0.2, fill: { color: ORANGE }, line: { color: ORANGE } });
  s.addShape("rect", { x: 5.65, y: 3.63, w: 0.28, h: 0.21, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText("VIGA", {
    x: 6.0, y: 3.62, w: 2.8, h: 0.5,
    fontSize: 30, fontFace: "Arial Black", bold: true, color: NAVY, margin: 0,
  });
  s.addText("SALES", {
    x: 6.0, y: 4.1, w: 2.8, h: 0.35,
    fontSize: 18, fontFace: "Arial Black", bold: true, color: ORANGE, margin: 0,
  });

  // Labels
  s.addText("Versão Fundo Escuro", {
    x: 5.0, y: 2.6, w: 4.4, h: 0.3, align: "center",
    fontSize: 8, fontFace: "Arial", color: GRAY, margin: 0,
  });
  s.addText("Versão Fundo Claro", {
    x: 5.0, y: 5.4, w: 4.4, h: 0.3, align: "center",
    fontSize: 8, fontFace: "Arial", color: GRAY, margin: 0,
  });

  addSlideNumber(s, 3);
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 4 — PALETA DE CORES
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: WHITE };
  addSlideHeader(s, "02 — Paleta de Cores");

  s.addText("CROMATISMO TÉCNICO", {
    x: 0.5, y: 0.7, w: 9, h: 0.5,
    fontSize: 24, fontFace: "Arial Black", bold: true,
    color: NAVY, margin: 0,
  });
  s.addText("Cores escolhidas para equilibrar autoridade institucional com a energia operacional do canteiro de obras.", {
    x: 0.5, y: 1.25, w: 9, h: 0.35,
    fontSize: 11, fontFace: "Arial", color: GRAY, margin: 0,
  });

  const colors = [
    { hex: NAVY,   name: "Azul Marinho Técnico", use: "Cor primária\nFundos, uniformes e\nstatus de autoridade", rgb: "27, 54, 93",    textColor: WHITE },
    { hex: ORANGE, name: "Laranja Segurança",    use: "Cor de destaque\nÍcones, CTAs e\nelementos de ação",    rgb: "232, 145, 13",  textColor: WHITE },
    { hex: GRAY,   name: "Cinza Concreto",       use: "Cor de apoio\nTextos secundários\ne grafismos",         rgb: "142, 142, 142", textColor: WHITE },
    { hex: CREAM,  name: "Branco Gelo",          use: "Cor neutra\nFundos de relatórios\ne contraste de leitura", rgb: "244, 244, 244", textColor: NAVY },
  ];

  colors.forEach((c, i) => {
    const x = 0.35 + i * 2.35;

    // Main swatch
    s.addShape("rect", {
      x, y: 1.75, w: 2.1, h: 2.3,
      fill: { color: c.hex }, line: { color: c.hex },
      shadow: makeShadow(),
    });

    // Color name on swatch
    s.addText(c.name.toUpperCase(), {
      x: x + 0.1, y: 1.85, w: 1.9, h: 0.65,
      fontSize: 9.5, fontFace: "Arial", bold: true, color: c.textColor,
      margin: 0,
    });

    // Hex badge at bottom of swatch
    s.addShape("rect", {
      x, y: 3.65, w: 2.1, h: 0.4,
      fill: { color: "00000020" === "20" ? "000000" : c.hex }, line: { color: c.hex },
    });
    s.addShape("rect", {
      x, y: 3.65, w: 2.1, h: 0.4,
      fill: { color: "000000", transparency: 30 }, line: { color: "000000", transparency: 30 },
    });
    s.addText(`#${c.hex}`, {
      x: x + 0.1, y: 3.67, w: 1.9, h: 0.35,
      fontSize: 11, fontFace: "Courier New", bold: true, color: WHITE,
      margin: 0,
    });

    // Specs below swatch
    s.addText(`RGB: ${c.rgb}`, {
      x: x, y: 4.12, w: 2.1, h: 0.28,
      fontSize: 9, fontFace: "Arial", color: GRAY, align: "center", margin: 0,
    });
    s.addText(c.use, {
      x: x, y: 4.38, w: 2.1, h: 0.7,
      fontSize: 8.5, fontFace: "Arial", color: BLACK, align: "center",
      valign: "top", margin: 0,
    });
  });

  // Rule at bottom
  s.addShape("line", {
    x: 0.5, y: 5.2, w: 9, h: 0,
    line: { color: CREAM, width: 1 },
  });
  s.addText("NUNCA use outras cores sem aprovação da liderança. Consistência cromática é autoridade.", {
    x: 0.5, y: 5.28, w: 9, h: 0.25,
    fontSize: 8, fontFace: "Arial", color: GRAY, italic: true, align: "center", margin: 0,
  });

  addSlideNumber(s, 4);
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 5 — TIPOGRAFIA
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: CREAM };
  addSlideHeader(s, "03 — Tipografia");

  s.addText("A ESCRITA DO PROJETO", {
    x: 0.5, y: 0.7, w: 9, h: 0.5,
    fontSize: 24, fontFace: "Arial Black", bold: true,
    color: NAVY, margin: 0,
  });

  // Font 1 — Montserrat Bold (simulated with Arial Black)
  s.addShape("rect", {
    x: 0.5, y: 1.35, w: 4.2, h: 3.4,
    fill: { color: NAVY }, line: { color: NAVY },
    shadow: makeShadow(),
  });
  s.addShape("rect", { x: 0.5, y: 1.35, w: 0.08, h: 3.4, fill: { color: ORANGE }, line: { color: ORANGE } });

  s.addText("Aa", {
    x: 0.65, y: 1.4, w: 4.0, h: 1.35,
    fontSize: 72, fontFace: "Arial Black", bold: true, color: WHITE, margin: 0,
  });
  s.addText("MONTSERRAT BOLD", {
    x: 0.65, y: 2.75, w: 4.0, h: 0.35,
    fontSize: 11, fontFace: "Arial", bold: true, color: ORANGE, charSpacing: 2, margin: 0,
  });
  s.addText("Títulos Primários · Capa de Propostas\nNomes de Seção · Headers de Documentos", {
    x: 0.65, y: 3.1, w: 4.0, h: 0.55,
    fontSize: 9, fontFace: "Arial", color: GRAY, margin: 0,
  });
  s.addText("ABCDEFGHIJKLMNOPQRSTUVWXYZ\n0123456789", {
    x: 0.65, y: 3.65, w: 4.0, h: 0.5,
    fontSize: 9, fontFace: "Arial Black", color: WHITE, margin: 0,
  });

  // Font 2 — Inter / Open Sans (simulated with Calibri)
  s.addShape("rect", {
    x: 5.15, y: 1.35, w: 4.35, h: 3.4,
    fill: { color: WHITE }, line: { color: "E0E0E0", width: 0.5 },
    shadow: makeShadow(),
  });
  s.addShape("rect", { x: 5.15, y: 1.35, w: 0.08, h: 3.4, fill: { color: ORANGE }, line: { color: ORANGE } });

  s.addText("Aa", {
    x: 5.3, y: 1.4, w: 4.1, h: 1.35,
    fontSize: 72, fontFace: "Calibri", color: NAVY, margin: 0,
  });
  s.addText("INTER REGULAR", {
    x: 5.3, y: 2.75, w: 4.0, h: 0.35,
    fontSize: 11, fontFace: "Arial", bold: true, color: NAVY, charSpacing: 2, margin: 0,
  });
  s.addText("Corpo de Texto · Memoriais Descritivos\nE-mails Comerciais · Relatórios de Medição", {
    x: 5.3, y: 3.1, w: 4.0, h: 0.55,
    fontSize: 9, fontFace: "Arial", color: GRAY, margin: 0,
  });
  s.addText("abcdefghijklmnopqrstuvwxyz\n0 1 2 3 4 5 6 7 8 9", {
    x: 5.3, y: 3.65, w: 4.0, h: 0.5,
    fontSize: 9, fontFace: "Calibri", color: NAVY, margin: 0,
  });

  // Size guide
  s.addText("HIERARQUIA TIPOGRÁFICA:  Títulos 32–44pt  ·  Subtítulos 20–24pt  ·  Corpo 14–16pt  ·  Legendas 10–12pt", {
    x: 0.5, y: 4.9, w: 9, h: 0.4,
    fontSize: 8.5, fontFace: "Arial", color: GRAY, align: "center",
    italic: true, margin: 0,
  });

  addSlideNumber(s, 5);
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 6 — ICONOGRAFIA E GRAFISMOS
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: WHITE };
  addSlideHeader(s, "04 — Iconografia e Grafismos");

  s.addText("LINGUAGEM VISUAL TÉCNICA", {
    x: 0.5, y: 0.7, w: 9, h: 0.5,
    fontSize: 24, fontFace: "Arial Black", bold: true,
    color: NAVY, margin: 0,
  });

  // Left — rules
  const rules = [
    { icon: "◼", title: "Traço Reto",      desc: "Ícones com linhas de 90°. Sem arredondamentos excessivos. Geometria construtiva." },
    { icon: "▦", title: "Grid Blueprint",  desc: "Fundo de apresentações pode usar textura de linhas finas — como papel milimetrado." },
    { icon: "◈", title: "Pilar Viga",      desc: "O símbolo do logotipo pode ser integrado em infográficos e gráficos de performance." },
    { icon: "▣", title: "Peso Visual",     desc: "Ícones devem ter peso médio-bold. Nunca use linhas finas (hairline) em contextos pequenos." },
  ];

  rules.forEach((r, i) => {
    const y = 1.4 + i * 0.97;
    // Icon circle
    s.addShape("rect", {
      x: 0.5, y: y, w: 0.55, h: 0.55,
      fill: { color: CREAM }, line: { color: "E0E0E0", width: 0.5 },
    });
    s.addText(r.icon, {
      x: 0.5, y: y, w: 0.55, h: 0.55,
      fontSize: 18, color: NAVY, align: "center", valign: "middle", margin: 0,
    });
    s.addText(r.title, {
      x: 1.15, y: y, w: 3.5, h: 0.28,
      fontSize: 11, fontFace: "Arial", bold: true, color: NAVY, margin: 0,
    });
    s.addText(r.desc, {
      x: 1.15, y: y + 0.27, w: 3.5, h: 0.45,
      fontSize: 9.5, fontFace: "Arial", color: GRAY, margin: 0,
    });
  });

  // Right — blueprint grid visual
  s.addShape("rect", {
    x: 5.2, y: 1.25, w: 4.3, h: 3.8,
    fill: { color: NAVY }, line: { color: NAVY },
    shadow: makeShadow(),
  });

  // Blueprint grid
  for (let i = 0; i <= 8; i++) {
    s.addShape("line", {
      x: 5.2, y: 1.25 + i * 0.475, w: 4.3, h: 0,
      line: { color: WHITE, width: 0.3, transparency: 70 },
    });
  }
  for (let i = 0; i <= 8; i++) {
    s.addShape("line", {
      x: 5.2 + i * 0.5375, y: 1.25, w: 0, h: 3.8,
      line: { color: WHITE, width: 0.3, transparency: 70 },
    });
  }

  // Geometric icons on grid
  // Circle 1 — chart icon
  s.addShape("oval", { x: 5.65, y: 1.6, w: 0.9, h: 0.9, fill: { color: ORANGE }, line: { color: ORANGE } });
  s.addText("▲", { x: 5.65, y: 1.6, w: 0.9, h: 0.9, fontSize: 20, color: WHITE, align: "center", valign: "middle", margin: 0 });

  // Circle 2 — building
  s.addShape("oval", { x: 6.85, y: 1.6, w: 0.9, h: 0.9, fill: { color: "1E4A7B" }, line: { color: "1E4A7B" } });
  s.addText("⬡", { x: 6.85, y: 1.6, w: 0.9, h: 0.9, fontSize: 20, color: WHITE, align: "center", valign: "middle", margin: 0 });

  // Circle 3 — check
  s.addShape("oval", { x: 8.05, y: 1.6, w: 0.9, h: 0.9, fill: { color: "2A7A4E" }, line: { color: "2A7A4E" } });
  s.addText("✓", { x: 8.05, y: 1.6, w: 0.9, h: 0.9, fontSize: 22, color: WHITE, align: "center", valign: "middle", margin: 0 });

  // Ruler / measurement graphic
  s.addShape("rect", { x: 5.5, y: 2.8, w: 3.6, h: 0.08, fill: { color: ORANGE }, line: { color: ORANGE } });
  for (let i = 0; i <= 9; i++) {
    s.addShape("line", {
      x: 5.5 + i * 0.4, y: 2.72, w: 0, h: 0.18,
      line: { color: ORANGE, width: 1 },
    });
  }
  s.addText("TRAÇO COMERCIAL", {
    x: 5.4, y: 3.05, w: 3.8, h: 0.3,
    fontSize: 9, fontFace: "Arial", bold: true, color: ORANGE, charSpacing: 3,
    align: "center", margin: 0,
  });

  // Sample icon strip
  s.addShape("rect", { x: 5.2, y: 3.5, w: 4.3, h: 0.8, fill: { color: "142849" }, line: { color: "142849" } });
  s.addText("□  ◇  △  ▷  ▭  ✕  ⊕  ▣", {
    x: 5.2, y: 3.5, w: 4.3, h: 0.8,
    fontSize: 18, color: WHITE, align: "center", valign: "middle", margin: 0,
  });
  s.addText("Ícones oficiais — peso regular, ângulos de 90°", {
    x: 5.2, y: 4.35, w: 4.3, h: 0.3,
    fontSize: 8, fontFace: "Arial", color: GRAY, align: "center", margin: 0,
  });

  addSlideNumber(s, 6);
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 7 — UNIFORMES
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: CREAM };
  addSlideHeader(s, "05 — Aplicação em Uniformes");

  s.addText("A IMAGEM DO LÍDER", {
    x: 0.5, y: 0.7, w: 9, h: 0.5,
    fontSize: 24, fontFace: "Arial Black", bold: true,
    color: NAVY, margin: 0,
  });

  // Card 1 — Polo Azul
  s.addShape("rect", {
    x: 0.4, y: 1.35, w: 4.3, h: 3.8,
    fill: { color: WHITE }, line: { color: "E0E0E0", width: 0.5 },
    shadow: makeShadow(),
  });
  // Header strip navy
  s.addShape("rect", {
    x: 0.4, y: 1.35, w: 4.3, h: 1.1,
    fill: { color: NAVY }, line: { color: NAVY },
  });
  // Polo silhouette (simplified)
  s.addShape("oval", { x: 1.5, y: 1.4, w: 1.0, h: 0.7, fill: { color: "142849" }, line: { color: "142849" } });
  s.addShape("rect", { x: 1.15, y: 1.78, w: 1.7, h: 0.55, fill: { color: NAVY }, line: { color: NAVY } });
  // Logo badge
  s.addShape("rect", { x: 1.6, y: 1.95, w: 0.08, h: 0.22, fill: { color: ORANGE }, line: { color: ORANGE } });
  s.addText("VIGA", { x: 1.7, y: 1.93, w: 0.7, h: 0.15, fontSize: 7, fontFace: "Arial Black", color: WHITE, bold: true, margin: 0 });
  s.addText("SALES", { x: 1.7, y: 2.07, w: 0.7, h: 0.12, fontSize: 5, fontFace: "Arial Black", color: ORANGE, bold: true, margin: 0 });

  s.addText("POLO AZUL MARINHO", {
    x: 0.5, y: 2.55, w: 4.1, h: 0.35,
    fontSize: 13, fontFace: "Arial Black", bold: true, color: NAVY, align: "center", margin: 0,
  });

  const poloDetails = [
    ["Contexto", "Campo, visitas técnicas, prospecção"],
    ["Logotipo", "Bordado colorido no peito esquerdo"],
    ["Tom", "Operacional · Presença · Canteiro"],
    ["Quando usar", "Reuniões informais e contato direto"],
  ];
  poloDetails.forEach((row, i) => {
    const y = 3.0 + i * 0.5;
    s.addText(row[0] + ":", { x: 0.6, y, w: 1.1, h: 0.35, fontSize: 9, fontFace: "Arial", bold: true, color: ORANGE, margin: 0 });
    s.addText(row[1], { x: 1.7, y, w: 2.8, h: 0.35, fontSize: 9, fontFace: "Arial", color: BLACK, margin: 0 });
  });

  // Card 2 — Social Branca
  s.addShape("rect", {
    x: 5.3, y: 1.35, w: 4.3, h: 3.8,
    fill: { color: WHITE }, line: { color: "E0E0E0", width: 0.5 },
    shadow: makeShadow(),
  });
  // Header strip cream/light
  s.addShape("rect", {
    x: 5.3, y: 1.35, w: 4.3, h: 1.1,
    fill: { color: "F0F0F0" }, line: { color: "E0E0E0", width: 0.3 },
  });
  // Social shirt silhouette
  s.addShape("oval", { x: 6.4, y: 1.4, w: 1.0, h: 0.7, fill: { color: "CCCCCC" }, line: { color: "CCCCCC" } });
  s.addShape("rect", { x: 6.05, y: 1.78, w: 1.7, h: 0.55, fill: { color: "E8E8E8" }, line: { color: "DDDDDD", width: 0.5 } });
  // Logo badge on white
  s.addShape("rect", { x: 6.5, y: 1.95, w: 0.08, h: 0.22, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText("VIGA", { x: 6.6, y: 1.93, w: 0.7, h: 0.15, fontSize: 7, fontFace: "Arial Black", color: NAVY, bold: true, margin: 0 });
  s.addText("SALES", { x: 6.6, y: 2.07, w: 0.7, h: 0.12, fontSize: 5, fontFace: "Arial Black", color: ORANGE, bold: true, margin: 0 });

  s.addText("CAMISA SOCIAL BRANCA", {
    x: 5.4, y: 2.55, w: 4.1, h: 0.35,
    fontSize: 13, fontFace: "Arial Black", bold: true, color: NAVY, align: "center", margin: 0,
  });

  const socialDetails = [
    ["Contexto", "Fechamentos, eventos e apresentações"],
    ["Logotipo", "Bordado colorido no peito esquerdo"],
    ["Tom", "Executivo · Autoridade · Alto padrão"],
    ["Quando usar", "Reuniões acima de R$ 1.500 de ticket"],
  ];
  socialDetails.forEach((row, i) => {
    const y = 3.0 + i * 0.5;
    s.addText(row[0] + ":", { x: 5.5, y, w: 1.1, h: 0.35, fontSize: 9, fontFace: "Arial", bold: true, color: ORANGE, margin: 0 });
    s.addText(row[1], { x: 6.6, y, w: 2.8, h: 0.35, fontSize: 9, fontFace: "Arial", color: BLACK, margin: 0 });
  });

  // Rule at bottom
  s.addShape("rect", { x: 0.4, y: 5.22, w: 9.2, h: 0.3, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText("O uniforme é a primeira medição que o cliente faz de você. Cada detalhe conta.", {
    x: 0.5, y: 5.23, w: 9, h: 0.28,
    fontSize: 9, fontFace: "Arial", color: WHITE, align: "center", italic: true, margin: 0,
  });

  addSlideNumber(s, 7);
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 8 — DOCUMENTOS OFICIAIS
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: WHITE };
  addSlideHeader(s, "06 — Documentos Oficiais");

  s.addText("PADRÃO DE MEDIÇÃO MENSAL", {
    x: 0.5, y: 0.7, w: 9, h: 0.5,
    fontSize: 24, fontFace: "Arial Black", bold: true,
    color: NAVY, margin: 0,
  });

  // Document mockup card
  s.addShape("rect", {
    x: 0.4, y: 1.25, w: 4.0, h: 4.1,
    fill: { color: WHITE }, line: { color: "CCCCCC", width: 0.5 },
    shadow: makeShadow(),
  });
  // Doc header bar
  s.addShape("rect", { x: 0.4, y: 1.25, w: 4.0, h: 0.6, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText("VIGA", { x: 0.55, y: 1.28, w: 1.0, h: 0.3, fontSize: 11, fontFace: "Arial Black", bold: true, color: WHITE, margin: 0 });
  s.addText("SALES", { x: 0.55, y: 1.55, w: 1.0, h: 0.22, fontSize: 7, fontFace: "Arial Black", bold: true, color: ORANGE, margin: 0 });
  // PDF badge
  s.addShape("rect", { x: 3.85, y: 1.28, w: 0.45, h: 0.22, fill: { color: "CC0000" }, line: { color: "CC0000" } });
  s.addText("PDF", { x: 3.85, y: 1.28, w: 0.45, h: 0.22, fontSize: 7, fontFace: "Arial", bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });

  // Doc title
  s.addText("MEMORIAL DESCRITIVO\nDE MEDIÇÃO MENSAL", {
    x: 0.55, y: 2.0, w: 3.7, h: 0.7,
    fontSize: 13, fontFace: "Arial Black", bold: true, color: NAVY,
    align: "center", margin: 0,
  });

  // Orange divider
  s.addShape("rect", { x: 0.6, y: 2.76, w: 3.6, h: 0.05, fill: { color: ORANGE }, line: { color: ORANGE } });

  // Table headers
  s.addShape("rect", { x: 0.5, y: 2.85, w: 3.8, h: 0.3, fill: { color: NAVY }, line: { color: NAVY } });
  ["Indicador", "Meta", "Resultado"].forEach((h, i) => {
    s.addText(h, {
      x: 0.55 + i * 1.27, y: 2.85, w: 1.2, h: 0.3,
      fontSize: 8, fontFace: "Arial", bold: true, color: WHITE,
      align: "center", valign: "middle", margin: 0,
    });
  });

  // Table rows
  const rows = [
    ["Requisições",  "18",    "23"],
    ["Conversão",   "23,3%", "31%"],
    ["ROI",         "0,5%",  "1,2%"],
    ["Ticket Médio","R$1.200","R$1.580"],
  ];
  rows.forEach((row, i) => {
    const rowBg = i % 2 === 0 ? CREAM : WHITE;
    s.addShape("rect", { x: 0.5, y: 3.2 + i * 0.38, w: 3.8, h: 0.38, fill: { color: rowBg }, line: { color: "E0E0E0", width: 0.3 } });
    row.forEach((cell, ci) => {
      s.addText(cell, {
        x: 0.55 + ci * 1.27, y: 3.2 + i * 0.38, w: 1.2, h: 0.38,
        fontSize: 9, fontFace: "Arial", color: NAVY,
        align: "center", valign: "middle", margin: 0,
      });
    });
  });

  // Ruler footer on doc
  s.addShape("rect", { x: 0.4, y: 4.98, w: 4.0, h: 0.08, fill: { color: ORANGE }, line: { color: ORANGE } });
  for (let i = 0; i <= 16; i++) {
    s.addShape("line", {
      x: 0.4 + i * 0.25, y: 4.9, w: 0, h: 0.1,
      line: { color: ORANGE, width: 0.7 },
    });
  }

  // Right — naming rules
  const docRules = [
    {
      label: "PROPOSTA COMERCIAL",
      title: "Memorial Descritivo de Serviços",
      desc: "Nunca use orcamento ou cotacao. O Memorial Descritivo transmite precisao tecnica.",
    },
    {
      label: "RELATÓRIO MENSAL",
      title: "Relatório de Medição de Safra Comercial",
      desc: "Apresentado em reunião mensal. Deve incluir gráfico de evolução e próximas metas.",
    },
    {
      label: "ASSINATURA DE E-MAIL",
      title: "Raul Santos · Estrategista-Chefe",
      desc: "Incluir: logo, cargo oficial, WhatsApp e link do portfólio. Sem foto pessoal no rodapé.",
    },
    {
      label: "ESTILO GRÁFICO",
      title: "Capa Azul Marinho · Tabelas Cinza Concreto",
      desc: "Fundo das tabelas: Branco Gelo. Bordas finas em Cinza. Cabeçalho das colunas em Azul.",
    },
  ];

  docRules.forEach((rule, i) => {
    const y = 1.3 + i * 1.02;
    s.addShape("rect", {
      x: 4.9, y, w: 4.65, h: 0.92,
      fill: { color: CREAM }, line: { color: "E0E0E0", width: 0.3 },
    });
    s.addShape("rect", { x: 4.9, y, w: 0.08, h: 0.92, fill: { color: ORANGE }, line: { color: ORANGE } });
    s.addText(rule.label, {
      x: 5.05, y: y + 0.05, w: 4.4, h: 0.22,
      fontSize: 7.5, fontFace: "Arial", bold: true, color: ORANGE, charSpacing: 1.5, margin: 0,
    });
    s.addText(rule.title, {
      x: 5.05, y: y + 0.25, w: 4.4, h: 0.28,
      fontSize: 11, fontFace: "Arial", bold: true, color: NAVY, margin: 0,
    });
    s.addText(rule.desc, {
      x: 5.05, y: y + 0.53, w: 4.4, h: 0.35,
      fontSize: 8.5, fontFace: "Arial", color: GRAY, margin: 0,
    });
  });

  addSlideNumber(s, 8);
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 9 — TOM DE VOZ E LÉXICO
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: CREAM };
  addSlideHeader(s, "Bônus — Tom de Voz e Léxico");

  s.addText("AS PALAVRAS QUE CONSTROEM AUTORIDADE", {
    x: 0.5, y: 0.7, w: 9, h: 0.5,
    fontSize: 22, fontFace: "Arial Black", bold: true,
    color: NAVY, margin: 0,
  });

  // Two columns
  const lexicoItems = [
    { wrong: "Orçamento",       right: "Memorial Descritivo",          note: "Eleva o valor percebido" },
    { wrong: "Relatório",       right: "Relatório de Medição de Safra", note: "Colheita = resultado real" },
    { wrong: "Serviços",        right: "Engenharia Comercial",          note: "Diferencia de agências comuns" },
    { wrong: "Campanha",        right: "Operação de Prospecção",        note: "Linguagem de projeto/obra" },
    { wrong: "Resultado",       right: "Medição",                      note: "Palavra âncora da marca" },
    { wrong: "Reunião mensal",  right: "Ritual de Medição",            note: "Transforma rotina em ritual" },
  ];

  // Headers
  s.addShape("rect", { x: 0.4, y: 1.35, w: 9.2, h: 0.38, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText("EVITAR", { x: 0.5, y: 1.35, w: 2.5, h: 0.38, fontSize: 10, fontFace: "Arial", bold: true, color: GRAY, valign: "middle", margin: 0 });
  s.addText("→", { x: 3.0, y: 1.35, w: 0.5, h: 0.38, fontSize: 14, color: ORANGE, valign: "middle", align: "center", margin: 0 });
  s.addText("USAR", { x: 3.5, y: 1.35, w: 3.5, h: 0.38, fontSize: 10, fontFace: "Arial", bold: true, color: WHITE, valign: "middle", margin: 0 });
  s.addText("POR QUÊ", { x: 7.0, y: 1.35, w: 2.5, h: 0.38, fontSize: 10, fontFace: "Arial", bold: true, color: ORANGE, valign: "middle", margin: 0 });

  lexicoItems.forEach((item, i) => {
    const y = 1.78 + i * 0.54;
    const bg = i % 2 === 0 ? WHITE : "F8F8F8";
    s.addShape("rect", { x: 0.4, y, w: 9.2, h: 0.5, fill: { color: bg }, line: { color: "E5E5E5", width: 0.3 } });
    s.addText(item.wrong, { x: 0.5, y, w: 2.5, h: 0.5, fontSize: 11, fontFace: "Arial", color: "999999", italic: true, valign: "middle", margin: 0 });
    s.addShape("line", { x: 0.5, y: y + 0.27, w: 1.8, h: 0, line: { color: "999999", width: 0.5 } });
    s.addText("→", { x: 3.0, y, w: 0.5, h: 0.5, fontSize: 14, color: ORANGE, valign: "middle", align: "center", margin: 0 });
    s.addText(item.right, { x: 3.5, y, w: 3.5, h: 0.5, fontSize: 11, fontFace: "Arial", bold: true, color: NAVY, valign: "middle", margin: 0 });
    s.addText(item.note, { x: 7.0, y, w: 2.5, h: 0.5, fontSize: 9, fontFace: "Arial", color: GRAY, italic: true, valign: "middle", margin: 0 });
  });

  addSlideNumber(s, 9);
}

// ═══════════════════════════════════════════════════════════════
// SLIDE 10 — FECHAMENTO
// ═══════════════════════════════════════════════════════════════
{
  let s = pres.addSlide();
  s.background = { color: NAVY };

  // Grid lines
  for (let i = 0; i < 7; i++) {
    s.addShape("line", {
      x: 0.3, y: 0.5 + i * 0.8, w: 9.4, h: 0,
      line: { color: WHITE, width: 0.3, transparency: 85 },
    });
  }
  for (let i = 0; i < 12; i++) {
    s.addShape("line", {
      x: 0.3 + i * 0.85, y: 0.3, w: 0, h: 5.0,
      line: { color: WHITE, width: 0.3, transparency: 85 },
    });
  }

  // Orange left accent
  s.addShape("rect", { x: 0, y: 0, w: 0.18, h: 5.625, fill: { color: ORANGE }, line: { color: ORANGE } });

  // Main text
  s.addText("A IDENTIDADE É A\nSUA VIGA MESTRA.", {
    x: 0.7, y: 0.6, w: 8.5, h: 2.2,
    fontSize: 44, fontFace: "Arial Black", bold: true,
    color: WHITE, margin: 0,
  });

  s.addText("Este manual não é um documento qualquer.\nÉ a planta baixa da sua reputação em Brasília.", {
    x: 0.7, y: 2.95, w: 7, h: 0.9,
    fontSize: 15, fontFace: "Calibri", color: CREAM,
    italic: true, margin: 0,
  });

  // Orange divider
  s.addShape("rect", { x: 0.7, y: 3.95, w: 3.5, h: 0.07, fill: { color: ORANGE }, line: { color: ORANGE } });

  // Three pillars summary
  const pillars = ["Cores", "Tipografia", "Léxico"];
  pillars.forEach((p, i) => {
    s.addShape("oval", {
      x: 0.7 + i * 2.3, y: 4.2, w: 0.4, h: 0.4,
      fill: { color: ORANGE }, line: { color: ORANGE },
    });
    s.addText(p, {
      x: 1.15 + i * 2.3, y: 4.2, w: 1.7, h: 0.4,
      fontSize: 12, fontFace: "Arial", bold: true, color: WHITE, valign: "middle", margin: 0,
    });
  });

  // Bottom
  s.addShape("rect", { x: 0, y: 5.28, w: 10, h: 0.345, fill: { color: "142849" }, line: { color: "142849" } });
  s.addText("VIGA SALES  ·  Manual de Identidade Visual v1.0  ·  2026  ·  Uso Exclusivo", {
    x: 0.3, y: 5.3, w: 9.4, h: 0.28,
    fontSize: 8, fontFace: "Arial", color: GRAY, align: "center", margin: 0,
  });
}

// ─── SALVAR ───────────────────────────────────────────────────
const OUTPUT = "/Users/raulysdyxyamferreirasantos/Downloads/Viga_Sales_Manual_Identidade_Visual.pptx";
pres.writeFile({ fileName: OUTPUT })
  .then(() => console.log("✅ Salvo em:", OUTPUT))
  .catch(e => { console.error("❌ Erro:", e); process.exit(1); });
