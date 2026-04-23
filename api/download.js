export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi.' });
  if (!/tiktok\.com/i.test(url)) return res.status(400).json({ error: 'Hanya menerima link TikTok.' });

  function fixUrl(u) {
    if (!u) return null;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    return 'https://www.tikwm.com' + u;
  }

  // ========== tikwm.com ==========
  try {
    var resp = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url) + '&hd=1');
    var data = await resp.json();
    if (data.code === 0 && data.data) {
      var d = data.data;
      var r = { success: true, platform: 'tiktok', title: d.title || 'TikTok Video', thumbnail: fixUrl(d.cover), downloads: [] };
      var hd = fixUrl(d.hdplay);
      var sd = fixUrl(d.play);
      var mp3 = fixUrl(d.music);
      if (hd) r.downloads.push({ quality: 'Full HD No Watermark', type: 'video', url: hd });
      if (sd) r.downloads.push({ quality: 'HD No Watermark', type: 'video', url: sd });
      if (mp3) r.downloads.push({ quality: 'MP3 Audio', type: 'audio', url: mp3 });
      if (r.downloads.length === 0) return res.status(400).json({ error: 'Tidak ada link download.' });
      return res.status(200).json(r);
    }
  } catch (e) {
    console.error('tikwm error:', e);
  }

  // ========== ssstik.io fallback ==========
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
      if (data3) {
        var r = { success: true, platform: 'tiktok', title: data2.desc || 'TikTok Video', thumbnail: data2.cover || null, downloads: [] };
        if (data3.hdplay) r.downloads.push({ quality: 'HD No Watermark', type: 'video', url: data3.hdplay });
        if (data3.sdplay) r.downloads.push({ quality: 'SD No Watermark', type: 'video', url: data3.sdplay });
        if (data3.music) r.downloads.push({ quality: 'MP3 Audio', type: 'audio', url: data3.music });
        if (r.downloads.length === 0) return res.status(400).json({ error: 'Tidak ada link download.' });
        return res.status(200).json(r);
      }
    }
  } catch (e) {
    console.error('ssstik error:', e);
  }

  return res.status(500).json({ error: 'Gagal download. Coba link lain.' });
}
