const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Railway provides secrets as environment variables!
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function isMessageBad(messageContent) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const prompt = `Is this Discord message inappropriate, toxic, offensive, or spam? Reply "yes" for delete, "no" for keep:\n\n"${messageContent}"`;

  try {
    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim().toLowerCase();
    return answer.startsWith("yes");
  } catch (err) {
    console.error("Gemini API error:", err);
    return false; // If API fails, don't delete
  }
}

client.on('messageCreate', async (message) => {
  // Ignore bots and system messages
  if (message.author.bot) return;

  try {
    const shouldDelete = await isMessageBad(message.content);
    if (shouldDelete) {
      await message.delete();
      await message.channel.send({
        content: `Message from <@${message.author.id}> was deleted for violating server guidelines.`
        // Remove 'ephemeral' property, as it's not supported for normal messages
      });
    }
  } catch (err) {
    console.error("Error moderating message:", err);
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.login(DISCORD_TOKEN);
