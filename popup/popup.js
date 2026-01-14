/**
 * PiP+ - Popup Script (Open Source Version)
 * https://github.com/paradoxie/pip-plus-public
 */

document.addEventListener('DOMContentLoaded', async () => {
    const toggleBtn = document.getElementById('togglePiP');

    localize();
    updateShortcutDisplay();
    await checkVideoAvailable();

    async function checkVideoAvailable() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) { setNoVideoState(); return; }
            
            const [videoResponse, pipResponse] = await Promise.all([
                chrome.tabs.sendMessage(tab.id, { action: 'checkVideoAvailable' }).catch(() => null),
                chrome.tabs.sendMessage(tab.id, { action: 'checkPiPStatus' }).catch(() => null)
            ]);
            
            if (pipResponse?.isActive) {
                setPiPActiveState();
            } else if (videoResponse?.hasVideo) {
                const logo = document.getElementById('popupLogo');
                if (logo) logo.src = '../icons/icon.svg';
            } else {
                setNoVideoState();
            }
        } catch (error) { setNoVideoState(); }
    }

    function setPiPActiveState() {
        const logo = document.getElementById('popupLogo');
        if (logo) logo.src = '../icons/icon.svg';
        toggleBtn.innerHTML = `<span class="btn-icon">🎬</span><span>${chrome.i18n.getMessage('btnPiPActive') || '画中画播放中'}</span>`;
        toggleBtn.classList.remove('disabled');
        toggleBtn.disabled = false;
    }

    function setNoVideoState() {
        const logo = document.getElementById('popupLogo');
        if (logo) logo.src = '../icons/icon_gray.svg';
        toggleBtn.innerHTML = `<span class="btn-icon">🔍</span><span>${chrome.i18n.getMessage('btnNoVideo') || '未检测到视频'}</span>`;
        toggleBtn.classList.add('disabled');
        toggleBtn.disabled = true;
    }

    toggleBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'togglePiP' });
            window.close();
        } catch (error) {
            console.error('Failed to toggle PiP:', error);
        }
    });

    function localize() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const msg = chrome.i18n.getMessage(key);
            if (msg) el.textContent = msg;
        });
    }

    function updateShortcutDisplay() {
        const shortcutEl = document.getElementById('shortcutDisplay');
        if (!shortcutEl) return;
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        shortcutEl.textContent = isMac ? '⌃⇧P' : '⎇P';
    }
});
