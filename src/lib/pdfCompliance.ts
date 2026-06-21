// ---------------------------------------------------------------------------
// Compliance PDF generator — produces a valid PDF/1.4 document in-process,
// with zero external dependencies. Used by the auto-solve agent endpoint to
// attach a human-readable compliance certificate to every cleared item.
//
// All content is ASCII-only (PDF Latin-1 encoding) for Type1 font compat.
// A single page holds ~46 lines; long answers are truncated at the page edge
// since these are concise certificate docs, not full disclosure reports.
// ---------------------------------------------------------------------------

function pdfEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ')
}

function wrap(text: string, max = 76): string[] {
  if (text.length <= max) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const candidate = cur ? cur + ' ' + w : w
    if (candidate.length > max && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = candidate
    }
  }
  if (cur) lines.push(cur)
  return lines
}

interface ContentLine {
  text: string
  bold: boolean
  size: number
  gap?: number
}

function buildLines(
  stage: string,
  title: string,
  answer: string,
  idea: string,
  date: string,
): ContentLine[] {
  const div = '-'.repeat(68)
  const out: ContentLine[] = [
    { text: 'CONSTRUCTA COMPLIANCE CERTIFICATE', bold: true, size: 15, gap: 0 },
    { text: 'Powered by Fetch AI ASI:One Agentverse', bold: false, size: 9, gap: 2 },
    { text: div, bold: false, size: 9, gap: 6 },
    { text: `Stage:   ${stage}`, bold: false, size: 10, gap: 0 },
    { text: `Item:    ${title.slice(0, 80)}`, bold: false, size: 10, gap: 0 },
    { text: `Project: ${idea.slice(0, 74)}`, bold: false, size: 10, gap: 0 },
    { text: `Date:    ${date}`, bold: false, size: 10, gap: 0 },
    { text: div, bold: false, size: 9, gap: 8 },
    { text: 'COMPLIANCE RESOLUTION', bold: true, size: 12, gap: 2 },
    { text: div, bold: false, size: 9, gap: 4 },
  ]

  const answerLines = answer
    .split('\n')
    .flatMap((l) => (l.length > 76 ? wrap(l) : [l]))
    .slice(0, 60)
  for (const l of answerLines) {
    out.push({ text: l, bold: false, size: 10, gap: 0 })
  }

  out.push(
    { text: div, bold: false, size: 9, gap: 8 },
    { text: 'CERTIFICATION', bold: true, size: 11, gap: 2 },
    { text: 'This document certifies that the above compliance item has been', bold: false, size: 10, gap: 0 },
    { text: 'reviewed and resolved via the Constructa AI platform powered by', bold: false, size: 10, gap: 0 },
    { text: 'Fetch AI ASI:One. File with project records per CBC §104.7.', bold: false, size: 10, gap: 0 },
    { text: div, bold: false, size: 9, gap: 8 },
    { text: `Generated: ${new Date().toISOString()}`, bold: false, size: 8, gap: 0 },
    { text: 'Platform: Constructa  |  AI: Fetch AI ASI:One  |  Jurisdiction: California', bold: false, size: 8, gap: 0 },
  )
  return out
}

function buildContentStream(lines: ContentLine[]): string {
  const ops: string[] = []
  let y = 760

  for (const { text, bold, size, gap = 0 } of lines) {
    const font = bold ? 'F2' : 'F1'
    const leading = size + 3
    if (y < 40) break
    ops.push(`BT /${font} ${size} Tf 50 ${y} Td (${pdfEscape(text)}) Tj ET`)
    y -= leading + (gap ?? 0)
  }

  return ops.join('\n') + '\n'
}

/**
 * Build a minimal PDF/1.4 document for a solved compliance item.
 * Returns a Buffer containing the raw PDF bytes.
 */
export function generateCompliancePdf(
  stage: string,
  title: string,
  answer: string,
  idea: string,
): Buffer {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const contentStream = buildContentStream(buildLines(stage, title, answer, idea, date))
  const streamLen = contentStream.length

  // Object definitions in order (1-indexed).
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${streamLen} >>\nstream\n${contentStream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []

  for (let i = 0; i < objs.length; i++) {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`
  }

  const xrefAt = pdf.length
  pdf += 'xref\n'
  pdf += `0 ${objs.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\n`
  pdf += `startxref\n${xrefAt}\n%%EOF`

  return Buffer.from(pdf, 'latin1')
}

/**
 * Return a data URI the client can use to open or download the PDF.
 */
export function compliancePdfDataUrl(
  stage: string,
  title: string,
  answer: string,
  idea: string,
): string {
  const buf = generateCompliancePdf(stage, title, answer, idea)
  return `data:application/pdf;base64,${buf.toString('base64')}`
}
