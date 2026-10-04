import React from 'react';
import {
  Gemini,
  Claude,
  OpenAI,
  Ollama,
  DeepSeek,
  Qwen,
  Meta,
  Mistral,
  Groq,
  Grok,
  XAI,
  Moonshot,
  Bedrock,
  Google,
  OpenRouter,
  Perplexity,
  Minimax,
  Zhipu,
  HuggingFace
} from '@lobehub/icons';
import { Bot } from 'lucide-react';
import type { AIProvider, ModelDefinition } from '../types.ts';

interface ModelIconProps {
  provider?: AIProvider | null;
  model?: ModelDefinition | { model_id?: string; display_name?: string } | null;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export type ModelBrand =
  | 'gemini'
  | 'claude'
  | 'openai'
  | 'deepseek'
  | 'ollama'
  | 'qwen'
  | 'meta'
  | 'mistral'
  | 'groq'
  | 'grok'
  | 'moonshot'
  | 'bedrock'
  | 'google'
  | 'openrouter'
  | 'perplexity'
  | 'minimax'
  | 'zhipu'
  | 'huggingface'
  | 'generic';

export function resolveBrand(provider?: AIProvider | null, model?: { model_id?: string; display_name?: string } | null): ModelBrand {
  const mName = (model?.display_name || '').toLowerCase();
  const mId = (model?.model_id || '').toLowerCase();
  const mAll = `${mName} ${mId}`;

  // 1. Check model identity first (prioritize over proxy provider types like openai-compatible)
  if (mAll.includes('gemini') || mAll.includes('gemma')) return 'gemini';
  if (mAll.includes('claude') || mAll.includes('anthropic') || mId.includes('sonnet') || mId.includes('opus') || mId.includes('haiku')) return 'claude';
  if (mAll.includes('deepseek') || mAll.includes('deep-seek') || mId.includes('deepseek-r1') || mId.includes('deepseek-v3')) return 'deepseek';
  if (mAll.includes('grok') || mAll.includes('xai')) return 'grok';
  if (mAll.includes('gpt') || mAll.includes('chatgpt') || mId.startsWith('o1') || mId.startsWith('o3') || mId.startsWith('o4') || mAll.includes('dall-e')) return 'openai';
  if (mAll.includes('qwen') || mAll.includes('tongyi')) return 'qwen';
  if (mAll.includes('llama') || mAll.includes('meta')) return 'meta';
  if (mAll.includes('mistral') || mAll.includes('codestral') || mAll.includes('mixtral') || mAll.includes('pixtral')) return 'mistral';
  if (mAll.includes('groq')) return 'groq';
  if (mAll.includes('moonshot') || mAll.includes('kimi')) return 'moonshot';
  if (mAll.includes('bedrock') || mAll.includes('titan')) return 'bedrock';
  if (mAll.includes('perplexity') || mAll.includes('sonar')) return 'perplexity';
  if (mAll.includes('minimax') || mAll.includes('abab')) return 'minimax';
  if (mAll.includes('zhipu') || mAll.includes('glm')) return 'zhipu';
  if (mAll.includes('huggingface') || mAll.includes('hf/')) return 'huggingface';
  if (mAll.includes('openrouter')) return 'openrouter';

  // 2. Check provider-specific names
  const pName = (provider?.name || '').toLowerCase();
  const pId = (provider?.id || '').toLowerCase();
  const pAll = `${pName} ${pId}`;

  if (pAll.includes('google')) return 'gemini';
  if (pAll.includes('anthropic')) return 'claude';
  if (pAll.includes('deepseek')) return 'deepseek';
  if (pAll.includes('xai') || pAll.includes('grok')) return 'grok';
  if (pAll.includes('openai') && !provider?.type?.includes('compatible')) return 'openai';
  if (pAll.includes('ollama')) return 'ollama';
  if (pAll.includes('groq')) return 'groq';
  if (pAll.includes('moonshot') || pAll.includes('kimi')) return 'moonshot';
  if (pAll.includes('openrouter')) return 'openrouter';

  // 3. Fallback by provider type
  const pType = (provider?.type || '').toLowerCase();
  if (pType === 'google') return 'gemini';
  if (pType === 'anthropic') return 'claude';
  if (pType === 'openai') return 'openai';
  if (pType === 'ollama') return 'ollama';

  return 'generic';
}

export const ModelIcon: React.FC<ModelIconProps> = ({
  provider,
  model,
  size = 20,
  className = '',
  style
}) => {
  const brand = resolveBrand(provider, model);
  const iconSize = typeof size === 'number' ? size : 20;

  switch (brand) {
    case 'gemini':
      return <Gemini.Color size={iconSize} className={className} style={style} />;
    case 'claude':
      return <Claude.Color size={iconSize} className={className} style={style} />;
    case 'openai':
      return <OpenAI size={iconSize} className={className} style={{ color: 'var(--text-primary)', flexShrink: 0, ...style }} />;
    case 'deepseek':
      return <DeepSeek.Color size={iconSize} className={className} style={style} />;
    case 'ollama':
      return <Ollama size={iconSize} className={className} style={{ color: 'var(--text-primary)', flexShrink: 0, ...style }} />;
    case 'qwen':
      return <Qwen.Color size={iconSize} className={className} style={style} />;
    case 'meta':
      return <Meta.Color size={iconSize} className={className} style={style} />;
    case 'mistral':
      return <Mistral.Color size={iconSize} className={className} style={style} />;
    case 'groq':
      return <Groq size={iconSize} className={className} style={{ color: '#f55036', flexShrink: 0, ...style }} />;
    case 'grok':
      return <Grok size={iconSize} className={className} style={{ color: 'var(--text-primary)', flexShrink: 0, ...style }} />;
    case 'moonshot':
      return <Moonshot size={iconSize} className={className} style={{ color: 'var(--text-primary)', flexShrink: 0, ...style }} />;
    case 'bedrock':
      return <Bedrock.Color size={iconSize} className={className} style={style} />;
    case 'google':
      return <Google.Color size={iconSize} className={className} style={style} />;
    case 'openrouter':
      return <OpenRouter.Color size={iconSize} className={className} style={style} />;
    case 'perplexity':
      return <Perplexity.Color size={iconSize} className={className} style={style} />;
    case 'minimax':
      return <Minimax.Color size={iconSize} className={className} style={style} />;
    case 'zhipu':
      return <Zhipu.Color size={iconSize} className={className} style={style} />;
    case 'huggingface':
      return <HuggingFace.Color size={iconSize} className={className} style={style} />;
    default:
      return <Bot size={iconSize} className={className} style={style} />;
  }
};
