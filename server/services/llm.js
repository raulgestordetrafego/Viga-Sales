/**
 * LLM Helper — Qwen via Alibaba DashScope (OpenAI-compatible)
 * Fallback: OpenAI se DASHSCOPE_API_KEY não estiver configurada
 */

import axios from 'axios';

const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

// Qwen via DashScope (preferencial)
const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
// OpenAI (fallback)
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// Model mapping: nosso ID → nome real na API
const QWEN_MODELS = {
  'qwen-max': 'qwen-max',
  'qwen-plus': 'qwen-plus',
  'qwen-turbo': 'qwen-turbo',
};

/**
 * Chat completion — usa Qwen se disponível, senão OpenAI
 * @param {object} opts
 * @param {string} opts.model - 'qwen-max', 'qwen-plus', 'qwen-turbo', ou modelo OpenAI
 * @param {Array} opts.messages - array de mensagens {role, content}
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.max_tokens=2000]
 * @param {object} [opts.response_format] - optional {type: 'json_object'}
 * @returns {Promise<object>} raw API response
 */
export async function chat({ model = 'qwen-plus', messages, temperature = 0.7, max_tokens = 2000, response_format }) {
  const useQwen = !!DASHSCOPE_KEY;

  const body = {
    model: useQwen ? (QWEN_MODELS[model] || model) : (model.startsWith('qwen-') ? 'gpt-4o-mini' : model),
    messages,
    temperature,
    max_tokens,
  };
  if (response_format) body.response_format = response_format;

  const res = await axios.post(
    useQwen ? QWEN_URL : OPENAI_URL,
    body,
    {
      headers: {
        'Authorization': `Bearer ${useQwen ? DASHSCOPE_KEY : OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );

  return res.data;
}

/**
 * Retorna o conteúdo da primeira choice
 */
export async function chatContent(opts) {
  const data = await chat(opts);
  return data?.choices?.[0]?.message?.content || '';
}

/**
 * Verifica se Qwen está disponível
 */
export function isQwenAvailable() {
  return !!DASHSCOPE_KEY;
}

/**
 * Qual provider está ativo
 */
export function activeProvider() {
  return DASHSCOPE_KEY ? 'qwen' : (OPENAI_KEY ? 'openai' : 'none');
}
