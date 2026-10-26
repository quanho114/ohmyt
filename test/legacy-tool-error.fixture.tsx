import React from 'react';
import {createRoot} from 'react-dom/client';
import {ChatMessage} from '../src/components/ChatMessage.tsx';
import {defaultAppearance} from '../src/appearance.ts';
import '../src/index.css';
const source='<!DOCTYPE html>\n<html><script>window.unsafe=true;\nfunction loadTodos() { return []; }\n</script></html>';
const content=`Lỗi: Chính sách hệ thống từ chối thực thi công cụ "html_preview" với mục tiêu: "${source}" (Policy: html_preview:*)\n\nĐã tạo file khác.`;
createRoot(document.getElementById('root')!).render(<ChatMessage message={{id:'old',session_id:'fixture',sender:'agent',content,created_at:0}} appearance={defaultAppearance} activeTheme="light"/>);
