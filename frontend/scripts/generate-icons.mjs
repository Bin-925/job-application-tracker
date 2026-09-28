import { mkdir, writeFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotebookPen } from 'lucide-react'
import sharp from 'sharp'

const icon = renderToStaticMarkup(createElement(NotebookPen, { size: 280, color: '#ffffff', strokeWidth: 1.6 }))
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="80" fill="#245bd7"/><g transform="translate(116 116)">' + icon + '</g></svg>'
const maskable = svg.replace('rx="80"', 'rx="0"')
await mkdir('public/icons', { recursive: true })
await writeFile('public/favicon.svg', svg)
await sharp(Buffer.from(svg)).resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp(Buffer.from(svg)).png().toFile('public/icons/icon-512.png')
await sharp(Buffer.from(maskable)).png().toFile('public/icons/maskable-512.png')
