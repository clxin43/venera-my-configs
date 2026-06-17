/**
 * Venera 官方原生标准漫画源: 漫画屋 (mh5.app)
 * 适用版本: Venera 1.6.2+
 * 规范同步：严格基于官方开发文档规范构建
 */

class ManhuaWu extends ComicSource {
    // ================= 1. 基础配置与元数据 =================
    name = "漫画屋"
    key = "manhuawu_crush_standard"
    version = "1.6.6"
    minAppVersion = "1.0.5" 
    // 对应你自己的远程更新链接
    url = "https://cdn.jsdelivr.net/gh/clxin43/venera-my-configs@main/sources/manhuawu.js"

    // 官方 settings 规范：配置面板
    settings = {
        domains: {
            title: "主网站域名",
            type: "select",
            options: [
                { value: "mh5.app" },
                { value: "manhuawu.cc" } // 备用域名
            ],
            default: "mh5.app",
        }
    };

    // 动态计算当前生效的主机地址
    get targetDomain() {
        let domain = this.loadSetting("domains") || this.settings.domains.default;
        return `https://${domain}`;
    }

    // 统一定义请求头防反爬
    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.targetDomain
        };
    }

    init() {
        console.log(`[${this.name}] 严格对照官方 comic_source.md 规范初始化成功。`);
    }

    // ================= 2. 统一卡片解析器 =================
    parseComic(el) {
        const href = el.attributes["href"] || "";
        const idMatch = href.match(/\/book\/(\d+)/);
        if (!idMatch) return null;

        const id = idMatch[1];
        const titleEl = el.querySelector("h3") || el.querySelector(".title") || el;
        const imgEl = el.querySelector("img") || el.querySelector("amp-img");
        
        let cover = imgEl ? (imgEl.attributes["src"] || imgEl.attributes["data-src"] || "") : "";
        if (cover && !cover.startsWith("http")) {
            cover = `${this.targetDomain}${cover}`;
        }

        return {
            id: id,
            title: titleEl.text.trim() || "未命名漫画",
            cover: cover,
            description: "漫画屋作品"
        };
    }

    // ================= 3. 探索页面 (Explore) =================
    explore = [
        {
            title: "首页推荐",
            type: "singlePageWithMultiPart", // 官方支持的多分区单页模式
            load: async () => {
                const res = await Network.get(this.targetDomain, this.getHeaders());
                if (res.status !== 200) throw "无法访问主站";

                let document = new HtmlDocument(res.body);
                let parts = document.querySelectorAll("div.index-recommend-items, div.manga-box");
                let result = {};

                for (let part of parts) {
                    let titleEl = part.querySelector("div.catalog-title, .box-title");
                    let title = titleEl ? titleEl.text.trim() : "热门精选";
                    
                    let cards = part.querySelectorAll("div.comics-card, .manga-item a[href^='/book/']");
                    let comics = cards.map((e) => this.parseComic(e)).filter(c => c !== null);

                    if (comics.length > 0) {
                        result[title] = comics;
                    }
                }

                document.dispose(); // 必须显式释放 DOM 内存，防止沙箱 OOM
                return result;
            }
        }
    ];

    // ================= 4. 分类页面 (Category) =================
    category = {
        title: "分类检索",
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: ["全部", "热血", "恋爱", "古风", "玄幻", "奇幻", "都市"],
                itemType: "category",
                categoryParams: ["all", "rexie", "lianai", "gufeng", "xuanhuan", "qihuan", "dushi"],
            }
        ],
        enableRankingPage: false
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            const region = options[0] || "all";
            const state = options[1] || "all";
            const listUrl = `${this.targetDomain}/api/manga/list?type=${param}&region=${region}&state=${state}&page=${page}&limit=36`;
            
            const res = await Network.get(listUrl, this.getHeaders());
            if (res.status !== 200) throw "加载分类失败";

            let json = JSON.parse(res.body);
            const comics = (json.items || json.data || []).map(e => ({
                id: e.comic_id || e.id,
                title: e.name || e.title,
                subTitle: e.author,
                cover: e.cover?.startsWith("http") ? e.cover : `${this.targetDomain}${e.cover}`
            }));

            return {
                comics: comics,
                maxPage: comics.length > 0 ? page + 1 : page
            };
        },
        optionList: [
            { options: ["all-全部", "cn-国漫", "jp-日本"] },
            { options: ["all-全部", "serial-连载", "pub-完结"] }
        ]
    };

    // ================= 5. 搜索模块 (Search) =================
    search = {
        load: async (keyword, options, page) => {
            const searchUrl = `${this.targetDomain}/search?q=${encodeURIComponent(keyword)}&page=${page}`;
            const response = await Network.get(searchUrl, this.getHeaders());
            
            const doc = new HtmlDocument(response.body);
            const elements = doc.querySelectorAll(".search-list a[href^='/book/'], div.comics-card, a[href^='/book/']");
            
            const comics = [];
            const visited = new Set();

            for (const el of elements) {
                const comicData = this.parseComic(el);
                if (comicData && !visited.has(comicData.id)) {
                    visited.add(comicData.id);
                    comics.push(new Comic(comicData));
                }
            }
            
            doc.dispose(); 
            return {
                comics: comics,
                maxPage: comics.length > 0 ? page + 1 : page
            };
        },
        optionList: []
    };

    // ================= 6. 漫画详情与目录模块 (Comic) =================
    comic = {
        loadInfo: async (id) => {
            const detailUrl = `${this.targetDomain}/book/${id}`;
            const response = await Network.get(detailUrl, this.getHeaders());
            
            const doc = new HtmlDocument(response.body);
            const titleEl = doc.querySelector("h1.comics-detail__title, h1");
            const title = titleEl ? titleEl.text.trim() : "未知作品";
            
            let coverEl = doc.querySelector(".comics-detail__cover img, .detail-info img, amp-img");
            let cover = coverEl ? (coverEl.attributes["src"] || coverEl.attributes["data-src"] || "") : "";
            if (cover && !cover.startsWith("http")) cover = `${this.targetDomain}${cover}`;

            const chaptersMap = new Map();
            const chapterLinks = doc.querySelectorAll(".chapter-list a[href*='/book/'], #chapter-items a[href*='/book/'], a[href*='.html']");
            
            for (const el of chapterLinks) {
                const href = el.attributes["href"] || "";
                const epMatch = href.match(/\/book\/\d+\/(\d+)\.html/);
                if (epMatch) {
                    const epId = epMatch[1];
                    const epTitle = el.querySelector("span")?.text.trim() || el.text.trim();
                    chaptersMap.set(epId, epTitle); // 对齐官方 Map 目录规范
                }
            }

            doc.dispose(); 
            return new ComicDetails({
                title: title,
                cover: cover,
                description: "自适应节点提取",
                chapters: chaptersMap
            });
        },

        // 加载章节内的图片数组
        loadEp: async (comicId, epId) => {
            const chapterUrl = `${this.targetDomain}/book/${comicId}/${epId}.html`;
            const response = await Network.get(chapterUrl, this.getHeaders());
            
            const paramsMatch = response.body.match(/var\s+params\s*=\s*['"]([^'"]+)['"]/);
            if (!paramsMatch) throw new Error("未找到加密载荷 params");
            
            // 调用底层的复合解密组件
            const decryptedJson = this.executeParamsDecrypt(paramsMatch[1]);
            if (!decryptedJson || !decryptedJson.images) throw new Error("解密图片矩阵失败");

            const baseHost = decryptedJson.host || this.targetDomain;
            const images = decryptedJson.images.map(path => 
                path.startsWith('http') ? path : `${baseHost}${path}`
            );

            return { images: images };
        },

        // 官方 ImageLoadingConfig 管道拦截：处理混淆过的二进制流
        onImageLoad: (url, comicId, epId) => {
            return {
                url: url,
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile)",
                    "Referer": `${this.targetDomain}/book/${comicId}/${epId}.html` // 补全 Referer 破防盗链
                },
                onResponse: (responseBuffer) => {
                    if (!url.includes('/content/') && !url.includes('/mp4/')) {
                        return responseBuffer;
                    }

                    const srcUint8 = new Uint8Array(responseBuffer);
                    const length = srcUint8.length;
                    const decryptedUint8 = new Uint8Array(length);
                    
                    // 修复版无符号右移还原逻辑，防止有符号补全和负移位破坏图片文件头
                    for (let i = 0; i < length; i++) {
                        const byteValue = srcUint8[i];
                        const bytePosition = i % 4; 
                        const shiftAmount = (3 - bytePosition) * 8;
                        const effectiveShift = (shiftAmount + 18) % 32; 
                        
                        decryptedUint8[i] = (byteValue >>> effectiveShift) & 0xFF;
                    }

                    return decryptedUint8.buffer; // 直接返回 ArrayBuffer
                }
            };
        }
    };

    // ================= 7. 辅助解密组件 =================
    executeParamsDecrypt(encryptedStr) {
        try {
            const cipherParams = CryptoJS.lib.CipherParams.create({
                ciphertext: CryptoJS.enc.Base64.parse(encryptedStr)
            });
            const key = CryptoJS.enc.Utf8.parse("jsjiami.com.v7");
            const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
                iv: key,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
            return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
        } catch (error) {
            console.error("CryptoJS Pipeline Broken:", error);
            return null;
        }
    }
}
