import { getState, loadWords, loadSettings, loadFullStats, loadLearnSession, setPanel } from './state';
import { renderLearn, mountLearn, unmountLearn } from './panels/learn';
import { renderBrowse, mountBrowse, unmountBrowse } from './panels/browse';
import { renderStats, mountStats, unmountStats } from './panels/stats';
import { renderSettings, mountSettings, openDrawer, closeDrawer } from './panels/settings';
import { ico, Icons } from './utils';


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
  const prevTab = document.querySelector(`.nav-tab[data-panel="${currentPanel}"]`);
  prevTab?.classList.remove('active');
  prevTab?.setAttribute('aria-selected', 'false');
  currentPanel = panel;
  setPanel(panel as any);
  document.getElementById(`panel-${panel}`)?.classList.add('active');
  const nextTab = document.querySelector(`.nav-tab[data-panel="${panel}"]`);
  nextTab?.classList.add('active');
  nextTab?.setAttribute('aria-selected', 'true');
  panelRenderers[panel]?.mount();
  panelRenderers[panel]?.render();
}

async function init(): Promise<void> {
  // 自报 tab id：popup 的"生词本"入口靠它复用/聚焦本标签页
  // （chrome.tabs.getCurrent 无需 "tabs" 权限；popup 侧无法按 URL 过滤标签页）
  chrome.tabs.getCurrent().then(tab => {
    if (tab?.id != null) chrome.storage.local.set({ vocabTabId: tab.id }).catch(() => {});
  }).catch(() => {});

  await Promise.all([loadWords(), loadSettings(), loadFullStats(), loadLearnSession()]);

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
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPanel((tab as HTMLElement).dataset.panel!));
  });
  const gearBtn = document.getElementById('btn-settings');
  if (gearBtn) {
    gearBtn.innerHTML = ico(Icons.gear);
    gearBtn.addEventListener('click', () => openDrawer());
  }
  document.getElementById('drawer-overlay')?.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
}

init();
