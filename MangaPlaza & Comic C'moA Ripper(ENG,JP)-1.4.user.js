// ==UserScript==
// @name         MangaPlaza & Comic C'moA Ripper(ENG,JP)
// @namespace    https://greasyfork.org/en/users/1553223-ozler365
// @version      1.4
// @description  Captures image blobs, joins split images, auto-scrolls (waits for loading), modern minimizable UI, and precise chapter folder downloads.
// @author       ozler365
// @match        https://reader.mangaplaza.com/*
// @match        https://www.cmoa.jp/bib/speedreader/*
// @license      MIT
// @icon         https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxPhS0MYkfiZ0LGfDQaF7jedEY76T9dZybag&s
// @run-at       document-start
// @grant        GM_download
// @downloadURL https://update.greasyfork.org/scripts/560991/MangaPlaza%20%20Comic%20C%27moA%20Ripper%28ENG%2CJP%29.user.js
// @updateURL https://update.greasyfork.org/scripts/560991/MangaPlaza%20%20Comic%20C%27moA%20Ripper%28ENG%2CJP%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const MIN_SIZE = 2048; // 2KB min size
    const urlToHash = new Map(); // Maps blobUrl -> SHA256 hash
    const hashToBlob = new Map(); // Maps SHA256 hash -> Blob
    const hashToPosition = new Map(); // Maps SHA256 hash -> { pageNum, sliceNum }
    let btnScroll, btnDl, label;
    let state = { isAutoScrolling: false };

    // --- Helper: SHA-256 Hash for Deduplication ---
    async function hashBlob(blob) {
        const buf = await blob.arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
    }

    // --- Helper: Join Sliced Images Vertically ---
    async function joinBlobsVertically(blobs) {
        if (blobs.length === 1) return blobs[0]; // Skip canvas if it's already a single image

        const images = await Promise.all(blobs.map(blob => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const url = origCreate(blob);
                img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image slice failed to load")); };
                img.src = url;
            });
        }));

        const totalHeight = images.reduce((sum, img) => sum + img.naturalHeight, 0);
        const maxWidth = Math.max(...images.map(img => img.naturalWidth));

        const canvas = document.createElement('canvas');
        canvas.width = maxWidth;
        canvas.height = totalHeight;
        const ctx = canvas.getContext('2d');

        let currentY = 0;
        for (const img of images) {
            ctx.drawImage(img, 0, currentY);
            currentY += img.naturalHeight;
        }

        return new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', 0.95);
        });
    }

    // --- Core: Hook URL.createObjectURL ---
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
        const url = origCreate.apply(this, arguments);
        if (blob instanceof Blob && blob.type.startsWith('image/') && blob.size >= MIN_SIZE) {
            hashBlob(blob).then(h => {
                urlToHash.set(url, h); // Link this URL to its unique hash
                if (!hashToBlob.has(h)) {
                    hashToBlob.set(h, blob); // Store the actual blob against the hash
                }
            });
        }
        return url; // Return untouched to prevent breaking site images
    };

    // --- DOM Scanner: Map URLs to Page Order ---
    const observer = new MutationObserver(() => {
        document.querySelectorAll('div[id^="content-p"]').forEach(container => {
            const match = container.id.match(/\d+/);
            if (!match) return;
            const pageNum = parseInt(match[0], 10);
            
            container.querySelectorAll('img').forEach((img, index) => {
                const url = img.src;
                if (url && url.startsWith('blob:')) {
                    const hash = urlToHash.get(url);
                    // If we have the hash and haven't recorded its position yet
                    if (hash && !hashToPosition.has(hash)) {
                        hashToPosition.set(hash, { pageNum, sliceNum: index + 1 });
                    }
                }
            });
        });
    });

    const startObserver = () => {
        if (document.body) {
            // Reverted to safer attributes to prevent infinite looping
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        } else {
            requestAnimationFrame(startObserver);
        }
    };
    startObserver();

    // --- Safe UI Updater (Prevents freeze loop) ---
    setInterval(() => {
        if (!label) return;
        let totalPagesStr = '?';
        const cap = document.getElementById('menu_slidercaption');
        
        if (cap && cap.innerText.includes('/')) {
            totalPagesStr = cap.innerText.split('/')[1].trim();
        }
        
        const currentCount = new Set(Array.from(hashToPosition.values()).map(p => p.pageNum)).size;
        const newText = `${currentCount} / ${totalPagesStr}`;
        
        if (label.textContent !== newText) {
            label.textContent = newText;
        }
    }, 500);

    // --- Auto Scroll Logic ---
    async function toggleAutoScroll() {
        if (state.isAutoScrolling) {
            state.isAutoScrolling = false;
            btnScroll.textContent = "Start Auto-Scroll";
            btnScroll.style.background = "#f59e0b";
            return;
        }

        state.isAutoScrolling = true;
        btnScroll.textContent = "Stop Auto-Scroll";
        btnScroll.style.background = "#ef4444";

        const getRange = () => document.querySelector('.ui-slider-range-max');

        // Create a dedicated safe target to bypass the site's strict tagName and input checks
        let safeTarget = document.getElementById('mp-safe-target');
        if (!safeTarget) {
            safeTarget = document.createElement('div');
            safeTarget.id = 'mp-safe-target';
            safeTarget.tabIndex = -1; // Make it focusable but hidden from tab flow
            safeTarget.style.position = 'absolute';
            safeTarget.style.opacity = '0';
            document.body.appendChild(safeTarget);
        }

        const triggerKey = (keyName, keyCode) => {
            safeTarget.focus(); // Focus the safe div before firing the key
            
            // Dispatch Keydown
            safeTarget.dispatchEvent(new KeyboardEvent('keydown', { 
                key: keyName, code: keyName, keyCode: keyCode, which: keyCode, bubbles: true 
            }));
            
            // Dispatch Keyup to prevent the site from thinking the key is held down
            safeTarget.dispatchEvent(new KeyboardEvent('keyup', { 
                key: keyName, code: keyName, keyCode: keyCode, which: keyCode, bubbles: true 
            }));
        };

        // Helper to check if any .pt-loading element is currently visible on screen
        const isLoadingVisible = () => {
            const loaders = document.querySelectorAll('.pt-loading');
            for (let i = 0; i < loaders.length; i++) {
                const rect = loaders[i].getBoundingClientRect();
                // Check if element is in viewport with a bit of buffer
                if (rect.right > -100 && rect.left < (window.innerWidth + 100) && rect.width > 0) {
                    return true;
                }
            }
            return false;
        };

        // Rewind to first page
        let rewindGuard = 0;
        
        while (rewindGuard < 300 && state.isAutoScrolling) {
            const range = getRange();
            if (!range) break;
            
            // Accurately detect the first page using the progress range width 
            if (range.style.width === '0%' || range.style.width === '0px') {
                break;
            }
            
            triggerKey('ArrowRight', 39);
            await new Promise(r => setTimeout(r, 150));
            rewindGuard++;
        }

        await new Promise(r => setTimeout(r, 800)); // Allow rewind to settle

        let naturallyFinished = false;
        let prevWidth = -1;
        let step = 0;

        // Auto Scroll forward
        while (state.isAutoScrolling) {
            const range = getRange();
            
            if (range && range.style.width) {
                let currentWidth = parseFloat(range.style.width);
                
                // Dynamically calculate the % movement of a single page turn
                if (prevWidth !== -1 && currentWidth !== prevWidth) {
                    let diff = Math.abs(currentWidth - prevWidth);
                    if (diff > 0 && (step === 0 || diff < step)) {
                        step = diff;
                    }
                }
                
                // If the next turn will hit or exceed 100%, break BEFORE pressing the key
                if (step > 0 && (currentWidth + (step * 1.1)) >= 100) {
                    state.isAutoScrolling = false;
                    naturallyFinished = true;
                    break;
                }
                
                // Hard failsafe
                if (currentWidth >= 100) {
                    state.isAutoScrolling = false;
                    naturallyFinished = true;
                    break;
                }
                
                prevWidth = currentWidth;
            }

            // --- New: Wait for loading elements to disappear before turning ---
            let waitLoading = 0;
            while (state.isAutoScrolling && isLoadingVisible() && waitLoading < 150) {
                await new Promise(r => setTimeout(r, 100));
                waitLoading++;
            }
            
            if (!state.isAutoScrolling) break; // Check again in case user stopped it while waiting

            triggerKey('ArrowLeft', 37);
            await new Promise(r => setTimeout(r, 800)); // Delay between turns
        }

        btnScroll.textContent = "Start Auto-Scroll";
        btnScroll.style.background = "#f59e0b";

        const autoDlChecked = document.getElementById('mp-auto-dl-cb').checked;
        if (naturallyFinished && autoDlChecked) {
            downloadFolder();
        }
    }

    // --- Download Logic (GM_download to Folder with Vertically Merged Images) ---
    async function downloadFolder() {
        if (hashToPosition.size === 0) return alert("No mapped images captured. Scroll the pages first.");
        const oldText = btnDl.textContent;
        btnDl.textContent = "Processing Slices...";
        btnDl.disabled = true;

        // 1. Group slices by their structural pageNum
        const pagesMap = new Map();
        for (const [hash, data] of hashToPosition.entries()) {
            const blob = hashToBlob.get(hash);
            if (blob) {
                if (!pagesMap.has(data.pageNum)) {
                    pagesMap.set(data.pageNum, []);
                }
                pagesMap.get(data.pageNum).push({ blob, sliceNum: data.sliceNum });
            }
        }

        // 2. Sort the full pages to maintain manga order
        const sortedPageNums = Array.from(pagesMap.keys()).sort((a, b) => a - b);
        const finalBlobs = [];

        // 3. Sort slices within each page and join them vertically
        for (const pageNum of sortedPageNums) {
            const slices = pagesMap.get(pageNum).sort((a, b) => a.sliceNum - b.sliceNum);
            const blobsToJoin = slices.map(s => s.blob);
            
            try {
                const joinedBlob = await joinBlobsVertically(blobsToJoin);
                finalBlobs.push(joinedBlob);
            } catch (e) {
                console.error(`Failed to join slices for page ${pageNum}`, e);
            }
        }

        btnDl.textContent = "Downloading...";
        let title = document.title.replace(/[<>:"/\\|?*]/g, "").trim() || "MangaPlaza_Download";
        
        // Dynamic MangaPlaza Folder Naming Logic
        if (window.location.hostname.includes("mangaplaza.com")) {
            const urlParams = new URLSearchParams(window.location.search);
            const cid = urlParams.get('cid');
            if (cid && cid.length >= 4) {
                // Extracts the last 4 digits and mathematically drops the leading zeros
                const chapNum = parseInt(cid.slice(-4), 10);
                if (!isNaN(chapNum)) {
                    title = `${title} - Chapter ${chapNum}`;
                }
            }
        }

        let completed = 0;

        // 4. Export the finalized merged blobs sequentially via GM_download
        finalBlobs.forEach((blob, i) => {
            const url = origCreate(blob); // Safe generation for download
            const ext = blob.type.split('/')[1] || 'jpg';
            const filename = `page_${String(i + 1).padStart(3, '0')}.${ext}`;
            const fullPath = `${title}/${filename}`;

            GM_download({
                url: url,
                name: fullPath,
                saveAs: false,
                onload: () => {
                    URL.revokeObjectURL(url);
                    completed++;
                    if (completed === finalBlobs.length) {
                        btnDl.textContent = oldText;
                        btnDl.disabled = false;
                    }
                },
                onerror: (e) => {
                    console.error("Error saving file:", e);
                    URL.revokeObjectURL(url);
                    completed++;
                    if (completed === finalBlobs.length) {
                        btnDl.textContent = oldText;
                        btnDl.disabled = false;
                    }
                }
            });
        });
        
        // Failsafe reset if a download callback misses
        setTimeout(() => {
            btnDl.textContent = oldText;
            btnDl.disabled = false;
        }, 8000);
    }

    // --- Modern Movable UI ---
    window.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `
            #mp-modal {
                position: fixed; top: 50%; right: 20px; transform: translateY(-50%); z-index: 999999;
                background: #18181b; color: #f4f4f5; padding: 14px; border-radius: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                box-shadow: 0 10px 30px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.2);
                width: 210px; border: 1px solid #27272a; user-select: none;
            }
            #mp-header { 
                cursor: grab; display: flex; align-items: center; justify-content: space-between; 
                padding-bottom: 10px; border-bottom: 1px solid #27272a; margin-bottom: 12px; 
            }
            #mp-header:active { cursor: grabbing; }
            .mp-title { font-size: 11px; font-weight: 800; letter-spacing: 0.8px; color: #e4e4e7; }
            .mp-dots { display: flex; gap: 4px; }
            .mp-dot { width: 10px; height: 10px; border-radius: 50%; }
            .mp-switch { position: relative; display: inline-block; width: 32px; height: 18px; }
            .mp-switch input { opacity: 0; width: 0; height: 0; }
            .mp-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #3f3f46; transition: .2s; border-radius: 18px; }
            .mp-slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%; }
            input:checked + .mp-slider { background-color: #10b981; }
            input:checked + .mp-slider:before { transform: translateX(14px); }
            .mp-btn { width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; transition: filter 0.2s; margin-bottom: 8px; }
            .mp-btn:hover { filter: brightness(1.1); }
            .mp-btn:active { filter: brightness(0.9); }
            #mp-btn-scroll { background: #f59e0b; color: white; }
            #mp-btn-dl { background: #2563eb; color: white; margin-bottom: 0; }
        `;
        document.head.appendChild(style);

        const div = document.createElement('div');
        div.id = 'mp-modal';
        
        div.innerHTML = `
            <div id="mp-header">
                <span class="mp-title">RIPPER PRO</span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button id="mp-min-btn" style="background:transparent; border:none; color:#a1a1aa; cursor:pointer; font-size:18px; line-height:1; padding:0; outline:none;">−</button>
                    <div class="mp-dots">
                        <div class="mp-dot" style="background: #ef4444;"></div>
                        <div class="mp-dot" style="background: #f59e0b;"></div>
                        <div class="mp-dot" style="background: #10b981;"></div>
                    </div>
                </div>
            </div>

            <div id="mp-body">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #27272a; padding: 8px 10px; border-radius: 6px;">
                    <span style="font-size: 12px; font-weight: 600; color: #10b981;">Captured:</span>
                    <span id="mp-count" style="font-size: 12px; font-weight: 700; color: #f4f4f5;">0 / ?</span>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 11px; color: #a1a1aa; font-weight: 600;">
                    <span>Auto-Download</span>
                    <label class="mp-switch">
                        <input type="checkbox" id="mp-auto-dl-cb" checked>
                        <span class="mp-slider"></span>
                    </label>
                </div>
            </div>
        `;

        const bodyEl = div.querySelector('#mp-body');

        btnScroll = document.createElement('button');
        btnScroll.id = 'mp-btn-scroll';
        btnScroll.className = 'mp-btn';
        btnScroll.textContent = "Start Auto-Scroll";
        btnScroll.onclick = toggleAutoScroll;

        btnDl = document.createElement('button');
        btnDl.id = 'mp-btn-dl';
        btnDl.className = 'mp-btn';
        btnDl.textContent = "Download Chapter";
        btnDl.onclick = downloadFolder;

        bodyEl.appendChild(btnScroll);
        bodyEl.appendChild(btnDl);
        document.body.appendChild(div);
        
        label = document.getElementById('mp-count');

        // Minimize Logic
        const minBtn = document.getElementById('mp-min-btn');
        let isMinimized = false;
        minBtn.onclick = (e) => {
            e.stopPropagation(); // Stop drag from triggering
            isMinimized = !isMinimized;
            bodyEl.style.display = isMinimized ? 'none' : 'block';
            minBtn.textContent = isMinimized ? '+' : '−';
            div.style.width = isMinimized ? '140px' : '210px';
            document.getElementById('mp-header').style.marginBottom = isMinimized ? '0' : '12px';
            document.getElementById('mp-header').style.borderBottom = isMinimized ? 'none' : '1px solid #27272a';
            document.getElementById('mp-header').style.paddingBottom = isMinimized ? '0' : '10px';
        };

        // Dragging Logic
        let isDragging = false, startX, startY, initialLeft, initialTop;

        const dragStart = (e) => {
            // Prevent dragging if clicking interactable elements inside the modal
            if (e.target.closest('button') || e.target.closest('label') || e.target.tagName === 'INPUT') return; 
            isDragging = true;
            const evt = e.type.includes('mouse') ? e : e.touches[0];
            const rect = div.getBoundingClientRect();
            startX = evt.clientX;
            startY = evt.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;
            
            // Switch from initial right/transform positioning to absolute left/top for smooth dragging
            div.style.right = 'auto';
            div.style.transform = 'none';
            div.style.left = `${initialLeft}px`;
            div.style.top = `${initialTop}px`;
        };

        const drag = (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent page scrolling on mobile while dragging UI
            const evt = e.type.includes('mouse') ? e : e.touches[0];
            const dx = evt.clientX - startX;
            const dy = evt.clientY - startY;
            div.style.left = `${initialLeft + dx}px`;
            div.style.top = `${initialTop + dy}px`;
        };

        const dragEnd = () => {
            isDragging = false;
        };

        div.addEventListener('mousedown', dragStart);
        div.addEventListener('touchstart', dragStart, { passive: false });
        
        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag, { passive: false });
        
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);
    });
})();