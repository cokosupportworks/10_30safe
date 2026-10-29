const apps = {
  hiragana: { name: 'ひらがな50おん', path: 'hiragana_app/index.html', color: '#bf7285' },
  monji: { name: 'もんじぼたる', path: 'monjibotaru/index.html', color: '#6e937c' },
  scratch: { name: 'Scratchであそぶ', path: 'scratch/index.html', color: '#c78b4c' }
};
let current = null;
let timeout;
function showRoute(force = false) {
  const requested = location.hash.slice(1);
  const route = Object.hasOwn(apps, requested) ? requested : 'home';
  if (!force && route === current) return;
  current = route;
  clearTimeout(timeout);
  // Unload the old document so recording, timers and audio do not keep running.
  try { speechSynthesis.cancel(); } catch {}
  const host = document.getElementById('frame-host');
  host.replaceChildren();
  document.querySelectorAll('[data-route]').forEach(link => {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const isHome = route === 'home';
  document.getElementById('home').hidden = !isHome;
  document.getElementById('workspace').hidden = isHome;
  document.body.classList.toggle('in-app', !isHome);
  document.getElementById('load-help').hidden = true;
  document.title = isHome ? 'まなびのひろば' : `${apps[route].name} | まなびのひろば`;
  if (isHome) { window.scrollTo(0, 0); return; }
  const app = apps[route];
  const title = document.getElementById('app-name');
  title.textContent = app.name;
  document.getElementById('app-dot').style.background = app.color;
  document.getElementById('direct-link').href = app.path;
  const status = document.getElementById('app-status');
  status.textContent = '読み込み中…';
  const frame = document.createElement('iframe');
  frame.title = app.name;
  frame.allow = 'microphone; autoplay; fullscreen';
  frame.allowFullscreen = true;
  frame.addEventListener('load', () => {
    if (current !== route || !frame.isConnected) return;
    clearTimeout(timeout);
    status.textContent = '';
    document.getElementById('load-help').hidden = true;
  });
  frame.src = app.path;
  host.append(frame);
  timeout = setTimeout(() => { document.getElementById('load-help').hidden = false; }, 20000);
}
window.addEventListener('hashchange', () => showRoute());
document.getElementById('retry').addEventListener('click', () => showRoute(true));
document.getElementById('fullscreen').addEventListener('click', async () => {
  const area = document.getElementById('workspace');
  const status = document.getElementById('app-status');
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (area.requestFullscreen) await area.requestFullscreen();
    else status.textContent = 'この端末では「別タブ」をご利用ください';
  } catch { status.textContent = '全画面にできませんでした。「別タブ」をご利用ください'; }
});
document.addEventListener('fullscreenchange', () => {
  document.getElementById('fullscreen').textContent = document.fullscreenElement ? '全画面を終了 ⛶' : '全画面 ⛶';
});
showRoute();
