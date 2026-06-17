/**
 * Venera 官方规范漫画源: 漫画屋
 * 适用版本: Venera 1.6.2+ (基于官方类继承模型与 API 字段)
 */

class ManhuaWu extends ComicSource {
    // ================= 1. 基础信息配置 =================
    name = "漫画屋"
    key = "manhuawu_crush" // 唯一的本地辨识 Key
    version = "1.6.2"
    minAppVersion = "1.0.0"
    url = "https://cdn.jsdelivr.net/gh/clxin43/venera-my-configs@main/sources/manhuawu.js"

    // 自定义内部配置：动态 CDN 域名池，防止写死域名失效
    imageDomains = ["img1.baipiaoguai.org", "img2.baipiaoguai.org"]
    targetDomain = "https://mh5.app"

    // ================= 2. 初始化生命周期 =================
    init() {
        console.log(`[${this.name}] 成功初始化。`);
    }

    // ================= 3. 搜索功能实现 =================
    search = {
        /**
         * 加载搜索结果 (对应官方接口规范)
         * @param keyword {string}
         * @param options {(string | null)[]}
         * @param page {number}
         * @returns {Promise<{comics: any[], maxPage: number}>}
         */
        load: async (keyword, options, page) => {
            try {
                // 拼接符合网站的搜索 URL
                const searchUrl = `${this.targetDomain}/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;
                // 内部使用通用请求头，通过内置机制获取 HTML
                const html = await Http.get(searchUrl, { headers: this.getHeaders() });
                
                const comics = [];
                // 捕获标准的漫画列表卡片 HTML 节点
                const matches = html.matchAll(/<a\s+href="\/book\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g);
                for (const match of matches) {
                    comics.push({
                        id: match[1], // 官方规范：传递给 loadInfo 的唯一标识
                        title: match[2].replace(/<[^>]+>/g, '').trim(),
                        cover: "",
                        description: "漫画屋连载作品"
                    });
                }
                
                return {
                    comics: comics,
                    maxPage: comics.length > 0 ? page + 1 : page // 动态流式下页判定
                };
            } catch (error) {
                console.error("Search Action Failed:", error);
                return { comics: [], maxPage: 1 };
            }
        },
        optionList: []
    }

    // ================= 4. 漫画详情与章节目录 =================
    comic = {
        /**
         * 加载漫画详情与章节列表
         * @param id {string} 漫画ID
         * @returns {Promise<ComicDetails>}
         */
        loadInfo: async (id) => {
            try {
                const detailUrl = `${this.targetDomain}/book/${id}`;
                const html = await Http.get(detailUrl, { headers: this.getHeaders() });
                
                const eps = [];
                // 提取章节
                const matches = html.matchAll(/<a[^>]+href="\/book\/\d+\/(\d+)\.html"[^>]*>([^<]+)<\/a>/g);
                for (const match of matches) {
                    eps.push({
                        epId: match[1], // 章节 ID
                        title: match[2].trim()
                    });
                }
                
                // 转换为正序排列（从第一章开始）
                eps.reverse();

                // 提取漫画标题
                const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
                const title = titleMatch ? titleMatch[1].trim() : "末班车上的Crush";

                return {
                    title: title,
                    cover: "",
                    description: "自适应漫画屋详情加载",
                    chapters: [{
                        title: "正片连载",
                        eps: eps
                    }]
                };
            } catch (error) {
                console.error("LoadComicInfo Failed:", error);
                throw error;
            }
        },

        /**
         * 获取章节的加密图片路径集
         * @param comicId {string}
         * @param epId {string}
         * @returns {Promise<{images: string[]}>}
         */
        loadEp: async (comicId, epId) => {
            const chapterUrl = `${this.targetDomain}/book/${comicId}/${epId}.html`;
            const html = await Http.get(chapterUrl, { headers: this.getHeaders() });
            
            // 匹配页面混淆中隐藏的核心变量 params
            const paramsMatch = html.match(/var\s+params\s*=\s*['"]([^'"]+)['"]/);
            if (!paramsMatch) throw new Error("Missing params encrypted injection");
            
            // 执行标准的解密流
            const decryptedJson = this.internalAESDecrypt(paramsMatch[1]);
            if (!decryptedJson || !decryptedJson.images) {
                throw new Error("Failed to resolve dynamic image arrays");
            }

            const rawImages = decryptedJson.images;
            const imageUrls = [];

            for (let i = 0; i < rawImages.length; i++) {
                let imgPath = rawImages[i];
                // 如果是相对路径，动态附带主域名空间
                let resolvedUrl = imgPath.startsWith('http') ? imgPath : `${this.targetDomain}${imgPath}`;
                imageUrls.push(resolvedUrl);
            }

            return { images: imageUrls };
        },

        /**
         * 官方扩展钩子：为单张图片注入自定义 Headers 和防盗链规则
         */
        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36",
                    "Referer": "", // 注入空防盗链规则，完美映射原站的 'no-referrer' 策略
                    "Accept": "image/avif,image/webp,image/*,*/*"
                }
            };
        }
    }

    // ================= 5. 私有工具函数（防溢出、防死锁、AES还原） =================

    /**
     * 网络核心公共请求头
     */
    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": ""
        };
    }

    /**
     * 针对 params 密文的标准化加密参数还原
     */
    internalAESDecrypt(encryptedStr) {
        try {
            const keyStr = "jsjiami.com.v7";
            const key = CryptoJS.enc.Utf8.parse(keyStr);
            
            const cipherParams = CryptoJS.lib.CipherParams.create({
                ciphertext: CryptoJS.enc.Base64.parse(encryptedStr)
            });

            const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
                iv: key,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });

            return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
        } catch (error) {
            console.error("Internal AES failure:", error);
            return null;
        }
    }
}
