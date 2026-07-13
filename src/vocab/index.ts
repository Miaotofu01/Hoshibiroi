import { getState, loadWords, loadSettings, loadFullStats, setPanel, subscribe } from './state';
import { renderLearn, mountLearn, unmountLearn } from './panels/learn';
import { renderBrowse, mountBrowse, unmountBrowse } from './panels/browse';
import { renderStats, mountStats, unmountStats } from './panels/stats';
import { renderSettings, mountSettings, unmountSettings, openDrawer, closeDrawer } from './panels/settings';
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
  renderLearn(); renderBrowse(); renderStats(); renderSettings();
  panelRenderers[currentPanel]?.mount();
  mountCursor(); // learn is default panel
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPanel((tab as HTMLElement).dataset.panel!));
  });
  document.getElementById('btn-settings')?.addEventListener('click', () => openDrawer());
  document.getElementById('drawer-overlay')?.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
}

init();
