import { startTour } from '../lib/guide.js'
import { $ } from '../app.js'

const steps = [
  ['Set up your classes', 'Open <b>Setup</b>. Pick a grade, type a section name, press <b>Add section</b>. Do this for each class you teach.', 'setup', 'The Setup page: pick a grade, type a section, press Add section'],
  ['Add your students', 'Open <b>Classes</b>, choose a class, press <b>+ Add students</b>. Type each name. To add many at once, paste a list of names. Pick where each student starts, then press <b>Save students</b>.', 'classes', 'The Classes page with the Add students button'],
  ['Choose or make a lesson', 'Open <b>Lessons</b>. Lessons made by Basa are ready to use. To make your own, press <b>+ New lesson</b> and type the words, one per line.', 'lessons', 'The Lessons page with the New lesson button'],
  ['Let a student read', 'Open <b>Students</b>, find the name, press <b>Read</b>. Press <b>Start reading</b> and let the student read out loud. Allow the microphone if your browser asks. Use Chrome or Edge.', 'students', 'The Student List with a Read button beside each name'],
  ['See the result', 'Basa marks each word with a ✓ (right) or ✗ (try again). A student who passes moves up to the next lesson. Press <b>Try again</b> to read again.', 'read', 'The reading page with the Start reading button'],
  ['Check progress', 'Open <b>Dashboard</b> to see the whole class, or open a student to see their scores and the words they missed.', 'dashboard', 'The Dashboard showing how the class is doing'],
]
const faq = [
  ['No internet at school?', 'While online, open <b>Profile</b> and press <b>Get ready for offline</b>. Basa then works without signal, and uploads readings when you reconnect.'],
  ['Where is Sign out, or dark mode?', 'Press <b>Profile</b> at the top right. Your name, picture, dark mode and Sign out are there.'],
  ['I added a student by mistake.', 'Open the student and press <b>Remove student</b>. They go to the Archive (Setup → Archive), where you can bring them back.'],
  ['Move a student to another class or level?', 'In <b>Classes</b>, press <b>Move students</b>, tick the names, then choose the new class or level.'],
]

export async function render(el) {
  el.innerHTML = `<div class="row head"><h1>Guide</h1><button id="runTour" class="primary" style="margin-left:auto">Run walkthrough</button></div>
    <p class="muted">How to use Basa, step by step.</p>
    <ol class="steps">${steps.map(([t, d, img, alt]) => `<li><b>${t}.</b> ${d}<a href="guide/${img}.png" target="_blank" rel="noopener" title="Open bigger"><img class="shot" src="guide/${img}.png" alt="${alt}" loading="lazy"></a></li>`).join('')}</ol>
    <h2>Common questions</h2>
    ${faq.map(([q, a]) => `<details><summary><b>${q}</b></summary><p>${a}</p></details>`).join('')}`
  $('#runTour', el).onclick = startTour
}
