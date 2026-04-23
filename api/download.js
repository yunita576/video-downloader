export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi.' });
  if (!/tiktok\.com/i.test(url)) return res.status(400).json({ error: 'Hanya menerima link TikTok.' });

  // ========== tikwm.com (Primary - paling stabil) ==========
  try {
    var resp = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url) + '&hd=1');
    var data = await resp.json();
    if (data.code === 0 && data.data) {
      var d = data.data;
      var r = { success: true, platform: 'tiktok', title: d.title || 'TikTok Video', thumbnail: d.cover || null, downloads: [] };
      if (d.play) r.downloads.push({ quality: 'HD No Watermark', type: 'video', url: 'https://www.tikwm.com' + d.play });
      if (d.hdplay) r.downloads.push({ quality: 'Full HD No Watermark', type: 'video', url: 'https://www.tikwm.com' + d.hdplay });
      if (d.music) r.downloads.push({ quality: 'MP3 Audio', type: 'audio', url: 'https://www.tikwm.com' + d.music });
      return res.status(200).json(r);
    }
  } catch (e) {}

  // ========== Fallback: ssstik.io ==========
  try {
    var resp2 = await fetch('https://ssstik.io/api/ajax/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'q=' + encodeURIComponent(url)
    });
    var data2 = await resp2.json();
    if (data2 && data2.id) {
      var resp3 = await fetch('https://ssstik.io/api/ajax/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'id=' + data2.id
      });
      var data3 = await resp3.json();
      if (data3 && (data3.hdplay || data3.sdplay)) {
        var r = { success: true, platform: 'tiktok', title: data2.desc || 'TikTok Video', thumbnail: data2.cover || null, downloads: [] };
        if (data3.hdplay) r.downloads.push({ quality: 'HD No Watermark', type: 'video', url: data3.hdplay });
        if (data3.sdplay) r.downloads.push({ quality: 'SD No Watermark', type: 'video', url: data3.sdplay });
        if (data3.music) r.downloads.push({ quality: 'MP3 Audio', type: 'audio', url: data3.music });
        return res.status(200).json(r);
      }
    }
  } catch (e) {}

  return res.status(500).json({ error: 'Gagal download video. Coba link lain atau coba lagi nanti.' });
}
