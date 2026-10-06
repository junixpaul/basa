const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs'
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js'
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const checkFile = f =>
  !TYPES.includes(f.type) ? 'Use a PDF, PNG, JPG or WebP file.' : f.size > 10e6 ? 'File is over 10 MB.' : null

let worker
async function ocr(img) {
  worker ??= import(TESS).then(m => m.default.createWorker('eng+tgl+ceb'))
  return (await (await worker).recognize(img)).data.text
}

// Plain text from a PDF (text layer, or OCR of rendered pages if scanned) or an image (OCR).
export async function extractText(file) {
  const bad = checkFile(file)
  if (bad) throw new Error(bad)
  if (file.type !== 'application/pdf') return ocr(file)
  const pdfjs = await import(PDFJS)
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS.replace('pdf.min.mjs', 'pdf.worker.min.mjs')
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const { items } = await (await pdf.getPage(i)).getTextContent()
    pages.push(items.map(t => t.str + (t.hasEOL ? '\n' : '')).join(''))
  }
  const text = pages.join('\n\n')
  if (text.replace(/\s/g, '').length >= 20) return text
  const ocrPages = [] // scanned PDF: render each page and OCR it
  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const page = await pdf.getPage(i), vp = page.getViewport({ scale: 2 })
    const c = Object.assign(document.createElement('canvas'), { width: vp.width, height: vp.height })
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
    ocrPages.push(await ocr(c))
  }
  return ocrPages.join('\n\n')
}
