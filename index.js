const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const UPDATE_CHANNEL_ID = '1431127498904703078';
const MODRINTH_PROJECT_ID = 'qWl7Ylv2';
const SETTINGS_FILE = path.join(__dirname, 'modrinth_settings.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// ---------------- Settings ----------------
let settings = {
  modrinth: {
    color: 0x00ff00,
    showThumbnail: true,
    showBanner: true,
    maxChangelogLength: 1024
  },
  general: {
    botSeesMessages: true
  }
};

function loadSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); }
    catch(err){ console.error("Failed to load settings:", err); }
  }
}

function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// ---------------- Commands ----------------
const commands = [
  new SlashCommandBuilder().setName('settings').setDescription('Open interactive settings dashboard')
].map(cmd => cmd.toJSON());

// ---------------- Modrinth Fetch Helpers ----------------
async function fetchProject() {
  try {
    const res = await fetch(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch(err) {
    console.error("Failed to fetch project:", err);
    return {};
  }
}

async function fetchLatestVersion() {
  try {
    const res = await fetch(`https://api.modrinth.com/v2/project/${MODRINTH_PROJECT_ID}/version`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    data.sort((a,b)=>new Date(b.date_published)-new Date(a.date_published));
    return data[0];
  } catch(err) {
    console.error("Failed to fetch version:", err);
    return null;
  }
}

// ---------------- Embed Builder ----------------
async function buildModrinthPreviewEmbed() {
  const project = await fetchProject();
  const version = await fetchLatestVersion();
  if (!project || !version) return new EmbedBuilder().setTitle('Modrinth Preview Error');

  const embed = new EmbedBuilder()
    .setColor(settings.modrinth.color)
    .setTitle(`${project.title || "Modrinth Project"} — ${version.name || version.version_number}`)
    .setURL(`https://modrinth.com/project/${MODRINTH_PROJECT_ID}/version/${version.id}`)
    .setDescription(version.changelog?.length > settings.modrinth.maxChangelogLength
      ? version.changelog.substring(0, settings.modrinth.maxChangelogLength-3) + '...'
      : version.changelog || 'No changelog provided')
    .setTimestamp(new Date(version.date_published))
    .setFooter({ text: "Modrinth Live Preview" });

  if (settings.modrinth.showThumbnail && project.icon_url) embed.setThumbnail(project.icon_url);
  if (settings.modrinth.showBanner && project.gallery?.[0]) embed.setImage(project.gallery[0]);

  embed.addFields(
    { name: "Author", value: project.author?.username || "Unknown", inline: true },
    { name: "Type", value: version.version_type || "Unknown", inline: true },
    { name: "Downloads", value: version.files?.map(f=>`[${f.filename}](${f.url})`).join('\n') || "No files" }
  );

  return embed;
}

// ---------------- Buttons/Components ----------------
function getDashboardComponents(activeTab='modrinth') {
  const tabRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tab_modrinth').setLabel('Modrinth').setStyle(activeTab==='modrinth'?ButtonStyle.Primary:ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tab_general').setLabel('General').setStyle(activeTab==='general'?ButtonStyle.Primary:ButtonStyle.Secondary)
  );

  const modrinthRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('toggle_banner').setLabel(`Banner: ${settings.modrinth.showBanner?'ON':'OFF'}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('toggle_thumbnail').setLabel(`Thumbnail: ${settings.modrinth.showThumbnail?'ON':'OFF'}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('change_color').setLabel('Change Color').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('change_changelog').setLabel('Max Changelog Length').setStyle(ButtonStyle.Primary)
  );

  const generalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('toggle_botSee').setLabel(`Bot Sees Messages: ${settings.general.botSeesMessages?'ON':'OFF'}`).setStyle(ButtonStyle.Success)
  );

  return activeTab==='modrinth' ? [tabRow, modrinthRow] : [tabRow, generalRow];
}

// ---------------- Ready ----------------
client.once('ready', async ()=>{
  console.log(`Logged in as ${client.user.tag}`);

  loadSettings();

  const rest = new REST({ version:'10' }).setToken(DISCORD_TOKEN);

  try {
    // Remove old commands
    const existing = await rest.get(Routes.applicationCommands(CLIENT_ID));
    if(existing?.length) for(const cmd of existing) await rest.delete(Routes.applicationCommand(CLIENT_ID, cmd.id));
    // Register new command
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Slash commands registered!');
  } catch(err){ console.error(err); }
});

// ---------------- Interaction Handler ----------------
client.on('interactionCreate', async interaction=>{
  if(interaction.isChatInputCommand() && interaction.commandName==='settings'){
    const embed = await buildModrinthPreviewEmbed();
    await interaction.reply({ embeds:[embed], components:getDashboardComponents('modrinth'), fetchReply:true });
  }

  if(interaction.isButton()){
    const message = interaction.message;
    const user = interaction.user;

    if(!message || !user) return;
    if(interaction.customId.startsWith('tab_')){
      const tab = interaction.customId.replace('tab_','');
      await interaction.update({ components:getDashboardComponents(tab) });
      return;
    }

    // ---- Modrinth Buttons ----
    if(interaction.customId==='toggle_banner'){
      settings.modrinth.showBanner = !settings.modrinth.showBanner;
      saveSettings();
      const embed = await buildModrinthPreviewEmbed();
      await interaction.update({ embeds:[embed], components:getDashboardComponents('modrinth') });
    }
    if(interaction.customId==='toggle_thumbnail'){
      settings.modrinth.showThumbnail = !settings.modrinth.showThumbnail;
      saveSettings();
      const embed = await buildModrinthPreviewEmbed();
      await interaction.update({ embeds:[embed], components:getDashboardComponents('modrinth') });
    }
    if(interaction.customId==='change_color'){
      const modal = new ModalBuilder()
        .setCustomId('modal_color')
        .setTitle('Enter Hex Color (e.g., 00ff00)')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('color_input').setLabel('Hex Color').setStyle(TextInputStyle.Short).setPlaceholder('00ff00').setRequired(true)
        ));
      await interaction.showModal(modal);
    }
    if(interaction.customId==='change_changelog'){
      const modal = new ModalBuilder()
        .setCustomId('modal_changelog')
        .setTitle('Max Changelog Length')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('changelog_input').setLabel('Length (number)').setStyle(TextInputStyle.Short).setPlaceholder('1024').setRequired(true)
        ));
      await interaction.showModal(modal);
    }

    // ---- General Buttons ----
    if(interaction.customId==='toggle_botSee'){
      settings.general.botSeesMessages = !settings.general.botSeesMessages;
      saveSettings();
      await interaction.update({ components:getDashboardComponents('general') });
    }
  }

  // ---- Modal Submit ----
  if(interaction.isModalSubmit()){
    if(interaction.customId==='modal_color'){
      const hex = interaction.fields.getTextInputValue('color_input');
      const parsed = parseInt(hex,16);
      if(!isNaN(parsed)) settings.modrinth.color = parsed;
      saveSettings();
      const embed = await buildModrinthPreviewEmbed();
      await interaction.update({ embeds:[embed], components:getDashboardComponents('modrinth') });
    }
    if(interaction.customId==='modal_changelog'){
      const val = parseInt(interaction.fields.getTextInputValue('changelog_input'));
      if(!isNaN(val)) settings.modrinth.maxChangelogLength = val;
      saveSettings();
      const embed = await buildModrinthPreviewEmbed();
      await interaction.update({ embeds:[embed], components:getDashboardComponents('modrinth') });
    }
  }
});

client.login(DISCORD_TOKEN);
