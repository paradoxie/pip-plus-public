/**
 * PiP+ - Content Script (Open Source Version)
 * 核心画中画功能实现
 * 
 * GitHub: https://github.com/paradoxie/pip-plus-public
 * License: MIT
 */

class PiPPlus {
    constructor() {
        this.pipWindow = null;
        this.originalContainer = null;
        this.playerElement = null;
        this.isActive = false;
        this._mutationObserver = null;
        this._debounceTimer = null;
        this._apiSupport = this._checkAPISupport();

        // 网站特定选择器配置
        this.siteConfigs = {
            'youtube.com': {
                playerSelectors: ['#movie_player', '.html5-video-player'],
                videoSelector: 'video',
                subtitleSelectors: ['.ytp-caption-segment', '.captions-text'],
                containerSelectors: ['#player-theater-container', '#player-container']
            },
            'netflix.com': {
                playerSelectors: ['.watch-video--player-view', '.nf-player-container'],
                videoSelector: 'video',
                subtitleSelectors: ['.player-timedtext', '[data-uia="player-timedtext"]'],
                subtitleTextSelectors: ['.player-timedtext-container span', '.player-timedtext span'],
                containerSelectors: ['.watch-video', '.nfp']
            },
            'bilibili.com': {
                playerSelectors: ['.bpx-player-video-wrap', '.bilibili-player-video-wrap'],
                videoSelector: 'video',
                subtitleSelectors: ['.bpx-player-subtitle'],
                danmakuSelectors: ['.bpx-player-render-dm-wrap'],
                containerSelectors: ['.bpx-player-container']
            },
            'disneyplus.com': {
                playerSelectors: ['.btm-media-client-element', '.hudson-container'],
                videoSelector: 'video',
                subtitleSelectors: ['.dss-subtitle-renderer', '[class*="subtitle"]'],
                containerSelectors: ['.btm-media-overlays-container']
            },
            'v.qq.com': {
                playerSelectors: ['.txp_video_container', '.tenvideo_player'],
                videoSelector: 'video',
                subtitleSelectors: ['.txp_subtitle_content'],
                containerSelectors: ['.txp_player']
            },
            'iqiyi.com': {
                playerSelectors: ['.iqp-player', '.iqp-player-container'],
                videoSelector: 'video',
                subtitleSelectors: ['.iqp-subtitle'],
                containerSelectors: ['.iqp-player-container']
            },
            'youku.com': {
                playerSelectors: ['.youku-player', '.youku-film-player'],
                videoSelector: 'video',
                subtitleSelectors: ['.subtitle-wrap'],
                containerSelectors: ['.youku-player-container']
            },
            'primevideo.com': {
                playerSelectors: ['.webPlayerContainer', '.webPlayerUIContainer'],
                videoSelector: 'video',
                subtitleSelectors: ['.atvwebplayersdk-captions-text', '[class*="captions"]'],
                containerSelectors: ['.webPlayerUIContainer']
            },
            'twitch.tv': {
                playerSelectors: ['.video-player', '.persistent-player'],
                videoSelector: 'video',
                subtitleSelectors: ['.captions-container'],
                containerSelectors: ['.video-player__container']
            },
            'twitter.com': {
                playerSelectors: ['[data-testid="videoPlayer"]'],
                videoSelector: 'video',
                subtitleSelectors: null,
                containerSelectors: ['[data-testid="videoComponent"]']
            },
            'x.com': {
                playerSelectors: ['[data-testid="videoPlayer"]'],
                videoSelector: 'video',
                subtitleSelectors: null,
                containerSelectors: ['[data-testid="videoComponent"]']
            }
        };

        this.init();
    }

    _checkAPISupport() {
        const support = {
            documentPiP: 'documentPictureInPicture' in window,
            legacyPiP: document.pictureInPictureEnabled === true,
            chromeVersion: this._getChromeVersion()
        };
        if (support.chromeVersion && support.chromeVersion < 116) {
            support.documentPiP = false;
        }
        console.log('PiP+ API Support:', support);
        return support;
    }

    _getChromeVersion() {
        const match = navigator.userAgent.match(/Chrome\/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    isPiPSupported() {
        return this._apiSupport.documentPiP || this._apiSupport.legacyPiP;
    }

    init() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'togglePiP') {
                this.toggle();
                sendResponse({ success: true });
            } else if (message.action === 'checkVideoAvailable') {
                sendResponse({ hasVideo: !!this.findVideoElement() });
            } else if (message.action === 'checkPiPStatus') {
                sendResponse({ isActive: this.isActive });
            }
            return true;
        });

        document.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            if (isMac) {
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
                    e.preventDefault();
                    this.toggle();
                }
            } else {
                if (e.altKey && e.key.toLowerCase() === 'p') {
                    this.toggle();
                }
            }
        });

        this.detectVideoAndUpdateBadge();

        this._mutationObserver = new MutationObserver(() => this.debouncedDetectVideo());
        this._mutationObserver.observe(document.body, { childList: true, subtree: true });

        console.log('PiP+ Content Script initialized');
    }

    debouncedDetectVideo() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this.detectVideoAndUpdateBadge(), 300);
    }

    detectVideoAndUpdateBadge() {
        const hasVideo = !!this.findVideoElement();
        chrome.runtime.sendMessage({ action: 'updateBadge', hasVideo });
    }

    getSiteConfig() {
        const hostname = window.location.hostname;
        for (const [site, config] of Object.entries(this.siteConfigs)) {
            if (hostname.includes(site)) {
                return this._resolveSelectors(config);
            }
        }
        return { playerSelector: null, videoSelector: 'video', subtitleSelector: null, danmakuSelector: null, containerSelector: null };
    }

    _resolveSelectors(config) {
        return {
            videoSelector: config.videoSelector || 'video',
            playerSelector: this._findFirstMatch(config.playerSelectors),
            subtitleSelector: this._findFirstMatch(config.subtitleSelectors),
            subtitleTextSelector: this._findFirstMatch(config.subtitleTextSelectors),
            danmakuSelector: this._findFirstMatch(config.danmakuSelectors),
            containerSelector: this._findFirstMatch(config.containerSelectors)
        };
    }

    _findFirstMatch(selectors) {
        if (!selectors) return null;
        if (!Array.isArray(selectors)) return selectors;
        for (const selector of selectors) {
            try { if (document.querySelector(selector)) return selector; } catch (e) {}
        }
        return selectors[0] || null;
    }

    findVideoElement() {
        const config = this.getSiteConfig();
        
        if (config.playerSelector) {
            const player = document.querySelector(config.playerSelector);
            if (player) {
                const video = player.querySelector(config.videoSelector);
                if (video) return { player, video, config, isIframe: false };
            }
        }

        let videos = Array.from(document.querySelectorAll('video'));
        const iframes = document.querySelectorAll('iframe');
        
        iframes.forEach(iframe => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                    const iframeVideos = Array.from(iframeDoc.querySelectorAll('video'));
                    iframeVideos.forEach(v => { v._iframeSource = iframe; });
                    videos = videos.concat(iframeVideos);
                }
            } catch (e) {}
        });

        const visibleVideos = videos.filter(v => {
            const rect = v._iframeSource ? v._iframeSource.getBoundingClientRect() : v.getBoundingClientRect();
            return rect.width > 100 && rect.height > 100;
        });

        if (visibleVideos.length > 0) {
            visibleVideos.sort((a, b) => {
                const getArea = (v) => {
                    const rect = v._iframeSource ? v._iframeSource.getBoundingClientRect() : v.getBoundingClientRect();
                    return rect.width * rect.height;
                };
                return getArea(b) - getArea(a);
            });
            const video = visibleVideos[0];
            const isIframe = !!video._iframeSource;
            const player = isIframe ? video._iframeSource : (video.closest('div') || video.parentElement);
            return { player, video, config, isIframe };
        }
        return null;
    }

    async toggle() {
        if (this.isActive) this.closePiP();
        else await this.openPiP();
    }

    async openPiP() {
        if (!this.isPiPSupported()) {
            this.showNotification(chrome.i18n.getMessage('msgPipNotSupported') || 'PiP not supported', 'error');
            return;
        }

        if (!this._apiSupport.documentPiP) {
            return this.openLegacyPiP();
        }

        const videoInfo = this.findVideoElement();
        if (!videoInfo) {
            this.showNotification(chrome.i18n.getMessage('msgNoVideo') || 'No video found', 'error');
            return;
        }

        const { player, video, config, isIframe } = videoInfo;

        if (isIframe) return this.openLegacyPiP(video);

        try {
            const aspectRatio = video.videoWidth / video.videoHeight || 16 / 9;
            const width = Math.min(640, window.innerWidth * 0.4);
            const height = Math.round(width / aspectRatio);

            this.pipWindow = await documentPictureInPicture.requestWindow({ width, height });
            this.originalContainer = player.parentElement;
            this.playerElement = player;

            this.copyStyleSheets();
            this.addPiPStyles();

            const controls = this.createControls(video);
            this.movedElements = [];
            this.videoOriginalParent = video.parentElement;

            const isSpecificSite = config.playerSelector !== null;
            if (isSpecificSite) {
                this.pipWindow.document.body.appendChild(player);
                this.movedElements.push({ element: player, originalParent: this.originalContainer, placeholder: document.createComment('pip-placeholder') });
                this.originalContainer.appendChild(this.movedElements[0].placeholder);
            } else {
                this.pipWindow.document.body.appendChild(video);
                this.movedElements.push({ element: video, originalParent: this.videoOriginalParent, placeholder: document.createComment('pip-placeholder') });
                this.videoOriginalParent.appendChild(this.movedElements[0].placeholder);
            }

            this.pipWindow.document.body.appendChild(controls);

            video.addEventListener('click', (e) => {
                if (e.target === video) video.paused ? video.play() : video.pause();
            });
            video.style.cursor = 'pointer';

            this.setupKeyboardShortcuts(video);
            this.setupSubtitles(config);
            this.setupDanmaku(config);

            this.pipWindow.addEventListener('pagehide', () => this.onPiPClose());
            this.isActive = true;
            this.showNotification(chrome.i18n.getMessage('msgPipOpened') || 'PiP Enabled', 'success');

        } catch (error) {
            console.error('PiP+ Error:', error);
            this.showNotification(chrome.i18n.getMessage('msgPipFailed') || 'Failed to open PiP', 'error');
        }
    }

    setupSubtitles(config) {
        if (!config.subtitleSelector) return;

        const subtitleContainer = document.createElement('div');
        subtitleContainer.className = 'pip-subtitle-container';
        subtitleContainer.style.cssText = `
            position: fixed !important; bottom: 60px !important; left: 50% !important;
            transform: translateX(-50%) !important; z-index: 200 !important;
            text-align: center !important; max-width: 80% !important; pointer-events: none !important;
            font-size: 24px; color: white; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
        `;
        this.pipWindow.document.body.appendChild(subtitleContainer);

        this.subtitleSyncInterval = setInterval(() => {
            if (this.pipWindow && !this.pipWindow.closed) {
                const textSelector = config.subtitleTextSelector || config.subtitleSelector;
                const subtitles = document.querySelectorAll(textSelector);
                let html = '';
                subtitles.forEach(sub => {
                    const text = sub.textContent.trim();
                    if (text) html += `<span style="background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:4px;display:inline-block;margin:2px 0;">${text}</span><br>`;
                });
                subtitleContainer.innerHTML = html;
            } else {
                clearInterval(this.subtitleSyncInterval);
            }
        }, 100);
    }

    setupDanmaku(config) {
        if (!config.danmakuSelector) return;
        
        const danmaku = document.querySelector(config.danmakuSelector);
        const originalPlayer = document.querySelector(config.containerSelector || config.playerSelector);
        
        if (danmaku && originalPlayer) {
            const originalRect = originalPlayer.getBoundingClientRect();
            const originalWidth = originalRect.width || 1280;
            const originalHeight = originalRect.height || 720;

            const danmakuStyle = document.createElement('style');
            danmakuStyle.textContent = `
                @keyframes roll { 0% { transform: translateX(0); } 100% { transform: translateX(var(--translateX)); } }
                .pip-danmaku-scaler { position: absolute !important; top: 0 !important; left: 0 !important; width: ${originalWidth}px !important; height: ${originalHeight}px !important; transform-origin: top left !important; pointer-events: none !important; z-index: 100 !important; overflow: hidden !important; }
                .bili-danmaku-x-dm { position: absolute !important; white-space: pre !important; pointer-events: none !important; will-change: transform !important; animation: roll linear var(--duration) forwards !important; }
            `;
            this.pipWindow.document.head.appendChild(danmakuStyle);

            const scalerContainer = document.createElement('div');
            scalerContainer.className = 'pip-danmaku-scaler';
            
            const danmakuClone = danmaku.cloneNode(true);
            scalerContainer.appendChild(danmakuClone);
            this.pipWindow.document.body.appendChild(scalerContainer);

            const updateScale = () => {
                if (!this.pipWindow || this.pipWindow.closed) return;
                const pipWidth = this.pipWindow.innerWidth;
                const pipHeight = this.pipWindow.innerHeight - 50;
                const scale = Math.min(pipWidth / originalWidth, pipHeight / originalHeight);
                scalerContainer.style.transform = `scale(${scale})`;
            };
            updateScale();
            this.pipWindow.addEventListener('resize', updateScale);

            this.danmakuSyncInterval = setInterval(() => {
                if (!this.pipWindow || this.pipWindow.closed) {
                    clearInterval(this.danmakuSyncInterval);
                    return;
                }
                const freshDanmaku = document.querySelector(config.danmakuSelector);
                if (freshDanmaku) {
                    scalerContainer.innerHTML = '';
                    scalerContainer.appendChild(freshDanmaku.cloneNode(true));
                }
            }, 50);
        }
    }

    copyStyleSheets() {
        [...document.styleSheets].forEach(styleSheet => {
            try {
                const cssRules = [...styleSheet.cssRules].map(rule => rule.cssText).join('');
                const style = document.createElement('style');
                style.textContent = cssRules;
                this.pipWindow.document.head.appendChild(style);
            } catch (e) {
                if (styleSheet.href) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = styleSheet.href;
                    this.pipWindow.document.head.appendChild(link);
                }
            }
        });
    }

    addPiPStyles() {
        const style = document.createElement('style');
        style.textContent = `
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #000; overflow: hidden; display: flex; flex-direction: column; height: 100vh; }
            video { width: 100%; height: calc(100% - 40px); object-fit: contain; background: #000; }
            .pip-controls { height: 40px; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; }
            .pip-btn { background: rgba(255,255,255,0.1); border: none; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: background 0.2s; }
            .pip-btn:hover { background: rgba(255,255,255,0.2); }
            .pip-time { color: rgba(255,255,255,0.7); font-size: 11px; font-family: monospace; min-width: 90px; }
        `;
        this.pipWindow.document.head.appendChild(style);
    }

    createControls(video) {
        const controls = document.createElement('div');
        controls.className = 'pip-controls';

        const timeDisplay = document.createElement('span');
        timeDisplay.className = 'pip-time';
        const updateTime = () => {
            const format = (t) => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
            timeDisplay.textContent = `${format(video.currentTime)} / ${format(video.duration || 0)}`;
        };
        video.addEventListener('timeupdate', updateTime);
        updateTime();

        const rewindBtn = document.createElement('button');
        rewindBtn.className = 'pip-btn';
        rewindBtn.textContent = '⏪ 10s';
        rewindBtn.onclick = () => video.currentTime = Math.max(0, video.currentTime - 10);

        const playBtn = document.createElement('button');
        playBtn.className = 'pip-btn';
        playBtn.textContent = video.paused ? '▶️' : '⏸️';
        playBtn.onclick = () => video.paused ? video.play() : video.pause();
        video.addEventListener('play', () => playBtn.textContent = '⏸️');
        video.addEventListener('pause', () => playBtn.textContent = '▶️');

        const forwardBtn = document.createElement('button');
        forwardBtn.className = 'pip-btn';
        forwardBtn.textContent = '10s ⏩';
        forwardBtn.onclick = () => video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);

        const muteBtn = document.createElement('button');
        muteBtn.className = 'pip-btn';
        muteBtn.textContent = video.muted ? '🔇' : '🔊';
        muteBtn.onclick = () => { video.muted = !video.muted; muteBtn.textContent = video.muted ? '🔇' : '🔊'; };

        controls.append(timeDisplay, rewindBtn, playBtn, forwardBtn, muteBtn);
        return controls;
    }

    setupKeyboardShortcuts(video) {
        this.pipWindow.document.addEventListener('keydown', (e) => {
            switch(e.code) {
                case 'Space': e.preventDefault(); video.paused ? video.play() : video.pause(); break;
                case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 10); break;
                case 'ArrowRight': video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); break;
                case 'ArrowUp': e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); break;
                case 'ArrowDown': e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); break;
                case 'KeyM': video.muted = !video.muted; break;
            }
        });
    }

    closePiP() {
        if (this.pipWindow) this.pipWindow.close();
    }

    onPiPClose() {
        if (this.subtitleSyncInterval) clearInterval(this.subtitleSyncInterval);
        if (this.danmakuSyncInterval) clearInterval(this.danmakuSyncInterval);

        if (this.movedElements) {
            this.movedElements.forEach(({ element, originalParent, placeholder }) => {
                if (originalParent && element) {
                    try {
                        if (placeholder && placeholder.parentNode) {
                            placeholder.parentNode.replaceChild(element, placeholder);
                        } else {
                            originalParent.appendChild(element);
                        }
                    } catch (e) {}
                }
            });
        }

        this.pipWindow = null;
        this.originalContainer = null;
        this.playerElement = null;
        this.isActive = false;
    }

    async openLegacyPiP(videoElement = null) {
        let video = videoElement;
        if (!video) {
            const videoInfo = this.findVideoElement();
            if (!videoInfo) {
                this.showNotification(chrome.i18n.getMessage('msgNoVideo') || 'No video found', 'error');
                return;
            }
            video = videoInfo.video;
        }

        if (!document.pictureInPictureEnabled) {
            this.showNotification(chrome.i18n.getMessage('msgPipNotSupported') || 'PiP not supported', 'error');
            return;
        }

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                this.isActive = false;
                return;
            }
            await video.requestPictureInPicture();
            this.isActive = true;
            video.addEventListener('leavepictureinpicture', () => { this.isActive = false; }, { once: true });
            this.showNotification(chrome.i18n.getMessage('msgPipBasicMode') || 'PiP Enabled (Basic Mode)', 'success');
        } catch (error) {
            console.error('Legacy PiP error:', error);
            this.showNotification(chrome.i18n.getMessage('msgPipFailed') || 'Failed to open PiP', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const existing = document.querySelector('.pip-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'pip-notification';
        notification.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6'};
            color: white; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-family: system-ui, sans-serif;
            z-index: 999999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: pip-slide-in 0.3s ease;
        `;
        notification.textContent = message;

        if (!document.querySelector('#pip-notification-style')) {
            const style = document.createElement('style');
            style.id = 'pip-notification-style';
            style.textContent = '@keyframes pip-slide-in { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }';
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

// 初始化
new PiPPlus();
