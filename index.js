const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = '1417014862273445900';
const UPDATE_CHANNEL_ID = '1431127498904703078';
const MODRINTH_PROJECT_ID = 'qWl7Ylv2';

const DATA_FILE = path.join(__dirname, 'posted_versions.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// ---------------- Posted versions ----------------
let postedVersions = new Set();
function loadPostedVersions() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      postedVersions = new Set(JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')));
    } catch (err) {
      console.error("Failed to load posted versions:", err);
    }
  }
}

function savePostedVersions() {
  fs.writeFileSync(DATA_FILE, JSON.stringify([...postedVersions]), 'utf-8');
}

// ---------------- Commands ----------------
const commands = [
  new SlashCommandBuilder().setName('modlink').setDescription('Get a Modrinth mod link'),
  new SlashCommandBuilder().setName('modrinthtest').setDescription('Send newest Modrinth versions (bypass JSON)')
].map(cmd => cmd.toJSON());

// ---------------- Modrinth ----------------
async function fetchVersions() {
  const res = await fetch(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}/version`);
  if (!res.ok) return [];
  return res.json();
}

async function fetchProject() {
  const res = await fetch(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}`);
  if (!res.ok) return {};
  return res.json();
}

async function sendModrinthEmbed(channel, version, project, ignorePosted = false) {
  if (!ignorePosted && postedVersions.has(version.id)) return;

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle(`${project.title || 'Modrinth Project'} — ${version.name || version.version_number}`)
    .setURL(`https://modrinth.com/project/${MODRINTH_PROJECT_ID}/version/${version.id}`)
    .setDescription(version.changelog || 'No changelog provided')
    .setFields(
      { name: "Version", value: version.name || version.version_number || 'Unknown', inline: true },
      { name: "Author", value: project.author?.username || 'Unknown', inline: true },
      { name: "Type", value: version.version_type || 'Unknown', inline: true },
      { name: "Downloads", value: version.files?.map(f => `[${f.filename}](${f.url})`).join('\n') || 'No files' }
    )
    .setTimestamp(new Date(version.date_published).toISOString())
    .setFooter({ text: "Modrinth Updates" });

  if (project.icon_url) embed.setThumbnail(project.icon_url);
  if (project.gallery?.[0]) embed.setImage(project.gallery[0]);

  await channel.send({ embeds: [embed] });
  if (!ignorePosted) {
    postedVersions.add(version.id);
    savePostedVersions();
  }
}

// ---------------- Check for updates ----------------
async function checkForUpdates(channel = null, ignorePosted = false, limit = null) {
  const versions = await fetchVersions();
  if (!versions?.length) return;

  versions.sort((a, b) => new Date(b.date_published) - new Date(a.date_published));
  const project = await fetchProject();

  if (!channel) channel = await client.channels.fetch(UPDATE_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const toSend = limit ? versions.slice(0, limit) : versions;
  for (const version of toSend) await sendModrinthEmbed(channel, version, project, ignorePosted);
}

// ---------------- Ready ----------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  loadPostedVersions();

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    // Delete old guild commands
    const existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
    if (existing?.length) {
      for (const cmd of existing) await rest.delete(Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, cmd.id));
      console.log(`Deleted ${existing.length} old guild commands.`);
    }

    // Register new guild commands
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Guild slash commands registered!');
  } catch (err) {
    console.error('Error registering commands:', err);
  }

  // Check for updates immediately
  checkForUpdates();
});

// ---------------- Interaction handler ----------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'modlink') {
    await interaction.reply(`Here is the Modrinth mod link: https://modrinth.com/project/${MODRINTH_PROJECT_ID}`);
  }

  if (interaction.commandName === 'modrinthtest') {
    await interaction.reply('Sending newest Modrinth versions (bypassing saved state)...');
    await checkForUpdates(interaction.channel, true, 5);
    await interaction.followUp('Done!');
  }
});

client.login(DISCORD_TOKEN);
