const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

// Modrinth settings
const MODRINTH_PROJECT_ID = 'qWl7Ylv2';
const UPDATE_CHANNEL_ID = '1431127498904703078';
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const DATA_FILE = path.join(__dirname, 'posted_versions.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ---------------- Spam / moderation ----------------
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

// ---------------- Slash commands ----------------
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
    ),
  new SlashCommandBuilder()
    .setName('modrinthtest')
    .setDescription('Test command to send all current Modrinth updates')
].map(cmd => cmd.toJSON());

// ---------------- Modrinth updater ----------------
let postedVersions = new Set();

function loadPostedVersions() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      postedVersions = new Set(data);
    } catch (err) {
      console.error("Failed to load posted versions:", err);
    }
  }
}

function savePostedVersions() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify([...postedVersions]), 'utf-8');
  } catch (err) {
    console.error("Failed to save posted versions:", err);
  }
}

async function fetchModrinthVersions() {
  try {
    const res = await fetch(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}/version`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch Modrinth versions:", err);
    return [];
  }
}

async function checkForModUpdates(channel = null) {
  const versions = await fetchModrinthVersions();
  if (!versions || !versions.length) return;

  // Fetch project info for creator & image
  const projectRes = await fetch(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}`);
  const projectData = await projectRes.json().catch(() => ({}));

  const projectName = projectData.title || "Modrinth Project";
  const projectAuthor = (projectData.author && projectData.author.username) || "Unknown Creator";
  const projectIcon = (projectData.icon_url) || null;

  if (!channel) {
    channel = await client.channels.fetch(UPDATE_CHANNEL_ID).catch(() => null);
    if (!channel) return;
  }

  for (const version of versions) {
    if (postedVersions.has(version.id)) continue;

    const versionName = version.name || version.version_number;
    const versionType = version.version_type;
    const changelog = version.changelog || "No changelog provided";
    const url = `https://modrinth.com/project/${MODRINTH_PROJECT_ID}/version/${version.id}`;
    
    const embed = {
      color: 0x00ff00, // Green
      title: `${projectName} - New ${versionType} Version!`,
      url: url,
      description: changelog.length > 1024 ? changelog.substring(0, 1021) + "..." : changelog,
      thumbnail: projectIcon ? { url: projectIcon } : undefined,
      fields: [
        { name: "Version", value: versionName, inline: true },
        { name: "Author", value: projectAuthor, inline: true },
        { name: "Version Type", value: versionType, inline: true },
        { name: "Downloads", value: version.files.map(f => `[${f.filename}](${f.url})`).join("\n") || "No files" }
      ],
      timestamp: new Date(version.date_published).toISOString(),
      footer: { text: "Modrinth Updates" }
    };

    await channel.send({ embeds: [embed] });
    postedVersions.add(version.id);
    savePostedVersions();
  }
}

// ---------------- Bot events ----------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Load posted versions
  loadPostedVersions();

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  // Clear all existing global commands
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log('Cleared all existing global commands.');
  } catch (err) {
    console.error('Failed to clear commands:', err);
  }

  // Register new slash commands
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Slash commands registered!');
  } catch (err) {
    console.error('Error registering slash commands:', err);
  }

  // Start Modrinth polling
  checkForModUpdates();
  setInterval(checkForModUpdates, POLL_INTERVAL_MS);
});

// ---------------- Slash command handling ----------------
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
  } else if (interaction.commandName === 'modrinthtest') {
    await interaction.reply('Fetching all current Modrinth versions...');
    await checkForModUpdates(interaction.channel);
  }
});

// ---------------- Message moderation & spam ----------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

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
