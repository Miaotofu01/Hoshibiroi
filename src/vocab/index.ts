import { getState, loadWords, loadSettings, loadFullStats, setPanel } from './state';
import { renderLearn, mountLearn, unmountLearn } from './panels/learn';
import { renderBrowse, mountBrowse, unmountBrowse } from './panels/browse';
import { renderStats, mountStats, unmountStats } from './panels/stats';
import { renderSettings, mountSettings, openDrawer, closeDrawer } from './panels/settings';
import { mountCursor, unmountCursor } from './effects/cursor';

const panelRenderers: Record<string, { render: () => void; mount: () => void; unmount: () => void }> = {
  learn: { render: renderLearn, mount: mountLearn, unmount: unmountLearn },
  browse: { render: renderBrowse, mount: mountBrowse, unmount: unmountBrowse },
  stats: { render: renderStats, mount: mountStats, unmount: unmountStats },
};

let currentPanel = 'learn';

function switchPanel(panel: string): void {
  if (currentPanel === panel) return;
  panelRenderers[currentPanel]?.unmount();
  document.getElementById(`panel-${currentPanel}`)?.classList.remove('active');
  document.querySelector(`.nav-tab[data-panel="${currentPanel}"]`)?.classList.remove('active');
  currentPanel = panel;
  setPanel(panel as any);
  document.getElementById(`panel-${panel}`)?.classList.add('active');
  document.querySelector(`.nav-tab[data-panel="${panel}"]`)?.classList.add('active');
  panelRenderers[panel]?.mount();
  panelRenderers[panel]?.render();
  if (panel === 'learn' || panel === 'stats') mountCursor(); else unmountCursor();
}

async function init(): Promise<void> {
  await Promise.all([loadWords(), loadSettings(), loadFullStats()]);

  // Parse URL hash for direct panel navigation (#/learn, #/browse, #/stats)
  const hash = window.location.hash;
  const hashPanel = hash.startsWith('#/') ? hash.slice(2) : null;
  const validPanels = ['learn', 'browse', 'stats'];

  const { words } = getState();

  // Determine initial panel: hash > default logic
  let initialPanel = 'learn';
  if (hashPanel && validPanels.includes(hashPanel)) {
    initialPanel = hashPanel;
  } else if (words.length === 0) {
    initialPanel = 'browse';
  }

  if (initialPanel === 'browse') {
    currentPanel = 'browse';
    document.querySelector('.nav-tab[data-panel="learn"]')?.classList.remove('active');
    document.getElementById('panel-learn')?.classList.remove('active');
    document.querySelector('.nav-tab[data-panel="browse"]')?.classList.add('active');
    document.getElementById('panel-browse')?.classList.add('active');
  } else if (initialPanel === 'stats') {
    currentPanel = 'stats';
    document.querySelector('.nav-tab[data-panel="learn"]')?.classList.remove('active');
    document.getElementById('panel-learn')?.classList.remove('active');
    document.querySelector('.nav-tab[data-panel="stats"]')?.classList.add('active');
    document.getElementById('panel-stats')?.classList.add('active');
  }

  renderLearn(); renderBrowse(); renderStats(); renderSettings();
  panelRenderers[currentPanel]?.mount();
  mountSettings();
  if (currentPanel === 'learn' || currentPanel === 'stats') mountCursor();
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPanel((tab as HTMLElement).dataset.panel!));
  });
  document.getElementById('btn-settings')?.addEventListener('click', () => openDrawer());
  document.getElementById('drawer-overlay')?.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
}

init();
