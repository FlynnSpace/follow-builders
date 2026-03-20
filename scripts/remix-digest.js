#!/usr/bin/env node

// ============================================================================
// Follow Builders — Remix Digest (LLM-Powered)
// ============================================================================
// Reads the JSON output from prepare-digest.js via stdin, calls an LLM API
// to generate a polished, summarized, and optionally bilingual digest.
//
// Supports: OpenAI API, Anthropic API (auto-detected via env vars)
//
// Env vars:
//   OPENAI_API_KEY      — use OpenAI (gpt-4o-mini by default)
//   ANTHROPIC_API_KEY   — use Anthropic (claude-sonnet by default)
//   LLM_MODEL           — override model name (optional)
//
// Usage: node prepare-digest.js | node remix-digest.js
// ============================================================================

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) process.exit(0);

  const data = JSON.parse(raw);

  if (data.stats?.podcastEpisodes === 0 && data.stats?.xBuilders === 0) {
    console.log('No new updates from your builders today. Check back tomorrow!');
    return;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    console.error('No LLM API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
    process.exit(1);
  }

  const systemPrompt = buildSystemPrompt(data);
  const userPrompt = buildUserPrompt(data);

  let result;
  if (anthropicKey) {
    result = await callAnthropic(anthropicKey, systemPrompt, userPrompt);
  } else {
    result = await callOpenAI(openaiKey, systemPrompt, userPrompt);
  }

  console.log(result);
}

function buildSystemPrompt(data) {
  const { prompts, config } = data;

  const langDirective = buildLanguageDirective(config.language);

  return [
    'You are an AI content curator generating a daily digest of AI builder activity.',
    '',
    `CRITICAL — OUTPUT LANGUAGE: ${langDirective}`,
    '',
    '## Tweet Summarization Rules',
    prompts.summarize_tweets,
    '',
    '## Podcast Summarization Rules',
    prompts.summarize_podcast,
    '',
    '## Digest Assembly Rules',
    prompts.digest_intro,
    '',
    '## Language & Translation Rules',
    prompts.translate,
    '',
    `REMINDER — You MUST output the digest in "${config.language}" mode. ${langDirective}`
  ].join('\n');
}

function buildLanguageDirective(language) {
  switch (language) {
    case 'bilingual':
      return 'BILINGUAL MODE. For EVERY builder and EVERY podcast, output the Chinese paragraph FIRST, then IMMEDIATELY output the English version below it, before moving to the next item. Chinese comes first, English second. Do NOT output all Chinese first then all English. Interleave them paragraph by paragraph.';
    case 'zh':
      return 'CHINESE ONLY. Output the entire digest in Chinese (simplified). Keep technical terms (AI, LLM, GPU, API, etc.) and proper nouns in English.';
    default:
      return 'ENGLISH ONLY. Output the entire digest in English.';
  }
}

function buildUserPrompt(data) {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const tweetBlocks = data.x.map(builder => {
    const tweets = builder.tweets.map(t =>
      `  - text: "${t.text}"\n    url: ${t.url}\n    likes: ${t.likes}\n    isQuote: ${t.isQuote}`
    ).join('\n');
    return `### ${builder.name} (handle: ${builder.handle})\nBio: ${builder.bio}\nTweets:\n${tweets}`;
  }).join('\n\n');

  const podcastBlocks = data.podcasts.map(ep => {
    return [
      `### ${ep.name}: "${ep.title}"`,
      `URL: ${ep.url}`,
      `Transcript:\n${ep.transcript}`
    ].join('\n');
  }).join('\n\n');

  const langExample = data.config.language === 'bilingual'
    ? `\n\nBILINGUAL FORMAT EXAMPLE (Chinese FIRST, then English):
▸ Builder Name — 职位
中文摘要段落在这里...
https://x.com/handle/status/123

Builder Name — role
English summary paragraph here...
https://x.com/handle/status/123

---

(Then next builder, same pattern. Chinese FIRST, English below, for EVERY builder and podcast.)\n`
    : '';

  return [
    `Generate the digest for: ${date}`,
    `Language mode: ${data.config.language}`,
    langExample,
    `## X/Twitter Content (${data.stats.xBuilders} builders, ${data.stats.totalTweets} tweets)`,
    '',
    tweetBlocks,
    '',
    `## Podcast Content (${data.stats.podcastEpisodes} episodes)`,
    '',
    podcastBlocks
  ].join('\n');
}

async function callOpenAI(apiKey, systemPrompt, userPrompt) {
  const model = process.env.LLM_MODEL || 'gpt-5.4-nano';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 16000
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const json = await res.json();
  return json.choices[0].message.content;
}

async function callAnthropic(apiKey, systemPrompt, userPrompt) {
  const model = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const json = await res.json();
  return json.content[0].text;
}

main().catch(err => {
  console.error('remix-digest error:', err.message);
  process.exit(1);
});
