/**
 * BLOG VIGA SALES — Design Maria Teixeira-inspired
 * Home: hero + featured + grid + sidebar (mais lidos, categorias, CTA)
 * Artigo: TOC, share oficial, autor, CTA final
 */

import { Router } from "express";
import { query, queryOne } from "../db/database.js";

const router = Router();
const BLOG_HOST = 'blog.vigasales.com.br';
const WPP = '556195624499';
const GTM_ID = process.env.GTM_CONTAINER_ID || '';
const GTM_HEAD = GTM_ID ? `<!-- Google Tag Manager --><script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');</script><!-- End Google Tag Manager -->` : '';
const GTM_BODY = GTM_ID ? `<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript><!-- End Google Tag Manager (noscript) -->` : '';

function trackingHome() {
  return `<script>window.dataLayer=window.dataLayer||[];document.querySelectorAll('.sidebar-wpp,.whatsapp-float').forEach(function(el){el.addEventListener('click',function(){dataLayer.push({event:'cta_whatsapp',location:el.classList.contains('sidebar-wpp')?'sidebar':'float'});});});document.querySelectorAll('.cat-filter').forEach(function(el){el.addEventListener('click',function(){dataLayer.push({event:'category_filter',category:el.textContent.replace(/\\d+/,'').trim()});});});<\/script>`;
}
function trackingPost(title, slug, tags) {
  const cat = (tags || [])[0] || 'sem categoria';
  return `<script>window.dataLayer=window.dataLayer||[];dataLayer.push({event:'article_view',article_title:'${title.replace(/'/g,"\\'")}',article_slug:'${slug.replace(/'/g,"\\'")}',article_category:'${cat.replace(/'/g,"\\'")}'});var _engaged=!1;function _checkEngaged(){if(_engaged)return;var s=document.documentElement.scrollTop/(document.documentElement.scrollHeight-window.innerHeight);if(s>=0.5){_engaged=!0;dataLayer.push({event:'article_engaged',article_slug:'${slug.replace(/'/g,"\\'")}'})}}setTimeout(function(){_checkEngaged()},30000);window.addEventListener('scroll',function(){_checkEngaged()});document.querySelectorAll('.sidebar-wpp,.whatsapp-float').forEach(function(el){el.addEventListener('click',function(){dataLayer.push({event:'cta_whatsapp',location:el.classList.contains('sidebar-wpp')?'sidebar':'float',article_slug:'${slug.replace(/'/g,"\\'")}'});});});document.querySelectorAll('.share-btn').forEach(function(el){el.addEventListener('click',function(){var n=el.classList.contains('wpp')?'whatsapp':el.classList.contains('in')?'linkedin':'twitter';dataLayer.push({event:'article_share',network:n,article_slug:'${slug.replace(/'/g,"\\'")}'});});});<\/script>`;
}

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&family=Inter:wght@400;500;600&display=swap');*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',-apple-system,sans-serif;background:#080d18;color:#d4dce8;line-height:1.75;-webkit-font-smoothing:antialiased}.container{max-width:1100px;margin:0 auto;padding:0 24px}.read-progress{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,#f97316,#ea580c);z-index:1000;transition:width .1s}.breadcrumb{padding:16px 0;font-size:13px;color:#3a4a60}.breadcrumb a{color:#6b7fa0;text-decoration:none}.breadcrumb a:hover{color:#f97316}.breadcrumb span{color:#3a4a60}.page-hero{padding:48px 0 36px;max-width:720px}.page-hero h1{font-family:'Montserrat',sans-serif;font-size:42px;font-weight:900;color:#fff;margin-bottom:12px;letter-spacing:-0.5px;line-height:1.15}.page-hero h1 em{color:#f97316;font-style:normal}.page-hero p{color:#6b7fa0;font-size:16px;line-height:1.7;max-width:600px}.category-filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:40px}.cat-filter{display:inline-flex;align-items:center;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;text-decoration:none;border:1px solid #152036;color:#6b7fa0;background:#0d1424;transition:all .15s}.cat-filter:hover,.cat-filter.active{background:rgba(249,115,22,.12);color:#f97316;border-color:rgba(249,115,22,.3)}.cat-filter .count{margin-left:5px;color:#3a4a60;font-size:10px}.page-layout{display:flex;gap:40px;align-items:flex-start}.page-main{flex:1;min-width:0}.page-sidebar{width:280px;flex-shrink:0;position:sticky;top:24px;display:flex;flex-direction:column;gap:20px}.sidebar-card{background:#0d1424;border:1px solid #152036;border-radius:12px;padding:20px}.sidebar-card h4{font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}.sidebar-card ul{list-style:none;display:flex;flex-direction:column;gap:8px}.sidebar-card li{font-size:13px}.sidebar-card li a{color:#6b7fa0;text-decoration:none;transition:color .15s}.sidebar-card li a:hover{color:#f97316}.sidebar-card li .num{color:#f97316;font-weight:700;margin-right:6px}.sidebar-wpp{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;border-radius:8px;background:#25d366;color:#fff;text-decoration:none;font-size:12px;font-weight:700;transition:transform .15s}.sidebar-wpp:hover{transform:scale(1.03)}.sidebar-wpp svg{width:16px;height:16px;fill:#fff}.featured-card{background:#0d1424;border:1px solid #152036;border-radius:16px;overflow:hidden;margin-bottom:36px;transition:transform .2s}.featured-card:hover{transform:translateY(-3px)}.featured-card img{width:100%;height:320px;object-fit:cover}.featured-card-body{padding:24px 28px 28px}.featured-card-body .cat-badge{display:inline-block;background:rgba(249,115,22,.12);color:#f97316;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:12px}.featured-card-body h2{font-family:'Montserrat',sans-serif;font-size:24px;font-weight:800;line-height:1.3;margin-bottom:8px}.featured-card-body h2 a{color:#f0f4ff;text-decoration:none;transition:color .15s}.featured-card-body h2 a:hover{color:#f97316}.featured-card-body .excerpt{color:#6b7fa0;font-size:14px;line-height:1.6;margin-bottom:14px}.featured-card-body .card-meta{font-size:12px;color:#3a4a60;display:flex;gap:12px;align-items:center}.featured-card-body .card-meta .read-link{color:#f97316;font-weight:600;text-decoration:none;margin-left:auto;transition:gap .15s;display:flex;align-items:center;gap:4px}.featured-card-body .card-meta .read-link:hover{gap:8px}.article-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;padding-bottom:60px}.article-card{background:#0d1424;border-radius:16px;overflow:hidden;border:1px solid #152036;transition:transform .2s,box-shadow .2s}.article-card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.4)}.article-card img{width:100%;height:200px;object-fit:cover}.article-card-body{padding:18px 20px 22px}.article-card-body .cat-badge{display:inline-block;background:rgba(249,115,22,.1);color:#f97316;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px}.article-card-body h3{font-family:'Montserrat',sans-serif;font-size:16px;font-weight:700;line-height:1.35;margin-bottom:6px}.article-card-body h3 a{color:#f0f4ff;text-decoration:none;transition:color .15s}.article-card-body h3 a:hover{color:#f97316}.article-card-body .card-excerpt{color:#5a6a80;font-size:12px;line-height:1.5;margin-bottom:10px}.article-card-body .card-meta{font-size:11px;color:#3a4a60;display:flex;justify-content:space-between;align-items:center}.article-layout{display:flex;gap:40px;align-items:flex-start}.article-sidebar{width:240px;flex-shrink:0;position:sticky;top:24px}.article-main{flex:1;min-width:0}.toc-sticky{background:#0d1424;border:1px solid #152036;border-radius:12px;padding:20px}.toc-sticky h4{font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}.toc-list{list-style:none;display:flex;flex-direction:column;gap:8px}.toc-link{color:#6b7fa0;text-decoration:none;font-size:12px;font-weight:500;transition:color .15s;display:block;padding:3px 0;border-left:2px solid transparent;padding-left:10px}.toc-link:hover,.toc-link.active{color:#f97316;border-left-color:#f97316}.share-bar{display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #152036;align-items:center}.share-btn{width:36px;height:36px;border-radius:8px;background:#0d1424;border:1px solid #152036;display:flex;align-items:center;justify-content:center;color:#6b7fa0;text-decoration:none;transition:all .15s}.share-btn svg{width:16px;height:16px;fill:currentColor}.share-btn:hover.wpp{background:#25d366;color:#fff;border-color:#25d366}.share-btn:hover.in{background:#0a66c2;color:#fff;border-color:#0a66c2}.share-btn:hover.tw{background:#000;color:#fff;border-color:#333}.cover-img{width:100%;max-height:450px;object-fit:cover;margin-bottom:0}.post-meta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px 0;color:#5a6a80;font-size:13px;border-bottom:1px solid #152036;margin-bottom:24px}.post-meta .tag{background:rgba(249,115,22,0.1);color:#f97316;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}.content{font-size:16px;color:#cbd5e1;line-height:1.9}.content h2{font-family:'Montserrat',sans-serif;color:#fff;font-size:26px;font-weight:800;margin:44px 0 20px;padding-bottom:10px;border-bottom:2px solid #1e3050;letter-spacing:-0.3px}.content h3{font-family:'Montserrat',sans-serif;color:#e8eef6;font-size:18px;font-weight:700;margin:28px 0 12px}.content p{margin-bottom:20px}.content img{max-width:100%;border-radius:14px;margin:24px 0;box-shadow:0 6px 24px rgba(0,0,0,0.3)}.content strong{color:#f97316;font-weight:600}.content ul,.content ol{padding-left:22px;margin:20px 0}.content li{margin-bottom:10px}.content blockquote{border-left:3px solid #f97316;padding:12px 20px;margin:24px 0;color:#8899bb;font-style:italic;background:rgba(249,115,22,0.04);border-radius:0 8px 8px 0}.related{background:#0d1424;border:1px solid #152036;border-radius:16px;padding:24px;margin-top:40px}.related h3{font-family:'Montserrat',sans-serif;font-size:16px;font-weight:700;color:#fff;margin-bottom:16px}.related-list{display:flex;flex-direction:column;gap:12px}.related-item{font-size:14px}.related-item a{color:#6b7fa0;text-decoration:none;transition:color .15s}.related-item a:hover{color:#f97316}.author-section{background:#0d1424;border:1px solid #152036;border-radius:16px;padding:28px;margin-top:32px;display:flex;gap:20px;align-items:flex-start}.author-avatar{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;color:#fff;font-family:'Montserrat',sans-serif;font-weight:800}.author-info h3{font-family:'Montserrat',sans-serif;font-size:16px;font-weight:700;color:#fff;margin-bottom:4px}.author-info p{color:#6b7fa0;font-size:13px;line-height:1.6}.cta-bottom{background:linear-gradient(135deg,#f97316,#ea580c);border-radius:16px;padding:32px;margin-top:24px;text-align:center;color:#fff}.cta-bottom h2{font-family:'Montserrat',sans-serif;font-size:20px;font-weight:800;margin-bottom:8px;color:#fff}.cta-bottom p{color:#fed7aa;font-size:14px;margin-bottom:20px}.btn-wpp{display:inline-flex;align-items:center;gap:8px;background:#25d366;color:#fff;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;transition:transform .15s}.btn-wpp:hover{transform:scale(1.05)}.btn-wpp svg{width:20px;height:20px;fill:#fff}.whatsapp-float{position:fixed;bottom:24px;right:24px;z-index:999;width:56px;height:56px;border-radius:50%;background:#25d366;display:flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 4px 20px rgba(37,211,102,0.4);transition:transform .15s,box-shadow .15s}.whatsapp-float:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(37,211,102,0.5)}.whatsapp-float svg{width:28px;height:28px;fill:#fff}footer{text-align:center;padding:36px 20px;color:#3a4a60;font-size:12px;border-top:1px solid #152036;margin-top:60px}footer a{color:#5a6a80;text-decoration:none}@media(max-width:768px){.page-layout{flex-direction:column}.page-sidebar{width:100%;position:static}.article-layout{flex-direction:column}.article-sidebar{width:100%;position:static}.page-hero h1{font-size:30px}.featured-card img{height:200px}.article-grid{grid-template-columns:1fr}.content h2{font-size:22px}.whatsapp-float{bottom:16px;right:16px;width:48px;height:48px}}`;

const SVG_WPP = '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
const SVG_IN = '<svg viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';
const SVG_X = '<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const SVG_ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

function generateTOC(body) { const h2s = body.match(/<h2[^>]*>(.*?)<\/h2>/gi) || []; return h2s.map((h, i) => ({ id: `sec-${i}`, text: h.replace(/<[^>]+>/g, '') })); }
function injectAnchors(body) { let i = 0; return body.replace(/<h2([^>]*)>(.*?)<\/h2>/gi, (m, attrs, text) => `<h2${attrs} id="sec-${i++}">${text}</h2>`); }
function estimateReadTime(body) { const t = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return Math.max(1, Math.ceil(t.split(' ').length / 200)); }

function sanitizeHTML(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'"|javascript:[^\s>]+)/gi, 'href="#"')
    .replace(/src\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'"|javascript:[^\s>]+)/gi, 'src=""');
}

function guessCategory(post) {
  const tags = (JSON.parse(post.tags || '[]')).join(' ').toLowerCase();
  const title = post.title.toLowerCase();
  if (/crm/.test(tags + title)) return 'CRM';
  if (/vendas|vender/.test(tags + title)) return 'Vendas';
  if (/tráfego|trafego|ads|google/.test(tags + title)) return 'Tráfego Pago';
  if (/agente|ia|inteligência|inteligencia/.test(tags + title)) return 'IA & Automação';
  if (/atendimento|whatsapp/.test(tags + title)) return 'Atendimento';
  if (/gestão|gestao|obras|projeto/.test(tags + title)) return 'Gestão';
  if (/lead|captação|captacao|prospecção/.test(tags + title)) return 'Prospecção';
  if (/segurança|seguranca/.test(tags + title)) return 'Tecnologia';
  return 'Geral';
}

function renderHome(posts) {
  const featured = posts[0];
  const rest = posts.slice(1);

  // Categorias
  const cats = {};
  posts.forEach(p => { const c = guessCategory(p); cats[c] = (cats[c] || 0) + 1; });
  const catPills = Object.entries(cats).map(([k, v]) => `<span class="cat-filter"><span>${k}</span><span class="count">${v}</span></span>`).join('');

  // Mais lidos (simulado pelos primeiros 5)
  const top5 = posts.slice(0, 5).map((p, i) => `<li><span class="num">${i + 1}.</span><a href="/${p.slug}">${p.title.substring(0, 50)}...</a></li>`).join('');

  const featuredCard = featured ? `
    <div class="featured-card">
      <a href="/${featured.slug}">${featured.cover_image ? `<img src="${featured.cover_image}" alt="${featured.title}" loading="lazy">` : ''}</a>
      <div class="featured-card-body">
        <span class="cat-badge">${guessCategory(featured)}</span>
        <h2><a href="/${featured.slug}">${featured.title}</a></h2>
        ${featured.subtitle ? `<p class="excerpt">${featured.subtitle.substring(0, 160)}...</p>` : ''}
        <div class="card-meta">
          <span>📅 ${new Date(featured.published_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span>⏱️ ${estimateReadTime(featured.body || '')} min</span>
          <a href="/${featured.slug}" class="read-link">Ler artigo ${SVG_ARROW}</a>
        </div>
      </div>
    </div>` : '';

  const grid = rest.map(p => `
    <div class="article-card">
      <a href="/${p.slug}">${p.cover_image ? `<img src="${p.cover_image}" alt="${p.title}" loading="lazy">` : ''}</a>
      <div class="article-card-body">
        <span class="cat-badge">${guessCategory(p)}</span>
        <h3><a href="/${p.slug}">${p.title}</a></h3>
        ${p.subtitle ? `<p class="card-excerpt">${p.subtitle.substring(0, 100)}...</p>` : ''}
        <div class="card-meta">
          <span>${new Date(p.published_at).toLocaleDateString('pt-BR')} · ${estimateReadTime(p.body || '')} min</span>
        </div>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html><html lang="pt"><head>${GTM_HEAD}<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blog Viga Sales — Automação, Vendas e Tecnologia</title><meta name="description" content="Artigos sobre automação de atendimento, CRM, tráfego pago, gestão e growth para construtoras e engenheiros."><style>${CSS}</style></head><body>${GTM_BODY}<div class="container"><div class="breadcrumb"><a href="https://vigasales.com.br">Início</a> / <span>Blog</span></div><div class="page-hero"><h1>Tudo sobre <em>automação, vendas e tecnologia</em> para construtoras</h1><p>Artigos escritos por Raul Santos e pelo time Viga Sales, em linguagem prática, com exemplos reais do mercado de construção civil. Conteúdo para você vender mais, atender melhor e escalar seu negócio.</p></div><div class="category-filters">${catPills}</div><div class="page-layout"><div class="page-main">${featuredCard}<div class="article-grid">${grid}</div></div><div class="page-sidebar"><div class="sidebar-card"><h4>Mais Lidos</h4><ul>${top5}</ul></div><div class="sidebar-card"><h4>Categorias</h4><ul>${Object.entries(cats).map(([k, v]) => `<li><a href="#">${k}</a> <span style="color:#3a4a60;font-size:11px">(${v})</span></li>`).join('')}</ul></div><div class="sidebar-card" style="text-align:center"><p style="color:#6b7fa0;font-size:13px;margin-bottom:12px">Tem dúvida sobre automação?</p><a href="https://wa.me/${WPP}?text=Olá! Vim pelo blog e quero saber mais." class="sidebar-wpp" target="_blank">${SVG_WPP} Falar pelo WhatsApp</a></div></div></div></div><a href="https://wa.me/${WPP}?text=Olá! Vim pelo blog." class="whatsapp-float" target="_blank">${SVG_WPP}</a><footer>Viga Sales</footer>${trackingHome()}</body></html>`;
}

function renderPost(post, related = []) {
  let faqSchema = '';
  try { const faq = typeof post.faq === 'string' ? JSON.parse(post.faq) : (post.faq || []); if (faq.length) faqSchema = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faq.map(q => `{"@type":"Question","name":${JSON.stringify(q.question)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(q.answer)}}}`).join(',')}]}</script>`; } catch {}
  const articleSchema = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":${JSON.stringify(post.title)},"datePublished":"${new Date(post.published_at).toISOString()}","author":{"@type":"Organization","name":"Viga Sales"}}</script>`;
  const toc = generateTOC(post.body);
  const body = injectAnchors(sanitizeHTML(post.body));
  const readTime = estimateReadTime(post.body);
  const tags = JSON.parse(post.tags || '[]');
  const shareUrl = encodeURIComponent(`https://${BLOG_HOST}/${post.slug}`);
  const titleEnc = encodeURIComponent(post.title);
  const relatedHtml = related.length ? `<div class="related"><h3>Artigos Relacionados</h3><div class="related-list">${related.map(r => `<div class="related-item"><a href="/${r.slug}">${r.title}</a></div>`).join('')}</div></div>` : '';

  return `<!DOCTYPE html><html lang="pt"><head>${GTM_HEAD}<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${post.title} — Blog Viga Sales</title><meta name="description" content="${(post.subtitle || post.title).substring(0, 160)}">${faqSchema}${articleSchema}<style>${CSS}</style></head><body>${GTM_BODY}<div class="read-progress" id="progressBar"></div><div class="container"><div class="breadcrumb"><a href="/">Blog</a> / <span>${post.title.substring(0, 60)}...</span></div><div class="article-layout"><div class="article-sidebar"><div class="toc-sticky"><h4>Neste Artigo</h4><ul class="toc-list">${toc.map((t, i) => `<li><a href="#${t.id}" class="toc-link">${i + 1}. ${t.text}</a></li>`).join('')}</ul><div class="share-bar"><a href="https://wa.me/?text=${titleEnc}%20${shareUrl}" class="share-btn wpp" target="_blank">${SVG_WPP}</a><a href="https://www.linkedin.com/shareArticle?url=${shareUrl}" class="share-btn in" target="_blank">${SVG_IN}</a><a href="https://twitter.com/intent/tweet?url=${shareUrl}&text=${titleEnc}" class="share-btn tw" target="_blank">${SVG_X}</a></div><a href="https://wa.me/${WPP}?text=Olá! Acabei de ler '${titleEnc}' no blog." class="sidebar-wpp" target="_blank">${SVG_WPP} Falar pelo WhatsApp</a></div></div><div class="article-main">${post.cover_image ? `<img src="${post.cover_image}" class="cover-img" alt="${post.title}">` : ''}<h1>${post.title}</h1><div class="post-meta"><span>📅 ${new Date(post.published_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span><span>⏱️ ${readTime} min de leitura</span>${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div><div class="content">${body}</div>${relatedHtml}<div class="author-section"><div class="author-avatar">R</div><div class="author-info"><h3>Raul Santos</h3><p>Gestor de tráfego, criador de sites e especialista em automação comercial. Fundador da Viga Sales.</p></div></div><div class="cta-bottom"><h2>Pronto para automatizar seu atendimento?</h2><p>Fale com a Viga Sales e descubra como um time de agentes de IA pode transformar suas vendas.</p><a href="https://wa.me/${WPP}?text=Olá! Vim pelo blog e quero saber mais sobre automação." class="btn-wpp" target="_blank">${SVG_WPP} Falar pelo WhatsApp</a></div></div></div></div><a href="https://wa.me/${WPP}?text=Olá! Li o artigo '${titleEnc}' no blog." class="whatsapp-float" target="_blank">${SVG_WPP}</a><footer>Viga Sales</footer><script>const tocLinks=document.querySelectorAll('.toc-link');const sections=[...document.querySelectorAll('[id^=sec-]')];const progressBar=document.getElementById('progressBar');function onScroll(){const st=window.scrollY;const dh=document.documentElement.scrollHeight-window.innerHeight;progressBar.style.width=dh>0?(st/dh*100)+'%':'0%';let active=null;for(const s of sections){if(s.getBoundingClientRect().top<=120)active=s.id}if(active){tocLinks.forEach(l=>{l.classList.toggle('active',l.getAttribute('href')==='#'+active)})}}window.addEventListener('scroll',onScroll);onScroll();tocLinks.forEach(l=>{l.addEventListener('click',e=>{e.preventDefault();const el=document.querySelector(l.getAttribute('href'));if(el)el.scrollIntoView({behavior:'smooth',block:'start'})})});</script>${trackingPost(post.title, post.slug, tags)}</body></html>`;
}

router.get("/", async (req, res, next) => {
  if (req.hostname !== BLOG_HOST) return next();
  const posts = await query("SELECT * FROM blog_posts WHERE status='published' ORDER BY published_at DESC LIMIT 30").catch(() => []);
  res.send(renderHome(posts));
});

router.get("/:slug", async (req, res, next) => {
  if (req.hostname !== BLOG_HOST) return next();
  const slug = req.params.slug;
  if (slug === 'api' || slug === 'assets' || slug === 'favicon.ico' || slug.includes('.')) return next();
  const post = await queryOne("SELECT * FROM blog_posts WHERE slug=$1 AND status='published'", [slug]).catch(() => null);
  if (!post) return res.status(404).send(`<!DOCTYPE html><html lang="pt"><head>${GTM_HEAD}<meta charset="utf-8"><title>404</title><style>body{background:#080d18;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}</style></head><body>${GTM_BODY}<div style="text-align:center"><h1>404</h1><p>Post não encontrado</p><a href="/" style="color:#f97316">← Blog</a></div></body></html>`);
  const related = await query("SELECT title, slug FROM blog_posts WHERE slug!=$1 AND status='published' ORDER BY RANDOM() LIMIT 3", [slug]).catch(() => []);
  res.send(renderPost(post, related));
});

router.get("/blog", (req, res) => res.redirect(`https://${BLOG_HOST}`));
router.get("/blog/:slug", (req, res) => res.redirect(`https://${BLOG_HOST}/${req.params.slug}`));

export default router;
