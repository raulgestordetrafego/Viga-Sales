/**
 * LLM Helper — DeepSeek (preferencial) → Qwen → OpenAI fallback
 */

import axios from 'axios';

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

export async function chat({ model = 'deepseek-chat', messages, temperature = 0.7, max_tokens = 2000, response_format }) {
  const cfg = getProvider(model);

  const body = { model: cfg.model, messages, temperature, max_tokens };
  if (response_format) body.response_format = response_format;

  const res = await axios.post(cfg.url, body, {
    headers: { 'Authorization': `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    timeout: 120000,
  });
  return res.data;
}

function getProvider(model) {
  if (DEEPSEEK_KEY && !model.startsWith('qwen-') && !model.startsWith('gpt-')) {
    return { url: 'https://api.deepseek.com/v1/chat/completions', key: DEEPSEEK_KEY, model };
  }
  if (DASHSCOPE_KEY) {
    return { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', key: DASHSCOPE_KEY, model };
  }
  if (OPENAI_KEY) {
    return { url: 'https://api.openai.com/v1/chat/completions', key: OPENAI_KEY, model: model.startsWith('qwen-') ? 'gpt-4o-mini' : model };
  }
  throw new Error('Nenhum provider de IA configurado');
}

export async function chatContent(opts) {
  const data = await chat(opts);
  return data?.choices?.[0]?.message?.content || '';
}

export function activeProvider() {
  if (DEEPSEEK_KEY) return 'deepseek';
  if (DASHSCOPE_KEY) return 'qwen';
  if (OPENAI_KEY) return 'openai';
  return 'none';
}
