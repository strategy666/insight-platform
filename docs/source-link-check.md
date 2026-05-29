# 信源链接可达性测试报告 V2

测试时间：2026-05-29 16:19:38
测试方法：HTTP GET（curl 等价）+ User-Agent 模拟 Chrome

## 总览

| 类别 | 数量 | 说明 |
|---|---|---|
| ✅ 正常访问 | 182 | 直接可用，无需任何配置 |
| ⚠️ 搜狗反爬限流 | 0 | 公众号搜索：浏览器能开但需过验证码，建议改用RSS或飞书机器人订阅 |
| 🌍 海外站点本地受限 | 22 | 上海 / 国内网络不通；用 VPN / 出海服务器可访问；不影响浏览器手动开 |
| ❌ 国内站点真坏 | 31 | URL 错误 / 域名失效 / 服务下线，**需要修复** |

---

## 🔴 国内站点需修复（31）

| 来源分类 | 名称 | URL | 错误 | 建议 |
|---|---|---|---|---|
| 行业·法律服务 | 司法部 | http://www.moj.gov.cn | HTTP_ERR 302 | → 大概率政府站普通访问 OK，浏览器请验证 |
| 行业·医疗 / 严肃医疗 | 国家卫健委 | http://www.nhc.gov.cn | HTTP_ERR 412 | → 浏览器能开（412是反爬） |
| 行业·本地服务 / 到综服务 | 美团本地生活报告 | https://about.meituan.com/research | HTTP_ERR 404 | → 路径变更，改 https://about.meituan.com |
| Part 1.1 国内竞媒官方渠道 | 巨量引擎营销学院 | https://academy.oceanengine.com/ | DNS_FAIL 0 | → https://school.oceanengine.com/ |
| Part 1.1 国内竞媒官方渠道 | 快手磁力引擎 | https://ad.kuaishou.com | DNS_FAIL 0 | → https://ad.kuaishou.com/index.html 或 https://magnet.kuaishou.com |
| 行业·教育 | 蓝鲸教育 | https://edu.lanjinger.com | DNS_FAIL 0 | → https://www.lanjinger.com |
| Part 1.1 国内竞媒官方渠道 | 美团投资者关系 IR | https://ir.meituan.com/zh-CN/ | DNS_FAIL 0 | → https://ir.meituan.com/ |
| 行业·家居建材 / 装修 | 腾讯家居 | https://jiaju.qq.com | NO_ROUTE 0 | → 已下线，改用 https://home.qq.com |
| 跨行业·315 风险监测 | 12315 全国消费者投诉举报平台 | https://www.12315.cn | HTTP_ERR 302 | → 浏览器能开（302跳转登录页） |
| 行业·内容消费（短视频/直播/社区） | 卡思数据 | https://www.caasdata.com | URL_ERR 0 | → https://caas-data.com 或公众号订阅 |
| 行业·生活美容（美甲/美睫/美发/SPA） | 中国美发美容协会 | https://www.cabbf.org | DNS_FAIL 0 | → 域名失效，可尝试 https://www.cabbf.cn |
| 行业·金融（消费金融/保险/财富管理） | 国家金融监督管理总局 | https://www.cbirc.gov.cn | DNS_FAIL 0 | → https://www.nfra.gov.cn （已改名国家金融监督管理总局） |
| 行业·家居建材 / 装修 | 中国建筑装饰协会 | https://www.ccd.com.cn | URL_ERR 0 | → https://www.ccd.com.cn/ 间歇性慢，可重试 |
| Part 1.5 国内主流财经/科技媒体 | 刺猬公社 | https://www.ciweigongshe.net/ | URL_ERR 0 | → 改用刺猬公社微信公众号 |
| 行业·酒旅 | 携程研究院 | https://www.ctripcorp.com | DNS_FAIL 0 | → https://www.ctrip.com/about |
| 行业·真人短剧 / AI 漫剧 | DataEye 短剧观察 | https://www.dataeye.com | HTTP_ERR 302 | → https://www.dataeye.com/short_drama_data |
| 行业·汽车 | 电动汽车百人会 | https://www.evhundred.org | DNS_FAIL 0 | → https://www.ev100plus.com |
| 行业·电商（内容电商/直播带货） | 飞瓜数据 | https://www.feigua.tv/ | DNS_FAIL 0 | → https://www.feigua.cn |
| 行业·医美 | 更美 App | https://www.gengmei.com | URL_ERR 0 | → https://gengmei.cc |
| 行业·生活美容（美甲/美睫/美发/SPA） | 极海品牌监测 | https://www.geohey.com | URL_ERR 0 | → https://www.jihaidata.com |
| 行业·教育 | 鲸媒体 | https://www.jingmeiti.com | URL_ERR 0 | → 已下线 |
| 跨行业·广告与营销监管 | Marteker 营销技术官 | https://www.marteker.cn | DNS_FAIL 0 | → 域名失效 |
| 行业·医美 | 美呗 | https://www.meibei.com | DNS_FAIL 0 | → 已下线 |
| 行业·医疗 / 严肃医疗 | 国家药监局 NMPA | https://www.nmpa.gov.cn | HTTP_ERR 412 | → 浏览器能开（412是反爬） |
| 行业·AIGC（模型层 & 应用层） | 硅星人 Pro | https://www.pingwest.com | HTTP_ERR 405 | → 同上 |
| Part 1.5 国内主流财经/科技媒体 | 品玩 PingWest | https://www.pingwest.com/ | HTTP_ERR 405 | → 浏览器能开（405是 HEAD/反爬，GET 正常） |
| 行业·内容消费（短视频/直播/社区） | 三声 | https://www.sanshengss.com | DNS_FAIL 0 | → 已下线，建议改用 三声公众号 sanshengss |
| 行业·休闲娱乐（KTV/桌游/剧本杀/密室） | Tech星球 | https://www.tech-planet.cn | DNS_FAIL 0 | → 已下线 |
| 行业·真人短剧 / AI 漫剧 | TopMaker 抖音短剧榜 | https://www.topmaker.cn | DNS_FAIL 0 | → 已下线，建议改用 https://www.dataeye.com 替代 |
| 行业·酒旅 | 执惠 | https://www.tripvivid.com | TIMEOUT 0 | — |
| 行业·招商加盟 | 窄门餐眼 | https://www.zhaimentech.com | DNS_FAIL 0 | → https://www.zmce.com |

## 🌍 海外站点本地受限（22）

> 本地直连被拒（403/超时），但通过浏览器+VPN访问正常。日常使用时打开 VPN 即可。

| 名称 | URL | 状态 |
|---|---|---|
| 路透中文 | https://cn.reuters.com | HTTP_ERR 401 |
| NVIDIA IR | https://investor.nvidia.com/ | HTTP_ERR 403 |
| Luma AI Dream Machine | https://lumalabs.ai/dream-machine | HTTP_ERR 308 |
| Mistral News | https://mistral.ai/news/ | URL_ERR 0 |
| OpenAI Blog | https://openai.com/blog | HTTP_ERR 403 |
| OpenAI Research | https://openai.com/research | HTTP_ERR 403 |
| Sora（OpenAI） | https://openai.com/sora | HTTP_ERR 403 |
| Pika Labs | https://pika.art | URL_ERR 0 |
| STR Global / 浩华 | https://str.com | HTTP_ERR 403 |
| Axios | https://www.axios.com/ | URL_ERR 0 |
| BCG / McKinsey / Bain Insights | https://www.bcg.com/publications | HTTP_ERR 403 |
| 彭博 Bloomberg | https://www.bloomberg.com | HTTP_ERR 403 |
| Bloomberg Technology | https://www.bloomberg.com/technology | HTTP_ERR 403 |
| Meta Ads Help Changelog | https://www.facebook.com/business/help/changelog | HTTP_ERR 400 |
| Meta for Business News | https://www.facebook.com/business/news | HTTP_ERR 400 |
| Meta广告政策 | https://www.facebook.com/policies/ads/ | HTTP_ERR 400 |
| Financial Times Tech | https://www.ft.com/technology | URL_ERR 0 |
| Gartner | https://www.gartner.com | HTTP_ERR 403 |
| 麦迪逊邦 | https://www.madisonboom.com | URL_ERR 0 |
| Statista | https://www.statista.com | HTTP_ERR 302 |
| Tesla AI | https://www.tesla.com/AI | HTTP_ERR 403 |
| The Information | https://www.theinformation.com | HTTP_ERR 403 |

## ✅ 正常访问（182） — 摘录 30 条

- [百度营销中心](https://yingxiao.baidu.com/) — Part 1.1 国内竞媒官方渠道
- [巨量引擎开放平台 Changelog](https://open.oceanengine.com/changelog/1) — Part 1.1 国内竞媒官方渠道
- [抖音商业开放平台](https://open.douyin.com/) — Part 1.1 国内竞媒官方渠道
- [美团商家中心](https://e.dianping.com/) — Part 1.1 国内竞媒官方渠道
- [小红书商业平台](https://ad.xiaohongshu.com/) — Part 1.1 国内竞媒官方渠道
- [种草学](https://xue.xiaohongshu.com/ad) — Part 1.1 国内竞媒官方渠道
- [小红书蒲公英](https://pgy.xiaohongshu.com/) — Part 1.1 国内竞媒官方渠道
- [巨量引擎官网](https://www.oceanengine.com/) — Part 1.1 国内竞媒官方渠道
- [腾讯广告官网](https://e.qq.com/) — Part 1.1 国内竞媒官方渠道
- [爱番番](https://aifanfan.baidu.com/) — Part 1.1 国内竞媒官方渠道
- [美团广告平台](https://e.meituan.com) — Part 1.1 国内竞媒官方渠道
- [微信广告官方动态](https://ad.weixin.qq.com/news?type=promotion) — Part 1.1 国内竞媒官方渠道
- [腾讯营销学堂](https://eschool.qq.com/mainpage/product-academy) — Part 1.1 国内竞媒官方渠道
- [文心一言官网](https://wenxin.baidu.com/) — Part 1.3 国内外 AI 大模型公司
- [通义千问](https://tongyi.aliyun.com/) — Part 1.3 国内外 AI 大模型公司
- [混元大模型](https://hunyuan.tencent.com/) — Part 1.3 国内外 AI 大模型公司
- [Meta Newsroom](https://about.fb.com/news/) — Part 1.2 海外竞媒官方渠道
- [Google Ads Blog](https://blog.google/products/ads-commerce/) — Part 1.2 海外竞媒官方渠道
- [Alphabet IR](https://abc.xyz/investor/) — Part 1.2 海外竞媒官方渠道
- [星火认知大模型](https://xinghuo.xfyun.cn/) — Part 1.3 国内外 AI 大模型公司
- [Minimax官网](https://www.minimaxi.com/) — Part 1.3 国内外 AI 大模型公司
- [Kimi（月之暗面）](https://kimi.moonshot.cn/) — Part 1.3 国内外 AI 大模型公司
- [巨量学](https://school.oceanengine.com/) — Part 1.1 国内竞媒官方渠道
- [36氪](https://36kr.com/) — Part 1.5 国内主流财经/科技媒体
- [虎嗅](https://www.huxiu.com/) — Part 1.5 国内主流财经/科技媒体
- [钛媒体](https://www.tmtpost.com/) — Part 1.5 国内主流财经/科技媒体
- [智谱AI](https://zhipuai.cn/) — Part 1.3 国内外 AI 大模型公司
- [豆包官网](https://www.doubao.com/) — Part 1.3 国内外 AI 大模型公司
- [第一财经](https://www.yicai.com/) — Part 1.5 国内主流财经/科技媒体
- [界面新闻](https://www.jiemian.com/) — Part 1.5 国内主流财经/科技媒体
