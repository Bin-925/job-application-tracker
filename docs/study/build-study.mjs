import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const markedPath = process.env.MARKED_MODULE || path.join(
  process.env.USERPROFILE || '',
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked/lib/marked.esm.js',
);
const { marked } = await import(pathToFileURL(markedPath).href);
const markdown = await fs.readFile(path.join(directory, 'PROJECT_STUDY_NOTE.md'), 'utf8');
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const chapters = [];
const localLinks = new Set();
let headingCount = 0;
let diagramCount = 0;
marked.use({
  renderer: {
    heading(token) {
      const id = `section-${headingCount++}`;
      if (token.depth === 2) chapters.push({ id, title: token.text });
      return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    },
    code(token) {
      if (token.lang === 'mermaid') {
        const number = ++diagramCount;
        return `<figure class="diagram"><div class="diagram-scroll"><pre class="mermaid">${escape(token.text)}</pre></div><figcaption>그림 ${number}</figcaption><details class="diagram-source"><summary>다이어그램 원문</summary><pre><code>${escape(token.text)}</code></pre></details></figure>`;
      }
      return `<pre class="code"><code class="language-${escape(token.lang || 'text')}">${escape(token.text)}</code></pre>\n`;
    },
    link(token) {
      let href = token.href;
      if (/^[a-z]:\//i.test(href)) {
        localLinks.add(href);
        href = pathToFileURL(href).href;
      }
      return `<a href="${escape(href)}"${token.title ? ` title="${escape(token.title)}"` : ''}>${this.parser.parseInline(token.tokens)}</a>`;
    },
    table(token) {
      const cell = (item, tag) => `<${tag}>${this.parser.parseInline(item.tokens)}</${tag}>`;
      const header = `<thead><tr>${token.header.map(item => cell(item, 'th')).join('')}</tr></thead>`;
      const body = `<tbody>${token.rows.map(row => `<tr>${row.map(item => cell(item, 'td')).join('')}</tr>`).join('')}</tbody>`;
      return `<div class="table-scroll" tabindex="0" role="region" aria-label="학습 표"><table>${header}${body}</table></div>`;
    },
  },
});
const body = marked.parse(markdown);
const navigation = chapters.map(chapter => `<a href="#${chapter.id}">${escape(chapter.title)}</a>`).join('\n');
const css = await fs.readFile(path.join(directory, 'reader.css'), 'utf8');
const script = await fs.readFile(path.join(directory, 'reader.js'), 'utf8');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>취준노트 프로젝트 학습 노트</title><meta name="description" content="현재 코드를 이해하는 통합 학습 노트: 웹 기초, 구현 이유, 데이터, 세션 인증, 보안, 실습.">
<style>${css}</style></head><body>
<a class="skip" href="#main">본문으로 이동</a>
<header class="topbar"><a class="brand" href="#main">취준노트 <span>학습 노트</span></a><div class="actions"><button id="answers" type="button" aria-pressed="false">해설 펼치기</button><button id="print" type="button">인쇄</button></div></header>
<div class="layout"><aside class="sidebar"><nav aria-label="장 목차"><h2>학습 목차</h2>${navigation}</nav></aside>
<main id="main"><details class="mobile-toc"><summary>목차 · ${chapters.length}개 장</summary><nav aria-label="모바일 장 목차">${navigation}</nav></details>
<div class="edition"><span>2026.09.28 통합판</span><span>${chapters.length}개 장 · ${diagramCount}개 다이어그램 · 실습 12개</span></div>
<article>${body}</article><footer>현재 코드와 학습용 설명을 구분해 읽으세요. 애플리케이션의 변경에 따라 이 자료도 갱신이 필요합니다.<br><span id="diagram-status" role="status">다이어그램 준비 중</span></footer></main></div>
<script src="assets/mermaid.min.js"></script><script>${script}</script></body></html>`;
await fs.writeFile(path.join(directory, 'PROJECT_STUDY_NOTE.html'), html, 'utf8');
const missing = [];
for (const link of localLinks) {
  try { await fs.access(link); } catch { missing.push(link); }
}
console.log(JSON.stringify({ chapters: chapters.length, diagrams: diagramCount, localLinks: localLinks.size, missing, markdownBytes: Buffer.byteLength(markdown), htmlBytes: Buffer.byteLength(html) }, null, 2));
if (missing.length) process.exitCode = 1;
