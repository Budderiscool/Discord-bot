const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID; // Your bot's application/client ID

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
const SPAM_INTERVAL_MS = 10 * 1000;
const SPAM_MESSAGE_COUNT = 5;
const BASE_MUTE_MINUTES = 5;
const MUTE_MULTIPLIER = 2;

const userSpamMap = new Map();
const userMuteStrikes = new Map();

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

// SLASH COMMANDS
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Replies with bot latency'),
  new SlashCommandBuilder().setName('server').setDescription('Replies with server info'),
  new SlashCommandBuilder().setName('user').setDescription('Replies with your user info'),
  new SlashCommandBuilder()
    .setName('modlink')
    .setDescription('Get a mod link (Modrinth or CurseForge)')
    .addStringOption(option => option
      .setName('site')
      .setDescription('Site to get the mod link from')
      .setRequired(false)
      .addChoices(
        { name: 'modrinth', value: 'modrinth' },
        { name: 'curseforge', value: 'curseforge' }
      )
    )
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  // Register slash commands globally
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (err) {
    console.error('Error registering slash commands:', err);
  }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') {
    await interaction.reply(`🏓 Pong! Latency is ${client.ws.ping}ms.`);
  } else if (interaction.commandName === 'server') {
    await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
  } else if (interaction.commandName === 'user') {
    await interaction.reply(`Your tag: ${interaction.user.tag}\nYour ID: ${interaction.user.id}`);
  } else if (interaction.commandName === 'modlink') {
    const site = interaction.options.getString('site') || 'modrinth';
    if (site === 'curseforge') {
      await interaction.reply('Here is the CurseForge mod link: curseforge');
    } else {
      await interaction.reply('Here is the Modrinth mod link: https://modrinth.com/project/qWl7Ylv2');
    }
  }
});

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
  timestamps = timestamps.filter(ts => now - ts < SPAM_INTERVAL_MS);
  timestamps.push(now);
  userSpamMap.set(userId, timestamps);

  if (timestamps.length > SPAM_MESSAGE_COUNT) {
    const member = await message.guild.members.fetch(userId);
    let strikes = (userMuteStrikes.get(userId) || 0) + 1;
    userMuteStrikes.set(userId, strikes);

    const duration = await muteUser(member, strikes);
    if (duration !== null) {
      await sendDM(message.author, "Spamming messages", duration);
      await message.channel.send(`<@${userId}> was muted for spamming (${duration} minutes, strike ${strikes}).`);
    }
    userSpamMap.set(userId, []);
  }
});

client.login(DISCORD_TOKEN);
