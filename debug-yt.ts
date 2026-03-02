async function run() {
  const query = encodeURIComponent('林宥嘉 浪費 official');
  const url = `https://www.youtube.com/results?search_query=${query}`;
  console.log('Fetching:', url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
    });
    console.log('Status:', res.status);
    console.log('Headers:', [...res.headers.entries()]);
    // const text = await res.text();
    // console.log('Text length:', text.length);
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
