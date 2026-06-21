// Compliance PDF rendering (pdf-lib).


import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import type { ComplianceDoc } from './compliance'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 56
const CONTENT_W = PAGE_W - MARGIN * 2

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = []
  for (const rawLine of (text || '').split(/\r?\n/)) {
    if (rawLine.trim() === '') { out.push(''); continue }
    const words = rawLine.split(/\s+/)
    let line = ''
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        out.push(line)
        line = w
      } else {
        line = test
      }
    }
    if (line) out.push(line)
  }
  return out
}

export async function renderComplianceDoc(doc: ComplianceDoc): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const ink = rgb(0.08, 0.1, 0.13)
  const soft = rgb(0.4, 0.43, 0.48)
  const accent = rgb(0.91, 0.69, 0.29)

  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  const newPage = () => { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN }
  const ensure = (need: number) => { if (y - need < MARGIN + 40) newPage() }

  const draw = (text: string, f: PDFFont, size: number, color = ink, gap = 4) => {
    for (const ln of wrap(text, f, size, CONTENT_W)) {
      ensure(size + gap)
      if (ln !== '') page.drawText(ln, { x: MARGIN, y, size, font: f, color })
      y -= size + gap
    }
  }

  page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: accent })
  draw(doc.title, bold, 22, ink, 6)
  y -= 4
  draw(`Project Reference: ${doc.projectRef}`, font, 11, soft, 3)
  draw(`Stage: ${doc.stage}`, font, 11, soft, 3)
  draw(`Date: ${doc.date}`, font, 11, soft, 3)
  draw(`Reference: ${doc.referenceId}`, font, 11, soft, 3)
  y -= 8
  ensure(2)
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: accent })
  y -= 18

  for (const s of doc.sections) {
    ensure(40)
    draw(s.heading, bold, 13, ink, 6)
    y -= 2
    draw(s.body, font, 10.5, rgb(0.18, 0.2, 0.24), 4)
    y -= 12
  }

  const pages = pdfDoc.getPages()
  const stamp = `Generated ${new Date().toISOString()} - ${doc.referenceId}`
  pages.forEach((p, i) => {
    p.drawText(stamp, { x: MARGIN, y: MARGIN - 24, size: 8, font, color: soft })
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE_W - MARGIN - 70, y: MARGIN - 24, size: 8, font, color: soft,
    })
  })

  return pdfDoc.save()
}