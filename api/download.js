export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });

  let platform = 'unknown';
  const checks = [
    ['tiktok', /tiktok\.com/i],
    ['youtube', /youtube\.com|youtu\.be/i],
    ['twitter', /twitter\.com|x\.com/i],
    ['facebook', /facebook\.com|fb\.watch|fb\.com\/watch/i],
    ['instagram', /instagram\.com/i],
  ];
  for (const [n, r] of checks) { if (r.test(url)) { platform = n; break; } }
  if (platform === 'unknown') return res.status(400).json({ error: 'Platform tidak didukung.' });

  const cobaltKey = process.env.COBALT_API_KEY;
  if (cobaltKey) {
    try {
      const resp = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + cobaltKey },
        body: JSON.stringify({ url: url, downloadMode: 'auto', filenameStyle: 'pretty' }),
      });
      const data = await resp.json();
      if (data.status !== 'error') return res.status(200).json(normCobalt(data, platform));
    } catch (e) { console.log('Cobalt fail, fallback'); }
  }

  try {
    const apiMap = {
      tiktok: 'https://api.ryzendesu.vip/api/downloader/tiktok',
      youtube: 'https://api.ryzendesu.vip/api/downloader/ytdl',
      twitter: 'https://api.ryzendesu.vip/api/downloader/twitter',
      facebook: 'https://api.ryzendesu.vip/api/downloader/facebook',
      instagram: 'https://api.ryzendesu.vip/api/downloader/instagram',
    };
    const apiUrl = apiMap[platform];
    if (!apiUrl) return res.status(400).json({ error: 'Platform tidak didukung' });
    const resp = await fetch(apiUrl + '?url=' + encodeURIComponent(url));
    const data = await resp.json();
    if (data.status && data.status !== 200 && !data.data) return res.status(400).json({ error: data.message || 'Gagal' });
    return res.status(200).json(normRyzen(data, platform));
  } catch (e) {
    return res.status(500).json({ error: 'Semua API gagal. Coba lagi.' });
  }
}

function normCobalt(data, platform) {
  var r = { success: true, platform: platform, title: data.filename || 'Video', thumbnail: data.thumbnail || null, downloads: [] };
  if (data.status === 'tunnel' || data.status === 'redirect') { r.downloads.push({ quality: 'Auto', type: 'video', url: data.url }); }
  else if (data.status === 'picker' && data.picker) { for (var i = 0; i < data.picker.length; i++) { var it = data.picker[i]; r.downloads.push({ quality: it.type === 'photo' ? 'Image' : (it.quality || 'Auto'), type: it.type || 'video', url: it.url }); } }
  if (data.audio) r.downloads.push({ quality: 'Audio', type: 'audio', url: data.audio });
  return r;
}

function normRyzen(data, platform) {
  var r = { success: true, platform: platform, title: 'Video', thumbnail: null, downloads: [] };
  var d = data.data || data.result || data;
  if (platform === 'tiktok') {
    r.title = d.desc || d.title || 'TikTok'; r.thumbnail = d.thumbnail || d.cover || null;
    if (d.video) r.downloads.push({ quality: 'HD No WM', type: 'video', url: d.video });
    if (d.video_hd) r.downloads.push({ quality: 'Full HD', type: 'video', url: d.video_hd });
    if (d.music) r.downloads.push({ quality: 'MP3', type: 'audio', url: d.music });
  } else if (platform === 'youtube') {
    r.title = d.title || 'YouTube'; r.thumbnail = d.thumb || null;
    if (d.vid) for (var i = 0; i < d.vid.length; i++) r.downloads.push({ quality: d.vid[i].quality || 'Auto', type: 'video', url: d.vid[i].download });
    if (d.mp3) for (var j = 0; j < d.mp3.length; j++) r.downloads.push({ quality: d.mp3[j].quality || 'Audio', type: 'audio', url: d.mp3[j].download });
  } else if (platform === 'twitter') {
    r.title = d.desc || 'Twitter'; if (d.hd) r.downloads.push({ quality: 'HD', type: 'video', url: d.hd });
    if (d.sd) r.downloads.push({ quality: 'SD', type: 'video', url: d.sd });
  } else if (platform === 'facebook') {
    r.title = d.title || 'Facebook'; if (d.hd) r.downloads.push({ quality: 'HD', type: 'video', url: d.hd });
    if (d.sd) r.downloads.push({ quality: 'SD', type: 'video', url: d.sd });
  } else if (platform === 'instagram') {
    r.title = d.title || d.desc || 'Instagram'; var urls = d.url || d.medias || [];
    var arr = Array.isArray(urls) ? urls : [urls];
    for (var k = 0; k < arr.length; k++) { var u = arr[k].url || arr[k].download || arr[k]; if (typeof u === 'string') r.downloads.push({ quality: arr[k].type === 'image' ? 'Image' : 'Auto', type: arr[k].type || 'video', url: u }); }
  }
  if (r.downloads.length === 0) return { success: false, error: 'Tidak ada link download.' };
  return r;
}
