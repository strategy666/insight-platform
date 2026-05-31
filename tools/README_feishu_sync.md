# 飞书空间同步使用指南

## 一句话流程

```
Chrome 已登录 my.feishu.cn → Console 跑扫描脚本 → 本地 server 接收 → Python 合并入 portal
```

## 三步操作

### Step 1 · 启动本地接收 server（终端）
```bash
cd insight-platform
python3 tools/recv_feishu_server.py
# 监听 http://127.0.0.1:9991/
# 让它一直跑，下一步在浏览器跑完后再回来 Ctrl+C
```

### Step 2 · 浏览器扫描（Chrome）
1. 打开 https://my.feishu.cn，确认右上角是登录态
2. 按 `F12` 打开 DevTools → 切到 `Console` 面板
3. 复制 `tools/scan_browser_script.js` 全部内容，粘贴进 Console，回车
4. 等 30 秒看到 `✅ POST status: 200 OK`，说明数据已传到本地

### Step 3 · 合并入 portal（终端）
```bash
python3 tools/sync_feishu_drive.py
# 会读 ~/Downloads/feishu_full_scan.json
# 合并 → insight-platform/assets/data/feishu_docs.json (v4.0)
```

## 当前数据规模

| 维度 | 数量 |
|------|------|
| 总文档 | **517** 条 |
| 字节对外（bytedance.larkoffice）| 431 |
| 个人空间 my.feishu.cn | 35 |
| 其他飞书租户 | 18 |
| 共享给我子文档（联想 Run Rate）| 18 |
| 文档类型 | docx 416 / slides 63 / sheet 29 / mindnote 8 |

## 自动化建议（可选）

把 Step 3 加入定时任务，每天同步一次：
```bash
# crontab -e 
0 9 * * * cd /Users/jiayi/Desktop/Work/生服/trae/insight-platform && python3 tools/sync_feishu_drive.py >> /tmp/feishu_sync.log 2>&1
```

Step 1+2 还是要手动（浏览器扫描必须有人触发，Chrome SSO Cookie 无法 headless）。

## 后续扩展

- [ ] 抓正文：调 `https://my.feishu.cn/document/api/v1/docx/{token}/content` 拉每篇 docx 正文，让 portal 检索能匹配内容关键词
- [ ] 飞书 wiki 知识库递归遍历：需要带 `space_id`
- [ ] 加入用户的飞书"知识库"列表（已有 API：`/space/api/wiki/v2/space/my_library/get/`）
- [ ] 自动去重：用 token 而非 URL（处理同一文档多次访问的情况）
