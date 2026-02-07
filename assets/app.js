(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const video = $('video');
    const deviceSelect = $('deviceSelect');
    const reconnectBtn = $('reconnectBtn');
    const mirrorCheck = $('mirrorCheck');
    const themeBtn = $('themeBtn');
    const fullscreenBtn = $('fullscreenBtn');
    const overlay = $('overlay');
    const statusText = $('statusText');
    const startBtn = $('startBtn');
    const toolbar = $('toolbar');
    const appEl = $('app');
    const metaTheme = $('metaTheme');

    let stream = null;
    let activeDeviceId = null;
    let toolbarTimer = null;

    // ── Theme ──────────────────────────────────────────────

    const THEMES = ['system', 'light', 'dark'];
    const THEME_LABELS = { system: 'Auto', light: 'Light', dark: 'Dark' };
    let themeIdx = 0;

    function loadTheme() {
        const saved = localStorage.getItem('id-theme');
        const idx = THEMES.indexOf(saved);
        themeIdx = idx >= 0 ? idx : 0;
        applyTheme();
    }

    function applyTheme() {
        const t = THEMES[themeIdx];
        const root = document.documentElement;

        if (t === 'system') {
            root.removeAttribute('data-theme');
        } else {
            root.setAttribute('data-theme', t);
        }

        themeBtn.textContent = THEME_LABELS[t];
        themeBtn.title = 'Theme: ' + t.charAt(0).toUpperCase() + t.slice(1);
        localStorage.setItem('id-theme', t);
        updateMetaThemeColor();
    }

    function updateMetaThemeColor() {
        const t = THEMES[themeIdx];
        const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = t === 'dark' || (t === 'system' && prefersDark);
        metaTheme.content = isDark ? '#111113' : '#f5f5f5';
    }

    themeBtn.addEventListener('click', () => {
        themeIdx = (themeIdx + 1) % THEMES.length;
        applyTheme();
    });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (THEMES[themeIdx] === 'system') updateMetaThemeColor();
    });

    // ── Device Enumeration ─────────────────────────────────

    async function refreshDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) {
            deviceSelect.innerHTML = '';
            deviceSelect.add(new Option('Not supported', ''));
            return;
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            const prev = deviceSelect.value;

            deviceSelect.innerHTML = '';

            if (videoDevices.length === 0) {
                deviceSelect.add(new Option('No devices found', ''));
                return;
            }

            videoDevices.forEach((d, i) => {
                deviceSelect.add(new Option(
                    d.label || ('Camera ' + (i + 1)),
                    d.deviceId
                ));
            });

            // Restore previous selection if still available
            const options = [...deviceSelect.options];
            if (prev && options.some(o => o.value === prev)) {
                deviceSelect.value = prev;
            }
        } catch (e) {
            console.warn('enumerateDevices failed:', e);
        }
    }

    if (navigator.mediaDevices) {
        navigator.mediaDevices.addEventListener('devicechange', () => {
            refreshDevices();
        });
    }

    // ── Stream Management ──────────────────────────────────

    function stopStream() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        video.srcObject = null;
    }

    async function startStream(deviceId) {
        stopStream();
        showOverlay('Connecting...', 'Connecting...');
        startBtn.disabled = true;

        const constraints = {
            video: {
                width: { ideal: 3840 },
                height: { ideal: 2160 },
                frameRate: { ideal: 60 }
            },
            audio: false
        };

        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;

            // Ensure playback starts (needed on some mobile browsers)
            try { await video.play(); } catch (_) { /* autoplay handles it */ }

            const track = stream.getVideoTracks()[0];
            if (track) {
                const settings = track.getSettings();
                activeDeviceId = settings.deviceId || deviceId || null;

                track.addEventListener('ended', () => {
                    showOverlay('Device disconnected', 'Reconnect');
                });
            }

            // Re-enumerate to get proper labels after permission grant
            await refreshDevices();
            if (activeDeviceId) {
                deviceSelect.value = activeDeviceId;
            }

            hideOverlay();
        } catch (err) {
            console.error('getUserMedia error:', err);
            const messages = {
                NotAllowedError: 'Camera permission denied',
                NotFoundError: 'No camera found',
                NotReadableError: 'Camera is in use by another app',
                OverconstrainedError: 'Camera does not meet requirements',
                AbortError: 'Camera access was aborted',
                SecurityError: 'HTTPS is required for camera access'
            };
            showOverlay(messages[err.name] || ('Error: ' + err.message), 'Retry');
        }
    }

    // ── Overlay ────────────────────────────────────────────

    function showOverlay(msg, btnText) {
        statusText.textContent = msg;
        startBtn.textContent = btnText || (activeDeviceId ? 'Reconnect' : 'Connect');
        startBtn.disabled = false;
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        overlay.classList.add('hidden');
    }

    startBtn.addEventListener('click', () => {
        startStream(deviceSelect.value || undefined);
    });

    reconnectBtn.addEventListener('click', () => {
        startStream(activeDeviceId || deviceSelect.value || undefined);
    });

    deviceSelect.addEventListener('change', () => {
        if (deviceSelect.value) {
            startStream(deviceSelect.value);
        }
    });

    // ── Mirror ─────────────────────────────────────────────

    function loadMirror() {
        mirrorCheck.checked = localStorage.getItem('id-mirror') === 'true';
        video.classList.toggle('mirrored', mirrorCheck.checked);
    }

    mirrorCheck.addEventListener('change', () => {
        video.classList.toggle('mirrored', mirrorCheck.checked);
        localStorage.setItem('id-mirror', mirrorCheck.checked);
    });

    // ── Fullscreen ─────────────────────────────────────────

    function isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function toggleFullscreen() {
        if (isFullscreen()) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
            if (appEl.requestFullscreen) appEl.requestFullscreen();
            else if (appEl.webkitRequestFullscreen) appEl.webkitRequestFullscreen();
        }
    }

    function onFullscreenChange() {
        const fs = isFullscreen();
        appEl.classList.toggle('is-fullscreen', fs);
        fullscreenBtn.title = fs ? 'Exit fullscreen' : 'Enter fullscreen';

        if (fs) {
            startToolbarAutoHide();
        } else {
            clearTimeout(toolbarTimer);
            toolbar.classList.remove('toolbar-hidden');
        }
    }

    fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    // ── Toolbar auto-hide in fullscreen ────────────────────

    function startToolbarAutoHide() {
        clearTimeout(toolbarTimer);
        toolbar.classList.remove('toolbar-hidden');
        toolbarTimer = setTimeout(() => {
            if (isFullscreen()) {
                toolbar.classList.add('toolbar-hidden');
            }
        }, 3000);
    }

    appEl.addEventListener('mousemove', () => {
        if (isFullscreen()) startToolbarAutoHide();
    });

    appEl.addEventListener('touchstart', () => {
        if (isFullscreen()) startToolbarAutoHide();
    }, { passive: true });

    // ── PWA Icon Generation ────────────────────────────────

    function generateTouchIcon() {
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 180;
            const ctx = c.getContext('2d');
            if (!ctx) return;

            // Background
            ctx.fillStyle = '#1a1a2e';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(0, 0, 180, 180, 36);
            else ctx.rect(0, 0, 180, 180);
            ctx.fill();

            // Lens circle
            ctx.strokeStyle = '#4a9eff';
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.arc(90, 76, 30, 0, Math.PI * 2);
            ctx.stroke();

            // Center dot
            ctx.fillStyle = '#4a9eff';
            ctx.beginPath();
            ctx.arc(90, 76, 8, 0, Math.PI * 2);
            ctx.fill();

            // Base bar
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(40, 125, 100, 7, 3);
            else ctx.fillRect(40, 125, 100, 7);
            ctx.fill();

            const link = document.createElement('link');
            link.rel = 'apple-touch-icon';
            link.href = c.toDataURL('image/png');
            document.head.appendChild(link);
        } catch (_) { /* non-critical */ }
    }

    // ── Init ───────────────────────────────────────────────

    loadTheme();
    loadMirror();
    refreshDevices();
    generateTouchIcon();

    // Register service worker for offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

})();
