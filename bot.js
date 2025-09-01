const axios = require("axios");
const cheerio = require("cheerio");
const TelegramBot = require("node-telegram-bot-api");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");
const { Client } = require("pg");
require("dotenv").config();

// ===== Telegram Bot setup =====
const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

// PostgreSQL client
// const db = new Client({
//   connectionString: process.env.DATABASE_URL,
// });
// db.connect();

// ===== In-memory storage for demo =====
const userPhones = {};

// ===== Axios client with cookie jar =====
const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

const opts = {
  reply_markup: {
    keyboard: [
      [
        {
          text: "သင့်ဖုန်းနံပါတ်ကိုပို့ရန် ဒီကိုနှိပ်ပါ",
          request_contact: true,
        },
      ],
    ],
    one_time_keyboard: true,
    resize_keyboard: true,
  },
};

bot.on("polling_error", (err) =>
  console.log("Polling error:", err.code, err.message)
);

// ===== /start command =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.chat.first_name + (msg.chat.last_name ?? "");

  bot.sendMessage(chatId, `မင်္ဂလာပါ ${name}`);
  setTimeout(() => {
    bot.sendMessage(
      chatId,
      "OTP တောင်းမယ်ဆို သင့်ဖုန်းနံပါတ်ကို အရင်ပို့ပေးပါဦးနော်",
      opts
    );
  }, 800);
});

// ===== Handle contact button =====
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const phone = msg.contact.phone_number;
  userPhones[chatId] = phone;

  // const isSaved = await saveUser(chatId, phone);
  // if (!isSaved) return;

  bot.sendMessage(chatId, `ဖုန်းနံပါတ် share ပေးတဲ့အတွက်ကျေးဇူးတင်ပါတယ်😉`);

  setTimeout(() => {
    bot.sendMessage(
      chatId,
      "OTP တောင်းမယ်ဆို 09 နဲ့စတဲ့ ဖုန်းနံပါတ်လေးပို့ပေးပါနော်"
    );
  }, 800);
});

// ===== Handle typed phone numbers =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const chat = msg.chat;

  // Ignore commands and contact messages
  if (!text || text.startsWith("/") || msg.contact) return;

  const phoneRegex = /^09\d{7,15}$/;

  // const user = await getUser(chatId);

  // if (!user) {
  //   bot.sendMessage(
  //     chatId,
  //     "OTP တောင်းမယ်ဆို သင့်ဖုန်းနံပါတ်ကို အရင်ပို့ပေးပါဦးနော်",
  //     opts
  //   );
  //   return;
  // }

  // chat["phone"] = user["phone"];

  if (phoneRegex.test(text)) {
    bot.sendMessage(chatId, `ရှာပေးနေပါတယ် ခဏစောင့်ပေးပါနော်`);
    userPhones[chatId] = text;
    searchOtp(chat, text);
  } else {
    bot.sendMessage(
      chatId,
      "ဖုန်းနံပါတ်ကိုမှန်မမှန် ပြန်စစ်ကြည့်ပေးပါဦးနော် 😠 09 နဲ့စတဲ့နံပါတ်နော်။ ဖုန်းနံပါတ်ကလွဲလို့လဲ တခြားဘာမှ ရိုက်မထည့်ပါနဲ့နော် 🙏"
    );
  }
});

// Save user to DB (insert or update)
async function saveUser(chatId, phone) {
  phone = phone.replace(/^\+/, "");

  const hasPhone = await db.query(
    `SELECT * FROM allow_phone_numbers WHERE phone = $1`,
    [phone]
  );

  if (hasPhone.rowCount == 0) {
    bot.sendMessage(
      chatId,
      "စိတ်မကောင်းပါဘူး😭 သင့်ရဲ့ ဖုန်းနံပါတ်မှာ OTP တောင်းခွင့်မရှိပါဘူး"
    );
    return false;
  }

  try {
    await db.query(
      `INSERT INTO chat_phone (chat_id, phone)
       VALUES ($1, $2)
       ON CONFLICT (chat_id)
       DO UPDATE SET phone = EXCLUDED.phone`,
      [chatId, phone]
    );

    return true;
  } catch (err) {
    console.error("DB error:", err);
    bot.sendMessage(
      chatId,
      "OTP ထုတ်ယူရာတွင် Error ဖြစ်နေပါတယ် @BeBee2x ကိုလာပြောပေးပါနော်"
    );
    return false;
  }
}

async function saveRecord(chat, requested_phone) {
  const chatId = chat["id"];

  const name = chat["first_name"]
    ? chat["first_name"] + (chat["last_name"] ?? "")
    : "";
  const now = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());

  try {
    await db.query(
      `INSERT INTO otp_requests_records (name,username,phone,requested_phone,requested_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, chat.username ?? "", chat.phone, requested_phone, now]
    );
    return true;
  } catch (err) {
    console.error("DB error:", err);
    bot.sendMessage(
      chatId,
      "OTP ထုတ်ယူရာတွင် Error ဖြစ်နေပါတယ် @BeBee2x ကိုလာပြောပေးပါနော်"
    );
    return false;
  }
}

async function getUser(chatId) {
  try {
    const result = await db.query(
      `SELECT * FROM chat_phone WHERE chat_id = $1`,
      [chatId]
    );
    return result.rows[0];
  } catch (err) {
    console.error("DB error:", err);
    bot.sendMessage(
      chatId,
      "OTP ထုတ်ယူရာတွင် Error ဖြစ်နေပါတယ် @BeBee2x ကိုလာပြောပေးပါနော်"
    );
  }
}

// ===== Scrape SMS logs =====
async function searchOtp(chat, requested_phone) {
  const chatId = chat["id"];

  try {
    // Step 2: Get SMS logs
    const requested_phone_fixed = "+959" + requested_phone.slice(2);

    const { data } = await axios.get("https://smspoh.com/portal/sms-log", {
      headers: {
        Cookie: process.env.COOKIE,
      },
    });

    const $ = cheerio.load(data);

    let otp_message = "";
    let found = false;

    $("table tbody tr").each((_, element) => {
      const phone = $(element).find(".strong").eq(0).text().trim();
      const message = $(element).find(".text-message").eq(0).text().trim();

      if (phone === requested_phone_fixed && !found) {
        otp_message = message;
        found = true;
      }
    });

    if (!otp_message) {
      bot.sendMessage(
        chatId,
        `${requested_phone} အတွက် OTP ရှာလို့မတွေ့ဘူးနော်`
      );
    } else {
      // const isSaved = await saveRecord(chat, requested_phone);
      // if (!isSaved) return;
      bot.sendMessage(
        chatId,
        `OTP message လေးရပါပြီနော် 😎 :\n\n${otp_message}`
      );
    }
  } catch (err) {
    console.error("Error fetching OTP:", err.message);
    bot.sendMessage(
      chatId,
      "OTP ထုတ်ယူရာတွင် Error ဖြစ်နေပါတယ် 😩 @BeBee2x ကိုလာပြောပေးပါနော်"
    );
  }
}

async function refreshSession() {
  try {
    const res = await axios.get("https://smspoh.com/portal/sms-log", {
      headers: { Cookie: process.env.COOKIE },
    });

    const now = new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date());

    console.log("Page refreshed at", now);
  } catch (err) {
    console.error("Failed to refresh:", err.message);
  }
}

setInterval(refreshSession, 30 * 60 * 1000);

// Optionally call immediately
refreshSession();
