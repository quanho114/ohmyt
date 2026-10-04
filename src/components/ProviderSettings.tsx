import React, { useEffect, useRef, useState } from 'react';
import type { AIProvider, ModelDefinition } from '../types.ts';
import type { SettingsLocale } from '../appearance.ts';
import type { SettingsTextKey } from '../settingsLocale.ts';
import { normalizeSearch, settingsText } from '../settingsLocale.ts';
import { api } from '../api.ts';
import xorbitsLogo from '../assets/xorbits-logo.png';
import anthropicMark from '../assets/provider-icons/anthropic-mark.png';
import geminiSparkle from '../assets/provider-icons/gemini-sparkle.png';
import moonshotMark from '../assets/provider-icons/moonshot-mark.png';
import amazonBedrockMark from '../assets/provider-icons/amazon-bedrock.svg';
import {
  Search,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Layers,
  Zap,
  ChevronRight
} from 'lucide-react';

interface ProviderSettingsProps {
  providers: AIProvider[];
  onRefresh: () => void;
  locale: SettingsLocale;
}

function parseCaps(m: ModelDefinition): Record<string, boolean> {
  try {
    return JSON.parse(m.capabilities_json || '{}');
  } catch {
    return {};
  }
}

function providerDescription(p: AIProvider): string {
  try {
    const cfg = JSON.parse(p.config_json || '{}');
    return typeof cfg.description === 'string' ? cfg.description : '';
  } catch {
    return '';
  }
}

const CAP_LABELS: Array<[string, SettingsTextKey | 'JSON']> = [
  ['tools', 'Công cụ'],
  ['vision', 'Thị giác'],
  ['json', 'JSON'],
  ['reasoning', 'Suy luận'],
  ['embeddings', 'Nhúng']
];

const CATALOG_PROVIDERS: Array<{ id: string; name: string; type: string; defaultBase: string; description: SettingsTextKey; badge: string }> = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    type: 'anthropic',
    defaultBase: 'https://api.anthropic.com',
    description: 'Anthropic phát triển các mô hình ngôn ngữ tiên tiến như Claude 3.5 Sonnet, Claude 3 Opus...',
    badge: 'Claude'
  },
  {
    id: 'google',
    name: 'Google Gemini',
    type: 'google',
    defaultBase: 'https://generativelanguage.googleapis.com',
    description: 'Dòng Gemini của Google là AI đa năng tiên tiến nhất, hỗ trợ multimodal và context window siêu lớn.',
    badge: 'Gemini'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    defaultBase: 'https://api.openai.com/v1',
    description: 'OpenAI là phòng nghiên cứu AI hàng đầu với các mô hình GPT-4o, o1, o3-mini tiên tiến.',
    badge: 'GPT-4o'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    defaultBase: 'https://api.deepseek.com/v1',
    description: 'DeepSeek tập trung vào nghiên cứu và ứng dụng AI với DeepSeek V3 và DeepSeek R1 reasoning.',
    badge: 'V3 / R1'
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    type: 'ollama',
    defaultBase: 'http://localhost:11434',
    description: 'Chạy các mô hình mã nguồn mở cục bộ ngay trên máy cá nhân, bảo mật và riêng tư 100%.',
    badge: 'Máy cục bộ'
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    type: 'openai-compatible',
    defaultBase: 'https://api.moonshot.cn/v1',
    description: 'Kimi Code từ Moonshot AI cung cấp quyền truy cập vào các mô hình Kimi bao gồm K2.5.',
    badge: 'Kimi'
  },
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    type: 'custom',
    defaultBase: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    description: 'Amazon Bedrock cung cấp các mô hình nền tảng từ AI21, Anthropic, Cohere, Meta qua AWS.',
    badge: 'AWS'
  },
  {
    id: 'xinference',
    name: 'Xinference',
    type: 'openai-compatible',
    defaultBase: 'http://localhost:9997/v1',
    description: 'Xorbits Inference là nền tảng mã nguồn mở giúp đơn giản hóa việc chạy và tích hợp AI nội bộ.',
    badge: 'Tự lưu trữ'
  }
];

// Brand marks use Simple Icons paths or vendor-published assets and work offline.
// Unknown/custom providers keep neutral initials instead of a guessed logo.
const BRAND_PATHS: Record<string, { d: string; color: string }> = {
  openai: {
    d: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
    color: 'currentColor'
  },
  deepseek: {
    d: 'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45',
    color: '#4D6BFE'
  },
  kimi: {
    // K-only mark from Simple Icons, matching the mark in Kimi's brand guide.
    d: 'M21.765.351C22.998.351 24 1.353 24 2.586S22.998 4.82 21.765 4.82h-1.974c-.15 0-.26-.12-.26-.26V2.586A2.237 2.237 0 0 1 21.765.35M9.41 13.388l8.447-8.377c.16-.16.07-.471-.14-.471h-4.55s-.1.02-.14.06l-9.099 9.029c-.14.14-.35.02-.35-.21V4.81c0-.15-.1-.27-.221-.27H.22c-.12 0-.22.12-.22.27v18.57c0 .15.1.27.22.27h3.137c.12 0 .22-.12.22-.27v-3.79c0-.08.03-.16.08-.21l2.826-2.796c.07-.07.16-.08.241-.03l7.546 5.551a8.9 8.9 0 0 0 4.018 1.493c.12.01.23-.11.23-.27V19.76c0-.14-.08-.25-.19-.26a5.8 5.8 0 0 1-2.355-.942l-6.533-4.73c-.14-.09-.15-.32-.03-.441',
    color: '#1783FF'
  },
  ollama: {
    d: 'M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002zm-5.503-11a1.653 1.653 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503 0 .544.064 1.24.155 1.721.02.107.031.202.023.208a8.12 8.12 0 0 1-.187.152 5.324 5.324 0 0 0-.949 1.02 5.49 5.49 0 0 0-.94 2.339 6.625 6.625 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195-.037.064c-.269.452-.498 1.105-.605 1.732-.084.496-.095.629-.095 1.294 0 .67.009.803.088 1.266.095.555.288 1.143.503 1.534.071.128.243.393.264.407.007.003-.014.067-.046.141a7.405 7.405 0 0 0-.548 1.873c-.062.417-.071.552-.071.991 0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.915.915 0 0 0-.194-.25 1.74 1.74 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451.124-.486.329-.918.544-1.154a.787.787 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.136 3.136 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834.563-.814 1.353-1.336 2.237-1.475.199-.033.57-.028.776.01.226.04.367.028.512-.041.179-.085.268-.19.374-.431.093-.215.165-.333.36-.576.234-.29.46-.489.822-.729.413-.27.884-.467 1.352-.561.17-.035.25-.04.569-.04.319 0 .398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602.034.057.095.177.132.267.105.241.195.346.374.43.14.068.286.082.503.045.343-.058.607-.053.943.016 1.144.23 2.14 1.173 2.581 2.437.385 1.108.276 2.267-.296 3.153-.097.15-.193.27-.333.419-.301.322-.301.722-.001 1.053.493.539.801 1.866.708 3.036-.062.772-.26 1.463-.533 1.854a2.096 2.096 0 0 1-.224.258.916.916 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295.253 1.008.231 2.01-.059 2.581a.845.845 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074.036-.134c.019-.076.057-.3.088-.516.029-.217.029-1.016 0-1.258-.11-.875-.295-1.57-.597-2.226-.032-.074-.053-.138-.046-.141.008-.005.057-.074.108-.152.376-.569.607-1.284.724-2.228.031-.26.031-1.378 0-1.628-.083-.645-.182-1.082-.348-1.525a6.083 6.083 0 0 0-.329-.7l-.038-.064.131-.194c.402-.604.636-1.262.727-2.04a6.625 6.625 0 0 0-.024-1.358 5.512 5.512 0 0 0-.939-2.339 5.325 5.325 0 0 0-.95-1.02 8.097 8.097 0 0 1-.186-.152.692.692 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503-.19-.924-.535-1.658-.98-2.082-.354-.338-.716-.482-1.15-.455-.996.059-1.8 1.205-2.116 3.01a6.805 6.805 0 0 0-.097.726c0 .036-.007.066-.015.066a.96.96 0 0 1-.149-.078A4.857 4.857 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a.958.958 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a6.71 6.71 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2.096 2.096 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388.03.113.06.244.069.292.007.047.026.152.041.233.067.365.098.76.102 1.24l.002.475-.12.175-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.438 8.438 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711.067-.05.079-.049.157.013zm9.825-.012c.17.126.358.46.498.888.28.854.36 2.028.212 3.145-.019.14-.024.151-.057.144l-.238-.06a3.693 3.693 0 0 0-.954-.124h-.278l-.119-.178-.119-.175.002-.474c.004-.669.066-1.19.214-1.772.157-.623.434-1.185.68-1.382.078-.062.09-.063.159-.012z',
    color: 'currentColor'
  },
  aws: {
    d: 'M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z',
    color: '#FF9900'
  }
};

const PROVIDER_IMAGE_MARKS: Record<string, string> = {
  anthropic: anthropicMark,
  gemini: geminiSparkle,
  moonshot: moonshotMark,
  bedrock: amazonBedrockMark
};

const BrandLogo: React.FC<{ id?: string; type: string; name?: string; size?: number }> = ({ id = '', type, name = '', size = 20 }) => {
  const hay = `${id} ${name}`.toLowerCase();
  const t = type.toLowerCase();

  let key: string | null = null;
  if (hay.includes('anthropic') || hay.includes('claude')) key = 'anthropic';
  else if (hay.includes('gemini') || hay.includes('google')) key = 'gemini';
  else if (hay.includes('deepseek')) key = 'deepseek';
  else if (hay.includes('ollama')) key = 'ollama';
  else if (hay.includes('bedrock')) key = 'bedrock';
  else if (hay.includes('aws') || hay.includes('amazon')) key = 'aws';
  else if (hay.includes('moonshot')) key = 'moonshot';
  else if (hay.includes('kimi')) key = 'kimi';
  else if (hay.includes('xinference') || hay.includes('xorbits')) key = 'xinference';
  else if (t === 'openai' || hay.includes('openai') || hay.includes('chatgpt') || hay.includes('gpt-')) key = 'openai';

  const imageMark = key ? PROVIDER_IMAGE_MARKS[key] : undefined;
  if (imageMark) {
    return (
      <span
        className="w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <img src={imageMark} width={size} height={size} alt="" aria-hidden="true" style={{ objectFit: 'contain' }} />
      </span>
    );
  }

  if (key === 'xinference') {
    return (
      <span
        className="w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <img src={xorbitsLogo} width={size} height={size} alt="" aria-hidden="true" />
      </span>
    );
  }

  if (key) {
    const brand = BRAND_PATHS[key];
    return (
      <span
        className="w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          color: brand.color.startsWith('current') ? 'var(--text-primary)' : brand.color
        }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill={brand.color.startsWith('current') ? 'currentColor' : brand.color} aria-hidden="true">
          <path d={brand.d} />
        </svg>
      </span>
    );
  }

  const initials = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AI';
  return (
    <span
      className="w-8 h-8 rounded-lg border flex items-center justify-center text-[11px] font-bold flex-shrink-0"
      style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {initials}
    </span>
  );
};

type ProviderNotice = { key?: SettingsTextKey; raw?: string; success?: boolean };
type ConnectionResult = { connected: boolean; latencyMs: number; modelsDiscovered: number; code?: string; message?: string; saved?: boolean; discoveryFailed?: boolean };

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({ providers, onRefresh, locale }) => {
  const t = (key: SettingsTextKey) => settingsText(locale, key);
  const addSectionRef = useRef<HTMLElement>(null);
  const addOpenerRef = useRef<HTMLElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pType, setPType] = useState('openai-compatible');
  const [pName, setPName] = useState('My Local Server');
  const [pBase, setPBase] = useState('http://localhost:1234');
  const [pKey, setPKey] = useState('');
  const [pId, setPId] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pLogo, setPLogo] = useState('');
  const [pFormat, setPFormat] = useState('openai');

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, ConnectionResult>>({});
  const [newModelId, setNewModelId] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ProviderNotice | null>(null);
  const [actionError, setActionError] = useState('');
  const [detecting, setDetecting] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [detailBase, setDetailBase] = useState('');
  const [detailKey, setDetailKey] = useState('');
  const [detailMsg, setDetailMsg] = useState<ProviderNotice | null>(null);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (showAdd) {
      addSectionRef.current?.querySelector<HTMLSelectElement>('select')?.focus();
      addSectionRef.current?.scrollIntoView({ block: 'nearest' });
    } else if (addOpenerRef.current) {
      const opener = addOpenerRef.current.isConnected ? addOpenerRef.current : addButtonRef.current;
      opener?.focus();
      addOpenerRef.current = null;
    }
  }, [showAdd]);

  const selected = providers.find((p) => p.id === selectedId) || null;

  const openDetail = (p: AIProvider) => {
    setSelectedId(p.id);
    setDetailBase(p.base_url || '');
    setDetailKey('');
    setDetailMsg(null);
    setModelSearch('');
    setShowKey(false);
  };

  const openCatalogItem = (cat: typeof CATALOG_PROVIDERS[0]) => {
    const existing = providers.find((p) => p.id === cat.id || p.name.toLowerCase().includes(cat.id));
    if (existing) {
      openDetail(existing);
    } else {
      addOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPType(cat.type);
      setPName(cat.name);
      setPBase(cat.defaultBase);
      setPKey('');
      setPId(cat.id);
      setPDesc(t(cat.description));
      setPLogo('');
      setPFormat('openai');
      setFormError(null);
      setShowAdd(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const name = pName.trim();
    const baseURL = pBase.trim();
    const isCustom = pType === 'custom';
    const slug = pId.trim().toLowerCase();

    if (isCustom && !slug) {
      setFormError({ key: 'Vui lòng nhập ID nhà cung cấp (vd: my-provider).' });
      return;
    }
    if (!name) {
      setFormError({ key: 'Vui lòng nhập tên provider.' });
      return;
    }
    if (!baseURL) {
      setFormError({ key: 'Vui lòng nhập Base URL (vd: http://localhost:1234).' });
      return;
    }

    try {
      const created = await api.createProvider({
        ...(isCustom ? { id: slug } : {}),
        name,
        type: pType,
        baseURL,
        apiKey: pKey.trim() || undefined,
        ...(isCustom ? { config: { requestFormat: pFormat, description: pDesc.trim(), logo: pLogo.trim() } } : {})
      });
      setShowAdd(false);
      setPKey('');
      setDetecting(true);
      try {
        const result = await api.testProvider(created.id);
        setTestResult(prev => ({ ...prev, [created.id]: { ...result, saved: true } }));
      } catch {
        setTestResult(prev => ({ ...prev, [created.id]: { connected: false, latencyMs: 0, modelsDiscovered: 0, saved: true, discoveryFailed: true } }));
      } finally {
        setDetecting(false);
      }
      onRefresh();
    } catch (err) {
      setFormError({ raw: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await api.testProvider(id);
      setTestResult(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResult(prev => ({ ...prev, [id]: { connected: false, latencyMs: 0, modelsDiscovered: 0, message: err instanceof Error ? err.message : String(err) } }));
    } finally {
      setTestingId(null);
      onRefresh();
    }
  };

  const handleAddModel = async (providerId: string) => {
    const modelId = (newModelId[providerId] || '').trim();
    if (!modelId) return;
    setActionError('');
    try {
      await api.addModel(providerId, { modelId });
      setNewModelId((prev) => ({ ...prev, [providerId]: '' }));
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleModel = async (providerId: string, m: ModelDefinition) => {
    setActionError('');
    try {
      await api.updateModel(providerId, m.id, { enabled: !m.enabled });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteModel = async (providerId: string, m: ModelDefinition) => {
    if (!confirm(`${t('Xóa mô hình này?')} ${m.display_name}`)) return;
    setActionError('');
    try {
      await api.deleteModel(providerId, m.id);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleEnabled = async (p: AIProvider) => {
    setActionError('');
    try {
      await api.updateProvider(p.id, { enabled: !p.enabled });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${t('Xóa nhà cung cấp này?')} ${name}`)) return;
    setActionError('');
    try {
      await api.deleteProvider(id);
      if (selectedId === id) setSelectedId(null);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveDetail = async () => {
    if (!selected) return;
    setDetailMsg(null);
    try {
      const patch: { baseURL?: string; apiKey?: string } = {};
      if (detailBase.trim() && detailBase.trim() !== (selected.base_url || '')) patch.baseURL = detailBase.trim();
      if (detailKey.trim()) patch.apiKey = detailKey.trim();
      if (Object.keys(patch).length === 0) {
        setDetailMsg({ key: 'Chưa có gì thay đổi.' });
        return;
      }
      await api.updateProvider(selected.id, patch);
      setDetailKey('');
      setDetailMsg({ key: 'Đã lưu.', success: true });
      onRefresh();
    } catch (err) {
      setDetailMsg({ raw: err instanceof Error ? err.message : String(err) });
    }
  };

  const enabledProviders = providers.filter((p) => p.enabled);
  const disabledProviders = providers.filter((p) => !p.enabled);

  // Filter providers for sidebar
  const qSide = normalizeSearch(sidebarSearch);
  const filteredEnabled = enabledProviders.filter(p => normalizeSearch(p.name).includes(qSide));
  const filteredDisabled = disabledProviders.filter(p => normalizeSearch(p.name).includes(qSide));

  // Catalog items that are not yet added in providers
  const unconfiguredCatalog = CATALOG_PROVIDERS.filter(
    (cat) => !providers.some((p) => p.id === cat.id || p.name.toLowerCase().includes(cat.id))
  );
  const selectedTest = selected ? testResult[selected.id] : undefined;

  return (
    <div className="provider-settings flex-1 flex flex-row h-full min-h-0 overflow-hidden select-none">
      {/* 1. LOBEHUB SUB-SIDEBAR (List of Providers) */}
      <aside
        className="provider-sidebar w-60 flex-shrink-0 flex flex-col h-full border-r border-[var(--border)]"
        style={{ backgroundColor: 'var(--sidebar)' }}
      >
        {/* Search & Add Bar */}
        <div className="p-3 space-y-2 border-b border-[var(--border)]">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 opacity-40 pointer-events-none" />
            <input
              type="text"
              placeholder={t('Tìm kiếm nhà cung cấp...')}
              aria-label={t('Tìm kiếm nhà cung cấp...')}
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full text-xs rounded-lg py-1.5 pl-8 pr-2.5 focus:outline-none"
              style={{
                backgroundColor: 'var(--input-background)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <button
            ref={addButtonRef}
            type="button"
            onClick={() => {
              addOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              setPType('openai-compatible');
              setPName('');
              setPBase('');
              setPKey('');
              setPId('');
              setPDesc('');
              setPLogo('');
              setPFormat('openai');
              setFormError(null);
              setShowAdd(true);
            }}
            aria-label={t('Thêm nhà cung cấp')}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer shadow-xs"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)'
            }}
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>{t('Thêm nhà cung cấp')}</span>
          </button>
        </div>

        {/* Providers Tree / List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* Tất cả (All view) */}
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            aria-pressed={selectedId === null}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              selectedId === null ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
            }`}
            style={{ color: 'var(--text-primary)' }}
          >
            <div className="flex items-center gap-2">
              <Layers size={14} className="opacity-60" />
              <span>{t('Tất cả nhà cung cấp')}</span>
            </div>
            <span className="text-[10px] font-mono-code opacity-60 px-1.5 py-0.2 rounded bg-[var(--surface)]">
              {providers.length}
            </span>
          </button>

          {/* Đã bật Group */}
          {filteredEnabled.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-50 flex items-center justify-between">
                <span>{t('Đã bật')}</span>
                <span>{filteredEnabled.length}</span>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {filteredEnabled.map((p) => {
                  const isSel = selectedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openDetail(p)}
                      aria-pressed={isSel}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isSel ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
                      }`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <BrandLogo id={p.id} type={p.type} name={p.name} size={16} />
                        <span className="truncate">{p.name}</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Đã tắt Group */}
          {filteredDisabled.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-50 flex items-center justify-between">
                <span>{t('Đã tắt')}</span>
                <span>{filteredDisabled.length}</span>
              </div>
              <div className="space-y-0.5 mt-0.5">
                {filteredDisabled.map((p) => {
                  const isSel = selectedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openDetail(p)}
                      aria-pressed={isSel}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer opacity-70 hover:opacity-100 ${
                        isSel ? 'bg-[var(--surface-active)] font-semibold' : 'hover:bg-[var(--surface-hover)]'
                      }`}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <BrandLogo id={p.id} type={p.type} name={p.name} size={16} />
                        <span className="truncate">{p.name}</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {qSide && !filteredEnabled.length && !filteredDisabled.length && <p className="p-3 text-xs" role="status" style={{ color: 'var(--text-secondary)' }}>{t('Không tìm thấy nhà cung cấp phù hợp.')}</p>}
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <div className="provider-main flex-1 min-w-0 h-full overflow-y-auto p-6 lg:p-8" style={{ backgroundColor: 'var(--surface)' }}>
        {actionError && (
          <div role="alert" className="mb-4 p-3 rounded-xl text-xs flex items-center gap-2" style={{ backgroundColor: 'var(--danger)', color: 'var(--danger-contrast)' }}>
            <AlertCircle size={15} />
            <span>{actionError}</span>
          </div>
        )}

        {detecting && (
          <div role="status" className="mb-4 p-3 rounded-xl text-xs flex items-center gap-2 bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Loader2 size={15} className="animate-spin" />
            <span>{t('Đang tự động phát hiện models từ endpoint...')}</span>
          </div>
        )}

      {showAdd && (
        <section ref={addSectionRef} aria-labelledby="provider-add-title" className="provider-add w-full max-w-lg rounded-2xl border border-[var(--border)] p-6 space-y-4 select-auto" onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as HTMLElement).closest('select')) { event.preventDefault(); event.stopPropagation(); setShowAdd(false); } }}
            style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
          >
            <div className="flex items-center justify-between">
              <h3 id="provider-add-title" className="text-base font-semibold">{t('Thêm nhà cung cấp AI mới')}</h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                aria-label={t('Đóng')}
                className="p-1 rounded-lg opacity-60 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label htmlFor="provider-add-type" className="block font-medium mb-1 opacity-70">{t('Loại nhà cung cấp')}</label>
                <select
                  id="provider-add-type"
                  value={pType}
                  onChange={(e) => setPType(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="openai-compatible">{t('Tương thích OpenAI')}</option>
                  <option value="ollama">{t('Ollama (máy cục bộ)')}</option>
                  <option value="google">Google Gemini</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">{t('OpenAI chính thức')}</option>
                  <option value="custom">{t('Tùy chỉnh nâng cao')}</option>
                </select>
              </div>

              {pType === 'custom' && (
                <>
                  <div>
                    <label htmlFor="provider-add-id" className="block font-medium mb-1 opacity-70">{t('ID định danh (slug)')}</label>
                    <input
                      id="provider-add-id"
                      value={pId}
                      onChange={(e) => setPId(e.target.value)}
                      placeholder={t('vd: my-local-ai')}
                      className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="provider-add-description" className="block font-medium mb-1 opacity-70">{t('Mô tả')}</label>
                    <input
                      id="provider-add-description"
                      value={pDesc}
                      onChange={(e) => setPDesc(e.target.value)}
                      placeholder={t('Mô tả về server hoặc model này')}
                      className="w-full rounded-lg px-3 py-2 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="provider-add-format" className="block font-medium mb-1 opacity-70">{t('Định dạng request')}</label>
                    <select
                      id="provider-add-format"
                      value={pFormat}
                      onChange={(e) => setPFormat(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    >
                      <option value="openai">{t('Định dạng OpenAI')}</option>
                      <option value="anthropic">{t('Định dạng Anthropic')}</option>
                      <option value="google">{t('Định dạng Google Gemini')}</option>
                      <option value="ollama">{t('Định dạng Ollama')}</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="provider-add-name" className="block font-medium mb-1 opacity-70">{t('Tên hiển thị')}</label>
                <input
                  id="provider-add-name"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder={t('Tên nhà cung cấp (vd: My Server)')}
                  className="w-full rounded-lg px-3 py-2 focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label htmlFor="provider-add-base" className="block font-medium mb-1 opacity-70">Base URL</label>
                <input
                  id="provider-add-base"
                  value={pBase}
                  onChange={(e) => setPBase(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label htmlFor="provider-add-key" className="block font-medium mb-1 opacity-70">{t('API Key (tùy chọn cho local)')}</label>
                <input
                  id="provider-add-key"
                  type="password"
                  value={pKey}
                  onChange={(e) => setPKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg px-3 py-2 font-mono-code focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {formError && (
                <div role="alert" className="p-2.5 rounded-lg text-xs" style={{ backgroundColor: 'var(--danger)', color: 'var(--danger-contrast)' }}>
                  {formError.key ? t(formError.key) : formError.raw}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                >
                  {t('Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={detecting}
                  className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer shadow-xs"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                >
                  {t(detecting ? 'Đang lưu...' : 'Thêm nhà cung cấp')}
                </button>
              </div>
            </form>
        </section>
      )}
        {/* VIEW 1: DETAIL VIEW OF SINGLE PROVIDER */}
        {!showAdd && (selected ? (
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex items-center gap-1.5 text-xs font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ArrowLeft size={14} />
                <span>{t('Tất cả nhà cung cấp')}</span>
              </button>

              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: selected.enabled ? 'var(--success)' : 'var(--text-tertiary)' }}>
                  {t(selected.enabled ? 'Đã bật' : 'Đã tắt')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(selected.enabled)}
                  aria-label={`${t('Đã bật')}: ${selected.name}`}
                  onClick={() => handleToggleEnabled(selected)}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center p-0.5 cursor-pointer ${
                    selected.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${
                      selected.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Provider Card Header */}
            <div
              className="p-5 rounded-2xl border border-[var(--border)] flex items-center justify-between gap-4"
              style={{ backgroundColor: 'var(--surface-secondary)' }}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <BrandLogo id={selected.id} type={selected.type} name={selected.name} size={28} />
                <div>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selected.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono-code px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {selected.type}
                    </span>
                    <span className="text-[11px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      {(selected.models || []).length} {t('mô hình khả dụng')}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTest(selected.id)}
                disabled={testingId === selected.id}
                className="px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] flex items-center gap-1.5 transition-all shadow-xs"
                style={{ color: 'var(--text-primary)' }}
              >
                {testingId === selected.id ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                <span>{t('Kiểm tra kết nối')}</span>
              </button>
            </div>

            {selectedTest && (
              <div role="status" className={`p-3 rounded-xl text-xs font-mono-code flex items-center gap-2 ${selectedTest.connected ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                {selectedTest.connected ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{selectedTest.discoveryFailed ? t('Đã lưu, nhưng chưa phát hiện được mô hình. Hãy kiểm tra kết nối để thử lại.') : selectedTest.connected ? `${t('Đã kết nối')} • ${selectedTest.latencyMs} ms • ${selectedTest.modelsDiscovered} ${t('mô hình')}` : `${t(selectedTest.saved ? 'Đã lưu, nhưng kết nối thất bại' : 'Kết nối thất bại')}: ${selectedTest.code || ''} ${selectedTest.message || ''}`}</span>
              </div>
            )}

            {/* Connection Credentials Card */}
            <div className="p-5 rounded-2xl border border-[var(--border)] space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
              <h4 className="text-xs font-semibold uppercase tracking-wider opacity-60" style={{ color: 'var(--text-tertiary)' }}>
                {t('Cấu hình kết nối API')}
              </h4>

              <div className="space-y-3">
                <div>
                  <label htmlFor="provider-detail-base" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Endpoint URL (Base URL)
                  </label>
                  <input
                    id="provider-detail-base"
                    type="text"
                    value={detailBase}
                    onChange={(e) => setDetailBase(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full text-xs font-mono-code rounded-lg px-3 py-2 focus:outline-none"
                    style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label htmlFor="provider-detail-key" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    API Key
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="provider-detail-key"
                      type={showKey ? 'text' : 'password'}
                      value={detailKey}
                      onChange={(e) => setDetailKey(e.target.value)}
                      placeholder={t(selected.api_key_ref ? '•••••••••••••••• (Đã lưu key)' : 'Nhập API key...')}
                      className="w-full text-xs font-mono-code rounded-lg py-2 pl-3 pr-9 focus:outline-none"
                      style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      aria-label={t(showKey ? 'Ẩn API key' : 'Hiện API key')}
                      className="absolute right-2.5 p-1 opacity-50 hover:opacity-100 cursor-pointer"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {detailMsg && (
                  <div role={detailMsg.raw ? 'alert' : 'status'} className="text-xs" style={{ color: detailMsg.success ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {detailMsg.key ? t(detailMsg.key) : detailMsg.raw}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSaveDetail}
                    className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer shadow-xs transition-all"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
                  >
                    {t('Lưu cấu hình')}
                  </button>
                </div>
              </div>
            </div>

            {/* Model Management Card */}
            <div className="p-5 rounded-2xl border border-[var(--border)] space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
              <div className="provider-model-heading flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('Danh sách mô hình')} ({selected.models?.length ?? 0})
                  </h4>
                  <p className="text-xs opacity-60 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {t('Bật hoặc tắt từng model để hiển thị trong thanh chọn model của chat')}
                  </p>
                </div>

                <div className="relative flex items-center w-56">
                  <Search size={12} className="absolute left-2.5 opacity-40 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={t('Tìm model...')}
                    aria-label={t('Tìm model...')}
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full text-xs rounded-lg py-1 pl-7 pr-2.5 focus:outline-none"
                    style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Add custom model input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('Thêm mã mô hình (vd: gpt-4o, claude-3-5-sonnet)...')}
                  aria-label={t('Thêm model')}
                  value={newModelId[selected.id] || ''}
                  onChange={(e) => setNewModelId({ ...newModelId, [selected.id]: e.target.value })}
                  className="min-w-0 flex-1 text-xs font-mono-code rounded-lg px-3 py-1.5 focus:outline-none"
                  style={{ backgroundColor: 'var(--input-background)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => handleAddModel(selected.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  + {t('Thêm model')}
                </button>
              </div>

              {/* Models List */}
              <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
                {(() => {
                  const q = normalizeSearch(modelSearch);
                  const models = (selected.models || []).filter(m => normalizeSearch(`${m.display_name} ${m.model_id}`).includes(q));

                  if (models.length === 0) {
                    return (
                      <div className="p-6 text-center text-xs opacity-50" style={{ color: 'var(--text-tertiary)' }}>
                        {t(modelSearch ? 'Không tìm thấy mô hình phù hợp' : 'Chưa có mô hình nào. Bấm kiểm tra kết nối để tự động nhận diện.')}
                      </div>
                    );
                  }

                  return models.map((m) => {
                    const caps = parseCaps(m);
                    return (
                      <div
                        key={m.id}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-[var(--surface-hover)] transition-colors"
                        style={{ backgroundColor: 'var(--surface)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                              {m.display_name}
                            </span>
                            <span className="text-[10px] font-mono-code opacity-50" style={{ color: 'var(--text-tertiary)' }}>
                              {m.model_id}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {CAP_LABELS.map(([key, label]) => {
                              const active = Boolean(caps[key]);
                              return (
                                <span
                                  key={key}
                                  className={`text-[9px] font-mono-code px-1.5 py-0.2 rounded ${
                                    active ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'opacity-30'
                                  }`}
                                  style={{ border: '1px solid var(--border-subtle)' }}
                                >
                                  {label === 'JSON' ? label : t(label)}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(m.enabled)}
                            aria-label={`${t('Đã bật')}: ${m.display_name}`}
                            onClick={() => handleToggleModel(selected.id, m)}
                            className={`w-8 h-5 rounded-full transition-colors flex items-center p-0.5 cursor-pointer ${
                              m.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                                m.enabled ? 'translate-x-3' : 'translate-x-0'
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteModel(selected.id, m)}
                            className="p-1 rounded opacity-40 hover:opacity-100 hover:text-red-500 transition-all cursor-pointer"
                            title={t('Xóa model')}
                            aria-label={`${t('Xóa model')}: ${m.display_name}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => handleDelete(selected.id, selected.name)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer text-red-600 border border-red-200 dark:border-red-950/40 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
              >
                {t('Xóa nhà cung cấp này')}
              </button>
            </div>
          </div>
        ) : (
          /* VIEW 2: LOBEHUB CARDS GRID (ALL PROVIDERS) */
          <div className="max-w-6xl space-y-8">
            {/* Header info */}
            <div>
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {t('Nhà Cung Cấp Mô Hình AI')}
              </h2>
              <p className="text-xs opacity-70 mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('Kết nối các nhà cung cấp AI đám mây hoặc chạy trực tiếp cục bộ bằng Ollama và máy chủ nội bộ.')}
              </p>
            </div>

            {/* SECTION 1: ĐÃ BẬT (ACTIVE PROVIDERS) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  {t('Đã bật')}
                </span>
                <span className="text-[10px] font-mono-code px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
                  {enabledProviders.length}
                </span>
              </div>

              {enabledProviders.length === 0 ? (
                <div
                  className="p-6 rounded-2xl border border-[var(--border)] text-center text-xs opacity-60"
                  style={{ backgroundColor: 'var(--surface-secondary)' }}
                >
                  {t('Chưa có nhà cung cấp nào được bật. Hãy bật một provider bên dưới để bắt đầu trò chuyện.')}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {enabledProviders.map((p) => (
                    <div
                      key={p.id}
                      className="group relative p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--border-strong)] transition-all cursor-pointer overflow-hidden shadow-xs hover:shadow-sm"
                      style={{ backgroundColor: 'var(--surface)' }}
                    >
                      {/* LobeHub Gradient Aura */}
                      <div className="absolute top-0 right-0 w-32 h-16 bg-gradient-to-l from-blue-500/10 via-purple-500/10 to-transparent pointer-events-none rounded-tr-2xl" />

                      <div className="flex items-start justify-between gap-3 relative z-10">
                        <div className="flex items-center gap-3 min-w-0">
                          <BrandLogo id={p.id} type={p.type} name={p.name} size={22} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {p.name}
                              </span>
                              <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                            </div>
                            <span className="text-[10px] font-mono-code opacity-60" style={{ color: 'var(--text-secondary)' }}>
                              {(p.models || []).length} {t('mô hình khả dụng')}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={true}
                          aria-label={`${t('Đã bật')}: ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleEnabled(p);
                          }}
                          className="w-9 h-5 rounded-full transition-colors flex items-center p-0.5 bg-emerald-500 cursor-pointer flex-shrink-0"
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform translate-x-4" />
                        </button>
                      </div>

                      <p className="text-[11.5px] leading-relaxed mt-2.5 line-clamp-2 opacity-70" style={{ color: 'var(--text-secondary)' }}>
                        {providerDescription(p) || `${t('Đang hoạt động với')} ${p.base_url || t('cấu hình mặc định')}.`}
                      </p>

                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-[11px]">
                        <span className="font-mono-code text-[10px] opacity-60" style={{ color: 'var(--text-tertiary)' }}>
                          {t(p.api_key_ref ? 'Key đã lưu' : 'Cục bộ / Không cần key')}
                        </span>
                        <button type="button" onClick={() => openDetail(p)} aria-label={`${t('Cấu hình')}: ${p.name}`} className="font-medium text-blue-500 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 cursor-pointer">
                          {t('Cấu hình')} <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 2: ĐÃ TẮT & KHÁM PHÁ CATALOG (3-COLUMN GRID LIKE LOBEHUB) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  {t('Khám phá & Đã tắt')}
                </span>
                <span className="text-[10px] font-mono-code px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 font-semibold">
                  {disabledProviders.length + unconfiguredCatalog.length}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* 1. Existing Disabled Providers in DB */}
                {disabledProviders.map((p) => (
                  <div
                    key={p.id}
                    className="group p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--border-strong)] transition-all cursor-pointer shadow-xs hover:shadow-sm"
                    style={{ backgroundColor: 'var(--surface)', opacity: 0.85 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandLogo id={p.id} type={p.type} name={p.name} size={20} />
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {p.name}
                        </span>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={false}
                        aria-label={`${t('Đã bật')}: ${p.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleEnabled(p);
                        }}
                        className="w-9 h-5 rounded-full transition-colors flex items-center p-0.5 bg-zinc-300 dark:bg-zinc-700 cursor-pointer flex-shrink-0"
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform translate-x-0" />
                      </button>
                    </div>

                    <p className="text-[11.5px] leading-relaxed mt-2.5 line-clamp-2 opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      {providerDescription(p) || t('Nhà cung cấp hiện đang tắt.')}
                    </p>

                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-[10px] opacity-60">
                      <span>{(p.models || []).length} {t('mô hình')}</span>
                      <button type="button" onClick={() => openDetail(p)} aria-label={`${t('Cấu hình')}: ${p.name}`} className="group-hover:text-[var(--text-primary)] cursor-pointer">{t('Bấm để cấu hình')}</button>
                    </div>
                  </div>
                ))}

                {/* 2. Well-Known Catalog Providers (Ready to connect) */}
                {unconfiguredCatalog.map((cat) => (
                  <div
                    key={cat.id}
                    className="group p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--border-strong)] transition-all cursor-pointer shadow-xs hover:shadow-sm"
                    style={{ backgroundColor: 'var(--surface)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandLogo id={cat.id} type={cat.type} name={cat.name} size={20} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                              {cat.name}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono-code px-1.5 py-0.5 rounded font-medium bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-tertiary)] flex-shrink-0">
                        {cat.badge === 'Máy cục bộ' || cat.badge === 'Tự lưu trữ' ? t(cat.badge) : cat.badge}
                      </span>
                    </div>

                    <p className="text-[11.5px] leading-relaxed mt-2.5 line-clamp-2 opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      {t(cat.description)}
                    </p>

                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-[11px]">
                      <span className="text-[10px] opacity-50" style={{ color: 'var(--text-tertiary)' }}>
                        {t('Chưa cấu hình')}
                      </span>
                      <button type="button" onClick={() => openCatalogItem(cat)} aria-label={`${t('Thiết lập')}: ${cat.name}`} className="text-blue-500 font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 cursor-pointer">
                        {t('Thiết lập')} <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
