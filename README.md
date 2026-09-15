# MangaPlaza & Comic C'moA Ripper

A custom Tampermonkey userscript engineered to capture, sequence, and download manga chapters from MangaPlaza and Comic C'moA. It automatically bypasses the platforms' image-splitting protection to deliver perfectly ordered files inside a FOLDER.

## ✨ Core Features

* **Blob Interception:** Captures high-quality image data directly from memory as it renders, bypassing standard right-click restrictions.
* **SHA-256 Deduplication:** Cryptographically hashes every captured image in real-time to guarantee zero duplicate files in your final download.
* **Smart Image Sequencing:** Automatically maps sliced image segments (pages divided into 3 parts) to their correct physical order using DOM scanning.
* **Draggable Floating UI:** A minimal, lightweight control panel that tracks your captured images and can be dragged anywhere on the screen.
* **One-Click ZIP Export:** Packages all correctly sequenced image slices into a single ZIP file named after the chapter.

## 🚀 Installation & Usage

1. **Prerequisite:** Install the **Tampermonkey** extension in your web browser.
2. **Install Script:** Add the tool via my Greasyfork profile.
3. **Load Chapter:** Open the manga chapter you want to save.
4. **Reading Direction:** You MUST set the reader to **Right-to-Left (Horizontal)** for the script to sequence pages correctly
5. **Extension Conflicts:** Disable any "Enable Right Click" scripts or browser extensions, as they will completely break the auto-scroll logic

5. **Download:** Once you reach the end and the counter on the floating UI stops increasing, click **Download** to generate your ZIP file.

## ⚠️ Important Notice

**This tool is strictly for educational purposes.** Please support the original creators and publishers. Do not repost, re-upload, or distribute the downloaded media.

## 🔗 Links, Feedback & Support

* **Greasyfork Scripts:** [ozler365's Profile](https://greasyfork.org/en/users/1553223-ozler365)
* **GitHub Repositories:** [ozler-s-works-info](https://ozler365.github.io/ozler-s-works-info/#/repositories)
* **Support the Developer:** Keep this script updated and running smoothly by leaving a small donation at [Buy Me a Coffee (ozler)](https://buymeacoffee.com/ozler).

For bug reports, feature requests, or general queries, please leave a review on Greasyfork or email **devjk6918@gmail.com**.
