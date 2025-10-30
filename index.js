const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = '1417014862273445900';
const UPDATE_CHANNEL_ID = '1431127498904703078';
const MODRINTH_PROJECT_ID = 'qWl7Ylv2';

const DATA_FILE = path.join(__dirname, 'posted_versions.json');
const SETTINGS_FILE = path.join(__dirname, 'modrinth_settings.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// ---------------- Posted Versions ----------------
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

// ---------------- Settings ----------------
let modSettings = { color: 0x00ff00 };
function loadSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      modSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }
}

function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(modSettings), 'utf-8');
}

// ---------------- Commands ----------------
const commands = [
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Edit the Modrinth embed settings (color, etc.)'),
  new SlashCommandBuilder()
    .setName('modlink')
    .setDescription('Get a Modrinth mod link'),
  new SlashCommandBuilder()
    .setName('modrinthtest')
    .setDescription('Send newest Modrinth versions (bypass JSON)')
].map(cmd => cmd.toJSON());

// ---------------- Modrinth Fetch ----------------
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
    .setColor(modSettings.color)
    .setTitle(`${project.title || 'Modrinth Project'} — ${version.name || version.version_number}`)
    .setURL(`https://modrinth.com/project/${MODRINTH_PROJECT_ID}/version/${version.id}`)
    .setDescription(version.changelog || 'No changelog provided')
    .addFields(
      { name: "Version", value: version.name || version.version_number || 'Unknown', inline: true },
      { name: "Author", value: project.author?.username || 'Unknown', inline: true },
      { name: "Type", value: version.version_type || 'Unknown', inline: true },
      { name: "Downloads", value: version.files?.map(f => `[${f.filename}](${f.url})`).join('\n') || 'No files' }
    )
    .setTimestamp(new Date(version.date_published))
    .setFooter({ text: "Modrinth Updates" });

  if (project.icon_url) embed.setThumbnail(project.icon_url);
  if (project.gallery?.[0]) embed.setImage(project.gallery[0]);

  await channel.send({ embeds: [embed] });
  if (!ignorePosted) {
    postedVersions.add(version.id);
    savePostedVersions();
  }
}

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
  loadSettings();

  try {
    // Sync commands to the guild (deletes old commands automatically)
    await client.application.commands.set(commands, GUILD_ID);
    console.log('Commands synced! /settings is now available.');
  } catch (err) {
    console.error('Failed to sync commands:', err);
  }

  // Check for updates immediately
  checkForUpdates();
});

// ---------------- Interaction Handler ----------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ---------------- Settings Command ----------------
  if (interaction.commandName === 'settings') {
    const modalColor = await interaction.reply({
      content: 'Current embed color (hex) is: ' + modSettings.color.toString(16) + '\nReply with a new hex color (e.g., 0x00ff00) to update:',
      fetchReply: true,
      ephemeral: true
    });

    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 30000 });

    collector.on('collect', m => {
      const color = parseInt(m.content.replace(/^0x/, ''), 16);
      if (!isNaN(color)) {
        modSettings.color = color;
        saveSettings();
        interaction.followUp({ content: `Embed color updated to: 0x${color.toString(16)}`, ephemeral: true });
      } else {
        interaction.followUp({ content: 'Invalid color input.', ephemeral: true });
      }
      m.delete().catch(() => {});
    });

    return;
  }

  // ---------------- Modlink Command ----------------
  if (interaction.commandName === 'modlink') {
    await interaction.reply(`Here is the Modrinth mod link: https://modrinth.com/project/${MODRINTH_PROJECT_ID}`);
  }

  // ---------------- Modrinth Test Command ----------------
  if (interaction.commandName === 'modrinthtest') {
    await interaction.reply('Sending newest Modrinth versions (bypassing saved state)...');
    await checkForUpdates(interaction.channel, true, 5);
    await interaction.followUp('Done!');
  }
});

client.login(DISCORD_TOKEN);
