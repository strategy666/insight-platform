// ====================================================================
// 飞书空间扫描器 - Browser Console 脚本
// ====================================================================
// 使用方法：
//   1. 启动本地接收 server: python3 /tmp/recv_feishu.py
//   2. 在 Chrome 中打开 https://my.feishu.cn （确认已登录）
//   3. 打开 DevTools (F12) → Console
//   4. 粘贴本文件全部内容回车
//   5. 等 30 秒，看到 "✅ POST status: 200 OK"
//   6. 终端运行 python3 insight-platform/tools/sync_feishu_drive.py
// ====================================================================

(async function scanFeishuDrive() {
  const TYPE_MAP = {
    0:'folder', 2:'doc', 3:'sheet', 8:'mindnote', 11:'bitable',
    12:'folder', 16:'slides', 22:'docx', 24:'wiki', 30:'mindmap', 44:'mindnote2'
  };
  const result = { fetched_at: new Date().toISOString(), all_files: {} };
  
  function addFiles(data, source) {
    const nodes = data?.entities?.nodes || {};
    const list = data?.node_list || [];
    let added = 0;
    for (const tok of list) {
      const f = nodes[tok];
      if (!f) continue;
      const key = f.obj_token || f.token || tok;
      if (!result.all_files[key]) {
        result.all_files[key] = {
          token: key,
          name: f.name || '',
          type: f.type,
          type_name: TYPE_MAP[f.type] || String(f.type),
          url: f.url || '',
          owner_id: f.owner_id,
          edit_time: f.edit_time,
          create_time: f.create_time,
          activity_time: f.activity_time,
          is_external: f?.extra?.is_external,
          wiki_space_name: f?.extra?.wiki_space_name,
          biz_type: f?.extra?.biz_type,
          sources: [source]
        };
        added++;
      } else if (!result.all_files[key].sources.includes(source)) {
        result.all_files[key].sources.push(source);
      }
    }
    return added;
  }

  console.log('🚀 开始扫描飞书空间...');
  
  // ① 我的空间-文件
  let r = await fetch('/space/api/explorer/v3/my_space/obj/?asc=0&rank=3&length=200', {credentials:'include'}).then(x=>x.json());
  console.log('① 我的空间-文件 +' + addFiles(r.data, 'my_space'));
  
  // ② 我的空间-文件夹
  r = await fetch('/space/api/explorer/v3/my_space/folder/?asc=0&rank=3&length=200', {credentials:'include'}).then(x=>x.json());
  console.log('② 我的空间-文件夹 +' + addFiles(r.data, 'my_space_folder'));
  
  // ③ 共享给我
  r = await fetch('/space/api/explorer/v2/share/folder/list/?asc=0&rank=3&hidden=0&length=200', {credentials:'include'}).then(x=>x.json());
  console.log('③ 共享给我 +' + addFiles(r.data, 'shared'));
  
  // ④ 收藏
  try {
    r = await fetch('/space/api/explorer/v3/pin/list/?filter_folder=false', {credentials:'include'}).then(x=>x.json());
    console.log('④ 收藏 +' + addFiles(r.data, 'pin'));
  } catch(e) { console.log('④ 收藏: 跳过'); }
  
  // ⑤ 最近浏览（分页）
  console.log('⑤ 最近浏览（分页）...');
  let lastLabel = null;
  const recentBase = '/space/api/explorer/recent/list/?length=100&obj_type=2&obj_type=22&obj_type=44&obj_type=3&obj_type=30&obj_type=8&obj_type=11&obj_type=12&obj_type=84&obj_type=123&obj_type=124&type_opt=1&rank=6';
  for (let i = 0; i < 20; i++) {
    const url = lastLabel ? recentBase + '&last_label=' + encodeURIComponent(lastLabel) : recentBase;
    try { r = await fetch(url, {credentials:'include'}).then(x=>x.json()); } catch(e) { break; }
    const added = addFiles(r.data, 'recent');
    console.log(`   page ${i+1}: +${added} (total ${Object.keys(result.all_files).length})`);
    if (!r?.data?.has_more) break;
    lastLabel = r.data.last_label;
    if (!lastLabel) break;
    await new Promise(s => setTimeout(s, 150));
  }
  
  // ⑥ 共享文件夹递归
  console.log('⑥ 共享文件夹递归...');
  const shareFolders = Object.values(result.all_files).filter(f => f.sources.includes('shared') && (f.type === 0 || f.type === 12));
  for (const sf of shareFolders) {
    try {
      r = await fetch(`/space/api/explorer/v3/children/list/?asc=1&rank=5&token=${sf.token}&length=200`, {credentials:'include'}).then(x=>x.json());
      console.log(`   ${sf.name}: +${addFiles(r.data, 'shared_child')}`);
    } catch(e) {}
  }
  
  // ⑦ 我的空间-文件夹递归
  console.log('⑦ 我的空间-文件夹递归...');
  const myFolders = Object.values(result.all_files).filter(f => f.sources.includes('my_space_folder'));
  for (const sf of myFolders) {
    try {
      r = await fetch(`/space/api/explorer/v3/children/list/?asc=1&rank=5&token=${sf.token}&length=200`, {credentials:'include'}).then(x=>x.json());
      console.log(`   ${sf.name}: +${addFiles(r.data, 'my_space_child')}`);
    } catch(e) {}
  }
  
  const arr = Object.values(result.all_files);
  console.log('\n=========================================');
  console.log(`📊 共扫描到 ${arr.length} 条飞书文档`);
  console.log('=========================================');
  
  // POST 到本地接收 server
  try {
    const resp = await fetch('http://127.0.0.1:9991/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(result)
    });
    console.log(`✅ POST status: ${resp.status} ${await resp.text()}`);
    console.log('💡 下一步：终端运行 python3 insight-platform/tools/sync_feishu_drive.py');
  } catch(e) {
    console.log(`❌ POST 到 localhost:9991 失败: ${e.message}`);
    console.log('   请先在终端启动: python3 /tmp/recv_feishu.py');
    console.log('   或者复制下面这段 JSON 自行保存到 ~/Downloads/feishu_full_scan.json：');
    console.log(JSON.stringify(result));
  }
  
  window._lastFeishuScan = result;
  return arr.length;
})();
