const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Spam detection config
const SPAM_INTERVAL_MS = 10 * 1000; // 10 seconds
const SPAM_MESSAGE_COUNT = 5;       // More than 5 messages in interval = spam
const BASE_MUTE_MINUTES = 5;        // Initial mute duration
const MUTE_MULTIPLIER = 2;          // Each repeat multiplies mute time

// In-memory spam tracking
const userSpamMap = new Map(); // userId -> [timestamps]
const userMuteStrikes = new Map(); // userId -> strikes

async function isMessageBad(messageContent) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const prompt = `Is this Discord message inappropriate, toxic, offensive, or spam? Reply "yes" for delete, "no" for keep:\n\n"${messageContent}"`;
  try {
    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim().toLowerCase();
    return answer.startsWith("yes");
  } catch (err) {
    console.error("Gemini API error:", err);
    return false;
  }
}

async function muteUser(member, strikes) {
  // Calculate mute duration
  let minutes = BASE_MUTE_MINUTES * Math.pow(MUTE_MULTIPLIER, strikes - 1);
  let ms = minutes * 60 * 1000;

  try {
    await member.timeout(ms, `Muted for spam (strike ${strikes})`);
    return minutes;
  } catch (err) {
    console.error(`Failed to mute user ${member.id}:`, err);
    return null;
  }
}

async function sendDM(user, reason, duration) {
  try {
    await user.send(`You have been muted on ${user.guild?.name || "the server"} for ${duration} minutes. Reason: ${reason}\n\nPlease avoid spamming or posting inappropriate messages. Repeat violations will result in longer mutes.`);
  } catch (err) {
    console.error(`Could not DM user ${user.id}:`, err);
  }
}

client.on('messageCreate', async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // AI Moderation
  try {
    const shouldDelete = await isMessageBad(message.content);
    if (shouldDelete) {
      await message.delete();
      await message.channel.send({
        content: `Message from <@${message.author.id}> was deleted for violating server guidelines.`
      });
    }
  } catch (err) {
    console.error("Error moderating message:", err);
  }

  // Spam detection (guild messages only)
  if (!message.guild) return;

  const now = Date.now();
  const userId = message.author.id;
  let timestamps = userSpamMap.get(userId) || [];
  // Remove old timestamps
  timestamps = timestamps.filter(ts => now - ts < SPAM_INTERVAL_MS);
  timestamps.push(now);
  userSpamMap.set(userId, timestamps);

  if (timestamps.length > SPAM_MESSAGE_COUNT) {
    // Mute logic
    const member = await message.guild.members.fetch(userId);
    let strikes = (userMuteStrikes.get(userId) || 0) + 1;
    userMuteStrikes.set(userId, strikes);

    // Mute and DM
    const duration = await muteUser(member, strikes);
    if (duration !== null) {
      await sendDM(message.author, "Spamming messages", duration);
      await message.channel.send(`<@${userId}> was muted for spamming (${duration} minutes, strike ${strikes}).`);
    }
    // Clear spam timestamps to avoid repeated mutes instantly
    userSpamMap.set(userId, []);
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.login(DISCORD_TOKEN);
