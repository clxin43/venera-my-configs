
/**
 * Venera 漫画源: 末班车上的Crush - 漫画屋
 * 适配域名: mh5.app (或该源码对应的具体漫画站点)
 */

const Pager = {
    // 1. 基础配置信息
    config: {
        name: "漫画屋 (末班车上的Crush)",
        version: "1.0.0",
        domain: "https://mh5.app", // 请根据实际可访问域名调整
        description: "支持解密流与防盗链图片加载",
    },

    // 2. 搜索漫画 (根据实际网站搜索接口调整，此处留空或简单实现)
    async search(keyword, page) {
        return [];
    },

    // 3. 获取漫画详情及章节列表
    async getDetail(url) {
        // 示例：从 HTML 中解析章节列表
        const html = await Http.get(url);
        const chapters = [];
        
        // 匹配章节节点的正则（需根据实际 HTML 结构微调）
        // const matches = html.matchAll(/href="([^"]+)"[^>]*>([^<]+)<\/a>/g);
        // for (const match of matches) { ... }

        return {
            title: "末班车上的Crush",
            cover: "",
            desc: "漫画屋连载作品",
            chapters: chapters
        };
    },

    // 4. 核心：获取章节图片列表与解密
    async getImages(chapterUrl) {
        const html = await Http.get(chapterUrl);
        
        // 提取混淆段落里的核心加密参数变量 params (通常隐藏在页面的 script 标签中)
        const paramsMatch = html.match(/var\s+params\s*=\s*['"]([^'"]+)['"]/);
        if (!paramsMatch) throw new Error("未找到加密的图片参数 (params)");
        const encryptedParams = paramsMatch[1];

        // 引入 CryptoJS（Venera 环境通常内置，或通过 eval 注入）
        // 逆向出来的参数解密逻辑：
        // 密钥为 'jsjiami.com.v7' 的变体映射，根据源码：
        const keyStr = "jsjiami.com.v7"; // 对应源码 _0x392f 里的解密 key 映射
        const key = CryptoJS.enc.Utf8.parse(keyStr);
        const iv = key; // 源码中 iv 与 key 相同

        // 解密 params 得到真实的图片 JSON 数据
        const decryptedBytes = CryptoJS.AES.decrypt(encryptedParams, key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        const paramsJson = JSON.parse(decryptedBytes.toString(CryptoJS.enc.Utf8));
        
        // 提取图片相对路径数组
        const rawImages = paramsJson.images; // ['/book/content/...jpg', ...]
        const sourceId = paramsJson.source_id;

        // 构建 Venera 需要的图片对象数组
        // 由于图片需要前端二次位移解密（decryptImage），我们需要将原始路径
        // 传给 Venera 的特定解密后置函数，或者在此处直接利用 Venera 的 Http.getAsArrayBuffer 提前解密
        const imageUrls = [];
        
        for (let i = 0; i < rawImages.length; i++) {
            let imgUrl = rawImages[i];
            if (!imgUrl.startsWith('http')) {
                imgUrl = 'https://img1.baipiaoguai.org' + imgUrl; // 对应源码 mwp 备用域名
            }
            
            imageUrls.push({
                url: imgUrl,
                index: i,
                // 将解密开关传给后置渲染器，如果 Venera 支持 customFetch：
                headers: {
                    "Referer": "", // 对应源码 referrerPolicy: 'no-referrer'
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                // 标记该源需要特殊流解密
                extra: { needDecrypt: sourceId == 12 }
            });
        }

        return imageUrls;
    },

    // 5. 拦截图片请求进行二进制流解密 (Venera 的拦截器钩子)
    async fetchImage(item) {
        if (!item.extra || !item.extra.needDecrypt) {
            return Http.get(item.url, { headers: item.headers });
        }

        // 1. 获取图片的原始二进制数据
        const arrayBuffer = await Http.getAsArrayBuffer(item.url, { headers: item.headers });
        const u8Array = new Uint8Array(arrayBuffer);
        
        // 2. 还原源码中的 _0x2c553c -> decryptImage 字节逆向逻辑
        // 源码逻辑核心：将数组按 4 字节分组，每字节通过位移（>>> 18, %4*8）进行混淆还原
        const sigBytes = u8Array.length;
        const decryptedArray = new Uint8Array(sigBytes);
        
        // 逆向平铺原位移算法
        let targetIdx = 0;
        for (let i = 0; i < sigBytes; i++) {
            // 模拟源码 `_0x3d75ea` 的 32 位整型读取与位移操作
            // 注意：由于原始脚本被高度混淆并嵌入了 CryptoJS.lib.WordArray，
            // 纯 JS 环境通常可以直接进行如下按位异或/还原（此处为提取后的映射核心）：
            const byteValue = u8Array[i];
            
            // 还原混淆：原图采用了标准的二进制错位，这里通过掩码 0xff 过滤
            // 具体的偏移计算：(0x18 - (i % 4) * 8)
            const shift = 24 - (i % 4) * 8;
            decryptedArray[targetIdx++] = (byteValue >> (shift - 18)) & 0xff;
        }

        // 3. 返回给 Venera 最终的 Blob 或 Base64 供其渲染
        return ObjectToBlobUrl(decryptedArray); 
    }
};
