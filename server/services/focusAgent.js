/**
 * FOCUS AGENT — Cutuca o Raul a cada 30min pra focar em prospecção
 * "FOCO PROSPECÇÃO — PARA DE CODAR. 2H DE CONTATO LÍQUIDO TODO DIA."
 * seg-sex, 8h-20h
 */

let interval = null;

export function startFocusAgent() {
  if (interval) return;
  console.log('[Foco] Agente iniciado — notificações a cada 30min, seg-sex, 8h-20h');

  interval = setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const min = now.getMinutes();

    if (day < 1 || day > 5) return; // fds
    if (hour < 8 || hour >= 20) return; // fora do comercial

    try {
      const { default: metaApi } = await import('./metaWhatsapp.js');
      await metaApi.sendText('556195624499', '🚨 FOCO PROSPECÇÃO — PARA DE CODAR. 2H DE CONTATO LÍQUIDO TODO DIA.');
      console.log('[Foco] ✅ ' + now.toLocaleTimeString('pt-BR'));
    } catch (e) {
      console.error('[Foco] ❌', e.message);
    }
  }, 30 * 60_000);
}
