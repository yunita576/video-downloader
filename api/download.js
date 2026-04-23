export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });

  url = url.trim().replace(/\|$/, '').replace(/\s/g, '');

  let platform = 'unknown';
  const checks = [
    ['tiktok', /tiktok\.com|vt\.tiktok/i],
    ['youtube', /youtube\.com|youtu\.be/i],
    ['twitter', /twitter\.com|x\.com/i],
    ['facebook', /facebook\.com|fb\.watch|fb\.com\/watch/i],
    ['instagram', /instagram\.com/i],
  ];
  for (const [n, r] of checks) { if (r.test(url)) { platform = n; break; } }
  if (platform === 'unknown') return res.status(400).json({ error: 'Platform tidak didukung.' });

  // ==========================================
  //  TIKTOK → tikwm.com (100% STABIL)
  // ==========================================
  if (platform === 'tiktok') {
    try {
      const resp = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
      const data = await resp.json();
      if (data.code === 0 && data.data) {
        const d = data.data;
        const base = 'https://www.tikwm.com';
        const fix = (u) => u && !u.startsWith('http') ? base + u : u;
        const r = {
          success: true, platform: 'tiktok',
          title: d.title || 'TikTok Video',
          thumbnail: fix(d.origin_cover) || fix(d.cover) || null,
          downloads: []
        };
        if (d.hdplay) r.downloads.push({ quality: 'HD No Watermark', type: 'video', url: fix(d.hdplay) });
        if (d.play) r.downloads.push({ quality: 'SD', type: 'video', url: fix(d.play) });
        if (d.music) r.downloads.push({ quality: 'MP3 Audio', type: 'audio', url: fix(d.music) });
        if (r.downloads.length > 0) return res.status(200).json(r);
      }
    } catch (e) { console.log('tikwm fail:', e.message); }
  }

  // ==========================================
  //  TWITTER/X → api.fxtwitter.com (100% STABIL)
  // ==========================================
  if (platform === 'twitter') {
    try {
      const match = url.match(/(?:twitter|x)\.com\/(?:#!\/)?(\w+)\/status\/(\d+)/i);
      if (match) {
        const user = match[1];
        const id = match[2];
        const resp = await fetch('https://api.fxtwitter.com/' + user + '/status/' + id);
        const data = await resp.json();
        const tweet = data.tweet;
        if (tweet && tweet.media && tweet.media.all) {
          const r = {
            success: true, platform: 'twitter',
            title: (tweet.text || 'Twitter Video').substring(0, 100),
            thumbnail: null,
            downloads: []
          };
          for (const media of tweet.media.all) {
            if (media.type === 'video' || media.type === 'animated_gif') {
              if (media.thumbnail_url) r.thumbnail = media.thumbnail_url;
              if (media.variants && media.variants.length > 0) {
                const videos = media.variants.filter(v => v.content_type === 'video/mp4');
                videos.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                for (let i = 0; i < videos.length; i++) {
                  const label = i === 0 ? 'HD' : (i === 1 ? 'SD' : 'Low');
                  if (media.type === 'animated_gif') {
                    r.downloads.push({ quality: 'GIF', type: 'video', url: videos[i].url });
                  } else {
                    r.downloads.push({ quality: label, type: 'video', url: videos[i].url });
                  }
                }
              }
            } else if (media.type === 'photo') {
              r.downloads.push({ quality: 'Image', type: 'video', url: media.url });
            }
          }
          if (r.downloads.length > 0) return res.status(200).json(r);
        }
      }
    } catch (e) { console.log('fxtwitter fail:', e.message); }
  }

  // ==========================================
  //  COBALT API (YouTube, FB, IG + Fallback)
  // ==========================================
  const cobaltKey = process.env.COBALT_API_KEY;
  if (cobaltKey) {
    try {
      const resp = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + cobaltKey
        },
        body: JSON.stringify({ url: url, downloadMode: 'auto', filenameStyle: 'pretty' })
      });
      const data = await resp.json();
      if (data.status !== 'error') {
        const r = { success: true, platform: platform, title: data.filename || 'Video', thumbnail: data.thumbnail || null, downloads: [] };
        if (data.status === 'tunnel' || data.status === 'redirect') {
          r.downloads.push({ quality: 'Auto', type: 'video', url: data.url });
        } else if (data.status === 'picker' && data.picker) {
          for (let i = 0; i < data.picker.length; i++) {
            const it = data.picker[i];
            r.downloads.push({ quality: it.type === 'photo' ? 'Image' : (it.quality || 'Auto'), type: it.type || 'video', url: it.url });
          }
        }
        if (data.audio) r.downloads.push({ quality: 'Audio MP3', type: 'audio', url: data.audio });
        if (r.downloads.length > 0) return res.status(200).json(r);
      }
    } catch (e) { console.log('cobalt fail:', e.message); }
  }

  // ==========================================
  //  RYZENDESU (FALLBACK SEMUA)
  // ==========================================
  try {
    const apiMap = {
      tiktok: 'https://api.ryzendesu.vip/api/downloader/tiktok',
      youtube: 'https://api.ryzendesu.vip/api/downloader/ytdl',
      twitter: 'https://api.ryzendesu.vip/api/downloader/twitter',
      facebook: 'https://api.ryzendesu.vip/api/downloader/facebook',
      instagram: 'https://api.ryzendesu.vip/api/downloader/instagram',
    };
    const apiUrl = apiMap[platform];
    if (apiUrl) {
      const resp = await fetch(apiUrl + '?url=' + encodeURIComponent(url));
      const data = await resp.json();
      const d = data.data || data.result || data;
      const r = { success: true, platform: platform, title: 'Video', thumbnail: null, downloads: [] };
      if (platform === 'youtube') {
        r.title = d.title || 'YouTube'; r.thumbnail = d.thumb || null;
        if (d.vid) for (let i = 0; i < d.vid.length; i++) r.downloads.push({ quality: d.vid[i].quality || 'Auto', type: 'video', url: d.vid[i].download });
        if (d.mp3) for (let j = 0; j < d.mp3.length; j++) r.downloads.push({ quality: d.mp3[j].quality || 'Audio', type: 'audio', url: d.mp3[j].download });
      } else if (platform === 'facebook') {
        r.title = d.title || 'Facebook'; r.thumbnail = d.thumbnail || null;
        if (d.hd) r.downloads.push({ quality: 'HD', type: 'video', url: d.hd });
        if (d.sd) r.downloads.push({ quality: 'SD', type: 'video', url: d.sd });
      } else if (platform === 'instagram') {
        r.title = d.title || d.desc || 'Instagram'; r.thumbnail = d.thumbnail || null;
        const urls = d.url || d.medias || [];
        const arr = Array.isArray(urls) ? urls : [urls];
        for (let k = 0; k < arr.length; k++) {
          const u = arr[k].url || arr[k].download || arr[k];
          if (typeof u === 'string') r.downloads.push({ quality: arr[k].type === 'image' ? 'Image' : 'Auto', type: arr[k].type || 'video', url: u });
        }
      } else if (platform === 'tiktok') {
        r.title = d.desc || d.title || 'TikTok'; r.thumbnail = d.thumbnail || d.cover || null;
        if (d.video) r.downloads.push({ quality: 'HD No WM', type: 'video', url: d.video });
        if (d.music) r.downloads.push({ quality: 'MP3', type: 'audio', url: d.music });
      } else if (platform === 'twitter') {
        r.title = d.desc || 'Twitter';
        if (d.hd) r.downloads.push({ quality: 'HD', type: 'video', url: d.hd });
        if (d.sd) r.downloads.push({ quality: 'SD', type: 'video', url: d.sd });
      }
      if (r.downloads.length > 0) return res.status(200).json(r);
    }
  } catch (e) { console.log('ryzen fail:', e.message); }

  // ==========================================
  //  ERROR FINAL
  // ==========================================
  if (platform === 'youtube' || platform === 'facebook' || platform === 'instagram') {
    return res.status(500).json({
      error: 'API utama belum dikonfigurasi untuk ' + platform.toUpperCase() + '. Tambahkan COBALT_API_KEY di Vercel (gratis di cobalt.tools). TikTok & Twitter sudah otomatis berfungsi tanpa key.'
    });
  }
  return res.status(500).json({ error: 'Semua API gagal. Coba lagi nanti.' });
}
