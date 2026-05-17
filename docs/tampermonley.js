// ==UserScript==
// @name         DMM/FANZA 【自動】 動画DL 
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  DMM/FANZAの商品ページでサンプル動画を自動でタイトル付き保存し、動画URLをクリップボードにコピーします。
// @match        https://*.dmm.com/*
// @match        https://*.dmm.co.jp/*
// @match        https://www.dmm.com/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    console.log('DMM/FANZA Downloader (v7.0): 起動しました。');

    // ===== ヘルパー関数 =====
    function sanitizeTitle(title) {
        return title.replace(/[\\/:*?"<>|]/g, '_').trim();
    }

    function getProductTitle() {
        console.log('🔍 タイトル取得開始...');

        // 旧DMMサイト用の特定セレクター（h1#title）を最優先
        const oldDmmTitle = document.querySelector('h1#title');
        if (oldDmmTitle?.textContent?.trim()) {
            let title = oldDmmTitle.textContent.trim();
            // 【新作】などの不要な接頭辞を削除
            title = title.replace(/【.*?】/g, '').trim();
            console.log(`✅ 旧DMMタイトル採用: "${title}"`);
            return sanitizeTitle(title);
        }

        // 新DMMサイト用の検索パターン
        const patterns = [
            // 新UI用パターン
            'h1 span span',
            'h1 span.inline-block span',
            'h1.font-semibold span span',
            '.border-b-2 h1 span span',

            // 一般的なパターン
            'h1 span',
            'h1',
            '.product-title',
            '.item-title',
            '[data-testid*="title"]',
            '.title'
        ];

        for (const pattern of patterns) {
            const elements = document.querySelectorAll(pattern);
            console.log(`🔍 ${pattern}: ${elements.length}個発見`);

            for (const element of elements) {
                const text = element.textContent?.trim();
                if (!text) continue;

                console.log(`🔍 候補: "${text.substring(0, 100)}..." (長さ: ${text.length})`);

                // タイトル判定条件
                if (text.length >= 10 &&
                    text.length <= 300 &&
                    !text.includes('ログイン') &&
                    !text.includes('新規登録') &&
                    !text.includes('検索') &&
                    !text.includes('カート') &&
                    text !== document.title) {

                    // 【新作】などの不要な接頭辞を削除
                    let cleanTitle = text.replace(/【.*?】/g, '').trim();
                    console.log(`✅ タイトル採用: "${cleanTitle}"`);
                    return sanitizeTitle(cleanTitle);
                }
            }
        }

        // より積極的な全文書検索
        console.log('🔍 全文書から長文テキストを検索...');
        const allElements = document.querySelectorAll('*');
        const candidates = [];

        for (const element of allElements) {
            if (element.children.length > 0) continue; // 子要素があるものは除外

            const text = element.textContent?.trim();
            if (text && text.length >= 20 && text.length <= 200) {
                candidates.push({
                    text: text,
                    tag: element.tagName.toLowerCase(),
                    className: element.className
                });
            }
        }

        // 候補を長さでソート（長い順）
        candidates.sort((a, b) => b.text.length - a.text.length);

        console.log(`🔍 長文候補: ${Math.min(candidates.length, 5)}個を確認`);
        for (let i = 0; i < Math.min(candidates.length, 5); i++) {
            const candidate = candidates[i];
            console.log(`🔍 候補${i + 1}: "${candidate.text.substring(0, 80)}..." (${candidate.tag}.${candidate.className})`);

            if (!candidate.text.includes('ログイン') &&
                !candidate.text.includes('検索') &&
                !candidate.text.includes('メニュー') &&
                !candidate.text.includes('Copyright') &&
                !candidate.text.includes('All Rights Reserved')) {

                // 【新作】などの不要な接頭辞を削除
                let cleanTitle = candidate.text.replace(/【.*?】/g, '').trim();
                console.log(`✅ 長文候補採用: "${cleanTitle}"`);
                return sanitizeTitle(cleanTitle);
            }
        }

        // ページタイトルを最後に試行
        if (document.title && document.title.trim()) {
            let cleanTitle = document.title;

            // 一般的なサイト名パターンを除去
            const sitePrefixes = [' - DMM', ' - FANZA', ' | DMM', ' | FANZA', ' - ', ' | '];
            for (const prefix of sitePrefixes) {
                if (cleanTitle.includes(prefix)) {
                    cleanTitle = cleanTitle.split(prefix)[0];
                    break;
                }
            }

            // 【新作】などの不要な接頭辞を削除
            cleanTitle = cleanTitle.replace(/【.*?】/g, '').trim();

            if (cleanTitle.length > 5) {
                console.log(`✅ ページタイトル採用: "${cleanTitle}"`);
                return sanitizeTitle(cleanTitle);
            }
        }

        const fallback = `DMM_video_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '_')}`;
        console.log(`⚠️ フォールバック使用: "${fallback}"`);
        return fallback;
    }

    function copyToClipboard(text) {
        try {
            GM_setClipboard(text, { type: 'text', mimetype: 'text/plain' });
            console.log(`📋 GM_setClipboardでコピー成功: ${text}`);
        } catch (e) {
            console.warn('❌ クリップボードコピー失敗:', e);
        }
    }

    async function processVideo(videoUrl, productTitle) {
        if (!videoUrl || !videoUrl.startsWith('http')) return;

        console.log(`🎬 動画処理開始 - タイトル: "${productTitle}", URL: ${videoUrl}`);

        // --- URLをクリップボードに保存 ---
        copyToClipboard(videoUrl);

        // --- 動画をダウンロード ---
        try {
            console.log(`📥 ダウンロード開始: ${productTitle}.mp4`);
            const response = await fetch(videoUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${productTitle}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);

            console.log(`✅ 保存完了: ${productTitle}.mp4`);
        } catch (e) {
            console.error('ダウンロード中にエラー:', e);
        }
    }

    // ===== 要素監視関数 =====
    function waitForElement(selector, callback, timeout = 10000) {
        const start = Date.now();
        const timer = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) {
                clearInterval(timer);
                callback(el);
            } else if (Date.now() - start > timeout) {
                clearInterval(timer);
                console.warn('⏳ 監視対象の要素が見つかりませんでした:', selector);
            }
        }, 500);
    }

    // ===== メイン処理 =====
    let hasHandled = false;

    // サイト判定とそれに応じた処理
    const currentUrl = location.href;
    console.log(`🌐 現在のURL: ${currentUrl}`);

    // 旧DMMサイト（www.dmm.com）の場合
    if (currentUrl.includes('www.dmm.com')) {
        console.log('🎯 旧DMMサイトを検出 - 待機発火モードで動作');

        waitForElement('a.fn-sampleVideoBtn[onclick*="video_url"]', async (sampleButton) => {
            if (hasHandled) return;
            hasHandled = true;

            try {
                console.log('🎬 旧UI形式のサンプルボタンを発見');

                const productTitle = getProductTitle();
                console.log(`📝 使用するタイトル: "${productTitle}"`);

                // 動画URL取得
                const onclickAttr = sampleButton.getAttribute('onclick');
                const urlMatch = onclickAttr.match(/"video_url":"([^"]+)"/);

                if (!urlMatch) {
                    console.warn('❌ 動画URLの取得に失敗しました');
                    return;
                }

                const videoUrl = urlMatch[1].replace(/\\/g, '');
                console.log(`🎬 動画URL抽出: ${videoUrl}`);

                await processVideo(videoUrl, productTitle);

            } catch (e) {
                console.error('❌ 旧DMMサイト処理中にエラー:', e);
            }
        });

    } else {
        // 新DMMサイト・FANZAサイトの場合
        console.log('🎯 新DMMサイト/FANZAを検出 - リアルタイム監視モードで動作');

        const TARGET_SELECTORS = [
            '#sample-video',
            'div[data-name="player-cover"]',
            'a.fn-sampleVideoBtn[onclick*="video_url"]'
        ].join(', ');

        function handleFoundElement(element) {
            if (hasHandled) return;
            hasHandled = true;

            console.log(`🎯 対象要素発見: ${element.tagName}${element.className ? '.' + element.className : ''}${element.id ? '#' + element.id : ''}`);

            const productTitle = getProductTitle();
            console.log(`📝 使用するタイトル: "${productTitle}"`);

            // --- 新UI: videoタグが生成されるタイプ ---
            if (element.matches('#sample-video, div[data-name="player-cover"]')) {
                console.log('🎬 新UI形式を検出');
                element.click(); // 動画ロード発火

                const videoObserver = new MutationObserver((_, obs) => {
                    const videoElement = document.querySelector('video[src]');
                    if (videoElement?.src) {
                        console.log(`🎬 動画要素発見: ${videoElement.src}`);
                        obs.disconnect();
                        processVideo(videoElement.src, productTitle);
                    }
                });
                videoObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
                return;
            }

            // --- 旧UI: onclick内に直接URLがあるタイプ ---
            if (element.matches('a.fn-sampleVideoBtn')) {
                console.log('🎬 旧UI形式を検出');
                const onclickAttr = element.getAttribute('onclick');
                const urlMatch = onclickAttr.match(/"video_url":"([^"]+)"/);
                if (urlMatch?.[1]) {
                    const videoUrl = urlMatch[1].replace(/\\/g, '');
                    console.log(`🎬 動画URL抽出: ${videoUrl}`);
                    processVideo(videoUrl, productTitle);
                } else {
                    console.warn('❌ onclick属性から動画URLを抽出できませんでした');
                }
            }
        }

        const observer = new MutationObserver(() => {
            const element = document.querySelector(TARGET_SELECTORS);
            if (element) {
                observer.disconnect();
                handleFoundElement(element);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            if (!hasHandled) {
                observer.disconnect();
                console.warn('DMM/FANZA Downloader: 15秒経過しましたが対象が見つかりません。');

                // デバッグ用：ページの情報を出力
                console.log('🔍 デバッグ情報:');
                console.log('- URL:', location.href);
                console.log('- Title:', document.title);
                console.log('- H1要素:', Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim()));
            }
        }, 15000);
    }

    console.log('🚀 DMM/FANZA Downloader (v7.0): 初期化完了');
})();