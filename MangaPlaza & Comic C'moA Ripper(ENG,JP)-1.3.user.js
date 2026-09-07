// ==UserScript==
// @name         MangaPlaza & Comic C'moA Ripper(ENG,JP)
// @namespace    https://greasyfork.org/en/users/1553223-ozler365
// @version      1.3
// @description  Captures image blobs, maintains correct page order, uses SHA256 to prevent duplicates, movable UI, and downloads to ZIP.
// @author       ozler365
// @match        https://reader.mangaplaza.com/*
// @match        https://www.cmoa.jp/bib/speedreader/*
// @license      MIT
// @icon         https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxPhS0MYkfiZ0LGfDQaF7jedEY76T9dZybag&s
// @run-at       document-start
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @downloadURL https://update.greasyfork.org/scripts/560991/MangaPlaza%20%20Comic%20C%27moA%20Ripper%28ENG%2CJP%29.user.js
// @updateURL https://update.greasyfork.org/scripts/560991/MangaPlaza%20%20Comic%20C%27moA%20Ripper%28ENG%2CJP%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const MIN_SIZE = 2048; // 2KB min size
    const urlToHash = new Map(); // Maps blobUrl -> SHA256 hash
    const hashToBlob = new Map(); // Maps SHA256 hash -> Blob
    const hashToPosition = new Map(); // Maps SHA256 hash -> { pageNum, sliceNum }
    let btn, label;

    // --- Helper: SHA-256 Hash for Deduplication ---
    async function hashBlob(blob) {
        const buf = await blob.arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
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
                        if(label) label.textContent = hashToPosition.size;
                    }
                }
            });
        });
    });

    const startObserver = () => {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        } else {
            requestAnimationFrame(startObserver);
        }
    };
    startObserver();

    // --- Download Logic ---
    async function downloadZip() {
        if (hashToPosition.size === 0) return alert("No mapped images captured. Scroll the pages first.");
        const oldText = btn.textContent;
        btn.textContent = "Zipping...";
        btn.disabled = true;

        const zip = new JSZip();
        const orderedImages = [];

        // Match mapped structural data with the saved raw blobs via SHA256 Hash
        for (const [hash, data] of hashToPosition.entries()) {
            const blob = hashToBlob.get(hash);
            if (blob) {
                orderedImages.push({
                    blob,
                    pageNum: data.pageNum,
                    sliceNum: data.sliceNum,
                    ext: blob.type.split('/')[1] || 'png' // Maintains original quality
                });
            }
        }

        // Sort by Page Number, then by Slice Number
        orderedImages.sort((a, b) => {
            if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
            return a.sliceNum - b.sliceNum;
        });

        // Add files to ZIP sequentially
        orderedImages.forEach((img, i) => {
            zip.file(`page${i + 1}.${img.ext}`, img.blob);
        });

        try {
            const content = await zip.generateAsync({ type: "blob" });
            const title = document.title.replace(/[<>:"/\\|?*]/g, "").trim() || "MangaPlaza_Download";
            
            const a = document.createElement("a");
            a.href = origCreate(content); // Use original to bypass our hook
            a.download = `${title}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (e) {
            console.error(e);
            alert("Error creating ZIP");
        }
        btn.textContent = oldText;
        btn.disabled = false;
    }

    // --- Minimal Movable UI ---
    window.addEventListener('DOMContentLoaded', () => {
        const div = document.createElement('div');
        // Initial position: Right side, vertically centered
        div.style.cssText = "position:fixed; top:50%; right:20px; transform:translateY(-50%); z-index:99999; background:#2563eb; color:#fff; padding:10px; border-radius:8px; font-family:sans-serif; box-shadow:0 4px 6px rgba(0,0,0,0.2); font-size:13px; display:flex; gap:10px; align-items:center; cursor:move; user-select:none; touch-action:none;";
        
        div.innerHTML = `<b>Blob+</b> <span id="mp-count" style="background:rgba(255,255,255,0.2); padding:2px 6px; border-radius:4px;">0</span>`;
        
        btn = document.createElement('button');
        btn.textContent = "Download";
        btn.style.cssText = "border:none; background:#fff; color:#2563eb; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600;";
        btn.onclick = downloadZip;

        div.appendChild(btn);
        document.body.appendChild(div);
        label = document.getElementById('mp-count');

        // Dragging Logic
        let isDragging = false, startX, startY, initialLeft, initialTop;

        const dragStart = (e) => {
            if (e.target === btn) return; // Allow normal clicking on the button
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