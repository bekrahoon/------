const LEVELUP_PHRASES = [
  'Ты слышишь шёпот за спиной...',
  'Тени стали длиннее.',
  'Кто-то считает твои шаги.',
  'Дверь, которую ты запер, теперь открыта.',
  'Зеркало моргнуло первым.',
  'Свет начинает мигать.',
  'Оно знает, что ты здесь.',
  'Шаги приближаются.',
  'Ты не один в этой комнате.',
  'Холод пробирает до костей.',
  'Что-то шевелится в темноте.',
  'Голоса становятся громче.',
  'Стены будто дышат.',
  'Ты чувствуешь на себе чей-то взгляд.',
  'Часы остановились.'
];

function getLevelUpPhrase(level) {
  return LEVELUP_PHRASES[(level - 2 + LEVELUP_PHRASES.length) % LEVELUP_PHRASES.length];
}

const REMINDER_PHRASES = [
  'Оно скучает по тебе...',
  'Тьма становится гуще без тебя.',
  'Глаз так и не закрылся — он ждёт.',
  'Тени зовут тебя обратно.',
  'Кошмар не закончился. Он просто ждёт.',
  'Что-то осталось недосказанным...',
  'Возвращайся, пока ещё не поздно.'
];

function getReminderPhrase() {
  return REMINDER_PHRASES[Math.floor(Math.random() * REMINDER_PHRASES.length)];
}

async function sendReminders(env) {
  const list = await env.USERS.list();
  for (const key of list.keys) {
    const chatId = key.name;
    await sendMessage(env, chatId, `👁️ ${getReminderPhrase()}\n\nВозвращайся в Nightmare Clicker!`);
  }
  return list.keys.length;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/notify' && request.method === 'POST') {
      return handleNotify(request, env);
    }

    // Ручной запуск напоминаний для проверки (защищён токеном бота)
    if (url.pathname === '/test-reminder' && request.method === 'GET') {
      if (url.searchParams.get('token') !== env.BOT_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      const count = await sendReminders(env);
      return new Response(`Sent reminders to ${count} user(s)`);
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    await sendReminders(env);
  }
};

async function handleWebhook(request, env) {
  const update = await request.json();
  const message = update.message;

  if (message && message.text === '/start') {
    const chatId = message.chat.id;
    await env.USERS.put(String(chatId), '1');
    await sendMessage(env, chatId, 'Привет! Теперь я сообщу тебе, когда ты поднимешься на новый уровень кошмара в Nightmare Clicker 👁️');
  }

  return new Response('ok');
}

async function handleNotify(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response('Bad request', { status: 400, headers: CORS_HEADERS });
  }

  const { initData, level } = body;
  if (!initData || !level) {
    return new Response('Bad request', { status: 400, headers: CORS_HEADERS });
  }

  const user = await verifyInitData(initData, env.BOT_TOKEN);
  if (!user) {
    return new Response('Invalid initData', { status: 403, headers: CORS_HEADERS });
  }

  const chatId = user.id;
  const registered = await env.USERS.get(String(chatId));
  if (!registered) {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  await sendMessage(env, chatId, `УРОВЕНЬ ${level}!\n${getLevelUpPhrase(level)}`);

  return new Response('ok', { headers: CORS_HEADERS });
}

async function sendMessage(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// Проверка подписи initData по алгоритму Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join('\n');

  const encoder = new TextEncoder();

  const secretKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretKeyBytes = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));

  const signingKey = await crypto.subtle.importKey(
    'raw',
    secretKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(dataCheckString));
  const signatureHex = [...new Uint8Array(signatureBytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (signatureHex !== hash) return null;

  const userJson = params.get('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
}
