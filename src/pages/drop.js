import { LEVELS } from '../lib/levels.js'
import { checkFile, extractText } from '../lib/extract.js'
import { splitDraft } from '../lib/lessonDraft.js'
import { $ } from '../app.js'

// Drop a PDF or picture → draft lesson opened in the editor for the teacher to fix and save.
export function mountDrop(el, openDraft) {
  el.innerHTML = `<div class="drop">
    <p><b>Make a lesson from a PDF or photo</b></p>
    <div class="row" style="justify-content:center">
      <label>Split into <select id="lv">${Object.entries(LEVELS).map(([n, t]) => `<option value="${n}">${t}</option>`).join('')}</select></label>
      <label>Language <select id="lang"><option value="fil-PH">Tagalog</option><option value="ceb-PH">Bisaya</option><option value="en-US">English</option></select></label>
      <input type="file" id="file" accept=".pdf,image/*" aria-label="PDF or image"></div>
    <p class="muted" id="dmsg" role="status">…or drag a file here</p></div>`
  const box = $('.drop', el), msg = $('#dmsg', el)
  const go = async file => {
    const bad = checkFile(file)
    if (bad) return (msg.textContent = bad)
    msg.textContent = 'Reading the file… (first photo can take a minute)'
    try {
      const level = +$('#lv', el).value, lang = $('#lang', el).value
      const r = splitDraft(await extractText(file), level, lang, file.name.replace(/\.\w+$/, ''))
      if (!r.ok) return (msg.textContent = r.error)
      if (file.type.startsWith('image/')) r.draft.items.unshift({ text: '', image: file })
      openDraft(r.draft)
    } catch (e) { msg.textContent = e.message }
  }
  $('#file', el).onchange = e => e.target.files[0] && go(e.target.files[0])
  box.ondragover = e => e.preventDefault()
  box.ondrop = e => { e.preventDefault(); e.dataTransfer.files[0] && go(e.dataTransfer.files[0]) }
}
