#!/usr/bin/env node

// ============================================================================
// Follow Builders — Format Digest (No LLM Required)
// ============================================================================
// Reads the JSON output from prepare-digest.js via stdin and produces a
// clean, readable text digest suitable for Telegram delivery.
//
// Usage: node prepare-digest.js | node format-digest.js
// ============================================================================

function extractRole(bio) {
  if (!bio) return '';
  const firstLine = bio.split('\n')[0].trim();

  const patterns = [
    /^((?:co-)?(?:ceo|cto|coo|vp|president|founder|partner|director|head)\b[^.]{0,60})/i,
    /^([^.|\n]{5,80})/
  ];

  for (const p of patterns) {
    const m = firstLine.match(p);
    if (m) return m[1].trim();
  }
  return firstLine.substring(0, 80);
}

function cleanTweetText(text) {
  return text.replace(/https:\/\/t\.co\/\w+/g, '').trim();
}

function isSubstantive(tweet) {
  const cleaned = cleanTweetText(tweet.text);
  if (cleaned.length < 15 && !tweet.isQuote) return false;
  const fluff = /^(yup|lol|this|wow|nice|same|exactly|💯|🔥|👀|rt)\s*$/i;
  return !fluff.test(cleaned);
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDigest(data) {
  if (data.stats?.podcastEpisodes === 0 && data.stats?.xBuilders === 0) {
    return 'No new updates from your builders today. Check back tomorrow!';
  }

  const lines = [];
  lines.push(`AI Builders Digest — ${formatDate()}`);
  lines.push('');

  if (data.x?.length > 0) {
    lines.push('━━━ X / TWITTER ━━━');
    lines.push('');

    for (const builder of data.x) {
      const tweets = builder.tweets.filter(isSubstantive);
      if (tweets.length === 0) continue;

      const role = extractRole(builder.bio);
      const header = role
        ? `${builder.name} — ${role}`
        : builder.name;
      lines.push(`▸ ${header}`);
      lines.push('');

      for (const tweet of tweets) {
        const cleaned = cleanTweetText(tweet.text);
        if (cleaned) lines.push(cleaned);
        lines.push(tweet.url);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  if (data.podcasts?.length > 0) {
    lines.push('━━━ PODCASTS ━━━');
    lines.push('');

    for (const ep of data.podcasts) {
      lines.push(`▸ ${ep.name}: "${ep.title}"`);
      lines.push(ep.url);
      lines.push('');

      if (ep.transcript) {
        const words = ep.transcript.split(/\s+/);
        const preview = words.slice(0, 80).join(' ');
        lines.push(preview + '...');
        lines.push('');
      }
    }
  }

  lines.push('Reply to adjust your delivery settings or summary style.');

  return lines.join('\n');
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) {
    process.exit(0);
  }

  const data = JSON.parse(raw);
  console.log(formatDigest(data));
}

main().catch(err => {
  console.error('format-digest error:', err.message);
  process.exit(1);
});
