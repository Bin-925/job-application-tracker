const answerPanels = [...document.querySelectorAll('article details:not(.diagram-source)')];
const answerButton = document.querySelector('#answers');
answerButton.addEventListener('click', () => {
  const open = answerButton.getAttribute('aria-pressed') !== 'true';
  answerPanels.forEach(panel => { panel.open = open; });
  answerButton.setAttribute('aria-pressed', String(open));
  answerButton.textContent = open ? '해설 접기' : '해설 펼치기';
});
document.querySelector('#print').addEventListener('click', () => window.print());
let previousOpenState;
window.addEventListener('beforeprint', () => {
  previousOpenState = answerPanels.map(panel => panel.open);
  answerPanels.forEach(panel => { panel.open = true; });
});
window.addEventListener('afterprint', () => {
  if (previousOpenState) answerPanels.forEach((panel, index) => { panel.open = previousOpenState[index]; });
});
document.querySelectorAll('.mobile-toc a').forEach(link => {
  link.addEventListener('click', () => { document.querySelector('.mobile-toc').open = false; });
});
const headingObserver = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting);
  if (!visible.length) return;
  const id = visible[0].target.id;
  document.querySelectorAll('nav a').forEach(link => {
    if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}, { rootMargin: '-70px 0px -65% 0px' });
document.querySelectorAll('article h2').forEach(heading => headingObserver.observe(heading));

async function drawDiagrams() {
  const status = document.querySelector('#diagram-status');
  const diagrams = [...document.querySelectorAll('.mermaid')];
  let completed = 0;
  if (!window.mermaid) {
    status.textContent = '다이어그램 파일을 불러오지 못했습니다. HTML과 assets 폴더를 함께 열어 주세요.';
    status.className = 'diagram-error';
    document.body.dataset.diagramErrors = String(diagrams.length);
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      fontFamily: 'Malgun Gothic, Apple SD Gothic Neo, sans-serif',
      fontSize: '16px',
      primaryColor: '#edf5ee', primaryTextColor: '#20382a', primaryBorderColor: '#548263',
      secondaryColor: '#edf3fc', tertiaryColor: '#fff8e8', lineColor: '#65776c',
      actorBkg: '#edf3fc', actorBorder: '#5d7796', actorTextColor: '#263e58',
      signalColor: '#394c40', signalTextColor: '#28372e', noteBkgColor: '#fff8e8',
      noteBorderColor: '#b79b64', noteTextColor: '#473c24',
    },
    flowchart: { htmlLabels: false, useMaxWidth: false },
    sequence: { useMaxWidth: false, wrap: true, actorFontSize: 15, messageFontSize: 14 },
    er: { useMaxWidth: false },
  });
  for (const [index, element] of diagrams.entries()) {
    try {
      const result = await mermaid.render(`study-diagram-${index}`, element.textContent);
      element.innerHTML = result.svg;
      const svg = element.querySelector('svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `그림 ${index + 1}: ${element.closest('figure').previousElementSibling?.textContent?.slice(0, 100) || '학습 다이어그램'}`);
      const naturalWidth = svg.viewBox.baseVal.width;
      svg.style.width = `${naturalWidth}px`;
      svg.style.maxWidth = '100%';
      svg.style.minWidth = `${Math.min(naturalWidth, 680)}px`;
      svg.style.height = 'auto';
      completed++;
    } catch (error) {
      element.closest('figure').classList.add('diagram-error');
      element.closest('figure').querySelector('figcaption').textContent += ' · 표시 오류: 원문을 확인하세요.';
      console.error(`Diagram ${index + 1}`, error);
    }
  }
  document.body.dataset.diagramCount = String(completed);
  document.body.dataset.diagramErrors = String(diagrams.length - completed);
  status.textContent = `다이어그램 ${completed}/${diagrams.length}개 표시 완료 · 오프라인 문서`;
  if (completed !== diagrams.length) status.className = 'diagram-error';
}
drawDiagrams();
